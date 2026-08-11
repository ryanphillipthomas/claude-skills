import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCaptures } from '@ui-atlas/artifacts';
import { buildElementIdentity, buildFramePath } from '@ui-atlas/identity';
import { probeSelector } from '@ui-atlas/overlay';
import type { CaptureRecord, ElementIdentity } from '@ui-atlas/protocol';
import { startHarness, type TestHarness } from '../support/harness.js';

/**
 * Phase 2, first slice: a component produces a five-viewport matrix, including
 * honest hidden and not-present outcomes.
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

function byViewport(records: CaptureRecord[]): Map<string, CaptureRecord> {
  return new Map(records.map((record) => [record.set?.member ?? '?', record]));
}

describe('responsive replay', () => {
  beforeEach(async () => {
    await harness.session.navigate(harness.url('/responsive.html'));
  });

  it('captures one viewport per configured preset, grouped as one set', async () => {
    const result = await harness.session.runResponsive({ kind: 'viewport', states: ['default'] });

    expect(result.records).toHaveLength(5);
    expect(result.records.every((record) => record.status === 'captured')).toBe(true);

    const members = result.records.map((record) => record.set?.member);
    expect(members).toEqual(['mobile-sm', 'mobile-lg', 'tablet', 'laptop', 'desktop']);

    const setIds = new Set(result.records.map((record) => record.set?.id));
    expect(setIds.size).toBe(1);
    expect(result.records.every((record) => record.set?.kind === 'responsive')).toBe(true);

    // Records reach the run exactly like any other capture.
    const stored = await readCaptures(harness.session.writer.paths.capturesJsonl);
    expect(stored.invalidLines).toHaveLength(0);
    expect(stored.records).toHaveLength(5);
  });

  it('emulates mobile rather than just narrowing the window', async () => {
    const result = await harness.session.runResponsive({ kind: 'viewport', states: ['default'] });
    const records = byViewport(result.records);

    const mobile = records.get('mobile-sm');
    expect(mobile?.viewport).toMatchObject({
      width: 375,
      height: 812,
      mobile: true,
      hasTouch: true,
      userAgentClass: 'mobile',
      deviceScaleFactor: 3,
    });
    // A device scale factor of 3 must show up in the real pixels.
    expect(mobile?.image?.width).toBe(375 * 3);

    const laptop = records.get('laptop');
    expect(laptop?.viewport).toMatchObject({
      width: 1280,
      mobile: false,
      hasTouch: false,
      userAgentClass: 'desktop',
      deviceScaleFactor: 1,
    });
    expect(laptop?.image?.width).toBe(1280);
  });

  it('reloads per viewport so load-time-only responsive JavaScript re-runs', async () => {
    // The fixture writes its layout mode once, at load, and never updates it on
    // resize. Photographing that readout at each viewport is a direct test of
    // whether the route was really reloaded: an implementation that merely
    // resized one page would show the same mode everywhere.
    const identity = await identityFor('[data-testid="initial-mode"]');
    const originalUrl = harness.session.page.url();

    const result = await harness.session.runResponsive({
      kind: 'element',
      states: ['default'],
      identity,
    });
    const records = byViewport(result.records);
    expect(result.records.every((record) => record.status === 'captured')).toBe(true);

    // Compare only the presets that share a device scale factor, so any
    // difference is the readout and not the pixel density.
    const tablet = records.get('tablet')?.image;
    const laptop = records.get('laptop')?.image;
    const desktop = records.get('desktop')?.image;
    expect(tablet && laptop && desktop).toBeTruthy();
    if (tablet === undefined || laptop === undefined || desktop === undefined) return;

    // 768 loads as "medium"; 1280 and 1440 both load as "wide".
    expect(laptop.sha256).toBe(desktop.sha256);
    expect(tablet.sha256).not.toBe(laptop.sha256);

    // The session's own page was never navigated or resized.
    expect(harness.session.page.url()).toBe(originalUrl);
    expect(harness.session.currentViewport.width).toBe(1440);
    expect(await harness.session.page.locator('[data-testid="initial-mode"]').textContent()).toBe('wide');
  });

  it('records hidden and present outcomes per viewport for a mobile-only element', async () => {
    const identity = await identityFor('[data-testid="mobile-only"]');
    const result = await harness.session.runResponsive({ kind: 'element', states: ['default'], identity });
    const records = byViewport(result.records);

    // Visible under 600px, display:none at and above it. Both are results.
    for (const name of ['mobile-sm', 'mobile-lg']) {
      const record = records.get(name);
      expect(record?.status, name).toBe('captured');
      expect(record?.image?.width ?? 0).toBeGreaterThan(0);
    }
    for (const name of ['tablet', 'laptop', 'desktop']) {
      const record = records.get(name);
      expect(record?.status, name).toBe('skipped');
      expect(record?.error?.code, name).toBe('locator.hidden');
      expect(record?.image, name).toBeUndefined();
      // The identity is still on the record, so the report can show the gap.
      expect(record?.element?.chosenLocator.value, name).toBe('mobile-only');
    }

    // Nothing failed: a hidden component is not a broken run.
    expect(result.records.some((record) => record.status === 'failed')).toBe(false);
  });

  it('records the inverse outcomes for a desktop-only element', async () => {
    const identity = await identityFor('[data-testid="desktop-only"]');
    const result = await harness.session.runResponsive({ kind: 'element', states: ['default'], identity });
    const records = byViewport(result.records);

    expect(records.get('mobile-sm')?.status).toBe('skipped');
    expect(records.get('mobile-sm')?.error?.code).toBe('locator.hidden');
    expect(records.get('desktop')?.status).toBe('captured');
  });

  it('records not-present when the element does not exist at all', async () => {
    const identity = await identityFor('[data-testid="panel-two"]');
    await harness.session.page.evaluate(() => undefined);

    // Point the identity at something the page never contains.
    const missing: ElementIdentity = {
      ...identity,
      chosenLocator: { ...identity.chosenLocator, value: 'panel-does-not-exist' },
      locatorCandidates: [{ ...identity.chosenLocator, value: 'panel-does-not-exist' }],
    };

    const result = await harness.session.runResponsive({
      kind: 'element',
      states: ['default'],
      identity: missing,
    });

    expect(result.records).toHaveLength(5);
    expect(result.records.every((record) => record.status === 'skipped')).toBe(true);
    expect(result.records.every((record) => record.error?.code === 'locator.not-found')).toBe(true);
    expect(result.records.some((record) => record.status === 'failed')).toBe(false);
  });

  it('captures a state set at every viewport', async () => {
    const identity = await identityFor('[data-testid="panel-one"]');
    const result = await harness.session.runResponsive({
      kind: 'element',
      states: ['default', 'hover'],
      identity,
    });

    expect(result.records).toHaveLength(10);
    const perViewport = new Map<string, string[]>();
    for (const record of result.records) {
      const member = record.set?.member ?? '?';
      perViewport.set(member, [...(perViewport.get(member) ?? []), record.state.name]);
    }
    expect([...perViewport.values()].every((states) => states.join(',') === 'default,hover')).toBe(true);
    expect(result.records.every((record) => record.status === 'captured')).toBe(true);
  });

  it('runs through the inspector queue when the toolbar asks for a set', async () => {
    const inspector = await startHarness({ overlay: true });
    try {
      await inspector.session.navigate(inspector.url('/responsive.html'));
      await inspector.session.overlay.waitForMount();

      // The capability is on, so the toolbar's control is enabled.
      expect(inspector.session.describeSession().capabilities.responsive).toBe(true);

      const page = inspector.session.page;
      await page.getByRole('button', { name: 'Responsive set', exact: true }).click();
      await expect.poll(() => inspector.session.queue.list().length, { timeout: 5_000 }).toBe(1);
      await inspector.session.queue.drain();

      const job = inspector.session.queue.list()[0];
      expect(job?.status).toBe('done');
      expect(job?.captureIds).toHaveLength(5);

      const stored = await readCaptures(inspector.session.writer.paths.capturesJsonl);
      expect(stored.records).toHaveLength(5);
      expect(stored.records.every((record) => record.set?.kind === 'responsive')).toBe(true);
    } finally {
      await inspector.dispose();
    }
  });
});
