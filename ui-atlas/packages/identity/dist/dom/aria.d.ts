/**
 * A pragmatic subset of ARIA role inference and accessible-name computation.
 *
 * This is deliberately *not* a full accname implementation: it runs in the page
 * on every pointer move, so it trades completeness for speed and predictability.
 * Whatever it produces is only ever a locator *candidate* — the Playwright host
 * re-resolves the resulting `getByRole` selector before acting, so a wrong guess
 * degrades to the next candidate rather than to a wrong element.
 */
/** Roles whose accessible name may come from the element's own text content. */
declare const NAME_FROM_CONTENT: Set<string>;
export declare function collapseWhitespace(value: string): string;
/** Best-effort implicit or explicit ARIA role. */
export declare function computeRole(element: Element): string | undefined;
/**
 * Accessible name, following the practical part of the accname algorithm:
 * aria-labelledby, aria-label, native labelling, then name-from-content.
 */
export declare function computeAccessibleName(element: Element, role?: string | undefined): string | undefined;
export { NAME_FROM_CONTENT };
//# sourceMappingURL=aria.d.ts.map