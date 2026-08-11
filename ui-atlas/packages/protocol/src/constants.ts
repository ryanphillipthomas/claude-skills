/**
 * Constants shared with the injected page bundle. Kept free of `zod` (and of
 * any other runtime dependency) so importing them into the overlay does not
 * drag a validation library into every inspected page.
 */

/**
 * Name of the Playwright context binding installed on every frame. Page code
 * calls `window[BRIDGE_BINDING](envelope)` and receives a promise.
 *
 * The binding is reachable by any script in the page, so the host treats every
 * inbound message as untrusted: it is schema-validated, must carry the
 * per-session token, and can only ask for operations the host is willing to
 * perform. The host never exposes filesystem paths or an eval endpoint here.
 */
export const BRIDGE_BINDING = '__uiAtlasBridge';

/** Global the overlay installs so the host can push events into the page. */
export const OVERLAY_GLOBAL = '__uiAtlasOverlay';

/** Attribute on the overlay's shadow host, used to hide it before a capture. */
export const OVERLAY_HOST_ATTRIBUTE = 'data-ui-atlas-overlay';

export const PROTOCOL_VERSION = 1;

export const DEFAULT_SHORTCUTS: Record<string, string> = {
  toggleInspect: 'Alt+I',
  captureElement: 'Alt+C',
  captureViewport: 'Alt+V',
  captureResponsive: 'Alt+R',
  captureAnimation: 'Alt+A',
  cancel: 'Escape',
  selectParent: 'ArrowUp',
  selectChild: 'ArrowDown',
  selectPrevSibling: 'ArrowLeft',
  selectNextSibling: 'ArrowRight',
};
