import { newJobId } from '@ui-atlas/artifacts';
import { toStructuredError, } from '@ui-atlas/protocol';
/**
 * Captures run one at a time against a single page: a queue keeps the browser
 * in a known state and makes the inspector's status list truthful. Jobs are
 * never dropped, and a failure marks only that job.
 */
export class CaptureQueue {
    jobs = new Map();
    order = [];
    pending = Promise.resolve();
    onUpdate;
    constructor(onUpdate) {
        this.onUpdate = onUpdate;
    }
    list() {
        return this.order
            .map((id) => this.jobs.get(id))
            .filter((job) => job !== undefined);
    }
    get(id) {
        return this.jobs.get(id);
    }
    /** Resolves once every job queued so far has finished. */
    async drain() {
        await this.pending;
    }
    enqueue(input) {
        const job = {
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
            if (current === undefined || current.status === 'cancelled')
                return;
            this.update(job.id, { status: 'running' });
            try {
                const result = await input.run((progress) => this.update(job.id, { progress }));
                this.update(job.id, {
                    status: 'done',
                    captureIds: result.captureIds,
                    warnings: result.warnings,
                    progress: undefined,
                });
            }
            catch (error) {
                this.update(job.id, {
                    status: 'failed',
                    error: toStructuredError(error, 'capture.failed'),
                    progress: undefined,
                });
            }
        });
        return job;
    }
    cancelPending() {
        for (const id of this.order) {
            const job = this.jobs.get(id);
            if (job !== undefined && job.status === 'queued')
                this.update(id, { status: 'cancelled' });
        }
    }
    update(id, patch) {
        const job = this.jobs.get(id);
        if (job === undefined)
            return;
        const next = { ...job, ...patch };
        if (patch.progress === undefined && 'progress' in patch)
            delete next.progress;
        this.jobs.set(id, next);
        this.emit(next);
    }
    emit(job) {
        try {
            this.onUpdate?.(job);
        }
        catch {
            // A listener failure must never break the queue.
        }
    }
}
//# sourceMappingURL=queue.js.map