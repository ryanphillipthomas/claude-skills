import { createHash } from 'node:crypto';
import type { CrawlBudgets } from '@ui-atlas/config';
import {
  CRAWL_SKIP_REASONS,
  SCHEMA_VERSION,
  type CrawlSkipReason,
  type CrawlState,
  type FrontierItem,
} from '@ui-atlas/protocol';
import type { CrawlPolicy, LinkCandidate } from './policy.js';

/**
 * Deterministic function of the canonical URL and nothing else — not of the
 * run, the clock or the order links were found in. Restarting a crawl produces
 * the same key for the same page, which is what makes a resumed run idempotent
 * rather than merely lucky.
 */
export function frontierKey(canonicalUrl: string): string {
  return createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 16);
}

export type AdmissionResult =
  | { admitted: true; item: FrontierItem }
  | { admitted: false; reason: CrawlSkipReason; detail: string; url?: string };

export interface FrontierOptions {
  policy: CrawlPolicy;
  budgets: CrawlBudgets;
  /** Restore an interrupted crawl instead of starting empty. */
  resume?: CrawlState | undefined;
}

function emptyCounts(): Record<CrawlSkipReason, number> {
  const counts = {} as Record<CrawlSkipReason, number>;
  for (const reason of CRAWL_SKIP_REASONS) counts[reason] = 0;
  return counts;
}

/**
 * The queue of pages still to visit, plus the record of what has been visited
 * and what was turned away. Breadth-first: a shallow page is always visited
 * before a deeper one, so a crawl cut short by `maxPages` covers the top of the
 * site rather than one arbitrary deep branch.
 */
export class Frontier {
  private readonly pending: FrontierItem[] = [];
  private readonly queued = new Set<string>();
  private readonly visited = new Set<string>();
  private readonly counts = emptyCounts();
  private queueFullReported = false;
  /**
   * Navigations performed, which is what `maxPages` bounds. Distinct from
   * `visited.size`: a redirect destination is marked visited so it is never
   * queued again, but it cost no navigation of its own.
   */
  private navigations = 0;

  constructor(private readonly options: FrontierOptions) {
    const { resume } = options;
    if (resume === undefined) return;

    for (const url of resume.visited) this.visited.add(url);
    this.navigations = resume.navigations;
    for (const item of resume.pending) {
      if (this.visited.has(item.url) || this.queued.has(item.url)) continue;
      this.queued.add(item.url);
      this.pending.push(item);
    }
    for (const reason of CRAWL_SKIP_REASONS) {
      this.counts[reason] = resume.skipCounts[reason] ?? 0;
    }
  }

  /** Navigations performed. This is the number `maxPages` caps. */
  get visitedCount(): number {
    return this.navigations;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  get skipCounts(): Readonly<Record<CrawlSkipReason, number>> {
    return this.counts;
  }

  visitedUrls(): string[] {
    return [...this.visited];
  }

  /** True once the page budget is spent. `next()` stops handing out work here. */
  get pageBudgetSpent(): boolean {
    return this.navigations >= this.options.budgets.maxPages;
  }

  /**
   * Record a URL as seen without spending a navigation on it. Used for the URL
   * a redirect actually landed on: we have already fetched that page, so a
   * later link to it is a duplicate rather than new work.
   */
  markVisited(url: string): void {
    this.visited.add(url);
    // If it was already queued, drop it: visiting it again would fetch a page
    // this run has already fetched.
    if (this.queued.delete(url)) {
      const index = this.pending.findIndex((item) => item.url === url);
      if (index >= 0) this.pending.splice(index, 1);
    }
  }

  /**
   * Offer a discovered link to the queue. Returns why it was turned away rather
   * than swallowing the decision, so every skip can be counted and explained.
   */
  add(candidate: LinkCandidate, context: { base?: string | undefined; depth: number }): AdmissionResult {
    const decision = this.options.policy.evaluate(candidate, context.base);
    if (!decision.admitted) {
      this.counts[decision.reason] += 1;
      const result: AdmissionResult = {
        admitted: false,
        reason: decision.reason,
        detail: decision.detail,
      };
      if (decision.url !== undefined) result.url = decision.url;
      return result;
    }

    const { url } = decision;

    if (this.visited.has(url) || this.queued.has(url)) {
      this.counts.duplicate += 1;
      return { admitted: false, reason: 'duplicate', detail: 'already seen this run', url };
    }

    if (context.depth > this.options.budgets.maxDepth) {
      this.counts['depth-exceeded'] += 1;
      return {
        admitted: false,
        reason: 'depth-exceeded',
        detail: `depth ${String(context.depth)} > maxDepth ${String(this.options.budgets.maxDepth)}`,
        url,
      };
    }

    if (this.pending.length >= this.options.budgets.maxQueued) {
      this.counts['queue-full'] += 1;
      return {
        admitted: false,
        reason: 'queue-full',
        detail: `maxQueued ${String(this.options.budgets.maxQueued)} reached`,
        url,
      };
    }

    const item: FrontierItem = { key: frontierKey(url), url, depth: context.depth };
    if (context.base !== undefined) item.discoveredFrom = context.base;
    this.queued.add(url);
    this.pending.push(item);
    return { admitted: true, item };
  }

  /**
   * The next page to visit, or `undefined` when the queue is empty or the page
   * budget is spent. Marks the page visited: a URL handed out once is never
   * handed out again, even if the visit itself fails.
   */
  next(): FrontierItem | undefined {
    if (this.pageBudgetSpent) return undefined;
    const item = this.pending.shift();
    if (item === undefined) return undefined;
    this.queued.delete(item.url);
    this.visited.add(item.url);
    this.navigations += 1;
    return item;
  }

  /** True once `queue-full` has been reported, so a warning is emitted once. */
  claimQueueFullWarning(): boolean {
    if (this.counts['queue-full'] === 0 || this.queueFullReported) return false;
    this.queueFullReported = true;
    return true;
  }

  toState(input: { runId: string; seeds: string[]; updatedAt: string }): CrawlState {
    return {
      schemaVersion: SCHEMA_VERSION,
      runId: input.runId,
      seeds: input.seeds,
      visited: [...this.visited],
      navigations: this.navigations,
      pending: [...this.pending],
      skipCounts: { ...this.counts },
      updatedAt: input.updatedAt,
    };
  }
}
