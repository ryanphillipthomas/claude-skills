import { writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCaptures, routeKeyFromUrl } from '@ui-atlas/artifacts';
import { buildElementIdentity, buildFramePath } from '@ui-atlas/identity';
import { probeSelector } from '@ui-atlas/overlay';
import type { ElementIdentity } from '@ui-atlas/protocol';
import { startHarness, type TestHarness } from '../support/harness.js';

/**
 * Fault injection: a failed capture must be recorded as a first-class row and
 * must never take the run down with it.
 */
let harness: TestHarness;

beforeEach(async () => {
  harness = await startHarness({ overlay: false });
});

afterEach(async () => {
  await harness.dispose();
});

async function identityFor(selector: string): Promise<ElementIdentity> {
  const probe = await probeSelector(harness.session.page, selector);
  return buildElementIdentity(probe, await buildFramePath(harness.session.page.mainFrame()));
}

describe('fault injection', () => {
  it('records a failed capture when the element has been detached', async () => {
    await harness.session.navigate(harness.url('/identity.html'));
    const identity = await identityFor('[data-testid="save-button"]');
    await harness.session.page.evaluate(() => document.querySelector('main')?.remove());

    const record = await harness.session.captures.capture({
      kind: 'element',
      state: 'default',
      identity,
    });
    expect(record.status).toBe('failed');
    expect(record.error?.code).toBe('locator.not-found');
    expect(record.image).toBeUndefined();
    expect(record.element).toBeDefined();

    // The run keeps going and the failure is queryable.
    const next = await harness.session.captures.capture({ kind: 'viewport', state: 'default' });
    expect(next.status).toBe('captured');

    const stored = await readCaptures(harness.session.writer.paths.capturesJsonl);
    expect(stored.records.map((item) => item.status)).toEqual(['failed', 'captured']);
  });

  it('records a failed capture when the page navigates mid-capture', async () => {
    // Short budgets: this test is about the failure path, not about waiting.
    const quick = await startHarness({
      overlay: false,
      config: {
        settle: { totalTimeoutMs: 2_000, mutationQuietMs: 100, geometryQuietMs: 60 },
        capture: { screenshotTimeoutMs: 2_000 },
      },
    });
    try {
      await quick.session.navigate(quick.url('/identity.html'));
      const probe = await probeSelector(quick.session.page, '[data-testid="save-button"]');
      const identity = buildElementIdentity(probe, await buildFramePath(quick.session.page.mainFrame()));

      const capturePromise = quick.session.captures.capture({
        kind: 'element',
        state: 'hover',
        identity,
      });
      // Navigate away while the capture is settling.
      void quick.session.page.goto(quick.url('/states.html')).catch(() => undefined);

      const record = await capturePromise;
      // Either outcome is acceptable; what matters is that it is recorded
      // rather than thrown, and that the error is classified.
      expect(['failed', 'captured']).toContain(record.status);
      if (record.status === 'failed') {
        expect(record.error).toBeDefined();
        expect(record.error?.code).not.toBe('internal');
      }
    } finally {
      await quick.dispose();
    }
  });

  it('records a structured write failure instead of throwing', async () => {
    await harness.session.navigate(harness.url('/index.html'));

    // Put a file exactly where the screenshot directory for this route needs
    // to be, so the atomic write cannot create its directory.
    const path = harness.session.writer.screenshotPath({
      routeKey: routeKeyFromUrl(harness.session.page.url()),
      viewportLabel: harness.session.currentViewport.name ?? 'base',
      captureId: 'blocked',
    });
    const blockedDir = dirname(dirname(path));
    await rm(blockedDir, { recursive: true, force: true });
    await writeFile(blockedDir, 'not a directory');

    const record = await harness.session.captures.capture({ kind: 'viewport', state: 'default' });
    expect(record.status).toBe('failed');
    expect(record.error?.code).toBe('artifact.write-failed');

    await rm(blockedDir, { force: true });
  });

  it('records a failed capture when the browser has gone away', async () => {
    await harness.session.navigate(harness.url('/index.html'));
    await harness.session.page.close();

    const record = await harness.session.captures.capture({ kind: 'viewport', state: 'default' });
    expect(record.status).toBe('failed');
    expect(record.error).toBeDefined();
  });

  it('never clicks a destructive control while capturing its states', async () => {
    await harness.session.navigate(harness.url('/destructive.html'));

    for (const selector of ['[data-testid="delete-account"]', '[data-testid="place-order"]', '[data-testid="submit-form"]']) {
      const identity = await identityFor(selector);
      for (const state of ['default', 'hover', 'focus', 'active'] as const) {
        const record = await harness.session.captures.capture({ kind: 'element', state, identity });
        expect(record.status).toBe('captured');
      }
    }

    const log = await harness.session.page.evaluate(
      () => (window as unknown as { __uiAtlasDestructiveLog: string[] }).__uiAtlasDestructiveLog,
    );
    expect(log).toEqual([]);
    expect(harness.session.page.url()).toBe(harness.url('/destructive.html'));
  });

  it('keeps a full-page capture bounded on a very tall document', async () => {
    await harness.session.navigate(harness.url('/index.html'));
    await harness.session.page.evaluate(() => {
      const filler = document.createElement('div');
      filler.style.height = '60000px';
      filler.style.background = 'linear-gradient(#fff, #000)';
      document.body.append(filler);
    });

    const capped = await startHarness({
      overlay: false,
      config: { capture: { fullPageMaxHeightPx: 2_000, screenshotTimeoutMs: 20_000 } },
    });
    try {
      await capped.session.navigate(capped.url('/index.html'));
      await capped.session.page.evaluate(() => {
        const filler = document.createElement('div');
        filler.style.height = '60000px';
        document.body.append(filler);
      });
      const record = await capped.session.captures.capture({ kind: 'full-page', state: 'default' });
      expect(record.status).toBe('captured');
      expect(record.image?.height).toBeLessThanOrEqual(2_000);
      expect(record.warnings.some((warning) => warning.includes('truncated'))).toBe(true);
    } finally {
      await capped.dispose();
    }
  });
});
