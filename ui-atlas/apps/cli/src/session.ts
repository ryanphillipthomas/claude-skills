import type { Frame, Page } from 'playwright';
import {
  emptyManifest,
  newPageId,
  newRunId,
  newSessionToken,
  routeKeyFromUrl,
  RunWriter,
} from '@ui-atlas/artifacts';
import {
  launchSession,
  resolveViewport,
  viewportLabel,
  type BrowserSession,
} from '@ui-atlas/browser';
import { CaptureQueue, CaptureService } from '@ui-atlas/capture';
import type { UiAtlasConfig } from '@ui-atlas/config';
import { buildElementIdentity, buildFramePath, resolveElement } from '@ui-atlas/identity';
import {
  buildBootstrapScript,
  createBridgeHandler,
  loadOverlayBundle,
  loadProbeBundle,
  OverlayController,
  type BridgeSource,
} from '@ui-atlas/overlay';
import { settlePage } from '@ui-atlas/settle';
import {
  BRIDGE_BINDING,
  SCHEMA_VERSION,
  toStructuredError,
  UiAtlasError,
  type ElementIdentity,
  type ElementProbe,
  type OverlaySession,
  type PageRecord,
  type QueueJob,
  type RunManifest,
  type StateName,
  type Viewport,
} from '@ui-atlas/protocol';
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

interface Selection {
  identity: ElementIdentity;
  frame: Frame;
}

/**
 * One live UI Atlas run: a browser, one page, the artifact writer, the capture
 * service, and (for `inspect`) the injected overlay wired to the host bridge.
 */
export class AtlasSession {
  private selection: Selection | undefined;

  private constructor(
    readonly runId: string,
    readonly page: Page,
    readonly writer: RunWriter,
    readonly captures: CaptureService,
    readonly queue: CaptureQueue,
    readonly overlay: OverlayController,
    readonly browser: BrowserSession,
    private readonly options: StartSessionOptions,
    private viewport: Viewport,
  ) {}

  static async start(options: StartSessionOptions): Promise<AtlasSession> {
    const { config, logger } = options;
    const runId = newRunId();
    const viewport = resolveViewport({
      name: 'base',
      width: config.viewport.width,
      height: config.viewport.height,
      mode: 'desktop',
      deviceScaleFactor: config.viewport.deviceScaleFactor,
    });

    const writer = new RunWriter(
      options.outputRoot,
      emptyManifest({
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
      }),
    );
    await writer.init();

    // The handler closure needs the session, which needs the browser, which
    // needs the handler. A late-bound holder breaks the cycle.
    const holder: { session?: AtlasSession } = {};
    const token = newSessionToken();

    const initScripts: Array<{ content: string }> = [];
    const bindings: Array<{
      name: string;
      handler: (source: BridgeSource, ...args: unknown[]) => unknown;
    }> = [];

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

      const dispatch = createBridgeHandler(
        token,
        {
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
        },
        { onError: (error) => logger.error('bridge handler failed', toStructuredError(error)) },
      );

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

    const session = new AtlasSession(
      runId,
      page,
      writer,
      captures,
      queue,
      overlay,
      browser,
      options,
      viewport,
    );
    holder.session = session;

    page.on('framenavigated', (frame) => {
      if (frame !== page.mainFrame()) return;
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

  async navigate(url: string): Promise<PageRecord> {
    const visitedAt = new Date().toISOString();
    const warnings: string[] = [];
    let httpStatus: number | undefined;

    try {
      const response = await this.page.goto(url, {
        waitUntil: this.options.config.settle.loadState,
        timeout: this.options.config.browser.navigationTimeoutMs,
      });
      httpStatus = response?.status();
    } catch (error) {
      const record: PageRecord = {
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

    const record: PageRecord = {
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

  describeSession(): OverlaySession {
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
        // Responsive replay needs a fresh context per viewport; that lands in
        // phase 2, so the control stays visibly disabled rather than lying.
        responsive: false,
        animation: false,
        states: ['default', 'hover', 'focus', 'focus-visible', 'active', 'checked', 'selected', 'expanded', 'disabled'],
      },
    };
  }

  async handleSelection(
    source: BridgeSource,
    probe: ElementProbe,
  ): Promise<{
    identity: ElementIdentity;
    resolution: { matches: number; usedCandidateIndex: number; fellBack: boolean };
    warnings: string[];
  }> {
    const framePath = await buildFramePath(source.frame);
    const identity = buildElementIdentity(probe, framePath);

    const resolution = await resolveElement(source.frame, identity, {
      expectedBox: identity.boundingBox,
    });
    const chosen: ElementIdentity = { ...identity, chosenLocator: resolution.candidate };
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

  clearSelection(): void {
    this.selection = undefined;
  }

  get selectedIdentity(): ElementIdentity | undefined {
    return this.selection?.identity;
  }

  async handleCaptureRequest(
    source: BridgeSource,
    request: {
      kind: 'element' | 'viewport' | 'full-page' | 'animation-frame' | 'animation-video';
      states: StateName[];
      includeOverlay: boolean;
      responsive: boolean;
      label?: string | undefined;
      probe?: ElementProbe | undefined;
    },
  ): Promise<QueueJob[]> {
    if (request.responsive) {
      throw new UiAtlasError(
        'state.unsupported',
        'Responsive sets need a fresh context per viewport; that lands in phase 2.',
      );
    }
    if (request.kind === 'animation-frame' || request.kind === 'animation-video') {
      throw new UiAtlasError('state.unsupported', 'Animation capture lands in phase 4.');
    }

    let identity: ElementIdentity | undefined;
    let frame: Frame | undefined;
    if (request.kind === 'element') {
      if (request.probe !== undefined) {
        const selected = await this.handleSelection(source, request.probe);
        identity = selected.identity;
        frame = source.frame;
      } else if (this.selection !== undefined) {
        identity = this.selection.identity;
        frame = this.selection.frame;
      } else {
        throw new UiAtlasError('locator.not-found', 'no element is selected');
      }
    }

    const states = request.states.length > 0 ? request.states : (['default'] as StateName[]);
    const label = request.label ?? `${request.kind} · ${states.join(', ')}`;

    const job = this.queue.enqueue({
      kind: request.kind,
      states,
      label,
      run: async (report) => {
        const captureIds: string[] = [];
        const warnings: string[] = [];
        const setId = states.length > 1 ? `set-${this.runId}-${String(Date.now())}` : undefined;

        for (const state of states) {
          report(`${state} (${String(captureIds.length + 1)}/${String(states.length)})`);
          const record = await this.captures.capture({
            kind: request.kind,
            state,
            identity,
            frame,
            includeOverlay: request.includeOverlay,
            ...(setId === undefined ? {} : { set: { id: setId, kind: 'state' as const, member: state } }),
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

  async applyViewport(width: number, height: number, presetName?: string): Promise<Viewport> {
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

  get currentViewport(): Viewport {
    return this.viewport;
  }

  /* ---------------------------------------------------------------------- */
  /* Lifecycle                                                               */
  /* ---------------------------------------------------------------------- */

  /** Resolves when the user closes the browser window. */
  async waitForClose(): Promise<void> {
    if (this.page.isClosed()) return;
    await new Promise<void>((resolve) => {
      const done = (): void => resolve();
      this.page.once('close', done);
      this.browser.context.once('close', done);
    });
  }

  async close(): Promise<RunManifest> {
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

function requireSession(holder: { session?: AtlasSession }): AtlasSession {
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
async function waitForSession(
  holder: { session?: AtlasSession },
  timeoutMs = 5_000,
): Promise<AtlasSession> {
  const started = Date.now();
  while (holder.session === undefined && Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return requireSession(holder);
}
