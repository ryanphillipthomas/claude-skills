import type { Page } from 'playwright';
import { newPageId, routeKeyFromUrl, type RunWriter } from '@ui-atlas/artifacts';
import type { UiAtlasConfig } from '@ui-atlas/config';
import {
  SCHEMA_VERSION,
  toStructuredError,
  UiAtlasError,
  type CrawlSkipReason,
  type CrawlState,
  type FrontierItem,
  type PageRecord,
} from '@ui-atlas/protocol';
import { Deadline, settlePage, sleep, TIMED_OUT, withTimeout } from '@ui-atlas/settle';
import { Frontier } from './frontier.js';
import { collectLinks, type DiscoveredLink } from './page-scripts.js';
import { CrawlPolicy } from './policy.js';

export type CrawlStopReason = 'frontier-empty' | 'max-pages' | 'run-timeout';

export interface CrawlSkipSample {
  reason: CrawlSkipReason;
  detail: string;
  url: string;
  discoveredFrom: string;
}

export interface CrawlResult {
  pages: PageRecord[];
  visited: string[];
  /** How the crawl ended. `frontier-empty` means it finished naturally. */
  stopped: CrawlStopReason;
  skipCounts: Record<CrawlSkipReason, number>;
  /** A bounded sample of individual skips, for the run summary. */
  skipSamples: CrawlSkipSample[];
  /** Left in the queue when a budget stopped the crawl. */
  pendingAtStop: number;
  warnings: string[];
  state: CrawlState;
}

export interface CrawlerOptions {
  page: Page;
  writer: RunWriter;
  runId: string;
  config: UiAtlasConfig;
  /** Overrides `config.crawl.seeds`; the CLI passes a URL argument this way. */
  seeds?: string[] | undefined;
  /** Frontier from an interrupted run in the same run directory. */
  resume?: CrawlState | undefined;
  onProgress?: ((message: string) => void) | undefined;
  /**
   * Called after a page has settled, while it is still the current document.
   * The extension point recipes and per-page captures will use. It is handed
   * the live page deliberately; the crawler itself never interacts with it.
   */
  onPage?: ((page: Page, record: PageRecord) => Promise<void>) | undefined;
}

/** Keeps the run summary readable when a crawl turns away thousands of links. */
const MAX_SKIP_SAMPLES = 50;

/** Reading a title should be instant; this only bounds a pathological page. */
const TITLE_BUDGET_MS = 2_000;

/**
 * A policy-driven queue that visits pages and reads their links. It is not a
 * click bot: the only thing it does to a page is navigate to it, wait for it to
 * settle, and read `<a href>` out of the DOM.
 */
export class Crawler {
  private readonly policy: CrawlPolicy;
  private readonly frontier: Frontier;
  private readonly seeds: string[];
  private readonly warnings: string[] = [];
  private readonly skipSamples: CrawlSkipSample[] = [];

  constructor(private readonly options: CrawlerOptions) {
    const crawl = options.config.crawl;
    const seeds = options.seeds ?? crawl.seeds;
    if (seeds.length === 0) {
      throw new UiAtlasError(
        'config.invalid',
        'a crawl needs at least one seed URL (crawl.seeds, or a URL argument)',
      );
    }

    this.seeds = seeds;
    this.policy = new CrawlPolicy(crawl, seeds);
    this.frontier = new Frontier({
      policy: this.policy,
      budgets: crawl.budgets,
      resume: options.resume,
    });
  }

  /** Origins this crawl will navigate to. Everything else is `cross-origin`. */
  get origins(): ReadonlySet<string> {
    return this.policy.origins;
  }

  async run(): Promise<CrawlResult> {
    const { config, writer } = this.options;
    const crawl = config.crawl;
    const runDeadline = new Deadline(Math.round(crawl.budgets.maxRunMinutes * 60_000));

    // Seeds are depth 0 and are not "discovered from" anywhere. A seed that is
    // itself out of scope is a configuration error worth surfacing, not a
    // silent no-op.
    if (this.options.resume === undefined) {
      for (const seed of this.seeds) {
        const admission = this.frontier.add({ raw: seed }, { depth: 0 });
        if (!admission.admitted && admission.reason !== 'duplicate') {
          this.warnings.push(
            `seed ${seed} was not queued: ${admission.reason} (${admission.detail})`,
          );
        }
      }
    }

    const pages: PageRecord[] = [];
    let timedOut = false;

    for (;;) {
      // An empty queue means the crawl finished, whatever the budgets say. It
      // is checked first so a crawl that ran out of work is never reported as
      // having been stopped by a limit it merely happened to reach.
      if (this.frontier.pendingCount === 0) break;
      if (runDeadline.expired()) {
        timedOut = true;
        break;
      }
      if (this.frontier.pageBudgetSpent) break;

      const item = this.frontier.next();
      if (item === undefined) break;

      this.options.onProgress?.(
        `${String(this.frontier.visitedCount)}/${String(crawl.budgets.maxPages)} ${item.url}`,
      );

      const record = await this.visit(item, runDeadline);
      pages.push(await writer.addPage(record));

      if (this.frontier.claimQueueFullWarning()) {
        this.warnings.push(
          `the pending queue reached maxQueued (${String(crawl.budgets.maxQueued)}); ` +
            'later links were dropped',
        );
      }

      // Persisted after every page, so an interrupted crawl resumes from the
      // last completed page rather than from the start.
      await writer.writeCrawlState(this.snapshotState());

      if (crawl.perPageDelayMs > 0 && !this.frontier.pageBudgetSpent) {
        await sleep(Math.min(crawl.perPageDelayMs, runDeadline.remainingMs()));
      }
    }

    // Anything left in the queue means a budget cut the crawl short; an empty
    // one means it covered everything reachable.
    const stopped: CrawlStopReason = timedOut
      ? 'run-timeout'
      : this.frontier.pendingCount > 0
        ? 'max-pages'
        : 'frontier-empty';

    const state = this.snapshotState();
    await writer.writeCrawlState(state);

    if (stopped === 'run-timeout') {
      this.warnings.push(
        `crawl hit its ${String(crawl.budgets.maxRunMinutes)}-minute run budget after ` +
          `${String(this.frontier.visitedCount)} pages, with ` +
          `${String(this.frontier.pendingCount)} URLs still queued`,
      );
    }
    if (stopped === 'max-pages') {
      this.warnings.push(
        `crawl stopped at the ${String(crawl.budgets.maxPages)}-page budget with ` +
          `${String(this.frontier.pendingCount)} URLs still queued`,
      );
    }
    for (const warning of this.warnings) writer.addWarning(warning);

    return {
      pages,
      visited: this.frontier.visitedUrls(),
      stopped,
      skipCounts: { ...this.frontier.skipCounts },
      skipSamples: this.skipSamples,
      pendingAtStop: this.frontier.pendingCount,
      warnings: this.warnings,
      state,
    };
  }

  private snapshotState(): CrawlState {
    return this.frontier.toState({
      runId: this.options.runId,
      seeds: this.seeds,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Navigate to one page, let it settle, read its links. Bounded by the smaller
   * of the per-page budget and whatever is left of the whole run, so a slow page
   * near the end of a run cannot overrun the total deadline.
   */
  private async visit(item: FrontierItem, runDeadline: Deadline): Promise<PageRecord> {
    const { config, page, runId } = this.options;
    const crawl = config.crawl;
    const visitedAt = new Date().toISOString();
    const warnings: string[] = [];
    const pageDeadline = new Deadline(
      Math.max(1, runDeadline.budgetFor(crawl.budgets.perPageTimeoutMs)),
    );

    let httpStatus: number | undefined;
    try {
      const response = await page.goto(item.url, {
        waitUntil: config.settle.loadState,
        timeout: pageDeadline.remainingMs(),
      });
      httpStatus = response?.status();
    } catch (error) {
      return {
        schemaVersion: SCHEMA_VERSION,
        id: newPageId(),
        runId,
        requestedUrl: item.url,
        finalUrl: page.url(),
        routeKey: routeKeyFromUrl(item.url),
        visitedAt,
        warnings,
        error: toStructuredError(error, 'capture.timeout'),
      };
    }

    const readiness = await settlePage(page, {
      config: config.settle,
      totalTimeoutMs: Math.max(1, pageDeadline.remainingMs()),
    });
    warnings.push(...readiness.warnings);

    const finalUrl = page.url();
    // `page.title()` takes no timeout option, so it is raced against what is
    // left of the page budget: a page that will not report a title is still a
    // page worth recording, and must not be able to overrun the run deadline.
    const titled = await withTimeout(
      page.title().catch(() => undefined),
      pageDeadline.budgetFor(TITLE_BUDGET_MS),
    );
    const title = titled === TIMED_OUT ? undefined : titled;

    const record: PageRecord = {
      schemaVersion: SCHEMA_VERSION,
      id: newPageId(),
      runId,
      requestedUrl: item.url,
      finalUrl,
      routeKey: routeKeyFromUrl(finalUrl),
      visitedAt,
      readiness,
      warnings,
      ...(title === undefined ? {} : { title }),
      ...(httpStatus === undefined ? {} : { httpStatus }),
    };

    // A redirect can land somewhere the policy would never have queued. Record
    // the page honestly, but do not harvest links from it: that would let one
    // off-site redirect widen the crawl to a whole other origin.
    const landedOrigin = safeOrigin(finalUrl);
    if (landedOrigin === undefined || !this.policy.origins.has(landedOrigin)) {
      warnings.push(
        `${item.url} redirected to ${finalUrl}, which is outside the crawl scope; ` +
          'its links were not followed',
      );
      await this.runPageHook(record);
      return record;
    }

    // A redirect means this run has now fetched the destination too. Mark it
    // seen — without charging it a navigation — so a later link to it is a
    // duplicate rather than a second fetch of the same page.
    const canonicalFinal = this.policy.canonicalize(finalUrl);
    if (canonicalFinal.ok && canonicalFinal.url !== item.url) {
      this.frontier.markVisited(canonicalFinal.url);
    }

    await this.discover(item, finalUrl, warnings, pageDeadline);
    await this.runPageHook(record);
    return record;
  }

  private async runPageHook(record: PageRecord): Promise<void> {
    const hook = this.options.onPage;
    if (hook === undefined) return;
    await hook(this.options.page, record);
  }

  private async discover(
    item: FrontierItem,
    base: string,
    warnings: string[],
    pageDeadline: Deadline,
  ): Promise<void> {
    if (pageDeadline.expired()) {
      warnings.push('link discovery was skipped: the per-page budget was already spent');
      return;
    }

    // `page.evaluate` takes no timeout option either. A page whose main thread
    // is wedged must not hold the whole crawl open.
    let failure: unknown;
    const evaluated = await withTimeout(
      this.options.page.evaluate(collectLinks).catch((error: unknown) => {
        failure = error;
        return undefined;
      }),
      pageDeadline.remainingMs(),
    );
    if (evaluated === TIMED_OUT) {
      warnings.push('link discovery hit the per-page budget; this page’s links were not followed');
      return;
    }
    if (evaluated === undefined) {
      warnings.push(`link discovery failed: ${describe(failure)}`);
      return;
    }
    const links: DiscoveredLink[] = evaluated;

    const childDepth = item.depth + 1;
    for (const link of links) {
      const admission = this.frontier.add(
        { raw: link.href, rel: link.rel },
        { base, depth: childDepth },
      );
      if (admission.admitted) continue;
      if (this.skipSamples.length >= MAX_SKIP_SAMPLES) continue;
      // `duplicate` is the overwhelmingly common outcome on any real site and
      // says nothing interesting; sampling it would crowd out the rest.
      if (admission.reason === 'duplicate') continue;
      this.skipSamples.push({
        reason: admission.reason,
        detail: admission.detail,
        url: admission.url ?? link.href,
        discoveredFrom: base,
      });
    }
  }
}

function safeOrigin(raw: string): string | undefined {
  try {
    return new URL(raw).origin;
  } catch {
    return undefined;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
