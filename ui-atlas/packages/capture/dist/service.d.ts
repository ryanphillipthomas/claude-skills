import type { Frame, Page } from 'playwright';
import type { UiAtlasConfig } from '@ui-atlas/config';
import { type RunWriter } from '@ui-atlas/artifacts';
import { type CaptureKind, type CaptureRecord, type CaptureSet, type ElementIdentity, type StateName, type Viewport } from '@ui-atlas/protocol';
/** How the caller hides its own UI so it never lands in an artifact. */
export interface OverlayControl {
    hide(): Promise<void>;
    show(): Promise<void>;
}
export interface CaptureServiceOptions {
    page: Page;
    writer: RunWriter;
    config: UiAtlasConfig;
    runId: string;
    project: string;
    viewport: Viewport;
    viewportLabel: string;
    overlay?: OverlayControl | undefined;
}
export interface CaptureOnceOptions {
    kind: CaptureKind;
    state: StateName;
    stateLabel?: string | undefined;
    identity?: ElementIdentity | undefined;
    /** Frame that owns the element. Defaults to the page's main frame. */
    frame?: Frame | undefined;
    includeOverlay?: boolean | undefined;
    set?: CaptureSet | undefined;
    /** URL the user asked for, when it differs from the page's current URL. */
    sourceUrl?: string | undefined;
    /**
     * What it means for the element to be missing, ambiguous or invisible.
     *
     * `fail` (default) treats it as a defect: you asked for a specific element
     * and it was not there. `skip` treats it as an observation, which is what a
     * responsive set needs — a component that is legitimately absent or hidden at
     * one breakpoint is a result, not a broken run.
     */
    elementAbsentOutcome?: 'fail' | 'skip' | undefined;
}
/**
 * Runs one capture end to end: re-resolve → settle → state → hide overlay →
 * screenshot → restore. Every failure becomes a `failed` record rather than
 * terminating the run.
 */
export declare class CaptureService {
    private options;
    private readonly pointer;
    constructor(options: CaptureServiceOptions);
    /** Record subsequent captures against a new viewport. */
    setViewport(viewport: Viewport, viewportLabel: string): void;
    get viewport(): Viewport;
    get page(): Page;
    private get overlay();
    capture(request: CaptureOnceOptions): Promise<CaptureRecord>;
    /** Run a page function in every frame, ignoring frames that have gone away. */
    private eachFrame;
    private takeScreenshot;
    private writeRecord;
}
//# sourceMappingURL=service.d.ts.map