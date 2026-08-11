import type { QueryRules } from '@ui-atlas/config';

export interface CanonicalOptions {
  trailingSlash: 'strip' | 'keep';
  query: QueryRules;
}

export type CanonicalOutcome =
  | { ok: true; url: string; parsed: URL }
  | { ok: false; reason: 'unparseable' | 'unsupported-scheme'; detail: string };

/** Only these can be navigated to. Everything else is somebody else's protocol. */
const NAVIGABLE_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * `utm_*` style prefix matching. Query parameter names are technically
 * case-sensitive, but every tracking parameter in the wild is lower-case and
 * sites are inconsistent about it, so matching folds case.
 */
function matchesParamRule(name: string, rule: string): boolean {
  const lowerName = name.toLowerCase();
  const lowerRule = rule.toLowerCase();
  if (lowerRule.endsWith('*')) return lowerName.startsWith(lowerRule.slice(0, -1));
  return lowerName === lowerRule;
}

function matchesAnyParamRule(name: string, rules: string[]): boolean {
  return rules.some((rule) => matchesParamRule(name, rule));
}

/**
 * Collapse repeated slashes. `new URL` already resolves `.` and `..`, but it
 * preserves `//`, and `/a//b` and `/a/b` are the same page on every server we
 * care about.
 */
function collapseSlashes(pathname: string): string {
  return pathname.replace(/\/{2,}/g, '/');
}

/**
 * Reduce a URL to the one form used for comparison, deduplication and the
 * frontier. Two URLs that canonicalise to the same string are one page.
 *
 * Deliberately *not* reversible: canonicalising drops information (fragments,
 * tracking parameters, credentials). The raw href stays on the skip/queue
 * decision so a surprising result can be traced back.
 */
export function canonicalizeUrl(
  raw: string,
  options: CanonicalOptions,
  base?: string,
): CanonicalOutcome {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, reason: 'unparseable', detail: 'empty href' };
  }

  let url: URL;
  try {
    url = base === undefined ? new URL(trimmed) : new URL(trimmed, base);
  } catch {
    return { ok: false, reason: 'unparseable', detail: trimmed.slice(0, 200) };
  }

  if (!NAVIGABLE_PROTOCOLS.has(url.protocol)) {
    // `mailto:`, `tel:`, `javascript:`, `data:`, `blob:`, `ftp:` and friends.
    return { ok: false, reason: 'unsupported-scheme', detail: url.protocol.replace(':', '') };
  }

  // Credentials are auth material. They must never reach a record, a log line
  // or an artifact path, and they say nothing about which page this is.
  url.username = '';
  url.password = '';

  // A fragment is a position within a page, not a different page.
  url.hash = '';

  // `new URL` already lower-cases the host and drops the default port.
  let pathname = collapseSlashes(url.pathname);
  if (options.trailingSlash === 'strip' && pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.replace(/\/+$/, '');
    if (pathname.length === 0) pathname = '/';
  }
  url.pathname = pathname;

  applyQueryRules(url, options.query);

  return { ok: true, url: url.toString(), parsed: url };
}

function applyQueryRules(url: URL, rules: QueryRules): void {
  if (rules.dropAll) {
    url.search = '';
    return;
  }
  if (url.search.length === 0) return;

  const kept: Array<[string, string]> = [];
  for (const [name, value] of url.searchParams) {
    if (rules.keep.length > 0 && !matchesAnyParamRule(name, rules.keep)) continue;
    if (matchesAnyParamRule(name, rules.drop)) continue;
    kept.push([name, value]);
  }

  if (rules.sort) {
    // Sort by name, then value, so repeated parameters keep a stable order.
    kept.sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])));
  }

  const next = new URLSearchParams();
  for (const [name, value] of kept) next.append(name, value);
  const search = next.toString();
  url.search = search.length === 0 ? '' : `?${search}`;
}

/** The origin a URL belongs to, or `undefined` if it is not a usable URL. */
export function originOf(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    return NAVIGABLE_PROTOCOLS.has(url.protocol) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
