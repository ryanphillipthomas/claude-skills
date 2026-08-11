import type { AnimationSampleability } from '@ui-atlas/protocol';
import type { DiscoveredAnimation } from './page-scripts.js';

export interface Sampleability {
  sampleability: AnimationSampleability;
  /** Why, in the words that end up on the record. */
  reasons: string[];
  /**
   * One iteration's length, when there is a number to seek within. Absent for
   * anything not driven by time.
   */
  iterationDurationMs?: number;
  /** Delay + iterations × duration + endDelay, when all of them are known. */
  activeDurationMs?: number;
}

/**
 * Decide whether an animation can be sampled at a chosen point and produce the
 * same frame every time.
 *
 * This is the whole purpose of the inventory. Sampling motion that cannot be
 * sampled deterministically produces a screenshot of *a* moment while implying
 * it is *the* moment at 50%, which is exactly the kind of quiet dishonesty the
 * rest of this tool avoids. Everything that cannot be sampled is named, with
 * the reason, rather than being left out of the list or sampled anyway.
 */
export function classifyAnimation(animation: DiscoveredAnimation): Sampleability {
  const reasons: string[] = [];

  // Scroll and view timelines advance with the scroll position, not the clock.
  // No `currentTime` seek reproduces a frame; reaching one means scrolling to
  // it, which is a different feature.
  if (animation.timeline === 'scroll' || animation.timeline === 'view') {
    reasons.push(`driven by a ${animation.timeline} timeline, which advances with scrolling`);
    return { sampleability: 'scroll-driven', reasons };
  }

  if (animation.durationMs === null) {
    reasons.push('its duration is `auto`, so there is no length to sample within');
    return { sampleability: 'indeterminate', reasons };
  }

  if (animation.durationMs <= 0) {
    reasons.push('it has zero duration, so there are no intermediate frames');
    return { sampleability: 'instant', reasons };
  }

  const iterationDurationMs = animation.durationMs;

  // `iterations: null` is how the page script reports `Infinity`, which does
  // not survive serialisation.
  if (animation.iterations === null) {
    reasons.push('it repeats forever, so it has no 100% to sample at');
    return { sampleability: 'infinite', reasons, iterationDurationMs };
  }

  if (animation.iterations <= 0) {
    reasons.push('it runs for zero iterations');
    return { sampleability: 'instant', reasons, iterationDurationMs };
  }

  if (animation.timeline === 'unknown') {
    reasons.push('its timeline could not be identified');
    return { sampleability: 'indeterminate', reasons, iterationDurationMs };
  }

  const activeDurationMs =
    animation.delayMs + animation.durationMs * animation.iterations + animation.endDelayMs;

  reasons.push(
    `${describeKind(animation)} over ${formatMs(animation.durationMs)}` +
      (animation.iterations === 1 ? '' : ` × ${String(animation.iterations)} iterations`),
  );
  if (animation.playbackRate !== 1) {
    reasons.push(`its playback rate is ${String(animation.playbackRate)}`);
  }

  return { sampleability: 'sampleable', reasons, iterationDurationMs, activeDurationMs };
}

function describeKind(animation: DiscoveredAnimation): string {
  switch (animation.kind) {
    case 'css-animation':
      return `a CSS animation (${animation.animationName ?? 'unnamed'})`;
    case 'css-transition':
      return `a CSS transition on ${animation.transitionProperty ?? 'an unknown property'}`;
    default:
      return 'a Web Animations API animation';
  }
}

function formatMs(value: number): string {
  return value >= 1_000 ? `${String(Math.round(value / 100) / 10)}s` : `${String(Math.round(value))}ms`;
}

export interface AnimationSummary {
  total: number;
  byKind: Record<DiscoveredAnimation['kind'], number>;
  bySampleability: Record<AnimationSampleability, number>;
  /** How many are running right now, as opposed to idle, paused or finished. */
  running: number;
}

export function summariseAnimations(
  records: Array<{
    kind: DiscoveredAnimation['kind'];
    sampleability: AnimationSampleability;
    playState: string;
  }>,
): AnimationSummary {
  const byKind: AnimationSummary['byKind'] = {
    'css-animation': 0,
    'css-transition': 0,
    'web-animation': 0,
  };
  const bySampleability: AnimationSummary['bySampleability'] = {
    sampleable: 0,
    infinite: 0,
    'scroll-driven': 0,
    indeterminate: 0,
    instant: 0,
  };
  let running = 0;

  for (const record of records) {
    byKind[record.kind] += 1;
    bySampleability[record.sampleability] += 1;
    if (record.playState === 'running') running += 1;
  }

  return { total: records.length, byKind, bySampleability, running };
}
