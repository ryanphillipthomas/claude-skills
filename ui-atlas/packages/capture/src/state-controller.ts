import type { Locator, Page } from 'playwright';
import type { CaptureConfig } from '@ui-atlas/config';
import {
  UiAtlasError,
  type CaptureState,
  type RecipeStep,
  type StateName,
} from '@ui-atlas/protocol';
import {
  blurActiveElement,
  blurElement,
  forceStateFlag,
  readStateFlags,
  undoStateFlag,
  type ForceRequest,
  type StateFlags,
} from './page-scripts.js';
import { PointerTracker, releaseModifiers } from './pointer.js';
import { probeStyles, type StyleProbe } from './style-diff.js';

export interface StateContext {
  page: Page;
  /** Required for every state except `default` and `custom`. */
  locator: Locator | undefined;
  config: CaptureConfig;
  pointer: PointerTracker;
  timeoutMs: number;
}

export interface StateApplication {
  state: CaptureState;
  steps: RecipeStep[];
  /** Undo everything this state did. Always invoked from a `finally` block. */
  cleanup: () => Promise<void>;
  /** Set when the state could not be reached honestly. */
  skipped?: string;
  before?: StyleProbe;
}

function requireLocator(ctx: StateContext, state: StateName): Locator {
  if (ctx.locator === undefined) {
    throw new UiAtlasError('state.unsupported', `state "${state}" needs a selected element`);
  }
  return ctx.locator;
}

async function readFlags(locator: Locator, timeoutMs: number): Promise<StateFlags> {
  return locator.evaluate(readStateFlags, undefined, { timeout: timeoutMs });
}

function observed(name: StateName, verification: string, label?: string): CaptureState {
  const state: CaptureState = { name, provenance: 'observed', verified: true, verification };
  if (label !== undefined) state.label = label;
  return state;
}

const NOOP = async (): Promise<void> => undefined;

/**
 * Put the page into `name`, capture-ready. The returned `cleanup` must always
 * run: it releases mouse buttons and modifier keys and undoes any forced
 * attribute, so the page is left exactly as it was found.
 */
export async function applyState(
  ctx: StateContext,
  name: StateName,
  label?: string,
): Promise<StateApplication> {
  const steps: RecipeStep[] = [];

  switch (name) {
    case 'default':
    case 'custom': {
      const before = ctx.locator === undefined ? undefined : await safeProbe(ctx.locator, ctx.timeoutMs);
      const application: StateApplication = {
        state: observed(name, 'page captured as found', label),
        steps,
        cleanup: NOOP,
      };
      if (before !== undefined) application.before = before;
      return application;
    }

    case 'hover':
      return applyHover(ctx, steps);

    case 'focus':
      return applyFocus(ctx, steps);

    case 'focus-visible':
      return applyFocusVisible(ctx, steps);

    case 'active':
      return applyActive(ctx, steps);

    case 'checked':
    case 'selected':
    case 'expanded':
    case 'disabled':
      return applyFlagState(ctx, name, steps);

    default: {
      const exhaustive: never = name;
      throw new UiAtlasError('state.unsupported', `unknown state ${String(exhaustive)}`);
    }
  }
}

async function safeProbe(locator: Locator, timeoutMs: number): Promise<StyleProbe | undefined> {
  try {
    return await probeStyles(locator, timeoutMs);
  } catch {
    return undefined;
  }
}

async function applyHover(ctx: StateContext, steps: RecipeStep[]): Promise<StateApplication> {
  const locator = requireLocator(ctx, 'hover');
  const before = await safeProbe(locator, ctx.timeoutMs);
  const box = await locator.boundingBox({ timeout: ctx.timeoutMs });

  await locator.hover({ timeout: ctx.timeoutMs });
  if (box !== null) ctx.pointer.note(box.x + box.width / 2, box.y + box.height / 2);
  steps.push({ action: 'hover', target: 'selected element' });

  const application: StateApplication = {
    state: {
      name: 'hover',
      provenance: 'interacted',
      verified: true,
      verification: 'Playwright moved the real pointer over the element',
    },
    steps,
    cleanup: async () => {
      await ctx.page.mouse.move(0, 0).catch(() => undefined);
    },
  };
  if (before !== undefined) application.before = before;
  return application;
}

async function applyFocus(ctx: StateContext, steps: RecipeStep[]): Promise<StateApplication> {
  const locator = requireLocator(ctx, 'focus');
  const before = await safeProbe(locator, ctx.timeoutMs);

  await locator.focus({ timeout: ctx.timeoutMs });
  steps.push({ action: 'focus', target: 'selected element' });

  const flags = await readFlags(locator, ctx.timeoutMs);
  const application: StateApplication = {
    state: {
      name: 'focus',
      provenance: 'interacted',
      verified: flags.focused,
      verification: flags.focused
        ? 'activeElement in the owning root is the target'
        : 'focus() ran but the element did not become activeElement',
    },
    steps,
    cleanup: async () => {
      await locator.evaluate(blurElement).catch(() => undefined);
    },
  };
  if (before !== undefined) application.before = before;
  return application;
}

/**
 * Prefer a genuine keyboard interaction. Chromium only paints a focus ring when
 * its "keyboard modality" flag is set, so we press a harmless modifier first and
 * then verify `:focus-visible` actually matches. If it does not, we walk Tab
 * stops. Only if both fail do we report the state as unreached — we never claim
 * a focus ring we did not see.
 */
async function applyFocusVisible(ctx: StateContext, steps: RecipeStep[]): Promise<StateApplication> {
  const locator = requireLocator(ctx, 'focus-visible');
  const before = await safeProbe(locator, ctx.timeoutMs);

  const cleanup = async (): Promise<void> => {
    await releaseModifiers(ctx.page);
    await locator.evaluate(blurElement).catch(() => undefined);
  };

  await ctx.page.keyboard.press('Shift');
  await locator.focus({ timeout: ctx.timeoutMs });
  steps.push({ action: 'press', target: 'Shift', detail: { why: 'set keyboard modality' } });
  steps.push({ action: 'focus', target: 'selected element' });

  let flags = await readFlags(locator, ctx.timeoutMs);
  if (flags.focusVisible) {
    const application: StateApplication = {
      state: {
        name: 'focus-visible',
        provenance: 'interacted',
        verified: true,
        verification: 'element matches :focus-visible after a real key press',
      },
      steps,
      cleanup,
    };
    if (before !== undefined) application.before = before;
    return application;
  }

  const reached = await tabWalkTo(ctx, locator, steps);
  if (reached) {
    flags = await readFlags(locator, ctx.timeoutMs);
    if (flags.focusVisible) {
      const application: StateApplication = {
        state: {
          name: 'focus-visible',
          provenance: 'interacted',
          verified: true,
          verification: 'reached by keyboard navigation',
        },
        steps,
        cleanup,
      };
      if (before !== undefined) application.before = before;
      return application;
    }
  }

  await cleanup();
  const application: StateApplication = {
    state: {
      name: 'focus-visible',
      provenance: 'interacted',
      verified: false,
      verification: 'element never matched :focus-visible',
    },
    steps,
    cleanup: NOOP,
    skipped:
      'could not reach :focus-visible with a real keyboard interaction; CDP pseudo-state forcing is not implemented yet',
  };
  if (before !== undefined) application.before = before;
  return application;
}

async function tabWalkTo(ctx: StateContext, locator: Locator, steps: RecipeStep[]): Promise<boolean> {
  const maxTabs = ctx.config.keyboardFocusMaxTabs;
  if (maxTabs <= 0) return false;

  await ctx.page.evaluate(blurActiveElement);
  steps.push({ action: 'keyboard-focus', detail: { maxTabs } });

  for (let index = 0; index < maxTabs; index += 1) {
    await ctx.page.keyboard.press('Tab');
    const flags = await readFlags(locator, ctx.timeoutMs).catch(() => undefined);
    if (flags?.focused === true) return true;
  }
  return false;
}

/**
 * A point inside the viewport but outside `box`, used to release the mouse
 * button somewhere the press cannot turn into a click.
 */
async function pointOutside(
  ctx: StateContext,
  box: { x: number; y: number; width: number; height: number },
): Promise<{ x: number; y: number }> {
  const viewport = ctx.page.viewportSize() ?? { width: 1280, height: 800 };
  const inside = (point: { x: number; y: number }): boolean =>
    point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
  const inViewport = (point: { x: number; y: number }): boolean =>
    point.x >= 0 && point.y >= 0 && point.x < viewport.width && point.y < viewport.height;

  const candidates = [
    { x: box.x - 6, y: box.y - 6 },
    { x: box.x + box.width + 6, y: box.y + box.height + 6 },
    { x: viewport.width - 1, y: viewport.height - 1 },
    { x: 0, y: 0 },
  ];
  return candidates.find((point) => inViewport(point) && !inside(point)) ?? { x: 0, y: 0 };
}

async function applyActive(ctx: StateContext, steps: RecipeStep[]): Promise<StateApplication> {
  const locator = requireLocator(ctx, 'active');
  const before = await safeProbe(locator, ctx.timeoutMs);
  const box = await locator.boundingBox({ timeout: ctx.timeoutMs });
  if (box === null) {
    throw new UiAtlasError('state.unsupported', 'active state needs a visible element with a box');
  }
  const releasePoint = await pointOutside(ctx, box);

  const cleanup = async (): Promise<void> => {
    // Move off the element *before* releasing. A mousedown and mouseup on
    // different targets never becomes a click, so holding a checkbox, a link or
    // a submit button to photograph its pressed state cannot activate it.
    await ctx.page.mouse.move(releasePoint.x, releasePoint.y).catch(() => undefined);
    await ctx.pointer.releaseButtons(ctx.page);
  };

  await ctx.pointer.moveTo(ctx.page, box.x + box.width / 2, box.y + box.height / 2);
  await ctx.pointer.down(ctx.page);
  steps.push({ action: 'mouse-down', target: 'selected element' });

  const flags = await readFlags(locator, ctx.timeoutMs).catch(() => undefined);
  const application: StateApplication = {
    state: {
      name: 'active',
      provenance: 'interacted',
      verified: flags?.active ?? false,
      verification: flags?.active === true ? 'element matches :active while held' : 'mouse is held down on the element',
    },
    steps,
    cleanup,
  };
  if (before !== undefined) application.before = before;
  return application;
}

const FLAG_FORCE: Record<'checked' | 'selected' | 'expanded' | 'disabled', ForceRequest> = {
  checked: { attribute: 'aria-checked', attributeValue: 'true', property: 'checked', propertyValue: true },
  selected: { attribute: 'aria-selected', attributeValue: 'true', property: 'selected', propertyValue: true },
  expanded: { attribute: 'aria-expanded', attributeValue: 'true', property: null, propertyValue: true },
  disabled: { attribute: 'aria-disabled', attributeValue: 'true', property: 'disabled', propertyValue: true },
};

/**
 * Checked / selected / expanded / disabled are captured as *observed* whenever
 * the page is already in them. Otherwise we may synthesise the state by
 * touching an attribute — which is honestly labelled `forced` and undone in
 * `cleanup` — or skip it when forcing is disabled.
 */
async function applyFlagState(
  ctx: StateContext,
  name: 'checked' | 'selected' | 'expanded' | 'disabled',
  steps: RecipeStep[],
): Promise<StateApplication> {
  const locator = requireLocator(ctx, name);
  const before = await safeProbe(locator, ctx.timeoutMs);
  const flags = await readFlags(locator, ctx.timeoutMs);

  if (flags[name]) {
    const application: StateApplication = {
      state: observed(name, `element is already ${name} on the page`),
      steps,
      cleanup: NOOP,
    };
    if (before !== undefined) application.before = before;
    return application;
  }

  if (!ctx.config.allowForcedStates) {
    const application: StateApplication = {
      state: { name, provenance: 'observed', verified: false, verification: `element is not ${name}` },
      steps,
      cleanup: NOOP,
      skipped: `element is not ${name} and forced states are disabled`,
    };
    if (before !== undefined) application.before = before;
    return application;
  }

  const request = FLAG_FORCE[name];
  const undo = await locator.evaluate(forceStateFlag, request, { timeout: ctx.timeoutMs });
  steps.push({ action: 'force-pseudo-state', target: name, detail: { via: undo.property ?? undo.attribute } });

  const after = await readFlags(locator, ctx.timeoutMs).catch(() => undefined);
  const application: StateApplication = {
    state: {
      name,
      provenance: 'forced',
      verified: after?.[name] ?? false,
      verification: `synthesised by setting ${undo.property ?? undo.attribute ?? 'an attribute'}; not observed on the site`,
    },
    steps,
    cleanup: async () => {
      await locator.evaluate(undoStateFlag, undo).catch(() => undefined);
    },
  };
  if (before !== undefined) application.before = before;
  return application;
}
