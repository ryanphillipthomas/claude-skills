import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { readPages, readRunManifest } from '@ui-atlas/artifacts';
import { Crawler, type CrawlResult } from '@ui-atlas/crawler';
import type { PageRecord } from '@ui-atlas/protocol';
import { run } from '../../apps/cli/src/index.js';
import { createLogger } from '../../apps/cli/src/logger.js';
import { makeOutputDir, removeDir, startFixtureServer, testConfig } from '../support/harness.js';
import { startCrawlHarness, type CrawlHarness } from '../support/crawl-harness.js';

function findRunDir(root: string, project = 'fixture'): string {
  const projectDir = join(root, project);
  const runs = readdirSync(projectDir).filter((name) => statSync(join(projectDir, name)).isDirectory());
  const runId = runs.sort().at(-1);
  if (runId === undefined) throw new Error(`no run directory under ${projectDir}`);
  return join(projectDir, runId);
}

function crawlerFor(
  harness: CrawlHarness,
  seeds: string[],
  crawlOverrides: Record<string, unknown> = {},
  extra: { onPage?: (page: Page, record: PageRecord) => Promise<void> } = {},
): Crawler {
  return new Crawler({
    page: harness.page,
    writer: harness.writer,
    runId: harness.runId,
    // No politeness delay: this is a local fixture, and the default would add
    // three quarters of a second to every page of every test.
    config: testConfig({ crawl: { seeds, perPageDelayMs: 0, ...crawlOverrides } }),
    ...(extra.onPage === undefined ? {} : { onPage: extra.onPage }),
  });
}

/** Path + query of every visited URL, which is what assertions care about. */
function paths(result: CrawlResult): string[] {
  return result.visited.map((url) => new URL(url).pathname + new URL(url).search).sort();
}

describe('bounded crawler', () => {
  const open: CrawlHarness[] = [];

  afterEach(async () => {
    while (open.length > 0) await open.pop()?.dispose();
  });

  async function harness(options: Parameters<typeof startCrawlHarness>[0] = {}): Promise<CrawlHarness> {
    const created = await startCrawlHarness(options);
    open.push(created);
    return created;
  }

  it('walks the same-origin link graph and writes one page record per URL', async () => {
    const test = await harness();
    const result = await crawlerFor(test, [test.url('/')]).run();

    expect(result.stopped).toBe('frontier-empty');
    // `/` plus the eleven pages the index links to, plus `/index.html`, which
    // states.html links to and which is a different URL from `/`.
    expect(paths(result)).toEqual([
      '/',
      '/destructive.html',
      '/frames.html',
      '/hostile.html',
      '/identity.html',
      '/index.html',
      '/media.html',
      '/motion.html',
      '/responsive.html',
      '/settle.html',
      '/shadow.html',
      '/spa.html',
      '/states.html',
    ]);

    const { records } = await readPages(test.writer.paths.pagesJsonl);
    expect(records).toHaveLength(result.visited.length);
    expect(records.every((record) => record.httpStatus === 200)).toBe(true);
    expect(records.every((record) => record.routeKey.length > 0)).toBe(true);
    expect(records.every((record) => record.error === undefined)).toBe(true);
  });

  it('never clicks a destructive control while crawling its page', async () => {
    const test = await harness();
    let destructiveLog: string[] | undefined;

    const result = await crawlerFor(
      test,
      [test.url('/')],
      {},
      {
        onPage: async (page, record) => {
          if (!record.finalUrl.endsWith('/destructive.html')) return;
          // Read the fixture's own audit log while its page is still current.
          destructiveLog = await page.evaluate(
            () => (window as unknown as { __uiAtlasDestructiveLog: string[] }).__uiAtlasDestructiveLog,
          );
        },
      },
    ).run();

    expect(result.visited.some((url) => url.endsWith('/destructive.html'))).toBe(true);
    expect(destructiveLog).toEqual([]);

    // Nothing was submitted anywhere, on any page of the crawl.
    expect(test.requests.filter((request) => request.method !== 'GET')).toEqual([]);
    expect(test.requests.some((request) => request.url.includes('should-never-be-called'))).toBe(false);
  });

  it('refuses to follow a sign-out link and says which rule stopped it', async () => {
    const test = await harness();
    const result = await crawlerFor(test, [test.url('/destructive.html')]).run();

    expect(result.visited).toEqual([test.url('/destructive.html')]);
    expect(result.skipCounts['denied-path']).toBe(1);
    expect(result.skipSamples).toContainEqual(
      expect.objectContaining({ reason: 'denied-path', url: test.url('/logout') }),
    );
    expect(test.requests.some((request) => request.url.endsWith('/logout'))).toBe(false);
  });

  it('turns away every href a crawler must not follow', async () => {
    const test = await harness();
    // Depth 1 keeps the crawl to the links on this page. The fixture graph is
    // connected — links.html reaches the whole site through states.html — and
    // the point here is which of *its own* hrefs are followed.
    const result = await crawlerFor(test, [test.url('/links.html')], {
      budgets: { maxDepth: 1 },
    }).run();

    // Seven "should be followed" hrefs, but only five pages: the fragment-only
    // and tracking-only variants canonicalise onto pages already queued, and
    // `/hostile.html/` onto `/hostile.html`.
    expect(paths(result)).toEqual([
      '/hostile.html',
      '/identity.html',
      '/links.html',
      '/settle.html',
      '/shadow.html',
      '/states.html',
    ]);

    expect(result.skipCounts).toMatchObject({
      'unsupported-scheme': 3, // mailto, tel, javascript
      download: 2, // .pdf, .zip
      'denied-path': 2, // /logout, /account/sign-out
      'cross-origin': 1,
      nofollow: 1,
    });

    expect(test.requests.some((request) => request.url.includes('.pdf'))).toBe(false);
    expect(test.requests.some((request) => request.url.includes('crawler-must-not-visit'))).toBe(false);
    expect(test.requests.some((request) => request.url.includes('utm_source'))).toBe(false);
  });

  it('enforces maxPages as a hard stop and leaves the rest queued', async () => {
    const test = await harness();
    const result = await crawlerFor(test, [test.url('/')], { budgets: { maxPages: 4 } }).run();

    expect(result.visited).toHaveLength(4);
    expect(result.stopped).toBe('max-pages');
    expect(result.pendingAtStop).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.includes('4-page budget'))).toBe(true);
  });

  it('enforces maxDepth, so depth 0 visits only the seed', async () => {
    const test = await harness();
    const result = await crawlerFor(test, [test.url('/')], { budgets: { maxDepth: 0 } }).run();

    expect(result.visited).toEqual([test.url('/')]);
    expect(result.skipCounts['depth-exceeded']).toBe(11);
  });

  it('does not fetch a redirect destination a second time when something links to it', async () => {
    const test = await harness();
    const result = await crawlerFor(
      test,
      [test.url(`/__redirect?to=${encodeURIComponent('/states.html')}`)],
      { budgets: { maxDepth: 1 } },
    ).run();

    // Three navigations: the redirect, then the two pages states.html links to.
    expect(result.pages).toHaveLength(3);
    expect(result.pages[0]?.finalUrl).toBe(test.url('/states.html'));
    // But four URLs are known to have been fetched — the destination included.
    expect(result.visited).toContain(test.url('/states.html'));
    expect(result.visited).toHaveLength(4);

    // index.html links back to states.html; it must not be fetched again.
    const statesRequests = test.requests.filter(
      (request) => request.url === test.url('/states.html'),
    );
    expect(statesRequests).toHaveLength(1);
    expect(result.skipCounts.duplicate).toBeGreaterThanOrEqual(1);
  });

  it('records a page that redirects off-origin but does not follow its links', async () => {
    const other = await startFixtureServer();
    try {
      const test = await harness();
      const away = `${other.origin}/index.html`;
      const result = await crawlerFor(test, [
        test.url(`/__redirect?to=${encodeURIComponent(away)}`),
      ]).run();

      expect(result.visited).toHaveLength(1);
      expect(result.pages[0]?.finalUrl).toBe(away);
      expect(result.pages[0]?.warnings.some((warning) => warning.includes('outside the crawl scope'))).toBe(true);
      // The other origin's own eleven links were never queued.
      expect(result.pendingAtStop).toBe(0);
      expect(test.requests.some((request) => request.url === `${other.origin}/states.html`)).toBe(false);
    } finally {
      await other.close();
    }
  });

  it('validates a config without launching a browser', async () => {
    const server = await startFixtureServer();
    const outputRoot = await makeOutputDir('crawl-dry');
    const configPath = join(outputRoot, 'site.yml');
    const quiet = createLogger({ level: 'error', write: () => undefined });
    try {
      await writeFile(
        configPath,
        [
          'project: fixture',
          'crawl:',
          `  seeds: ['${server.url('/')}']`,
          '  recipes:',
          '    - name: never-runs',
          "      match: '/logout'",
          '      steps:',
          '        - capture: { kind: viewport }',
          '    - name: opens-a-disclosure',
          "      match: '/states.html'",
          '      steps:',
          '        - click: { css: \'[data-testid="disclosure"] summary\' }',
          '        - capture: { kind: viewport }',
        ].join('\n'),
        'utf8',
      );

      // A plan with a problem in it exits non-zero, so CI can gate on it.
      const code = await run({
        argv: ['crawl', configPath, '--dry-run', '--output', outputRoot],
        logger: quiet,
      });
      expect(code).toBe(1);

      // Nothing was visited and no run directory was created.
      expect(existsSync(join(outputRoot, 'fixture'))).toBe(false);
    } finally {
      await removeDir(outputRoot);
      await server.close();
    }
  });

  it('runs concurrently through the CLI without duplicating a page', async () => {
    const server = await startFixtureServer();
    const outputRoot = await makeOutputDir('crawl-parallel');
    const quiet = createLogger({ level: 'error', write: () => undefined });
    try {
      const code = await run({
        argv: [
          'crawl', server.url('/'),
          '--project', 'fixture',
          '--output', outputRoot,
          '--concurrency', '3',
          '--delay-ms', '0',
          '--headless',
        ],
        logger: quiet,
      });
      expect(code).toBe(0);

      const runDir = findRunDir(outputRoot);
      const { records } = await readPages(join(runDir, 'pages.jsonl'));
      expect(records).toHaveLength(13);
      expect(new Set(records.map((record) => record.requestedUrl)).size).toBe(13);

      const manifest = await readRunManifest(join(runDir, 'run.json'));
      expect(manifest.counts?.pages).toBe(13);
    } finally {
      await removeDir(outputRoot);
      await server.close();
    }
  });

  it('runs end to end through the CLI, then resumes through it', async () => {
    const server = await startFixtureServer();
    const outputRoot = await makeOutputDir('crawl-cli');
    const quiet = createLogger({ level: 'error', write: () => undefined });
    try {
      const first = await run({
        argv: [
          'crawl', server.url('/'),
          '--project', 'fixture',
          '--output', outputRoot,
          '--max-pages', '5',
          '--headless',
        ],
        logger: quiet,
      });
      expect(first).toBe(0);

      const runDir = findRunDir(outputRoot);
      const manifest = await readRunManifest(join(runDir, 'run.json'));
      expect(manifest.command).toContain('crawl');
      expect(manifest.counts?.pages).toBe(5);

      const state = JSON.parse(await readFile(join(runDir, 'crawl-state.json'), 'utf8')) as {
        visited: string[];
        pending: unknown[];
      };
      expect(state.visited).toHaveLength(5);
      expect(state.pending.length).toBeGreaterThan(0);

      // No seed argument: the resumed run reuses the ones it recorded.
      const second = await run({
        argv: ['crawl', '--resume', runDir, '--headless'],
        logger: quiet,
      });
      expect(second).toBe(0);

      const { records } = await readPages(join(runDir, 'pages.jsonl'));
      expect(records).toHaveLength(13);
      expect(new Set(records.map((record) => record.requestedUrl)).size).toBe(13);

      const finalManifest = await readRunManifest(join(runDir, 'run.json'));
      expect(finalManifest.runId).toBe(manifest.runId);
      expect(finalManifest.counts?.pages).toBe(13);
    } finally {
      await removeDir(outputRoot);
      await server.close();
    }
  });

  it('resumes an interrupted crawl without visiting or recording a page twice', async () => {
    const server = await startFixtureServer();
    const outputRoot = await makeOutputDir('crawl-resume');
    try {
      const first = await harness({ server, outputRoot });
      const partial = await crawlerFor(first, [server.url('/')], { budgets: { maxPages: 5 } }).run();
      expect(partial.visited).toHaveLength(5);
      expect(partial.stopped).toBe('max-pages');
      await first.dispose();
      open.pop();

      // A fresh browser and a fresh writer, resuming the same run directory.
      const second = await harness({ server, outputRoot, runId: first.runId });
      const state = await second.writer.readCrawlState();
      expect(state?.visited).toHaveLength(5);
      expect(state?.pending.length).toBeGreaterThan(0);

      const resumed = new Crawler({
        page: second.page,
        writer: second.writer,
        runId: second.runId,
        config: testConfig({ crawl: { seeds: [server.url('/')] } }),
        ...(state === undefined ? {} : { resume: state }),
      });
      const finished = await resumed.run();

      expect(finished.stopped).toBe('frontier-empty');
      expect(finished.visited).toHaveLength(13);
      // Only the eight pages left over were visited the second time.
      expect(finished.pages).toHaveLength(8);

      const { records } = await readPages(second.writer.paths.pagesJsonl);
      expect(records).toHaveLength(13);
      const urls = records.map((record) => record.requestedUrl);
      expect(new Set(urls).size).toBe(13);

      const manifest = await second.writer.finalize();
      expect(manifest.counts?.pages).toBe(13);
    } finally {
      await removeDir(outputRoot);
      await server.close();
    }
  });
});
