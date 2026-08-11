import { type CaptureRecord } from '@ui-atlas/protocol';
import type { ParsedArgs } from '../args.js';
import type { Logger } from '../logger.js';
export declare const REPORT_HELP: string;
export interface RunSummary {
    runId: string;
    project: string;
    startedAt: string;
    finishedAt: string | undefined;
    counts: {
        captured: number;
        failed: number;
        skipped: number;
        pages: number;
    };
    byState: Record<string, number>;
    byProvenance: Record<string, number>;
    warnings: string[];
    failures: Array<{
        id: string;
        state: string;
        code: string;
        message: string;
    }>;
    duplicateGroups: Array<{
        sha256: string;
        captures: string[];
    }>;
    invalidLines: number;
}
export declare function summariseCaptures(records: CaptureRecord[]): Pick<RunSummary, 'byState' | 'byProvenance' | 'failures' | 'duplicateGroups'>;
export declare function runReport(args: ParsedArgs, logger: Logger): Promise<number>;
//# sourceMappingURL=report.d.ts.map