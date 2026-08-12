import { readFile } from 'node:fs/promises';
import type { Frame, Page } from 'playwright';
import {
  fingerprintAnimation,
  inventoryAnimations,
  planScreencast,
  recordScreencast,
  sampleAnimations,
} from '@ui-atlas/animation';
import {
  emptyManifest,
  newCaptureId,
  newPageId,
  newRunId,
  newSessionToken,
  readCaptures,
  recordingSlug,
  routeKeyFromUrl,
  RunWriter,
} from '@ui-atlas/artifacts';
import {
  emulationOptions,
  launchSession,
  resolveViewport,
  viewportLabel,
  type BrowserSession,
} from '@ui-atlas/browser';
import {
  applyState,
  CaptureQueue,
  CaptureService,
  PointerTracker,
  ResponsiveRunner,
  type ResponsiveRunResult,
  type ViewportTarget,
} from '@ui-atlas/capture';
import type { UiAtlasConfig, ViewportPreset } from '@ui-atlas/config';
import { buildElementIdentity, buildFramePath, resolveElement } from '@ui-atlas/identity';
import {
  buildBootstrapScript,
  createBridgeHandler,
  loadOverlayBundle,
  loadProbeBundle,
  OverlayController,
  type BridgeSource,
} from '@ui-atlas/overlay';
import { generateReport } from '@ui-atlas/reporter';
import { settlePage } from '@ui-atlas/settle';
import {
  BRIDGE_BINDING,
  SCHEMA_VERSION,
  toStructuredError,
  UiAtlasError,
  type AnimationInventoryResult,
  type AnimationRecord,
  type AnimationSummary,
  type ElementIdentity,
  type ElementProbe,
  type OutputEntry,
  type OutputRevealResult,
  type OutputSummaryResult,
  type OutputTarget,
  type OverlaySession,
  type PageRecord,
  type QueueJob,
  type RunManifest,
  type StateName,
  type StillCaptureKind,
  type Viewport,
} from '@ui-atlas/protocol';
import type { Logger } from './logger.js';
import { platformOpener, type Opener } from './reveal.js';
import { checkSignIn } from './signin-check.js';

export interface StartSessionOptions {
  config: UiAtlasConfig;
  outputRoot: string;
  command: string;
  toolVersion: string;
  logger: Logger;
  /** Inject the inspector overlay. `capture` runs without it. */
  overlay: boolean;
  /**
   * How the run directory and report are opened on the desktop. Injectable so
   * a test can assert *what* was opened without a window appearing, and so a
   * headless environment can be given nothing at all.
   */
  opener?: Opener | undefined;
}

interface Selection {
  identity: ElementIdentity;
  frame: Frame;
}

interface HeldPreview {
  state: StateName;
  release: () => Promise<void>;
}

/**
 * Holding a mouse button down indefinitely would take the pointer away from the
 * user, who needs it to reach the toolbar. `active` is captured, never held.
 */
const UNHOLDABLE_STATES: StateName[] = ['active'];

/**
 * One live UI Atlas run: a browser, one page, the artifact writer, the capture
 * service, and (for `inspect`) the injected overlay wired to the host bridge.
 */
export class AtlasSession {
  private selection: Selection | undefined;
  private preview: HeldPreview | undefined;
  /** The last list the animation panel was shown, so it can name one back. */
  private animations: AnimationRecord[] = [];
  /** The sign-in check runs once per run, on the first page that loaded. */
  private signInChecked = false;

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
          'state/preview': async (_source, params) => {
            const session = requireSession(holder);
            return session.previewState(params.state);
          },
          'animation/inventory': async () => requireSession(holder).handleAnimationInventory(),
          'output/summary': async (_source, params) =>
            requireSession(holder).summariseOutput(params.limit),
          'output/reveal': async (_source, params) =>
            requireSession(holder).revealOutput(params.target),
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
      void session.releasePreview();
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

    // Once per run, on the first page that actually loaded. Later navigations
    // are the user moving around a site they are already signed in to, and
    // repeating the check on each would be noise.
    if (!this.signInChecked) {
      this.signInChecked = true;
      await checkSignIn({
        page: this.page,
        url,
        mode: this.browser.mode,
        profile: this.options.config.browser.profile,
        logger: this.options.logger,
        addWarning: (message) => this.writer.addWarning(message),
      });
    }

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
        responsive: true,
        animation: true,
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

    // A held preview belongs to the element it was applied to. Every element
    // capture re-sends its probe, so releasing on *any* selection call would
    // drop the preview the user is looking at; only a genuinely different
    // element should.
    const isSameElement =
      this.selection !== undefined &&
      this.selection.frame === source.frame &&
      this.selection.identity.structuralFingerprint === identity.structuralFingerprint;
    if (!isSameElement) await this.releasePreview();

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
    void this.releasePreview();
    this.selection = undefined;
  }

  /* ---------------------------------------------------------------------- */
  /* Live state preview                                                      */
  /* ---------------------------------------------------------------------- */

  /**
   * Apply a state to the selected element and leave it applied, so the user can
   * look at it. Exactly one state is held at a time; asking for `null` (or for
   * `default`) puts the page back.
   */
  async previewState(state: StateName | null): Promise<{
    applied: StateName | null;
    provenance?: string;
    verified?: boolean;
    verification?: string;
    notice?: string;
  }> {
    await this.releasePreview();
    if (state === null || state === 'default') return { applied: null };

    const selection = this.selection;
    if (selection === undefined) {
      throw new UiAtlasError('locator.not-found', 'select an element before previewing a state');
    }
    if (UNHOLDABLE_STATES.includes(state)) {
      return {
        applied: null,
        notice: `"${state}" needs the mouse button held down, which would take the pointer away from you. It is still captured normally.`,
      };
    }

    const resolution = await resolveElement(selection.frame, selection.identity, {
      expectedBox: selection.identity.boundingBox,
    });

    const application = await applyState(
      {
        page: this.page,
        locator: resolution.locator,
        config: this.options.config.capture,
        pointer: new PointerTracker(),
        timeoutMs: this.options.config.capture.screenshotTimeoutMs,
      },
      state,
    );

    if (application.skipped !== undefined) {
      await application.cleanup().catch(() => undefined);
      return { applied: null, notice: application.skipped };
    }

    this.preview = { state, release: application.cleanup };

    const result: {
      applied: StateName | null;
      provenance?: string;
      verified?: boolean;
      verification?: string;
      notice?: string;
    } = {
      applied: state,
      provenance: application.state.provenance,
      verified: application.state.verified,
    };
    if (application.state.verification !== undefined) {
      result.verification = application.state.verification;
    }
    if (state === 'hover') {
      // The virtual pointer and the user's real pointer are the same device in
      // a headed browser, so the first physical mouse move ends the hover.
      result.notice = 'Hover preview ends as soon as you move your own mouse.';
    }
    if (application.state.provenance === 'forced') {
      result.notice = 'This state is synthesised, not observed on the site. It is undone when you turn it off.';
    }
    return result;
  }

  /** Put the page back. Safe to call when nothing is held. */
  async releasePreview(): Promise<StateName | undefined> {
    const held = this.preview;
    if (held === undefined) return undefined;
    this.preview = undefined;
    await held.release().catch(() => undefined);
    return held.state;
  }

  get previewedState(): StateName | undefined {
    return this.preview?.state;
  }

  /**
   * Run `work` with no preview held, then put the preview back. A capture
   * applies its own state; a held one would contaminate it.
   */
  private async withoutPreview<T>(work: () => Promise<T>): Promise<T> {
    const held = await this.releasePreview();
    try {
      return await work();
    } finally {
      if (held !== undefined) await this.previewState(held).catch(() => undefined);
    }
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
      animationId?: string | undefined;
    },
  ): Promise<QueueJob[]> {
    if (request.kind === 'animation-frame') {
      return [this.enqueueAnimationFrames(request.animationId, request.label)];
    }
    if (request.kind === 'animation-video') {
      return [this.enqueueAnimationRecording(request.animationId, request.label)];
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

    if (request.responsive) {
      return [this.enqueueResponsive({ kind: request.kind, states, identity, label })];
    }

    const job = this.queue.enqueue({
      kind: request.kind,
      states,
      label,
      // A capture applies its own state; a held preview would contaminate it.
      run: async (report) =>
        this.withoutPreview(async () => {
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
        }),
    });

    return [job];
  }

  /* ---------------------------------------------------------------------- */
  /* Animation panel                                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * What this run has written so far, for the panel's Output section.
   *
   * Read back from `captures.jsonl` rather than kept in memory, so it describes
   * what is actually recorded — and so a resumed run shows captures this
   * process never made.
   */
  async summariseOutput(limit = 8): Promise<OutputSummaryResult> {
    const { records } = await readCaptures(this.writer.paths.capturesJsonl);
    const counts = { captured: 0, failed: 0, skipped: 0 };
    const written: OutputEntry[] = [];

    for (const record of records) {
      if (record.status === 'captured') counts.captured += 1;
      else if (record.status === 'failed') counts.failed += 1;
      else counts.skipped += 1;

      const path = record.image?.relativePath ?? record.video?.relativePath;
      if (path === undefined) continue;
      const cut = path.lastIndexOf('/');
      written.push({
        // The file name, and the run-relative folder it sits in. The absolute
        // path is never sent to the page: see `outputLabel`.
        fileName: cut === -1 ? path : path.slice(cut + 1),
        folder: cut === -1 ? '' : path.slice(0, cut),
        status: record.status,
        state: record.state.label ?? record.state.name,
        kind: record.kind,
      });
    }

    return {
      outputLabel: `${this.options.config.project}/${this.runId}`,
      counts,
      recent: written.slice(-limit).reverse(),
    };
  }

  /**
   * Open the run directory, or its report, on the desktop.
   *
   * The page names a target from a closed enum and nothing else. It never sends
   * a path, and the result never contains one — the notice says *what* was
   * opened, while the absolute path goes to the terminal, where the person who
   * started the run is already looking and no website can read it.
   */
  async revealOutput(target: OutputTarget): Promise<OutputRevealResult> {
    const { logger } = this.options;
    let path = this.writer.paths.runDir;

    if (target === 'report') {
      // Built on demand: mid-run is exactly when someone wants to look, and the
      // report is generated from `captures.jsonl` rather than from live state.
      try {
        const generated = await generateReport({ runDir: this.writer.paths.runDir });
        path = generated.path;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`could not build the report: ${message}`);
        return { target, opened: false, notice: `the report could not be built: ${message}` };
      }
    }

    logger.info(`${target === 'report' ? 'report' : 'artifacts'}: ${path}`);

    const opener = this.options.opener ?? platformOpener();
    if (opener === undefined) {
      return {
        target,
        opened: false,
        notice: 'this platform has no opener; the path has been printed in the terminal',
      };
    }

    const opened = await opener(path).catch(() => false);
    return {
      target,
      opened,
      notice: opened
        ? `opened the ${target === 'report' ? 'report' : 'run folder'} — the path is in the terminal too`
        : 'could not open it here; the path has been printed in the terminal',
    };
  }

  /**
   * What is moving on this page, and what can honestly be done about each.
   *
   * The panel exists to offer the action that will *work*. Anything the
   * inventory could not call `sampleable` comes back with `canSample: false`
   * and the inventory's own reason, so the toolbar shows why instead of
   * offering a button that would produce a frame the site never shows.
   */
  async handleAnimationInventory(): Promise<AnimationInventoryResult> {
    const result = await inventoryAnimations(this.page, {
      runId: this.runId,
      routeKey: routeKeyFromUrl(this.page.url()),
      describeFrame: (frame) => buildFramePath(frame),
    });

    // Kept so a later `capture/request` can name one. Matched by fingerprint at
    // capture time rather than trusted: the page will have moved on.
    this.animations = result.animations;

    return {
      animations: result.animations.map((record) => {
        const summary: AnimationSummary = {
          id: record.id,
          label: record.animationName ?? record.transitionProperty ?? record.animationId,
          sampleability: record.sampleability,
          reason: record.reasons[0] ?? `it is ${record.sampleability}`,
          canSample: record.sampleability === 'sampleable',
          // A recording shows what a seek cannot reproduce. Something already
          // sampleable does not need one, and a scroll-driven animation would
          // record as a still (ADR 23).
          canRecord: record.sampleability === 'infinite' || record.sampleability === 'indeterminate',
        };
        if (record.target?.selectorHint !== undefined) summary.target = record.target.selectorHint;
        if (record.durationMs !== undefined) summary.durationMs = record.durationMs;
        return summary;
      }),
      unobservable: result.unobservable,
      warnings: result.warnings,
    };
  }

  /**
   * Find a listed animation again on the live page.
   *
   * The index recorded at inventory time is not trusted: seconds have passed,
   * a transition may have ended and everything after it shifted. A fresh
   * inventory matched by fingerprint (ADR 22) either finds the same animation
   * or says it is gone — never a confident frame of a different one.
   */
  private async refindAnimation(animationId: string): Promise<AnimationRecord> {
    const wanted = this.animations.find((record) => record.id === animationId);
    if (wanted === undefined) {
      throw new UiAtlasError('locator.not-found', 'that animation is not in the current list');
    }
    const fresh = await inventoryAnimations(this.page, {
      runId: this.runId,
      routeKey: routeKeyFromUrl(this.page.url()),
    });
    const key = fingerprintAnimation(wanted);
    const found = fresh.animations.find((record) => fingerprintAnimation(record) === key);
    if (found === undefined) {
      throw new UiAtlasError(
        'locator.not-found',
        `${wanted.animationName ?? wanted.animationId} is no longer running on this page`,
      );
    }
    return found;
  }

  private enqueueAnimationFrames(animationId: string | undefined, label: string | undefined): QueueJob {
    if (animationId === undefined) {
      throw new UiAtlasError('config.invalid', 'an animation capture needs an animation to sample');
    }
    return this.queue.enqueue({
      kind: 'animation-frame',
      states: ['default'],
      label: label ?? 'animation frames',
      run: async (report) =>
        this.withoutPreview(async () => {
          const record = await this.refindAnimation(animationId);
          report(`sampling ${record.animationName ?? record.animationId}`);
          const sampling = this.options.config.capture.animation;
          const setId = `animation-${this.runId}-${record.id}`;

          const sampled = await sampleAnimations(this.page, [record], {
            config: sampling,
            setId: () => setId,
            onProgress: (message) => report(message),
            capture: async ({ sample, label: frameLabel, setId: set }) =>
              this.captures.capture({
                kind: 'animation-frame',
                state: 'default',
                stateLabel: frameLabel,
                animation: sample,
                set: { id: set, kind: 'animation', member: frameLabel },
              }),
          });

          const warnings = [...sampled.warnings];
          for (const skip of sampled.skipped) {
            // Reached only if the page changed under us: the panel does not
            // offer a sample for anything the inventory refused.
            warnings.push(`not sampled: ${skip.record.animationId} — ${skip.reason}`);
          }
          return { captureIds: sampled.captures.map((capture) => capture.id), warnings };
        }),
    });
  }

  /**
   * Record the page for a bounded window. Without an animation named, it
   * records whatever the plan says is worth recording — which is how motion no
   * animation list can see (canvas, WebGL, video) is reached at all.
   */
  private enqueueAnimationRecording(
    animationId: string | undefined,
    label: string | undefined,
  ): QueueJob {
    return this.queue.enqueue({
      kind: 'animation-video',
      states: ['default'],
      label: label ?? 'animation recording',
      run: async (report) =>
        this.withoutPreview(async () => {
          const parent = this.browser.browser;
          if (parent === undefined) {
            // Same constraint concurrency and the CLI hit: a persistent profile
            // owns its only context and a recording needs one of its own.
            throw new UiAtlasError(
              'state.unsupported',
              'a recording needs a browser context of its own, which this browser mode cannot create',
            );
          }

          const inventory = await inventoryAnimations(this.page, {
            runId: this.runId,
            routeKey: routeKeyFromUrl(this.page.url()),
          });
          const subjects =
            animationId === undefined
              ? inventory.animations
              : [await this.refindAnimation(animationId)];
          const videoConfig = this.options.config.capture.animation.video;
          const plan = planScreencast(
            subjects,
            animationId === undefined ? inventory.unobservable : { canvas2d: 0, webgl: 0, video: 0 },
            videoConfig,
          );
          if (!plan.record) {
            throw new UiAtlasError(
              'state.unsupported',
              plan.excluded[0]?.reason ?? 'there is nothing here a recording would show',
            );
          }

          report(`recording ${String(Math.round(plan.durationMs))}ms`);
          const captureId = newCaptureId();
          const workspace = await this.writer.videoWorkspace(captureId);
          const startedAt = Date.now();
          try {
            const recording = await recordScreencast(parent, {
              url: this.page.url(),
              durationMs: plan.durationMs,
              maxBytes: videoConfig.maxBytes,
              viewport: { width: this.viewport.width, height: this.viewport.height },
              contextOptions: {
                ...emulationOptions(this.viewport, this.browser.browserVersion),
                locale: this.options.config.browser.locale,
                colorScheme: this.options.config.browser.colorScheme,
                reducedMotion: this.options.config.browser.reducedMotion,
                ...(await this.browser.context
                  .storageState()
                  .then((storageState) => ({ storageState }))
                  .catch(() => ({}))),
              },
              workspaceDir: workspace,
              settle: (target) => settlePage(target, { config: this.options.config.settle }),
              navigationTimeoutMs: this.options.config.browser.navigationTimeoutMs,
            });

            if (recording.path === undefined) {
              const capture = await this.captures.captureVideo({
                captureId,
                warnings: recording.warnings,
                durationMs: Date.now() - startedAt,
                error: {
                  code: recording.byteLength > 0 ? 'capture.over-budget' : 'capture.failed',
                  message: recording.warnings[0] ?? 'no recording was produced',
                },
              });
              return { captureIds: [capture.id], warnings: recording.warnings };
            }

            const screencast = await this.writer.writeVideo(
              {
                routeKey: routeKeyFromUrl(this.page.url()),
                viewportLabel: viewportLabel(this.viewport),
                captureId,
                stem: recordingSlug(),
              },
              await readFile(recording.path),
              {
                width: this.viewport.width,
                height: this.viewport.height,
                durationMs: recording.durationMs,
                leadInMs: recording.leadInMs,
                truncated: plan.truncated,
                subjects: plan.subjects,
                limitations: [
                  ...plan.limitations,
                  'the file starts with the page load this recording needed; ' +
                    `the part you asked about begins about ${String(Math.round(recording.leadInMs))}ms in`,
                ],
              },
            );
            const capture = await this.captures.captureVideo({
              captureId,
              screencast,
              stateLabel: 'recording',
              set: { id: `animation-video-${captureId}`, kind: 'animation', member: 'recording' },
              warnings: recording.warnings,
              durationMs: Date.now() - startedAt,
            });
            return { captureIds: [capture.id], warnings: recording.warnings };
          } finally {
            await this.writer.discardVideoWorkspace(workspace);
          }
        }),
    });
  }

  /**
   * Queue a responsive set. It replays the current route in a fresh context per
   * viewport, so responsive JavaScript that only runs at load initialises
   * properly — a resized window would show a layout the site never produces.
   */
  private enqueueResponsive(input: {
    kind: StillCaptureKind;
    states: StateName[];
    identity: ElementIdentity | undefined;
    label: string;
  }): QueueJob {
    const url = this.page.url();

    return this.queue.enqueue({
      kind: input.kind,
      states: input.states,
      label: `${input.label} · ${String(this.options.config.viewports.length)} viewports`,
      run: async (report) =>
        this.withoutPreview(async () => {
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
        }),
    });
  }

  /**
   * Replay a route across every configured viewport, one fresh context each.
   * Public so the CLI can await a set directly instead of going through the
   * inspector's queue.
   */
  async runResponsive(input: {
    kind: StillCaptureKind;
    states: StateName[];
    identity?: ElementIdentity | undefined;
    url?: string | undefined;
    onProgress?: ((message: string) => void) | undefined;
  }): Promise<ResponsiveRunResult> {
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
  private async createViewportTarget(preset: ViewportPreset): Promise<ViewportTarget> {
    const viewport = resolveViewport(preset);
    const label = viewportLabel(viewport);
    const browser = this.browser.browser;
    const { config } = this.options;

    // A persistent profile owns its only context, so real device emulation is
    // unavailable there. Degrade to a resized page and say so on every record.
    if (browser === undefined) {
      const page = await this.browser.context.newPage();
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const degraded: Viewport = { ...viewport, mobile: false, hasTouch: false, userAgentClass: 'desktop' };
      return {
        page,
        viewport: degraded,
        viewportLabel: label,
        warnings:
          preset.mode === 'mobile'
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
    await this.releasePreview();
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
