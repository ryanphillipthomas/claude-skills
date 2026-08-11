import type { Frame, Locator, Page } from 'playwright';
import { type LocatorCandidate } from '@ui-atlas/protocol';
export type LocatorRoot = Page | Frame;
/**
 * Turn a stored candidate back into a live Playwright locator. Playwright's
 * built-in engines already pierce open shadow DOM, so no extra work is needed
 * for open shadow roots; closed roots are unsupported and documented as such.
 */
export declare function locatorForCandidate(root: LocatorRoot, candidate: LocatorCandidate): Locator;
/** Human-readable form used in logs, warnings and the report. */
export declare function describeCandidate(candidate: LocatorCandidate): string;
//# sourceMappingURL=locators.d.ts.map