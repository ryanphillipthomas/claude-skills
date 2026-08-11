import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Frame, Locator, Page } from 'playwright';
import { UiAtlasError, type ElementProbe } from '@ui-atlas/protocol';
import { probeWithInstalledProbe } from './page-scripts.js';

export const PROBE_GLOBAL = '__uiAtlasProbe';

export function probeBundlePath(): string {
  return fileURLToPath(new URL('../../dist/probe-bundle.js', import.meta.url));
}

export async function loadProbeBundle(): Promise<string> {
  const path = probeBundlePath();
  if (!existsSync(path)) {
    throw new UiAtlasError(
      'internal',
      'the element probe bundle is missing; run `npm run build:overlay`',
      { detail: { expectedPath: path } },
    );
  }
  return readFile(path, 'utf8');
}

/**
 * Describe the first element a locator matches, using exactly the same probe the
 * inspector uses, so a clicked capture, a selector-driven capture and a
 * recipe-driven capture all produce identical identity data.
 *
 * `label` names the locator in the error when nothing matches; a Playwright
 * locator has no stable string form worth putting in front of a user.
 */
export async function probeLocator(
  locator: Locator,
  label: string,
  timeoutMs = 10_000,
): Promise<ElementProbe> {
  const count = await locator.count();
  if (count === 0) {
    throw new UiAtlasError('locator.not-found', `matched nothing: ${label}`, {
      detail: { locator: label },
    });
  }
  return locator.first().evaluate(probeWithInstalledProbe, undefined, { timeout: timeoutMs });
}

export async function probeSelector(
  root: Page | Frame,
  selector: string,
  timeoutMs = 10_000,
): Promise<ElementProbe> {
  return probeLocator(root.locator(selector), selector, timeoutMs);
}
