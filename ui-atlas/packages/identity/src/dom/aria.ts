/**
 * A pragmatic subset of ARIA role inference and accessible-name computation.
 *
 * This is deliberately *not* a full accname implementation: it runs in the page
 * on every pointer move, so it trades completeness for speed and predictability.
 * Whatever it produces is only ever a locator *candidate* — the Playwright host
 * re-resolves the resulting `getByRole` selector before acting, so a wrong guess
 * degrades to the next candidate rather than to a wrong element.
 */

const INPUT_TYPE_ROLES: Record<string, string> = {
  button: 'button',
  submit: 'button',
  reset: 'button',
  image: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  number: 'spinbutton',
  search: 'searchbox',
  email: 'textbox',
  tel: 'textbox',
  text: 'textbox',
  url: 'textbox',
};

const SIMPLE_TAG_ROLES: Record<string, string> = {
  article: 'article',
  aside: 'complementary',
  button: 'button',
  datalist: 'listbox',
  dd: 'definition',
  dfn: 'term',
  dialog: 'dialog',
  dt: 'term',
  fieldset: 'group',
  figure: 'figure',
  form: 'form',
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',
  hr: 'separator',
  li: 'listitem',
  main: 'main',
  math: 'math',
  menu: 'list',
  meter: 'meter',
  nav: 'navigation',
  ol: 'list',
  optgroup: 'group',
  option: 'option',
  output: 'status',
  p: 'paragraph',
  progress: 'progressbar',
  search: 'search',
  summary: 'button',
  table: 'table',
  tbody: 'rowgroup',
  td: 'cell',
  textarea: 'textbox',
  tfoot: 'rowgroup',
  th: 'columnheader',
  thead: 'rowgroup',
  tr: 'row',
  ul: 'list',
};

/** Roles whose accessible name may come from the element's own text content. */
const NAME_FROM_CONTENT = new Set([
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'gridcell',
  'heading',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'row',
  'rowheader',
  'switch',
  'tab',
  'tooltip',
  'treeitem',
]);

export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Best-effort implicit or explicit ARIA role. */
export function computeRole(element: Element): string | undefined {
  const explicit = element.getAttribute('role');
  if (explicit !== null) {
    const first = explicit.trim().split(/\s+/)[0];
    if (first !== undefined && first.length > 0) return first;
  }

  const tag = element.tagName.toLowerCase();

  if (tag === 'a' || tag === 'area') {
    return element.hasAttribute('href') ? 'link' : undefined;
  }
  if (tag === 'input') {
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (type === 'hidden') return undefined;
    return INPUT_TYPE_ROLES[type] ?? 'textbox';
  }
  if (tag === 'select') {
    const size = Number(element.getAttribute('size') ?? '0');
    return element.hasAttribute('multiple') || size > 1 ? 'listbox' : 'combobox';
  }
  if (tag === 'img') {
    const alt = element.getAttribute('alt');
    return alt === '' ? 'presentation' : 'img';
  }
  if (tag === 'section') {
    return hasAccessibleNameAttribute(element) ? 'region' : undefined;
  }
  if (tag === 'header') {
    return isInsideSectioningContent(element) ? undefined : 'banner';
  }
  if (tag === 'footer') {
    return isInsideSectioningContent(element) ? undefined : 'contentinfo';
  }
  if (tag === 'details') return 'group';

  return SIMPLE_TAG_ROLES[tag];
}

function hasAccessibleNameAttribute(element: Element): boolean {
  return element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby');
}

function isInsideSectioningContent(element: Element): boolean {
  let parent = element.parentElement;
  while (parent !== null) {
    const tag = parent.tagName.toLowerCase();
    if (tag === 'article' || tag === 'aside' || tag === 'nav' || tag === 'section') return true;
    parent = parent.parentElement;
  }
  return false;
}

function textFromIdRefs(element: Element, attribute: string): string | undefined {
  const refs = element.getAttribute(attribute);
  if (refs === null) return undefined;
  const root = element.getRootNode();
  const scope: ParentNode =
    root instanceof ShadowRoot || root instanceof Document ? root : element.ownerDocument;
  const parts: string[] = [];
  for (const id of refs.split(/\s+/).filter((part) => part.length > 0)) {
    let target: Element | null = null;
    try {
      target = scope.querySelector(`[id="${CSS.escape(id)}"]`);
    } catch {
      target = null;
    }
    if (target !== null) parts.push(collapseWhitespace(target.textContent ?? ''));
  }
  const joined = collapseWhitespace(parts.join(' '));
  return joined.length > 0 ? joined : undefined;
}

function labelText(element: Element): string | undefined {
  const doc = element.ownerDocument;
  const parts: string[] = [];

  if (element.id.length > 0) {
    let labels: NodeListOf<Element> | null = null;
    try {
      labels = doc.querySelectorAll(`label[for="${CSS.escape(element.id)}"]`);
    } catch {
      labels = null;
    }
    if (labels !== null) {
      for (const label of Array.from(labels)) parts.push(collapseWhitespace(label.textContent ?? ''));
    }
  }

  const wrapping = element.closest('label');
  if (wrapping !== null) parts.push(collapseWhitespace(wrapping.textContent ?? ''));

  const joined = collapseWhitespace(parts.join(' '));
  return joined.length > 0 ? joined : undefined;
}

/**
 * Accessible name, following the practical part of the accname algorithm:
 * aria-labelledby, aria-label, native labelling, then name-from-content.
 */
export function computeAccessibleName(element: Element, role = computeRole(element)): string | undefined {
  const labelledBy = textFromIdRefs(element, 'aria-labelledby');
  if (labelledBy !== undefined) return labelledBy;

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel !== null) {
    const collapsed = collapseWhitespace(ariaLabel);
    if (collapsed.length > 0) return collapsed;
  }

  const tag = element.tagName.toLowerCase();

  if (tag === 'input' || tag === 'select' || tag === 'textarea') {
    const type = (element.getAttribute('type') ?? '').toLowerCase();
    if (tag === 'input' && (type === 'button' || type === 'submit' || type === 'reset')) {
      const value = element.getAttribute('value');
      if (value !== null && value.trim().length > 0) return collapseWhitespace(value);
      if (type === 'submit') return 'Submit';
      if (type === 'reset') return 'Reset';
    }
    if (tag === 'input' && type === 'image') {
      const alt = element.getAttribute('alt');
      if (alt !== null && alt.trim().length > 0) return collapseWhitespace(alt);
    }
    const label = labelText(element);
    if (label !== undefined) return label;
    const placeholder = element.getAttribute('placeholder');
    if (placeholder !== null && placeholder.trim().length > 0) return collapseWhitespace(placeholder);
  }

  if (tag === 'img' || tag === 'area') {
    const alt = element.getAttribute('alt');
    if (alt !== null && alt.length > 0) return collapseWhitespace(alt);
  }

  if (tag === 'fieldset') {
    const legend = element.querySelector('legend');
    if (legend !== null) return collapseWhitespace(legend.textContent ?? '');
  }

  if (tag === 'table' || tag === 'figure') {
    const caption = element.querySelector(tag === 'table' ? 'caption' : 'figcaption');
    if (caption !== null) return collapseWhitespace(caption.textContent ?? '');
  }

  if (role !== undefined && NAME_FROM_CONTENT.has(role)) {
    const text = collapseWhitespace(element.textContent ?? '');
    if (text.length > 0) return text.length > 200 ? text.slice(0, 200) : text;
  }

  const title = element.getAttribute('title');
  if (title !== null && title.trim().length > 0) return collapseWhitespace(title);

  return undefined;
}

export { NAME_FROM_CONTENT };
