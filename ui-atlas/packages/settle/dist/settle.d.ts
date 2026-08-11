import type { Locator, Page } from 'playwright';
import type { SettleConfig } from '@ui-atlas/config';
import type { ReadinessResult } from '@ui-atlas/protocol';
export interface SettleOptions {
    config: SettleConfig;
    /** Element whose geometry must stop moving before we capture. */
    target?: Locator | undefined;
    /** Overrides `config.totalTimeoutMs` for this pass. */
    totalTimeoutMs?: number | undefined;
    /** Skip the DOM quiet window (used when the caller knows the page is static). */
    skipMutationQuiet?: boolean | undefined;
}
/**
 * Bounded readiness. Every check has its own budget inside one hard deadline;
 * when the deadline fires we capture anyway and record what was still pending.
 * `networkidle` is deliberately never used — analytics, streaming and long
 * polling can keep a page busy forever.
 */
export declare function settlePage(page: Page, options: SettleOptions): Promise<ReadinessResult>;
/** Detach the settle observer. Safe to call on a closed or navigated page. */
export declare function disposeSettle(page: Page): Promise<void>;
/** Wait for `count` animation frames without running a full settle pass. */
export declare function waitAnimationFrames(page: Page, count?: number): Promise<void>;
//# sourceMappingURL=settle.d.ts.map