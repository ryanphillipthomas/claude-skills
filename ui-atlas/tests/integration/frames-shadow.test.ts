import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildElementIdentity, buildFramePath, resolveElement } from '@ui-atlas/identity';
import { probeSelector } from '@ui-atlas/overlay';
import { startFixtureServer, startHarness, type FixtureServer, type TestHarness } from '../support/harness.js';

let harness: TestHarness;
let secondOrigin: FixtureServer;

beforeEach(async () => {
  harness = await startHarness({ overlay: true });
  // A second listener on another port is a different origin to the browser.
  secondOrigin = await startFixtureServer();
});

afterEach(async () => {
  await secondOrigin.close();
  await harness.dispose();
});

describe('iframes', () => {
  it('captures an element inside a same-origin iframe with its frame path', async () => {
    await harness.session.navigate(harness.url('/frames.html'));
    const page = harness.session.page;

    const frame = page.frame({ name: 'same-origin' });
    expect(frame).not.toBeNull();
    if (frame === null) return;

    const probe = await probeSelector(frame, '[data-testid="frame-button"]');
    const identity = buildElementIdentity(probe, await buildFramePath(frame));

    expect(identity.framePath).toHaveLength(2);
    expect(identity.framePath[0]).toMatchObject({ depth: 0, crossOrigin: false });
    expect(identity.framePath[1]).toMatchObject({ depth: 1, crossOrigin: false, name: 'same-origin' });
    expect(identity.framePath[1]?.selectorInParent).toContain('iframe');

    const record = await harness.session.captures.capture({
      kind: 'element',
      state: 'default',
      identity,
      frame,
    });
    expect(record.status).toBe('captured');
    expect(record.image?.width).toBeGreaterThan(0);
    expect(record.element?.framePath).toHaveLength(2);
  });

  it('inspects and captures through a cross-origin frame locator', async () => {
    const url = `${harness.url('/frames.html')}?crossOrigin=${encodeURIComponent(secondOrigin.origin)}`;
    await harness.session.navigate(url);
    const page = harness.session.page;

    await page.waitForFunction(
      (origin) => {
        const frame = document.getElementById('cross-origin-frame') as HTMLIFrameElement | null;
        return frame?.src.startsWith(origin) === true;
      },
      secondOrigin.origin,
      { timeout: 10_000 },
    );

    // Top-page JavaScript cannot traverse into it...
    const reachableFromPage = await page.evaluate(() => {
      const frame = document.getElementById('cross-origin-frame') as HTMLIFrameElement | null;
      try {
        return frame?.contentDocument !== null && frame?.contentDocument !== undefined;
      } catch {
        return false;
      }
    });
    expect(reachableFromPage).toBe(false);

    // ...but the Playwright host inspects and captures through a frame locator.
    const frame = page.frame({ name: 'cross-origin' });
    expect(frame).not.toBeNull();
    if (frame === null) return;
    await frame.waitForSelector('[data-testid="frame-button"]', { timeout: 10_000 });

    const probe = await probeSelector(frame, '[data-testid="frame-button"]');
    const identity = buildElementIdentity(probe, await buildFramePath(frame));
    expect(identity.framePath[1]?.crossOrigin).toBe(true);

    const record = await harness.session.captures.capture({
      kind: 'element',
      state: 'hover',
      identity,
      frame,
    });
    expect(record.status).toBe('captured');
    expect(record.element?.framePath[1]?.crossOrigin).toBe(true);
  });
});

describe('shadow DOM', () => {
  it('selects and captures inside an open shadow root', async () => {
    await harness.session.navigate(harness.url('/shadow.html'));
    const page = harness.session.page;

    const probe = await probeSelector(page, '[data-testid="open-shadow-button"]');
    expect(probe.shadowHostPath.length).toBeGreaterThan(0);
    expect(probe.shadowHostPath[0]).toContain('open-card');
    expect(probe.closedShadowEncountered).toBe(false);

    const identity = buildElementIdentity(probe, await buildFramePath(page.mainFrame()));
    expect(identity.shadowHostPath?.[0]).toContain('open-card');

    // Playwright's engines pierce open shadow DOM, so re-resolution just works.
    const resolution = await resolveElement(page, identity);
    expect(resolution.matches).toBe(1);

    const record = await harness.session.captures.capture({
      kind: 'element',
      state: 'hover',
      identity,
    });
    expect(record.status).toBe('captured');
    expect(record.styleDelta?.changed['background-color']).toBeDefined();
  });

  it('selects an open shadow element by pointing at it', async () => {
    await harness.session.navigate(harness.url('/shadow.html'));
    await harness.session.overlay.waitForMount();
    const page = harness.session.page;

    await page.keyboard.press('Alt+KeyI');
    const box = await page.locator('[data-testid="open-shadow-button"]').boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    await expect
      .poll(() => harness.session.selectedIdentity?.tagName, { timeout: 5_000 })
      .toBe('button');
    expect(harness.session.selectedIdentity?.shadowHostPath?.[0]).toContain('open-card');
  });

  it('reports a closed shadow root as unsupported rather than guessing', async () => {
    await harness.session.navigate(harness.url('/shadow.html'));
    const page = harness.session.page;

    const probe = await probeSelector(page, '[data-testid="closed-card"]');
    expect(probe.closedShadowEncountered).toBe(true);

    // The host element itself can still be captured; its contents cannot be
    // inspected, and the flag is what tells the user so.
    const identity = buildElementIdentity(probe, await buildFramePath(page.mainFrame()));
    const record = await harness.session.captures.capture({
      kind: 'element',
      state: 'default',
      identity,
    });
    expect(record.status).toBe('captured');
  });
});
