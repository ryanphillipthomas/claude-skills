import { z } from 'zod';
/**
 * Stable, machine-readable error codes. Every failure surfaced to a record or
 * to the CLI carries one of these so downstream tooling never has to match on
 * free-text messages.
 */
export const ERROR_CODES = [
    'settle.timeout',
    'settle.check-failed',
    'locator.not-found',
    'locator.ambiguous',
    'locator.detached',
    'locator.hidden',
    'capture.failed',
    'capture.timeout',
    'capture.navigation-during-capture',
    'state.unsupported',
    'state.verification-failed',
    'browser.launch-failed',
    'browser.closed',
    'artifact.write-failed',
    'artifact.path-escape',
    'config.invalid',
    'protocol.invalid-message',
    'protocol.unknown-method',
    'auth.not-found',
    'internal',
];
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export const StructuredErrorSchema = z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    detail: z.record(z.string(), z.unknown()).optional(),
    cause: z.string().optional(),
});
/** Error carrying a stable {@link ErrorCode} plus optional structured detail. */
export class UiAtlasError extends Error {
    code;
    detail;
    constructor(code, message, options) {
        super(message, options?.cause === undefined ? undefined : { cause: options.cause });
        this.name = 'UiAtlasError';
        this.code = code;
        this.detail = options?.detail;
    }
    toStructured() {
        const structured = { code: this.code, message: this.message };
        if (this.detail !== undefined)
            structured.detail = this.detail;
        const cause = describeCause(this.cause);
        if (cause !== undefined)
            structured.cause = cause;
        return structured;
    }
}
function describeCause(cause) {
    if (cause === undefined || cause === null)
        return undefined;
    if (cause instanceof Error)
        return `${cause.name}: ${cause.message}`;
    return String(cause);
}
/** Normalise any thrown value into a {@link StructuredError}. */
export function toStructuredError(value, fallbackCode = 'internal') {
    if (value instanceof UiAtlasError)
        return value.toStructured();
    if (value instanceof Error) {
        const structured = { code: fallbackCode, message: value.message };
        const cause = describeCause(value.cause);
        if (cause !== undefined)
            structured.cause = cause;
        return structured;
    }
    return { code: fallbackCode, message: String(value) };
}
/** A timeout that always reports which deadline was exceeded. */
export class DeadlineExceededError extends UiAtlasError {
    constructor(what, deadlineMs) {
        super('settle.timeout', `${what} exceeded its ${deadlineMs}ms deadline`, {
            detail: { what, deadlineMs },
        });
        this.name = 'DeadlineExceededError';
    }
}
//# sourceMappingURL=errors.js.map