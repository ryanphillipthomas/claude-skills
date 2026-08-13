/**
 * Startup, staged.
 *
 * The thing this replaces is two terminal windows: `npm run build` in one,
 * `ui-atlas inspect <url>` in the other, and no way to tell from either of them
 * whether the third thing — a browser with the panel actually mounted in it —
 * ever happened. Those become three rows with a status each, and the launcher
 * owns the lifecycle.
 *
 * Everything here is pure. The reducer takes an event with a timestamp on it
 * rather than reading a clock, and the view takes `now` as an argument, so the
 * whole of the launcher's behaviour can be tested without spawning a process or
 * opening a window. The Electron side does no deciding; it renders `view()` and
 * sends actions back.
 */

import { signInTitle, type SignInPrompt } from './signin.js';

export type { SignInPrompt };

export type StageId = 'build' | 'engine' | 'browser';

/** Fixed order, because it is a sequence and not a set. */
export const STAGE_ORDER: readonly StageId[] = ['build', 'engine', 'browser'];

export const STAGE_TITLES: Readonly<Record<StageId, string>> = {
  build: 'Build packages',
  engine: 'Start capture engine',
  browser: 'Open browser with panel',
};

/**
 * What the third stage is depends on what was asked for. `inspect` opens a
 * window you then work in; `capture` and `crawl` are one-shot and finish by
 * themselves. Calling all three "Open browser with panel" would be wrong for
 * two of them — the extension's Page and Whole-site modes never mount a panel.
 */
export type RunMode = 'inspect' | 'capture' | 'crawl';

export const FINAL_STAGE_TITLES: Readonly<Record<RunMode, string>> = {
  inspect: 'Open browser with panel',
  capture: 'Capture this page',
  crawl: 'Crawl this site',
};

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

/**
 * `signin` is a phase and not a modal on top of `starting`, because it stops
 * the sequence: nothing further should open until it is answered one way or the
 * other. A window that opens behind a question is how the old flow produced
 * fifty screenshots of a login wall.
 */
export type LauncherPhase = 'cold' | 'starting' | 'signin' | 'running' | 'failed';

export type LauncherAction =
  | 'start'
  | 'cancel'
  | 'stop'
  | 'sign-in'
  | 'capture-anyway'
  | 'choose-profile'
  | 'retry'
  | 'show-log';

export interface StageState {
  status: StageStatus;
  startedAt: number | undefined;
  finishedAt: number | undefined;
  /** The right-hand chip: `run 04`, `port 7333`, `first run only`. */
  note: string | undefined;
}

export interface LauncherState {
  phase: LauncherPhase;
  stages: Readonly<Record<StageId, StageState>>;
  /** False once the build output is found to be present already. */
  buildNeeded: boolean;
  /** Which command this launch is running; names the third stage. */
  mode: RunMode;
  signIn: SignInPrompt | undefined;
  failure: { stage: StageId; message: string } | undefined;
}

export type LauncherEvent =
  /**
   * The build was inspected without launching anything. This exists so the
   * cold card can be honest *before* you press Start: `buildNeeded` is
   * otherwise only learned at launch, and the card would promise "about 40
   * seconds the first time" on every run forever.
   */
  | { kind: 'build-checked'; buildNeeded: boolean }
  | { kind: 'start'; at: number; buildNeeded: boolean; mode?: RunMode }
  | { kind: 'stage-began'; at: number; stage: StageId }
  | { kind: 'stage-note'; stage: StageId; note: string }
  | { kind: 'stage-done'; at: number; stage: StageId }
  | { kind: 'stage-skipped'; at: number; stage: StageId }
  | { kind: 'sign-in-required'; prompt: SignInPrompt }
  | { kind: 'sign-in-cleared' }
  | { kind: 'ready'; at: number }
  | { kind: 'failed'; at: number; stage: StageId; message: string }
  | { kind: 'cancelled'; at: number }
  | { kind: 'stopped'; at: number };

function idle(): StageState {
  return { status: 'pending', startedAt: undefined, finishedAt: undefined, note: undefined };
}

export function initialState(): LauncherState {
  return {
    phase: 'cold',
    stages: { build: idle(), engine: idle(), browser: idle() },
    // Assumed true until a `start` event says otherwise, so the cold card never
    // promises a fast launch it cannot deliver.
    buildNeeded: true,
    mode: 'inspect',
    signIn: undefined,
    failure: undefined,
  };
}

function withStage(
  state: LauncherState,
  stage: StageId,
  patch: Partial<StageState>,
): Readonly<Record<StageId, StageState>> {
  return { ...state.stages, [stage]: { ...state.stages[stage], ...patch } };
}

export function reduce(state: LauncherState, event: LauncherEvent): LauncherState {
  switch (event.kind) {
    case 'build-checked':
      // Only meaningful while nothing is in flight; a launch already knows.
      return state.phase === 'cold' ? { ...state, buildNeeded: event.buildNeeded } : state;

    case 'start':
      return {
        ...initialState(),
        phase: 'starting',
        buildNeeded: event.buildNeeded,
        mode: event.mode ?? 'inspect',
      };

    case 'stage-began':
      return {
        ...state,
        stages: withStage(state, event.stage, {
          status: 'running',
          startedAt: event.at,
          finishedAt: undefined,
        }),
      };

    case 'stage-note':
      return { ...state, stages: withStage(state, event.stage, { note: event.note }) };

    case 'stage-done':
      return {
        ...state,
        stages: withStage(state, event.stage, { status: 'done', finishedAt: event.at }),
      };

    case 'stage-skipped':
      return {
        ...state,
        stages: withStage(state, event.stage, {
          status: 'skipped',
          startedAt: event.at,
          finishedAt: event.at,
        }),
      };

    case 'sign-in-required':
      return { ...state, phase: 'signin', signIn: event.prompt };

    case 'sign-in-cleared':
      // Back to whatever the stages say. The browser usually finished opening
      // while the card was up, so answering it lands straight on `running`.
      return {
        ...state,
        phase: state.stages.browser.status === 'done' ? 'running' : 'starting',
        signIn: undefined,
      };

    case 'ready':
      // A pending question outranks progress. The panel reports in a moment
      // after the sign-in check prints its verdict, and without this the card
      // would dismiss itself a second after appearing.
      if (state.phase === 'signin') return { ...state, failure: undefined };
      return { ...state, phase: 'running', signIn: undefined, failure: undefined };

    case 'failed':
      return {
        ...state,
        phase: 'failed',
        stages: withStage(state, event.stage, { status: 'failed', finishedAt: event.at }),
        failure: { stage: event.stage, message: event.message },
      };

    case 'cancelled':
    case 'stopped':
      return initialState();
  }
}

/** Fold a whole event list, so a test can state a scenario as data. */
export function reduceAll(events: readonly LauncherEvent[], from = initialState()): LauncherState {
  return events.reduce(reduce, from);
}

// --- View --------------------------------------------------------------------

export interface StageRow {
  id: StageId;
  title: string;
  status: StageStatus;
  /** Right-hand chip; already formatted, including elapsed time. */
  note: string | undefined;
}

export interface LauncherButton {
  label: string;
  action: LauncherAction;
}

export type LauncherTone = 'idle' | 'busy' | 'ok' | 'warn' | 'error';

export interface LauncherView {
  phase: LauncherPhase;
  title: string;
  subtitle: string;
  tone: LauncherTone;
  stages: StageRow[];
  /** 0–1 for the hairline bar under the header; absent when there is no bar. */
  progress: number | undefined;
  primary: LauncherButton | undefined;
  /** The small control in the header row: Stop while running, Cancel while starting. */
  headerAction: LauncherButton | undefined;
  footnote: string | undefined;
  /** The `› Show log` disclosure, which only earns its place mid-flight. */
  showLog: boolean;
}

export interface ViewFacts {
  /** `Chromium 141`, when the bundled browser's version could be read. */
  engineLabel: string | undefined;
  /** Runs recorded under the artifact root since midnight. */
  runsToday: number;
}

const NO_FACTS: ViewFacts = { engineLabel: undefined, runsToday: 0 };

export function view(state: LauncherState, now: number, facts: ViewFacts = NO_FACTS): LauncherView {
  const stages = STAGE_ORDER.map((id) => stageRow(state, id, now));
  const base = { phase: state.phase, stages } as const;

  switch (state.phase) {
    case 'cold':
      return {
        ...base,
        title: 'Engine stopped',
        subtitle: 'Nothing is running',
        tone: 'idle',
        progress: undefined,
        primary: { label: 'Start', action: 'start' },
        headerAction: undefined,
        footnote: state.buildNeeded
          ? 'Takes about 40 seconds the first time'
          : 'Everything is built; this takes a few seconds',
        showLog: false,
      };

    case 'starting': {
      const position = currentStep(state);
      return {
        ...base,
        title: 'Starting engine…',
        subtitle: `Step ${String(position)} of ${String(STAGE_ORDER.length)}`,
        tone: 'busy',
        progress: progressOf(state),
        primary: undefined,
        headerAction: { label: 'Cancel', action: 'cancel' },
        footnote: undefined,
        showLog: true,
      };
    }

    case 'signin':
      // The stage rows stay on screen underneath, so it is clear the sequence is
      // paused rather than abandoned.
      return {
        ...base,
        title: signInTitle(state.signIn),
        subtitle: signInSubtitle(state.signIn),
        tone: 'warn',
        progress: progressOf(state),
        primary: { label: 'Sign in…', action: 'sign-in' },
        headerAction: { label: 'Cancel', action: 'cancel' },
        footnote: undefined,
        showLog: true,
      };

    case 'running':
      return {
        ...base,
        title: 'Engine running',
        subtitle: runningSubtitle(facts),
        tone: 'ok',
        progress: undefined,
        primary: undefined,
        headerAction: { label: 'Stop', action: 'stop' },
        footnote: undefined,
        showLog: false,
      };

    case 'failed':
      return {
        ...base,
        title: failureTitle(state),
        subtitle: state.failure?.message ?? 'Startup stopped',
        tone: 'error',
        progress: undefined,
        primary: { label: 'Try again', action: 'retry' },
        headerAction: undefined,
        footnote: undefined,
        showLog: true,
      };
  }
}

function stageRow(state: LauncherState, id: StageId, now: number): StageRow {
  const stage = state.stages[id];
  const title = id === 'browser' ? FINAL_STAGE_TITLES[state.mode] : STAGE_TITLES[id];
  return { id, title, status: stage.status, note: stageNote(state, id, now) };
}

/**
 * The chip on the right of a row. A finished stage shows how long it took, a
 * running one shows whatever the process told us about itself, and the build
 * row explains — before it runs — why it is usually not going to.
 */
function stageNote(state: LauncherState, id: StageId, now: number): string | undefined {
  const stage = state.stages[id];
  if (stage.status === 'skipped') return 'already built';
  if (stage.status === 'pending') {
    return id === 'build' && state.buildNeeded ? 'first run only' : undefined;
  }
  if (stage.status === 'done' && stage.startedAt !== undefined && stage.finishedAt !== undefined) {
    return formatElapsed(stage.finishedAt - stage.startedAt);
  }
  if (stage.status === 'running') {
    if (stage.note !== undefined) return stage.note;
    return stage.startedAt === undefined ? undefined : formatElapsed(now - stage.startedAt);
  }
  return stage.note;
}

/** `14.2s` up to a minute, then `1m 04s`. Never a bare millisecond count. */
export function formatElapsed(ms: number): string {
  const safe = Math.max(0, ms);
  if (safe < 60_000) return `${(safe / 1000).toFixed(1)}s`;
  const minutes = Math.floor(safe / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  return `${String(minutes)}m ${String(seconds).padStart(2, '0')}s`;
}

/** 1-based position of the stage being worked on, for `Step 2 of 3`. */
function currentStep(state: LauncherState): number {
  const running = STAGE_ORDER.findIndex((id) => state.stages[id].status === 'running');
  if (running !== -1) return running + 1;
  const settled = STAGE_ORDER.filter((id) => isSettled(state.stages[id].status)).length;
  return Math.min(settled + 1, STAGE_ORDER.length);
}

function isSettled(status: StageStatus): boolean {
  return status === 'done' || status === 'skipped';
}

/**
 * A running stage counts as half. The bar is honest about being an estimate —
 * it never reaches 1 before the last stage actually finishes.
 */
function progressOf(state: LauncherState): number {
  let done = 0;
  for (const id of STAGE_ORDER) {
    const status = state.stages[id].status;
    if (isSettled(status)) done += 1;
    else if (status === 'running') done += 0.5;
  }
  return done / STAGE_ORDER.length;
}

function signInSubtitle(prompt: SignInPrompt | undefined): string {
  if (prompt === undefined) return 'Engine running · sign-in needed';
  if (prompt.verdict === 'challenged') return `Engine running · ${prompt.host} is refusing the browser`;
  if (prompt.verdict === 'unclear') return 'Engine running · saved session is unreadable';
  return 'Engine running · saved session expired';
}

function runningSubtitle(facts: ViewFacts): string {
  const runs =
    facts.runsToday === 1 ? '1 run today' : `${String(facts.runsToday)} runs today`;
  return facts.engineLabel === undefined ? runs : `${facts.engineLabel} · ${runs}`;
}

function failureTitle(state: LauncherState): string {
  if (state.failure === undefined) return 'Startup failed';
  const stage = state.failure.stage;
  const title = stage === 'browser' ? FINAL_STAGE_TITLES[state.mode] : STAGE_TITLES[stage];
  return `${title} failed`;
}
