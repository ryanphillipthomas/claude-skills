import { z } from 'zod';
/**
 * Stable, machine-readable error codes. Every failure surfaced to a record or
 * to the CLI carries one of these so downstream tooling never has to match on
 * free-text messages.
 */
export declare const ERROR_CODES: readonly ["settle.timeout", "settle.check-failed", "locator.not-found", "locator.ambiguous", "locator.detached", "locator.hidden", "capture.failed", "capture.timeout", "capture.navigation-during-capture", "state.unsupported", "state.verification-failed", "browser.launch-failed", "browser.closed", "artifact.write-failed", "artifact.path-escape", "config.invalid", "protocol.invalid-message", "protocol.unknown-method", "auth.not-found", "internal"];
export declare const ErrorCodeSchema: z.ZodEnum<{
    "settle.timeout": "settle.timeout";
    "settle.check-failed": "settle.check-failed";
    "locator.not-found": "locator.not-found";
    "locator.ambiguous": "locator.ambiguous";
    "locator.detached": "locator.detached";
    "locator.hidden": "locator.hidden";
    "capture.failed": "capture.failed";
    "capture.timeout": "capture.timeout";
    "capture.navigation-during-capture": "capture.navigation-during-capture";
    "state.unsupported": "state.unsupported";
    "state.verification-failed": "state.verification-failed";
    "browser.launch-failed": "browser.launch-failed";
    "browser.closed": "browser.closed";
    "artifact.write-failed": "artifact.write-failed";
    "artifact.path-escape": "artifact.path-escape";
    "config.invalid": "config.invalid";
    "protocol.invalid-message": "protocol.invalid-message";
    "protocol.unknown-method": "protocol.unknown-method";
    "auth.not-found": "auth.not-found";
    internal: "internal";
}>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
export declare const StructuredErrorSchema: z.ZodObject<{
    code: z.ZodEnum<{
        "settle.timeout": "settle.timeout";
        "settle.check-failed": "settle.check-failed";
        "locator.not-found": "locator.not-found";
        "locator.ambiguous": "locator.ambiguous";
        "locator.detached": "locator.detached";
        "locator.hidden": "locator.hidden";
        "capture.failed": "capture.failed";
        "capture.timeout": "capture.timeout";
        "capture.navigation-during-capture": "capture.navigation-during-capture";
        "state.unsupported": "state.unsupported";
        "state.verification-failed": "state.verification-failed";
        "browser.launch-failed": "browser.launch-failed";
        "browser.closed": "browser.closed";
        "artifact.write-failed": "artifact.write-failed";
        "artifact.path-escape": "artifact.path-escape";
        "config.invalid": "config.invalid";
        "protocol.invalid-message": "protocol.invalid-message";
        "protocol.unknown-method": "protocol.unknown-method";
        "auth.not-found": "auth.not-found";
        internal: "internal";
    }>;
    message: z.ZodString;
    detail: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    cause: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type StructuredError = z.infer<typeof StructuredErrorSchema>;
/** Error carrying a stable {@link ErrorCode} plus optional structured detail. */
export declare class UiAtlasError extends Error {
    readonly code: ErrorCode;
    readonly detail: Record<string, unknown> | undefined;
    constructor(code: ErrorCode, message: string, options?: {
        detail?: Record<string, unknown>;
        cause?: unknown;
    });
    toStructured(): StructuredError;
}
/** Normalise any thrown value into a {@link StructuredError}. */
export declare function toStructuredError(value: unknown, fallbackCode?: ErrorCode): StructuredError;
/** A timeout that always reports which deadline was exceeded. */
export declare class DeadlineExceededError extends UiAtlasError {
    constructor(what: string, deadlineMs: number);
}
//# sourceMappingURL=errors.d.ts.map