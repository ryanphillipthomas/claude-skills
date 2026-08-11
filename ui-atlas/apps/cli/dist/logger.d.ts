import type { RedactionConfig } from '@ui-atlas/config';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface Logger {
    debug(message: string, detail?: unknown): void;
    info(message: string, detail?: unknown): void;
    warn(message: string, detail?: unknown): void;
    error(message: string, detail?: unknown): void;
}
/**
 * Redact configured fields and common auth headers before anything is printed.
 * Applied recursively and depth-bounded so a cyclic or huge object cannot hang
 * the logger.
 */
export declare function redact(value: unknown, config?: RedactionConfig, depth?: number): unknown;
export interface ConsoleLoggerOptions {
    level?: LogLevel;
    redaction?: RedactionConfig;
    write?: (line: string) => void;
}
export declare function createLogger(options?: ConsoleLoggerOptions): Logger;
//# sourceMappingURL=logger.d.ts.map