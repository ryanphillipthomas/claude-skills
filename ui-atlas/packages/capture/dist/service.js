import { newCaptureId, routeKeyFromUrl } from '@ui-atlas/artifacts';
import { describeCandidate, resolveElement } from '@ui-atlas/identity';
import { settlePage, waitAnimationFrames } from '@ui-atlas/settle';
import { SCHEMA_VERSION, toStructuredError, UiAtlasError, } from '@ui-atlas/protocol';
import { documentMetrics, markInlineStyleOwners, removeIntroducedEmptyStyleAttributes, } from './page-scripts.js';
import { PointerTracker } from './pointer.js';
import { applyState } from './state-controller.js';
import { deltaHasEvidence, diffStyles, probeStyles } from './style-diff.js';
const NO_OVERLAY = { hide: async () => undefined, show: async () => undefined };
/**
 * Runs one capture end to end: re-resolve → settle → state → hide overlay →
 * screenshot → restore. Every failure becomes a `failed` record rather than
 * terminating the run.
 */
export class CaptureService {
    options;
    pointer = new PointerTracker();
    constructor(options) {
        this.options = options;
    }
    /** Record subsequent captures against a new viewport. */
    setViewport(viewport, viewportLabel) {
        this.options = { ...this.options, viewport, viewportLabel };
    }
    get viewport() {
        return this.options.viewport;
    }
    get page() {
        return this.options.page;
    }
    get overlay() {
        return this.options.overlay ?? NO_OVERLAY;
    }
    async capture(request) {
        const startedAt = Date.now();
        const captureId = newCaptureId();
        const warnings = [];
        const steps = [];
        const { config, page, writer } = this.options;
        let readiness;
        let application;
        let styleDelta;
        let resolvedIdentity = request.identity;
        let locator;
        try {
            if (request.identity !== undefined) {
                const skipOnAbsent = request.elementAbsentOutcome === 'skip';
                let resolution;
                try {
                    resolution = await resolveElement(request.frame ?? page, request.identity, {
                        expectedBox: request.identity.boundingBox,
                    });
                }
                catch (error) {
                    // `locator.not-found` and `locator.ambiguous` are honest outcomes for
                    // a responsive replay: the component simply is not there, or cannot be
                    // told apart, at this viewport.
                    if (!skipOnAbsent)
                        throw error;
                    const structured = toStructuredError(error, 'locator.not-found');
                    warnings.push(structured.message);
                    return await this.writeRecord({
                        captureId,
                        request,
                        status: 'skipped',
                        state: unverifiedState(request.state, 'the element was not resolvable here'),
                        identity: request.identity,
                        readiness,
                        steps,
                        warnings,
                        durationMs: Date.now() - startedAt,
                        error: structured,
                    });
                }
                locator = resolution.locator;
                warnings.push(...resolution.warnings);
                if (resolution.fellBack) {
                    warnings.push(`re-resolved with fallback candidate ${describeCandidate(resolution.candidate)}`);
                }
                resolvedIdentity = { ...request.identity, chosenLocator: resolution.candidate };
                steps.push({ action: 'select', target: describeCandidate(resolution.candidate) });
                // An element that exists but is not rendered cannot be photographed.
                // Callers running a responsive set want that recorded, not retried.
                const visible = await locator.isVisible().catch(() => false);
                if (!visible) {
                    const message = 'element is present but not visible';
                    if (!skipOnAbsent) {
                        warnings.push(`${message}; the capture will probably fail`);
                    }
                    else {
                        warnings.push(message);
                        return await this.writeRecord({
                            captureId,
                            request,
                            status: 'skipped',
                            state: unverifiedState(request.state, message),
                            identity: resolvedIdentity,
                            readiness,
                            steps,
                            warnings,
                            durationMs: Date.now() - startedAt,
                            error: { code: 'locator.hidden', message },
                        });
                    }
                }
            }
            readiness = await settlePage(page, { config: config.settle, target: locator });
            warnings.push(...readiness.warnings);
            application = await applyState({
                page,
                locator,
                config: config.capture,
                pointer: this.pointer,
                timeoutMs: config.capture.screenshotTimeoutMs,
            }, request.state, request.stateLabel);
            steps.push(...application.steps);
            if (application.skipped !== undefined) {
                warnings.push(application.skipped);
                return await this.writeRecord({
                    captureId,
                    request,
                    status: 'skipped',
                    state: application.state,
                    identity: resolvedIdentity,
                    readiness,
                    steps,
                    warnings,
                    durationMs: Date.now() - startedAt,
                    error: {
                        code: 'state.unsupported',
                        message: application.skipped,
                    },
                });
            }
            if (locator !== undefined && application.before !== undefined) {
                const after = await probeStyles(locator, config.capture.screenshotTimeoutMs).catch(() => undefined);
                if (after !== undefined) {
                    styleDelta = diffStyles(application.before, after);
                    if (request.state !== 'default' && !deltaHasEvidence(styleDelta)) {
                        warnings.push(`no computed-style change was observed for state "${request.state}"`);
                    }
                }
            }
            const includeOverlay = request.includeOverlay === true;
            let bytes;
            if (!includeOverlay)
                await this.overlay.hide();
            await this.eachFrame(markInlineStyleOwners);
            try {
                // Two frames after hiding the inspector so the paint matches the DOM.
                await waitAnimationFrames(page, Math.max(2, config.settle.animationFrames));
                bytes = await this.takeScreenshot(request.kind, locator, warnings);
            }
            finally {
                await this.eachFrame(removeIntroducedEmptyStyleAttributes);
                if (!includeOverlay)
                    await this.overlay.show().catch(() => undefined);
            }
            steps.push({ action: 'capture', target: request.kind });
            const image = await writer.writeScreenshot({
                routeKey: routeKeyFromUrl(page.url()),
                viewportLabel: this.options.viewportLabel,
                captureId,
            }, bytes);
            return await this.writeRecord({
                captureId,
                request,
                status: 'captured',
                state: application.state,
                identity: resolvedIdentity,
                readiness,
                steps,
                warnings,
                styleDelta,
                image,
                durationMs: Date.now() - startedAt,
            });
        }
        catch (error) {
            const structured = toStructuredError(error, 'capture.failed');
            return await this.writeRecord({
                captureId,
                request,
                status: 'failed',
                state: application?.state ?? {
                    name: request.state,
                    provenance: 'observed',
                    verified: false,
                    verification: 'capture failed before the state was confirmed',
                },
                identity: resolvedIdentity,
                readiness,
                steps,
                warnings,
                durationMs: Date.now() - startedAt,
                error: structured,
            });
        }
        finally {
            // Cleanup always runs: mouse buttons, modifier keys, forced attributes.
            await application?.cleanup().catch(() => undefined);
            await this.pointer.releaseButtons(this.options.page).catch(() => undefined);
        }
    }
    /** Run a page function in every frame, ignoring frames that have gone away. */
    async eachFrame(pageFunction) {
        await Promise.all(this.options.page.frames().map((frame) => frame.evaluate(pageFunction).catch(() => 0)));
    }
    async takeScreenshot(kind, locator, warnings) {
        const { config, page } = this.options;
        const common = {
            type: 'png',
            animations: config.capture.disableAnimations ? 'disabled' : 'allow',
            caret: 'hide',
            timeout: config.capture.screenshotTimeoutMs,
            mask: config.capture.masks.map((selector) => page.locator(selector)),
            maskColor: config.capture.maskColor,
        };
        switch (kind) {
            case 'element': {
                if (locator === undefined) {
                    throw new UiAtlasError('capture.failed', 'element capture requires a selected element');
                }
                if (config.capture.elementPaddingPx > 0) {
                    const box = await locator.boundingBox({ timeout: config.capture.screenshotTimeoutMs });
                    if (box === null)
                        throw new UiAtlasError('locator.hidden', 'element has no visible box');
                    const pad = config.capture.elementPaddingPx;
                    return page.screenshot({
                        ...common,
                        clip: {
                            x: Math.max(0, box.x - pad),
                            y: Math.max(0, box.y - pad),
                            width: box.width + pad * 2,
                            height: box.height + pad * 2,
                        },
                    });
                }
                return locator.screenshot(common);
            }
            case 'viewport':
                return page.screenshot({ ...common, fullPage: false });
            case 'full-page': {
                const metrics = await page.evaluate(documentMetrics);
                const cap = config.capture.fullPageMaxHeightPx;
                if (metrics.height > cap) {
                    warnings.push(`full-page capture truncated at ${cap}px (document is ${Math.round(metrics.height)}px tall)`);
                    return page.screenshot({
                        ...common,
                        clip: { x: 0, y: 0, width: metrics.width, height: cap },
                    });
                }
                return page.screenshot({ ...common, fullPage: true });
            }
            case 'animation-frame':
            case 'animation-video':
                throw new UiAtlasError('capture.failed', `${kind} capture is not implemented yet`);
            default: {
                const exhaustive = kind;
                throw new UiAtlasError('capture.failed', `unknown capture kind ${String(exhaustive)}`);
            }
        }
    }
    async writeRecord(input) {
        const { page, writer, viewport, project, runId } = this.options;
        const finalUrl = safeUrl(page);
        const record = {
            schemaVersion: SCHEMA_VERSION,
            id: input.captureId,
            runId,
            project,
            sourceUrl: input.request.sourceUrl ?? finalUrl,
            finalUrl,
            routeKey: routeKeyFromUrl(finalUrl),
            capturedAt: new Date().toISOString(),
            kind: input.request.kind,
            status: input.status,
            state: input.state,
            viewport,
            readiness: input.readiness ?? emptyReadiness(),
            durationMs: input.durationMs,
            warnings: dedupe(input.warnings),
        };
        if (input.identity !== undefined)
            record.element = input.identity;
        if (input.steps.length > 0)
            record.interactionRecipe = input.steps;
        if (input.styleDelta !== undefined)
            record.styleDelta = input.styleDelta;
        if (input.request.set !== undefined)
            record.set = input.request.set;
        if (input.image !== undefined)
            record.image = input.image;
        if (input.error !== undefined)
            record.error = input.error;
        return writer.addCapture(record);
    }
}
/** State stub for a record where the state was never actually applied. */
function unverifiedState(name, verification) {
    return { name, provenance: 'observed', verified: false, verification };
}
function safeUrl(page) {
    try {
        return page.url();
    }
    catch {
        return 'about:blank';
    }
}
function dedupe(values) {
    return [...new Set(values)];
}
function emptyReadiness() {
    return {
        startedAt: new Date().toISOString(),
        durationMs: 0,
        deadlineMs: 0,
        deadlineExceeded: false,
        checks: [],
        warnings: ['readiness was not evaluated for this record'],
    };
}
//# sourceMappingURL=service.js.map