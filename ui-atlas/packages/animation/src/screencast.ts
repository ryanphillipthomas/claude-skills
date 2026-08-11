import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Browser, BrowserContextOptions, Page } from 'playwright';
import type { AnimationVideoConfig } from '@ui-atlas/config';
import type { AnimationRecord, ReadinessResult } from '@ui-atlas/protocol';
import type { UnobservableMotion } from './page-scripts.js';

export interface ScreencastPlan {
  /** Whether there is anything a recording would show. */
  record: boolean;
  /** How long to observe for. */
  durationMs: number;
  /** What the recording is of, in words. */
  subjects: string[];
  /** Motion deliberately left out, and why. */
  excluded: Array<{ subject: string; reason: string }>;
  /** True when the budget cut the window short of what was wanted. */
  truncated: boolean;
  /** What the recording does not promise, before it has been taken. */
  limitations: string[];
}

/**
 * Decide what a recording would be of, and how long it needs to be.
 *
 * A screencast is the fallback for motion with **no keyframes to sample**: an
 * animation that repeats forever, one whose duration is `auto`, and the canvas,
 * WebGL and video motion `getAnimations` cannot see at all. Everything else is
 * excluded on purpose, with the reason:
 *
 * - `sampleable` motion already has exact frames. A recording of it would imply
 *   the frames were not enough.
 * - `scroll-driven` motion advances with the scroll position. Recording a page
 *   that is not scrolling produces a still — which looks exactly like a
 *   recording that failed, which is the one thing worse than no recording.
 * - `instant` motion has no intermediate frames to record.
 */
export function planScreencast(
  records: AnimationRecord[],
  unobservable: UnobservableMotion,
  config: AnimationVideoConfig,
): ScreencastPlan {
  const subjects: string[] = [];
  const excluded: ScreencastPlan['excluded'] = [];
  /** Loop lengths of the subjects that have one. */
  const loops: number[] = [];
  /** True when something in shot has no length at all to reason about. */
  let unbounded = false;

  for (const record of records) {
    const label = describe(record);
    if (record.sampleability === 'infinite' || record.sampleability === 'indeterminate') {
      subjects.push(label);
      const loop = record.iterationDurationMs;
      if (loop !== undefined && loop > 0) loops.push(record.delayMs + loop);
      else unbounded = true;
      continue;
    }
    excluded.push({ subject: label, reason: exclusionReason(record) });
  }

  for (const [what, count] of [
    ['canvas element(s)', unobservable.canvas2d],
    ['WebGL canvas element(s)', unobservable.webgl],
    ['video element(s)', unobservable.video],
  ] as const) {
    if (count > 0) {
      subjects.push(`${String(count)} ${what}, whose motion getAnimations cannot describe`);
      // Nothing says how long a canvas loop is, so it needs the whole budget.
      unbounded = true;
    }
  }

  if (subjects.length === 0) {
    return {
      record: false,
      durationMs: 0,
      subjects,
      excluded,
      truncated: false,
      limitations: [],
    };
  }

  const longestLoop = loops.length > 0 ? Math.max(...loops) : 0;
  const wantedMs = unbounded ? config.maxDurationMs : longestLoop * config.iterations;
  const durationMs = Math.min(wantedMs, config.maxDurationMs);
  const truncated = wantedMs > config.maxDurationMs;

  const limitations = [
    'a recording is not a deterministic sample: it shows one pass of the motion ' +
      'from whatever moment the recorder happened to start, and recording again ' +
      'gives a different file',
    'the frame rate is whatever the browser produced and is not recorded here, ' +
      'so times read off the file are approximate',
  ];
  if (truncated) {
    limitations.push(
      `${String(config.iterations)} loops of the longest animation would take ` +
        `${formatMs(wantedMs)}; this is ${formatMs(durationMs)} of it`,
    );
  }
  if (excluded.length > 0) {
    limitations.push(
      `${String(excluded.length)} other animation(s) on this page are not what this ` +
        `recording is of (${excluded[0]?.reason ?? ''})`,
    );
  }

  return { record: true, durationMs, subjects, excluded, truncated, limitations };
}

function describe(record: AnimationRecord): string {
  const name = record.animationName ?? record.transitionProperty ?? record.animationId;
  const where = record.target?.selectorHint;
  return where === undefined ? name : `${name} on ${where}`;
}

function exclusionReason(record: AnimationRecord): string {
  switch (record.sampleability) {
    case 'sampleable':
      return 'it can be sampled deterministically, and exact frames say more than a recording';
    case 'scroll-driven':
      return 'it advances with scrolling, so a recording of a page that is not scrolling is a still';
    default:
      return 'it has no intermediate frames to record';
  }
}

export interface RecordScreencastOptions {
  url: string;
  durationMs: number;
  maxBytes: number;
  viewport: { width: number; height: number };
  /** Emulation, locale, session — supplied by the caller, not invented here. */
  contextOptions?: BrowserContextOptions | undefined;
  /** Where the browser records into. Emptied by the caller afterwards. */
  workspaceDir: string;
  /** Bounded readiness, injected so this package does not depend on settle. */
  settle: (page: Page) => Promise<ReadinessResult>;
  navigationTimeoutMs: number;
  onProgress?: ((message: string) => void) | undefined;
}

export interface ScreencastRecording {
  /** The finished file, or `undefined` when there is nothing to keep. */
  path?: string | undefined;
  byteLength: number;
  /** How far into the file the observation window starts. */
  leadInMs: number;
  durationMs: number;
  readiness?: ReadinessResult | undefined;
  warnings: string[];
}

/**
 * Record a page for a bounded window, in a browser context of its own.
 *
 * Playwright records a **context**, not a page, and only finishes the file when
 * the context closes. So this cannot borrow the caller's context: it opens a
 * short-lived one, loads the page again, waits, and closes it.
 *
 * The cost is honest and recorded rather than hidden: the file begins with that
 * second page load, and `leadInMs` says how far in the part you asked for
 * starts.
 */
export async function recordScreencast(
  browser: Browser,
  options: RecordScreencastOptions,
): Promise<ScreencastRecording> {
  const warnings: string[] = [];
  const startedAt = Date.now();

  const context = await browser.newContext({
    ...options.contextOptions,
    viewport: options.viewport,
    recordVideo: { dir: options.workspaceDir, size: options.viewport },
  });

  let leadInMs = 0;
  let readiness: ReadinessResult | undefined;
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(options.navigationTimeoutMs);
    const video = page.video();

    await page.goto(options.url, { timeout: options.navigationTimeoutMs });
    readiness = await options.settle(page);
    // Everything before this point is page load, and it is in the file too.
    leadInMs = Date.now() - startedAt;

    options.onProgress?.(
      `recording ${formatMs(options.durationMs)} of ${options.url}`,
    );
    await sleep(options.durationMs);

    if (video === null) {
      warnings.push('the browser produced no video for this page');
      return { byteLength: 0, leadInMs, durationMs: options.durationMs, readiness, warnings };
    }

    // The file is only finished once the context is gone.
    await context.close();
    const destination = join(options.workspaceDir, 'recording.webm');
    await video.saveAs(destination);

    const byteLength = await fileSize(destination);
    if (byteLength > options.maxBytes) {
      // Checked by size on disk rather than read into memory first: a runaway
      // recording must not become a runaway allocation on the way to being
      // rejected.
      warnings.push(
        `the recording is ${formatBytes(byteLength)}, over the ${formatBytes(options.maxBytes)} ` +
          'budget, and was discarded',
      );
      return { byteLength, leadInMs, durationMs: options.durationMs, readiness, warnings };
    }

    return {
      path: destination,
      byteLength,
      leadInMs,
      durationMs: options.durationMs,
      readiness,
      warnings,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function fileSize(path: string): Promise<number> {
  const info = await stat(path).catch(() => undefined);
  return info?.size ?? 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatMs(value: number): string {
  return value >= 1_000 ? `${String(Math.round(value / 100) / 10)}s` : `${String(Math.round(value))}ms`;
}

function formatBytes(value: number): string {
  return value >= 1_000_000
    ? `${String(Math.round(value / 100_000) / 10)}MB`
    : `${String(Math.round(value / 1_000))}kB`;
}
