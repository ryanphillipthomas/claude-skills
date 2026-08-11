import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCaptures } from '@ui-atlas/artifacts';
import { startHarness, type TestHarness } from '../support/harness.js';

/**
 * The state chips have to *do* something on screen. Selecting "hover" and
 * seeing nothing change was the single most confusing thing the panel did.
 */
let harness: TestHarness;

beforeEach(async () => {
  harness = await startHarness({ overlay: true });
  await harness.session.navigate(harness.url('/states.html'));
  await harness.session.overlay.waitForMount();
});

afterEach(async () => {
  await harness.dispose();
});

async function selectFocusDemo(): Promise<void> {
  const page = harness.session.page;
  await page.keyboard.press('Alt+KeyI');
  const box = await page.locator('[data-testid="focus-demo"]').boundingBox();
  if (box === null) throw new Error('no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect
    .poll(() => harness.session.selectedIdentity?.chosenLocator.value, { timeout: 5_000 })
    .toBe('focus-demo');
  await page.keyboard.press('Escape');
  // Selecting by click leaves the pointer on the element, which is itself a
  // hover. Park it elsewhere so "before" readings are the real default.
  await page.mouse.move(2, 2);
}

function backgroundOf(selector: string): Promise<string> {
  return harness.session.page.evaluate((css) => {
    const node = document.querySelector(css);
    return node === null ? '' : getComputedStyle(node).backgroundColor;
  }, selector);
}

describe('live state preview', () => {
  it('applies a state to the live page and holds it there', async () => {
    await selectFocusDemo();
    const before = await backgroundOf('[data-testid="focus-demo"]');

    const result = await harness.session.previewState('hover');
    expect(result.applied).toBe('hover');
    expect(result.provenance).toBe('interacted');

    // The page really changed, and it stays changed.
    const during = await backgroundOf('[data-testid="focus-demo"]');
    expect(during).not.toBe(before);
    await harness.session.page.waitForTimeout(300);
    expect(await backgroundOf('[data-testid="focus-demo"]')).toBe(during);
    expect(harness.session.previewedState).toBe('hover');
  });

  it('puts the page back when the preview is released', async () => {
    await selectFocusDemo();
    const before = await backgroundOf('[data-testid="focus-demo"]');

    await harness.session.previewState('hover');
    expect(await backgroundOf('[data-testid="focus-demo"]')).not.toBe(before);

    await harness.session.previewState(null);
    expect(harness.session.previewedState).toBeUndefined();
    expect(await backgroundOf('[data-testid="focus-demo"]')).toBe(before);
  });

  it('swaps cleanly from one state to another', async () => {
    await selectFocusDemo();
    await harness.session.previewState('hover');
    await harness.session.previewState('focus');

    expect(harness.session.previewedState).toBe('focus');
    const focused = await harness.session.page.evaluate(
      () => document.activeElement === document.querySelector('[data-testid="focus-demo"]'),
    );
    expect(focused).toBe(true);
  });

  it('undoes a forced state when released, leaving no residue', async () => {
    const page = harness.session.page;
    await page.keyboard.press('Alt+KeyI');
    const box = await page.locator('[data-testid="checkbox-unchecked"]').boundingBox();
    if (box === null) throw new Error('no box');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect
      .poll(() => harness.session.selectedIdentity?.chosenLocator.value, { timeout: 5_000 })
      .toBe('checkbox-unchecked');
    await page.keyboard.press('Escape');

    const result = await harness.session.previewState('checked');
    expect(result.applied).toBe('checked');
    expect(result.provenance).toBe('forced');
    expect(result.notice).toContain('synthesised');
    expect(await page.locator('[data-testid="checkbox-unchecked"]').isChecked()).toBe(true);

    await harness.session.previewState(null);
    expect(await page.locator('[data-testid="checkbox-unchecked"]').isChecked()).toBe(false);
  });

  it('declines to hold a state that would take the mouse away from the user', async () => {
    await selectFocusDemo();
    const result = await harness.session.previewState('active');
    expect(result.applied).toBeNull();
    expect(result.notice).toContain('mouse button held down');
    expect(harness.session.previewedState).toBeUndefined();
  });

  it('refuses to preview with nothing selected', async () => {
    await expect(harness.session.previewState('hover')).rejects.toThrow(/select an element/);
  });

  it('releases the preview when the selection changes', async () => {
    await selectFocusDemo();
    await harness.session.previewState('hover');
    const hoverBackground = await backgroundOf('[data-testid="focus-demo"]');

    const page = harness.session.page;
    await page.keyboard.press('Alt+KeyI');
    const box = await page.locator('[data-testid="press-target"]').boundingBox();
    if (box === null) throw new Error('no box');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect
      .poll(() => harness.session.selectedIdentity?.chosenLocator.value, { timeout: 5_000 })
      .toBe('press-target');

    expect(harness.session.previewedState).toBeUndefined();
    expect(await backgroundOf('[data-testid="focus-demo"]')).not.toBe(hoverBackground);
  });

  it('does not contaminate a capture, and restores itself afterwards', async () => {
    await selectFocusDemo();
    await harness.session.previewState('hover');

    // Capture `default` while `hover` is being previewed. The default capture
    // must show the default state, not the previewed one.
    const page = harness.session.page;
    await page.getByRole('button', { name: 'Capture default', exact: true }).click();
    await expect.poll(() => harness.session.queue.list().length, { timeout: 5_000 }).toBe(1);
    await harness.session.queue.drain();

    const records = (await readCaptures(harness.session.writer.paths.capturesJsonl)).records;
    expect(records).toHaveLength(1);
    expect(records[0]?.state.name).toBe('default');
    expect(records[0]?.status).toBe('captured');

    // A separate hover capture must differ from the default one.
    const hover = await harness.session.captures.capture({
      kind: 'element',
      state: 'hover',
      identity: harness.session.selectedIdentity,
    });
    expect(hover.image?.sha256).not.toBe(records[0]?.image?.sha256);

    // And the preview came back after the queued capture finished.
    expect(harness.session.previewedState).toBe('hover');
  });

  it('drives the whole thing from the toolbar chips', async () => {
    await selectFocusDemo();
    const page = harness.session.page;
    const before = await backgroundOf('[data-testid="focus-demo"]');

    // Clicking the chip both adds the state to the capture set and shows it.
    await page.getByRole('button', { name: 'hover', exact: true }).click();
    await expect.poll(() => harness.session.previewedState, { timeout: 5_000 }).toBe('hover');
    expect(await backgroundOf('[data-testid="focus-demo"]')).not.toBe(before);

    // The capture button now says what it will actually do.
    expect(await page.getByRole('button', { name: 'Capture 2 states', exact: true }).count()).toBe(1);

    // Clicking it again removes the state and puts the page back.
    await page.getByRole('button', { name: 'hover', exact: true }).click();
    await expect.poll(() => harness.session.previewedState, { timeout: 5_000 }).toBeUndefined();
    expect(await backgroundOf('[data-testid="focus-demo"]')).toBe(before);
  });

  it('captures exactly the states the chips show, from one button', async () => {
    await selectFocusDemo();
    const page = harness.session.page;

    await page.getByRole('button', { name: 'hover', exact: true }).click();
    await page.getByRole('button', { name: 'focus', exact: true }).click();
    await page.getByRole('button', { name: 'Capture 3 states', exact: true }).click();
    await expect.poll(() => harness.session.queue.list().length, { timeout: 5_000 }).toBe(1);
    await harness.session.queue.drain();

    const records = (await readCaptures(harness.session.writer.paths.capturesJsonl)).records;
    expect(records.map((record) => record.state.name)).toEqual(['default', 'hover', 'focus']);
    expect(records.every((record) => record.status === 'captured')).toBe(true);
  });
});
