import type { JSHandle, Page } from 'playwright';
import type { AnimationSamplingConfig } from '@ui-atlas/config';
import type { AnimationRecord, AnimationSample, CaptureRecord } from '@ui-atlas/protocol';
import { closeHandles, findHandle, openHandles, type FrameHandles } from './handles.js';
import {
  pauseAnimation,
  readAnimationState,
  restoreAnimation,
  seekAnimation,
  settleFrames,
  type AnimationState,
} from './sample-scripts.js';

/**
 * Captures one frame. Supplied by the caller so this package never depends on
 * the capture service, and so a test can watch what was asked for.
 */
export type CaptureFrame = (input: {
  record: AnimationRecord;
  sample: AnimationSample;
  /** `animation 25%`, for the record's state label. */
  label: string;
  setId: string;
}) => Promise<CaptureRecord>;

export interface SampleAnimationsOptions {
  config: AnimationSamplingConfig;
  capture: CaptureFrame;
  /** Groups every frame of one animation. */
  setId: (record: AnimationRecord) => string;
  onProgress?: ((message: string) => void) | undefined;
}

export interface SampleAnimationsResult {
  captures: CaptureRecord[];
  /** Animations the inventory said could not be sampled, and why. */
  skipped: Array<{ record: AnimationRecord; reason: string }>;
  warnings: string[];
}

/**
 * Photograph an animation at chosen points in its timeline, then put it back.
 *
 * Only what the inventory called `sampleable` is sampled. Everything else is
 * returned as a skip carrying the inventory's own reason, because seeking an
 * infinite or scroll-driven animation produces a frame the site would never
 * show while looking exactly like a successful capture.
 */
export async function sampleAnimations(
  page: Page,
  records: AnimationRecord[],
  options: SampleAnimationsOptions,
): Promise<SampleAnimationsResult> {
  const captures: CaptureRecord[] = [];
  const skipped: SampleAnimationsResult['skipped'] = [];
  const warnings: string[] = [];

  const sampleable = records.filter((record) => record.sampleability === 'sampleable');
  for (const record of records) {
    if (record.sampleability === 'sampleable') continue;
    skipped.push({
      record,
      reason: record.reasons[0] ?? `it is ${record.sampleability}`,
    });
  }
  if (sampleable.length === 0) return { captures, skipped, warnings };

  const byUrl = new Map<string, AnimationRecord[]>();
  for (const record of sampleable) {
    byUrl.set(record.url, [...(byUrl.get(record.url) ?? []), record]);
  }

  for (const [url, wanted] of byUrl) {
    const frame = page.frames().find((candidate) => candidate.url() === url);
    if (frame === undefined) {
      for (const record of wanted) {
        warnings.push(`the frame holding ${record.animationId} (${url}) has gone away`);
      }
      continue;
    }

    let held: FrameHandles | undefined;
    try {
      held = await openHandles(frame);
      for (const record of wanted) {
        const handle = await findHandle(held, record);
        if (handle === undefined) {
          warnings.push(
            `${record.animationId} could not be found again on ${url}; it was not sampled`,
          );
          continue;
        }
        const result = await sampleOne(page, handle, record, options);
        captures.push(...result.captures);
        warnings.push(...result.warnings);
      }
    } catch (error) {
      warnings.push(`sampling failed on ${url}: ${describe(error)}`);
    } finally {
      if (held !== undefined) await closeHandles(held);
    }
  }

  return { captures, skipped, warnings };
}

async function sampleOne(
  page: Page,
  handle: JSHandle<Animation>,
  record: AnimationRecord,
  options: SampleAnimationsOptions,
): Promise<{ captures: CaptureRecord[]; warnings: string[] }> {
  const captures: CaptureRecord[] = [];
  const warnings: string[] = [];
  const { config } = options;

  const iterationMs = record.iterationDurationMs;
  if (iterationMs === undefined || iterationMs <= 0) {
    warnings.push(`${record.animationId} has no iteration length; it was not sampled`);
    return { captures, warnings };
  }

  const original: AnimationState = await handle.evaluate(readAnimationState);
  const setId = options.setId(record);

  try {
    await handle.evaluate(pauseAnimation);

    for (const offset of config.offsets) {
      const currentTimeMs = record.delayMs + offset * iterationMs;
      options.onProgress?.(
        `${record.animationName ?? record.animationId} at ${String(Math.round(offset * 100))}%`,
      );

      await handle.evaluate(seekAnimation, currentTimeMs);
      // Two frames, so the seek has actually been composited before the shutter.
      await page.evaluate(settleFrames);

      const sample: AnimationSample = {
        animationId: record.animationId,
        progress: offset,
        currentTimeMs,
        method: 'web-animations',
        limitations: limitationsFor(record, offset),
      };
      if (record.durationMs !== undefined) sample.durationMs = record.durationMs;
      sample.easing = record.easing;
      sample.playState = 'paused';

      captures.push(
        await options.capture({
          record,
          sample,
          label: `animation ${String(Math.round(offset * 100))}%`,
          setId,
        }),
      );
    }
  } finally {
    // The whole reason sampling is safe: whatever happened above, the animation
    // goes back where it was found.
    const problems = await handle
      .evaluate(restoreAnimation, original)
      .catch((error: unknown) => [describe(error)]);
    for (const problem of problems) {
      warnings.push(`${record.animationId} could not be fully restored (${problem})`);
    }
  }

  return { captures, warnings };
}

/**
 * What this frame does not promise. `AnimationSample.limitations` exists for
 * exactly this, and leaving it empty would imply more certainty than there is.
 */
export function limitationsFor(record: AnimationRecord, offset: number): string[] {
  const limitations: string[] = [];

  // A transition is exempt: past its end the element falls back to its
  // underlying style, and for a transition that style *is* the value it was
  // transitioning to. Warning about it would be a false alarm on the one frame
  // most likely to be looked at.
  const fillMatters = record.kind !== 'css-transition';
  if (fillMatters && offset >= 1 && (record.fill === 'none' || record.fill === 'backwards')) {
    limitations.push(
      `fill is "${record.fill}", so at 100% the element may show its un-animated state ` +
        'rather than the final keyframe',
    );
  }
  if (record.iterations !== undefined && record.iterations > 1) {
    limitations.push(
      `offsets are within one iteration; this animation runs ${String(record.iterations)}` +
        (record.direction === 'normal' ? '' : ` in direction "${record.direction}"`),
    );
  } else if (record.direction !== 'normal') {
    limitations.push(`direction is "${record.direction}"`);
  }
  if (record.playbackRate !== 1) {
    limitations.push(
      `the page had set a playback rate of ${String(record.playbackRate)}; the seek ignores it`,
    );
  }
  if (record.pseudoElement !== undefined) {
    limitations.push(
      `this animates the ${record.pseudoElement} pseudo-element, which cannot be captured on its own`,
    );
  }
  return limitations;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
