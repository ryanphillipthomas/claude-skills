import { describe, expect, it } from 'vitest';
import { fingerprintAnimation, groupByFrame, newAnimations } from '@ui-atlas/animation';
import { SCHEMA_VERSION, type AnimationRecord } from '@ui-atlas/protocol';

let seq = 0;

/** An animation record with only the fields the diff actually looks at. */
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
    kind: 'css-transition',
    index: 0,
    animationId: `css-transition-${String(seq)}`,
    playState: 'running',
    timeline: 'document',
    playbackRate: 1,
    delayMs: 0,
    endDelayMs: 0,
    iterationStart: 0,
    direction: 'normal',
    fill: 'backwards',
    easing: 'linear',
    offsets: [0, 1],
    properties: ['transform'],
    sampleability: 'sampleable',
    reasons: ['a CSS transition on transform over 600ms'],
    transitionProperty: 'transform',
    target: {
      tagName: 'div',
      testId: 'swatch',
      selectorHint: '[data-testid="swatch"]',
      boundingBox: { x: 0, y: 0, width: 10, height: 10 },
    },
    ...overrides,
  } as AnimationRecord;
}

describe('which animations an interaction started', () => {
  it('ignores the index, because provoking one shifts the others', () => {
    // The same animation, seen at position 0 before a hover and position 2
    // after it: `getAnimations()` is in composite order, so inserting a
    // transition moves everything after it along.
    const before = [record({ index: 0, animationName: 'drift', transitionProperty: undefined })];
    const after = [
      record({ index: 2, animationName: 'drift', transitionProperty: undefined }),
      record({ index: 0, transitionProperty: 'transform' }),
    ];

    const appeared = newAnimations(before, after);
    expect(appeared).toHaveLength(1);
    expect(appeared[0]?.transitionProperty).toBe('transform');
  });

  it('treats the animation id as no identity at all', () => {
    // `animationId` falls back to a position-derived label whenever the page
    // did not set `Animation.id`, which is nearly always. Two records of the
    // same animation with different labels are still the same animation.
    const before = [record({ animationId: 'css-transition-0' })];
    const after = [record({ animationId: 'css-transition-4' })];
    expect(newAnimations(before, after)).toEqual([]);
  });

  it('counts duplicates rather than collapsing them', () => {
    // A row of identical cards is ordinary. If one was already animating and
    // the hover started a second, exactly one is new — not zero, and not two.
    const before = [record()];
    const after = [record(), record()];
    expect(newAnimations(before, after)).toHaveLength(1);
  });

  it('separates animations that only differ by the element they run on', () => {
    const target = (testId: string): AnimationRecord['target'] => ({
      tagName: 'div',
      testId,
      selectorHint: `[data-testid="${testId}"]`,
      boundingBox: { x: 0, y: 0, width: 10, height: 10 },
    });
    const before = [record({ target: target('one') })];
    const after = [record({ target: target('one') }), record({ target: target('two') })];

    const appeared = newAnimations(before, after);
    expect(appeared).toHaveLength(1);
    expect(appeared[0]?.target?.testId).toBe('two');
  });

  it('separates the two properties one hover transitions', () => {
    const before: AnimationRecord[] = [];
    const after = [
      record({ transitionProperty: 'transform' }),
      record({ transitionProperty: 'background-color' }),
    ];
    expect(newAnimations(before, after).map((item) => item.transitionProperty)).toEqual([
      'transform',
      'background-color',
    ]);
  });

  it('is unbothered by an animation that finished in between', () => {
    // A finite animation can end and leave `getAnimations()` between the two
    // passes. It is absent from `after`, which says nothing about what
    // appeared.
    const before = [record({ animationName: 'drift', transitionProperty: undefined }), record()];
    const after = [record()];
    expect(newAnimations(before, after)).toEqual([]);
  });

  it('does not see a re-run of an animation that was already there', () => {
    // A documented limitation: restarting an existing animation looks
    // identical to leaving it alone.
    const before = [record()];
    const after = [record()];
    expect(newAnimations(before, after)).toEqual([]);
  });

  it('distinguishes a transition from an animation of the same name', () => {
    const asTransition = record({ transitionProperty: 'opacity', animationName: undefined });
    const asAnimation = record({
      kind: 'css-animation',
      animationName: 'opacity',
      transitionProperty: undefined,
    });
    expect(fingerprintAnimation(asTransition)).not.toBe(fingerprintAnimation(asAnimation));
  });

  it('keeps documents apart, because they do not share a clock', () => {
    const groups = groupByFrame([
      record({ url: 'https://example.test/page' }),
      record({ url: 'https://example.test/frame' }),
      record({ url: 'https://example.test/page' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.members).toHaveLength(2);
    expect(groups[1]?.url).toBe('https://example.test/frame');
  });

  it('does not treat the same animation in two frames as one', () => {
    const before = [record({ url: 'https://example.test/page' })];
    const after = [
      record({ url: 'https://example.test/page' }),
      record({ url: 'https://example.test/frame' }),
    ];
    expect(newAnimations(before, after)).toHaveLength(1);
  });
});
