import { afterEach, describe, expect, it } from 'vitest';
import { Crawler, type CrawlResult } from '@ui-atlas/crawler';
import { testConfig } from '../support/harness.js';
import { startCrawlHarness, type CrawlHarness, type CrawlRequestLog } from '../support/crawl-harness.js';

function navigations(requests: CrawlRequestLog[], contains: string): CrawlRequestLog[] {
  return requests.filter(
    (request) =>
      request.resourceType === 'document' && request.mainFrame && request.url.includes(contains),
  );
}

describe('retry and backoff', () => {
  const open: CrawlHarness[] = [];

  afterEach(async () => {
    while (open.length > 0) await open.pop()?.dispose();
  });

  async function harness(): Promise<CrawlHarness> {
    const created = await startCrawlHarness();
    open.push(created);
    return created;
  }

  async function crawl(
    test: CrawlHarness,
    seeds: string[],
    crawlOverrides: Record<string, unknown> = {},
  ): Promise<CrawlResult> {
    const config = testConfig({
      crawl: {
        seeds,
        perPageDelayMs: 0,
        budgets: { maxDepth: 0 },
        // Short, jitter-free backoff keeps the suite quick and predictable.
        retry: { baseDelayMs: 20, jitter: 0 },
        ...crawlOverrides,
      },
    });
    return new Crawler({
      page: test.page,
      writer: test.writer,
      runId: test.runId,
      config,
    }).run();
  }

  it('recovers a page that fails twice and then works', async () => {
    const test = await harness();
    const url = test.url('/__flaky?key=recovers&fail=2&status=503');
    const result = await crawl(test, [url]);

    expect(result.pages).toHaveLength(1);
    const page = result.pages[0];
    expect(page?.httpStatus).toBe(200);
    expect(page?.error).toBeUndefined();
    // Two failures then a success: the record says it took three goes.
    expect(page?.attempts).toBe(3);
    expect(result.retries).toBe(2);
    expect(test.server.attempts('recovers')).toBe(3);
    expect(navigations(test.requests, '__flaky')).toHaveLength(3);
  });

  it('gives up after maxAttempts and records the failure honestly', async () => {
    const test = await harness();
    const url = test.url('/__flaky?key=never&fail=99&status=500');
    const result = await crawl(test, [url], { retry: { maxAttempts: 2, baseDelayMs: 10, jitter: 0 } });

    expect(test.server.attempts('never')).toBe(2);
    const page = result.pages[0];
    expect(page?.httpStatus).toBe(500);
    expect(page?.error?.message).toContain('500');
    expect(page?.attempts).toBe(2);
    expect(result.retries).toBe(1);
  });

  it('does not retry a status that will not improve', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/__status?key=gone&code=404')]);

    // One request, not three: a 404 is an answer, not a hiccup.
    expect(test.server.attempts('gone')).toBe(1);
    expect(result.retries).toBe(0);
    const page = result.pages[0];
    expect(page?.httpStatus).toBe(404);
    expect(page?.error).toBeDefined();
    expect(page?.attempts).toBeUndefined();
  });

  it('never retries at all when maxAttempts is 1', async () => {
    const test = await harness();
    await crawl(test, [test.url('/__flaky?key=once&fail=99&status=503')], {
      retry: { maxAttempts: 1 },
    });
    expect(test.server.attempts('once')).toBe(1);
  });

  it('holds the whole origin back when the host asks it to', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/__status?key=busy&code=429&retryAfter=1')], {
      retry: { maxAttempts: 2, maxRetryAfterMs: 300, baseDelayMs: 10, jitter: 0 },
    });

    // A 429 is not just this page's problem: the origin is reported as having
    // asked for a slower rate.
    expect(result.backedOffOrigins).toEqual([new URL(test.url('/')).origin]);
    expect(
      result.warnings.some((warning) => warning.includes('asked for a slower rate')),
    ).toBe(true);

    // Retry-After was honoured, clamped to maxRetryAfterMs.
    const gaps = navigations(test.requests, '__status').map((request) => request.at);
    expect(gaps).toHaveLength(2);
    expect((gaps[1] as number) - (gaps[0] as number)).toBeGreaterThanOrEqual(250);
    expect(result.pages[0]?.httpStatus).toBe(429);
  });

  it('reports the origin backoff once, not once per page', async () => {
    const test = await harness();
    const result = await crawl(
      test,
      [
        test.url('/__status?key=a&code=429'),
        test.url('/__status?key=b&code=429'),
        test.url('/__status?key=c&code=429'),
      ],
      { retry: { maxAttempts: 1, baseDelayMs: 10, jitter: 0 } },
    );

    expect(result.pages).toHaveLength(3);
    expect(result.backedOffOrigins).toHaveLength(1);
    const notices = result.warnings.filter((warning) =>
      warning.includes('asked for a slower rate'),
    );
    expect(notices).toHaveLength(1);
    // The detail is still on each page record that saw it.
    expect(
      result.pages.every((page) =>
        page.warnings.some((warning) => warning.includes('asked for a slower rate')),
      ),
    ).toBe(true);
  });

  it('spends attempts, never pages, so retries do not eat the budget', async () => {
    const test = await harness();
    const result = await crawl(
      test,
      [
        test.url('/__flaky?key=b1&fail=1&status=503'),
        test.url('/__flaky?key=b2&fail=1&status=503'),
      ],
      { budgets: { maxPages: 2, maxDepth: 0 } },
    );

    // Four navigations across two pages, and both pages still fit the budget.
    expect(result.pages).toHaveLength(2);
    expect(result.visited).toHaveLength(2);
    expect(result.retries).toBe(2);
    expect(navigations(test.requests, '__flaky')).toHaveLength(4);
    expect(result.pages.every((page) => page.httpStatus === 200)).toBe(true);
  });

  it('stops retrying when the run budget runs out', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/__flaky?key=slow&fail=99&status=503')], {
      // A generous retry policy inside a run budget too small to use it.
      retry: { maxAttempts: 8, baseDelayMs: 400, jitter: 0 },
      budgets: { maxDepth: 0, maxRunMinutes: 0.02 },
    });

    expect(test.server.attempts('slow')).toBeLessThan(8);
    expect(
      result.pages[0]?.warnings.some((warning) => warning.includes('run budget ran out')),
    ).toBe(true);
  });
});
