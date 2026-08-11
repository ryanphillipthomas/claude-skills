import { emptyManifest, newPageId, newRunId, newSessionToken, routeKeyFromUrl, RunWriter, } from '@ui-atlas/artifacts';
import { emulationOptions, launchSession, resolveViewport, viewportLabel, } from '@ui-atlas/browser';
import { CaptureQueue, CaptureService, ResponsiveRunner, } from '@ui-atlas/capture';
import { buildElementIdentity, buildFramePath, resolveElement } from '@ui-atlas/identity';
import { buildBootstrapScript, createBridgeHandler, loadOverlayBundle, loadProbeBundle, OverlayController, } from '@ui-atlas/overlay';
import { settlePage } from '@ui-atlas/settle';
import { BRIDGE_BINDING, SCHEMA_VERSION, toStructuredError, UiAtlasError, } from '@ui-atlas/protocol';
/**
 * One live UI Atlas run: a browser, one page, the artifact writer, the capture
 * service, and (for `inspect`) the injected overlay wired to the host bridge.
 */
export class AtlasSession {
    runId;
    page;
    writer;
    captures;
    queue;
    overlay;
    browser;
    options;
    viewport;
    selection;
    constructor(runId, page, writer, captures, queue, overlay, browser, options, viewport) {
        this.runId = runId;
        this.page = page;
        this.writer = writer;
        this.captures = captures;
        this.queue = queue;
        this.overlay = overlay;
        this.browser = browser;
        this.options = options;
        this.viewport = viewport;
    }
    static async start(options) {
        const { config, logger } = options;
        const runId = newRunId();
        const viewport = resolveViewport({
            name: 'base',
            width: config.viewport.width,
            height: config.viewport.height,
            mode: 'desktop',
            deviceScaleFactor: config.viewport.deviceScaleFactor,
        });
        const writer = new RunWriter(options.outputRoot, emptyManifest({
            runId,
            project: config.project,
            command: options.command,
            toolVersion: options.toolVersion,
            baseViewport: viewport,
            browser: {
                engine: 'chromium',
                mode: config.browser.mode,
                headless: config.browser.headless,
                ...(config.browser.profile === undefined ? {} : { profileName: config.browser.profile }),
            },
        }));
        await writer.init();
        // The handler closure needs the session, which needs the browser, which
        // needs the handler. A late-bound holder breaks the cycle.
        const holder = {};
        const token = newSessionToken();
        const initScripts = [];
        const bindings = [];
        // The probe is always available: selector-driven captures and the
        // inspector must describe elements exactly the same way.
        initScripts.push({ content: await loadProbeBundle() });
        if (options.overlay && config.overlay.enabled) {
            const bundle = await loadOverlayBundle();
            initScripts.push({
                content: buildBootstrapScript(bundle, {
                    token,
                    version: options.toolVersion,
                    autoInspect: config.overlay.autoInspect,
                    shortcuts: config.overlay.shortcuts,
                }),
            });
            const dispatch = createBridgeHandler(token, {
                hello: async () => ({ session: (await waitForSession(holder)).describeSession() }),
                'element/selected': async (source, params) => {
                    const session = requireSession(holder);
                    return session.handleSelection(source, params.probe);
                },
                'element/cleared': async () => {
                    requireSession(holder).clearSelection();
                    return {};
                },
                'capture/request': async (source, params) => {
                    const session = requireSession(holder);
                    return { jobs: await session.handleCaptureRequest(source, params) };
                },
                'queue/list': async () => ({ jobs: requireSession(holder).queue.list() }),
                'viewport/set': async (_source, params) => {
                    const session = requireSession(holder);
                    return { viewport: await session.applyViewport(params.width, params.height, params.presetName) };
                },
                'inspect/mode': async (_source, params) => {
                    const session = requireSession(holder);
                    await session.overlay.broadcast({ type: 'inspect/mode', active: params.active });
                    return { active: params.active };
                },
                log: async (_source, params) => {
                    logger[params.level](`[page] ${params.message}`, params.detail);
                    return {};
                },
            }, { onError: (error) => logger.error('bridge handler failed', toStructuredError(error)) });
            bindings.push({
                name: BRIDGE_BINDING,
                handler: (source, ...args) => dispatch(source, args[0]),
            });
        }
        const browser = await launchSession({
            config: config.browser,
            viewport,
            initScripts,
            bindings,
        });
        for (const warning of browser.warnings) {
            logger.warn(warning);
            writer.addWarning(warning);
        }
        const page = browser.context.pages()[0] ?? (await browser.context.newPage());
        page.setDefaultTimeout(config.browser.navigationTimeoutMs);
        const overlay = new OverlayController(page);
        const captures = new CaptureService({
            page,
            writer,
            config,
            runId,
            project: config.project,
            viewport,
            viewportLabel: viewportLabel(viewport),
            overlay: options.overlay ? overlay : undefined,
        });
        const queue = new CaptureQueue((job) => {
            void overlay.dispatch({ type: 'queue/update', job });
        });
        const session = new AtlasSession(runId, page, writer, captures, queue, overlay, browser, options, viewport);
        holder.session = session;
        page.on('framenavigated', (frame) => {
            if (frame !== page.mainFrame())
                return;
            if (session.selection !== undefined) {
                session.selection = undefined;
                void overlay.dispatch({
                    type: 'selection/invalidated',
                    reason: 'The page navigated, so the previous selection no longer applies.',
                });
            }
        });
        return session;
    }
    /* ---------------------------------------------------------------------- */
    /* Navigation                                                              */
    /* ---------------------------------------------------------------------- */
    async navigate(url) {
        const visitedAt = new Date().toISOString();
        const warnings = [];
        let httpStatus;
        try {
            const response = await this.page.goto(url, {
                waitUntil: this.options.config.settle.loadState,
                timeout: this.options.config.browser.navigationTimeoutMs,
            });
            httpStatus = response?.status();
        }
        catch (error) {
            const record = {
                schemaVersion: SCHEMA_VERSION,
                id: newPageId(),
                runId: this.runId,
                requestedUrl: url,
                finalUrl: this.page.url(),
                routeKey: routeKeyFromUrl(url),
                visitedAt,
                warnings,
                error: toStructuredError(error, 'capture.timeout'),
            };
            return this.writer.addPage(record);
        }
        const readiness = await settlePage(this.page, { config: this.options.config.settle });
        warnings.push(...readiness.warnings);
        const record = {
            schemaVersion: SCHEMA_VERSION,
            id: newPageId(),
            runId: this.runId,
            requestedUrl: url,
            finalUrl: this.page.url(),
            routeKey: routeKeyFromUrl(this.page.url()),
            title: await this.page.title().catch(() => undefined),
            visitedAt,
            readiness,
            warnings,
            ...(httpStatus === undefined ? {} : { httpStatus }),
        };
        return this.writer.addPage(record);
    }
    /* ---------------------------------------------------------------------- */
    /* Bridge operations                                                       */
    /* ---------------------------------------------------------------------- */
    describeSession() {
        const { config } = this.options;
        return {
            protocolVersion: 1,
            runId: this.runId,
            project: config.project,
            outputLabel: `${config.project}/${this.runId}`,
            viewportPresets: config.viewports.map(resolveViewport),
            shortcuts: config.overlay.shortcuts,
            capabilities: {
                fullPage: true,
                responsive: true,
                animation: false,
                states: ['default', 'hover', 'focus', 'focus-visible', 'active', 'checked', 'selected', 'expanded', 'disabled'],
            },
        };
    }
    async handleSelection(source, probe) {
        const framePath = await buildFramePath(source.frame);
        const identity = buildElementIdentity(probe, framePath);
        const resolution = await resolveElement(source.frame, identity, {
            expectedBox: identity.boundingBox,
        });
        const chosen = { ...identity, chosenLocator: resolution.candidate };
        this.selection = { identity: chosen, frame: source.frame };
        return {
            identity: chosen,
            resolution: {
                matches: resolution.matches,
                usedCandidateIndex: resolution.usedCandidateIndex,
                fellBack: resolution.fellBack,
            },
            warnings: resolution.warnings,
        };
    }
    clearSelection() {
        this.selection = undefined;
    }
    get selectedIdentity() {
        return this.selection?.identity;
    }
    async handleCaptureRequest(source, request) {
        if (request.kind === 'animation-frame' || request.kind === 'animation-video') {
            throw new UiAtlasError('state.unsupported', 'Animation capture lands in phase 4.');
        }
        let identity;
        let frame;
        if (request.kind === 'element') {
            if (request.probe !== undefined) {
                const selected = await this.handleSelection(source, request.probe);
                identity = selected.identity;
                frame = source.frame;
            }
            else if (this.selection !== undefined) {
                identity = this.selection.identity;
                frame = this.selection.frame;
            }
            else {
                throw new UiAtlasError('locator.not-found', 'no element is selected');
            }
        }
        const states = request.states.length > 0 ? request.states : ['default'];
        const label = request.label ?? `${request.kind} · ${states.join(', ')}`;
        if (request.responsive) {
            return [this.enqueueResponsive({ kind: request.kind, states, identity, label })];
        }
        const job = this.queue.enqueue({
            kind: request.kind,
            states,
            label,
            run: async (report) => {
                const captureIds = [];
                const warnings = [];
                const setId = states.length > 1 ? `set-${this.runId}-${String(Date.now())}` : undefined;
                for (const state of states) {
                    report(`${state} (${String(captureIds.length + 1)}/${String(states.length)})`);
                    const record = await this.captures.capture({
                        kind: request.kind,
                        state,
                        identity,
                        frame,
                        includeOverlay: request.includeOverlay,
                        ...(setId === undefined ? {} : { set: { id: setId, kind: 'state', member: state } }),
                    });
                    captureIds.push(record.id);
                    warnings.push(...record.warnings);
                    if (record.status === 'failed' && record.error !== undefined) {
                        warnings.push(`${state}: ${record.error.code} — ${record.error.message}`);
                    }
                }
                return { captureIds, warnings };
            },
        });
        return [job];
    }
    /**
     * Queue a responsive set. It replays the current route in a fresh context per
     * viewport, so responsive JavaScript that only runs at load initialises
     * properly — a resized window would show a layout the site never produces.
     */
    enqueueResponsive(input) {
        const url = this.page.url();
        return this.queue.enqueue({
            kind: input.kind,
            states: input.states,
            label: `${input.label} · ${String(this.options.config.viewports.length)} viewports`,
            run: async (report) => {
                const result = await this.runResponsive({
                    url,
                    kind: input.kind,
                    states: input.states,
                    identity: input.identity,
                    onProgress: report,
                });
                const warnings = [...result.warnings];
                for (const record of result.records) {
                    warnings.push(...record.warnings);
                    if (record.status !== 'captured' && record.error !== undefined) {
                        const viewport = record.set?.member ?? 'viewport';
                        warnings.push(`${viewport}: ${record.error.code} — ${record.error.message}`);
                    }
                }
                return { captureIds: result.records.map((record) => record.id), warnings };
            },
        });
    }
    /**
     * Replay a route across every configured viewport, one fresh context each.
     * Public so the CLI can await a set directly instead of going through the
     * inspector's queue.
     */
    async runResponsive(input) {
        const runner = new ResponsiveRunner({
            config: this.options.config,
            writer: this.writer,
            runId: this.runId,
            project: this.options.config.project,
            createTarget: (preset) => this.createViewportTarget(preset),
        });
        return runner.run({
            url: input.url ?? this.page.url(),
            kind: input.kind,
            states: input.states,
            identity: input.identity,
            setId: `responsive-${this.runId}-${String(Date.now())}`,
            onProgress: input.onProgress,
        });
    }
    /**
     * A fresh context for one preset, seeded with the live session's cookies so a
     * signed-in replay stays signed in. The session's own page is never touched.
     */
    async createViewportTarget(preset) {
        const viewport = resolveViewport(preset);
        const label = viewportLabel(viewport);
        const browser = this.browser.browser;
        const { config } = this.options;
        // A persistent profile owns its only context, so real device emulation is
        // unavailable there. Degrade to a resized page and say so on every record.
        if (browser === undefined) {
            const page = await this.browser.context.newPage();
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            const degraded = { ...viewport, mobile: false, hasTouch: false, userAgentClass: 'desktop' };
            return {
                page,
                viewport: degraded,
                viewportLabel: label,
                warnings: preset.mode === 'mobile'
                    ? [
                        `${preset.name} was resized rather than emulated: browser.mode "${config.browser.mode}" ` +
                            'owns a single persistent context. Use clean or storage-state mode for true mobile emulation.',
                    ]
                    : [],
                close: async () => {
                    await page.close().catch(() => undefined);
                },
            };
        }
        const storageState = await this.browser.context.storageState().catch(() => undefined);
        const context = await browser.newContext({
            ...emulationOptions(viewport, this.browser.browserVersion),
            locale: config.browser.locale,
            colorScheme: config.browser.colorScheme,
            reducedMotion: config.browser.reducedMotion,
            ignoreHTTPSErrors: config.browser.ignoreHttpsErrors,
            ...(config.browser.timezoneId === undefined ? {} : { timezoneId: config.browser.timezoneId }),
            ...(storageState === undefined ? {} : { storageState }),
        });
        context.setDefaultNavigationTimeout(config.browser.navigationTimeoutMs);
        const page = await context.newPage();
        return {
            page,
            viewport,
            viewportLabel: label,
            warnings: [],
            close: async () => {
                await context.close().catch(() => undefined);
            },
        };
    }
    async applyViewport(width, height, presetName) {
        await this.page.setViewportSize({ width, height });
        const preset = this.options.config.viewports.find((item) => item.name === presetName);
        const next = resolveViewport({
            name: presetName ?? `${String(width)}x${String(height)}`,
            width,
            height,
            // A viewport resize is not device emulation; only presets carry that.
            mode: 'desktop',
            ...(preset?.deviceScaleFactor === undefined ? {} : { deviceScaleFactor: preset.deviceScaleFactor }),
        });
        this.viewport = next;
        this.captures.setViewport(next, viewportLabel(next));
        if (preset?.mode === 'mobile') {
            await this.overlay.dispatch({
                type: 'notice',
                level: 'warn',
                message: `${presetName ?? 'preset'} is a mobile preset: this resize does not change user agent, touch or device scale. Full emulation needs a fresh context (phase 2).`,
            });
        }
        return next;
    }
    get currentViewport() {
        return this.viewport;
    }
    /* ---------------------------------------------------------------------- */
    /* Lifecycle                                                               */
    /* ---------------------------------------------------------------------- */
    /** Resolves when the user closes the browser window. */
    async waitForClose() {
        if (this.page.isClosed())
            return;
        await new Promise((resolve) => {
            const done = () => resolve();
            this.page.once('close', done);
            this.browser.context.once('close', done);
        });
    }
    async close() {
        await this.queue.drain().catch(() => undefined);
        const manifest = await this.writer.finalize({
            ...(this.browser.browserVersion === undefined
                ? {}
                : { browserVersion: this.browser.browserVersion }),
        });
        await this.browser.close();
        return manifest;
    }
}
function requireSession(holder) {
    if (holder.session === undefined) {
        throw new UiAtlasError('internal', 'session is not ready yet');
    }
    return holder.session;
}
/**
 * The overlay mounts on `about:blank` before `AtlasSession.start` has finished
 * assembling itself, so `hello` waits briefly rather than reporting a fake
 * session description.
 */
async function waitForSession(holder, timeoutMs = 5_000) {
    const started = Date.now();
    while (holder.session === undefined && Date.now() - started < timeoutMs) {
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return requireSession(holder);
}
//# sourceMappingURL=session.js.map