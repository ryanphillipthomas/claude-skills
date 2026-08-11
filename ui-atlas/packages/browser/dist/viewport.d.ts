import type { ViewportPreset } from '@ui-atlas/config';
import type { Viewport } from '@ui-atlas/protocol';
/**
 * A resized desktop viewport is not the same thing as a phone: emulation also
 * changes the user agent, touch capability and device scale factor. Both are
 * recorded on every capture so the report never conflates them.
 */
export declare function resolveViewport(preset: ViewportPreset): Viewport;
export declare function mobileUserAgent(browserVersion: string | undefined): string;
export interface EmulationOptions {
    viewport: {
        width: number;
        height: number;
    };
    deviceScaleFactor: number;
    isMobile: boolean;
    hasTouch: boolean;
    userAgent?: string;
}
/** Playwright context options for a resolved viewport. */
export declare function emulationOptions(viewport: Viewport, browserVersion?: string | undefined): EmulationOptions;
export declare function viewportLabel(viewport: Viewport): string;
//# sourceMappingURL=viewport.d.ts.map