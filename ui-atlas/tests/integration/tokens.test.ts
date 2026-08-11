import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import { collectStyleUsage, TokenScanner, TOKEN_PROPERTIES } from '@ui-atlas/tokens';
import { TokensConfigSchema } from '@ui-atlas/config';
import { Crawler } from '@ui-atlas/crawler';
import type { DesignTokenReport } from '@ui-atlas/protocol';
import { settlePage } from '@ui-atlas/settle';
import { run } from '../../apps/cli/src/index.js';
import { createLogger } from '../../apps/cli/src/logger.js';
import {
  makeOutputDir,
  removeDir,
  startFixtureServer,
  testConfig,
  type FixtureServer,
} from '../support/harness.js';
import { startCrawlHarness, type CrawlHarness } from '../support/crawl-harness.js';

let server: FixtureServer;
let browser: Browser;

beforeAll(async () => {
  server = await startFixtureServer();
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser.close().catch(() => undefined);
  await server.close();
});

const PROPERTIES = TOKEN_PROPERTIES.map((entry) => entry.property);

async function openPage(path: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  await page.goto(server.url(path), { waitUntil: 'domcontentloaded' });
  await settlePage(page, { config: testConfig().settle });
  return {
    page,
    close: async () => {
      await context.close().catch(() => undefined);
    },
  };
}

function latestRun(outputRoot: string): string {
  const projectDir = join(outputRoot, 'fixture');
  const name = readdirSync(projectDir)
    .filter((entry) => statSync(join(projectDir, entry)).isDirectory())
    .sort()
    .at(-1);
  if (name === undefined) throw new Error('no run directory was written');
  return join(projectDir, name);
}

describe('reading a page\'s computed values', () => {
  it('counts what is on the page and leaves the browser defaults out', async () => {
    const { page, close } = await openPage('/states.html');
    try {
      const usage = await page.evaluate(collectStyleUsage, {
        properties: PROPERTIES,
        maxElements: 3_000,
        maxExamples: 5,
      });

      expect(usage.elementsScanned).toBeGreaterThan(5);
      expect(usage.elementsSkipped).toBe(0);
      expect(usage.entries.length).toBeGreaterThan(0);

      // The values that mean nobody decided anything are the difference
      // between a design system and a list of CSS defaults, and every one of
      // them would otherwise be the most common value on the page.
      const values = usage.entries.map((entry) => entry.value.toLowerCase());
      expect(values).not.toContain('rgba(0, 0, 0, 0)');
      expect(values).not.toContain('none');
      expect(values).not.toContain('normal');
      expect(values).not.toContain('0px');
      expect(values).not.toContain('auto');

      // Only whitelisted properties come back.
      const properties = new Set(usage.entries.map((entry) => entry.property));
      for (const property of properties) expect(PROPERTIES).toContain(property);
    } finally {
      await close();
    }
  });

  it('never reads a script or a style element', async () => {
    const { page, close } = await openPage('/states.html');
    try {
      const usage = await page.evaluate(collectStyleUsage, {
        properties: PROPERTIES,
        maxElements: 3_000,
        maxExamples: 20,
      });
      const examples = usage.entries.flatMap((entry) => entry.examples);
      expect(examples.some((example) => example.startsWith('script'))).toBe(false);
      expect(examples.some((example) => example.startsWith('style'))).toBe(false);
    } finally {
      await close();
    }
  });

  it('leaves the page exactly as it found it', async () => {
    const { page, close } = await openPage('/states.html');
    try {
      const snapshot = () =>
        page.evaluate(() => ({
          html: document.body.innerHTML,
          focused: document.activeElement?.tagName ?? null,
          scroll: window.scrollY,
        }));

      const before = await snapshot();
      await page.evaluate(collectStyleUsage, {
        properties: PROPERTIES,
        maxElements: 3_000,
        maxExamples: 5,
      });
      expect(await snapshot()).toEqual(before);
    } finally {
      await close();
    }
  });

  it('stops at the per-page cap and says how much it did not read', async () => {
    const { page, close } = await openPage('/states.html');
    try {
      const usage = await page.evaluate(collectStyleUsage, {
        properties: PROPERTIES,
        maxElements: 3,
        maxExamples: 5,
      });
      expect(usage.elementsScanned).toBe(3);
      expect(usage.elementsSkipped).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });

  it('finds the colours the fixture actually uses', async () => {
    const { page, close } = await openPage('/motion.html');
    try {
      const scanner = new TokenScanner({
        runId: 'run-test',
        config: TokensConfigSchema.parse({ enabled: true }),
      });
      await scanner.scan(page, 'motion');
      const report = scanner.summarise('2026-08-11T00:00:00.000Z');

      // The swatches are `#2563eb`, and the computed value arrives as
      // `rgb(37, 99, 235)`.
      const background = report.candidates.find(
        (candidate) => candidate.category === 'background' && candidate.value === '#2563eb',
      );
      expect(background).toBeDefined();
      expect(background?.count).toBeGreaterThanOrEqual(4);
      expect(background?.properties).toEqual(['background-color']);
      expect(background?.routes).toEqual(['motion']);
      expect(background?.examples.join(' ')).toContain('swatch');

      // `border-radius: 12px` on the swatches.
      const radius = report.candidates.find(
        (candidate) => candidate.category === 'radius' && candidate.value === '12px',
      );
      expect(radius).toBeDefined();
      expect(report.candidates.some((candidate) => candidate.category === 'typography')).toBe(true);
    } finally {
      await close();
    }
  });
});

describe('the tokens command', () => {
  it('scans several pages into one artifact', async () => {
    const outputRoot = await makeOutputDir('tokens-cli');
    try {
      const code = await run({
        argv: [
          'tokens', server.url('/motion.html'), server.url('/states.html'),
          '--project', 'fixture',
          '--output', outputRoot,
          '--headless',
        ],
        logger: createLogger({ level: 'error', write: () => undefined }),
      });
      expect(code).toBe(0);

      const runDir = latestRun(outputRoot);
      const report = JSON.parse(
        await readFile(join(runDir, 'tokens.json'), 'utf8'),
      ) as DesignTokenReport;

      expect(report.pagesScanned).toBe(2);
      expect(report.candidates.length).toBeGreaterThan(0);
      expect(report.note).toContain('not a design system');

      // A value seen on both pages carries both routes.
      const shared = report.candidates.find((candidate) => candidate.routes.length === 2);
      expect(shared).toBeDefined();

      // No capture was taken: this reads and nothing else.
      expect(existsSync(join(runDir, 'captures.jsonl'))).toBe(false);
    } finally {
      await removeDir(outputRoot);
    }
  }, 60_000);

  it('keeps going when one of several pages cannot be reached', async () => {
    const outputRoot = await makeOutputDir('tokens-partial');
    try {
      const code = await run({
        argv: [
          'tokens', server.url('/motion.html'), 'http://127.0.0.1:9/nope',
          '--project', 'fixture',
          '--output', outputRoot,
          '--headless',
        ],
        logger: createLogger({ level: 'error', write: () => undefined }),
      });
      expect(code).toBe(0);

      const report = JSON.parse(
        await readFile(join(latestRun(outputRoot), 'tokens.json'), 'utf8'),
      ) as DesignTokenReport;
      expect(report.pagesScanned).toBe(1);
      expect(report.candidates.length).toBeGreaterThan(0);
    } finally {
      await removeDir(outputRoot);
    }
  }, 60_000);
});

describe('scanning styles during a crawl', () => {
  const open: CrawlHarness[] = [];

  afterEach(async () => {
    while (open.length > 0) await open.pop()?.dispose();
  });

  it('describes a whole site rather than whichever page you started on', async () => {
    const test = await startCrawlHarness({});
    open.push(test);

    const scanner = new TokenScanner({
      runId: test.runId,
      config: TokensConfigSchema.parse({ enabled: true }),
    });
    const config = testConfig({
      crawl: {
        seeds: [test.url('/')],
        perPageDelayMs: 0,
        budgets: { maxDepth: 1, maxPages: 6 },
      },
    });

    const result = await new Crawler({
      page: test.page,
      writer: test.writer,
      runId: test.runId,
      config,
      tokens: scanner,
    }).run();

    expect(result.visited.length).toBeGreaterThan(1);

    const report = await test.writer.writeTokens(scanner.summarise());
    expect(report.pagesScanned).toBe(result.visited.length);
    expect(existsSync(test.writer.paths.tokens)).toBe(true);

    // The point of scanning a site rather than a page: something is shared.
    const acrossRoutes = report.candidates.filter((candidate) => candidate.routes.length > 1);
    expect(acrossRoutes.length).toBeGreaterThan(0);

    // Still a crawl that touched nothing.
    expect(test.requests.filter((request) => request.method !== 'GET')).toEqual([]);
  }, 90_000);

  it('does nothing at all when it is switched off', async () => {
    const test = await startCrawlHarness({});
    open.push(test);

    const scanner = new TokenScanner({
      runId: test.runId,
      config: TokensConfigSchema.parse({ enabled: false }),
    });
    await new Crawler({
      page: test.page,
      writer: test.writer,
      runId: test.runId,
      config: testConfig({
        crawl: { seeds: [test.url('/motion.html')], perPageDelayMs: 0, budgets: { maxDepth: 0 } },
      }),
      tokens: scanner,
    }).run();

    expect(scanner.pages).toBe(0);
    expect(scanner.summarise().candidates).toEqual([]);
  }, 60_000);
});
