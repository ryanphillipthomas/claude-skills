import { probeElement } from '@ui-atlas/identity/dom';
import {
  DEFAULT_SHORTCUTS,
  OVERLAY_GLOBAL,
  OVERLAY_HOST_ATTRIBUTE,
} from '@ui-atlas/protocol/constants';
import type {
  AnimationInventoryResult,
  ElementProbe,
  HostEvent,
  OutputRevealResult,
  OutputSummaryResult,
  OverlayBootstrap,
  OverlaySession,
  QueueCancelResult,
  QueueJob,
  StateName,
} from '@ui-atlas/protocol';
import { BridgeError, createBridge, type Bridge } from './bridge.js';
import { CaptureProgressMachine } from './capture-progress.js';
import { pageLabelFrom } from './flow.js';
import { Highlight } from './highlight.js';
import { InspectMode, navigateFrom } from './inspect.js';
import { isTypingTarget, matchesCombo } from './shortcuts.js';
import { OVERLAY_STYLES } from './styles.js';
import { Toolbar, type CaptureIntent, type SelectionView } from './toolbar.js';

declare const __UI_ATLAS_BOOTSTRAP__: OverlayBootstrap;

interface OverlayApi {
  version: string;
  dispatch(event: HostEvent): void;
  hide(): void;
  show(): void;
  /** Test/debug surface: never used by the host for control decisions. */
  debugState(): { inspecting: boolean; hasSelection: boolean; jobs: number };
}

function isTopFrame(): boolean {
  try {
    return window.top === window;
  } catch {
    return false;
  }
}

class OverlayApp {
  private readonly bridge: Bridge;
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly highlight: Highlight;
  private readonly inspect: InspectMode;
  private readonly toolbar: Toolbar | undefined;

  private session: OverlaySession | undefined;
  private shortcuts: Record<string, string>;
  private selectedElement: Element | undefined;
  private selectedProbe: ElementProbe | undefined;
  private jobs = new Map<string, QueueJob>();
  /**
   * Which page each job was requested from. The job itself does not carry a
   * route, and in a single-page app the location can change between requesting
   * a capture and its finishing — so the page is recorded when it is asked for,
   * not when it lands.
   */
  private jobPages = new Map<string, string>();
  /**
   * What the run is doing, folded from the queue events themselves. Every beat
   * of the capture animation is read from here, so nothing is ever animated on
   * a guess about how long the host is likely to take.
   */
  private readonly captureProgress = new CaptureProgressMachine();
  private rafHandle: number | undefined;
  private keydownHandler: ((event: KeyboardEvent) => void) | undefined;

  constructor(private readonly bootstrap: OverlayBootstrap) {
    this.bridge = createBridge(bootstrap.token);
    this.shortcuts = { ...DEFAULT_SHORTCUTS, ...bootstrap.shortcuts };

    this.host = document.createElement('ui-atlas-overlay');
    this.host.setAttribute(OVERLAY_HOST_ATTRIBUTE, '');
    // Belt and braces: even if the site sets `* { display: block !important }`,
    // the host stays an inert, non-interactive layer.
    this.host.style.setProperty('position', 'fixed', 'important');
    this.host.style.setProperty('inset', '0', 'important');
    this.host.style.setProperty('pointer-events', 'none', 'important');
    this.host.style.setProperty('z-index', '2147483647', 'important');

    this.shadow = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = OVERLAY_STYLES;
    this.shadow.append(style);

    this.highlight = new Highlight(this.shadow, { showBoxModel: false });
    this.inspect = new InspectMode({
      onHover: (element) => this.handleHover(element),
      onSelect: (element) => void this.handleSelect(element),
      onCancel: () => this.exitInspect(),
      onInteract: () => undefined,
    });

    this.toolbar = isTopFrame()
      ? new Toolbar(this.shadow, {
          onToggleInspect: () => this.toggleInspect(),
          onMoveSelection: (direction) => this.moveSelection(direction),
          onCapture: (intent) => void this.requestCapture(intent),
          onSetViewport: (width, height, presetName) =>
            void this.setViewport(width, height, presetName),
          onClearSelection: () => this.clearSelection(),
          onToggleBoxModel: (next) => this.highlight.setOptions({ showBoxModel: next }),
          onPreviewState: (state) => void this.previewState(state),
          onListAnimations: () => void this.listAnimations(),
          onSampleAnimation: (id, label) =>
            void this.requestAnimationCapture('animation-frame', id, `sample · ${label}`),
          onRecordAnimation: (id, label) =>
            void this.requestAnimationCapture('animation-video', id, `record · ${label}`),
          onRefreshOutput: () => void this.refreshOutput(),
          onRevealOutput: (target) => void this.revealOutput(target),
          onStopCapture: () => void this.stopCapture(),
          onCaptureSettled: () => {
            this.captureProgress.releaseComplete();
            this.toolbar?.setCaptureProgress({
              view: this.captureProgress.view,
              startedShot: undefined,
              completedJobs: [],
              runFinished: false,
            });
          },
        })
      : undefined;
  }

  async mount(): Promise<void> {
    await documentReady();
    document.documentElement.append(this.host);
    this.keepMounted();
    this.installKeyboard();
    this.installGlobal();
    this.startTracking();

    try {
      const result = await this.bridge.call<{ session: OverlaySession }>('hello', {
        overlayVersion: this.bootstrap.version,
        url: location.href,
      });
      this.session = result.session;
      this.shortcuts = { ...this.shortcuts, ...result.session.shortcuts };
      this.toolbar?.setSession(result.session);
      this.refreshJobs();
    } catch (error) {
      this.toolbar?.notice('error', describe(error));
      return;
    }

    if (this.bootstrap.autoInspect) this.enterInspect();
  }

  /* ---------------------------------------------------------------------- */
  /* Inspect mode                                                            */
  /* ---------------------------------------------------------------------- */

  private toggleInspect(): void {
    if (this.inspect.active) this.exitInspect();
    else this.enterInspect();
  }

  private enterInspect(broadcast = true): void {
    this.inspect.enable();
    this.toolbar?.setInspectActive(true);
    if (broadcast) void this.bridge.call('inspect/mode', { active: true }).catch(() => undefined);
  }

  private exitInspect(broadcast = true): void {
    this.inspect.disable();
    this.highlight.hideHover();
    this.toolbar?.setInspectActive(false);
    if (broadcast) void this.bridge.call('inspect/mode', { active: false }).catch(() => undefined);
  }

  private handleHover(element: Element | undefined): void {
    if (element === undefined) {
      this.highlight.hideHover();
      return;
    }
    this.highlight.showHover(element, describeElement(element));
  }

  private async handleSelect(element: Element): Promise<void> {
    this.selectedElement = element;
    this.highlight.showSelected(element);

    let probe: ElementProbe;
    try {
      probe = probeElement(element);
    } catch (error) {
      this.toolbar?.notice('error', `could not describe the element: ${describe(error)}`);
      return;
    }
    this.selectedProbe = probe;

    try {
      const view = await this.bridge.call<SelectionView>('element/selected', { probe });
      this.toolbar?.setSelection(view);
      if (probe.closedShadowEncountered) {
        this.toolbar?.notice(
          'warn',
          'This element looks like a closed shadow host. Element-level inspection inside closed shadow DOM is not supported.',
        );
      } else {
        this.toolbar?.clearNotice();
      }
    } catch (error) {
      this.toolbar?.setSelection(undefined);
      this.toolbar?.notice('error', describe(error));
    }
  }

  private clearSelection(): void {
    this.toolbar?.setPreviewing(undefined);
    this.selectedElement = undefined;
    this.selectedProbe = undefined;
    this.highlight.hideSelected();
    this.toolbar?.setSelection(undefined);
    void this.bridge.call('element/cleared', {}).catch(() => undefined);
  }

  private moveSelection(direction: 'parent' | 'child' | 'previous' | 'next'): void {
    if (this.selectedElement === undefined) return;
    const next = navigateFrom(this.selectedElement, direction);
    if (next === undefined) return;
    void this.handleSelect(next);
  }

  /* ---------------------------------------------------------------------- */
  /* Host operations                                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * Ask the host what is moving here. It reads the page's own animation state
   * and changes nothing, so this is safe to press at any time.
   */
  private async listAnimations(): Promise<void> {
    this.toolbar?.setAnimationsPending(true);
    try {
      const result = await this.bridge.call<AnimationInventoryResult>('animation/inventory', {});
      this.toolbar?.setAnimations(result);
    } catch (error) {
      this.toolbar?.setAnimations(undefined);
      this.toolbar?.notice('error', describe(error));
    }
  }

  /**
   * Ask the host what this run has written. A read, like the animation list:
   * it opens no file and changes nothing.
   */
  private async refreshOutput(): Promise<void> {
    this.toolbar?.setOutputPending(true);
    try {
      const summary = await this.bridge.call<OutputSummaryResult>('output/summary', {});
      this.toolbar?.setOutput(summary);
    } catch (error) {
      this.toolbar?.setOutput(undefined);
      this.toolbar?.notice('error', describe(error));
    }
  }

  /**
   * Ask the host to open the run folder or the report. The page names a target
   * and never a path — the host resolves both from the run it owns.
   */
  private async revealOutput(target: 'folder' | 'report'): Promise<void> {
    try {
      const result = await this.bridge.call<OutputRevealResult>('output/reveal', { target });
      this.toolbar?.notice(result.opened ? 'info' : 'warn', result.notice);
      // Building the report can add nothing, but opening the folder is the
      // moment someone wants the list to be current.
      await this.refreshOutput();
    } catch (error) {
      this.toolbar?.notice('error', describe(error));
    }
  }

  /**
   * Stop the captures that have not started.
   *
   * The notice says what actually happened rather than "stopped": a job in
   * flight is left to finish, because it is holding a state on the live page
   * and has to put it back.
   */
  private async stopCapture(): Promise<void> {
    try {
      const result = await this.bridge.call<QueueCancelResult>('queue/cancel', {});
      const stopped =
        result.stopped === 1 ? '1 capture dropped' : `${String(result.stopped)} captures dropped`;
      this.toolbar?.notice(
        'info',
        result.stillRunning
          ? `${stopped}. The one already running is finishing, so the page is left as it was found.`
          : stopped,
      );
    } catch (error) {
      this.toolbar?.notice('error', describe(error));
    }
  }

  private async requestAnimationCapture(
    kind: 'animation-frame' | 'animation-video',
    animationId: string | undefined,
    label: string,
  ): Promise<void> {
    const params: Record<string, unknown> = {
      kind,
      states: ['default'],
      includeOverlay: false,
      responsive: false,
      label,
    };
    if (animationId !== undefined) params['animationId'] = animationId;

    try {
      const result = await this.bridge.call<{ jobs: QueueJob[] }>('capture/request', params);
      this.acceptJobs(result.jobs);
    } catch (error) {
      this.toolbar?.notice('error', describe(error));
    }
  }

  private async requestCapture(intent: CaptureIntent): Promise<void> {
    const params: Record<string, unknown> = {
      kind: intent.kind,
      states: intent.states,
      includeOverlay: intent.includeOverlay,
      responsive: intent.responsive,
    };
    if (intent.label !== undefined) params['label'] = intent.label;
    if (intent.kind === 'element') {
      if (this.selectedProbe === undefined) {
        this.toolbar?.notice('warn', 'Select an element before capturing it.');
        return;
      }
      params['probe'] = this.selectedProbe;
    }
    if (intent.responsive && this.session?.capabilities.responsive === false) {
      this.toolbar?.notice('warn', 'Responsive capture is not enabled for this session.');
      return;
    }

    try {
      const result = await this.bridge.call<{ jobs: QueueJob[] }>('capture/request', params);
      this.acceptJobs(result.jobs);
    } catch (error) {
      this.toolbar?.notice('error', describe(error));
    }
  }

  /**
   * Ask the host to hold a state on the live page. The toolbar only shows a
   * state as previewing once the host confirms it actually applied.
   */
  private async previewState(state: StateName | undefined): Promise<void> {
    try {
      const result = await this.bridge.call<{
        applied: StateName | null;
        notice?: string;
      }>('state/preview', { state: state ?? null });

      this.toolbar?.setPreviewing(result.applied ?? undefined);
      if (result.notice !== undefined) this.toolbar?.notice('info', result.notice);
      else this.toolbar?.clearNotice();
    } catch (error) {
      this.toolbar?.setPreviewing(undefined);
      this.toolbar?.notice('error', describe(error));
    }
  }

  private async setViewport(width: number, height: number, presetName?: string): Promise<void> {
    const params: Record<string, unknown> = { width, height };
    if (presetName !== undefined) params['presetName'] = presetName;
    try {
      await this.bridge.call('viewport/set', params);
      this.toolbar?.clearNotice();
    } catch (error) {
      this.toolbar?.notice('error', describe(error));
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Host -> page events                                                     */
  /* ---------------------------------------------------------------------- */

  /** Remember which page these jobs belong to, then render them. */
  private acceptJobs(jobs: QueueJob[]): void {
    const page = pageLabelFrom(location.href);
    for (const job of jobs) {
      this.jobs.set(job.id, job);
      if (!this.jobPages.has(job.id)) this.jobPages.set(job.id, page);
      // The jobs that come back from the request are the run opening. Folding
      // them in here is what turns the footer control to "Capturing…" on the
      // press rather than one round trip later.
      this.trackCapture(job);
    }
    this.refreshJobs();
  }

  /**
   * Advance the capture animation by one real event.
   *
   * The shutter fires on the host reporting that it has begun a state — the
   * only per-state signal the queue emits — and only for element captures,
   * because a viewport shot has no element to sweep.
   */
  private trackCapture(job: QueueJob): void {
    const change = this.captureProgress.apply(job);
    this.toolbar?.setCaptureProgress(change);
    if (change.startedShot === undefined) return;
    if (job.kind !== 'element' || this.selectedElement === undefined) return;
    this.highlight.flash(this.selectedElement);
  }

  /**
   * Count what has actually been captured from the page the browser is on, and
   * hand the toolbar both the count and the queue.
   */
  private refreshJobs(): void {
    const here = pageLabelFrom(location.href);
    let capturedHere = 0;
    for (const job of this.jobs.values()) {
      if (job.status !== 'done') continue;
      if ((this.jobPages.get(job.id) ?? here) !== here) continue;
      capturedHere += job.captureIds.length;
    }
    this.toolbar?.setProgress({ pageLabel: here, capturedHere });
    this.toolbar?.renderJobs([...this.jobs.values()]);
  }

  dispatch(event: HostEvent): void {
    switch (event.type) {
      case 'queue/update':
        this.jobs.set(event.job.id, event.job);
        this.trackCapture(event.job);
        this.refreshJobs();
        break;
      case 'session/update':
        this.session = event.session;
        this.toolbar?.setSession(event.session);
        break;
      case 'notice':
        this.toolbar?.notice(event.level, event.message);
        break;
      case 'selection/invalidated':
        this.clearSelection();
        this.toolbar?.notice('warn', event.reason);
        break;
      case 'inspect/mode':
        if (event.active) this.enterInspect(false);
        else this.exitInspect(false);
        break;
      default:
        break;
    }
  }

  hide(): void {
    this.host.style.setProperty('display', 'none', 'important');
  }

  show(): void {
    this.host.style.removeProperty('display');
  }

  debugState(): { inspecting: boolean; hasSelection: boolean; jobs: number } {
    return {
      inspecting: this.inspect.active,
      hasSelection: this.selectedElement !== undefined,
      jobs: this.jobs.size,
    };
  }

  /* ---------------------------------------------------------------------- */
  /* Plumbing                                                                */
  /* ---------------------------------------------------------------------- */

  private installGlobal(): void {
    const api: OverlayApi = {
      version: this.bootstrap.version,
      dispatch: (event) => this.dispatch(event),
      hide: () => this.hide(),
      show: () => this.show(),
      debugState: () => this.debugState(),
    };
    Object.defineProperty(window, OVERLAY_GLOBAL, {
      value: api,
      configurable: true,
      enumerable: false,
      writable: false,
    });
  }

  private installKeyboard(): void {
    const handler = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target) && !event.altKey) return;

      if (matchesCombo(event, this.shortcuts['toggleInspect'] ?? 'Alt+I')) {
        event.preventDefault();
        this.toggleInspect();
        return;
      }
      if (matchesCombo(event, this.shortcuts['cancel'] ?? 'Escape')) {
        if (this.inspect.active) {
          event.preventDefault();
          this.exitInspect();
        } else if (this.selectedElement !== undefined) {
          event.preventDefault();
          this.clearSelection();
        }
        return;
      }
      if (matchesCombo(event, this.shortcuts['captureElement'] ?? 'Alt+C')) {
        event.preventDefault();
        void this.requestCapture({ kind: 'element', states: ['default'], responsive: false, includeOverlay: false });
        return;
      }
      if (matchesCombo(event, this.shortcuts['captureViewport'] ?? 'Alt+V')) {
        event.preventDefault();
        void this.requestCapture({ kind: 'viewport', states: ['default'], responsive: false, includeOverlay: false });
        return;
      }
      if (matchesCombo(event, this.shortcuts['captureResponsive'] ?? 'Alt+R')) {
        event.preventDefault();
        void this.requestCapture({
          kind: this.selectedProbe === undefined ? 'viewport' : 'element',
          states: ['default'],
          responsive: true,
          includeOverlay: false,
          label: 'responsive set',
        });
        return;
      }
      if (matchesCombo(event, this.shortcuts['captureAnimation'] ?? 'Alt+A')) {
        event.preventDefault();
        // Lists rather than captures: which animation you meant is a question
        // only the list can answer, and most of them cannot be sampled at all.
        void this.listAnimations();
        return;
      }

      if (this.selectedElement === undefined) return;
      const moves: Array<[string, 'parent' | 'child' | 'previous' | 'next']> = [
        [this.shortcuts['selectParent'] ?? 'ArrowUp', 'parent'],
        [this.shortcuts['selectChild'] ?? 'ArrowDown', 'child'],
        [this.shortcuts['selectPrevSibling'] ?? 'ArrowLeft', 'previous'],
        [this.shortcuts['selectNextSibling'] ?? 'ArrowRight', 'next'],
      ];
      for (const [combo, direction] of moves) {
        if (matchesCombo(event, combo)) {
          event.preventDefault();
          this.moveSelection(direction);
          return;
        }
      }
    };

    this.keydownHandler = handler;
    window.addEventListener('keydown', handler, { capture: true });
  }

  /** Keep the highlight glued to a selected element as the page moves. */
  private startTracking(): void {
    let lastPage = pageLabelFrom(location.href);
    const tick = (): void => {
      // A single-page app changes route without reloading, which would leave
      // "4 captures on /pricing" showing while the browser is on /checkout.
      const page = pageLabelFrom(location.href);
      if (page !== lastPage) {
        lastPage = page;
        this.refreshJobs();
      }
      if (this.selectedElement !== undefined) {
        if (!this.selectedElement.isConnected) {
          const reason = 'The selected element was removed from the page.';
          this.selectedElement = undefined;
          this.selectedProbe = undefined;
          this.highlight.hideSelected();
          this.toolbar?.setSelection(undefined);
          this.toolbar?.notice('warn', reason);
        } else {
          this.highlight.refreshSelected(this.selectedElement);
        }
      }
      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  /** Re-attach after a framework replaces `document.documentElement`'s children. */
  private keepMounted(): void {
    const observer = new MutationObserver(() => {
      if (!this.host.isConnected && document.documentElement !== null) {
        document.documentElement.append(this.host);
      }
    });
    observer.observe(document.documentElement, { childList: true });
  }

  destroy(): void {
    this.inspect.disable();
    if (this.rafHandle !== undefined) cancelAnimationFrame(this.rafHandle);
    if (this.keydownHandler !== undefined) {
      window.removeEventListener('keydown', this.keydownHandler, { capture: true });
    }
    this.highlight.destroy();
    this.host.remove();
  }
}

function describeElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id.length > 0 ? `#${element.id}` : '';
  const rect = element.getBoundingClientRect();
  return `${tag}${id} · ${String(Math.round(rect.width))}×${String(Math.round(rect.height))}`;
}

function describe(error: unknown): string {
  if (error instanceof BridgeError) return `${error.code}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}

async function documentReady(): Promise<void> {
  if (document.documentElement !== null) return;
  await new Promise<void>((resolve) => {
    const check = (): void => {
      if (document.documentElement !== null) resolve();
      else requestAnimationFrame(check);
    };
    check();
  });
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

const globals = window as unknown as Record<string, unknown>;
if (globals[OVERLAY_GLOBAL] === undefined) {
  const app = new OverlayApp(__UI_ATLAS_BOOTSTRAP__);
  void app.mount().catch(() => {
    // A page that blocks the bridge should not break the site.
    app.destroy();
  });
}
