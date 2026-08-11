import type { ElementProbe } from '@ui-atlas/protocol';

/**
 * Facts about one interactive control, gathered in the page.
 *
 * `probe` is the *same* description the inspector produces — role, accessible
 * name, text, geometry and scored locator candidates all come from
 * `window.__uiAtlasProbe`, so a control named in the inventory and the same
 * control captured by a recipe are described identically. The rest are the
 * extra facts classification needs and the probe does not carry.
 */
export interface InteractionFacts {
  probe: ElementProbe;
  tagName: string;
  /** `type` on a `<button>` or `<input>`, lower-cased. */
  type: string | undefined;
  /** Resolved absolute `href` for an anchor. */
  href: string | undefined;
  disabled: boolean;
  inForm: boolean;
  /** Lower-cased form method, when the control is inside a form. */
  formMethod: string | undefined;
  ariaExpanded: string | undefined;
  ariaHasPopup: string | undefined;
  hasAriaControls: boolean;
  isSummary: boolean;
}

/**
 * Collect every visible interactive control in the top document.
 *
 * This is a *read*. It queries, measures and describes; it does not click,
 * focus, scroll, dispatch an event or mutate a single attribute. Passed to
 * `page.evaluate` as a function literal, never a string (ADR 5).
 *
 * Everything it needs is declared inside it: Playwright serialises the function
 * alone, so a reference to a module-level constant would arrive as `undefined`.
 */
export function collectInteractions(maxPerPage: number): InteractionFacts[] {
  // Broad on purpose: a control this misses is a control the user is never told
  // about, and the whole point of the inventory is to surface what is there.
  const interactiveSelector = [
    'a[href]',
    'button',
    'summary',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="option"]',
    '[contenteditable="true"]',
    '[onclick]',
  ].join(',');

  const probe = (window as unknown as { __uiAtlasProbe?: (element: Element) => ElementProbe })
    .__uiAtlasProbe;
  if (typeof probe !== 'function') return [];

  const out: InteractionFacts[] = [];
  const seen = new Set<Element>();
  const elements = document.querySelectorAll(interactiveSelector);

  for (let index = 0; index < elements.length && out.length < maxPerPage; index += 1) {
    const element = elements[index];
    if (element === undefined || seen.has(element)) continue;
    seen.add(element);

    const box = element.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) continue;
    const style = window.getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') continue;

    let described: ElementProbe;
    try {
      described = probe(element);
    } catch {
      // One awkward element must not cost the whole page's inventory.
      continue;
    }

    const tagName = element.tagName.toLowerCase();
    const form = (element as HTMLInputElement).form ?? null;
    const typeAttribute = element.getAttribute('type');
    const href = tagName === 'a' ? (element as HTMLAnchorElement).href : undefined;

    out.push({
      probe: described,
      tagName,
      type: typeAttribute === null ? undefined : typeAttribute.toLowerCase(),
      href: href === undefined || href.length === 0 ? undefined : href,
      disabled:
        element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true',
      inForm: form !== null,
      formMethod: form === null ? undefined : (form.getAttribute('method') ?? 'get').toLowerCase(),
      ariaExpanded: element.getAttribute('aria-expanded') ?? undefined,
      ariaHasPopup: element.getAttribute('aria-haspopup') ?? undefined,
      hasAriaControls: element.hasAttribute('aria-controls'),
      isSummary: tagName === 'summary',
    });
  }

  return out;
}
