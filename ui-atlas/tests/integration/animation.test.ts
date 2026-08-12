import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import { inventoryAnimations } from '@ui-atlas/animation';
import { CrawlAnimationInventory, Crawler, type CrawlResult } from '@ui-atlas/crawler';
import { buildFramePath } from '@ui-atlas/identity';
import { settlePage } from '@ui-atlas/settle';
import type { AnimationRecord } from '@ui-atlas/protocol';
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

/** Navigate, settle, and describe. Nothing here touches an animation. */
async function inventory(path: string): Promise<{ page: Page; records: AnimationRecord[]; warnings: string[]; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  await page.goto(server.url(path), { waitUntil: 'domcontentloaded' });
  await settlePage(page, { config: testConfig().settle });

  const result = await inventoryAnimations(page, {
    runId: 'run-test',
    routeKey: 'fixture-motion',
    describeFrame: (frame) => buildFramePath(frame),
  });
  return {
    page,
    records: result.animations,
    warnings: result.warnings,
    close: async () => {
      await context.close().catch(() => undefined);
    },
  };
}

function byName(records: AnimationRecord[], selectorHint: string): AnimationRecord | undefined {
  return records.find((record) => record.target?.selectorHint === selectorHint);
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

describe('animation inventory', () => {
  it('describes each kind of motion on the fixture, and how samplable it is', async () => {
    const { records, close } = await inventory('/motion.html');
    try {
      expect(records.length).toBeGreaterThanOrEqual(3);

      const finite = byName(records, '[data-testid="finite-swatch"]');
      expect(finite?.kind).toBe('css-animation');
      expect(finite?.animationName).toBe('drift');
      expect(finite?.durationMs).toBe(1_200);
      expect(finite?.iterations).toBe(1);
      expect(finite?.sampleability).toBe('sampleable');
      expect(finite?.properties).toContain('transform');
      expect(finite?.offsets).toEqual([0, 1]);

      // Infinite: reported, and explicitly *not* sampleable. Sampling it at
      // "100%" would be a screenshot of an arbitrary moment dressed up as an
      // end state.
      const infinite = byName(records, '[data-testid="infinite-swatch"]');
      expect(infinite?.kind).toBe('css-animation');
      expect(infinite?.sampleability).toBe('infinite');
      expect(infinite?.iterations).toBeUndefined();
      expect(infinite?.durationMs).toBe(1_500);
      expect(infinite?.reasons.join(' ')).toContain('repeats forever');

      const waapi = byName(records, '[data-testid="waapi-swatch"]');
      expect(waapi?.kind).toBe('web-animation');
      expect(waapi?.durationMs).toBe(2_000);
      expect(waapi?.iterations).toBe(3);
      expect(waapi?.sampleability).toBe('sampleable');
      expect(waapi?.activeDurationMs).toBe(6_000);
    } finally {
      await close();
    }
  });

  it('marks a scroll-driven animation as reachable only by scrolling', async () => {
    const { page, records, close } = await inventory('/motion.html');
    try {
      const supported = await page.evaluate(() => CSS.supports('animation-timeline: scroll()'));
      if (!supported) {
        // The fixture guards it with @supports, so on a browser without scroll
        // timelines there is genuinely nothing to classify.
        expect(records.every((record) => record.sampleability !== 'scroll-driven')).toBe(true);
        return;
      }

      const scrollDriven = byName(records, '[data-testid="scroll-swatch"]');
      expect(scrollDriven).toBeDefined();
      expect(scrollDriven?.timeline).toBe('scroll');
      expect(scrollDriven?.sampleability).toBe('scroll-driven');
      expect(scrollDriven?.reasons.join(' ')).toContain('scrolling');
      // No iteration length either: seeking currentTime reaches no frame here,
      // so offering a number would invite exactly the wrong kind of sampling.
      expect(scrollDriven?.iterationDurationMs).toBeUndefined();
    } finally {
      await close();
    }
  });

  it('does not see a transition that only exists on hover', async () => {
    const { page, records, close } = await inventory('/motion.html');
    try {
      // A page at rest has no hover transition, because the transition does not
      // exist until something provokes it. That is a real limitation of an
      // inventory that refuses to interact, and it is documented rather than
      // worked around here.
      expect(byName(records, '[data-testid="transition-swatch"]')).toBeUndefined();
      expect(records.every((record) => record.kind !== 'css-transition')).toBe(true);

      // Provoke it, and it appears — which is what a recipe would do.
      await page.hover('[data-testid="transition-swatch"]');
      const after = await inventoryAnimations(page, { runId: 'run-test', routeKey: 'motion' });
      const transitions = after.animations.filter((record) => record.kind === 'css-transition');
      expect(transitions.length).toBeGreaterThan(0);
      expect(transitions[0]?.transitionProperty).toBeDefined();
      expect(transitions[0]?.sampleability).toBe('sampleable');
    } finally {
      await close();
    }
  });

  it('leaves every animation exactly as it found it', async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const page = await context.newPage();
    try {
      await page.goto(server.url('/motion.html'), { waitUntil: 'domcontentloaded' });
      await settlePage(page, { config: testConfig().settle });

      const snapshot = () =>
        page.evaluate(() =>
          document
            .getAnimations()
            .map((animation) => `${animation.playState}:${String(animation.playbackRate)}`)
            .sort()
            .join('|'),
        );

      const before = await snapshot();
      await inventoryAnimations(page, { runId: 'run-test', routeKey: 'motion' });
      const after = await snapshot();

      // Nothing paused, nothing seeked, no playback rate touched. An inventory
      // that perturbed what it measured would describe a page that no longer
      // exists.
      expect(after).toBe(before);
      expect(before).not.toBe('');
    } finally {
      await context.close().catch(() => undefined);
    }
  });

  it('counts the motion getAnimations cannot describe', async () => {
    const { records, warnings, close } = await inventory('/media.html');
    try {
      // Canvas and video are moving pictures that are not Animations. Saying
      // "no animations found" here would be a lie of omission.
      const notice = warnings.find((warning) => warning.includes('cannot describe'));
      expect(notice).toBeDefined();
      expect(notice).toContain('canvas element(s)');
      expect(notice).toContain('video element(s)');
      expect(records.every((record) => record.kind !== 'css-transition')).toBe(true);
    } finally {
      await close();
    }
  });

  it('reaches every frame, including the cross-origin one', async () => {
    const { page, warnings, close } = await inventory('/frames.html');
    try {
      // More than one frame, and one of them is on another origin — which page
      // script could never evaluate in, but Playwright can.
      const frames = page.frames();
      expect(frames.length).toBeGreaterThan(1);
      const origins = new Set(frames.map((frame) => safeOrigin(frame.url())));
      expect(origins.size).toBeGreaterThan(1);

      // Every frame answered. A frame that threw would say so here rather than
      // silently shortening the inventory.
      expect(warnings.filter((warning) => warning.includes('could not inventory'))).toEqual([]);
    } finally {
      await close();
    }
  });

  it('runs end to end through the CLI and writes animations.jsonl', async () => {
    const outputRoot = await makeOutputDir('animations');
    const quiet = createLogger({ level: 'error', write: () => undefined });
    try {
      const code = await run({
        argv: [
          'animations', server.url('/motion.html'),
          '--project', 'fixture',
          '--output', outputRoot,
          '--headless',
        ],
        logger: quiet,
      });
      expect(code).toBe(0);

      const projectDir = join(outputRoot, 'fixture');
      const runDir = join(
        projectDir,
        readdirSync(projectDir)
          .filter((name) => statSync(join(projectDir, name)).isDirectory())
          .sort()
          .at(-1) as string,
      );

      const text = await readFile(join(runDir, 'animations.jsonl'), 'utf8');
      const lines = text.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(3);

      const parsed = lines.map((line) => JSON.parse(line) as AnimationRecord);
      expect(parsed.every((record) => record.runId.length > 0)).toBe(true);
      expect(parsed.some((record) => record.sampleability === 'infinite')).toBe(true);
      expect(parsed.some((record) => record.sampleability === 'sampleable')).toBe(true);
      // Nothing was captured: this slice describes, it does not photograph.
      expect(readdirSync(runDir)).not.toContain('captures.jsonl');
    } finally {
      await removeDir(outputRoot);
    }
  });
});

describe('the animation inventory during a crawl', () => {
  const open: CrawlHarness[] = [];

  afterEach(async () => {
    while (open.length > 0) await open.pop()?.dispose();
  });

  /** Seeded at the fixture index, which links to every other page. */
  async function crawl(
    animationOverrides: Record<string, unknown> = { enabled: true },
    crawlOverrides: Record<string, unknown> = {},
  ): Promise<{ test: CrawlHarness; result: CrawlResult }> {
    const test = await startCrawlHarness({ server });
    open.push(test);
    const config = testConfig({
      crawl: {
        seeds: [test.url('/')],
        perPageDelayMs: 0,
        // The whole fixture: motion.html and media.html are the eighth and
        // ninth pages discovered, so a smaller budget never reaches the motion.
        budgets: { maxDepth: 1, maxPages: 15 },
        animations: animationOverrides,
        ...crawlOverrides,
      },
    });
    const result = await new Crawler({
      page: test.page,
      writer: test.writer,
      runId: test.runId,
      config,
      animations: new CrawlAnimationInventory({
        config: config.crawl.animations,
        runId: test.runId,
      }),
    }).run();
    return { test, result };
  }

  it('describes every page it visits, and says which route each came from', async () => {
    const { test, result } = await crawl();

    expect(result.animations.length).toBeGreaterThanOrEqual(3);
    const routes = new Set(result.animations.map((record) => record.routeKey));
    expect(routes.size).toBeGreaterThanOrEqual(1);
    expect(result.animations.every((record) => record.runId === test.runId)).toBe(true);
    expect(result.animations.some((record) => record.sampleability === 'infinite')).toBe(true);
    expect(result.animations.some((record) => record.sampleability === 'sampleable')).toBe(true);

    // Written where the one-shot command writes them, so a site-wide inventory
    // is read exactly like a page-wide one.
    const text = await readFile(test.writer.paths.animationsJsonl, 'utf8');
    expect(text.trim().split('\n')).toHaveLength(result.animations.length);
  }, 90_000);

  it('describes and nothing else', async () => {
    const { test, result } = await crawl();

    // The infinite `drift` is still running: an inventory that paused what it
    // was describing would report a page that no longer exists.
    const infinite = result.animations.find(
      (record) => record.target?.testId === 'infinite-swatch',
    );
    expect(infinite?.playState).toBe('running');

    // Nothing was photographed, and nothing was submitted anywhere.
    expect(readdirSync(test.writer.paths.runDir)).not.toContain('captures.jsonl');
    expect(test.requests.filter((request) => request.method !== 'GET')).toEqual([]);
  }, 90_000);

  it('does nothing at all when it is switched off', async () => {
    const { test, result } = await crawl({ enabled: false });
    expect(result.animations).toEqual([]);
    expect(readdirSync(test.writer.paths.runDir)).not.toContain('animations.jsonl');
  }, 90_000);

  it('mentions motion it cannot see once for the run, not once per page', async () => {
    const { result } = await crawl();

    // media.html has canvas and video elements. The per-page notice would be
    // true of every page of a canvas-driven site; said fifty times it buries
    // everything else, so it is counted and raised once with a route count.
    const notices = result.warnings.filter((warning) =>
      warning.includes('the Web Animations API cannot describe'),
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('route(s) contain');
    expect(notices[0]).toContain('canvas element(s)');
  }, 90_000);

  it('stops at the run budget and says so at the run level', async () => {
    const { result } = await crawl({ enabled: true, maxTotal: 2 });
    expect(result.animations).toHaveLength(2);

    // A run-level budget belongs to the run. Attached to whichever page
    // happened to trip it, it would be one line inside one page record.
    const notices = result.warnings.filter((warning) => warning.includes('record budget'));
    expect(notices).toHaveLength(1);
  }, 90_000);

  it('caps one busy page, and says so on that page', async () => {
    const { result } = await crawl({ enabled: true, maxPerPage: 1 });
    const perRoute = new Map<string, number>();
    for (const record of result.animations) {
      perRoute.set(record.routeKey, (perRoute.get(record.routeKey) ?? 0) + 1);
    }
    expect(perRoute.size).toBeGreaterThan(0);
    for (const count of perRoute.values()) expect(count).toBe(1);

    // This one is a fact about a page, so it travels with the page record
    // rather than being lifted to the run.
    const capped = result.pages.filter((page) =>
      page.warnings.some((warning) => warning.includes('only the first 1')),
    );
    expect(capped.length).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.includes('only the first 1'))).toBe(false);
  }, 90_000);
});
