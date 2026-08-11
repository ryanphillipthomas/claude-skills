/** A monotonic budget shared by every step of one settle pass. */
export class Deadline {
    startedAt;
    totalMs;
    constructor(totalMs, now = () => Date.now()) {
        this.totalMs = totalMs;
        this.now = now;
        this.startedAt = now();
    }
    now;
    elapsedMs() {
        return this.now() - this.startedAt;
    }
    remainingMs() {
        return Math.max(0, this.totalMs - this.elapsedMs());
    }
    expired() {
        return this.remainingMs() <= 0;
    }
    /** Budget for one step: never more than what is left overall. */
    budgetFor(stepMs) {
        return Math.max(0, Math.min(stepMs, this.remainingMs()));
    }
}
export const TIMED_OUT = Symbol('timed-out');
/**
 * Race `work` against `ms`. Returns {@link TIMED_OUT} instead of throwing so
 * callers can record a timed-out check and carry on to the next one.
 */
export async function withTimeout(work, ms) {
    if (ms <= 0)
        return TIMED_OUT;
    let timer;
    try {
        return await Promise.race([
            work,
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(TIMED_OUT), ms);
                timer.unref?.();
            }),
        ]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
    }
}
export function sleep(ms) {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, ms);
        timer.unref?.();
    });
}
//# sourceMappingURL=deadline.js.map