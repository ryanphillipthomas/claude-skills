/** A monotonic budget shared by every step of one settle pass. */
export declare class Deadline {
    readonly startedAt: number;
    readonly totalMs: number;
    constructor(totalMs: number, now?: () => number);
    private readonly now;
    elapsedMs(): number;
    remainingMs(): number;
    expired(): boolean;
    /** Budget for one step: never more than what is left overall. */
    budgetFor(stepMs: number): number;
}
export declare const TIMED_OUT: unique symbol;
/**
 * Race `work` against `ms`. Returns {@link TIMED_OUT} instead of throwing so
 * callers can record a timed-out check and carry on to the next one.
 */
export declare function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT>;
export declare function sleep(ms: number): Promise<void>;
//# sourceMappingURL=deadline.d.ts.map