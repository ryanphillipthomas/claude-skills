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

export class Highlight {
  private readonly layer: HTMLDivElement;
  private readonly hoverBox: HTMLDivElement;
  private readonly selectedBox: HTMLDivElement;
  private readonly marginBox: HTMLDivElement;
  private readonly paddingBox: HTMLDivElement;
  private readonly label: HTMLDivElement;
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
    this.layer.append(this.marginBox, this.paddingBox, this.hoverBox, this.selectedBox, this.label);
    root.append(this.layer);
    this.hideHover();
    this.hideSelected();
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
