import { afterEach, describe, expect, it } from 'vitest';
import { readCaptures } from '@ui-atlas/artifacts';
import { Crawler, type CrawlResult } from '@ui-atlas/crawler';
import { testConfig } from '../support/harness.js';
import { startCrawlHarness, type CrawlHarness } from '../support/crawl-harness.js';

/** Every control on destructive.html logs itself when activated. */
const DESTRUCTIVE_LOG = () =>
  (window as unknown as { __uiAtlasDestructiveLog: string[] }).__uiAtlasDestructiveLog;

describe('crawl recipes', () => {
  const open: CrawlHarness[] = [];

  afterEach(async () => {
    while (open.length > 0) await open.pop()?.dispose();
  });

  async function harness(): Promise<CrawlHarness> {
    const created = await startCrawlHarness({ probe: true });
    open.push(created);
    return created;
  }

  async function crawl(
    test: CrawlHarness,
    seeds: string[],
    recipes: unknown[],
    crawlOverrides: Record<string, unknown> = {},
  ): Promise<CrawlResult> {
    const config = testConfig({
      crawl: { seeds, recipes, perPageDelayMs: 0, ...crawlOverrides },
    });
    return new Crawler({
      page: test.page,
      writer: test.writer,
      runId: test.runId,
      config,
      recipes: test.recipeRunner(config),
    }).run();
  }

  it('captures only on the routes its match globs cover', async () => {
    const test = await harness();
    const result = await crawl(
      test,
      [test.url('/')],
      [
        {
          name: 'shoot-states',
          match: '/states.html',
          steps: [{ capture: { kind: 'viewport', label: 'states-page' } }],
        },
      ],
      { budgets: { maxDepth: 1 } },
    );

    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0]).toMatchObject({
      recipe: 'shoot-states',
      route: '/states.html',
      status: 'ran',
    });

    const { records } = await readCaptures(test.writer.paths.capturesJsonl);
    expect(records).toHaveLength(1);
    expect(records[0]?.status).toBe('captured');
    expect(records[0]?.finalUrl).toBe(test.url('/states.html'));
    expect(records[0]?.image?.width).toBeGreaterThan(0);
  });

  it('clicks a control, but only because a recipe named it', async () => {
    const test = await harness();
    let disclosureOpen: boolean | undefined;

    const result = await crawl(
      test,
      [test.url('/states.html')],
      [
        {
          name: 'open-disclosure',
          match: '/states.html',
          steps: [
            { click: { css: '[data-testid="disclosure"] summary' } },
            { capture: { kind: 'viewport', label: 'disclosure-open' } },
          ],
        },
      ],
      { budgets: { maxDepth: 0 } },
    );

    expect(result.recipes[0]?.status).toBe('ran');
    expect(result.clicks).toBe(1);

    disclosureOpen = await test.page.evaluate(
      () => document.querySelector<HTMLDetailsElement>('[data-testid="disclosure"]')?.open ?? false,
    );
    expect(disclosureOpen).toBe(true);

    const { records } = await readCaptures(test.writer.paths.capturesJsonl);
    expect(records).toHaveLength(1);
    expect(records[0]?.status).toBe('captured');
  });

  it('leaves destructive controls alone when no recipe matches their route', async () => {
    const test = await harness();
    let destructiveLog: string[] | undefined;

    // A recipe that clicks — on a different route. The whole site is crawled.
    const result = await crawl(test, [test.url('/')], [
      {
        name: 'open-disclosure',
        match: '/states.html',
        steps: [
          { click: { css: '[data-testid="disclosure"] summary' } },
          { capture: { kind: 'viewport' } },
        ],
      },
    ]);

    expect(result.visited.some((url) => url.endsWith('/destructive.html'))).toBe(true);
    expect(result.clicks).toBe(1);

    await test.page.goto(test.url('/destructive.html'));
    destructiveLog = await test.page.evaluate(DESTRUCTIVE_LOG);
    expect(destructiveLog).toEqual([]);

    // The stronger claim: nothing was submitted anywhere during the crawl.
    expect(test.requests.filter((request) => request.method !== 'GET')).toEqual([]);
    expect(test.requests.some((request) => request.url.includes('should-never-be-called'))).toBe(
      false,
    );
  });

  it('runs a capture-only recipe on every route without touching anything', async () => {
    const test = await harness();
    let destructiveLog: string[] | undefined;

    const result = await crawl(
      test,
      [test.url('/destructive.html')],
      [{ name: 'shoot-everything', match: '/**', steps: [{ capture: { kind: 'viewport' } }] }],
      { budgets: { maxDepth: 0 } },
    );

    expect(result.recipes).toHaveLength(1);
    expect(result.clicks).toBe(0);

    destructiveLog = await test.page.evaluate(DESTRUCTIVE_LOG);
    expect(destructiveLog).toEqual([]);

    const { records } = await readCaptures(test.writer.paths.capturesJsonl);
    expect(records).toHaveLength(1);
    expect(records[0]?.finalUrl).toBe(test.url('/destructive.html'));
  });

  it('drives a hover-only menu and waits for what it revealed', async () => {
    const test = await harness();
    const result = await crawl(
      test,
      [test.url('/states.html')],
      [
        {
          name: 'open-menu',
          match: '/states.html',
          steps: [
            { hover: { testId: 'menu-trigger' } },
            { waitFor: { role: 'navigation' } },
            { capture: { kind: 'viewport', label: 'menu-open' } },
          ],
        },
      ],
      { budgets: { maxDepth: 0 } },
    );

    expect(result.recipes[0]).toMatchObject({ status: 'ran' });
    expect(result.clicks).toBe(0);
    const { records } = await readCaptures(test.writer.paths.capturesJsonl);
    expect(records[0]?.status).toBe('captured');
  });

  it('captures a state set for a selected element', async () => {
    const test = await harness();
    const result = await crawl(
      test,
      [test.url('/states.html')],
      [
        {
          name: 'button-states',
          match: '/states.html',
          steps: [
            { select: { testId: 'focus-demo' } },
            { captureStates: ['default', 'hover', 'focus'] },
          ],
        },
      ],
      { budgets: { maxDepth: 0 } },
    );

    expect(result.recipes[0]?.status).toBe('ran');
    expect(result.recipes[0]?.captureIds).toHaveLength(3);

    const { records } = await readCaptures(test.writer.paths.capturesJsonl);
    expect(records).toHaveLength(3);
    expect(records.map((record) => record.state.name).sort()).toEqual(['default', 'focus', 'hover']);
    expect(records.every((record) => record.status === 'captured')).toBe(true);
    expect(records.every((record) => record.element !== undefined)).toBe(true);
    // One set, so the report can show them side by side.
    expect(new Set(records.map((record) => record.set?.id)).size).toBe(1);
  });

  it('records a failing recipe without stopping the crawl', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/')], [
      {
        name: 'missing-target',
        match: '/**',
        steps: [{ click: { testId: 'no-such-control' } }, { capture: {} }],
        // The recipe budget is what ends each attempt; keep it short, because
        // this recipe fails on all thirteen pages by design.
        timeoutMs: 500,
      },
    ]);

    // Every page still got visited and recorded.
    expect(result.visited).toHaveLength(13);
    expect(result.pages).toHaveLength(13);
    expect(result.recipes.every((outcome) => outcome.status === 'failed')).toBe(true);
    expect(result.clicks).toBe(0);
    // Detail on the page record it happened on...
    expect(
      result.pages[0]?.warnings.some((warning) => warning.includes('missing-target')),
    ).toBe(true);
    // ...and raised to the run once, by name, rather than thirteen times.
    const runLevel = result.warnings.filter((warning) => warning.includes('missing-target'));
    expect(runLevel).toHaveLength(1);

    // Nothing was captured, because the step before the capture failed.
    const { records } = await readCaptures(test.writer.paths.capturesJsonl);
    expect(records).toHaveLength(0);
  });

  it('does not let a recipe change which links the page contributed', async () => {
    const test = await harness();
    // Only links.html is in scope, so every link on it is out of bounds. The
    // recipe then clicks one anyway — which a recipe is allowed to do.
    const result = await crawl(
      test,
      [test.url('/links.html')],
      [
        {
          name: 'navigate-away',
          match: '/links.html',
          steps: [{ click: { css: 'a[href="/states.html"]' } }, { capture: {} }],
        },
      ],
      { include: ['/links.html'] },
    );

    expect(result.clicks).toBe(1);
    expect(
      result.recipes[0]?.warnings.some((warning) => warning.includes('navigated from')),
    ).toBe(true);

    // The browser really did end up on states.html...
    expect(test.requests.some((request) => request.url === test.url('/states.html'))).toBe(true);
    // ...and the crawl still visited and recorded exactly one page.
    expect(result.visited).toEqual([test.url('/links.html')]);
    expect(result.pages).toHaveLength(1);
    expect(result.pendingAtStop).toBe(0);
  });
});
