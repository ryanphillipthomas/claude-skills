import { describe, expect, it } from 'vitest';
import {
  formatElapsed,
  initialState,
  reduceAll,
  STAGE_ORDER,
  view,
  type LauncherEvent,
  type LauncherState,
} from '../../apps/launcher/src/startup.js';

const T0 = 1_000_000;

function started(buildNeeded = true): LauncherEvent[] {
  return [{ kind: 'start', at: T0, buildNeeded }];
}

/** Walks a launch as far as the browser stage, without finishing it. */
function midFlight(): LauncherState {
  return reduceAll([
    ...started(true),
    { kind: 'stage-began', at: T0, stage: 'build' },
    { kind: 'stage-done', at: T0 + 14_200, stage: 'build' },
    { kind: 'stage-began', at: T0 + 14_200, stage: 'engine' },
    { kind: 'stage-note', stage: 'engine', note: 'run a1b2c3' },
  ]);
}

describe('the cold card', () => {
  it('says nothing is running, and offers one button', () => {
    const model = view(initialState(), T0);
    expect(model.phase).toBe('cold');
    expect(model.title).toBe('Engine stopped');
    expect(model.subtitle).toBe('Nothing is running');
    expect(model.primary).toEqual({ label: 'Start', action: 'start' });
    expect(model.headerAction).toBeUndefined();
  });

  it('lists the two commands and the thing neither of them proved, in order', () => {
    const model = view(initialState(), T0);
    expect(model.stages.map((stage) => stage.title)).toEqual([
      'Build packages',
      'Start capture engine',
      'Open browser with panel',
    ]);
    expect(model.stages.every((stage) => stage.status === 'pending')).toBe(true);
  });

  it('only promises the slow first run when a build is actually needed', () => {
    const needed = view(reduceAll([{ kind: 'build-checked', buildNeeded: true }]), T0);
    expect(needed.footnote).toBe('Takes about 40 seconds the first time');
    expect(needed.stages[0]?.note).toBe('first run only');

    const notNeeded = view(reduceAll([{ kind: 'build-checked', buildNeeded: false }]), T0);
    expect(notNeeded.footnote).toBe('Everything is built; this takes a few seconds');
    expect(notNeeded.stages[0]?.note).toBeUndefined();
  });

  it('answers that question before Start is pressed, not after', () => {
    // Regression: `buildNeeded` used to arrive only with `start`, so the cold
    // card promised a 40-second first run every time, forever.
    const checked = reduceAll([{ kind: 'build-checked', buildNeeded: false }]);
    expect(checked.phase).toBe('cold');
    expect(checked.buildNeeded).toBe(false);
  });

  it('ignores a build check that lands mid-launch', () => {
    const state = reduceAll([
      ...started(true),
      { kind: 'stage-began', at: T0, stage: 'build' },
      { kind: 'build-checked', buildNeeded: false },
    ]);
    expect(state.buildNeeded).toBe(true);
    expect(state.stages.build.status).toBe('running');
  });
});

describe('the starting card', () => {
  it('counts the step it is on, not the ones it has finished', () => {
    const model = view(midFlight(), T0 + 15_000);
    expect(model.title).toBe('Starting engine…');
    expect(model.subtitle).toBe('Step 2 of 3');
  });

  it('shows how long a finished stage took, and what a running one is doing', () => {
    const model = view(midFlight(), T0 + 15_000);
    expect(model.stages[0]?.note).toBe('14.2s');
    expect(model.stages[0]?.status).toBe('done');
    expect(model.stages[1]?.note).toBe('run a1b2c3');
    expect(model.stages[2]?.note).toBeUndefined();
  });

  it('offers Cancel rather than a second Start', () => {
    const model = view(midFlight(), T0);
    expect(model.primary).toBeUndefined();
    expect(model.headerAction).toEqual({ label: 'Cancel', action: 'cancel' });
    expect(model.showLog).toBe(true);
  });

  it('never fills the bar before the last stage finishes', () => {
    const model = view(midFlight(), T0);
    expect(model.progress).toBeGreaterThan(0);
    expect(model.progress).toBeLessThan(1);
  });

  it('counts a skipped build as done, so a fast launch still starts at step 2', () => {
    const state = reduceAll([
      ...started(false),
      { kind: 'stage-skipped', at: T0, stage: 'build' },
      { kind: 'stage-began', at: T0, stage: 'engine' },
    ]);
    expect(view(state, T0).subtitle).toBe('Step 2 of 3');
    expect(view(state, T0).stages[0]?.note).toBe('already built');
  });
});

describe('the sign-in step', () => {
  const prompt = {
    host: 'acme.com',
    profile: 'acme',
    verdict: 'signed-out',
    evidence: ['redirected to https://acme.com/login'],
  } as const;

  it('stops the sequence rather than layering over it', () => {
    const state = reduceAll([...started(false), { kind: 'sign-in-required', prompt }]);
    const model = view(state, T0);
    expect(model.phase).toBe('signin');
    expect(model.title).toBe('Page is signed out');
    expect(model.subtitle).toBe('Engine running · saved session expired');
    expect(model.primary).toEqual({ label: 'Sign in…', action: 'sign-in' });
  });

  it('says which failure it is, because the two need opposite answers', () => {
    const challenged = reduceAll([
      ...started(false),
      { kind: 'sign-in-required', prompt: { ...prompt, verdict: 'challenged' } },
    ]);
    expect(view(challenged, T0).subtitle).toBe('Engine running · acme.com is refusing the browser');

    const unclear = reduceAll([
      ...started(false),
      { kind: 'sign-in-required', prompt: { ...prompt, verdict: 'unclear' } },
    ]);
    expect(view(unclear, T0).subtitle).toBe('Engine running · saved session is unreadable');
  });

  it('resumes where it stopped when the card is answered', () => {
    const state = reduceAll([
      ...started(false),
      { kind: 'sign-in-required', prompt },
      { kind: 'sign-in-cleared' },
    ]);
    expect(state.phase).toBe('starting');
    expect(state.signIn).toBeUndefined();
  });

  it('does not dismiss itself when the panel reports in behind the card', () => {
    // Regression: the sign-in check prints its verdict during navigation, a
    // moment before the overlay mounts. Letting `ready` win meant the card
    // appeared and then vanished on its own about a second later.
    const state = reduceAll([
      ...started(false),
      { kind: 'sign-in-required', prompt },
      { kind: 'stage-done', at: T0 + 500, stage: 'browser' },
      { kind: 'ready', at: T0 + 500 },
    ]);
    expect(state.phase).toBe('signin');
    expect(state.signIn).toEqual(prompt);
  });

  it('lands on running when the card is answered after the browser opened', () => {
    const state = reduceAll([
      ...started(false),
      { kind: 'sign-in-required', prompt },
      { kind: 'stage-done', at: T0 + 500, stage: 'browser' },
      { kind: 'ready', at: T0 + 500 },
      { kind: 'sign-in-cleared' },
    ]);
    expect(state.phase).toBe('running');
  });
});

describe('the running card', () => {
  it('reports the engine it used and how much has been done today', () => {
    const state = reduceAll([...started(false), { kind: 'ready', at: T0 }]);
    const model = view(state, T0, { engineLabel: 'Chromium 141', runsToday: 4 });
    expect(model.title).toBe('Engine running');
    expect(model.subtitle).toBe('Chromium 141 · 4 runs today');
    expect(model.headerAction).toEqual({ label: 'Stop', action: 'stop' });
    expect(model.progress).toBeUndefined();
  });

  it('drops the engine name rather than inventing one', () => {
    const state = reduceAll([...started(false), { kind: 'ready', at: T0 }]);
    expect(view(state, T0, { engineLabel: undefined, runsToday: 1 }).subtitle).toBe('1 run today');
  });
});

describe('failure and reset', () => {
  it('names the stage that failed and offers to try again', () => {
    const state = reduceAll([
      ...started(true),
      { kind: 'stage-began', at: T0, stage: 'build' },
      { kind: 'failed', at: T0 + 900, stage: 'build', message: 'typescript exited with code 2' },
    ]);
    const model = view(state, T0 + 900);
    expect(model.title).toBe('Build packages failed');
    expect(model.subtitle).toBe('typescript exited with code 2');
    expect(model.primary).toEqual({ label: 'Try again', action: 'retry' });
    expect(model.stages[0]?.status).toBe('failed');
    expect(model.showLog).toBe(true);
  });

  it('returns to cold on stop, so the next launch is not half-finished', () => {
    const state = reduceAll([
      ...started(true),
      { kind: 'stage-began', at: T0, stage: 'build' },
      { kind: 'stage-done', at: T0 + 5, stage: 'build' },
      { kind: 'ready', at: T0 + 10 },
      { kind: 'stopped', at: T0 + 20 },
    ]);
    expect(state).toEqual(initialState());
    for (const id of STAGE_ORDER) expect(state.stages[id].status).toBe('pending');
  });
});

describe('formatElapsed', () => {
  it('reads as a stopwatch, never as milliseconds', () => {
    expect(formatElapsed(14_200)).toBe('14.2s');
    expect(formatElapsed(900)).toBe('0.9s');
    expect(formatElapsed(64_000)).toBe('1m 04s');
  });

  it('never shows a negative time when clocks disagree', () => {
    expect(formatElapsed(-500)).toBe('0.0s');
  });
});
