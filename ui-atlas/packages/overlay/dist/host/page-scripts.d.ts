/**
 * Host-side functions Playwright serialises into the page. Real function
 * literals, never strings: Playwright evaluates a string as a plain expression
 * and would never call it.
 */
import type { ElementProbe, HostEvent } from '@ui-atlas/protocol';
export declare function hideOverlayHosts(attribute: string): number;
export declare function showOverlayHosts(attribute: string): number;
export declare function dispatchToOverlay(event: HostEvent): boolean;
export declare function isOverlayMounted(): boolean;
export declare function probeWithInstalledProbe(element: Element): ElementProbe;
//# sourceMappingURL=page-scripts.d.ts.map