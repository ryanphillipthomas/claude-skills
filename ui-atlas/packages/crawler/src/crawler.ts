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
  type InteractionCandidate,
  type PageRecord,
} from '@ui-atlas/protocol';
import { Deadline, settlePage, sleep, TIMED_OUT, withTimeout } from '@ui-atlas/settle';
import { Frontier } from './frontier.js';
import { collectLinks, type DiscoveredLink } from './page-scripts.js';
import type { InteractionInventory } from './inventory.js';
import { CrawlPolicy } from './policy.js';
import type { RecipeOutcome, RecipeRunner } from './recipes.js';
import { decideRetry, type AttemptOutcome } from './retry.js';
import { OriginThrottle } from './throttle.js';

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
  /** One entry per recipe run, in visit order. Empty when no recipes matched. */
  recipes: RecipeOutcome[];
  /** Interactive controls found, classified by what they would likely do. */
  interactions: InteractionCandidate[];
  /** Controls clicked across the whole crawl. Zero unless a recipe said to. */
  clicks: number;
  /** Extra attempts spent on pages that failed the first time. */
  retries: number;
  /** Origins that asked for a slower rate with a 429 or 503. */
  backedOffOrigins: string[];
  warnings: string[];
  state: CrawlState;
}

/**
 * One worker's resources. Each owns its own page — and, when the CLI builds
 * them, its own browser context — because the brief is explicit that scale
 * comes from isolated workers rather than many tabs sharing one mutable
 * session.
 */
export interface CrawlWorker {
  page: Page;
  /** Bound to this worker's page, so recipes capture the page they ran on. */
  recipes?: RecipeRunner | undefined;
  close?: (() => Promise<void>) | undefined;
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
   * Runs matching recipes once a page has settled. This is the *only* path by
   * which anything on a crawled page is interacted with; the crawler itself
   * navigates and reads, and nothing else.
   */
  recipes?: RecipeRunner | undefined;
  /**
   * Builds worker `n` (1-based; worker 0 is `page`/`recipes`). Without it a
   * crawl stays single-worker whatever `crawl.concurrency` says, and warns.
   */
  createWorker?: ((index: number) => Promise<CrawlWorker>) | undefined;
  /**
   * Inventories each page's interactive controls and says what each is likely
   * to do. Read-only: it activates nothing, ever. Shared across workers: it
   * takes the page as an argument rather than holding one.
   */
  inventory?: InteractionInventory | undefined;
  /**
   * Called after a page has settled and its recipes have run, while it is still
   * the current document. Used by tests to inspect the live page.
   */
  onPage?: ((page: Page, record: PageRecord) => Promise<void>) | undefined;
}

/** Keeps the run summary readable when a crawl turns away thousands of links. */
const MAX_SKIP_SAMPLES = 50;

/** Reading a title should be instant; this only bounds a pathological page. */
const TITLE_BUDGET_MS = 2_000;

/**
 * How long an idle worker waits before looking for work again. Only reached
 * when the queue is momentarily empty but another worker is still on a page,
 * so it costs nothing in a single-worker crawl.
 */
const IDLE_POLL_MS = 25;

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
  private readonly recipeOutcomes: RecipeOutcome[] = [];
  private readonly failedRecipes = new Set<string>();
  private readonly interactions: InteractionCandidate[] = [];
  private retries = 0;
  /** Origins already reported as having asked for a slower rate. */
  private readonly backedOffOrigins = new Set<string>();

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

  /**
   * Worker 0 is the caller's page. The rest are built on demand, and a crawl
   * that asked for concurrency without supplying a way to build them says so
   * rather than quietly running one worker.
   */
  private async startWorkers(): Promise<CrawlWorker[]> {
    const wanted = Math.max(1, this.options.config.crawl.concurrency);
    const first: CrawlWorker = {
      page: this.options.page,
      ...(this.options.recipes === undefined ? {} : { recipes: this.options.recipes }),
    };
    const workers: CrawlWorker[] = [first];
    if (wanted === 1) return workers;

    const create = this.options.createWorker;
    if (create === undefined) {
      this.warnings.push(
        `crawl.concurrency is ${String(wanted)} but this run cannot build extra workers; ` +
          'continuing with one',
      );
      return workers;
    }

    for (let index = 1; index < wanted; index += 1) {
      try {
        workers.push(await create(index));
      } catch (error) {
        this.warnings.push(
          `worker ${String(index)} could not be started (${describe(error)}); ` +
            `continuing with ${String(workers.length)}`,
        );
        break;
      }
    }
    return workers;
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
    const workers = await this.startWorkers();
    const throttle = new OriginThrottle(crawl.perPageDelayMs);
    let timedOut = false;

    const runOne = async (worker: CrawlWorker): Promise<void> => {
      for (;;) {
        if (runDeadline.expired()) {
          timedOut = true;
          return;
        }
        if (this.frontier.pageBudgetSpent) return;

        const item = this.frontier.next();
        if (item === undefined) {
          // The queue can be empty while another worker is still on a page that
          // is about to contribute links, so idling is not the same as being
          // finished. Only a drained frontier ends a worker.
          if (this.frontier.isDrained) return;
          await sleep(IDLE_POLL_MS);
          continue;
        }

        try {
          // Politeness is enforced per origin across every worker, not per
          // worker, so raising concurrency never raises the rate one host sees.
          await throttle.acquire(originOrKey(item.url), runDeadline.remainingMs());
          if (runDeadline.expired()) {
            timedOut = true;
            this.frontier.release(item.url);
            return;
          }

          this.options.onProgress?.(
            `${String(this.frontier.visitedCount)}/${String(crawl.budgets.maxPages)} ${item.url}`,
          );

          const record = await this.visit(worker, item, runDeadline, throttle);
          pages.push(await writer.addPage(record));
          // Committed only once the record is on disk: until then a snapshot
          // puts the page back in the queue rather than calling it visited.
          this.frontier.commit(item.url);
        } catch (error) {
          // A worker that dies must not take its page down with it.
          this.frontier.release(item.url);
          this.warnings.push(`worker failed on ${item.url}: ${describe(error)}`);
          return;
        }

        if (this.frontier.claimQueueFullWarning()) {
          this.warnings.push(
            `the pending queue reached maxQueued (${String(crawl.budgets.maxQueued)}); ` +
              'later links were dropped',
          );
        }

        // Persisted after every page, so an interrupted crawl resumes from the
        // last completed page rather than from the start.
        await writer.writeCrawlState(this.snapshotState());
      }
    };

    try {
      await Promise.all(workers.map((worker) => runOne(worker)));
    } finally {
      // Worker 0's page belongs to the caller; the rest are ours to close.
      for (const worker of workers.slice(1)) {
        await worker.close?.().catch(() => undefined);
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
      recipes: this.recipeOutcomes,
      interactions: this.interactions,
      clicks: this.recipeOutcomes.reduce((total, outcome) => total + outcome.clicks, 0),
      retries: this.retries,
      backedOffOrigins: [...this.backedOffOrigins],
      warnings: this.warnings,
      state,
    };
  }

  /**
   * Raise an origin's first backoff to the run. A throttled host usually
   * answers every worker the same way, so reporting each one would bury the
   * summary in identical lines.
   */
  private noteOriginBackoff(origin: string, notice: string): void {
    if (this.backedOffOrigins.has(origin)) return;
    this.backedOffOrigins.add(origin);
    this.warnings.push(notice);
  }

  private snapshotState(): CrawlState {
    return this.frontier.toState({
      runId: this.options.runId,
      seeds: this.seeds,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Visit one page, retrying the failures that are worth retrying.
   *
   * A retry costs an attempt, never a page: the budget counts pages, and a host
   * that made us try three times has not shown us three pages. Every wait is
   * clamped by what is left of the run, so retrying cannot push a crawl past its
   * own deadline.
   */
  private async visit(
    worker: CrawlWorker,
    item: FrontierItem,
    runDeadline: Deadline,
    throttle: OriginThrottle,
  ): Promise<PageRecord> {
    const retry = this.options.config.crawl.retry;
    const origin = originOrKey(item.url);
    const warnings: string[] = [];

    for (let attempt = 1; ; attempt += 1) {
      const { record, outcome } = await this.attemptVisit(worker, item, runDeadline, {
        attempt,
        warnings,
      });

      const decision = decideRetry(outcome, { attempt, config: retry });

      // A host asking us to slow down is answered for the whole origin, whether
      // or not this page has attempts left: giving up on one page is no reason
      // to keep hammering.
      if (decision.originPenaltyMs !== undefined && decision.originPenaltyMs > 0) {
        throttle.penalise(origin, decision.originPenaltyMs);
        const notice =
          `${origin} asked for a slower rate (${decision.reason}); ` +
          `holding it off for ${String(decision.originPenaltyMs)}ms`;
        warnings.push(notice);
        this.noteOriginBackoff(origin, notice);
      }

      if (!decision.retry) {
        if (attempt > 1) record.attempts = attempt;
        return record;
      }

      // The retry itself has to fit in the run, or there is no point starting it.
      const waitMs = Math.min(decision.delayMs, runDeadline.remainingMs());
      warnings.push(
        `attempt ${String(attempt)} of ${String(retry.maxAttempts)} failed: ` +
          `${decision.reason}; retrying in ${String(waitMs)}ms`,
      );
      if (runDeadline.remainingMs() <= waitMs) {
        warnings.push('the run budget ran out before the next attempt');
        record.attempts = attempt;
        return record;
      }
      this.retries += 1;
      if (waitMs > 0) await sleep(waitMs);
    }
  }

  /** One navigation, settle, discovery and recipe pass. No retrying here. */
  private async attemptVisit(
    worker: CrawlWorker,
    item: FrontierItem,
    runDeadline: Deadline,
    context: { attempt: number; warnings: string[] },
  ): Promise<{ record: PageRecord; outcome: AttemptOutcome }> {
    const { config, runId } = this.options;
    const { page } = worker;
    const crawl = config.crawl;
    const visitedAt = new Date().toISOString();
    const warnings = context.warnings;
    const pageDeadline = new Deadline(
      Math.max(1, runDeadline.budgetFor(crawl.budgets.perPageTimeoutMs)),
    );

    let httpStatus: number | undefined;
    let retryAfter: string | undefined;
    try {
      const response = await page.goto(item.url, {
        waitUntil: config.settle.loadState,
        timeout: pageDeadline.remainingMs(),
      });
      httpStatus = response?.status();
      retryAfter = (await response?.headerValue('retry-after')) ?? undefined;
    } catch (error) {
      const message = describe(error);
      return {
        record: {
          schemaVersion: SCHEMA_VERSION,
          id: newPageId(),
          runId,
          requestedUrl: item.url,
          finalUrl: page.url(),
          routeKey: routeKeyFromUrl(item.url),
          visitedAt,
          warnings,
          error: toStructuredError(error, 'capture.timeout'),
        },
        outcome: { kind: 'navigation-error', message },
      };
    }

    // An error status is a real page with real bytes, so it is still recorded
    // and still settled. What changes is whether it is worth asking again.
    const outcome: AttemptOutcome =
      httpStatus !== undefined && httpStatus >= 400
        ? { kind: 'http-error', status: httpStatus, retryAfter }
        : { kind: 'ok', status: httpStatus };

    if (outcome.kind === 'http-error') {
      return {
        record: {
          schemaVersion: SCHEMA_VERSION,
          id: newPageId(),
          runId,
          requestedUrl: item.url,
          finalUrl: page.url(),
          routeKey: routeKeyFromUrl(page.url()),
          visitedAt,
          httpStatus,
          warnings,
          error: {
            code: 'capture.failed',
            message: `HTTP ${String(httpStatus)}`,
            detail: { url: item.url, status: httpStatus },
          },
        },
        outcome,
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
      // No recipes either. A recipe is approval to interact with pages on the
      // origins the operator named, not with wherever a redirect landed.
      await this.runPageHook(worker, record);
      return { record, outcome };
    }

    // A redirect means this run has now fetched the destination too. Mark it
    // seen — without charging it a navigation — so a later link to it is a
    // duplicate rather than a second fetch of the same page.
    const canonicalFinal = this.policy.canonicalize(finalUrl);
    if (canonicalFinal.ok && canonicalFinal.url !== item.url) {
      this.frontier.markVisited(canonicalFinal.url);
    }

    await this.discover(worker, item, finalUrl, warnings, pageDeadline);
    // Before recipes: the inventory describes the page as served, not whatever
    // a recipe left it looking like.
    await this.runInventory(worker, record, warnings);
    await this.runRecipes(worker, record, warnings);
    await this.runPageHook(worker, record);
    return { record, outcome };
  }

  private async runInventory(
    worker: CrawlWorker,
    record: PageRecord,
    warnings: string[],
  ): Promise<void> {
    const inventory = this.options.inventory;
    if (inventory === undefined || !inventory.enabled) return;

    try {
      const found = await inventory.collect(worker.page, record);
      for (const candidate of found) {
        this.interactions.push(await this.options.writer.addInteraction(candidate));
      }
    } catch (error) {
      warnings.push(`interaction inventory failed: ${describe(error)}`);
    }
  }

  /**
   * Recipes run *after* link discovery, always. A recipe that clicks something
   * and navigates therefore cannot change which links this page contributed to
   * the frontier: the crawl's shape is decided by the markup as served, not by
   * wherever an interaction ended up.
   */
  private async runRecipes(
    worker: CrawlWorker,
    record: PageRecord,
    warnings: string[],
  ): Promise<void> {
    const runner = worker.recipes;
    if (runner === undefined || runner.isEmpty) return;

    const outcomes = await runner.runFor(worker.page, record.finalUrl);
    for (const outcome of outcomes) {
      this.recipeOutcomes.push(outcome);
      // Per-page detail belongs on the page record.
      warnings.push(...outcome.warnings);
      if (outcome.status !== 'failed') continue;

      const detail = `recipe "${outcome.recipe}" failed: ${outcome.error ?? 'no detail'}`;
      warnings.push(detail);
      // A broken recipe usually fails on every page it matches. Raise it to the
      // run once, by name, so the summary and run.json say so without repeating
      // the same line fifty times.
      if (!this.failedRecipes.has(outcome.recipe)) {
        this.failedRecipes.add(outcome.recipe);
        this.warnings.push(`${detail} (first seen on ${outcome.route})`);
      }
    }
  }

  private async runPageHook(worker: CrawlWorker, record: PageRecord): Promise<void> {
    const hook = this.options.onPage;
    if (hook === undefined) return;
    await hook(worker.page, record);
  }

  private async discover(
    worker: CrawlWorker,
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
      worker.page.evaluate(collectLinks).catch((error: unknown) => {
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

/** Throttle key. An unparseable URL gets its own bucket rather than sharing one. */
function originOrKey(raw: string): string {
  return safeOrigin(raw) ?? raw;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
