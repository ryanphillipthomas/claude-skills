import type { Frame, Page } from 'playwright';
import {
  SCHEMA_VERSION,
  type AnimationRecord,
  type FrameIdentity,
} from '@ui-atlas/protocol';
import { classifyAnimation } from './classify.js';
import {
  countUnobservableMotion,
  discoverAnimations,
  type DiscoveredAnimation,
  type UnobservableMotion,
} from './page-scripts.js';

export interface AnimationInventoryOptions {
  runId: string;
  routeKey: string;
  /** Describes a frame the way the rest of the tool does. */
  describeFrame?: ((frame: Frame) => Promise<FrameIdentity[]>) | undefined;
  /** Bound per document, so one pathological page cannot dominate a run. */
  maxPerFrame?: number | undefined;
  newId?: (() => string) | undefined;
}

export interface AnimationInventoryResult {
  animations: AnimationRecord[];
  /** Motion `getAnimations` cannot describe, summed across every frame. */
  unobservable: UnobservableMotion;
  warnings: string[];
}

const DEFAULT_MAX_PER_FRAME = 500;

/**
 * List every animation the Web Animations API can see, across every frame
 * Playwright can reach, and say of each whether it could be sampled honestly.
 *
 * It describes and nothing else. No animation is paused, seeked, cancelled or
 * has its playback rate touched, because an inventory that perturbed what it
 * was measuring would report a page that no longer exists. Sampling is a
 * separate step, and it is not built yet.
 */
export async function inventoryAnimations(
  page: Page,
  options: AnimationInventoryOptions,
): Promise<AnimationInventoryResult> {
  const animations: AnimationRecord[] = [];
  const warnings: string[] = [];
  const unobservable: UnobservableMotion = { canvas2d: 0, webgl: 0, video: 0 };
  const foundAt = new Date().toISOString();
  const maxPerFrame = options.maxPerFrame ?? DEFAULT_MAX_PER_FRAME;
  let counter = 0;

  // Every frame, not just same-origin ones: Playwright can evaluate inside a
  // cross-origin frame even though page script never could.
  for (const frame of page.frames()) {
    let discovered: DiscoveredAnimation[];
    let counts: UnobservableMotion;
    try {
      discovered = await frame.evaluate(discoverAnimations);
      counts = await frame.evaluate(countUnobservableMotion);
    } catch (error) {
      // A frame that navigated or detached mid-pass is a fact about the page,
      // not a reason to lose the frames that did answer.
      warnings.push(`could not inventory a frame (${frame.url()}): ${describe(error)}`);
      continue;
    }

    unobservable.canvas2d += counts.canvas2d;
    unobservable.webgl += counts.webgl;
    unobservable.video += counts.video;

    if (discovered.length > maxPerFrame) {
      warnings.push(
        `${frame.url()} has ${String(discovered.length)} animations; ` +
          `only the first ${String(maxPerFrame)} were recorded`,
      );
      discovered = discovered.slice(0, maxPerFrame);
    }

    const framePath = (await options.describeFrame?.(frame)) ?? [];

    for (const item of discovered) {
      const verdict = classifyAnimation(item);
      counter += 1;
      const record: AnimationRecord = {
        schemaVersion: SCHEMA_VERSION,
        id: options.newId?.() ?? `anim-${String(counter)}`,
        runId: options.runId,
        url: frame.url(),
        routeKey: options.routeKey,
        foundAt,
        framePath,
        kind: item.kind,
        index: item.index,
        animationId: item.id,
        playState: item.playState,
        timeline: item.timeline,
        playbackRate: item.playbackRate,
        delayMs: item.delayMs,
        endDelayMs: item.endDelayMs,
        iterationStart: item.iterationStart,
        direction: item.direction,
        fill: item.fill,
        easing: item.easing,
        offsets: item.offsets,
        properties: item.properties,
        sampleability: verdict.sampleability,
        reasons: verdict.reasons,
      };
      if (item.animationName !== undefined) record.animationName = item.animationName;
      if (item.transitionProperty !== undefined) {
        record.transitionProperty = item.transitionProperty;
      }
      // Absent rather than null: `auto` has no duration, and `Infinity` has no
      // iteration count. Writing a zero would be a lie with a number on it.
      if (item.durationMs !== null) record.durationMs = item.durationMs;
      if (item.iterations !== null) record.iterations = item.iterations;
      if (item.pseudoElement !== null) record.pseudoElement = item.pseudoElement;
      if (item.target !== null) record.target = item.target;
      if (verdict.iterationDurationMs !== undefined) {
        record.iterationDurationMs = verdict.iterationDurationMs;
      }
      if (verdict.activeDurationMs !== undefined) {
        record.activeDurationMs = verdict.activeDurationMs;
      }
      animations.push(record);
    }
  }

  for (const notice of describeUnobservable(unobservable)) warnings.push(notice);
  return { animations, unobservable, warnings };
}

/**
 * Turn the unobservable counts into something a person reads. Silence here
 * would imply the list is complete when it is not.
 */
export function describeUnobservable(counts: UnobservableMotion): string[] {
  const parts: string[] = [];
  if (counts.canvas2d > 0) parts.push(`${String(counts.canvas2d)} canvas element(s)`);
  if (counts.webgl > 0) parts.push(`${String(counts.webgl)} WebGL canvas element(s)`);
  if (counts.video > 0) parts.push(`${String(counts.video)} video element(s)`);
  if (parts.length === 0) return [];
  return [
    `this page contains ${parts.join(', ')}, whose motion the Web Animations API ` +
      'cannot describe; anything they animate is absent from this inventory',
  ];
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
