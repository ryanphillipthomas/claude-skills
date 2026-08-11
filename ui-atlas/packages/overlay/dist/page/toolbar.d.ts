import type { ElementIdentity, OverlaySession, QueueJob, StateName } from '@ui-atlas/protocol';
export interface CaptureIntent {
    kind: 'element' | 'viewport' | 'full-page';
    states: StateName[];
    responsive: boolean;
    includeOverlay: boolean;
    label?: string;
}
export interface ToolbarCallbacks {
    onToggleInspect(): void;
    onCapture(intent: CaptureIntent): void;
    onSetViewport(width: number, height: number, presetName?: string): void;
    onClearSelection(): void;
    onToggleBoxModel(next: boolean): void;
}
export interface SelectionView {
    identity: ElementIdentity;
    resolution: {
        matches: number;
        usedCandidateIndex: number;
        fellBack: boolean;
    };
    warnings: string[];
}
/**
 * The inspector's chrome. Every control maps to one host operation; nothing in
 * here touches the page's own DOM.
 */
export declare class Toolbar {
    readonly element: HTMLDivElement;
    private readonly callbacks;
    private session;
    private selection;
    private selectedStates;
    private inspectActive;
    private boxModel;
    private readonly runLabel;
    private readonly inspectButton;
    private readonly boxModelButton;
    private readonly detailsHost;
    private readonly stateRow;
    private readonly viewportRow;
    private readonly captureRow;
    private readonly jobList;
    private readonly noticeHost;
    private readonly helpHost;
    private readonly widthInput;
    private readonly heightInput;
    constructor(root: ShadowRoot, callbacks: ToolbarCallbacks);
    setSession(session: OverlaySession): void;
    setInspectActive(active: boolean): void;
    setSelection(selection: SelectionView | undefined): void;
    renderJobs(jobs: QueueJob[]): void;
    notice(level: 'info' | 'warn' | 'error', message: string): void;
    clearNotice(): void;
    get states(): StateName[];
    private renderStates;
    private renderViewportPresets;
    private renderCaptureButtons;
    private renderSelection;
    private renderHelp;
    setVisible(visible: boolean): void;
}
//# sourceMappingURL=toolbar.d.ts.map