import type { CrawlConfig } from '@ui-atlas/config';
import type { CrawlSkipReason } from '@ui-atlas/protocol';
import { canonicalizeUrl, originOf, type CanonicalOptions } from './canonical.js';
import { firstMatchingGlob } from './glob.js';

export interface LinkCandidate {
  /** The resolved `href` exactly as the page gave it. */
  raw: string;
  rel?: string | undefined;
}

export type PolicyDecision =
  | { admitted: true; url: string }
  | {
      admitted: false;
      reason: CrawlSkipReason;
      /** Which rule fired: a glob, a scheme, an extension, an origin. */
      detail: string;
      /** Present when the URL got far enough to be canonicalised. */
      url?: string;
    };

function extensionOf(pathname: string): string {
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  const dot = lastSegment.lastIndexOf('.');
  return dot <= 0 ? '' : lastSegment.slice(dot).toLowerCase();
}

/**
 * Decides whether one discovered link is in scope. Everything here is a pure
 * function of the URL and the configuration: no network, no browser, no
 * ordering effects. Depth, deduplication and budgets belong to the frontier,
 * which knows about the crawl so far.
 */
export class CrawlPolicy {
  readonly origins: ReadonlySet<string>;
  private readonly canonicalOptions: CanonicalOptions;
  private readonly downloadExtensions: ReadonlySet<string>;

  constructor(
    private readonly config: CrawlConfig,
    seeds: readonly string[],
  ) {
    // Every seed's own origin is in scope; that is what "same-origin crawl"
    // means. `allowOrigins` widens it deliberately.
    const origins = new Set<string>();
    for (const seed of [...seeds, ...config.allowOrigins]) {
      const origin = originOf(seed);
      if (origin !== undefined) origins.add(origin);
    }
    this.origins = origins;

    this.canonicalOptions = { trailingSlash: config.trailingSlash, query: config.query };
    this.downloadExtensions = new Set(
      config.downloadExtensions.map((extension) =>
        extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`,
      ),
    );
  }

  /** Canonicalise a URL with this policy's rules, without judging it. */
  canonicalize(raw: string, base?: string): ReturnType<typeof canonicalizeUrl> {
    return canonicalizeUrl(raw, this.canonicalOptions, base);
  }

  evaluate(candidate: LinkCandidate, base?: string): PolicyDecision {
    if (this.config.respectNofollow && hasNofollow(candidate.rel)) {
      return { admitted: false, reason: 'nofollow', detail: 'rel="nofollow"' };
    }

    const canonical = this.canonicalize(candidate.raw, base);
    if (!canonical.ok) {
      return { admitted: false, reason: canonical.reason, detail: canonical.detail };
    }

    const { url, parsed } = canonical;

    if (!this.origins.has(parsed.origin)) {
      return { admitted: false, reason: 'cross-origin', detail: parsed.origin, url };
    }

    const extension = extensionOf(parsed.pathname);
    if (extension.length > 0 && this.downloadExtensions.has(extension)) {
      return { admitted: false, reason: 'download', detail: extension, url };
    }

    // Deny rules are checked before `exclude` and reported separately: an
    // operator scanning a summary should be able to see "the crawler declined
    // to sign itself out" without reading their own glob list.
    const denied = firstMatchingGlob(parsed.pathname, this.config.denyPaths);
    if (denied !== undefined) {
      return { admitted: false, reason: 'denied-path', detail: denied, url };
    }

    const excluded = firstMatchingGlob(parsed.pathname, this.config.exclude);
    if (excluded !== undefined) {
      return { admitted: false, reason: 'excluded', detail: excluded, url };
    }

    const included = firstMatchingGlob(parsed.pathname, this.config.include);
    if (included === undefined) {
      return {
        admitted: false,
        reason: 'not-included',
        detail: this.config.include.join(', '),
        url,
      };
    }

    return { admitted: true, url };
  }
}

function hasNofollow(rel: string | undefined): boolean {
  if (rel === undefined || rel.length === 0) return false;
  return rel
    .toLowerCase()
    .split(/\s+/)
    .includes('nofollow');
}
