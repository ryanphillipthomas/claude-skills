import type { Page } from 'playwright';
import type { UiAtlasConfig, ViewportPreset } from '@ui-atlas/config';
import type { RunWriter } from '@ui-atlas/artifacts';
import { type CaptureKind, type CaptureRecord, type ElementIdentity, type StateName, type Viewport } from '@ui-atlas/protocol';
/**
 * A page prepared for one viewport. The runner never reuses the session's own
 * page: responsive replay must not disturb whatever the user is looking at.
 */
export interface ViewportTarget {
    page: Page;
    viewport: Viewport;
    viewportLabel: string;
    /** Warnings about this target itself, e.g. emulation that was unavailable. */
    warnings: string[];
    close(): Promise<void>;
}
/**
 * Builds a target for one preset. Implementations create a fresh browser
 * context so that touch, user agent and device scale factor are really applied
 * — a resized desktop window is not a phone.
 */
export type ViewportTargetFactory = (preset: ViewportPreset) => Promise<ViewportTarget>;
export interface ResponsiveRunnerOptions {
    config: UiAtlasConfig;
    writer: RunWriter;
    runId: string;
    project: string;
    createTarget: ViewportTargetFactory;
}
export interface ResponsiveRunRequest {
    /** Route to reload in each fresh context. */
    url: string;
    kind: CaptureKind;
    states: StateName[];
    identity?: ElementIdentity | undefined;
    /** Presets to run. Defaults to every configured viewport. */
    presets?: ViewportPreset[] | undefined;
    setId: string;
    onProgress?: ((message: string) => void) | undefined;
}
export interface ResponsiveRunResult {
    records: CaptureRecord[];
    warnings: string[];
}
/**
 * Replays a route across viewports, one fresh context each.
 *
 * The reload is the point: responsive JavaScript that only runs at initial load
 * will not re-run on a resize, so a resized window shows a layout the site would
 * never actually produce at that width. Every viewport therefore gets its own
 * context, its own navigation, its own settle pass and its own re-resolution of
 * the element.
 *
 * A component that is absent, hidden or ambiguous at one viewport is recorded as
 * `skipped` with a reason. It never fails the rest of the set.
 */
export declare class ResponsiveRunner {
    private readonly options;
    constructor(options: ResponsiveRunnerOptions);
    run(request: ResponsiveRunRequest): Promise<ResponsiveRunResult>;
    private runOne;
}
//# sourceMappingURL=responsive.d.ts.map