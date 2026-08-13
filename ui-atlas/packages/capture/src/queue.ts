import { newJobId } from '@ui-atlas/artifacts';
import {
  toStructuredError,
  type CaptureKind,
  type QueueJob,
  type StateName,
} from '@ui-atlas/protocol';

export interface QueueJobInput {
  kind: CaptureKind;
  states: StateName[];
  label: string;
  /**
   * Performs the work. Report progress through `report`, and check `shouldStop`
   * between shots — a job that photographs six states is the thing a user most
   * wants to be able to interrupt, and only the job itself knows where a safe
   * place to stop is.
   */
  run: (
    report: (progress: string) => void,
    shouldStop: () => boolean,
  ) => Promise<{
    captureIds: string[];
    warnings: string[];
    /** Inline preview of the first shot, for the inspector's captured list. */
    thumbnail?: string | undefined;
    /** Names of the files written, for the same list. */
    fileNames?: string[] | undefined;
  }>;
}

/**
 * Captures run one at a time against a single page: a queue keeps the browser
 * in a known state and makes the inspector's status list truthful. Jobs are
 * never dropped, and a failure marks only that job.
 */
export class CaptureQueue {
  private readonly jobs = new Map<string, QueueJob>();
  private readonly order: string[] = [];
  private pending: Promise<void> = Promise.resolve();
  /** The running job that has been asked to stop, if any. */
  private stopping: string | undefined;
  private readonly onUpdate: ((job: QueueJob) => void) | undefined;

  constructor(onUpdate?: (job: QueueJob) => void) {
    this.onUpdate = onUpdate;
  }

  list(): QueueJob[] {
    return this.order
      .map((id) => this.jobs.get(id))
      .filter((job): job is QueueJob => job !== undefined);
  }

  get(id: string): QueueJob | undefined {
    return this.jobs.get(id);
  }

  /** Resolves once every job queued so far has finished. */
  async drain(): Promise<void> {
    await this.pending;
  }

  enqueue(input: QueueJobInput): QueueJob {
    const job: QueueJob = {
      id: newJobId(),
      createdAt: new Date().toISOString(),
      kind: input.kind,
      states: input.states,
      label: input.label,
      status: 'queued',
      captureIds: [],
      warnings: [],
      fileNames: [],
    };
    this.jobs.set(job.id, job);
    this.order.push(job.id);
    this.emit(job);

    this.pending = this.pending.then(async () => {
      const current = this.jobs.get(job.id);
      if (current === undefined || current.status === 'cancelled') return;
      this.update(job.id, { status: 'running' });
      try {
        const result = await input.run(
          (progress) => this.update(job.id, { progress }),
          () => this.stopping === job.id,
        );
        this.update(job.id, {
          status: 'done',
          captureIds: result.captureIds,
          warnings: result.warnings,
          progress: undefined,
          fileNames: result.fileNames ?? [],
          ...(result.thumbnail === undefined ? {} : { thumbnail: result.thumbnail }),
        });
      } catch (error) {
        this.update(job.id, {
          status: 'failed',
          error: toStructuredError(error, 'capture.failed'),
          progress: undefined,
        });
      } finally {
        // A stop applies to the job it was aimed at, never to the next one.
        if (this.stopping === job.id) this.stopping = undefined;
      }
    });

    return job;
  }

  /**
   * Stop what has not happened yet.
   *
   * Queued jobs are cancelled outright. The running one is *asked* to stop and
   * left to reach its own boundary, because it has a state applied to the live
   * page and a `finally` that puts it back — tearing it down mid-shot would
   * leave the site holding a hover nobody asked for. It keeps the shots it
   * already took, since those files exist.
   */
  stop(): { stopped: number; stillRunning: boolean } {
    let stopped = 0;
    let stillRunning = false;
    for (const id of this.order) {
      const job = this.jobs.get(id);
      if (job === undefined) continue;
      if (job.status === 'queued') {
        this.update(id, { status: 'cancelled' });
        stopped += 1;
      } else if (job.status === 'running') {
        this.stopping = id;
        stillRunning = true;
      }
    }
    return { stopped, stillRunning };
  }

  private update(id: string, patch: Partial<QueueJob>): void {
    const job = this.jobs.get(id);
    if (job === undefined) return;
    const next: QueueJob = { ...job, ...patch };
    if (patch.progress === undefined && 'progress' in patch) delete next.progress;
    this.jobs.set(id, next);
    this.emit(next);
  }

  private emit(job: QueueJob): void {
    try {
      this.onUpdate?.(job);
    } catch {
      // A listener failure must never break the queue.
    }
  }
}
