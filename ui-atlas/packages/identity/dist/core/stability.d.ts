/**
 * Heuristics for rejecting machine-generated identifiers. A generated id looks
 * unique today and is worthless tomorrow, so treating one as a stable locator
 * is worse than falling through to a scoped CSS selector.
 */
export interface GeneratedIdVerdict {
    generated: boolean;
    reason: string;
}
export declare function inspectId(id: string): GeneratedIdVerdict;
export declare function looksGenerated(id: string): boolean;
export declare function looksHashedClass(className: string): boolean;
export declare function geometryBucket(width: number, height: number): string;
/**
 * Collapse an accessible name to a shape-preserving class: real words are kept
 * (lower-cased) but digits and long unique-looking runs are masked, so
 * "Order #10231" and "Order #99887" fingerprint identically.
 */
export declare function normalizeNameClass(name: string | undefined): string;
/** Trim visible text for display without carrying a whole paragraph around. */
export declare function excerptText(text: string, maxLength?: number): string;
//# sourceMappingURL=stability.d.ts.map