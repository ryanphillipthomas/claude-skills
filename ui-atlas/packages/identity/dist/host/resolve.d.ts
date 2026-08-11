import type { Frame, Locator } from 'playwright';
import { type Box, type ElementIdentity, type ElementProbe, type FrameIdentity, type LocatorCandidate } from '@ui-atlas/protocol';
import { type LocatorRoot } from './locators.js';
export interface ResolveOptions {
    /**
     * Box the element occupied when it was probed. Used to disambiguate when a
     * candidate matches several elements: if exactly one match sits where the
     * user clicked, that is the element they meant.
     */
    expectedBox?: Box | undefined;
    /** Tolerance in CSS pixels when comparing against `expectedBox`. */
    boxTolerancePx?: number;
    /** Cap on how many ambiguous matches we will measure. */
    maxAmbiguousProbes?: number;
}
export interface ResolutionResult {
    locator: Locator;
    candidate: LocatorCandidate;
    usedCandidateIndex: number;
    matches: number;
    /** True when the first-choice candidate did not resolve uniquely. */
    fellBack: boolean;
    warnings: string[];
}
/**
 * Re-resolve an element immediately before acting on it. Candidates are tried
 * best-first; a candidate that matches nothing or several elements produces a
 * warning and we move on, exactly as the identity design requires.
 */
export declare function resolveElement(root: LocatorRoot, identity: Pick<ElementIdentity, 'chosenLocator' | 'locatorCandidates'>, options?: ResolveOptions): Promise<ResolutionResult>;
/** Describe the frame chain from the main frame down to `frame`. */
export declare function buildFramePath(frame: Frame): Promise<FrameIdentity[]>;
/** Combine a page-side probe with host-side frame knowledge and hashing. */
export declare function buildElementIdentity(probe: ElementProbe, framePath: FrameIdentity[]): ElementIdentity;
export type { LocatorRoot };
//# sourceMappingURL=resolve.d.ts.map