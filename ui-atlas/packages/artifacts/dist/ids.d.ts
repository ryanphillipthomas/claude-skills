/** Filesystem- and sort-friendly timestamp: `20260811T125501Z`. */
export declare function compactTimestamp(date?: Date): string;
/** Short, non-sequential suffix. Not a security token. */
export declare function shortToken(bytes?: number): string;
/**
 * Run ids sort lexicographically by start time, which keeps `ls` output and
 * report ordering sensible without parsing metadata.
 */
export declare function newRunId(date?: Date): string;
export declare function newCaptureId(date?: Date): string;
export declare function newPageId(date?: Date): string;
export declare function newJobId(): string;
/** Cryptographically random token used to authenticate overlay bridge calls. */
export declare function newSessionToken(): string;
//# sourceMappingURL=ids.d.ts.map