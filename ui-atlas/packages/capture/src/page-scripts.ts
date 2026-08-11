/**
 * Functions Playwright serialises into the inspected page.
 *
 * Real function literals, not strings: Playwright evaluates a string as a plain
 * expression and never calls it, and a literal stays type-checked against the
 * DOM. They must not close over anything from this module.
 */
import type { StyleSnapshot } from '@ui-atlas/protocol';

export interface StyleProbe {
  styles: StyleSnapshot;
  visibleDescendants: number;
  box: { x: number; y: number; width: number; height: number };
}

export function readStyles(element: Element, properties: readonly string[]): StyleProbe {
  const view = element.ownerDocument.defaultView;
  if (view === null) throw new Error('element has no window');
  const computed = view.getComputedStyle(element);

  const styles: StyleSnapshot = {};
  for (const property of properties) styles[property] = computed.getPropertyValue(property);

  // Descendant visibility is cheap evidence that a state (a hover menu, an
  // expanded disclosure) actually did something.
  let visibleDescendants = 0;
  const descendants = element.querySelectorAll('*');
  const limit = Math.min(descendants.length, 500);
  for (let index = 0; index < limit; index += 1) {
    const child = descendants[index];
    if (child === undefined) continue;
    const childStyle = view.getComputedStyle(child);
    if (childStyle.display === 'none' || childStyle.visibility === 'hidden') continue;
    const childRect = child.getBoundingClientRect();
    if (childRect.width > 0 && childRect.height > 0) visibleDescendants += 1;
  }

  const rect = element.getBoundingClientRect();
  return {
    styles,
    visibleDescendants,
    box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
  };
}

export interface StateFlags {
  checked: boolean;
  selected: boolean;
  expanded: boolean;
  disabled: boolean;
  focusVisible: boolean;
  focused: boolean;
  active: boolean;
  supportsChecked: boolean;
  supportsDisabled: boolean;
  tagName: string;
}

export function readStateFlags(element: Element): StateFlags {
  const anyElement = element as Element & {
    checked?: boolean;
    selected?: boolean;
    open?: boolean;
    disabled?: boolean;
    type?: string;
  };
  const isTrue = (name: string): boolean => element.getAttribute(name) === 'true';
  const matches = (selector: string): boolean => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  };
  const root = element.getRootNode() as Document | ShadowRoot;

  return {
    checked: anyElement.checked === true || isTrue('aria-checked'),
    selected: anyElement.selected === true || isTrue('aria-selected'),
    expanded: isTrue('aria-expanded') || anyElement.open === true,
    disabled: anyElement.disabled === true || isTrue('aria-disabled'),
    focusVisible: matches(':focus-visible'),
    focused: root.activeElement === element || document.activeElement === element,
    active: matches(':active'),
    supportsChecked:
      element.tagName === 'INPUT' && (anyElement.type === 'checkbox' || anyElement.type === 'radio'),
    supportsDisabled: 'disabled' in element,
    tagName: element.tagName.toLowerCase(),
  };
}

export interface ForceRequest {
  attribute: string;
  attributeValue: string;
  property: string | null;
  propertyValue: boolean;
}

export interface ForceUndo {
  attribute: string | null;
  hadAttribute: boolean;
  previousAttribute: string | null;
  property: string | null;
  previousProperty: boolean | null;
}

/** Apply a forced attribute/property and describe exactly how to undo it. */
export function forceStateFlag(element: Element, request: ForceRequest): ForceUndo {
  const target = element as Element & Record<string, unknown>;
  if (request.property !== null && request.property in target) {
    const previous = target[request.property];
    target[request.property] = request.propertyValue;
    return {
      attribute: null,
      hadAttribute: false,
      previousAttribute: null,
      property: request.property,
      previousProperty: previous === true,
    };
  }
  const hadAttribute = element.hasAttribute(request.attribute);
  const previousAttribute = element.getAttribute(request.attribute);
  element.setAttribute(request.attribute, request.attributeValue);
  return {
    attribute: request.attribute,
    hadAttribute,
    previousAttribute,
    property: null,
    previousProperty: null,
  };
}

export function undoStateFlag(element: Element, undo: ForceUndo): boolean {
  const target = element as Element & Record<string, unknown>;
  if (undo.property !== null) {
    target[undo.property] = undo.previousProperty === true;
    return true;
  }
  if (undo.attribute === null) return true;
  if (undo.hadAttribute && undo.previousAttribute !== null) {
    element.setAttribute(undo.attribute, undo.previousAttribute);
  } else {
    element.removeAttribute(undo.attribute);
  }
  return true;
}

export function blurElement(element: Element): void {
  const target = element as Element & { blur?: () => void };
  if (typeof target.blur === 'function') target.blur();
}

export function blurActiveElement(): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}

export function documentMetrics(): { width: number; height: number } {
  const body = document.body as HTMLElement | null;
  return {
    width: Math.max(document.documentElement.scrollWidth, body?.scrollWidth ?? 0),
    height: Math.max(document.documentElement.scrollHeight, body?.scrollHeight ?? 0),
  };
}

export function snapshotBodyWithoutOverlay(): string {
  const body = document.body;
  if (body === null) return '';
  const clone = body.cloneNode(true) as HTMLElement;
  for (const host of Array.from(clone.querySelectorAll('[data-ui-atlas-overlay]'))) host.remove();
  return clone.innerHTML;
}

type StyleOwnerWindow = Window & { __uiAtlasStyleOwners?: WeakSet<Element> };

/**
 * Remember which elements already carried an inline `style` attribute.
 *
 * Taking a screenshot makes Chromium materialise an empty `style=""` attribute
 * on some form controls. It changes nothing visually, but it is still a change
 * to the user's page, and the inspector promises to leave the page as it found
 * it — so we record the prior state and undo the difference afterwards.
 */
export function markInlineStyleOwners(): number {
  const scope = window as StyleOwnerWindow;
  const owners = new WeakSet<Element>();
  const styled = document.querySelectorAll('[style]');
  for (const element of Array.from(styled)) owners.add(element);
  scope.__uiAtlasStyleOwners = owners;
  return styled.length;
}

/** Drop `style=""` attributes that were not there before the screenshot. */
export function removeIntroducedEmptyStyleAttributes(): number {
  const owners = (window as StyleOwnerWindow).__uiAtlasStyleOwners;
  let removed = 0;
  for (const element of Array.from(document.querySelectorAll('[style]'))) {
    if (element.getAttribute('style') !== '') continue;
    if (owners?.has(element) === true) continue;
    element.removeAttribute('style');
    removed += 1;
  }
  return removed;
}
