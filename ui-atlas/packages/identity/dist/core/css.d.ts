/**
 * CSS.escape, implemented locally so the same escaping is available in Node
 * (where `CSS` does not exist) and in the injected page bundle.
 * Follows https://drafts.csswg.org/cssom/#serialize-an-identifier
 */
export declare function cssEscapeIdent(value: string): string;
/** Quote and escape a string for use inside an attribute selector. */
export declare function cssQuoteAttrValue(value: string): string;
//# sourceMappingURL=css.d.ts.map