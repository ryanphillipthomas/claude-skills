/**
 * Page-side code. Every function here is passed to `page.evaluate()` as a typed
 * function literal, never as a template string — Playwright does not invoke
 * string page functions, and the resulting `undefined` is invisible until
 * something downstream crashes (ADR 5).
 */

export interface DiscoveredLink {
  /** `HTMLAnchorElement.href`: already absolute, already `<base href>`-resolved. */
  href: string;
  rel: string;
}

/**
 * Read every `<a href>` in the top document.
 *
 * This is the whole of link discovery, and it is the reason the crawler cannot
 * click anything: it only ever *reads* the DOM. No `click()`, no `dispatchEvent`,
 * no form submission, no navigation triggered from page code.
 *
 * Anchors inside iframes are not collected. A frame's links belong to the
 * frame's own origin and following them from the parent's scope would quietly
 * widen the crawl.
 */
export function collectLinks(): DiscoveredLink[] {
  const out: DiscoveredLink[] = [];
  const anchors = document.querySelectorAll('a[href]');
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index] as HTMLAnchorElement | undefined;
    if (anchor === undefined) continue;
    // `.href` on the element resolves against the document base. Reading the
    // attribute instead would leave relative hrefs for the host to resolve
    // against a URL that may already have changed.
    const href = anchor.href;
    if (typeof href !== 'string' || href.length === 0) continue;
    out.push({ href, rel: anchor.getAttribute('rel') ?? '' });
  }
  return out;
}

/** Document title, tolerant of a page that replaced it with something odd. */
export function readTitle(): string {
  return typeof document.title === 'string' ? document.title : '';
}
