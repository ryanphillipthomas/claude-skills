import { probeElement } from '@ui-atlas/identity/dom';
/**
 * A UI-free entry point: it exposes the element probe so the host can identify
 * an element chosen by selector (used by `ui-atlas capture --select` and by the
 * integration tests) without mounting the inspector.
 */
const PROBE_GLOBAL = '__uiAtlasProbe';
const globals = window;
if (globals[PROBE_GLOBAL] === undefined) {
    Object.defineProperty(window, PROBE_GLOBAL, {
        value: (element) => probeElement(element),
        configurable: true,
        enumerable: false,
        writable: false,
    });
}
//# sourceMappingURL=probe-entry.js.map