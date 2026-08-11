/**
 * A non-layout-shifting highlight. Everything lives inside the overlay's shadow
 * root in a fixed-position, pointer-events-none layer, so pointing at an
 * element never moves the page or steals its events.
 */
export interface HighlightOptions {
    showBoxModel: boolean;
}
export declare class Highlight {
    private readonly layer;
    private readonly hoverBox;
    private readonly selectedBox;
    private readonly marginBox;
    private readonly paddingBox;
    private readonly label;
    private options;
    constructor(root: ShadowRoot, options: HighlightOptions);
    setOptions(options: HighlightOptions): void;
    showHover(element: Element, caption: string): void;
    hideHover(): void;
    showSelected(element: Element): void;
    hideSelected(): void;
    /** Re-measure a still-selected element after scroll, resize or layout change. */
    refreshSelected(element: Element | undefined): void;
    private showBoxModel;
    destroy(): void;
}
//# sourceMappingURL=highlight.d.ts.map