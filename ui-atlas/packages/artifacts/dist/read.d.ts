import { type CaptureRecord, type PageRecord, type RunManifest } from '@ui-atlas/protocol';
export interface JsonLinesReadResult<T> {
    records: T[];
    /** 1-based line numbers that failed to parse or validate. */
    invalidLines: Array<{
        line: number;
        reason: string;
    }>;
}
/**
 * Read a JSON Lines file tolerantly: one corrupt line (for example a run that
 * was killed mid-append) must not make the whole run unreadable.
 */
export declare function readJsonLines<T>(path: string, schema: {
    safeParse: (value: unknown) => {
        success: true;
        data: T;
    } | {
        success: false;
        error: import('zod').ZodError;
    };
}): Promise<JsonLinesReadResult<T>>;
export declare function readCaptures(path: string): Promise<JsonLinesReadResult<CaptureRecord>>;
export declare function readPages(path: string): Promise<JsonLinesReadResult<PageRecord>>;
export declare function readRunManifest(path: string): Promise<RunManifest>;
//# sourceMappingURL=read.d.ts.map