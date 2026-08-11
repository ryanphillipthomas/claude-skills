import { afterEach, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { readPages } from '@ui-atlas/artifacts';
import { Crawler, type CrawlResult } from '@ui-atlas/crawler';
import { testConfig } from '../support/harness.js';
import { startCrawlHarness, type CrawlHarness, type CrawlRequestLog } from '../support/crawl-harness.js';

/**
 * Top-level navigations only. The fixture pages fetch a stylesheet, and
 * `frames.html` loads an iframe whose document would otherwise be counted as a
 * page visit.
 */
function documentRequests(requests: CrawlRequestLog[]): CrawlRequestLog[] {
  return requests.filter((request) => request.resourceType === 'document' && request.mainFrame);
}

describe('worker concurrency', () => {
  const open: CrawlHarness[] = [];

  afterEach(async () => {
    while (open.length > 0) await open.pop()?.dispose();
  });

  async function harness(): Promise<CrawlHarness> {
    const created = await startCrawlHarness();
    open.push(created);
    return created;
  }

  interface CrawlOutcome {
    result: CrawlResult;
    /** Worker index that handled each visited URL. */
    handledBy: Map<string, number>;
  }

  async function crawl(
    test: CrawlHarness,
    seeds: string[],
    crawlOverrides: Record<string, unknown> = {},
  ): Promise<CrawlOutcome> {
    const config = testConfig({
      crawl: { seeds, perPageDelayMs: 0, ...crawlOverrides },
    });
    const factory = test.workerFactory();
    const handledBy = new Map<string, number>();

    const result = await new Crawler({
      page: test.page,
      writer: test.writer,
      runId: test.runId,
      config,
      createWorker: factory.create,
      onPage: async (page: Page, record) => {
        handledBy.set(record.finalUrl, factory.ownerOf(page));
      },
    }).run();

    return { result, handledBy };
  }

  it('covers exactly the same pages as one worker, with no duplicate records', async () => {
    const test = await harness();
    const { result, handledBy } = await crawl(test, [test.url('/')], { concurrency: 4 });

    expect(result.stopped).toBe('frontier-empty');
    expect(result.visited).toHaveLength(13);

    const { records } = await readPages(test.writer.paths.pagesJsonl);
    expect(records).toHaveLength(13);
    expect(new Set(records.map((record) => record.requestedUrl)).size).toBe(13);
    expect(records.every((record) => record.error === undefined)).toBe(true);

    // Every page was fetched exactly once, across every worker.
    const fetched = documentRequests(test.requests).map((request) => request.url);
    expect(new Set(fetched).size).toBe(fetched.length);

    // More than one worker actually did work: this is a pool, not a loop with
    // extra contexts sitting idle.
    expect(new Set(handledBy.values()).size).toBeGreaterThan(1);
  });

  it('keeps the page budget when several workers are in flight at once', async () => {
    const test = await harness();
    const { result } = await crawl(test, [test.url('/')], {
      concurrency: 4,
      budgets: { maxPages: 5 },
    });

    // The budget counts pages handed out, not pages finished, so four workers
    // cannot collectively overshoot it.
    expect(result.visited.length).toBeLessThanOrEqual(5);
    expect(documentRequests(test.requests)).toHaveLength(result.visited.length);
    expect(result.stopped).toBe('max-pages');

    const { records } = await readPages(test.writer.paths.pagesJsonl);
    expect(records).toHaveLength(result.visited.length);
  });

  it('enforces the politeness delay across workers, not per worker', async () => {
    const test = await harness();
    const delayMs = 120;
    const { result } = await crawl(test, [test.url('/')], {
      concurrency: 4,
      perPageDelayMs: delayMs,
      budgets: { maxPages: 6 },
    });

    expect(result.visited).toHaveLength(6);

    // Four workers with a per-worker delay would issue bursts of four. A shared
    // per-origin throttle staggers them, so consecutive navigations to this one
    // origin stay a delay apart.
    const times = documentRequests(test.requests)
      .map((request) => request.at)
      .sort((a, b) => a - b);
    expect(times).toHaveLength(6);

    const gaps = times.slice(1).map((time, index) => time - (times[index] as number));
    // Timers fire late, never early; allow slop below the nominal delay only.
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(delayMs - 40);
    // And the whole run really did take about five intervals.
    expect((times.at(-1) as number) - (times[0] as number)).toBeGreaterThanOrEqual(delayMs * 4);
  });

  it('resumes a concurrent crawl without losing or repeating a page', async () => {
    const test = await harness();
    // Stop part-way with several workers mid-flight.
    const first = await crawl(test, [test.url('/')], {
      concurrency: 3,
      budgets: { maxPages: 5 },
    });
    expect(first.result.stopped).toBe('max-pages');

    const state = await test.writer.readCrawlState();
    expect(state).toBeDefined();
    // Nothing is left half-claimed: every page handed out was also recorded.
    expect(state?.visited).toHaveLength(first.result.visited.length);
    expect(state?.navigations).toBe(first.result.visited.length);

    const config = testConfig({
      crawl: { seeds: [test.url('/')], perPageDelayMs: 0, concurrency: 3 },
    });
    const factory = test.workerFactory();
    const resumed = await new Crawler({
      page: test.page,
      writer: test.writer,
      runId: test.runId,
      config,
      createWorker: factory.create,
      ...(state === undefined ? {} : { resume: state }),
    }).run();

    expect(resumed.stopped).toBe('frontier-empty');
    expect(resumed.visited).toHaveLength(13);

    const { records } = await readPages(test.writer.paths.pagesJsonl);
    expect(records).toHaveLength(13);
    expect(new Set(records.map((record) => record.requestedUrl)).size).toBe(13);
  });

  it('falls back to one worker, loudly, when it cannot build any more', async () => {
    const test = await harness();
    const config = testConfig({
      crawl: { seeds: [test.url('/')], perPageDelayMs: 0, concurrency: 4 },
    });

    // No createWorker: a crawl must say so rather than quietly running serially.
    const result = await new Crawler({
      page: test.page,
      writer: test.writer,
      runId: test.runId,
      config,
    }).run();

    expect(result.visited).toHaveLength(13);
    expect(
      result.warnings.some((warning) => warning.includes('cannot build extra workers')),
    ).toBe(true);
  });
});
