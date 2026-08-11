import type { LocatorCandidate, LocatorCandidateType } from '@ui-atlas/protocol';
export type CandidateDraft = Omit<LocatorCandidate, 'score'>;
/**
 * Preference order from the brief: accessible role+name, stable test
 * attributes, authored ids, labels/placeholder/alt/title/text, a selector
 * scoped to a stable ancestor, and a positional path only as a last resort.
 */
export declare const BASE_SCORES: Record<LocatorCandidateType, number>;
/**
 * Turn a draft into a scored candidate. Every adjustment appends a reason so a
 * user can see *why* a locator was preferred or rejected.
 */
export declare function scoreCandidate(draft: CandidateDraft): LocatorCandidate;
/**
 * Score, then order best-first. Candidates that resolve to exactly one element
 * always outrank ambiguous ones, however good the ambiguous one's type is: a
 * locator that cannot pick out the element is not a locator. Ambiguous
 * candidates stay in the list so the resolver can still fall back to them (and
 * disambiguate by geometry) when the unique ones stop matching.
 */
export declare function rankCandidates(drafts: CandidateDraft[]): LocatorCandidate[];
/** The candidate a capture should try first; undefined when nothing is usable. */
export declare function chooseCandidate(candidates: LocatorCandidate[]): LocatorCandidate | undefined;
//# sourceMappingURL=scoring.d.ts.map