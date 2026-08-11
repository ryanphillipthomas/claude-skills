/**
 * Functions Playwright serialises into the inspected page.
 *
 * Real function literals, not strings: Playwright evaluates a string as a plain
 * expression and never calls it, and a literal stays type-checked against the
 * DOM. They must not close over anything from this module.
 */
import type { StyleSnapshot } from '@ui-atlas/protocol';
export interface StyleProbe {
    styles: StyleSnapshot;
    visibleDescendants: number;
    box: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
export declare function readStyles(element: Element, properties: readonly string[]): StyleProbe;
export interface StateFlags {
    checked: boolean;
    selected: boolean;
    expanded: boolean;
    disabled: boolean;
    focusVisible: boolean;
    focused: boolean;
    active: boolean;
    supportsChecked: boolean;
    supportsDisabled: boolean;
    tagName: string;
}
export declare function readStateFlags(element: Element): StateFlags;
export interface ForceRequest {
    attribute: string;
    attributeValue: string;
    property: string | null;
    propertyValue: boolean;
}
export interface ForceUndo {
    attribute: string | null;
    hadAttribute: boolean;
    previousAttribute: string | null;
    property: string | null;
    previousProperty: boolean | null;
}
/** Apply a forced attribute/property and describe exactly how to undo it. */
export declare function forceStateFlag(element: Element, request: ForceRequest): ForceUndo;
export declare function undoStateFlag(element: Element, undo: ForceUndo): boolean;
export declare function blurElement(element: Element): void;
export declare function blurActiveElement(): void;
export declare function documentMetrics(): {
    width: number;
    height: number;
};
export declare function snapshotBodyWithoutOverlay(): string;
/**
 * Remember which elements already carried an inline `style` attribute.
 *
 * Taking a screenshot makes Chromium materialise an empty `style=""` attribute
 * on some form controls. It changes nothing visually, but it is still a change
 * to the user's page, and the inspector promises to leave the page as it found
 * it — so we record the prior state and undo the difference afterwards.
 */
export declare function markInlineStyleOwners(): number;
/** Drop `style=""` attributes that were not there before the screenshot. */
export declare function removeIntroducedEmptyStyleAttributes(): number;
//# sourceMappingURL=page-scripts.d.ts.map