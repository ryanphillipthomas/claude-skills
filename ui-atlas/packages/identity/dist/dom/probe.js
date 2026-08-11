import { cssEscapeIdent, cssQuoteAttrValue, excerptText, geometryBucket, inspectId, looksHashedClass, normalizeNameClass, rankCandidates, } from '../core/index.js';
import { collapseWhitespace, computeAccessibleName, computeRole } from './aria.js';
import { allElementsDeep, composedAncestors, isVisible, queryAllDeep } from './traverse.js';
/** Test attributes checked in priority order. `data-testid` is the default. */
export const TEST_ID_ATTRIBUTES = [
    'data-testid',
    'data-test-id',
    'data-test',
    'data-qa',
    'data-cy',
    'data-automation-id',
];
/** Attributes worth recording. Deliberately excludes `value` and user content. */
const REPORTED_ATTRIBUTES = [
    'type',
    'name',
    'role',
    'href',
    'target',
    'rel',
    'alt',
    'title',
    'placeholder',
    'disabled',
    'checked',
    'selected',
    'readonly',
    'aria-label',
    'aria-expanded',
    'aria-checked',
    'aria-selected',
    'aria-disabled',
    'aria-current',
    'aria-pressed',
    'aria-haspopup',
    ...TEST_ID_ATTRIBUTES,
];
/** Landmark roles that make a good scope anchor. */
const LANDMARK_ROLES = new Set([
    'banner',
    'complementary',
    'contentinfo',
    'form',
    'main',
    'navigation',
    'region',
    'search',
]);
function ownerRoot(element) {
    const root = element.getRootNode();
    if (root instanceof ShadowRoot)
        return root;
    return element.ownerDocument;
}
function topRoot(element) {
    return element.ownerDocument;
}
/** Text contributed directly by an element, ignoring descendant elements. */
export function directText(element) {
    let text = '';
    for (const node of Array.from(element.childNodes)) {
        if (node.nodeType === 3 /* TEXT_NODE */)
            text += node.nodeValue ?? '';
    }
    return collapseWhitespace(text);
}
function stableClasses(element) {
    const raw = element.getAttribute('class');
    if (raw === null)
        return [];
    return raw
        .split(/\s+/)
        .filter((name) => name.length > 0 && !looksHashedClass(name))
        .slice(0, 3);
}
function testIdAttribute(element) {
    for (const attribute of TEST_ID_ATTRIBUTES) {
        const value = element.getAttribute(attribute);
        if (value !== null && value.trim().length > 0)
            return { attribute, value: value.trim() };
    }
    return undefined;
}
function countDeep(selector, root) {
    return queryAllDeep(root, selector).matches.length;
}
/** Simple selector for one element: tag plus its most stable distinguishing bit. */
function simpleSelector(element) {
    const tag = element.tagName.toLowerCase();
    const testId = testIdAttribute(element);
    if (testId !== undefined) {
        return `${tag}[${testId.attribute}=${cssQuoteAttrValue(testId.value)}]`;
    }
    if (element.id.length > 0 && !inspectId(element.id).generated) {
        return `${tag}#${cssEscapeIdent(element.id)}`;
    }
    const classes = stableClasses(element);
    if (classes.length > 0)
        return `${tag}${classes.map((c) => `.${cssEscapeIdent(c)}`).join('')}`;
    return tag;
}
function nthOfTypeIndex(element) {
    const parent = element.parentElement;
    if (parent === null)
        return 1;
    let index = 0;
    for (const sibling of Array.from(parent.children)) {
        if (sibling.tagName === element.tagName) {
            index += 1;
            if (sibling === element)
                return index;
        }
    }
    return index === 0 ? 1 : index;
}
/**
 * A positional CSS path. Last resort: it breaks on any structural edit, which
 * is exactly why it scores lowest.
 */
export function cssPathFor(element) {
    const parts = [];
    let current = element;
    let depth = 0;
    while (current !== null && depth < 12) {
        const tag = current.tagName.toLowerCase();
        if (tag === 'html') {
            parts.unshift('html');
            break;
        }
        const parent = current.parentElement;
        if (parent === null) {
            parts.unshift(simpleSelector(current));
            const root = current.getRootNode();
            if (root instanceof ShadowRoot) {
                current = root.host;
                depth += 1;
                continue;
            }
            break;
        }
        const sameTagSiblings = Array.from(parent.children).filter((c) => c.tagName === current?.tagName);
        parts.unshift(sameTagSiblings.length > 1 ? `${tag}:nth-of-type(${nthOfTypeIndex(current)})` : tag);
        current = parent;
        depth += 1;
    }
    return parts.join(' > ');
}
/** Nearest ancestor that is itself worth naming, used to scope a CSS selector. */
function findScopeAnchor(element) {
    for (const ancestor of composedAncestors(element)) {
        const testId = testIdAttribute(ancestor);
        if (testId !== undefined) {
            return {
                selector: `[${testId.attribute}=${cssQuoteAttrValue(testId.value)}]`,
                reason: `scoped to ${testId.attribute}="${testId.value}"`,
            };
        }
        if (ancestor.id.length > 0 && !inspectId(ancestor.id).generated) {
            return { selector: `#${cssEscapeIdent(ancestor.id)}`, reason: `scoped to #${ancestor.id}` };
        }
        const role = computeRole(ancestor);
        if (role !== undefined && LANDMARK_ROLES.has(role)) {
            const tag = ancestor.tagName.toLowerCase();
            return { selector: tag, reason: `scoped to the ${role} landmark` };
        }
    }
    return undefined;
}
function relativePath(from, to) {
    const parts = [];
    let current = to;
    let depth = 0;
    while (current !== null && current !== from && depth < 8) {
        parts.unshift(simpleSelector(current));
        current = current.parentElement;
        depth += 1;
    }
    if (current !== from)
        return undefined;
    return parts.join(' > ');
}
/* -------------------------------------------------------------------------- */
/* Candidate generation                                                        */
/* -------------------------------------------------------------------------- */
export function buildCandidates(element) {
    const drafts = [];
    const root = ownerRoot(element);
    const doc = topRoot(element);
    const role = computeRole(element);
    const accessibleName = computeAccessibleName(element, role);
    const tag = element.tagName.toLowerCase();
    // 1. Accessible role + name.
    if (role !== undefined && accessibleName !== undefined && accessibleName.length > 0) {
        const { matches, truncated } = allElementsDeep(doc);
        let count = 0;
        for (const candidate of matches) {
            if (computeRole(candidate) !== role)
                continue;
            if (computeAccessibleName(candidate, role) === accessibleName)
                count += 1;
        }
        drafts.push({
            type: 'role-name',
            value: accessibleName,
            role,
            exact: true,
            uniquenessCount: count,
            reasons: truncated
                ? ['uniqueness counted over a truncated element scan']
                : ['role and accessible name are the most change-resistant identity'],
        });
    }
    // 2. Stable test attributes.
    const testId = testIdAttribute(element);
    if (testId !== undefined) {
        const selector = `[${testId.attribute}=${cssQuoteAttrValue(testId.value)}]`;
        drafts.push({
            type: 'test-id',
            value: testId.value,
            attribute: testId.attribute,
            exact: true,
            uniquenessCount: countDeep(selector, doc),
            reasons: [`authored test attribute ${testId.attribute}`],
        });
    }
    // 3. Authored id.
    if (element.id.length > 0) {
        const verdict = inspectId(element.id);
        if (!verdict.generated) {
            const selector = `#${cssEscapeIdent(element.id)}`;
            drafts.push({
                type: 'id',
                value: element.id,
                exact: true,
                uniquenessCount: countDeep(selector, doc),
                reasons: [verdict.reason],
            });
        }
    }
    // 4. Label / placeholder / alt / title.
    if (tag === 'input' || tag === 'select' || tag === 'textarea') {
        const label = labelFor(element);
        if (label !== undefined) {
            drafts.push({
                type: 'label',
                value: label,
                exact: true,
                uniquenessCount: countLabelled(doc, label),
                reasons: ['associated <label> text'],
            });
        }
        const placeholder = element.getAttribute('placeholder');
        if (placeholder !== null && placeholder.trim().length > 0) {
            const value = collapseWhitespace(placeholder);
            drafts.push({
                type: 'placeholder',
                value,
                exact: true,
                uniquenessCount: countDeep(`[placeholder=${cssQuoteAttrValue(placeholder)}]`, doc),
                reasons: ['placeholder text'],
            });
        }
    }
    const alt = element.getAttribute('alt');
    if (alt !== null && alt.trim().length > 0) {
        drafts.push({
            type: 'alt',
            value: collapseWhitespace(alt),
            exact: true,
            uniquenessCount: countDeep(`[alt=${cssQuoteAttrValue(alt)}]`, doc),
            reasons: ['alt text'],
        });
    }
    const title = element.getAttribute('title');
    if (title !== null && title.trim().length > 0) {
        drafts.push({
            type: 'title',
            value: collapseWhitespace(title),
            exact: true,
            uniquenessCount: countDeep(`[title=${cssQuoteAttrValue(title)}]`, doc),
            reasons: ['title attribute'],
        });
    }
    // 5. Scoped visible text.
    const text = directText(element);
    if (text.length > 0 && text.length <= 80) {
        const { matches } = allElementsDeep(doc);
        let count = 0;
        for (const candidate of matches) {
            if (directText(candidate) === text)
                count += 1;
        }
        drafts.push({
            type: 'text',
            value: text,
            exact: true,
            uniquenessCount: count,
            reasons: ['visible text content'],
        });
    }
    // 6. Selector scoped to a stable ancestor.
    const anchor = findScopeAnchor(element);
    if (anchor !== undefined) {
        const anchorElement = composedAncestors(element).find((ancestor) => {
            try {
                return ancestor.matches(anchor.selector);
            }
            catch {
                return false;
            }
        });
        if (anchorElement !== undefined) {
            const relative = relativePath(anchorElement, element);
            if (relative !== undefined) {
                const selector = `${anchor.selector} ${relative}`;
                drafts.push({
                    type: 'css-scoped',
                    value: selector,
                    scope: anchor.selector,
                    uniquenessCount: countDeep(selector, doc),
                    reasons: [anchor.reason],
                });
            }
        }
    }
    // 7. Positional path, last resort.
    const path = cssPathFor(element);
    if (path.length > 0) {
        drafts.push({
            type: 'css-path',
            value: path,
            uniquenessCount: countDeep(path, root instanceof ShadowRoot ? doc : doc),
            reasons: ['positional path; breaks on any structural change'],
        });
    }
    return drafts;
}
function labelFor(element) {
    const doc = element.ownerDocument;
    if (element.id.length > 0) {
        let label = null;
        try {
            label = doc.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        }
        catch {
            label = null;
        }
        if (label !== null) {
            const text = collapseWhitespace(label.textContent ?? '');
            if (text.length > 0)
                return text;
        }
    }
    const wrapping = element.closest('label');
    if (wrapping !== null) {
        const text = collapseWhitespace(wrapping.textContent ?? '');
        if (text.length > 0)
            return text;
    }
    return undefined;
}
function countLabelled(doc, labelText) {
    let count = 0;
    for (const label of Array.from(doc.querySelectorAll('label'))) {
        if (collapseWhitespace(label.textContent ?? '') !== labelText)
            continue;
        const forId = label.getAttribute('for');
        if (forId !== null && forId.length > 0) {
            count += doc.querySelectorAll(`[id="${CSS.escape(forId)}"]`).length;
        }
        else {
            count += label.querySelectorAll('input, select, textarea').length;
        }
    }
    return count;
}
/* -------------------------------------------------------------------------- */
/* Fingerprint + probe                                                         */
/* -------------------------------------------------------------------------- */
export function buildFingerprintInput(element) {
    const role = computeRole(element);
    const accessibleName = computeAccessibleName(element, role);
    const rect = element.getBoundingClientRect();
    const stableAttributes = {};
    const testId = testIdAttribute(element);
    if (testId !== undefined)
        stableAttributes[testId.attribute] = testId.value;
    if (element.id.length > 0 && !inspectId(element.id).generated)
        stableAttributes['id'] = element.id;
    const type = element.getAttribute('type');
    if (type !== null)
        stableAttributes['type'] = type.toLowerCase();
    const name = element.getAttribute('name');
    if (name !== null && !inspectId(name).generated)
        stableAttributes['name'] = name;
    const ancestorRoles = [];
    for (const ancestor of composedAncestors(element)) {
        const ancestorRole = computeRole(ancestor);
        if (ancestorRole !== undefined)
            ancestorRoles.push(ancestorRole);
        if (ancestorRoles.length >= 6)
            break;
    }
    ancestorRoles.reverse();
    const input = {
        tagName: element.tagName.toLowerCase(),
        nameClass: normalizeNameClass(accessibleName ?? directText(element)),
        stableAttributes,
        ancestorRoles,
        geometryBucket: geometryBucket(rect.width, rect.height),
    };
    if (role !== undefined)
        input.role = role;
    return input;
}
function reportedAttributes(element) {
    const out = {};
    for (const attribute of REPORTED_ATTRIBUTES) {
        const value = element.getAttribute(attribute);
        if (value === null)
            continue;
        out[attribute] = value.length > 200 ? `${value.slice(0, 200)}…` : value;
    }
    const classes = element.getAttribute('class');
    if (classes !== null && classes.length > 0) {
        out['class'] = classes.length > 200 ? `${classes.slice(0, 200)}…` : classes;
    }
    return out;
}
/** Open shadow hosts between the document and `element`, outermost first. */
function shadowHostPath(element) {
    const hosts = [];
    let current = element;
    for (;;) {
        const root = current.getRootNode();
        if (!(root instanceof ShadowRoot))
            break;
        hosts.unshift(simpleSelector(root.host));
        current = root.host;
    }
    return hosts;
}
/**
 * A custom element with no children and no open shadow root very likely has a
 * closed one. We cannot inspect inside it, and say so instead of pretending.
 */
function looksLikeClosedShadowHost(element) {
    return (element.tagName.includes('-') && element.shadowRoot === null && element.childElementCount === 0);
}
export function probeElement(element) {
    const role = computeRole(element);
    const accessibleName = computeAccessibleName(element, role);
    const rect = element.getBoundingClientRect();
    const text = directText(element) || collapseWhitespace(element.textContent ?? '');
    const probe = {
        tagName: element.tagName.toLowerCase(),
        boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        visible: isVisible(element),
        candidates: rankCandidates(buildCandidates(element)),
        fingerprintInput: buildFingerprintInput(element),
        shadowHostPath: shadowHostPath(element),
        closedShadowEncountered: looksLikeClosedShadowHost(element),
        attributes: reportedAttributes(element),
    };
    if (role !== undefined)
        probe.role = role;
    if (accessibleName !== undefined)
        probe.accessibleName = accessibleName;
    if (text.length > 0)
        probe.textExcerpt = excerptText(text);
    return probe;
}
//# sourceMappingURL=probe.js.map