import { describe, expect, it } from 'vitest';
import { planScreencast } from '@ui-atlas/animation';
import { AnimationVideoConfigSchema } from '@ui-atlas/config';
import { SCHEMA_VERSION, type AnimationRecord } from '@ui-atlas/protocol';

const config = (overrides: Record<string, unknown> = {}) =>
  AnimationVideoConfigSchema.parse(overrides);

const NOTHING_UNOBSERVABLE = { canvas2d: 0, webgl: 0, video: 0 };

let seq = 0;

function record(overrides: Partial<AnimationRecord> = {}): AnimationRecord {
  seq += 1;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `anim-${String(seq)}`,
    runId: 'run-1',
    url: 'https://example.test/page',
    routeKey: 'page',
    foundAt: '2026-08-11T00:00:00.000Z',
    framePath: [],
    kind: 'css-animation',
    index: 0,
    animationId: `css-animation-${String(seq)}`,
    animationName: 'pulse',
    playState: 'running',
    timeline: 'document',
    playbackRate: 1,
    delayMs: 0,
    endDelayMs: 0,
    iterationStart: 0,
    direction: 'normal',
    fill: 'none',
    easing: 'linear',
    offsets: [0, 1],
    properties: ['opacity'],
    sampleability: 'infinite',
    iterationDurationMs: 1_000,
    reasons: ['it repeats forever, so it has no 100% to sample at'],
    target: {
      tagName: 'div',
      testId: 'pulse',
      selectorHint: '[data-testid="pulse"]',
      boundingBox: { x: 0, y: 0, width: 10, height: 10 },
    },
    ...overrides,
  } as AnimationRecord;
}

describe('what a recording would be of', () => {
  it('records an infinite animation, for as many loops as fit', () => {
    const plan = planScreencast([record()], NOTHING_UNOBSERVABLE, config({ iterations: 3 }));
    expect(plan.record).toBe(true);
    expect(plan.durationMs).toBe(3_000);
    expect(plan.truncated).toBe(false);
    expect(plan.subjects[0]).toContain('pulse');
  });

  it('counts the delay as part of a loop', () => {
    const plan = planScreencast(
      [record({ delayMs: 200, iterationDurationMs: 800 })],
      NOTHING_UNOBSERVABLE,
      config({ iterations: 2 }),
    );
    expect(plan.durationMs).toBe(2_000);
  });

  it('says when the budget cut it short rather than pretending it did not', () => {
    const plan = planScreencast(
      [record({ iterationDurationMs: 4_000 })],
      NOTHING_UNOBSERVABLE,
      config({ iterations: 3, maxDurationMs: 5_000 }),
    );
    expect(plan.durationMs).toBe(5_000);
    expect(plan.truncated).toBe(true);
    expect(plan.limitations.join(' ')).toContain('3 loops');
    expect(plan.limitations.join(' ')).toContain('12s');
  });

  it('leaves out what can be sampled exactly', () => {
    const plan = planScreencast(
      [record({ sampleability: 'sampleable', reasons: ['a CSS animation over 1s'] })],
      NOTHING_UNOBSERVABLE,
      config(),
    );
    expect(plan.record).toBe(false);
    expect(plan.subjects).toEqual([]);
    expect(plan.excluded[0]?.reason).toContain('exact frames say more');
  });

  it('refuses to record a scroll-driven animation, because it would be a still', () => {
    // Nothing scrolls during a recording, so a scroll-driven animation does not
    // move — and a video of a motionless page looks exactly like a recording
    // that failed, which is worse than no recording at all.
    const plan = planScreencast(
      [record({ sampleability: 'scroll-driven', iterationDurationMs: undefined })],
      NOTHING_UNOBSERVABLE,
      config(),
    );
    expect(plan.record).toBe(false);
    expect(plan.excluded[0]?.reason).toContain('not scrolling');
  });

  it('leaves out an animation with no intermediate frames', () => {
    const plan = planScreencast(
      [record({ sampleability: 'instant' })],
      NOTHING_UNOBSERVABLE,
      config(),
    );
    expect(plan.record).toBe(false);
    expect(plan.excluded[0]?.reason).toContain('no intermediate frames');
  });

  it('records an animation whose duration is auto, for the whole budget', () => {
    // `indeterminate` means there is no number to reason about, so the honest
    // window is the whole budget rather than a made-up multiple of nothing.
    const plan = planScreencast(
      [record({ sampleability: 'indeterminate', iterationDurationMs: undefined })],
      NOTHING_UNOBSERVABLE,
      config({ maxDurationMs: 4_000 }),
    );
    expect(plan.record).toBe(true);
    expect(plan.durationMs).toBe(4_000);
    expect(plan.truncated).toBe(false);
  });

  it('records canvas, WebGL and video, which no animation list can describe', () => {
    const plan = planScreencast([], { canvas2d: 2, webgl: 1, video: 3 }, config({ maxDurationMs: 2_500 }));
    expect(plan.record).toBe(true);
    expect(plan.durationMs).toBe(2_500);
    expect(plan.subjects).toHaveLength(3);
    expect(plan.subjects.join(' ')).toContain('2 canvas element(s)');
    expect(plan.subjects.join(' ')).toContain('1 WebGL canvas element(s)');
    expect(plan.subjects.join(' ')).toContain('3 video element(s)');
  });

  it('gives the whole budget when anything in shot has no length at all', () => {
    // A one-second loop alongside a canvas does not mean three seconds is
    // enough: nothing says how long the canvas takes to do whatever it does.
    const plan = planScreencast([record()], { canvas2d: 1, webgl: 0, video: 0 }, config());
    expect(plan.durationMs).toBe(5_000);
  });

  it('never lets a recording pass as a sample', () => {
    const plan = planScreencast([record()], NOTHING_UNOBSERVABLE, config());
    expect(plan.limitations.join(' ')).toContain('not a deterministic sample');
    expect(plan.limitations.join(' ')).toContain('frame rate');
  });

  it('mentions the motion it deliberately left out', () => {
    const plan = planScreencast(
      [record(), record({ sampleability: 'scroll-driven' })],
      NOTHING_UNOBSERVABLE,
      config(),
    );
    expect(plan.record).toBe(true);
    expect(plan.limitations.join(' ')).toContain('1 other animation');
  });

  it('has nothing to say about a page with no motion', () => {
    const plan = planScreencast([], NOTHING_UNOBSERVABLE, config());
    expect(plan.record).toBe(false);
    expect(plan.durationMs).toBe(0);
    expect(plan.limitations).toEqual([]);
  });
});
