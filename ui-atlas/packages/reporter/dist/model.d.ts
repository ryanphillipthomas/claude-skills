import type { CaptureRecord, CaptureStatus, PageRecord, ReadinessResult, RecipeStep, RunManifest, StateProvenance, StructuredError, StyleDelta } from '@ui-atlas/protocol';
/**
 * The view model the report ships with. Built here, in Node, so the browser
 * side is pure rendering and so the shape is unit-testable without a browser.
 *
 * Nothing derived from authentication is included: no storage state, no
 * cookies, no request headers, and no absolute filesystem paths — a run
 * directory is meant to be shareable.
 */
export interface ReportImage {
    /** Path relative to `report/index.html`, i.e. prefixed with `../`. */
    src: string;
    width: number;
    height: number;
    sha256: string;
    byteLength: number;
}
export interface ReportLocator {
    type: string;
    value: string;
    score: number;
    uniquenessCount: number;
    reasons: string[];
    attribute?: string;
    role?: string;
}
export interface ReportElement {
    tagName: string;
    role?: string;
    accessibleName?: string;
    textExcerpt?: string;
    fingerprint: string;
    chosen: ReportLocator;
    candidates: ReportLocator[];
    frameDepth: number;
    crossOriginFrame: boolean;
    shadowHostPath?: string[];
}
export interface ReportCapture {
    id: string;
    status: CaptureStatus;
    kind: string;
    stateName: string;
    provenance: StateProvenance;
    verified: boolean;
    verification?: string;
    viewportLabel: string;
    viewportWidth: number;
    viewportHeight: number;
    deviceScaleFactor: number;
    emulatedMobile: boolean;
    routeKey: string;
    finalUrl: string;
    capturedAt: string;
    durationMs: number;
    image?: ReportImage;
    element?: ReportElement;
    readiness: ReadinessResult;
    styleDelta?: StyleDelta;
    recipe?: RecipeStep[];
    setId?: string;
    setKind?: string;
    setMember?: string;
    warnings: string[];
    error?: StructuredError;
}
export interface MatrixCell {
    viewport: string;
    state: string;
    capture?: ReportCapture;
}
export interface ComponentGroup {
    /** Structural fingerprint, or a synthetic key for page-level captures. */
    key: string;
    label: string;
    sublabel: string;
    role?: string;
    routeKeys: string[];
    captureIds: string[];
    /** Ordered viewport labels seen for this component. */
    viewports: string[];
    /** Ordered state names seen for this component. */
    states: string[];
    cells: MatrixCell[];
    capturedCount: number;
    skippedCount: number;
    failedCount: number;
}
export interface DuplicateGroup {
    sha256: string;
    captureIds: string[];
}
export interface ReportFacets {
    routeKeys: string[];
    viewports: string[];
    states: string[];
    provenances: string[];
    statuses: string[];
    kinds: string[];
    roles: string[];
}
export interface ReportRun {
    runId: string;
    project: string;
    command: string;
    startedAt: string;
    finishedAt?: string;
    toolVersion: string;
    browserEngine: string;
    browserVersion?: string;
    browserMode: string;
    headless: boolean;
    /** Profile *name* only; never a path and never any stored credential. */
    profileName?: string;
    counts: {
        captured: number;
        failed: number;
        skipped: number;
        pages: number;
    };
    warnings: string[];
}
export interface ReportPage {
    requestedUrl: string;
    finalUrl: string;
    routeKey: string;
    title?: string;
    visitedAt: string;
    httpStatus?: number;
    warnings: string[];
    error?: StructuredError;
}
export interface ReportModel {
    schemaVersion: 1;
    generatedAt: string;
    run: ReportRun;
    captures: ReportCapture[];
    components: ComponentGroup[];
    duplicates: DuplicateGroup[];
    pages: ReportPage[];
    facets: ReportFacets;
    /** JSONL lines that could not be read, so the report never lies by omission. */
    unreadableRecords: number;
}
/**
 * Group captures into the things a designer thinks about. Element captures
 * group by structural fingerprint, so the same component photographed at five
 * viewports and four states is one row in the report. Page-level captures group
 * by route and kind.
 */
export declare function groupComponents(captures: ReportCapture[]): ComponentGroup[];
/** Exact-hash duplicate groups. Perceptual hashing is a later addition. */
export declare function groupDuplicates(captures: ReportCapture[]): DuplicateGroup[];
export declare function buildFacets(captures: ReportCapture[]): ReportFacets;
export interface BuildModelInput {
    manifest: RunManifest;
    captures: CaptureRecord[];
    pages: PageRecord[];
    unreadableRecords: number;
    generatedAt: string;
}
export declare function buildReportModel(input: BuildModelInput): ReportModel;
//# sourceMappingURL=model.d.ts.map