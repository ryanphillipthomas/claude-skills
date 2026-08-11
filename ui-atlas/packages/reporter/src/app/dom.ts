/**
 * Tiny DOM helpers.
 *
 * Everything the viewer renders originates from an inspected website, so text
 * is only ever assigned through `textContent`. There is no `innerHTML` in the
 * viewer, and adding one would be a security bug.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    className?: string;
    text?: string;
    title?: string;
    attrs?: Record<string, string>;
    children?: Array<Node | undefined>;
  } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className !== undefined) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.title !== undefined) node.title = options.title;
  for (const [name, value] of Object.entries(options.attrs ?? {})) node.setAttribute(name, value);
  for (const child of options.children ?? []) {
    if (child !== undefined) node.append(child);
  }
  return node;
}

export function clear(node: Element): void {
  node.textContent = '';
}

export function badge(text: string, variant?: string, title?: string): HTMLSpanElement {
  return el('span', {
    className: variant === undefined ? 'badge' : `badge badge--${variant}`,
    text,
    ...(title === undefined ? {} : { title }),
  });
}

export function pair(term: string, description: string, mono = false): DocumentFragment {
  const fragment = document.createDocumentFragment();
  fragment.append(el('dt', { text: term }));
  fragment.append(el('dd', { className: mono ? 'mono' : '', text: description }));
  return fragment;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

/** `file://` is not a secure context, so the async clipboard API is unavailable. */
export function copyText(value: string): boolean {
  const holder = document.createElement('textarea');
  holder.value = value;
  holder.setAttribute('readonly', '');
  holder.style.position = 'fixed';
  holder.style.opacity = '0';
  document.body.append(holder);
  holder.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  holder.remove();
  return copied;
}
