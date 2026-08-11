/**
 * Tiny DOM helpers.
 *
 * Everything the viewer renders originates from an inspected website, so text
 * is only ever assigned through `textContent`. There is no `innerHTML` in the
 * viewer, and adding one would be a security bug.
 */
export declare function el<K extends keyof HTMLElementTagNameMap>(tag: K, options?: {
    className?: string;
    text?: string;
    title?: string;
    attrs?: Record<string, string>;
    children?: Array<Node | undefined>;
}): HTMLElementTagNameMap[K];
export declare function clear(node: Element): void;
export declare function badge(text: string, variant?: string, title?: string): HTMLSpanElement;
export declare function pair(term: string, description: string, mono?: boolean): DocumentFragment;
export declare function formatBytes(bytes: number): string;
export declare function formatTime(iso: string): string;
/** `file://` is not a secure context, so the async clipboard API is unavailable. */
export declare function copyText(value: string): boolean;
//# sourceMappingURL=dom.d.ts.map