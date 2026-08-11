import { type CaptureKind, type QueueJob, type StateName } from '@ui-atlas/protocol';
export interface QueueJobInput {
    kind: CaptureKind;
    states: StateName[];
    label: string;
    /** Performs the work. Report progress through `report`. */
    run: (report: (progress: string) => void) => Promise<{
        captureIds: string[];
        warnings: string[];
    }>;
}
/**
 * Captures run one at a time against a single page: a queue keeps the browser
 * in a known state and makes the inspector's status list truthful. Jobs are
 * never dropped, and a failure marks only that job.
 */
export declare class CaptureQueue {
    private readonly jobs;
    private readonly order;
    private pending;
    private readonly onUpdate;
    constructor(onUpdate?: (job: QueueJob) => void);
    list(): QueueJob[];
    get(id: string): QueueJob | undefined;
    /** Resolves once every job queued so far has finished. */
    drain(): Promise<void>;
    enqueue(input: QueueJobInput): QueueJob;
    cancelPending(): void;
    private update;
    private emit;
}
//# sourceMappingURL=queue.d.ts.map