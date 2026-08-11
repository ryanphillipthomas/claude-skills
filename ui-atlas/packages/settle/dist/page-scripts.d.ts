/**
 * Functions evaluated inside the page.
 *
 * They are real function literals rather than strings: Playwright serialises
 * the source across the boundary, and a literal keeps them type-checked against
 * the DOM. They must not close over anything from this module.
 */
export interface MutationQuietState {
    /** Milliseconds since the last meaningful mutation. */
    quietForMs: number;
    mutationCount: number;
}
export interface ImageDecodeSummary {
    considered: number;
    complete: number;
    decoded: number;
    failed: number;
    timedOut: number;
}
/** Installs (once per document) the MutationObserver backing the quiet check. */
export declare function installMutationObserver(): boolean;
export declare function readMutationQuiet(): MutationQuietState;
export declare function disconnectMutationObserver(): boolean;
export declare function waitForFonts(): Promise<string>;
/**
 * Decode images that are visible or just off-screen. Each image gets its own
 * budget so one stalled request cannot consume the whole allowance.
 */
export declare function decodeVisibleImages(perImageTimeoutMs: number): Promise<ImageDecodeSummary>;
export declare function waitAnimationFramesInPage(count: number): Promise<boolean>;
//# sourceMappingURL=page-scripts.d.ts.map