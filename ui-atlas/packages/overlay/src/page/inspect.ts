import { OVERLAY_HOST_ATTRIBUTE } from '@ui-atlas/protocol/constants';

export interface InspectCallbacks {
  onHover(element: Element | undefined): void;
  onSelect(element: Element): void;
  onCancel(): void;
  /** Alt/Option + click asks the page to handle the click normally. */
  onInteract(element: Element): void;
}

/** True when `node` is part of the inspector's own UI. */
export function isOverlayNode(node: EventTarget | Node | null): boolean {
  let current: Node | null = node as Node | null;
  while (current !== null) {
    if (current instanceof Element && current.hasAttribute(OVERLAY_HOST_ATTRIBUTE)) return true;
    const parent: Node | null = current.parentNode;
    if (parent === null) {
      const root = current.getRootNode();
      if (root instanceof ShadowRoot) {
        current = root.host;
        continue;
      }
      return false;
    }
    current = parent;
  }
  return false;
}

/**
 * Deepest element under the pointer, descending through open shadow roots and
 * ignoring the inspector's own layers. Closed shadow roots stop the descent —
 * that limitation is reported rather than silently ignored.
 */
export function deepElementFromPoint(x: number, y: number): Element | undefined {
  let root: Document | ShadowRoot = document;
  let found: Element | undefined;

  for (let depth = 0; depth < 20; depth += 1) {
    const candidates: Element[] = root
      .elementsFromPoint(x, y)
      .filter((element: Element) => !isOverlayNode(element));
    const next: Element | undefined = candidates[0];
    if (next === undefined || next === found) break;
    found = next;
    const shadow: ShadowRoot | null = next.shadowRoot;
    if (shadow === null) break;
    root = shadow;
  }
  return found;
}

type Cleanup = () => void;

/**
 * Owns every listener inspect mode installs. `disable()` removes all of them,
 * so normal page interaction returns exactly as it was.
 */
export class InspectMode {
  private cleanups: Cleanup[] = [];
  private enabled = false;
  private hovered: Element | undefined;

  constructor(private readonly callbacks: InspectCallbacks) {}

  get active(): boolean {
    return this.enabled;
  }

  get hoveredElement(): Element | undefined {
    return this.hovered;
  }

  enable(): void {
    if (this.enabled) return;
    this.enabled = true;

    this.listen('pointermove', (event) => {
      const pointer = event as PointerEvent;
      if (isOverlayNode(pointer.target)) {
        this.setHovered(undefined);
        return;
      }
      this.setHovered(deepElementFromPoint(pointer.clientX, pointer.clientY));
    });

    // Swallow the whole pointer/click sequence so the page never sees the
    // selection gesture. Alt/Option is the documented escape hatch.
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'pointerup', 'dblclick', 'contextmenu'] as const) {
      this.listen(type, (event) => {
        if (isOverlayNode(event.target)) return;
        if ((event as MouseEvent).altKey) return;
        event.preventDefault();
        event.stopPropagation();
      });
    }

    this.listen('click', (event) => {
      if (isOverlayNode(event.target)) return;
      const mouse = event as MouseEvent;
      const element = deepElementFromPoint(mouse.clientX, mouse.clientY);
      if (element === undefined) return;
      if (mouse.altKey) {
        this.callbacks.onInteract(element);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.callbacks.onSelect(element);
    });

    this.listen('pointerleave', () => this.setHovered(undefined), window);
  }

  disable(): void {
    if (!this.enabled) return;
    this.enabled = false;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.setHovered(undefined);
  }

  private setHovered(element: Element | undefined): void {
    if (element === this.hovered) return;
    this.hovered = element;
    this.callbacks.onHover(element);
  }

  private listen(
    type: string,
    handler: (event: Event) => void,
    target: EventTarget = document,
  ): void {
    const options: AddEventListenerOptions = { capture: true };
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => {
      target.removeEventListener(type, handler, options);
    });
  }
}

/** Move a selection to a neighbouring element, crossing open shadow roots. */
export function navigateFrom(
  element: Element,
  direction: 'parent' | 'child' | 'previous' | 'next',
): Element | undefined {
  switch (direction) {
    case 'parent': {
      const parent = element.parentElement;
      if (parent !== null) return parent;
      const root = element.getRootNode();
      return root instanceof ShadowRoot ? root.host : undefined;
    }
    case 'child': {
      const shadow = element.shadowRoot;
      if (shadow !== null && shadow.firstElementChild !== null) return shadow.firstElementChild;
      return element.firstElementChild ?? undefined;
    }
    case 'previous':
      return element.previousElementSibling ?? undefined;
    case 'next':
      return element.nextElementSibling ?? undefined;
    default:
      return undefined;
  }
}
