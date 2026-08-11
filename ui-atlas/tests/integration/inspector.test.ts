import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCaptures, sha256 } from '@ui-atlas/artifacts';
import type { CaptureRecord } from '@ui-atlas/protocol';
import { startHarness, type TestHarness } from '../support/harness.js';

/**
 * Phase 1 exit criterion: select an element and capture default/hover/focus
 * images without the overlay appearing in the screenshots and without leaving
 * the page altered afterwards.
 */
let harness: TestHarness;

beforeEach(async () => {
  harness = await startHarness({ overlay: true });
});

afterEach(async () => {
  await harness.dispose();
});

interface OverlayDebugState {
  inspecting: boolean;
  hasSelection: boolean;
  jobs: number;
}

async function debugState(harness_: TestHarness): Promise<OverlayDebugState> {
  return harness_.session.page.evaluate(() => {
    const api = (window as unknown as { __uiAtlasOverlay?: { debugState(): OverlayDebugState } })
      .__uiAtlasOverlay;
    if (api === undefined) throw new Error('overlay is not mounted');
    return api.debugState();
  });
}

async function bodyWithoutOverlay(harness_: TestHarness): Promise<string> {
  return harness_.session.page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    for (const host of Array.from(clone.querySelectorAll('[data-ui-atlas-overlay]'))) host.remove();
    return clone.innerHTML;
  });
}

async function centreOf(harness_: TestHarness, selector: string): Promise<{ x: number; y: number }> {
  const box = await harness_.session.page.locator(selector).boundingBox();
  if (box === null) throw new Error(`no box for ${selector}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function readRunCaptures(harness_: TestHarness): Promise<CaptureRecord[]> {
  const result = await readCaptures(harness_.session.writer.paths.capturesJsonl);
  expect(result.invalidLines).toHaveLength(0);
  return result.records;
}

describe('injected inspector', () => {
  it('mounts a Shadow DOM overlay and reports its session', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    expect(await harness.session.overlay.waitForMount()).toBe(true);

    const page = harness.session.page;
    expect(await page.locator('[data-ui-atlas-overlay]').count()).toBe(1);

    // The overlay lives in a shadow root, not the page's light DOM.
    const shape = await page.evaluate(() => {
      const host = document.querySelector('[data-ui-atlas-overlay]');
      return {
        hasShadowRoot: host?.shadowRoot != null,
        lightChildren: host?.childElementCount ?? -1,
        pointerEvents: host === null ? '' : getComputedStyle(host).pointerEvents,
      };
    });
    expect(shape.hasShadowRoot).toBe(true);
    expect(shape.lightChildren).toBe(0);
    expect(shape.pointerEvents).toBe('none');

    // Playwright pierces open shadow DOM, so the toolbar is reachable by role.
    expect(await page.getByRole('button', { name: 'Inspect', exact: true }).isVisible()).toBe(true);
    expect(await page.getByText(`fixture/${harness.session.runId}`).isVisible()).toBe(true);
  });

  it('highlights on hover and selects on click without the page seeing the click', async () => {
    await harness.session.navigate(harness.url('/destructive.html'));
    await harness.session.overlay.waitForMount();
    const page = harness.session.page;

    await page.keyboard.press('Alt+KeyI');
    expect((await debugState(harness)).inspecting).toBe(true);

    const target = await centreOf(harness, '[data-testid="delete-account"]');
    await page.mouse.move(target.x, target.y);

    const hover = await page.evaluate(() => {
      const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
      const box = shadow?.querySelector('.ua-box--hover') as HTMLElement | null;
      const label = shadow?.querySelector('.ua-box-label') as HTMLElement | null;
      return { visible: box?.hidden === false, caption: label?.textContent ?? '' };
    });
    expect(hover.visible).toBe(true);
    expect(hover.caption).toContain('button');

    await page.mouse.click(target.x, target.y);

    // The destructive control must never fire while inspecting.
    const log = await page.evaluate(
      () => (window as unknown as { __uiAtlasDestructiveLog: string[] }).__uiAtlasDestructiveLog,
    );
    expect(log).toEqual([]);

    await expect
      .poll(async () => (await debugState(harness)).hasSelection, { timeout: 5_000 })
      .toBe(true);
    const identity = harness.session.selectedIdentity;
    expect(identity?.tagName).toBe('button');
    expect(identity?.role).toBe('button');
    expect(identity?.accessibleName).toBe('Delete account');
    expect(identity?.chosenLocator.type).toBe('test-id');
    expect(identity?.chosenLocator.value).toBe('delete-account');
    expect(identity?.structuralFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('leaves the page exactly as it found it when inspect mode ends', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();
    const page = harness.session.page;

    const before = await bodyWithoutOverlay(harness);
    await page.keyboard.press('Alt+KeyI');
    const target = await centreOf(harness, '[data-testid="focus-demo"]');
    await page.mouse.move(target.x, target.y);
    await page.mouse.click(target.x, target.y);
    await page.keyboard.press('Escape');

    expect((await debugState(harness)).inspecting).toBe(false);
    expect(await bodyWithoutOverlay(harness)).toBe(before);

    // Ordinary interaction works again: the page receives this click.
    await page.locator('[data-testid="checkbox-unchecked"]').click();
    expect(await page.locator('[data-testid="checkbox-unchecked"]').isChecked()).toBe(true);
  });

  it('captures default, hover and focus from the toolbar with no overlay in the artifacts', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();
    const page = harness.session.page;

    const beforeBody = await bodyWithoutOverlay(harness);

    await page.keyboard.press('Alt+KeyI');
    const target = await centreOf(harness, '[data-testid="focus-demo"]');
    await page.mouse.move(target.x, target.y);
    await page.mouse.click(target.x, target.y);
    await expect
      .poll(() => harness.session.selectedIdentity?.chosenLocator.value, { timeout: 5_000 })
      .toBe('focus-demo');
    await page.keyboard.press('Escape');

    // Turn on hover and focus alongside the default state, then run the set.
    await page.getByRole('button', { name: 'hover', exact: true }).click();
    await page.getByRole('button', { name: 'focus', exact: true }).click();
    await page.getByRole('button', { name: 'State set', exact: true }).click();
    // The request crosses the bridge asynchronously, so wait for the job to
    // exist before draining the queue.
    await expect.poll(() => harness.session.queue.list().length, { timeout: 5_000 }).toBe(1);
    await harness.session.queue.drain();

    const records = await readRunCaptures(harness);
    expect(records).toHaveLength(3);
    expect(records.map((record) => record.state.name)).toEqual(['default', 'hover', 'focus']);
    expect(records.every((record) => record.status === 'captured')).toBe(true);
    expect(records.every((record) => record.kind === 'element')).toBe(true);

    // Every record carries the metadata needed to revisit the component.
    for (const record of records) {
      expect(record.element?.chosenLocator.value).toBe('focus-demo');
      expect(record.element?.framePath[0]?.depth).toBe(0);
      expect(record.image?.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(record.readiness.checks.length).toBeGreaterThan(0);
      expect(record.interactionRecipe?.some((step) => step.action === 'capture')).toBe(true);
      expect(record.set?.kind).toBe('state');
    }

    // Provenance is honest: default is observed, hover and focus are interacted.
    expect(records[0]?.state.provenance).toBe('observed');
    expect(records[1]?.state).toMatchObject({ provenance: 'interacted', verified: true });
    expect(records[2]?.state).toMatchObject({ provenance: 'interacted', verified: true });

    // Hover really changed the rendering, and the delta says how.
    expect(records[1]?.styleDelta?.changed['background-color']).toBeDefined();

    // The three states produced three different images.
    const hashes = new Set(records.map((record) => record.image?.sha256));
    expect(hashes.size).toBe(3);

    // The page is unchanged and nothing is left hovered, focused or pressed.
    expect(await bodyWithoutOverlay(harness)).toBe(beforeBody);
    const residue = await page.evaluate(() => {
      const button = document.querySelector('[data-testid="focus-demo"]');
      return {
        focused: document.activeElement === button,
        hovered: button?.matches(':hover') ?? false,
        active: button?.matches(':active') ?? false,
      };
    });
    expect(residue).toEqual({ focused: false, hovered: false, active: false });
  });

  it('produces a viewport capture byte-identical to a session with no inspector at all', async () => {
    await harness.session.navigate(harness.url('/index.html'));
    await harness.session.overlay.waitForMount();
    const page = harness.session.page;

    await page.getByRole('button', { name: 'Viewport', exact: true }).click();
    await expect.poll(() => harness.session.queue.list().length, { timeout: 5_000 }).toBe(1);
    await harness.session.queue.drain();

    const records = await readRunCaptures(harness);
    const record = records.at(-1);
    expect(record?.status).toBe('captured');
    const relative = record?.image?.relativePath;
    expect(relative).toBeDefined();
    if (relative === undefined) return;
    const captured = await readFile(join(harness.session.writer.paths.runDir, relative));

    // The control comes from a second session where the overlay was never
    // injected. Comparing against *removing* the overlay in this page would be
    // unreliable: Chromium leaves a stale composited box-shadow layer behind
    // for a while after a large fixed layer is detached.
    const clean = await startHarness({ overlay: false });
    try {
      await clean.session.navigate(clean.url('/index.html'));
      const control = await clean.session.captures.capture({ kind: 'viewport', state: 'default' });
      const controlPath = control.image?.relativePath;
      expect(controlPath).toBeDefined();
      if (controlPath === undefined) return;
      const controlBytes = await readFile(join(clean.session.writer.paths.runDir, controlPath));
      expect(sha256(captured)).toBe(sha256(controlBytes));
    } finally {
      await clean.dispose();
    }
  });

  it('keeps the overlay when it is explicitly requested', async () => {
    await harness.session.navigate(harness.url('/index.html'));
    await harness.session.overlay.waitForMount();

    const withOverlay = await harness.session.captures.capture({
      kind: 'viewport',
      state: 'default',
      includeOverlay: true,
    });
    const withoutOverlay = await harness.session.captures.capture({
      kind: 'viewport',
      state: 'default',
    });

    expect(withOverlay.status).toBe('captured');
    expect(withoutOverlay.status).toBe('captured');
    expect(withOverlay.image?.sha256).not.toBe(withoutOverlay.image?.sha256);
  });

  it('moves the selection with the arrow keys', async () => {
    await harness.session.navigate(harness.url('/identity.html'));
    await harness.session.overlay.waitForMount();
    const page = harness.session.page;

    await page.keyboard.press('Alt+KeyI');
    const target = await centreOf(harness, '[data-testid="save-button"]');
    await page.mouse.click(target.x, target.y);
    await expect
      .poll(() => harness.session.selectedIdentity?.tagName, { timeout: 5_000 })
      .toBe('button');

    await page.keyboard.press('ArrowUp');
    await expect
      .poll(() => harness.session.selectedIdentity?.tagName, { timeout: 5_000 })
      .toBe('section');
  });

  it('notices when the selected element is detached by the app', async () => {
    await harness.session.navigate(harness.url('/spa.html'));
    await harness.session.overlay.waitForMount();
    const page = harness.session.page;

    await page.keyboard.press('Alt+KeyI');
    const target = await centreOf(harness, '[data-testid="view-action"]');
    await page.mouse.click(target.x, target.y);
    await expect
      .poll(async () => (await debugState(harness)).hasSelection, { timeout: 5_000 })
      .toBe(true);

    await page.keyboard.press('Escape');
    await page.locator('[data-testid="replace-dom"]').click();

    await expect.poll(async () => (await debugState(harness)).hasSelection, { timeout: 5_000 }).toBe(false);
  });

  it('survives hostile global CSS and high z-index overlays', async () => {
    await harness.session.navigate(harness.url('/hostile.html'));
    await harness.session.overlay.waitForMount();
    const page = harness.session.page;

    const style = await page.evaluate(() => {
      const host = document.querySelector('[data-ui-atlas-overlay]');
      const shadow = host?.shadowRoot;
      const panel = shadow?.querySelector('.ua-panel') as HTMLElement | null;
      if (host === null || panel == null) return null;
      const panelStyle = getComputedStyle(panel);
      return {
        hostZIndex: getComputedStyle(host).zIndex,
        panelFont: panelStyle.fontFamily,
        panelBackground: panelStyle.backgroundColor,
        panelRadius: panelStyle.borderTopLeftRadius,
      };
    });
    expect(style).not.toBeNull();
    // The page forces Comic Sans and square corners on everything; the shadow
    // root starts from `all: initial`, so the toolbar keeps its own styling.
    expect(style?.panelFont).not.toContain('Comic Sans');
    expect(style?.panelBackground).toBe('rgb(15, 23, 42)');
    expect(style?.panelRadius).toBe('10px');
    expect(Number(style?.hostZIndex)).toBeGreaterThan(2147483001);

    // The banner sits above the page but the inspector still selects through it.
    await page.keyboard.press('Alt+KeyI');
    const target = await centreOf(harness, '[data-testid="hostile-button"]');
    await page.mouse.click(target.x, target.y);
    await expect
      .poll(() => harness.session.selectedIdentity?.chosenLocator.value, { timeout: 5_000 })
      .toBe('hostile-button');
  });
});
