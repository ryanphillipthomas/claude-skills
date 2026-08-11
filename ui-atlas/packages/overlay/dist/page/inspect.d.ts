export interface InspectCallbacks {
    onHover(element: Element | undefined): void;
    onSelect(element: Element): void;
    onCancel(): void;
    /** Alt/Option + click asks the page to handle the click normally. */
    onInteract(element: Element): void;
}
/** True when `node` is part of the inspector's own UI. */
export declare function isOverlayNode(node: EventTarget | Node | null): boolean;
/**
 * Deepest element under the pointer, descending through open shadow roots and
 * ignoring the inspector's own layers. Closed shadow roots stop the descent —
 * that limitation is reported rather than silently ignored.
 */
export declare function deepElementFromPoint(x: number, y: number): Element | undefined;
/**
 * Owns every listener inspect mode installs. `disable()` removes all of them,
 * so normal page interaction returns exactly as it was.
 */
export declare class InspectMode {
    private readonly callbacks;
    private cleanups;
    private enabled;
    private hovered;
    constructor(callbacks: InspectCallbacks);
    get active(): boolean;
    get hoveredElement(): Element | undefined;
    enable(): void;
    disable(): void;
    private setHovered;
    private listen;
}
/** Move a selection to a neighbouring element, crossing open shadow roots. */
export declare function navigateFrom(element: Element, direction: 'parent' | 'child' | 'previous' | 'next'): Element | undefined;
//# sourceMappingURL=inspect.d.ts.map