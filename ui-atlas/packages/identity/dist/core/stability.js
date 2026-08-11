/**
 * Heuristics for rejecting machine-generated identifiers. A generated id looks
 * unique today and is worthless tomorrow, so treating one as a stable locator
 * is worse than falling through to a scoped CSS selector.
 */
/** Framework-generated id shapes seen in the wild. */
const GENERATED_PATTERNS = [
    /^:[rR][0-9a-z]*:?$/, // React 18 useId
    /^mui-\d+$/i,
    /^ember\d+$/i,
    /^ext-gen\d+$/i,
    /^radix-[-:\w]+$/i,
    /^headlessui-[-\w]+$/i,
    /^react-aria-?\d+/i,
    /^downshift-\d+/i,
    /^ng-?(?:tns-)?\d+/i,
    /^cdk-[-\w]*\d{2,}/i,
    /^tippy-\d+$/i,
    /^uid[-_]?\d+$/i,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // uuid
    /^__[A-Za-z0-9]+__?\d*$/,
    /^\d+$/,
];
/** Words that make an id look authored rather than generated. */
const HUMAN_WORD = /[a-z]{3,}/i;
export function inspectId(id) {
    const trimmed = id.trim();
    if (trimmed.length === 0)
        return { generated: true, reason: 'empty id' };
    for (const pattern of GENERATED_PATTERNS) {
        if (pattern.test(trimmed))
            return { generated: true, reason: `matches generated pattern ${String(pattern)}` };
    }
    if (trimmed.length > 40)
        return { generated: true, reason: 'id is unusually long' };
    // A long unbroken hex run is almost always a hash or a random id.
    if (/[0-9a-f]{10,}/i.test(trimmed) && !/[-_]/.test(trimmed)) {
        return { generated: true, reason: 'contains a long hexadecimal run' };
    }
    const digits = (trimmed.match(/\d/g) ?? []).length;
    if (digits > 0 && digits / trimmed.length > 0.5) {
        return { generated: true, reason: 'more than half the id is digits' };
    }
    if (!HUMAN_WORD.test(trimmed)) {
        return { generated: true, reason: 'contains no word-like segment' };
    }
    // Mixed-case alphanumeric soup with no separators, e.g. "aB3xQ9zK".
    if (trimmed.length >= 8 && !/[-_]/.test(trimmed) && /[a-z]/.test(trimmed) && /[A-Z]/.test(trimmed) && /\d/.test(trimmed)) {
        return { generated: true, reason: 'looks like random mixed-case alphanumerics' };
    }
    return { generated: false, reason: 'looks authored' };
}
export function looksGenerated(id) {
    return inspectId(id).generated;
}
/** Class names that carry a build hash and must never enter a fingerprint. */
const HASHED_CLASS = /(?:^|[-_])(?:[a-z0-9]{5,}|[0-9a-f]{6,})$/i;
export function looksHashedClass(className) {
    if (className.length > 30)
        return true;
    if (/^(?:css|sc|jsx|emotion|_)[-_]?[a-z0-9]{4,}$/i.test(className))
        return true;
    if (/^[a-z0-9]{6,}$/i.test(className) && !HUMAN_WORD.test(className))
        return true;
    return HASHED_CLASS.test(className) && /\d/.test(className);
}
/**
 * Bucketed geometry keeps a fingerprint stable across small layout differences
 * while still separating a 32px icon button from a 320px card.
 */
const BUCKET_EDGES = [16, 32, 64, 128, 256, 512, 1024, 2048];
export function geometryBucket(width, height) {
    const bucket = (value) => {
        const rounded = Math.max(0, Math.round(value));
        for (const edge of BUCKET_EDGES) {
            if (rounded <= edge)
                return `<=${edge}`;
        }
        return '>2048';
    };
    return `w${bucket(width)}|h${bucket(height)}`;
}
/**
 * Collapse an accessible name to a shape-preserving class: real words are kept
 * (lower-cased) but digits and long unique-looking runs are masked, so
 * "Order #10231" and "Order #99887" fingerprint identically.
 */
export function normalizeNameClass(name) {
    if (name === undefined)
        return '';
    const collapsed = name
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/\d+/g, '#')
        .replace(/[‘’“”]/g, "'");
    return collapsed.length > 60 ? `${collapsed.slice(0, 60)}…` : collapsed;
}
/** Trim visible text for display without carrying a whole paragraph around. */
export function excerptText(text, maxLength = 120) {
    const collapsed = text.replace(/\s+/g, ' ').trim();
    return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}…` : collapsed;
}
//# sourceMappingURL=stability.js.map