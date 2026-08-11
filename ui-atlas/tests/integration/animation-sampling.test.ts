import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, Page } from 'playwright';
import { chromium } from 'playwright';
import {
  inventoryAnimations,
  limitationsFor,
  sampleAnimations,
  snapshotAllAnimations,
} from '@ui-atlas/animation';
import { AnimationSamplingConfigSchema } from '@ui-atlas/config';
import { loadProbeBundle } from '@ui-atlas/overlay';
import { readCaptures } from '@ui-atlas/artifacts';
import { settlePage } from '@ui-atlas/settle';
import type { AnimationRecord, CaptureRecord } from '@ui-atlas/protocol';
import { run } from '../../apps/cli/src/index.js';
import { createLogger } from '../../apps/cli/src/logger.js';
import {
  makeOutputDir,
  removeDir,
  startFixtureServer,
  testConfig,
  type FixtureServer,
} from '../support/harness.js';

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
  await context.addInitScript({ content: await loadProbeBundle() });
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

async function inventory(page: Page): Promise<AnimationRecord[]> {
  const result = await inventoryAnimations(page, { runId: 'run-test', routeKey: 'motion' });
  return result.animations;
}

const sampling = (overrides: Record<string, unknown> = {}) =>
  AnimationSamplingConfigSchema.parse(overrides);

/**
 * Stop the page's clock so "unchanged" is a fair comparison.
 *
 * `pause()` queues a pause task rather than taking effect immediately:
 * `playState` reads `paused` at once, but `currentTime` keeps tracking the
 * timeline until the task runs at the next frame. Snapshotting before that
 * settles catches an animation mid-flight and makes every later comparison
 * drift by exactly one frame.
 */
async function pauseEverything(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) animation.pause();
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

/** A capture stub, so the sampler can be exercised without writing files. */
function recordingCapture(): {
  capture: Parameters<typeof sampleAnimations>[2]['capture'];
  asked: Array<{ label: string; progress: number; currentTimeMs: number; limitations: string[] }>;
  screenshots: string[];
  page?: Page;
} {
  const asked: Array<{ label: string; progress: number; currentTimeMs: number; limitations: string[] }> = [];
  const screenshots: string[] = [];
  return {
    asked,
    screenshots,
    capture: async ({ sample, label }) => {
      asked.push({
        label,
        progress: sample.progress,
        currentTimeMs: sample.currentTimeMs,
        limitations: sample.limitations,
      });
      return { id: `cap-${String(asked.length)}` } as unknown as CaptureRecord;
    },
  };
}

describe('animation frame sampling', () => {
  it('samples only what the inventory called sampleable, and says why for the rest', async () => {
    const { page, close } = await openMotionPage();
    try {
      const records = await inventory(page);
      const stub = recordingCapture();
      const result = await sampleAnimations(page, records, {
        config: sampling(),
        capture: stub.capture,
        setId: () => 'set-1',
      });

      const sampleable = records.filter((record) => record.sampleability === 'sampleable');
      expect(sampleable.length).toBeGreaterThan(0);
      expect(stub.asked).toHaveLength(sampleable.length * 5);

      // The infinite and scroll-driven ones are skipped, carrying the
      // inventory's own reason rather than a new one invented here.
      const skippedNames = result.skipped.map((entry) => entry.record.sampleability);
      expect(skippedNames).toContain('infinite');
      for (const entry of result.skipped) {
        expect(entry.reason).toBe(entry.record.reasons[0]);
      }
    } finally {
      await close();
    }
  });

  it('seeks to the configured points of one iteration', async () => {
    const { page, close } = await openMotionPage();
    try {
      const records = (await inventory(page)).filter(
        (record) => record.animationName === 'drift' && record.sampleability === 'sampleable',
      );
      expect(records).toHaveLength(1);
      const finite = records[0] as AnimationRecord;
      expect(finite.iterationDurationMs).toBe(1_200);

      const stub = recordingCapture();
      await sampleAnimations(page, records, {
        config: sampling({ offsets: [0, 0.5, 1] }),
        capture: stub.capture,
        setId: () => 'set-1',
      });

      expect(stub.asked.map((entry) => entry.currentTimeMs)).toEqual([0, 600, 1_200]);
      expect(stub.asked.map((entry) => entry.label)).toEqual([
        'animation 0%',
        'animation 50%',
        'animation 100%',
      ]);
      expect(stub.asked.map((entry) => entry.progress)).toEqual([0, 0.5, 1]);
    } finally {
      await close();
    }
  });

  it('puts every animation back exactly as it found it', async () => {
    const { page, close } = await openMotionPage();
    try {
      await pauseEverything(page);
      const before = await page.evaluate(snapshotAllAnimations);
      const records = await inventory(page);
      const stub = recordingCapture();

      const result = await sampleAnimations(page, records, {
        config: sampling(),
        capture: stub.capture,
        setId: () => 'set-1',
      });

      const after = await page.evaluate(snapshotAllAnimations);
      // Every animation — the sampled ones and the untouched ones — back where
      // it was. This is the property that makes sampling safe to run at all.
      expect(after).toBe(before);
      expect(before).not.toBe('');
      expect(result.warnings.filter((warning) => warning.includes('restored'))).toEqual([]);
    } finally {
      await close();
    }
  });

  it('restores even when the capture throws half way through', async () => {
    const { page, close } = await openMotionPage();
    try {
      await pauseEverything(page);
      const before = await page.evaluate(snapshotAllAnimations);
      const records = (await inventory(page)).filter(
        (record) => record.sampleability === 'sampleable',
      );

      let calls = 0;
      const result = await sampleAnimations(page, records, {
        config: sampling({ offsets: [0, 0.5, 1] }),
        setId: () => 'set-1',
        capture: async () => {
          calls += 1;
          if (calls === 2) throw new Error('capture blew up');
          return { id: 'cap' } as unknown as CaptureRecord;
        },
      });

      // The restore runs in a `finally`, so a thrown capture cannot leave an
      // animation paused half way through its timeline.
      expect(await page.evaluate(snapshotAllAnimations)).toBe(before);
      expect(result.warnings.some((warning) => warning.includes('blew up'))).toBe(true);
    } finally {
      await close();
    }
  });

  it('samples the right animation when two share a keyframe name', async () => {
    const { page, close } = await openMotionPage();
    try {
      // The fixture runs `drift` twice: once finite, once infinite. A name
      // identifies a @keyframes rule, not an animation, so matching by name
      // would sample whichever came first — and the infinite one is not
      // sampleable at all.
      const all = await inventory(page);
      const drifts = all.filter((record) => record.animationName === 'drift');
      expect(drifts).toHaveLength(2);
      expect(new Set(drifts.map((record) => record.index)).size).toBe(2);

      const finite = drifts.find((record) => record.sampleability === 'sampleable');
      expect(finite?.target?.testId).toBe('finite-swatch');

      const targets: string[] = [];
      await sampleAnimations(page, [finite as AnimationRecord], {
        config: sampling({ offsets: [0.5] }),
        setId: () => 'set-1',
        capture: async ({ record }) => {
          targets.push(record.target?.testId ?? '');
          return { id: 'cap' } as unknown as CaptureRecord;
        },
      });

      expect(targets).toEqual(['finite-swatch']);
      // And the infinite one was never touched: it is still running.
      const infinite = (await inventory(page)).find(
        (record) => record.target?.testId === 'infinite-swatch',
      );
      expect(infinite?.playState).toBe('running');
    } finally {
      await close();
    }
  });

  it('actually moves the element between offsets', async () => {
    const { page, close } = await openMotionPage();
    try {
      const records = (await inventory(page)).filter(
        (record) => record.target?.testId === 'finite-swatch',
      );
      expect(records).toHaveLength(1);

      const positions: number[] = [];
      await sampleAnimations(page, records, {
        config: sampling({ offsets: [0, 0.5, 1] }),
        setId: () => 'set-1',
        capture: async () => {
          const box = await page.locator('[data-testid="finite-swatch"]').boundingBox();
          positions.push(box?.x ?? -1);
          return { id: 'cap' } as unknown as CaptureRecord;
        },
      });

      // `drift` translates 160px. Three distinct, increasing positions is the
      // proof that the seek reached the page rather than only the object model.
      expect(positions).toHaveLength(3);
      expect(positions[1]).toBeGreaterThan(positions[0] as number);
      expect(positions[2]).toBeGreaterThan(positions[1] as number);
      expect((positions[2] as number) - (positions[0] as number)).toBeGreaterThan(100);
    } finally {
      await close();
    }
  });

  it('says what a frame does not promise', () => {
    const base: AnimationRecord = {
      schemaVersion: 1,
      id: 'a',
      runId: 'r',
      url: 'https://x.test/',
      routeKey: 'x',
      foundAt: new Date(0).toISOString(),
      framePath: [],
      kind: 'css-animation',
      index: 0,
      animationId: 'drift',
      playState: 'running',
      timeline: 'document',
      playbackRate: 1,
      delayMs: 0,
      endDelayMs: 0,
      iterationStart: 0,
      direction: 'normal',
      fill: 'forwards',
      easing: 'linear',
      offsets: [],
      properties: [],
      sampleability: 'sampleable',
      reasons: [],
    };

    // `fill: none` at 100% shows the un-animated element, which looks like a
    // capture that did not work.
    expect(limitationsFor({ ...base, fill: 'none' }, 1).join(' ')).toContain('un-animated');
    expect(limitationsFor({ ...base, fill: 'none' }, 0.5)).toEqual([]);
    expect(limitationsFor({ ...base, iterations: 3 }, 0).join(' ')).toContain('one iteration');
    expect(limitationsFor({ ...base, direction: 'alternate' }, 0).join(' ')).toContain('alternate');
    expect(limitationsFor({ ...base, playbackRate: 2 }, 0).join(' ')).toContain('playback rate');
    expect(limitationsFor({ ...base, pseudoElement: '::before' }, 0).join(' ')).toContain('::before');
    expect(limitationsFor(base, 0)).toEqual([]);
  });

  it('writes real frames through the CLI, and skips the rest honestly', async () => {
    const outputRoot = await makeOutputDir('anim-sample');
    const quiet = createLogger({ level: 'error', write: () => undefined });
    try {
      const code = await run({
        argv: [
          'animations', server.url('/motion.html'),
          '--project', 'fixture',
          '--output', outputRoot,
          '--sample',
          '--offsets', '0,0.5,1',
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

      const { records } = await readCaptures(join(runDir, 'captures.jsonl'));
      expect(records.length).toBeGreaterThanOrEqual(3);
      expect(records.every((record) => record.kind === 'animation-frame')).toBe(true);
      expect(records.every((record) => record.status === 'captured')).toBe(true);

      // Every frame carries its provenance: which animation, seeked to what.
      for (const record of records) {
        expect(record.animation?.method).toBe('web-animations');
        expect(record.animation?.playState).toBe('paused');
        expect(record.set?.kind).toBe('animation');
      }
      expect(records.map((record) => record.animation?.progress)).toContain(0.5);

      // The frames really are different pictures, not the same one three times.
      const hashes = new Set(records.map((record) => record.image?.sha256));
      expect(hashes.size).toBeGreaterThan(1);

      // The animations inventory is still written alongside.
      const text = await readFile(join(runDir, 'animations.jsonl'), 'utf8');
      expect(text.trim().split('\n').length).toBeGreaterThanOrEqual(3);
    } finally {
      await removeDir(outputRoot);
    }
  });
});
