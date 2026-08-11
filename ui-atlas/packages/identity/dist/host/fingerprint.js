import { createHash } from 'node:crypto';
/** Deterministic JSON: sorted keys so equal inputs always hash equally. */
function canonicalJson(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    const entries = Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
}
/**
 * Hash of the stable facts about an element: tag, role, normalised name class,
 * selected stable attributes, ancestor roles and a coarse geometry bucket.
 * Deliberately excludes transient class hashes, absolute page coordinates and
 * user data, so the same component fingerprints the same across visits.
 */
export function hashFingerprint(input) {
    return createHash('sha256').update(canonicalJson(input)).digest('hex');
}
export { canonicalJson };
//# sourceMappingURL=fingerprint.js.map