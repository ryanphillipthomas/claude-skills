import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Crawler, type CrawlResult } from '@ui-atlas/crawler';
import { testConfig } from '../support/harness.js';
import { startCrawlHarness, type CrawlHarness } from '../support/crawl-harness.js';

describe('trace on failure', () => {
  const open: CrawlHarness[] = [];

  afterEach(async () => {
    while (open.length > 0) await open.pop()?.dispose();
  });

  async function harness(probe = false): Promise<CrawlHarness> {
    const created = await startCrawlHarness({ probe });
    open.push(created);
    return created;
  }

  async function crawl(
    test: CrawlHarness,
    seeds: string[],
    crawlOverrides: Record<string, unknown> = {},
    withRecipes = false,
  ): Promise<CrawlResult> {
    const config = testConfig({
      crawl: {
        seeds,
        perPageDelayMs: 0,
        budgets: { maxDepth: 0 },
        retry: { maxAttempts: 1 },
        trace: { enabled: true },
        ...crawlOverrides,
      },
    });
    return new Crawler({
      page: test.page,
      writer: test.writer,
      runId: test.runId,
      config,
      ...(withRecipes ? { recipes: test.recipeRunner(config) } : {}),
    }).run();
  }

  /** Files actually on disk under the run's traces/ directory. */
  async function traceFiles(test: CrawlHarness): Promise<string[]> {
    if (!existsSync(test.writer.paths.tracesDir)) return [];
    return (await readdir(test.writer.paths.tracesDir)).sort();
  }

  it('writes nothing at all for a crawl where every page worked', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/')], { budgets: { maxDepth: 1 } });

    expect(result.pages.length).toBeGreaterThan(1);
    expect(result.pages.every((page) => page.error === undefined)).toBe(true);
    expect(result.traces).toEqual([]);
    // Not an empty directory of nothing — no trace files at all.
    expect(await traceFiles(test)).toEqual([]);
    expect(result.pages.every((page) => page.tracePath === undefined)).toBe(true);
  });

  it('keeps a trace for a page that could not be reached', async () => {
    const test = await harness();
    // A port nothing is listening on: the navigation never gets a response.
    const dead = `http://127.0.0.1:${String(test.server.port + 1)}/gone`;
    const result = await crawl(test, [dead], { allowOrigins: [dead] });

    const page = result.pages[0];
    expect(page?.error).toBeDefined();
    expect(page?.httpStatus).toBeUndefined();
    expect(page?.tracePath).toBeDefined();

    // Named by the page record id, so pages.jsonl and the trace line up.
    expect(page?.tracePath).toBe(`traces/${page?.id ?? ''}.zip`);
    expect(result.traces).toEqual([page?.tracePath]);

    const written = join(test.writer.paths.runDir, page?.tracePath ?? '');
    expect(existsSync(written)).toBe(true);
    expect(statSync(written).size).toBeGreaterThan(0);
  });

  it('says once that the run directory is now sensitive', async () => {
    const test = await harness();
    const dead = `http://127.0.0.1:${String(test.server.port + 1)}`;
    const result = await crawl(test, [`${dead}/a`, `${dead}/b`], { allowOrigins: [dead] });

    expect(result.traces).toHaveLength(2);
    // A trace can carry session cookies, and that is a fact about the run
    // directory, so it is said once rather than once per page.
    const notices = result.warnings.filter((warning) => warning.includes('session'));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('do not share');
  });

  it('does not trace a page that merely answered with an error status', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/__status?key=t404&code=404')]);

    // A 404 is an answer. The status is the whole story; a trace adds nothing.
    expect(result.pages[0]?.httpStatus).toBe(404);
    expect(result.pages[0]?.error).toBeDefined();
    expect(result.pages[0]?.tracePath).toBeUndefined();
    expect(await traceFiles(test)).toEqual([]);
  });

  it('keeps a trace for a page a recipe failed on', async () => {
    const test = await harness(true);
    const result = await crawl(
      test,
      [test.url('/states.html')],
      {
        recipes: [
          {
            name: 'missing-target',
            match: '/states.html',
            steps: [{ click: { testId: 'no-such-control' } }],
            timeoutMs: 500,
          },
        ],
      },
      true,
    );

    // The page itself loaded fine — this is the case a trace is *for*.
    expect(result.pages[0]?.httpStatus).toBe(200);
    expect(result.recipes[0]?.status).toBe('failed');
    expect(result.pages[0]?.tracePath).toBeDefined();
    expect(await traceFiles(test)).toHaveLength(1);
  });

  it('writes nothing when tracing is switched off, however badly it goes', async () => {
    const test = await harness();
    const dead = `http://127.0.0.1:${String(test.server.port + 1)}/gone`;
    const result = await crawl(test, [dead], {
      allowOrigins: [dead],
      trace: { enabled: false },
    });

    expect(result.pages[0]?.error).toBeDefined();
    expect(result.traces).toEqual([]);
    expect(result.pages[0]?.tracePath).toBeUndefined();
    expect(await traceFiles(test)).toEqual([]);
  });

  it('stops at maxTraces rather than filling the disk', async () => {
    const test = await harness();
    const dead = `http://127.0.0.1:${String(test.server.port + 1)}`;
    const result = await crawl(
      test,
      [`${dead}/a`, `${dead}/b`, `${dead}/c`],
      { allowOrigins: [dead], trace: { enabled: true, maxTraces: 2 } },
    );

    expect(result.pages).toHaveLength(3);
    expect(result.traces).toHaveLength(2);
    expect(await traceFiles(test)).toHaveLength(2);
    // The page that missed out says so rather than silently having no trace.
    const skipped = result.pages.find((page) => page.tracePath === undefined);
    expect(skipped?.warnings.some((warning) => warning.includes('already has 2'))).toBe(true);
  });

  it('keeps traces out of the report, because they can carry cookies', async () => {
    const test = await harness();
    const dead = `http://127.0.0.1:${String(test.server.port + 1)}/gone`;
    const result = await crawl(test, [dead], { allowOrigins: [dead] });
    expect(result.pages[0]?.tracePath).toBeDefined();

    await test.writer.finalize();
    const { generateReport } = await import('@ui-atlas/reporter');
    const generated = await generateReport({ runDir: test.writer.paths.runDir });

    // The report is the shareable artifact. A trace path in it would invite
    // someone to open, copy or send a file full of request headers.
    const html = await readFile(generated.path, 'utf8');
    expect(html).not.toContain('tracePath');
    expect(html).not.toContain('.zip');
    // The page itself is still in the report — it is the trace that is absent.
    expect(html).toContain('/gone');
  });
});
