import { describe, expect, it } from 'vitest';
import {
  classifyAnimation,
  describeUnobservable,
  summariseAnimations,
  type DiscoveredAnimation,
} from '@ui-atlas/animation';

function animation(overrides: Partial<DiscoveredAnimation> = {}): DiscoveredAnimation {
  return {
    id: 'a1',
    kind: 'css-animation',
    animationName: 'drift',
    transitionProperty: undefined,
    playState: 'running',
    timeline: 'document',
    playbackRate: 1,
    durationMs: 1_200,
    delayMs: 0,
    endDelayMs: 0,
    iterations: 1,
    iterationStart: 0,
    direction: 'normal',
    fill: 'forwards',
    easing: 'ease-in-out',
    offsets: [0, 1],
    properties: ['transform'],
    pseudoElement: null,
    target: null,
    ...overrides,
  };
}

describe('classifying an animation', () => {
  it('calls a finite, time-driven animation sampleable', () => {
    const verdict = classifyAnimation(animation());
    expect(verdict.sampleability).toBe('sampleable');
    expect(verdict.iterationDurationMs).toBe(1_200);
    expect(verdict.activeDurationMs).toBe(1_200);
    expect(verdict.reasons[0]).toContain('drift');
  });

  it('adds delays into the active duration', () => {
    const verdict = classifyAnimation(
      animation({ delayMs: 100, endDelayMs: 50, iterations: 3, durationMs: 200 }),
    );
    expect(verdict.activeDurationMs).toBe(100 + 200 * 3 + 50);
    expect(verdict.iterationDurationMs).toBe(200);
  });

  it('refuses to call an infinite animation sampleable', () => {
    // `null` iterations is how the page reports Infinity, which does not
    // survive serialisation.
    const verdict = classifyAnimation(animation({ iterations: null }));
    expect(verdict.sampleability).toBe('infinite');
    expect(verdict.reasons[0]).toContain('no 100%');
    // There is still an iteration length, even though there is no end.
    expect(verdict.iterationDurationMs).toBe(1_200);
    expect(verdict.activeDurationMs).toBeUndefined();
  });

  it('refuses a scroll- or view-driven animation, whatever its duration says', () => {
    for (const timeline of ['scroll', 'view'] as const) {
      const verdict = classifyAnimation(animation({ timeline }));
      expect(verdict.sampleability).toBe('scroll-driven');
      expect(verdict.reasons[0]).toContain('scrolling');
      // Not even an iteration length: no currentTime seek reaches a frame.
      expect(verdict.iterationDurationMs).toBeUndefined();
    }
  });

  it('puts the scroll verdict ahead of every other signal', () => {
    // A scroll-driven animation that is also infinite is still scroll-driven:
    // the reason it cannot be sampled is the timeline, not the repetition.
    const verdict = classifyAnimation(animation({ timeline: 'scroll', iterations: null }));
    expect(verdict.sampleability).toBe('scroll-driven');
  });

  it('calls an auto duration indeterminate rather than guessing one', () => {
    const verdict = classifyAnimation(animation({ durationMs: null }));
    expect(verdict.sampleability).toBe('indeterminate');
    expect(verdict.reasons[0]).toContain('auto');
  });

  it('calls an unidentifiable timeline indeterminate', () => {
    expect(classifyAnimation(animation({ timeline: 'unknown' })).sampleability).toBe(
      'indeterminate',
    );
  });

  it('calls a zero-length animation instant', () => {
    expect(classifyAnimation(animation({ durationMs: 0 })).sampleability).toBe('instant');
    expect(classifyAnimation(animation({ iterations: 0 })).sampleability).toBe('instant');
  });

  it('mentions a playback rate that is not 1, since it changes what a seek means', () => {
    const verdict = classifyAnimation(animation({ playbackRate: 2 }));
    expect(verdict.sampleability).toBe('sampleable');
    expect(verdict.reasons.some((reason) => reason.includes('playback rate'))).toBe(true);
  });

  it('names the kind it is describing', () => {
    expect(classifyAnimation(animation()).reasons[0]).toContain('CSS animation');
    expect(
      classifyAnimation(
        animation({ kind: 'css-transition', animationName: undefined, transitionProperty: 'transform' }),
      ).reasons[0],
    ).toContain('transition on transform');
    expect(
      classifyAnimation(animation({ kind: 'web-animation', animationName: undefined })).reasons[0],
    ).toContain('Web Animations API');
  });
});

describe('summarising an inventory', () => {
  it('counts by kind, by sampleability and by what is running', () => {
    const summary = summariseAnimations([
      { kind: 'css-animation', sampleability: 'sampleable', playState: 'running' },
      { kind: 'css-animation', sampleability: 'infinite', playState: 'running' },
      { kind: 'css-transition', sampleability: 'sampleable', playState: 'finished' },
      { kind: 'web-animation', sampleability: 'scroll-driven', playState: 'idle' },
    ]);
    expect(summary.total).toBe(4);
    expect(summary.running).toBe(2);
    expect(summary.byKind).toEqual({
      'css-animation': 2,
      'css-transition': 1,
      'web-animation': 1,
    });
    expect(summary.bySampleability).toEqual({
      sampleable: 2,
      infinite: 1,
      'scroll-driven': 1,
      indeterminate: 0,
      instant: 0,
    });
  });

  it('reports zeroes rather than omitting empty buckets', () => {
    const summary = summariseAnimations([]);
    expect(summary.total).toBe(0);
    expect(Object.values(summary.bySampleability).every((count) => count === 0)).toBe(true);
  });
});

describe('motion the Web Animations API cannot see', () => {
  it('says nothing when there is nothing to say', () => {
    expect(describeUnobservable({ canvas2d: 0, webgl: 0, video: 0 })).toEqual([]);
  });

  it('names what it found, so the list is not read as complete', () => {
    const [notice] = describeUnobservable({ canvas2d: 2, webgl: 1, video: 3 });
    expect(notice).toContain('2 canvas element(s)');
    expect(notice).toContain('1 WebGL canvas element(s)');
    expect(notice).toContain('3 video element(s)');
    expect(notice).toContain('absent from this inventory');
  });
});
