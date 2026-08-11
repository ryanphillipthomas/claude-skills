import type { Page } from 'playwright';
import { RunWriter } from '@ui-atlas/artifacts';
import { type BrowserSession } from '@ui-atlas/browser';
import { CaptureQueue, CaptureService, type ResponsiveRunResult } from '@ui-atlas/capture';
import type { UiAtlasConfig } from '@ui-atlas/config';
import { OverlayController, type BridgeSource } from '@ui-atlas/overlay';
import { type ElementIdentity, type ElementProbe, type OverlaySession, type PageRecord, type QueueJob, type RunManifest, type StateName, type StillCaptureKind, type Viewport } from '@ui-atlas/protocol';
import type { Logger } from './logger.js';
export interface StartSessionOptions {
    config: UiAtlasConfig;
    outputRoot: string;
    command: string;
    toolVersion: string;
    logger: Logger;
    /** Inject the inspector overlay. `capture` runs without it. */
    overlay: boolean;
}
/**
 * One live UI Atlas run: a browser, one page, the artifact writer, the capture
 * service, and (for `inspect`) the injected overlay wired to the host bridge.
 */
export declare class AtlasSession {
    readonly runId: string;
    readonly page: Page;
    readonly writer: RunWriter;
    readonly captures: CaptureService;
    readonly queue: CaptureQueue;
    readonly overlay: OverlayController;
    readonly browser: BrowserSession;
    private readonly options;
    private viewport;
    private selection;
    private constructor();
    static start(options: StartSessionOptions): Promise<AtlasSession>;
    navigate(url: string): Promise<PageRecord>;
    describeSession(): OverlaySession;
    handleSelection(source: BridgeSource, probe: ElementProbe): Promise<{
        identity: ElementIdentity;
        resolution: {
            matches: number;
            usedCandidateIndex: number;
            fellBack: boolean;
        };
        warnings: string[];
    }>;
    clearSelection(): void;
    get selectedIdentity(): ElementIdentity | undefined;
    handleCaptureRequest(source: BridgeSource, request: {
        kind: 'element' | 'viewport' | 'full-page' | 'animation-frame' | 'animation-video';
        states: StateName[];
        includeOverlay: boolean;
        responsive: boolean;
        label?: string | undefined;
        probe?: ElementProbe | undefined;
    }): Promise<QueueJob[]>;
    /**
     * Queue a responsive set. It replays the current route in a fresh context per
     * viewport, so responsive JavaScript that only runs at load initialises
     * properly — a resized window would show a layout the site never produces.
     */
    private enqueueResponsive;
    /**
     * Replay a route across every configured viewport, one fresh context each.
     * Public so the CLI can await a set directly instead of going through the
     * inspector's queue.
     */
    runResponsive(input: {
        kind: StillCaptureKind;
        states: StateName[];
        identity?: ElementIdentity | undefined;
        url?: string | undefined;
        onProgress?: ((message: string) => void) | undefined;
    }): Promise<ResponsiveRunResult>;
    /**
     * A fresh context for one preset, seeded with the live session's cookies so a
     * signed-in replay stays signed in. The session's own page is never touched.
     */
    private createViewportTarget;
    applyViewport(width: number, height: number, presetName?: string): Promise<Viewport>;
    get currentViewport(): Viewport;
    /** Resolves when the user closes the browser window. */
    waitForClose(): Promise<void>;
    close(): Promise<RunManifest>;
}
//# sourceMappingURL=session.d.ts.map