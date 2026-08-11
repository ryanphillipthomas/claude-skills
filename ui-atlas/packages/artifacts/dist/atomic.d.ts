export declare function sha256(data: Buffer | string): string;
export declare function ensureDir(dir: string, mode?: number): Promise<void>;
export interface AtomicWriteResult {
    path: string;
    sha256: string;
    byteLength: number;
}
/**
 * Write `data` durably: temp file in the *same directory* (so rename is atomic
 * on the same filesystem), fsync, verify the checksum, then rename into place.
 * A crash mid-write leaves either the previous file or nothing — never a
 * truncated artifact.
 */
export declare function atomicWriteFile(targetPath: string, data: Buffer | string, options?: {
    mode?: number;
}): Promise<AtomicWriteResult>;
/**
 * Append one JSON Lines record. Appends of a single line under the platform
 * pipe-buffer size are effectively atomic for our single-writer-per-run model,
 * and keep the run recoverable if the process dies mid-run.
 */
export declare function appendJsonLine(targetPath: string, value: unknown): Promise<void>;
//# sourceMappingURL=atomic.d.ts.map