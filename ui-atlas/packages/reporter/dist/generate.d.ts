import { type ReportModel } from './model.js';
/**
 * The browser-side viewer, bundled by `packages/reporter/build.mjs`. Both the
 * compiled module (`dist/generate.js`) and the source (`src/generate.ts`) sit
 * one directory below the package root, so one relative path serves both.
 */
export declare function viewerBundlePath(): string;
export interface GenerateReportOptions {
    /** A run directory: the one that holds `run.json`. */
    runDir: string;
    generatedAt?: string;
}
export interface GeneratedReport {
    /** Absolute path to the written `report/index.html`. */
    path: string;
    model: ReportModel;
    byteLength: number;
}
/**
 * Render a run into a single self-contained `report/index.html`.
 *
 * Self-contained means no network: the stylesheet and the viewer are inlined,
 * and the data is embedded as JSON. Images are referenced by relative path
 * because base64-inlining hundreds of screenshots would produce a file no
 * browser wants to open — the run directory is the unit you share, not the HTML
 * on its own.
 */
export declare function generateReport(options: GenerateReportOptions): Promise<GeneratedReport>;
//# sourceMappingURL=generate.d.ts.map