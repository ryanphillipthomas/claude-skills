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
  /** Performs the work. Report progress through `report`. */
  run: (report: (progress: string) => void) => Promise<{ captureIds: string[]; warnings: string[] }>;
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
    };
    this.jobs.set(job.id, job);
    this.order.push(job.id);
    this.emit(job);

    this.pending = this.pending.then(async () => {
      const current = this.jobs.get(job.id);
      if (current === undefined || current.status === 'cancelled') return;
      this.update(job.id, { status: 'running' });
      try {
        const result = await input.run((progress) => this.update(job.id, { progress }));
        this.update(job.id, {
          status: 'done',
          captureIds: result.captureIds,
          warnings: result.warnings,
          progress: undefined,
        });
      } catch (error) {
        this.update(job.id, {
          status: 'failed',
          error: toStructuredError(error, 'capture.failed'),
          progress: undefined,
        });
      }
    });

    return job;
  }

  cancelPending(): void {
    for (const id of this.order) {
      const job = this.jobs.get(id);
      if (job !== undefined && job.status === 'queued') this.update(id, { status: 'cancelled' });
    }
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
