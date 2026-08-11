import type { FingerprintInput } from '@ui-atlas/protocol';
/** Deterministic JSON: sorted keys so equal inputs always hash equally. */
declare function canonicalJson(value: unknown): string;
/**
 * Hash of the stable facts about an element: tag, role, normalised name class,
 * selected stable attributes, ancestor roles and a coarse geometry bucket.
 * Deliberately excludes transient class hashes, absolute page coordinates and
 * user data, so the same component fingerprints the same across visits.
 */
export declare function hashFingerprint(input: FingerprintInput): string;
export { canonicalJson };
//# sourceMappingURL=fingerprint.d.ts.map