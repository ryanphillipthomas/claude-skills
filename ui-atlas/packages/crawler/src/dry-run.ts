import type { CrawlConfig } from '@ui-atlas/config';
import { firstMatchingGlob } from './glob.js';
import { describeTarget } from './targets.js';
import { stepIsInteractive, stepName } from './recipes.js';

/**
 * What `capture.animation.offsets` defaults to. The plan works from
 * configuration alone and has no capture config to read, so a step that does
 * not override the offsets is counted at the schema's default length.
 */
const DEFAULT_ANIMATION_OFFSETS = [0, 0.25, 0.5, 0.75, 1];

export interface RecipePlan {
  name: string;
  match: string[];
  steps: string[];
  /** Controls this recipe would click. Surfaced because clicking can mutate. */
  clicks: string[];
  captures: number;
  problems: string[];
}

export interface CrawlPlan {
  seeds: string[];
  origins: string[];
  include: string[];
  exclude: string[];
  denyPaths: string[];
  budgets: CrawlConfig['budgets'];
  recipes: RecipePlan[];
  problems: string[];
}

/**
 * What a crawl *would* do, worked out from configuration alone — no browser, no
 * network, nothing visited.
 *
 * The schema has already rejected malformed recipes by the time this runs, so
 * what is left to check is the class of mistake that is valid YAML and still
 * wrong: a recipe scoped to routes the crawl will never visit, or one that
 * clicks on a route the deny list exists to protect.
 */
export function planCrawl(config: CrawlConfig, origins: readonly string[]): CrawlPlan {
  const problems: string[] = [];
  if (config.seeds.length === 0) problems.push('no seeds: the crawl would visit nothing');

  const recipes = config.recipes.map((recipe) => {
    const recipeProblems: string[] = [];
    const clicks: string[] = [];
    let captures = 0;

    for (const step of recipe.steps) {
      if ('click' in step) clicks.push(describeTarget(step.click));
      if ('capture' in step) captures += 1;
      if ('captureStates' in step) captures += step.captureStates.length;
      if ('captureResponsive' in step) captures += 1;
      // One frame per offset, and it carries its own target rather than
      // needing a `select` step first.
      if ('captureAnimation' in step) {
        captures += (step.captureAnimation.offsets ?? DEFAULT_ANIMATION_OFFSETS).length;
      }
    }

    const needsSelection = recipe.steps.some(
      (step) =>
        ('capture' in step && step.capture.kind === 'element') || 'captureStates' in step,
    );
    const selectsFirst = recipe.steps.findIndex((step) => 'select' in step);
    const firstElementCapture = recipe.steps.findIndex(
      (step) => ('capture' in step && step.capture.kind === 'element') || 'captureStates' in step,
    );
    if (needsSelection && (selectsFirst === -1 || selectsFirst > firstElementCapture)) {
      recipeProblems.push('captures an element before any select step');
    }

    for (const pattern of recipe.match) {
      // A recipe scoped to a route the crawl refuses to visit will never fire.
      // That is always a mistake, and it is invisible at runtime because
      // "recipe never ran" looks exactly like "no page matched".
      const denied = firstMatchingGlob(stripGlob(pattern), config.denyPaths);
      if (denied !== undefined) {
        recipeProblems.push(`match "${pattern}" is covered by denyPaths "${denied}"; it can never run`);
      }
      const excluded = firstMatchingGlob(stripGlob(pattern), config.exclude);
      if (excluded !== undefined) {
        recipeProblems.push(`match "${pattern}" is covered by exclude "${excluded}"; it can never run`);
      }
    }

    if (clicks.length > 0 && captures === 0) {
      recipeProblems.push('clicks but captures nothing, so it changes the page for no artifact');
    }

    return {
      name: recipe.name,
      match: recipe.match,
      steps: recipe.steps.map(stepName),
      clicks,
      captures,
      problems: recipeProblems,
    };
  });

  const names = new Set<string>();
  for (const recipe of recipes) {
    if (names.has(recipe.name)) problems.push(`duplicate recipe name "${recipe.name}"`);
    names.add(recipe.name);
  }

  const interactive = config.recipes.filter((recipe) => recipe.steps.some(stepIsInteractive));
  if (interactive.length > 0 && config.budgets.maxPages > 200) {
    problems.push(
      `${String(interactive.length)} recipe(s) interact with the page and maxPages is ` +
        `${String(config.budgets.maxPages)}; consider a smaller run first`,
    );
  }

  return {
    seeds: [...config.seeds],
    origins: [...origins],
    include: [...config.include],
    exclude: [...config.exclude],
    denyPaths: [...config.denyPaths],
    budgets: config.budgets,
    recipes,
    problems,
  };
}

/**
 * A glob is not a path, so it cannot be tested against another glob directly.
 * Reducing the wildcards to a concrete-looking path is a good-enough
 * approximation for "would this ever be allowed": it catches the real mistake,
 * `match: '/logout'` or `match: '/checkout/**'`, without pretending to be a
 * general glob-intersection algorithm.
 */
function stripGlob(pattern: string): string {
  const concrete = pattern.replace(/\/\*\*$/, '').replace(/\*\*/g, 'x').replace(/[*?]/g, 'x');
  return concrete.length === 0 ? '/' : concrete;
}

export function formatPlan(plan: CrawlPlan): string {
  const lines: string[] = [];
  lines.push('Crawl plan (dry run — nothing was visited)');
  lines.push('');
  lines.push(`  seeds       ${plan.seeds.join(', ') || '(none)'}`);
  lines.push(`  origins     ${plan.origins.join(', ') || '(none)'}`);
  lines.push(`  include     ${plan.include.join(', ')}`);
  lines.push(`  exclude     ${plan.exclude.join(', ') || '(none)'}`);
  lines.push(`  denyPaths   ${String(plan.denyPaths.length)} rules, incl. ${plan.denyPaths[0] ?? ''}`);
  lines.push(
    `  budgets     maxPages ${String(plan.budgets.maxPages)}, maxDepth ${String(plan.budgets.maxDepth)}, ` +
      `maxRunMinutes ${String(plan.budgets.maxRunMinutes)}`,
  );
  lines.push('');

  if (plan.recipes.length === 0) {
    lines.push('  No recipes. The crawl would follow links and touch nothing.');
  } else {
    lines.push(`  ${String(plan.recipes.length)} recipe(s):`);
    for (const recipe of plan.recipes) {
      lines.push('');
      lines.push(`  ${recipe.name}`);
      lines.push(`    match     ${recipe.match.join(', ')}`);
      lines.push(`    steps     ${recipe.steps.join(' → ')}`);
      lines.push(`    captures  ${String(recipe.captures)}`);
      if (recipe.clicks.length > 0) {
        lines.push(`    CLICKS    ${String(recipe.clicks.length)}: ${recipe.clicks.join('; ')}`);
      }
      for (const problem of recipe.problems) lines.push(`    problem   ${problem}`);
    }
  }

  if (plan.problems.length > 0) {
    lines.push('');
    for (const problem of plan.problems) lines.push(`  problem     ${problem}`);
  }

  return lines.join('\n');
}

/** Every problem across the plan, for the exit code. */
export function planProblems(plan: CrawlPlan): string[] {
  return [
    ...plan.problems,
    ...plan.recipes.flatMap((recipe) =>
      recipe.problems.map((problem) => `${recipe.name}: ${problem}`),
    ),
  ];
}
