import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { DEFAULT_DENY_PATHS } from '@ui-atlas/config';
import {
  Crawler,
  CrawlPolicy,
  InteractionInventory,
  suggestRecipes,
  type CrawlResult,
} from '@ui-atlas/crawler';
import type { InteractionCandidate } from '@ui-atlas/protocol';
import { testConfig } from '../support/harness.js';
import { startCrawlHarness, type CrawlHarness } from '../support/crawl-harness.js';

const DESTRUCTIVE_LOG = () =>
  (window as unknown as { __uiAtlasDestructiveLog: string[] }).__uiAtlasDestructiveLog;

/** Accessible name or visible text, whichever the probe found. */
function labelOf(candidate: InteractionCandidate): string {
  return candidate.accessibleName ?? candidate.textExcerpt ?? candidate.tagName;
}

describe('interaction inventory', () => {
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
    crawlOverrides: Record<string, unknown> = {},
  ): Promise<CrawlResult> {
    const config = testConfig({
      crawl: {
        seeds,
        perPageDelayMs: 0,
        inventory: { enabled: true },
        ...crawlOverrides,
      },
    });
    const policy = new CrawlPolicy(config.crawl, seeds);
    return new Crawler({
      page: test.page,
      writer: test.writer,
      runId: test.runId,
      config,
      inventory: new InteractionInventory({
        config: config.crawl.inventory,
        runId: test.runId,
        denyPaths: DEFAULT_DENY_PATHS,
        origins: policy.origins,
      }),
    }).run();
  }

  it('puts every destructive control in the mutation bucket, and clicks none of them', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/destructive.html')], {
      budgets: { maxDepth: 0 },
    });

    const byLabel = new Map(result.interactions.map((one) => [labelOf(one), one]));

    // The four buttons the fixture exists to protect, plus its sign-out link.
    for (const label of ['Delete account', 'Place order', 'Send message', 'Submit form']) {
      const found = byLabel.get(label);
      expect(found, `${label} was not inventoried`).toBeDefined();
      expect(found?.classification, `${label} was classified wrongly`).toBe('mutation');
      expect(found?.reasons[0]).toBeTruthy();
    }
    const signOut = byLabel.get('Sign out');
    expect(signOut?.classification).toBe('mutation');
    expect(signOut?.reasons[0]).toContain('deny rule');

    // Nothing on this page is anything but a mutation, so nothing is suggested.
    expect(result.interactions.every((one) => one.classification === 'mutation')).toBe(true);

    // The whole point: inventorying it did not activate it.
    expect(await test.page.evaluate(DESTRUCTIVE_LOG)).toEqual([]);
    expect(test.requests.filter((request) => request.method !== 'GET')).toEqual([]);
  });

  it('recognises the safe controls on the states fixture', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/states.html')], { budgets: { maxDepth: 0 } });

    const byLabel = new Map(result.interactions.map((one) => [labelOf(one), one]));

    // A <summary> opens its own <details> and changes nothing else.
    expect(byLabel.get('Advanced options')?.classification).toBe('inert');
    // Tabs switch a panel.
    expect(byLabel.get('Overview')?.classification).toBe('inert');
    expect(byLabel.get('Details')?.classification).toBe('inert');
    // A plain button with nothing to go on is unknown, not assumed safe.
    expect(byLabel.get('Focus me')?.classification).toBe('unknown');
    // "Press and hold" says nothing about what it does either.
    expect(byLabel.get('Press and hold')?.classification).toBe('unknown');

    // Disabled is recorded, not used to reclassify: disabled today, enabled
    // tomorrow, and what it *does* has not changed.
    const disabled = byLabel.get('Disabled action');
    expect(disabled?.disabled).toBe(true);
    expect(disabled?.classification).toBe('unknown');

    // The menu's links live behind a hover, so the inventory never sees them.
    // That is the direct cost of never interacting with anything, and it is
    // recorded in docs/limitations.md rather than worked around.
    expect(byLabel.has('Home')).toBe(false);
    expect(byLabel.has('Identity')).toBe(false);
    // The trigger that would reveal them is inventoried, though.
    expect(byLabel.get('Menu')?.classification).toBe('unknown');
  });

  it('writes one record per control, with a locator ready for a recipe', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/states.html')], { budgets: { maxDepth: 0 } });

    const text = await readFile(test.writer.paths.interactionsJsonl, 'utf8');
    const lines = text.trim().split('\n');
    expect(lines).toHaveLength(result.interactions.length);

    const first = JSON.parse(lines[0] as string) as InteractionCandidate;
    expect(first.runId).toBe(test.runId);
    expect(first.pageId).toBe(result.pages[0]?.id);
    expect(first.url).toBe(test.url('/states.html'));
    expect(first.boundingBox.width).toBeGreaterThan(0);

    // Most controls on this fixture carry a data-testid, so a locator should be
    // available for nearly all of them.
    const located = result.interactions.filter((one) => one.locator !== undefined);
    expect(located.length).toBeGreaterThan(result.interactions.length / 2);
  });

  it('skips controls that are not rendered', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/states.html')], { budgets: { maxDepth: 0 } });

    // The menu panel's links are display:none until the trigger is hovered, and
    // the inventory does not hover anything.
    expect(result.interactions.every((one) => one.boundingBox.height > 0)).toBe(true);
  });

  it('honours maxPerPage', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/states.html')], {
      budgets: { maxDepth: 0 },
      inventory: { enabled: true, maxPerPage: 3 },
    });
    expect(result.interactions).toHaveLength(3);
  });

  it('collects nothing at all when it is switched off', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/states.html')], {
      budgets: { maxDepth: 0 },
      inventory: { enabled: false },
    });
    expect(result.interactions).toEqual([]);
    expect(existsSync(test.writer.paths.interactionsJsonl)).toBe(false);
  });

  it('generates a skeleton that names risky controls but never steps on them', async () => {
    const test = await harness();
    const result = await crawl(test, [test.url('/')], { budgets: { maxDepth: 1 } });

    const skeleton = suggestRecipes(result.interactions);
    await test.writer.writeSuggestedRecipes(skeleton);
    const written = await readFile(test.writer.paths.suggestedRecipes, 'utf8');

    // Destructive controls are visible to the reader...
    expect(written).toContain('Delete account');
    expect(written).toContain('[mutation]');
    // ...but nothing in the file clicks, and no mutation became a step.
    expect(written).not.toMatch(/^\s*- click:/m);
    expect(written).toMatch(/^\s*- select:/m);

    const mutationLabels = result.interactions
      .filter((one) => one.classification === 'mutation')
      .map(labelOf);
    for (const label of mutationLabels) {
      const stepLine = new RegExp(`^\\s*- select:.*${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}`, 'm');
      expect(written).not.toMatch(stepLine);
    }

    // And the crawl that produced it still touched nothing.
    await test.page.goto(test.url('/destructive.html'));
    expect(await test.page.evaluate(DESTRUCTIVE_LOG)).toEqual([]);
  });
});
