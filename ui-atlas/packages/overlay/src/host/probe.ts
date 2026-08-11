import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Frame, Page } from 'playwright';
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
 * Describe the first element matching `selector`, using exactly the same probe
 * the inspector uses, so a selector-driven capture and a clicked capture
 * produce identical identity data.
 */
export async function probeSelector(
  root: Page | Frame,
  selector: string,
  timeoutMs = 10_000,
): Promise<ElementProbe> {
  const locator = root.locator(selector);
  const count = await locator.count();
  if (count === 0) {
    throw new UiAtlasError('locator.not-found', `selector matched nothing: ${selector}`, {
      detail: { selector },
    });
  }
  return locator.first().evaluate(probeWithInstalledProbe, undefined, { timeout: timeoutMs });
}
