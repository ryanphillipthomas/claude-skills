import { describe, expect, it } from 'vitest';
import { CrawlConfigSchema, RecipeSchema, type CrawlConfig } from '@ui-atlas/config';
import { CrawlPolicy, planCrawl, planProblems, formatPlan, stepIsInteractive } from '@ui-atlas/crawler';

const ORIGIN = 'https://site.test';

function crawl(overrides: Record<string, unknown> = {}): CrawlConfig {
  return CrawlConfigSchema.parse({ seeds: [`${ORIGIN}/`], ...overrides });
}

function plan(overrides: Record<string, unknown> = {}) {
  const config = crawl(overrides);
  return planCrawl(config, [...new CrawlPolicy(config, config.seeds).origins]);
}

describe('recipe validation', () => {
  it('accepts the shape from the brief', () => {
    const parsed = RecipeSchema.parse({
      name: 'open-primary-navigation',
      match: '/**',
      steps: [
        { hover: { role: 'button', name: 'Menu' } },
        { waitFor: { role: 'navigation' } },
        { capture: { kind: 'viewport', state: 'default' } },
      ],
    });
    expect(parsed.match).toEqual(['/**']);
    expect(parsed.steps).toHaveLength(3);
    expect(parsed.timeoutMs).toBeGreaterThan(0);
  });

  it('normalises a single match string into a list', () => {
    expect(RecipeSchema.parse({ name: 'a', match: '/x', steps: [{ capture: {} }] }).match).toEqual(['/x']);
    expect(
      RecipeSchema.parse({ name: 'a', match: ['/x', '/y'], steps: [{ capture: {} }] }).match,
    ).toEqual(['/x', '/y']);
  });

  it('rejects a misspelled step rather than skipping it', () => {
    // The dangerous failure mode for a config that can click: silently ignoring
    // a line a human wrote.
    const result = RecipeSchema.safeParse({
      name: 'typo',
      steps: [{ clcik: { testId: 'save' } }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown option on a known step', () => {
    expect(
      RecipeSchema.safeParse({
        name: 'x',
        steps: [{ capture: { kind: 'viewport', unexpected: true } }],
      }).success,
    ).toBe(false);
  });

  it('requires a target to name exactly one thing', () => {
    const two = RecipeSchema.safeParse({
      name: 'x',
      steps: [{ click: { testId: 'a', css: '.b' } }],
    });
    expect(two.success).toBe(false);

    const none = RecipeSchema.safeParse({ name: 'x', steps: [{ click: { exact: true } }] });
    expect(none.success).toBe(false);

    const one = RecipeSchema.safeParse({ name: 'x', steps: [{ click: { testId: 'a' } }] });
    expect(one.success).toBe(true);
  });

  it('rejects `name` without `role`, which would silently do nothing', () => {
    expect(
      RecipeSchema.safeParse({ name: 'x', steps: [{ click: { css: '.a', name: 'Save' } }] }).success,
    ).toBe(false);
    expect(
      RecipeSchema.safeParse({ name: 'x', steps: [{ click: { role: 'button', name: 'Save' } }] })
        .success,
    ).toBe(true);
  });

  it('rejects a recipe with no steps', () => {
    expect(RecipeSchema.safeParse({ name: 'x', steps: [] }).success).toBe(false);
  });

  it('knows which steps touch the page', () => {
    expect(stepIsInteractive({ click: { testId: 'a', exact: false } })).toBe(true);
    expect(stepIsInteractive({ press: { key: 'Enter' } })).toBe(true);
    expect(stepIsInteractive({ capture: { kind: 'viewport', state: 'default' } })).toBe(false);
    expect(stepIsInteractive({ waitFor: { role: 'navigation', exact: false } })).toBe(false);
  });

  it('has no primitive that types text, so no recipe can attempt a sign-in', () => {
    for (const step of [
      { fill: { css: '#password', value: 'hunter2' } },
      { type: { css: '#user', text: 'me' } },
      { evaluate: 'document.forms[0].submit()' },
    ]) {
      expect(RecipeSchema.safeParse({ name: 'x', steps: [step] }).success).toBe(false);
    }
  });
});

describe('crawl dry run', () => {
  it('reports the plan without needing a browser', () => {
    const result = plan({
      recipes: [
        {
          name: 'open-menu',
          match: '/components/**',
          steps: [
            { click: { role: 'button', name: 'Menu' } },
            { capture: { kind: 'viewport' } },
          ],
        },
      ],
    });

    expect(result.seeds).toEqual([`${ORIGIN}/`]);
    expect(result.origins).toEqual([ORIGIN]);
    expect(result.recipes).toHaveLength(1);
    expect(result.recipes[0]).toMatchObject({
      name: 'open-menu',
      steps: ['click', 'capture'],
      captures: 1,
    });
    expect(result.recipes[0]?.clicks).toEqual(['role=button name=Menu']);
    expect(planProblems(result)).toEqual([]);
  });

  it('names the controls a recipe would click, since clicking can mutate', () => {
    const text = formatPlan(
      plan({
        recipes: [
          {
            name: 'risky',
            steps: [{ click: { testId: 'place-order' } }, { capture: {} }],
          },
        ],
      }),
    );
    expect(text).toContain('CLICKS');
    expect(text).toContain('testId=place-order');
  });

  it('catches a recipe scoped to a route the crawl will never visit', () => {
    const denied = plan({
      recipes: [{ name: 'never', match: '/logout', steps: [{ capture: {} }] }],
    });
    expect(planProblems(denied)).toEqual([
      expect.stringContaining('denyPaths'),
    ]);

    const excluded = plan({
      exclude: ['/checkout/**'],
      recipes: [{ name: 'never', match: '/checkout/**', steps: [{ capture: {} }] }],
    });
    expect(planProblems(excluded)).toEqual([expect.stringContaining('exclude')]);
  });

  it('catches an element capture with nothing selected', () => {
    const result = plan({
      recipes: [
        { name: 'no-select', steps: [{ capture: { kind: 'element' } }] },
        { name: 'late-select', steps: [{ captureStates: ['hover'] }, { select: { testId: 'x' } }] },
        {
          name: 'fine',
          steps: [{ select: { testId: 'x' } }, { capture: { kind: 'element' } }],
        },
      ],
    });
    const problems = planProblems(result);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('no-select');
    expect(problems[1]).toContain('late-select');
  });

  it('catches a recipe that clicks but keeps no artifact, and duplicate names', () => {
    expect(
      planProblems(plan({ recipes: [{ name: 'pointless', steps: [{ click: { testId: 'a' } }] }] })),
    ).toEqual([expect.stringContaining('captures nothing')]);

    const dupes = plan({
      recipes: [
        { name: 'same', steps: [{ capture: {} }] },
        { name: 'same', steps: [{ capture: {} }] },
      ],
    });
    expect(planProblems(dupes)).toContain('duplicate recipe name "same"');
  });

  it('says plainly when there are no recipes at all', () => {
    expect(formatPlan(plan())).toContain('follow links and touch nothing');
    expect(planProblems(plan())).toEqual([]);
  });

  it('flags a crawl with no seeds', () => {
    const empty = CrawlConfigSchema.parse({});
    expect(planProblems(planCrawl(empty, []))).toEqual([expect.stringContaining('no seeds')]);
  });
});
