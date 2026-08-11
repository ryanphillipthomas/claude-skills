import { probeElement } from '@ui-atlas/identity/dom';
import { DEFAULT_SHORTCUTS, OVERLAY_GLOBAL, OVERLAY_HOST_ATTRIBUTE, } from '@ui-atlas/protocol/constants';
import { BridgeError, createBridge } from './bridge.js';
import { Highlight } from './highlight.js';
import { InspectMode, navigateFrom } from './inspect.js';
import { isTypingTarget, matchesCombo } from './shortcuts.js';
import { OVERLAY_STYLES } from './styles.js';
import { Toolbar } from './toolbar.js';
function isTopFrame() {
    try {
        return window.top === window;
    }
    catch {
        return false;
    }
}
class OverlayApp {
    bootstrap;
    bridge;
    host;
    shadow;
    highlight;
    inspect;
    toolbar;
    session;
    shortcuts;
    selectedElement;
    selectedProbe;
    jobs = new Map();
    rafHandle;
    keydownHandler;
    constructor(bootstrap) {
        this.bootstrap = bootstrap;
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
                onCapture: (intent) => void this.requestCapture(intent),
                onSetViewport: (width, height, presetName) => void this.setViewport(width, height, presetName),
                onClearSelection: () => this.clearSelection(),
                onToggleBoxModel: (next) => this.highlight.setOptions({ showBoxModel: next }),
            })
            : undefined;
    }
    async mount() {
        await documentReady();
        document.documentElement.append(this.host);
        this.keepMounted();
        this.installKeyboard();
        this.installGlobal();
        this.startTracking();
        try {
            const result = await this.bridge.call('hello', {
                overlayVersion: this.bootstrap.version,
                url: location.href,
            });
            this.session = result.session;
            this.shortcuts = { ...this.shortcuts, ...result.session.shortcuts };
            this.toolbar?.setSession(result.session);
        }
        catch (error) {
            this.toolbar?.notice('error', describe(error));
            return;
        }
        if (this.bootstrap.autoInspect)
            this.enterInspect();
    }
    /* ---------------------------------------------------------------------- */
    /* Inspect mode                                                            */
    /* ---------------------------------------------------------------------- */
    toggleInspect() {
        if (this.inspect.active)
            this.exitInspect();
        else
            this.enterInspect();
    }
    enterInspect(broadcast = true) {
        this.inspect.enable();
        this.toolbar?.setInspectActive(true);
        if (broadcast)
            void this.bridge.call('inspect/mode', { active: true }).catch(() => undefined);
    }
    exitInspect(broadcast = true) {
        this.inspect.disable();
        this.highlight.hideHover();
        this.toolbar?.setInspectActive(false);
        if (broadcast)
            void this.bridge.call('inspect/mode', { active: false }).catch(() => undefined);
    }
    handleHover(element) {
        if (element === undefined) {
            this.highlight.hideHover();
            return;
        }
        this.highlight.showHover(element, describeElement(element));
    }
    async handleSelect(element) {
        this.selectedElement = element;
        this.highlight.showSelected(element);
        let probe;
        try {
            probe = probeElement(element);
        }
        catch (error) {
            this.toolbar?.notice('error', `could not describe the element: ${describe(error)}`);
            return;
        }
        this.selectedProbe = probe;
        try {
            const view = await this.bridge.call('element/selected', { probe });
            this.toolbar?.setSelection(view);
            if (probe.closedShadowEncountered) {
                this.toolbar?.notice('warn', 'This element looks like a closed shadow host. Element-level inspection inside closed shadow DOM is not supported.');
            }
            else {
                this.toolbar?.clearNotice();
            }
        }
        catch (error) {
            this.toolbar?.setSelection(undefined);
            this.toolbar?.notice('error', describe(error));
        }
    }
    clearSelection() {
        this.selectedElement = undefined;
        this.selectedProbe = undefined;
        this.highlight.hideSelected();
        this.toolbar?.setSelection(undefined);
        void this.bridge.call('element/cleared', {}).catch(() => undefined);
    }
    moveSelection(direction) {
        if (this.selectedElement === undefined)
            return;
        const next = navigateFrom(this.selectedElement, direction);
        if (next === undefined)
            return;
        void this.handleSelect(next);
    }
    /* ---------------------------------------------------------------------- */
    /* Host operations                                                         */
    /* ---------------------------------------------------------------------- */
    async requestCapture(intent) {
        const params = {
            kind: intent.kind,
            states: intent.states,
            includeOverlay: intent.includeOverlay,
            responsive: intent.responsive,
        };
        if (intent.label !== undefined)
            params['label'] = intent.label;
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
            const result = await this.bridge.call('capture/request', params);
            for (const job of result.jobs)
                this.jobs.set(job.id, job);
            this.toolbar?.renderJobs([...this.jobs.values()]);
        }
        catch (error) {
            this.toolbar?.notice('error', describe(error));
        }
    }
    async setViewport(width, height, presetName) {
        const params = { width, height };
        if (presetName !== undefined)
            params['presetName'] = presetName;
        try {
            await this.bridge.call('viewport/set', params);
            this.toolbar?.clearNotice();
        }
        catch (error) {
            this.toolbar?.notice('error', describe(error));
        }
    }
    /* ---------------------------------------------------------------------- */
    /* Host -> page events                                                     */
    /* ---------------------------------------------------------------------- */
    dispatch(event) {
        switch (event.type) {
            case 'queue/update':
                this.jobs.set(event.job.id, event.job);
                this.toolbar?.renderJobs([...this.jobs.values()]);
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
                if (event.active)
                    this.enterInspect(false);
                else
                    this.exitInspect(false);
                break;
            default:
                break;
        }
    }
    hide() {
        this.host.style.setProperty('display', 'none', 'important');
    }
    show() {
        this.host.style.removeProperty('display');
    }
    debugState() {
        return {
            inspecting: this.inspect.active,
            hasSelection: this.selectedElement !== undefined,
            jobs: this.jobs.size,
        };
    }
    /* ---------------------------------------------------------------------- */
    /* Plumbing                                                                */
    /* ---------------------------------------------------------------------- */
    installGlobal() {
        const api = {
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
    installKeyboard() {
        const handler = (event) => {
            if (isTypingTarget(event.target) && !event.altKey)
                return;
            if (matchesCombo(event, this.shortcuts['toggleInspect'] ?? 'Alt+I')) {
                event.preventDefault();
                this.toggleInspect();
                return;
            }
            if (matchesCombo(event, this.shortcuts['cancel'] ?? 'Escape')) {
                if (this.inspect.active) {
                    event.preventDefault();
                    this.exitInspect();
                }
                else if (this.selectedElement !== undefined) {
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
                this.toolbar?.notice('info', 'Animation capture lands in a later phase.');
                return;
            }
            if (this.selectedElement === undefined)
                return;
            const moves = [
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
    startTracking() {
        const tick = () => {
            if (this.selectedElement !== undefined) {
                if (!this.selectedElement.isConnected) {
                    const reason = 'The selected element was removed from the page.';
                    this.selectedElement = undefined;
                    this.selectedProbe = undefined;
                    this.highlight.hideSelected();
                    this.toolbar?.setSelection(undefined);
                    this.toolbar?.notice('warn', reason);
                }
                else {
                    this.highlight.refreshSelected(this.selectedElement);
                }
            }
            this.rafHandle = requestAnimationFrame(tick);
        };
        this.rafHandle = requestAnimationFrame(tick);
    }
    /** Re-attach after a framework replaces `document.documentElement`'s children. */
    keepMounted() {
        const observer = new MutationObserver(() => {
            if (!this.host.isConnected && document.documentElement !== null) {
                document.documentElement.append(this.host);
            }
        });
        observer.observe(document.documentElement, { childList: true });
    }
    destroy() {
        this.inspect.disable();
        if (this.rafHandle !== undefined)
            cancelAnimationFrame(this.rafHandle);
        if (this.keydownHandler !== undefined) {
            window.removeEventListener('keydown', this.keydownHandler, { capture: true });
        }
        this.highlight.destroy();
        this.host.remove();
    }
}
function describeElement(element) {
    const tag = element.tagName.toLowerCase();
    const id = element.id.length > 0 ? `#${element.id}` : '';
    const rect = element.getBoundingClientRect();
    return `${tag}${id} · ${String(Math.round(rect.width))}×${String(Math.round(rect.height))}`;
}
function describe(error) {
    if (error instanceof BridgeError)
        return `${error.code}: ${error.message}`;
    return error instanceof Error ? error.message : String(error);
}
async function documentReady() {
    if (document.documentElement !== null)
        return;
    await new Promise((resolve) => {
        const check = () => {
            if (document.documentElement !== null)
                resolve();
            else
                requestAnimationFrame(check);
        };
        check();
    });
}
/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */
const globals = window;
if (globals[OVERLAY_GLOBAL] === undefined) {
    const app = new OverlayApp(__UI_ATLAS_BOOTSTRAP__);
    void app.mount().catch(() => {
        // A page that blocks the bridge should not break the site.
        app.destroy();
    });
}
//# sourceMappingURL=main.js.map