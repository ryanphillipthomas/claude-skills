import type { Page } from 'playwright';
import { captureProvokedAnimations } from '@ui-atlas/animation';
import { routeKeyFromUrl } from '@ui-atlas/artifacts';
import type { Recipe, RecipeStepConfig, RecipeTarget, UiAtlasConfig } from '@ui-atlas/config';
import { buildElementIdentity, buildFramePath } from '@ui-atlas/identity';
import type { CaptureService } from '@ui-atlas/capture';
import {
  toStructuredError,
  UiAtlasError,
  type AnimationRecord,
  type CaptureRecord,
  type ElementIdentity,
  type ElementProbe,
  type StateName,
  type StillCaptureKind,
} from '@ui-atlas/protocol';
import { Deadline, sleep } from '@ui-atlas/settle';
import { firstMatchingGlob, globToRegExp } from './glob.js';
import { describeTarget, locatorFor } from './targets.js';

/**
 * Describes an element the same way the inspector does. Passed in rather than
 * imported so the crawler does not depend on the inspector package for one
 * function.
 */
export type ProbeLocator = (page: Page, target: RecipeTarget) => Promise<ElementProbe>;

export interface RecipeRunnerOptions {
  config: UiAtlasConfig;
  captures: CaptureService;
  probe: ProbeLocator;
  /** Stamped onto the animation records a `captureAnimation` step produces. */
  runId: string;
  /** Replays the current route across every viewport, for `captureResponsive`. */
  runResponsive?:
    | ((input: { kind: StillCaptureKind; states: StateName[]; identity?: ElementIdentity | undefined }) => Promise<{
        records: CaptureRecord[];
        warnings: string[];
      }>)
    | undefined;
  /**
   * Persists an animation a `captureAnimation` step provoked. Without it the
   * frames are still captured; only the description of what was in them is lost.
   */
  onAnimation?: ((record: AnimationRecord) => Promise<void>) | undefined;
  onProgress?: ((message: string) => void) | undefined;
}

export interface RecipeOutcome {
  recipe: string;
  route: string;
  status: 'ran' | 'failed';
  captureIds: string[];
  /** Animations a `captureAnimation` step provoked into existence. */
  animationIds: string[];
  /** Controls this run actually clicked. Counted so a run summary can show it. */
  clicks: number;
  warnings: string[];
  error?: string;
}

/** Step names, for the "unknown step" message and for the dry run. */
export function stepName(step: RecipeStepConfig): string {
  return Object.keys(step)[0] ?? 'unknown';
}

/** True when this step interacts with the page rather than observing it. */
export function stepIsInteractive(step: RecipeStepConfig): boolean {
  const name = stepName(step);
  return name === 'click' || name === 'press';
}

/**
 * Runs the recipes that match a route, on the page the crawler is already on.
 *
 * A recipe is the "explicit approval" the brief requires before anything is
 * clicked: the crawler on its own never interacts with a page, and a control is
 * only ever clicked because a human wrote a step naming it.
 */
export class RecipeRunner {
  private readonly recipes: Recipe[];
  /** Numbers the animation records this runner writes, in discovery order. */
  private animationSeq = 0;

  constructor(private readonly options: RecipeRunnerOptions) {
    this.recipes = options.config.crawl.recipes;
  }

  get isEmpty(): boolean {
    return this.recipes.length === 0;
  }

  /** Recipes whose `match` globs cover this path, in configuration order. */
  matching(pathname: string): Recipe[] {
    return this.recipes.filter((recipe) => firstMatchingGlob(pathname, recipe.match) !== undefined);
  }

  async runFor(page: Page, url: string): Promise<RecipeOutcome[]> {
    const pathname = safePathname(url);
    if (pathname === undefined) return [];

    const outcomes: RecipeOutcome[] = [];
    for (const recipe of this.matching(pathname)) {
      outcomes.push(await this.runOne(page, recipe, pathname));
    }
    return outcomes;
  }

  private async runOne(page: Page, recipe: Recipe, route: string): Promise<RecipeOutcome> {
    const outcome: RecipeOutcome = {
      recipe: recipe.name,
      route,
      status: 'ran',
      captureIds: [],
      animationIds: [],
      clicks: 0,
      warnings: [],
    };
    const deadline = new Deadline(recipe.timeoutMs);
    const startUrl = page.url();
    let selected: ElementIdentity | undefined;

    this.options.onProgress?.(`recipe ${recipe.name} on ${route}`);

    try {
      for (const step of recipe.steps) {
        if (deadline.expired()) {
          throw new UiAtlasError(
            'capture.timeout',
            `recipe "${recipe.name}" exceeded its ${String(recipe.timeoutMs)}ms budget`,
          );
        }
        selected = await this.runStep(page, step, {
          deadline,
          selected,
          outcome,
        });
      }
    } catch (error) {
      outcome.status = 'failed';
      outcome.error = toStructuredError(error, 'capture.failed').message;
    }

    // A recipe that navigated leaves the crawler somewhere it did not choose.
    // Link discovery already happened before this ran, so the frontier is not
    // affected, but the captures after the navigation are of a different page
    // and that has to be visible.
    if (page.url() !== startUrl) {
      outcome.warnings.push(
        `recipe "${recipe.name}" navigated from ${startUrl} to ${page.url()}`,
      );
    }

    return outcome;
  }

  private async runStep(
    page: Page,
    step: RecipeStepConfig,
    context: { deadline: Deadline; selected: ElementIdentity | undefined; outcome: RecipeOutcome },
  ): Promise<ElementIdentity | undefined> {
    const { deadline, outcome } = context;
    let { selected } = context;
    const stepTimeout = (fallback: number): number => Math.max(1, deadline.budgetFor(fallback));

    if ('select' in step) {
      return this.identityFor(page, step.select);
    }

    if ('click' in step) {
      // The one place the tool clicks anything automatically. It happens because
      // a recipe names this control, and nowhere else.
      await locatorFor(page, step.click).click({ timeout: stepTimeout(10_000) });
      outcome.clicks += 1;
      return selected;
    }

    if ('hover' in step) {
      await locatorFor(page, step.hover).hover({ timeout: stepTimeout(10_000) });
      return selected;
    }

    if ('focus' in step) {
      await locatorFor(page, step.focus).focus({ timeout: stepTimeout(10_000) });
      return selected;
    }

    if ('waitFor' in step) {
      await locatorFor(page, step.waitFor).first().waitFor({
        state: 'visible',
        timeout: stepTimeout(10_000),
      });
      return selected;
    }

    if ('waitForUrl' in step) {
      const pattern = globToRegExp(step.waitForUrl);
      await page.waitForURL((candidate) => pattern.test(safePathname(candidate.toString()) ?? ''), {
        timeout: stepTimeout(10_000),
      });
      return selected;
    }

    if ('press' in step) {
      const { key, target } = step.press;
      if (target === undefined) await page.keyboard.press(key);
      else await locatorFor(page, target).press(key, { timeout: stepTimeout(10_000) });
      return selected;
    }

    if ('scroll' in step) {
      await page.evaluate(step.scroll === 'top' ? scrollToTop : scrollToBottom);
      return selected;
    }

    if ('scrollTo' in step) {
      await locatorFor(page, step.scrollTo)
        .first()
        .scrollIntoViewIfNeeded({ timeout: stepTimeout(10_000) });
      return selected;
    }

    if ('waitMs' in step) {
      await sleep(Math.min(step.waitMs, deadline.remainingMs()));
      return selected;
    }

    if ('capture' in step) {
      const { kind, state, label } = step.capture;
      if (kind === 'element' && selected === undefined) {
        throw new UiAtlasError('locator.not-found', 'capture kind "element" needs a select step first');
      }
      const record = await this.options.captures.capture({
        kind,
        state,
        ...(kind === 'element' && selected !== undefined ? { identity: selected } : {}),
        ...(label === undefined ? {} : { stateLabel: label }),
      });
      this.collect(outcome, [record]);
      return selected;
    }

    if ('captureStates' in step) {
      if (selected === undefined) {
        throw new UiAtlasError('locator.not-found', 'captureStates needs a select step first');
      }
      const setId = `recipe-${String(Date.now())}`;
      for (const state of step.captureStates) {
        const record = await this.options.captures.capture({
          kind: 'element',
          state,
          identity: selected,
          set: { id: setId, kind: 'state', member: state },
        });
        this.collect(outcome, [record]);
      }
      return selected;
    }

    if ('captureAnimation' in step) {
      await this.captureAnimation(page, step.captureAnimation, { deadline, outcome });
      return selected;
    }

    if ('captureResponsive' in step) {
      const runResponsive = this.options.runResponsive;
      if (runResponsive === undefined) {
        outcome.warnings.push('captureResponsive is not available in this run');
        return selected;
      }
      const result = await runResponsive({
        kind: step.captureResponsive.kind,
        states: ['default'],
        ...(selected === undefined ? {} : { identity: selected }),
      });
      outcome.warnings.push(...result.warnings);
      this.collect(outcome, result.records);
      return selected;
    }

    // Unreachable while the schema and this switch agree; if they ever drift,
    // fail loudly rather than skipping a step a human asked for.
    throw new UiAtlasError('config.invalid', `unhandled recipe step "${stepName(step)}"`);
  }

  /**
   * Provoke motion, photograph it, put it back, and let go.
   *
   * The hover lives inside this step rather than beside it. Knowing which
   * animations an interaction started means holding the list from before it,
   * and a 200ms transition provoked by one step and sampled by the next has
   * usually finished by the time the next step runs.
   */
  private async captureAnimation(
    page: Page,
    spec: Extract<RecipeStepConfig, { captureAnimation: unknown }>['captureAnimation'],
    context: { deadline: Deadline; outcome: RecipeOutcome },
  ): Promise<void> {
    const { deadline, outcome } = context;
    const target = spec.hover ?? spec.focus;
    if (target === undefined) {
      // The schema refuses this shape; reaching it means the two have drifted.
      throw new UiAtlasError('config.invalid', 'captureAnimation needs exactly one of hover or focus');
    }
    const isHover = spec.hover !== undefined;
    const locator = locatorFor(page, target);
    const groupId = `${isHover ? 'hover' : 'focus'}:${describeTarget(target)}`;
    const timeout = Math.max(1, deadline.budgetFor(10_000));

    // Built before anything is provoked: a target that cannot be described is a
    // reason to photograph the viewport instead, not to leave a hover applied.
    let identity: ElementIdentity | undefined;
    if (spec.kind === 'element') {
      try {
        identity = await this.identityFor(page, target);
      } catch (error) {
        outcome.warnings.push(
          `${groupId}: the element could not be described (${describeError(error)}); ` +
            'these frames are of the viewport',
        );
      }
    }

    const sampling = this.options.config.capture.animation;
    const result = await captureProvokedAnimations(page, {
      runId: this.options.runId,
      routeKey: routeKeyFromUrl(page.url()),
      describeFrame: (frame) => buildFramePath(frame),
      newId: () => `anim-${String((this.animationSeq += 1))}`,
      provoke: async () => {
        if (isHover) await locator.hover({ timeout });
        else await locator.focus({ timeout });
      },
      // Moving the pointer to the origin is how a hover is let go of; there is
      // no `unhover`. Releasing runs the transition backwards, which is why it
      // happens after every frame has been taken.
      release: async () => {
        if (isHover) await page.mouse.move(0, 0);
        else await locator.blur({ timeout });
      },
      offsets: spec.offsets ?? sampling.offsets,
      maxAnimations: sampling.maxAnimations,
      groupId,
      setId: `recipe-animation-${String(this.animationSeq)}-${groupId}`,
      capture: async ({ sample, label, setId }) =>
        this.options.captures.capture({
          kind: 'animation-frame',
          // The animation position is forced; the *state* is genuinely default,
          // and `animation` carries the truth about the moment.
          state: 'default',
          stateLabel: spec.label === undefined ? label : `${spec.label} ${label}`,
          animation: sample,
          set: { id: setId, kind: 'animation', member: label },
          ...(identity === undefined ? {} : { identity }),
        }),
      ...(this.options.onProgress === undefined
        ? {}
        : { onProgress: this.options.onProgress }),
    });

    this.collect(outcome, result.captures);
    outcome.warnings.push(...result.warnings.map((warning) => `${groupId}: ${warning}`));
    for (const { record, reason } of result.skipped) {
      outcome.warnings.push(
        `${groupId}: not sampled: ${record.animationName ?? record.transitionProperty ?? record.animationId} — ${reason}`,
      );
    }

    const persist = this.options.onAnimation;
    for (const record of result.appeared) {
      outcome.animationIds.push(record.id);
      if (persist !== undefined) await persist(record);
    }
  }

  private collect(outcome: RecipeOutcome, records: CaptureRecord[]): void {
    for (const record of records) {
      outcome.captureIds.push(record.id);
      outcome.warnings.push(...record.warnings);
      if (record.status !== 'captured' && record.error !== undefined) {
        outcome.warnings.push(`${record.state.name}: ${record.error.code} — ${record.error.message}`);
      }
    }
  }

  private async identityFor(page: Page, target: RecipeTarget): Promise<ElementIdentity> {
    const probe = await this.options.probe(page, target);
    const identity = buildElementIdentity(probe, await buildFramePath(page.mainFrame()));
    if (identity.locatorCandidates.length === 0) {
      throw new UiAtlasError('locator.not-found', `no locator for ${describeTarget(target)}`);
    }
    return identity;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safePathname(raw: string): string | undefined {
  try {
    return new URL(raw).pathname;
  } catch {
    return undefined;
  }
}

/* Page-side functions, as literals rather than strings (ADR 5). */
function scrollToTop(): void {
  window.scrollTo(0, 0);
}

function scrollToBottom(): void {
  window.scrollTo(0, document.documentElement.scrollHeight);
}
