import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import { captureProvokedAnimations, inventoryAnimations } from '@ui-atlas/animation';
import { readCaptures } from '@ui-atlas/artifacts';
import { Crawler, type CrawlResult } from '@ui-atlas/crawler';
import type { AnimationRecord, CaptureRecord } from '@ui-atlas/protocol';
import { settlePage } from '@ui-atlas/settle';
import { startFixtureServer, testConfig, type FixtureServer } from '../support/harness.js';
import { startCrawlHarness, type CrawlHarness } from '../support/crawl-harness.js';

/** Every control on destructive.html logs itself when activated. */
const DESTRUCTIVE_LOG = () =>
  (window as unknown as { __uiAtlasDestructiveLog: string[] }).__uiAtlasDestructiveLog;

const SWATCH = '[data-testid="transition-swatch"]';
const OFFSETS = [0, 0.25, 0.5, 0.75, 1];

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

async function openMotionPage(): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  await page.goto(server.url('/motion.html'), { waitUntil: 'domcontentloaded' });
  await settlePage(page, { config: testConfig().settle });
  return {
    page,
    close: async () => {
      await context.close().catch(() => undefined);
    },
  };
}

/** Where the swatch is right now, in page coordinates. */
async function swatchX(page: Page): Promise<number> {
  return page.evaluate(() => {
    const element = document.querySelector('[data-testid="transition-swatch"]');
    return element === null ? -1 : element.getBoundingClientRect().x;
  });
}

/** What every animation on the page is doing right now, keyed by description. */
async function playStates(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const out: Record<string, string> = {};
    for (const animation of document.getAnimations()) {
      const css = animation as Animation & { animationName?: string; transitionProperty?: string };
      const element = (animation.effect as KeyframeEffect | null)?.target ?? null;
      const key = `${css.animationName ?? css.transitionProperty ?? 'waapi'}@${
        element?.getAttribute('data-testid') ?? '?'
      }`;
      out[key] = animation.playState;
    }
    return out;
  });
}

interface Frame {
  progress: number;
  currentTimeMs: number;
  durationMs: number | undefined;
  limitations: string[];
  /** Where the swatch actually was when this frame was taken. */
  x: number;
  playStates: Record<string, string>;
}

/**
 * A capture stub that photographs nothing and instead records what the page
 * genuinely looked like at that moment. A screenshot would have to be decoded
 * to prove the seek worked; the live geometry says it directly.
 */
function observingCapture(page: Page, frames: Frame[]) {
  return async ({ sample }: { sample: CaptureRecord['animation'] & object }): Promise<CaptureRecord> => {
    frames.push({
      progress: sample.progress,
      currentTimeMs: sample.currentTimeMs,
      durationMs: sample.durationMs,
      limitations: sample.limitations,
      x: await swatchX(page),
      playStates: await playStates(page),
    });
    return { id: `cap-${String(frames.length)}` } as unknown as CaptureRecord;
  };
}

function provokeOptions(
  page: Page,
  frames: Frame[],
  overrides: Partial<Parameters<typeof captureProvokedAnimations>[1]> = {},
): Parameters<typeof captureProvokedAnimations>[1] {
  return {
    runId: 'run-test',
    routeKey: 'motion',
    offsets: OFFSETS,
    maxAnimations: 10,
    groupId: `hover:${SWATCH}`,
    setId: 'set-1',
    provoke: async () => {
      await page.hover(SWATCH);
    },
    release: async () => {
      await page.mouse.move(0, 0);
    },
    capture: observingCapture(page, frames),
    ...overrides,
  };
}

describe('sampling motion that only exists once something provokes it', () => {
  it('finds the transitions a hover started, and only those', async () => {
    const { page, close } = await openMotionPage();
    try {
      const frames: Frame[] = [];
      const result = await captureProvokedAnimations(page, provokeOptions(page, frames));

      // The hover starts exactly two transitions, and neither the finite nor
      // the infinite `drift` — which were already running — is mistaken for new.
      expect(result.appeared).toHaveLength(2);
      expect(result.appeared.map((record) => record.transitionProperty).sort()).toEqual([
        'background-color',
        'transform',
      ]);
      expect(result.appeared.every((record) => record.kind === 'css-transition')).toBe(true);
      expect(result.appeared.every((record) => record.target?.testId === 'transition-swatch')).toBe(
        true,
      );
    } finally {
      await close();
    }
  });

  it('photographs the group as one moment, on one clock', async () => {
    const { page, close } = await openMotionPage();
    try {
      const restingX = await swatchX(page);
      const frames: Frame[] = [];
      await captureProvokedAnimations(page, provokeOptions(page, frames));

      expect(frames.map((frame) => frame.progress)).toEqual(OFFSETS);

      // Both transitions last 600ms and start together, so the interaction's
      // span is 600ms and `progress` is a fraction of it.
      for (const frame of frames) {
        expect(frame.durationMs).toBe(600);
        expect(frame.currentTimeMs).toBeCloseTo(frame.progress * 600, 5);
      }

      // The seek is real and it runs forwards: the swatch travels 120px from
      // where it was resting, and never goes backwards on the way.
      expect(frames[0]?.x).toBeCloseTo(restingX, 1);
      expect(frames[frames.length - 1]?.x).toBeCloseTo(restingX + 120, 1);
      const xs = frames.map((frame) => frame.x);
      expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    } finally {
      await close();
    }
  });

  it('freezes what it provoked and leaves the rest of the page running', async () => {
    const { page, close } = await openMotionPage();
    try {
      const frames: Frame[] = [];
      await captureProvokedAnimations(page, provokeOptions(page, frames));

      // A transition that has reached its end is removed from
      // `getAnimations()` outright, so the 100% frame legitimately has none.
      const live = frames.filter(
        (frame) => frame.playStates['transform@transition-swatch'] !== undefined,
      );
      expect(live.length).toBe(frames.length - 1);

      for (const frame of live) {
        // Both members of the group are held still, or the frame would show
        // one of them mid-flight.
        expect(frame.playStates['transform@transition-swatch']).toBe('paused');
        expect(frame.playStates['background-color@transition-swatch']).toBe('paused');
      }
      for (const frame of frames) {
        // The page's own animations are not this step's business. Stopping the
        // whole clock would put the rest of the page at a moment that never
        // happened alongside this one.
        expect(frame.playStates['drift@infinite-swatch']).toBe('running');
        expect(frame.playStates['waapi@waapi-swatch']).toBe('running');
      }
    } finally {
      await close();
    }
  });

  it('puts the animations back and lets the hover go', async () => {
    const { page, close } = await openMotionPage();
    try {
      const restingX = await swatchX(page);
      const before = await playStates(page);
      const frames: Frame[] = [];
      await captureProvokedAnimations(page, provokeOptions(page, frames));

      // Releasing runs the transition backwards; it is allowed to take its
      // 600ms, and what matters is where the page ends up.
      await page.waitForFunction(
        () => document.getAnimations().every((animation) => animation.playState !== 'running'
          || (animation as Animation & { transitionProperty?: string }).transitionProperty === undefined),
        undefined,
        { timeout: 5_000 },
      );
      expect(await swatchX(page)).toBeCloseTo(restingX, 1);

      // Every animation that existed beforehand is still doing what it was.
      const after = await playStates(page);
      for (const [key, state] of Object.entries(before)) {
        expect(after[key]).toBe(state);
      }
    } finally {
      await close();
    }
  });

  it('never photographs the transition running backwards', async () => {
    const { page, close } = await openMotionPage();
    try {
      const frames: Frame[] = [];
      await captureProvokedAnimations(page, provokeOptions(page, frames));

      // Every frame was taken before the release, so the count is exactly the
      // offsets asked for and every one of them moves away from rest.
      expect(frames).toHaveLength(OFFSETS.length);
      expect(frames.map((frame) => frame.progress)).toEqual(OFFSETS);
      const reversed = frames.some((frame, index) => index > 0 && frame.x < (frames[index - 1]?.x ?? 0));
      expect(reversed).toBe(false);
    } finally {
      await close();
    }
  });

  it('seeks forwards whatever order the offsets were written in', async () => {
    const { page, close } = await openMotionPage();
    try {
      const restingX = await swatchX(page);
      const frames: Frame[] = [];
      // Reaching the end of a transition removes it from `getAnimations()`
      // entirely. Seeking back to 50% afterwards would land on an animation
      // the document no longer has: nothing moves, nothing throws, and the
      // frame silently shows the end state while claiming to be the middle.
      const result = await captureProvokedAnimations(
        page,
        provokeOptions(page, frames, { offsets: [1, 0.5, 0] }),
      );

      expect(result.warnings).toEqual([]);
      expect(frames.map((frame) => frame.progress)).toEqual([0, 0.5, 1]);
      expect(frames[0]?.x).toBeCloseTo(restingX, 1);
      expect(frames[2]?.x).toBeCloseTo(restingX + 120, 1);
      // The middle frame is genuinely in the middle, not at either end.
      const middle = frames[1]?.x ?? 0;
      expect(middle).toBeGreaterThan(restingX + 1);
      expect(middle).toBeLessThan(restingX + 119);
    } finally {
      await close();
    }
  });

  it('does not warn about backwards fill on a transition it ran to the end', async () => {
    const { page, close } = await openMotionPage();
    try {
      const frames: Frame[] = [];
      await captureProvokedAnimations(page, provokeOptions(page, frames));

      // A transition past its end falls back to the underlying style, and for
      // a transition that style is exactly the value it was heading for. The
      // generic "fill is backwards" caveat would be a false alarm here, on the
      // one frame most likely to be looked at.
      expect(frames[frames.length - 1]?.limitations.join(' ')).not.toContain('fill is');
    } finally {
      await close();
    }
  });

  it('says so when an interaction starts nothing', async () => {
    const { page, close } = await openMotionPage();
    try {
      const frames: Frame[] = [];
      const result = await captureProvokedAnimations(
        page,
        provokeOptions(page, frames, {
          groupId: 'hover:[data-testid="finite-swatch"]',
          provoke: async () => {
            await page.hover('[data-testid="finite-swatch"]');
          },
        }),
      );

      expect(result.appeared).toEqual([]);
      expect(frames).toEqual([]);
      expect(result.warnings.join(' ')).toContain('started no animation');
    } finally {
      await close();
    }
  });

  it('releases the interaction even when the capture throws', async () => {
    const { page, close } = await openMotionPage();
    try {
      const restingX = await swatchX(page);
      const before = await playStates(page);
      let released = false;

      await expect(
        captureProvokedAnimations(
          page,
          provokeOptions(page, [], {
            capture: async () => {
              throw new Error('the disk caught fire');
            },
            release: async () => {
              released = true;
              await page.mouse.move(0, 0);
            },
          }),
        ),
      ).resolves.toBeDefined();

      expect(released).toBe(true);
      await page.waitForFunction(
        () => document.getAnimations().every((animation) => animation.playState !== 'running'
          || (animation as Animation & { transitionProperty?: string }).transitionProperty === undefined),
        undefined,
        { timeout: 5_000 },
      );
      expect(await swatchX(page)).toBeCloseTo(restingX, 1);
      const after = await playStates(page);
      for (const [key, state] of Object.entries(before)) {
        expect(after[key]).toBe(state);
      }
    } finally {
      await close();
    }
  });

  it('leaves the inventory able to describe the page as served', async () => {
    const { page, close } = await openMotionPage();
    try {
      const frames: Frame[] = [];
      await captureProvokedAnimations(page, provokeOptions(page, frames));
      await page.waitForFunction(
        () => document.getAnimations().every((animation) => animation.playState !== 'running'
          || (animation as Animation & { transitionProperty?: string }).transitionProperty === undefined),
        undefined,
        { timeout: 5_000 },
      );

      // Back to a page at rest: the hover transition does not exist again.
      const result = await inventoryAnimations(page, { runId: 'run-test', routeKey: 'motion' });
      expect(result.animations.every((record) => record.kind !== 'css-transition')).toBe(true);
    } finally {
      await close();
    }
  });
});

describe('the captureAnimation recipe step', () => {
  const open: CrawlHarness[] = [];

  afterEach(async () => {
    while (open.length > 0) await open.pop()?.dispose();
  });

  async function harness(): Promise<CrawlHarness> {
    const created = await startCrawlHarness({ probe: true });
    open.push(created);
    return created;
  }

  async function crawl(
    test: CrawlHarness,
    seeds: string[],
    recipes: unknown[],
  ): Promise<CrawlResult> {
    const config = testConfig({
      crawl: { seeds, recipes, perPageDelayMs: 0, budgets: { maxDepth: 0 } },
    });
    return new Crawler({
      page: test.page,
      writer: test.writer,
      runId: test.runId,
      config,
      recipes: test.recipeRunner(config),
    }).run();
  }

  async function readAnimations(path: string): Promise<AnimationRecord[]> {
    const text = await readFile(path, 'utf8').catch(() => '');
    return text
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as AnimationRecord);
  }

  it('captures a hover transition and writes what was in the frames', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/motion.html')], [
      {
        name: 'hover-swatch',
        match: '/motion.html',
        steps: [{ captureAnimation: { hover: { testId: 'transition-swatch' }, label: 'swatch' } }],
      },
    ]);

    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0]?.status).toBe('ran');
    expect(result.recipes[0]?.clicks).toBe(0);
    expect(result.recipes[0]?.animationIds).toHaveLength(2);

    const { records } = await readCaptures(test.writer.paths.capturesJsonl);
    expect(records).toHaveLength(OFFSETS.length);
    expect(records.every((record) => record.status === 'captured')).toBe(true);
    expect(records.every((record) => record.kind === 'animation-frame')).toBe(true);
    expect(records.map((record) => record.animation?.progress)).toEqual(OFFSETS);
    expect(records.every((record) => record.animation?.playState === 'paused')).toBe(true);
    expect(records.every((record) => record.animation?.method === 'web-animations')).toBe(true);
    // The animation position is forced; the *state* really is default.
    expect(records.every((record) => record.state.name === 'default')).toBe(true);
    expect(records[0]?.state.label).toBe('swatch animation 0%');
    // Every frame of one interaction shares a set, so the report can show them
    // side by side.
    const sets = new Set(records.map((record) => record.set?.id));
    expect(sets.size).toBe(1);
    expect(records.every((record) => record.set?.kind === 'animation')).toBe(true);
    // `element` captures photograph the provoked element.
    expect(records.every((record) => record.element !== undefined)).toBe(true);

    const animations = await readAnimations(test.writer.paths.animationsJsonl);
    expect(animations).toHaveLength(2);
    expect(animations.every((record) => record.kind === 'css-transition')).toBe(true);
    expect(animations.map((record) => record.transitionProperty).sort()).toEqual([
      'background-color',
      'transform',
    ]);
  });

  it('provokes a transition with focus as well as hover', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/motion.html')], [
      {
        name: 'focus-swatch',
        match: '/motion.html',
        steps: [
          { captureAnimation: { focus: { testId: 'focus-swatch' }, offsets: [0, 1], kind: 'viewport' } },
        ],
      },
    ]);

    expect(result.recipes[0]?.status).toBe('ran');
    expect(result.recipes[0]?.animationIds).toHaveLength(1);

    const { records } = await readCaptures(test.writer.paths.capturesJsonl);
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.animation?.progress)).toEqual([0, 1]);
    // A single 400ms transition, so the interaction's span is 400ms.
    expect(records.every((record) => record.animation?.durationMs === 400)).toBe(true);
    // `viewport` captures describe no element.
    expect(records.every((record) => record.element === undefined)).toBe(true);

    const animations = await readAnimations(test.writer.paths.animationsJsonl);
    expect(animations).toHaveLength(1);
    expect(animations[0]?.transitionProperty).toBe('transform');
  });

  it('cannot click, so a destructive control stays untouched', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/destructive.html')], [
      {
        name: 'hover-the-dangerous-button',
        match: '/destructive.html',
        steps: [{ captureAnimation: { hover: { role: 'button', name: 'Delete account' } } }],
      },
    ]);

    expect(result.recipes[0]?.status).toBe('ran');
    expect(result.recipes[0]?.clicks).toBe(0);

    // The fixture's own audit log, read while its page is still current.
    expect(await test.page.evaluate(DESTRUCTIVE_LOG)).toEqual([]);
    expect(test.requests.filter((request) => request.method !== 'GET')).toEqual([]);
  });
});
