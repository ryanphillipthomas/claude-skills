import { randomBytes } from 'node:crypto';
/** Filesystem- and sort-friendly timestamp: `20260811T125501Z`. */
export function compactTimestamp(date = new Date()) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}
/** Short, non-sequential suffix. Not a security token. */
export function shortToken(bytes = 4) {
    return randomBytes(bytes).toString('hex');
}
/**
 * Run ids sort lexicographically by start time, which keeps `ls` output and
 * report ordering sensible without parsing metadata.
 */
export function newRunId(date = new Date()) {
    return `${compactTimestamp(date)}-${shortToken(3)}`;
}
export function newCaptureId(date = new Date()) {
    return `cap-${compactTimestamp(date)}-${shortToken(4)}`;
}
export function newPageId(date = new Date()) {
    return `page-${compactTimestamp(date)}-${shortToken(3)}`;
}
export function newJobId() {
    return `job-${shortToken(6)}`;
}
/** Cryptographically random token used to authenticate overlay bridge calls. */
export function newSessionToken() {
    return randomBytes(24).toString('base64url');
}
//# sourceMappingURL=ids.js.map