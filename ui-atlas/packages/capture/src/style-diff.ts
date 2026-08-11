import type { Locator } from 'playwright';
import type { StyleDelta } from '@ui-atlas/protocol';
import { readStyles, type StyleProbe } from './page-scripts.js';

/**
 * Computed properties that matter to a design system. Keeping the list short
 * makes state deltas readable: a hover that only changes `background-color`
 * should say exactly that.
 */
export const STYLE_WHITELIST: readonly string[] = [
  'color',
  'background-color',
  'background-image',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'outline-color',
  'outline-style',
  'outline-width',
  'outline-offset',
  'box-shadow',
  'opacity',
  'transform',
  'filter',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-decoration-line',
  'text-decoration-color',
  'text-transform',
  'cursor',
  'visibility',
  'display',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'width',
  'height',
];

/** Read the whitelisted computed styles plus cheap "did anything happen" signals. */
export async function probeStyles(locator: Locator, timeoutMs = 5_000): Promise<StyleProbe> {
  return locator.evaluate(readStyles, STYLE_WHITELIST, { timeout: timeoutMs });
}

/** Diff two probes into the delta stored on a state capture. */
export function diffStyles(before: StyleProbe, after: StyleProbe): StyleDelta {
  const changed: StyleDelta['changed'] = {};
  for (const [property, value] of Object.entries(after.styles)) {
    const previous = before.styles[property];
    if (previous !== undefined && previous !== value) changed[property] = { from: previous, to: value };
  }
  const delta: StyleDelta = { changed };
  if (before.visibleDescendants !== after.visibleDescendants) delta.descendantVisibilityChanged = true;
  if (
    Math.abs(before.box.width - after.box.width) > 0.5 ||
    Math.abs(before.box.height - after.box.height) > 0.5 ||
    Math.abs(before.box.x - after.box.x) > 0.5 ||
    Math.abs(before.box.y - after.box.y) > 0.5
  ) {
    delta.boundsChanged = true;
  }
  return delta;
}

/** True when a delta contains evidence that a state actually took effect. */
export function deltaHasEvidence(delta: StyleDelta): boolean {
  return (
    Object.keys(delta.changed).length > 0 ||
    delta.descendantVisibilityChanged === true ||
    delta.boundsChanged === true
  );
}

export type { StyleProbe };
