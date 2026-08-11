import { type CaptureRecord, type PageRecord, type RunManifest } from '@ui-atlas/protocol';
import { sha256 } from './atomic.js';
export interface RunPaths {
    /** Absolute root that nothing may escape. */
    outputRoot: string;
    /** `<outputRoot>/<project>/<runId>` */
    runDir: string;
    runManifest: string;
    capturesJsonl: string;
    pagesJsonl: string;
    screenshotsDir: string;
    animationsDir: string;
    tracesDir: string;
    reportDir: string;
}
export declare function runPaths(outputRoot: string, project: string, runId: string): RunPaths;
export interface ScreenshotTarget {
    routeKey: string;
    viewportLabel: string;
    captureId: string;
}
/**
 * Owns everything written for one run. Records are validated before they touch
 * the disk so a malformed record fails loudly at its source rather than being
 * discovered later by the report.
 */
export declare class RunWriter {
    readonly paths: RunPaths;
    private manifest;
    private counts;
    private initialised;
    constructor(outputRoot: string, manifest: RunManifest);
    get runId(): string;
    get project(): string;
    init(): Promise<void>;
    private assertReady;
    private writeManifest;
    /** Absolute path a screenshot for `target` must be written to. */
    screenshotPath(target: ScreenshotTarget): string;
    /**
     * Persist PNG bytes atomically and return the image reference (relative path,
     * checksum, real pixel dimensions) for the capture record.
     */
    writeScreenshot(target: ScreenshotTarget, bytes: Buffer): Promise<CaptureRecord['image'] & object>;
    /**
     * Append a capture to `captures.jsonl` and drop a sidecar JSON next to the
     * image so a single screenshot is never separated from its metadata.
     */
    addCapture(record: CaptureRecord): Promise<CaptureRecord>;
    addPage(record: PageRecord): Promise<PageRecord>;
    addWarning(warning: string): void;
    /** Rewrite run.json with final counts. Safe to call more than once. */
    finalize(extra?: {
        finishedAt?: string;
        browserVersion?: string;
    }): Promise<RunManifest>;
    snapshotCounts(): {
        captured: number;
        failed: number;
        skipped: number;
        pages: number;
    };
}
export declare function emptyManifest(input: {
    runId: string;
    project: string;
    command: string;
    toolVersion: string;
    browser: RunManifest['browser'];
    baseViewport: RunManifest['baseViewport'];
    startedAt?: string;
}): RunManifest;
/** Checksum helper re-exported for callers that hash before writing. */
export { sha256 };
//# sourceMappingURL=run-writer.d.ts.map