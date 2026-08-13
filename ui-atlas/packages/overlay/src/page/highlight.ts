/**
 * A non-layout-shifting highlight. Everything lives inside the overlay's shadow
 * root in a fixed-position, pointer-events-none layer, so pointing at an
 * element never moves the page or steals its events.
 */
export interface HighlightOptions {
  showBoxModel: boolean;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The panel's standard easing. */
const EASE = 'cubic-bezier(.32,.72,0,1)';

export class Highlight {
  private readonly layer: HTMLDivElement;
  private readonly hoverBox: HTMLDivElement;
  private readonly selectedBox: HTMLDivElement;
  private readonly marginBox: HTMLDivElement;
  private readonly paddingBox: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly shutterBox: HTMLDivElement;
  private readonly shutterScale: HTMLDivElement;
  private readonly shutterBand: HTMLDivElement;
  private readonly shutterFlash: HTMLDivElement;
  private shutterRunning = 0;
  private options: HighlightOptions;

  constructor(root: ShadowRoot, options: HighlightOptions) {
    this.options = options;
    this.layer = document.createElement('div');
    this.layer.className = 'ua-highlight-layer';
    this.marginBox = box('ua-box ua-box--margin');
    this.paddingBox = box('ua-box ua-box--padding');
    this.hoverBox = box('ua-box ua-box--hover');
    this.selectedBox = box('ua-box ua-box--selected');
    this.label = document.createElement('div');
    this.label.className = 'ua-box-label';
    this.label.hidden = true;

    // The shutter is three nested elements rather than one so that the scale,
    // the sweep and the flash can run on their own timings without fighting
    // over a single `transform`: the outer box carries the element's position,
    // the middle one scales, and the band travels inside it.
    this.shutterBox = box('ua-shutter');
    this.shutterScale = document.createElement('div');
    this.shutterScale.className = 'ua-shutter__scale';
    this.shutterBand = document.createElement('div');
    this.shutterBand.className = 'ua-shutter__band';
    this.shutterFlash = document.createElement('div');
    this.shutterFlash.className = 'ua-shutter__flash';
    this.shutterScale.append(this.shutterBand, this.shutterFlash);
    this.shutterBox.append(this.shutterScale);

    this.layer.append(
      this.marginBox,
      this.paddingBox,
      this.hoverBox,
      this.selectedBox,
      this.shutterBox,
      this.label,
    );
    root.append(this.layer);
    this.hideHover();
    this.hideSelected();
  }

  /**
   * The shutter: what a photograph being taken looks like.
   *
   * Drawn entirely inside this overlay, clipped to the element's box, so the
   * page under capture keeps its own DOM, its own styles and its own layout —
   * the element is never transformed, only the rectangle drawn over it.
   *
   * Composited properties only (`transform` and `opacity`), and driven by the
   * Web Animations API rather than by toggling a class, because restarting a
   * CSS animation means reading a layout property to force a reflow, and that
   * reflow would be of the whole document, page included.
   */
  flash(element: Element): void {
    if (!element.isConnected) return;
    place(this.shutterBox, element.getBoundingClientRect());
    this.shutterBox.hidden = false;
    this.shutterRunning += 1;

    const reduced = prefersReducedMotion();
    const done = (): void => {
      this.shutterRunning -= 1;
      if (this.shutterRunning === 0) this.shutterBox.hidden = true;
    };

    if (reduced) {
      // No sweep and no scale: one short cross-fade, which still says "this
      // was photographed just now" without any travel.
      this.shutterBand.style.opacity = '0';
      animate(this.shutterFlash, [{ opacity: 0 }, { opacity: 0.85 }, { opacity: 0 }], 120, 'linear', done);
      return;
    }

    this.shutterBand.style.opacity = '';
    animate(
      this.shutterScale,
      [{ transform: 'scale(1)' }, { transform: 'scale(0.974)', offset: 0.45 }, { transform: 'scale(1)' }],
      180,
      EASE,
    );
    animate(
      this.shutterBand,
      [
        { transform: 'translateY(-100%)', opacity: 0 },
        { opacity: 1, offset: 0.12 },
        { transform: 'translateY(110%)', opacity: 0 },
      ],
      180,
      EASE,
    );
    animate(
      this.shutterFlash,
      [{ opacity: 0 }, { opacity: 0.85, offset: 0.15 }, { opacity: 0 }],
      140,
      'ease-out',
      done,
    );
  }

  setOptions(options: HighlightOptions): void {
    this.options = options;
    if (!options.showBoxModel) {
      this.marginBox.hidden = true;
      this.paddingBox.hidden = true;
    }
  }

  showHover(element: Element, caption: string): void {
    const rect = element.getBoundingClientRect();
    place(this.hoverBox, rect);
    this.hoverBox.hidden = false;
    this.label.textContent = caption;
    this.label.hidden = false;
    placeLabel(this.label, rect);
    if (this.options.showBoxModel) this.showBoxModel(element, rect);
  }

  hideHover(): void {
    this.hoverBox.hidden = true;
    this.label.hidden = true;
    this.marginBox.hidden = true;
    this.paddingBox.hidden = true;
  }

  showSelected(element: Element): void {
    place(this.selectedBox, element.getBoundingClientRect());
    this.selectedBox.hidden = false;
  }

  hideSelected(): void {
    this.selectedBox.hidden = true;
  }

  /** Re-measure a still-selected element after scroll, resize or layout change. */
  refreshSelected(element: Element | undefined): void {
    if (element === undefined || !element.isConnected) {
      this.hideSelected();
      return;
    }
    place(this.selectedBox, element.getBoundingClientRect());
  }

  private showBoxModel(element: Element, rect: Rect): void {
    const view = element.ownerDocument.defaultView;
    if (view === null) return;
    const style = view.getComputedStyle(element);
    const num = (value: string): number => Number.parseFloat(value) || 0;

    place(this.marginBox, {
      x: rect.x - num(style.marginLeft),
      y: rect.y - num(style.marginTop),
      width: rect.width + num(style.marginLeft) + num(style.marginRight),
      height: rect.height + num(style.marginTop) + num(style.marginBottom),
    });
    place(this.paddingBox, {
      x: rect.x + num(style.paddingLeft) + num(style.borderLeftWidth),
      y: rect.y + num(style.paddingTop) + num(style.borderTopWidth),
      width: Math.max(
        0,
        rect.width - num(style.paddingLeft) - num(style.paddingRight) - num(style.borderLeftWidth) - num(style.borderRightWidth),
      ),
      height: Math.max(
        0,
        rect.height - num(style.paddingTop) - num(style.paddingBottom) - num(style.borderTopWidth) - num(style.borderBottomWidth),
      ),
    });
    this.marginBox.hidden = false;
    this.paddingBox.hidden = false;
  }

  destroy(): void {
    this.layer.remove();
  }
}

function box(className: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = className;
  element.hidden = true;
  return element;
}

/**
 * Whether the operator has asked for less movement.
 *
 * Read at the moment of use rather than cached, so changing the system setting
 * takes effect on the next capture instead of on the next page load.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/** `element.animate`, with the browsers that lack it simply not animating. */
function animate(
  element: HTMLElement,
  frames: Keyframe[],
  duration: number,
  easing: string,
  onFinish?: () => void,
): void {
  if (typeof element.animate !== 'function') {
    onFinish?.();
    return;
  }
  const animation = element.animate(frames, { duration, easing, fill: 'none' });
  if (onFinish !== undefined) {
    animation.addEventListener('finish', onFinish, { once: true });
    animation.addEventListener('cancel', onFinish, { once: true });
  }
}

function place(element: HTMLDivElement, rect: Rect): void {
  element.style.transform = `translate(${String(Math.round(rect.x))}px, ${String(Math.round(rect.y))}px)`;
  element.style.width = `${String(Math.max(0, Math.round(rect.width)))}px`;
  element.style.height = `${String(Math.max(0, Math.round(rect.height)))}px`;
}

function placeLabel(element: HTMLDivElement, rect: Rect): void {
  const above = rect.y > 24;
  const y = above ? rect.y - 22 : rect.y + rect.height + 4;
  element.style.transform = `translate(${String(Math.round(rect.x))}px, ${String(Math.round(y))}px)`;
}
