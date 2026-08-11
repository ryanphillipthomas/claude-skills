/**
 * DOM walking helpers shared by the probe. These run inside the inspected page,
 * so they stay bounded: a hostile or enormous document must not hang the
 * inspector.
 */
/** Hard cap on how many elements a single deep query will visit. */
export const MAX_VISITED_ELEMENTS = 8000;
/**
 * Query `selector` across the document and every *open* shadow root, matching
 * Playwright's CSS engine, which also pierces open shadow DOM. Counting the
 * same way page-side keeps uniqueness numbers honest.
 */
export function queryAllDeep(root, selector) {
    const matches = [];
    const queue = [root];
    let visited = 0;
    while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined)
            break;
        try {
            for (const element of Array.from(current.querySelectorAll(selector)))
                matches.push(element);
        }
        catch {
            // An invalid selector is a bug in candidate generation, not a page fault.
            return { matches: [], truncated: false };
        }
        for (const element of Array.from(current.querySelectorAll('*'))) {
            visited += 1;
            if (visited > MAX_VISITED_ELEMENTS)
                return { matches, truncated: true };
            const shadow = element.shadowRoot;
            if (shadow !== null)
                queue.push(shadow);
        }
    }
    return { matches, truncated: false };
}
/** Every element in the document and all open shadow roots, bounded. */
export function allElementsDeep(root) {
    return queryAllDeep(root, '*');
}
/** Ancestors of `element`, crossing open shadow boundaries, innermost first. */
export function composedAncestors(element) {
    const chain = [];
    let current = element;
    for (;;) {
        const parent = current.parentNode;
        if (parent === null) {
            const root = current.getRootNode();
            if (root instanceof ShadowRoot) {
                chain.push(root.host);
                current = root.host;
                continue;
            }
            return chain;
        }
        if (parent instanceof Element)
            chain.push(parent);
        else if (!(parent instanceof DocumentFragment) && !(parent instanceof Document))
            return chain;
        current = parent;
    }
}
/** True when the element renders something a user could point at. */
export function isVisible(element) {
    const view = element.ownerDocument.defaultView;
    if (view === null)
        return false;
    const style = view.getComputedStyle(element);
    if (style.visibility === 'hidden' || style.visibility === 'collapse')
        return false;
    if (style.display === 'none')
        return false;
    if (Number(style.opacity) === 0)
        return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}
//# sourceMappingURL=traverse.js.map