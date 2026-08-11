/**
 * Functions evaluated inside the page.
 *
 * They are real function literals rather than strings: Playwright serialises
 * the source across the boundary, and a literal keeps them type-checked against
 * the DOM. They must not close over anything from this module.
 */

export interface MutationQuietState {
  /** Milliseconds since the last meaningful mutation. */
  quietForMs: number;
  mutationCount: number;
}

export interface ImageDecodeSummary {
  considered: number;
  complete: number;
  decoded: number;
  failed: number;
  timedOut: number;
}

interface SettleGlobalState {
  last: number;
  count: number;
  observer: MutationObserver | null;
}

type SettleWindow = Window & { __uiAtlasSettle?: SettleGlobalState };

/** Installs (once per document) the MutationObserver backing the quiet check. */
export function installMutationObserver(): boolean {
  const scope = window as SettleWindow;
  if (scope.__uiAtlasSettle?.observer != null) return true;

  const state: SettleGlobalState = { last: performance.now(), count: 0, observer: null };

  // The inspector's own DOM must not reset the quiet window.
  const isOverlay = (node: Node | null): boolean => {
    let current: Node | null = node;
    while (current !== null) {
      if (current instanceof Element && current.hasAttribute('data-ui-atlas-overlay')) return true;
      const parent: Node | null = current.parentNode;
      current = parent ?? (current instanceof ShadowRoot ? current.host : null);
    }
    return false;
  };

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (isOverlay(record.target)) continue;
      state.last = performance.now();
      state.count += 1;
      return;
    }
  });
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  state.observer = observer;
  scope.__uiAtlasSettle = state;
  return true;
}

export function readMutationQuiet(): MutationQuietState {
  const state = (window as SettleWindow).__uiAtlasSettle;
  if (state === undefined) return { quietForMs: Number.MAX_SAFE_INTEGER, mutationCount: 0 };
  return { quietForMs: performance.now() - state.last, mutationCount: state.count };
}

export function disconnectMutationObserver(): boolean {
  const state = (window as SettleWindow).__uiAtlasSettle;
  if (state?.observer != null) {
    state.observer.disconnect();
    state.observer = null;
  }
  return true;
}

export async function waitForFonts(): Promise<string> {
  if (document.fonts === undefined) return 'unsupported';
  await document.fonts.ready;
  return 'ready';
}

/**
 * Decode images that are visible or just off-screen. Each image gets its own
 * budget so one stalled request cannot consume the whole allowance.
 */
export async function decodeVisibleImages(perImageTimeoutMs: number): Promise<ImageDecodeSummary> {
  const margin = 200;
  const viewportHeight = window.innerHeight;
  const images = Array.from(document.images)
    .filter((image) => {
      const rect = image.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      return rect.bottom > -margin && rect.top < viewportHeight + margin;
    })
    .slice(0, 60);

  const summary: ImageDecodeSummary = {
    considered: images.length,
    complete: 0,
    decoded: 0,
    failed: 0,
    timedOut: 0,
  };

  await Promise.all(
    images.map(async (image) => {
      if (image.complete && image.naturalWidth > 0) {
        summary.complete += 1;
        return;
      }
      const outcome = await Promise.race([
        image.decode().then(
          () => 'decoded',
          () => 'failed',
        ),
        new Promise<string>((resolve) => setTimeout(() => resolve('timedOut'), perImageTimeoutMs)),
      ]);
      if (outcome === 'decoded') summary.decoded += 1;
      else if (outcome === 'failed') summary.failed += 1;
      else summary.timedOut += 1;
    }),
  );
  return summary;
}

export function waitAnimationFramesInPage(count: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let remaining = Math.max(0, count);
    const tick = (): void => {
      if (remaining <= 0) {
        resolve(true);
        return;
      }
      remaining -= 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
