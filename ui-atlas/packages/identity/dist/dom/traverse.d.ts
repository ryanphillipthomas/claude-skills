/**
 * DOM walking helpers shared by the probe. These run inside the inspected page,
 * so they stay bounded: a hostile or enormous document must not hang the
 * inspector.
 */
/** Hard cap on how many elements a single deep query will visit. */
export declare const MAX_VISITED_ELEMENTS = 8000;
export interface DeepQueryResult {
    matches: Element[];
    /** True when the traversal stopped early because of the element cap. */
    truncated: boolean;
}
/**
 * Query `selector` across the document and every *open* shadow root, matching
 * Playwright's CSS engine, which also pierces open shadow DOM. Counting the
 * same way page-side keeps uniqueness numbers honest.
 */
export declare function queryAllDeep(root: Document | ShadowRoot, selector: string): DeepQueryResult;
/** Every element in the document and all open shadow roots, bounded. */
export declare function allElementsDeep(root: Document | ShadowRoot): DeepQueryResult;
/** Ancestors of `element`, crossing open shadow boundaries, innermost first. */
export declare function composedAncestors(element: Element): Element[];
/** True when the element renders something a user could point at. */
export declare function isVisible(element: Element): boolean;
//# sourceMappingURL=traverse.d.ts.map