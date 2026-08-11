/**
 * Reduce arbitrary text to one safe path segment. Never returns an empty
 * string, `.`, `..`, or anything containing a separator.
 */
export declare function sanitizeSegment(input: string, fallback?: string): string;
/**
 * Stable, human-readable key for a URL, used as the per-route artifact folder.
 * Differing query strings get distinct keys so they cannot collide, but the
 * query itself is not written into the path (it may carry user data).
 */
export declare function routeKeyFromUrl(rawUrl: string): string;
/**
 * Join `segments` under `root`, guaranteeing the result stays inside `root`.
 * Absolute or traversing segments are rejected rather than silently clamped.
 */
export declare function resolveWithinRoot(root: string, ...segments: string[]): string;
/** POSIX-style relative path for storage inside records (portable across OSes). */
export declare function toRecordPath(root: string, absolutePath: string): string;
//# sourceMappingURL=paths.d.ts.map