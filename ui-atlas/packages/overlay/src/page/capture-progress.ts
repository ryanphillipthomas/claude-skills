import type { QueueJob } from '@ui-atlas/protocol';

/**
 * What a run is doing, derived only from `queue/update` events.
 *
 * Every beat of the capture animation is driven from here rather than from a
 * timer, because a timer would be guessing: it would sweep the shutter before
 * the host had applied the state, and it would land the checkmark before the
 * file was written. The one duration this module owns is the two seconds the
 * finished control holds before it goes back to Ready — that is a reading pause
 * for the person, not a claim about the work.
 *
 * Pure, and free of the DOM, so the sequence a run goes through can be tested
 * without a browser — the same reason `flow.ts` is pure.
 */
export type CapturePhase = 'idle' | 'capturing' | 'complete' | 'error';

/**
 * One shot: a single state, at a point in the run as a whole.
 *
 * `position` and `total` count the whole run rather than the job, because a
 * user who asked for three states at two widths is waiting for six things, not
 * for two jobs of three.
 */
export interface ShotRef {
  jobId: string;
  state: string;
  position: number;
  total: number;
}

export interface CaptureProgressView {
  phase: CapturePhase;
  /** 0 to 1 across the whole run. The header hairline is this, and only this. */
  progress: number;
  /** 1-based position of the shot in flight; 0 when nothing is in flight. */
  position: number;
  /** Shots this run will produce in total. */
  total: number;
  /** Shots written so far. */
  captured: number;
  /** Shots this run has lost. */
  failed: number;
  /** States with a shot in flight right now, for the in-flight card treatment. */
  active: readonly string[];
  /**
   * The sentence for the live region. Never empty once a run has started, and
   * never colour-dependent — it is the whole status in words.
   */
  announcement: string;
}

/** What changed on this update, so callers can fire one-shot animations. */
export interface CaptureProgressChange {
  view: CaptureProgressView;
  /** A shot just began. The moment to fire the shutter. */
  startedShot: ShotRef | undefined;
  /** Jobs that reached `done` on this update: new rows in the captured list. */
  completedJobs: readonly QueueJob[];
  /** The run reached a terminal phase on this update. */
  runFinished: boolean;
}

/**
 * How long the finished control holds before returning to Ready.
 *
 * The control must never sit in a terminal state — "6 shots captured" is a
 * result, not a mode, and a button that stays a result is a dead end.
 */
export const COMPLETE_HOLD_MS = 2000;

const TERMINAL = new Set(['done', 'failed', 'cancelled']);

/**
 * The `progress` string a job reports while it works, e.g. `hover (2/3)`.
 *
 * The queue reports it once per state, immediately before that state is
 * applied and photographed, which makes it the only per-state signal the panel
 * gets — and therefore the thing that starts the shutter.
 */
export function parseJobProgress(
  progress: string | undefined,
): { state: string; index: number; total: number } | undefined {
  if (progress === undefined) return undefined;
  const match = /^(.+) \((\d+)\/(\d+)\)$/.exec(progress);
  if (match === null) return undefined;
  const state = match[1];
  const index = Number(match[2]);
  const total = Number(match[3]);
  if (state === undefined || !Number.isFinite(index) || !Number.isFinite(total)) return undefined;
  return { state, index, total };
}

/**
 * Folds `queue/update` events into the state a run is in.
 *
 * A "run" is one burst of work: it opens when a job arrives and nothing is in
 * flight, and closes when every job in it has finished. Jobs from a previous
 * run are dropped when a new one opens, so the hairline measures what is
 * happening now rather than everything the session has ever done.
 */
export class CaptureProgressMachine {
  private phase: CapturePhase = 'idle';
  private readonly jobs = new Map<string, QueueJob>();
  private order: string[] = [];
  /** Shots already announced, keyed `jobId:index`, so a repeat is not a start. */
  private readonly announced = new Set<string>();
  private announcement = '';

  apply(job: QueueJob): CaptureProgressChange {
    // A job we have not seen, arriving when nothing is in flight, opens a run.
    if (!this.jobs.has(job.id) && this.phase !== 'capturing') this.reset();

    const before = this.jobs.get(job.id);
    this.jobs.set(job.id, job);
    if (!this.order.includes(job.id)) this.order.push(job.id);
    if (this.phase !== 'capturing' && !TERMINAL.has(job.status)) this.phase = 'capturing';

    const startedShot = this.noteStartedShot(job);
    const completedJobs =
      job.status === 'done' && before?.status !== 'done' ? [job] : ([] as QueueJob[]);
    // Name the file, not the job: "save-changes--hover.png" is the thing the
    // person is going to look for on disk.
    if (completedJobs.length > 0) this.announcement = `Captured ${describeWritten(job)}`;
    if (job.status === 'failed' && before?.status !== 'failed') {
      this.announcement = `${job.label} failed`;
    }
    if (startedShot !== undefined) {
      this.announcement = `Capturing ${startedShot.state}, ${String(startedShot.position)} of ${String(startedShot.total)}`;
    }

    const runFinished = this.settleRun();
    return { view: this.view, startedShot, completedJobs, runFinished };
  }

  /**
   * End the completion hold. The control goes back to Ready and the run's jobs
   * stop counting towards the hairline.
   */
  releaseComplete(): CaptureProgressView {
    if (this.phase === 'complete' || this.phase === 'error') {
      this.reset();
      this.announcement = '';
    }
    return this.view;
  }

  get view(): CaptureProgressView {
    const totals = this.totals();
    const idle = this.phase === 'idle';
    return {
      phase: this.phase,
      progress: totals.total === 0 ? 0 : clamp(totals.finished / totals.total),
      position:
        this.phase === 'capturing' ? Math.min(totals.finished + 1, Math.max(totals.total, 1)) : 0,
      total: totals.total,
      captured: totals.captured,
      failed: totals.failed,
      active: idle ? [] : totals.active,
      announcement: this.announcement,
    };
  }

  private reset(): void {
    this.jobs.clear();
    this.order = [];
    this.announced.clear();
    this.phase = 'idle';
  }

  /** A state the job has not reported before is a shot beginning. */
  private noteStartedShot(job: QueueJob): ShotRef | undefined {
    if (TERMINAL.has(job.status)) return undefined;
    const reported = parseJobProgress(job.progress);
    if (reported === undefined) return undefined;
    const key = `${job.id}:${String(reported.index)}`;
    if (this.announced.has(key)) return undefined;
    this.announced.add(key);

    const totals = this.totals();
    return {
      jobId: job.id,
      state: reported.state,
      position: Math.min(totals.finished + 1, Math.max(totals.total, 1)),
      total: totals.total,
    };
  }

  /** Close the run once nothing is left to wait for. */
  private settleRun(): boolean {
    if (this.phase !== 'capturing' || this.jobs.size === 0) return false;
    for (const job of this.jobs.values()) if (!TERMINAL.has(job.status)) return false;

    const totals = this.totals();
    this.phase = totals.failed > 0 ? 'error' : 'complete';
    this.announcement =
      this.phase === 'error' ? shots(totals.failed, 'failed') : shots(totals.captured, 'captured');
    return true;
  }

  /**
   * Count the run in shots rather than in jobs.
   *
   * A running job's own progress string says which of its states is in flight,
   * so the shots before it are finished even though the job is not.
   */
  private totals(): {
    total: number;
    finished: number;
    captured: number;
    failed: number;
    active: string[];
  } {
    let total = 0;
    let finished = 0;
    let captured = 0;
    let failed = 0;
    const active: string[] = [];

    for (const id of this.order) {
      const job = this.jobs.get(id);
      if (job === undefined) continue;
      const states = Math.max(1, job.states.length);
      total += states;
      captured += job.captureIds.length;

      if (TERMINAL.has(job.status)) {
        // A lost or cancelled job still stops the bar from waiting on it.
        finished += states;
        if (job.status === 'failed') failed += Math.max(1, states - job.captureIds.length);
        continue;
      }

      const reported = parseJobProgress(job.progress);
      if (reported === undefined) continue;
      finished += Math.max(0, reported.index - 1);
      active.push(reported.state);
    }

    return { total, finished, captured, failed, active };
  }
}

/** What a finished job wrote, named the way the captured list names it. */
function describeWritten(job: QueueJob): string {
  const [first, ...rest] = job.fileNames;
  if (first === undefined) return job.label;
  return rest.length === 0 ? first : `${first} and ${String(rest.length)} more`;
}

function shots(count: number, verb: 'captured' | 'failed'): string {
  return `${String(count)} ${count === 1 ? 'shot' : 'shots'} ${verb}`;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
