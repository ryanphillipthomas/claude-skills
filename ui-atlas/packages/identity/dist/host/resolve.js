import { UiAtlasError, } from '@ui-atlas/protocol';
import { chooseCandidate } from '../core/scoring.js';
import { hashFingerprint } from './fingerprint.js';
import { describeCandidate, locatorForCandidate } from './locators.js';
function orderCandidates(identity) {
    const rest = identity.locatorCandidates.filter((candidate) => !(candidate.type === identity.chosenLocator.type && candidate.value === identity.chosenLocator.value));
    return [identity.chosenLocator, ...rest];
}
function boxesMatch(a, b, tolerance) {
    return (Math.abs(a.x - b.x) <= tolerance &&
        Math.abs(a.y - b.y) <= tolerance &&
        Math.abs(a.width - b.width) <= tolerance &&
        Math.abs(a.height - b.height) <= tolerance);
}
/**
 * Re-resolve an element immediately before acting on it. Candidates are tried
 * best-first; a candidate that matches nothing or several elements produces a
 * warning and we move on, exactly as the identity design requires.
 */
export async function resolveElement(root, identity, options = {}) {
    const tolerance = options.boxTolerancePx ?? 2;
    const maxProbes = options.maxAmbiguousProbes ?? 20;
    const candidates = orderCandidates(identity);
    const warnings = [];
    for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        if (candidate === undefined)
            continue;
        let locator;
        try {
            locator = locatorForCandidate(root, candidate);
        }
        catch (cause) {
            warnings.push(`candidate ${describeCandidate(candidate)} is not usable: ${String(cause)}`);
            continue;
        }
        let matches;
        try {
            matches = await locator.count();
        }
        catch (cause) {
            warnings.push(`candidate ${describeCandidate(candidate)} failed to evaluate: ${String(cause)}`);
            continue;
        }
        if (matches === 1) {
            // A unique match is not automatically the right one: a positional path
            // still resolves after the element it named was deleted, just to a
            // different element. When we know where the element used to be, say so.
            if (index > 0 && options.expectedBox !== undefined) {
                const box = await locator.first().boundingBox({ timeout: 1_000 }).catch(() => null);
                if (box !== null && !boxesMatch(box, options.expectedBox, Math.max(tolerance, 4))) {
                    warnings.push(`fallback candidate ${describeCandidate(candidate)} resolved to an element at a different position than the one that was selected`);
                }
            }
            return {
                locator: locator.first(),
                candidate,
                usedCandidateIndex: index,
                matches,
                fellBack: index > 0,
                warnings,
            };
        }
        if (matches === 0) {
            warnings.push(`candidate ${describeCandidate(candidate)} matched no elements`);
            continue;
        }
        warnings.push(`candidate ${describeCandidate(candidate)} matched ${matches} elements`);
        if (options.expectedBox !== undefined) {
            const geometric = await matchByGeometry(locator, options.expectedBox, tolerance, Math.min(matches, maxProbes));
            if (geometric !== undefined) {
                warnings.push(`disambiguated ${describeCandidate(candidate)} by position: used match ${geometric.index + 1} of ${matches}`);
                return {
                    locator: geometric.locator,
                    candidate,
                    usedCandidateIndex: index,
                    matches,
                    fellBack: true,
                    warnings,
                };
            }
        }
    }
    const anyMatched = warnings.some((warning) => warning.includes('matched') && !warning.includes('no elements'));
    throw new UiAtlasError(anyMatched ? 'locator.ambiguous' : 'locator.not-found', anyMatched
        ? 'no locator candidate resolved to a single element'
        : 'no locator candidate matched anything on the page', { detail: { warnings, candidates: candidates.map(describeCandidate) } });
}
async function matchByGeometry(locator, expected, tolerance, limit) {
    const found = [];
    for (let index = 0; index < limit; index += 1) {
        const nth = locator.nth(index);
        let box;
        try {
            box = await nth.boundingBox({ timeout: 1_000 });
        }
        catch {
            continue;
        }
        if (box !== null && boxesMatch(box, expected, tolerance))
            found.push({ locator: nth, index });
        if (found.length > 1)
            return undefined;
    }
    return found[0];
}
/* -------------------------------------------------------------------------- */
/* Frame identity                                                              */
/* -------------------------------------------------------------------------- */
function originOf(url) {
    try {
        return new URL(url).origin;
    }
    catch {
        return 'about:blank';
    }
}
/** Describe the frame chain from the main frame down to `frame`. */
export async function buildFramePath(frame) {
    const chain = [];
    let current = frame;
    while (current !== null) {
        chain.unshift(current);
        current = current.parentFrame();
    }
    const mainOrigin = originOf(chain[0]?.url() ?? 'about:blank');
    const path = [];
    for (let depth = 0; depth < chain.length; depth += 1) {
        const item = chain[depth];
        if (item === undefined)
            continue;
        const identity = {
            depth,
            url: item.url(),
            crossOrigin: depth > 0 && originOf(item.url()) !== mainOrigin,
        };
        const name = item.name();
        if (name.length > 0)
            identity.name = name;
        if (depth > 0) {
            const selector = await frameSelectorInParent(item);
            if (selector !== undefined)
                identity.selectorInParent = selector;
        }
        path.push(identity);
    }
    return path;
}
async function frameSelectorInParent(frame) {
    try {
        const handle = await frame.frameElement();
        const selector = await handle.evaluate((element) => {
            const tag = element.tagName.toLowerCase();
            const name = element.getAttribute('name');
            if (name !== null && name.length > 0)
                return `${tag}[name="${name}"]`;
            const id = element.getAttribute('id');
            if (id !== null && id.length > 0 && !/^\d/.test(id))
                return `${tag}#${id}`;
            const parent = element.parentElement;
            if (parent === null)
                return tag;
            const sameTag = Array.from(parent.children).filter((child) => child.tagName === element.tagName);
            const index = sameTag.indexOf(element) + 1;
            return sameTag.length > 1 ? `${tag}:nth-of-type(${index})` : tag;
        });
        await handle.dispose();
        return selector;
    }
    catch {
        return undefined;
    }
}
/* -------------------------------------------------------------------------- */
/* Identity assembly                                                           */
/* -------------------------------------------------------------------------- */
/** Combine a page-side probe with host-side frame knowledge and hashing. */
export function buildElementIdentity(probe, framePath) {
    const chosen = chooseCandidate(probe.candidates);
    if (chosen === undefined) {
        throw new UiAtlasError('locator.not-found', 'element probe produced no locator candidates', {
            detail: { tagName: probe.tagName },
        });
    }
    const identity = {
        framePath,
        locatorCandidates: probe.candidates,
        chosenLocator: chosen,
        structuralFingerprint: hashFingerprint(probe.fingerprintInput),
        tagName: probe.tagName,
        boundingBox: probe.boundingBox,
    };
    if (probe.role !== undefined)
        identity.role = probe.role;
    if (probe.accessibleName !== undefined)
        identity.accessibleName = probe.accessibleName;
    if (probe.textExcerpt !== undefined)
        identity.textExcerpt = probe.textExcerpt;
    if (probe.shadowHostPath.length > 0)
        identity.shadowHostPath = probe.shadowHostPath;
    return identity;
}
//# sourceMappingURL=resolve.js.map