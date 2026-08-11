import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildElementIdentity, buildFramePath } from '@ui-atlas/identity';
import { probeSelector } from '@ui-atlas/overlay';
import type { StateName } from '@ui-atlas/protocol';
import { startHarness, type TestHarness } from '../support/harness.js';

/**
 * Phase 1 asks for the inspector to work on unrelated public sites, not just
 * the fixture. These checks are strictly read-only: they navigate, point at an
 * element, and photograph it. Nothing is clicked, submitted or mutated.
 *
 * They skip themselves when the network is unavailable (sandboxes, CI without
 * egress) rather than failing, and they tolerate the sites changing: the
 * assertion is about *our* behaviour, not about the sites' markup.
 */
const SITES = [
  { name: 'example.com', url: 'https://example.com/', selector: 'h1' },
  { name: 'wikipedia.org', url: 'https://www.wikipedia.org/', selector: 'h1' },
  { name: 'developer.mozilla.org', url: 'https://developer.mozilla.org/en-US/', selector: 'h1' },
] as const;

let online = false;

async function probeNetwork(): Promise<boolean> {
  const browser = await chromium.launch({ headless: true }).catch(() => null);
  if (browser === null) return false;
  try {
    const page = await browser.newPage();
    const response = await page.goto('https://example.com/', {
      timeout: 10_000,
      waitUntil: 'domcontentloaded',
    });
    return response !== null && response.ok();
  } catch {
    return false;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

beforeAll(async () => {
  online = await probeNetwork();
  if (!online) {
    process.stderr.write(
      '  ! external smoke tests skipped: no outbound browser network access in this environment\n',
    );
  }
}, 60_000);

let harness: TestHarness | undefined;

afterAll(async () => {
  await harness?.dispose();
});

describe('external site smoke (read-only)', () => {
  for (const site of SITES) {
    it(`captures default, hover and focus on ${site.name}`, async ({ skip }) => {
      if (!online) {
        skip();
        return;
      }

      harness = await startHarness({ overlay: true, config: { project: 'external' } });
      try {
        const page = await harness.session.navigate(site.url);
        expect(page.error).toBeUndefined();
        await harness.session.overlay.waitForMount();

        const before = await harness.session.page.evaluate(() => {
          const clone = document.body.cloneNode(true) as HTMLElement;
          for (const host of Array.from(clone.querySelectorAll('[data-ui-atlas-overlay]'))) host.remove();
          return clone.innerHTML.length;
        });

        const probe = await probeSelector(harness.session.page, site.selector);
        const identity = buildElementIdentity(
          probe,
          await buildFramePath(harness.session.page.mainFrame()),
        );

        for (const state of ['default', 'hover', 'focus'] as StateName[]) {
          const record = await harness.session.captures.capture({
            kind: 'element',
            state,
            identity,
          });
          // `focus` on a non-focusable heading is allowed to be unverified; what
          // matters is that we record it honestly and never crash.
          expect(['captured', 'skipped']).toContain(record.status);
          if (record.status === 'captured') {
            expect(record.image?.sha256).toMatch(/^[0-9a-f]{64}$/);
            expect(record.element?.chosenLocator.score).toBeGreaterThan(0);
          }
        }

        const after = await harness.session.page.evaluate(() => {
          const clone = document.body.cloneNode(true) as HTMLElement;
          for (const host of Array.from(clone.querySelectorAll('[data-ui-atlas-overlay]'))) host.remove();
          return clone.innerHTML.length;
        });
        // Live sites mutate themselves; only assert we did not wreck the page.
        expect(Math.abs(after - before)).toBeLessThan(before * 0.5 + 500);
      } finally {
        await harness.dispose();
        harness = undefined;
      }
    }, 120_000);
  }
});
