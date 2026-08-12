import type { JSHandle, Page } from 'playwright';
import type { AnimationRecord, AnimationSample, CaptureRecord } from '@ui-atlas/protocol';
import { groupByFrame, newAnimations } from './diff.js';
import { closeHandles, findHandle, openHandles, type FrameHandles } from './handles.js';
import { inventoryAnimations, type AnimationInventoryOptions } from './inventory.js';
import { limitationsFor } from './sampler.js';
import {
  pauseAnimation,
  readAnimationState,
  restoreAnimation,
  seekAnimation,
  settleFrames,
  type AnimationState,
} from './sample-scripts.js';

/**
 * Captures one frame of a *group* of animations. The whole group is what the
 * frame shows, so the caller gets every member rather than a single record.
 */
export type CaptureGroupFrame = (input: {
  members: AnimationRecord[];
  sample: AnimationSample;
  /** `animation 25%`, for the record's state label. */
  label: string;
  setId: string;
}) => Promise<CaptureRecord>;

export interface SampleGroupOptions {
  /** Points across the interaction's whole span, 0..1. */
  offsets: number[];
  /** Identifies the interaction on every frame, e.g. `hover:[data-testid=…]`. */
  groupId: string;
  setId: string;
  capture: CaptureGroupFrame;
  maxAnimations: number;
  onProgress?: ((message: string) => void) | undefined;
}

export interface SampleGroupResult {
  captures: CaptureRecord[];
  /** Members the inventory said could not be sampled, and why. */
  skipped: Array<{ record: AnimationRecord; reason: string }>;
  warnings: string[];
}

/**
 * Photograph several animations that started together, as one moment.
 *
 * This is the difference between a group and a sequence of individuals.
 * Hovering a card commonly starts a `transform` transition and a
 * `background-color` transition at the same instant; they are one visual event,
 * and sampling them separately would produce a frame with the transform half
 * way and the colour still at its start — a composite that never existed.
 *
 * So every member is paused first, then all of them are seeked to the *same
 * absolute time* and photographed once. `progress` is therefore a fraction of
 * the interaction's span rather than of any one animation's iteration: members
 * with different durations reach their own ends at different points, which is
 * exactly what the page does.
 */
export async function sampleAnimationGroup(
  page: Page,
  records: AnimationRecord[],
  options: SampleGroupOptions,
): Promise<SampleGroupResult> {
  const captures: CaptureRecord[] = [];
  const skipped: SampleGroupResult['skipped'] = [];
  const warnings: string[] = [];

  const sampleable: AnimationRecord[] = [];
  for (const record of records) {
    if (record.sampleability === 'sampleable' && (record.iterationDurationMs ?? 0) > 0) {
      sampleable.push(record);
      continue;
    }
    skipped.push({
      record,
      reason: record.reasons[0] ?? `it is ${record.sampleability}`,
    });
  }

  if (sampleable.length > options.maxAnimations) {
    warnings.push(
      `this interaction started ${String(sampleable.length)} animations; ` +
        `only the first ${String(options.maxAnimations)} were sampled`,
    );
    sampleable.splice(options.maxAnimations);
  }
  if (sampleable.length === 0) return { captures, skipped, warnings };

  const url = sampleable[0]?.url ?? page.url();
  const frame = page.frames().find((candidate) => candidate.url() === url);
  if (frame === undefined) {
    warnings.push(`the frame holding these animations (${url}) has gone away`);
    return { captures, skipped, warnings };
  }

  // The span of the whole interaction: the last member to finish decides when
  // it is over. Each member's own delay is already part of its `currentTime`,
  // so seeking every member to the same number puts them on one shared clock.
  const spanMs = Math.max(
    ...sampleable.map((record) => record.delayMs + (record.iterationDurationMs ?? 0)),
  );
  if (!Number.isFinite(spanMs) || spanMs <= 0) {
    warnings.push('this interaction has no measurable length; nothing was sampled');
    return { captures, skipped, warnings };
  }

  let held: FrameHandles | undefined;
  const touched: Array<{ handle: JSHandle<Animation>; original: AnimationState }> = [];
  try {
    held = await openHandles(frame);

    const members: AnimationRecord[] = [];
    for (const record of sampleable) {
      const handle = await findHandle(held, record);
      if (handle === undefined) {
        warnings.push(`${record.animationId} could not be found again on ${url}; it was not sampled`);
        continue;
      }
      // Read before touching, and pause every member before any of them is
      // seeked: a member still running while another is photographed would put
      // motion in the frame.
      touched.push({ handle, original: await handle.evaluate(readAnimationState) });
      await handle.evaluate(pauseAnimation);
      members.push(record);
    }
    if (members.length === 0) return { captures, skipped, warnings };

    const shared = sharedLimitations(members, skipped, spanMs);

    // Ascending, whatever order was asked for. A CSS transition is removed
    // from `getAnimations()` the instant it finishes, and a seek afterwards
    // lands on an animation the document no longer has: it changes nothing,
    // throws nothing, and produces a frame that looks exactly like every other
    // frame while showing the wrong moment. Moving only forwards is the one
    // order in which every frame is the moment it claims to be — and nothing
    // is lost, because each frame carries the offset it was taken at.
    for (const offset of [...options.offsets].sort((a, b) => a - b)) {
      const currentTimeMs = offset * spanMs;
      options.onProgress?.(`${options.groupId} at ${String(Math.round(offset * 100))}%`);

      for (const { handle } of touched) await handle.evaluate(seekAnimation, currentTimeMs);
      // Two frames, so the seek has actually been composited before the shutter.
      await page.evaluate(settleFrames);

      const sample: AnimationSample = {
        animationId: options.groupId,
        progress: offset,
        currentTimeMs,
        durationMs: spanMs,
        method: 'web-animations',
        playState: 'paused',
        limitations: [...shared, ...memberLimitations(members, currentTimeMs)],
      };
      const easing = commonEasing(members);
      if (easing !== undefined) sample.easing = easing;

      captures.push(
        await options.capture({
          members,
          sample,
          label: `animation ${String(Math.round(offset * 100))}%`,
          setId: options.setId,
        }),
      );
    }
  } catch (error) {
    warnings.push(`sampling failed on ${url}: ${describe(error)}`);
  } finally {
    // Every member goes back where it was found, whatever happened above.
    for (const { handle, original } of touched) {
      const problems = await handle
        .evaluate(restoreAnimation, original)
        .catch((error: unknown) => [describe(error)]);
      for (const problem of problems) {
        warnings.push(`an animation could not be fully restored (${problem})`);
      }
    }
    if (held !== undefined) await closeHandles(held);
  }

  return { captures, skipped, warnings };
}

export interface CaptureProvokedOptions
  extends Pick<AnimationInventoryOptions, 'runId' | 'routeKey' | 'describeFrame' | 'newId'> {
  /** Starts the motion. Runs between the two inventories. */
  provoke: () => Promise<void>;
  /**
   * Ends it again, after every frame has been taken and every animation put
   * back. Always runs, including when the provocation or the sampling failed.
   */
  release: () => Promise<void>;
  offsets: number[];
  maxAnimations: number;
  groupId: string;
  setId: string;
  capture: CaptureGroupFrame;
  onProgress?: ((message: string) => void) | undefined;
}

export interface CaptureProvokedResult {
  captures: CaptureRecord[];
  /** The animations that appeared *because of* the provocation. */
  appeared: AnimationRecord[];
  skipped: Array<{ record: AnimationRecord; reason: string }>;
  warnings: string[];
}

/**
 * Photograph motion that does not exist until something provokes it.
 *
 * A hover transition is absent from a page at rest — correctly, since the
 * inventory refuses to interact — so reaching one means interacting, and
 * knowing *which* animations the interaction started means looking either side
 * of it. Hence: inventory, provoke, inventory, and the difference is the
 * answer.
 *
 * The provocation is released last, after everything has been photographed and
 * restored. Releasing a hover starts the transition running *backwards*, and a
 * reverse transition photographed as though it were the forward one would be a
 * frame that looks right and is wrong.
 */
export async function captureProvokedAnimations(
  page: Page,
  options: CaptureProvokedOptions,
): Promise<CaptureProvokedResult> {
  const inventoryOptions: AnimationInventoryOptions = {
    runId: options.runId,
    routeKey: options.routeKey,
    ...(options.describeFrame === undefined ? {} : { describeFrame: options.describeFrame }),
    ...(options.newId === undefined ? {} : { newId: options.newId }),
  };

  const warnings: string[] = [];
  const before = await inventoryAnimations(page, inventoryOptions);
  let appeared: AnimationRecord[] = [];
  const captures: CaptureRecord[] = [];
  const skipped: CaptureProvokedResult['skipped'] = [];

  try {
    await options.provoke();
    // A CSS transition is created at the next style recalculation, so a page
    // asked about too promptly honestly has nothing to report yet.
    await page.evaluate(settleFrames);

    const after = await inventoryAnimations(page, inventoryOptions);
    appeared = newAnimations(before.animations, after.animations);
    if (appeared.length === 0) {
      warnings.push('this interaction started no animation the Web Animations API can see');
      return { captures, appeared, skipped, warnings };
    }

    const groups = groupByFrame(appeared);
    for (const [index, group] of groups.entries()) {
      const result = await sampleAnimationGroup(page, group.members, {
        offsets: options.offsets,
        groupId: options.groupId,
        // One set per document, so the report never puts frames from two
        // different clocks in one row.
        setId: index === 0 ? options.setId : `${options.setId}-${String(index)}`,
        capture: options.capture,
        maxAnimations: options.maxAnimations,
        ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
      });
      captures.push(...result.captures);
      skipped.push(...result.skipped);
      warnings.push(...result.warnings);
    }
  } finally {
    await options.release().catch((error: unknown) => {
      warnings.push(`the interaction could not be released (${describe(error)})`);
    });
  }

  return { captures, appeared, skipped, warnings };
}

/** Caveats that hold for every frame of the group. */
function sharedLimitations(
  members: AnimationRecord[],
  skipped: Array<{ record: AnimationRecord; reason: string }>,
  spanMs: number,
): string[] {
  const limitations: string[] = [];

  const ends = members.map((record) => record.delayMs + (record.iterationDurationMs ?? 0));
  if (members.length > 1 && Math.min(...ends) < spanMs) {
    limitations.push(
      `these frames are of the whole interaction (${formatMs(spanMs)}); its ` +
        `${String(members.length)} animations are not all the same length, so the shorter ones ` +
        'hold their end value in the later frames',
    );
  }
  if (skipped.length > 0) {
    limitations.push(
      `this interaction also started ${String(skipped.length)} animation(s) that cannot be ` +
        `sampled (${skipped[0]?.reason ?? 'no reason given'}); they were left running, so their ` +
        'position in these frames is arbitrary',
    );
  }
  return limitations;
}

/** Per-member caveats at one moment, named when there is more than one member. */
function memberLimitations(members: AnimationRecord[], currentTimeMs: number): string[] {
  const limitations: string[] = [];
  for (const record of members) {
    const iterationMs = record.iterationDurationMs ?? 0;
    const progress = iterationMs > 0 ? (currentTimeMs - record.delayMs) / iterationMs : 0;
    for (const limitation of limitationsFor(record, progress)) {
      limitations.push(members.length > 1 ? `${describeMember(record)}: ${limitation}` : limitation);
    }
  }
  return limitations;
}

function describeMember(record: AnimationRecord): string {
  return record.animationName ?? record.transitionProperty ?? record.animationId;
}

/** One easing only when every member agrees; a mixture is not an easing. */
function commonEasing(members: AnimationRecord[]): string | undefined {
  const first = members[0]?.easing;
  if (first === undefined) return undefined;
  return members.every((record) => record.easing === first) ? first : undefined;
}

function formatMs(value: number): string {
  return value >= 1_000 ? `${String(Math.round(value / 100) / 10)}s` : `${String(Math.round(value))}ms`;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
