import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCaptures } from '@ui-atlas/artifacts';
import type { CaptureRecord } from '@ui-atlas/protocol';
import { startHarness, type TestHarness } from '../support/harness.js';

/**
 * The toolbar's Animation panel, driven through the real overlay in a real
 * browser — the last unbuilt thing in the brief's own list.
 */
let harness: TestHarness;

beforeEach(async () => {
  harness = await startHarness({ overlay: true });
});

afterEach(async () => {
  await harness.dispose();
});

async function openPanel(path = '/motion.html'): Promise<void> {
  await harness.session.navigate(harness.url(path));
  await harness.session.overlay.waitForMount();
  await harness.session.page.getByRole('button', { name: 'Animation…', exact: true }).click();
  // The list crosses the bridge, so wait for it rather than for a tick.
  await harness.session.page.locator('.ua-anims li').first().waitFor({ timeout: 10_000 });
}

/** Every listed animation, as the panel actually renders it. */
async function listed(): Promise<Array<{ title: string; reason: string; actions: string[] }>> {
  return harness.session.page.evaluate(() => {
    const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
    const items = Array.from(shadow?.querySelectorAll('.ua-anims li') ?? []);
    return items.map((item) => ({
      title: item.querySelector('.ua-anim__title')?.textContent ?? '',
      reason: item.querySelector('.ua-hint')?.textContent ?? '',
      actions: Array.from(item.querySelectorAll('button')).map(
        (control) => control.textContent ?? '',
      ),
    }));
  });
}

async function readRunCaptures(): Promise<CaptureRecord[]> {
  const result = await readCaptures(harness.session.writer.paths.capturesJsonl);
  expect(result.invalidLines).toHaveLength(0);
  return result.records;
}

describe('the toolbar animation panel', () => {
  it('is offered now that the session can do it', async () => {
    await harness.session.navigate(harness.url('/motion.html'));
    await harness.session.overlay.waitForMount();

    const control = harness.session.page.getByRole('button', { name: 'Animation…', exact: true });
    expect(await control.isDisabled()).toBe(false);
    expect(await control.getAttribute('title')).toContain('what moves on this page');
  });

  it('lists what moves, and gives each the action that would work', async () => {
    await openPanel();
    const items = await listed();
    expect(items.length).toBeGreaterThanOrEqual(3);

    // The finite `drift` can be sampled: a seek reproduces the frame.
    const finite = items.find((item) => item.title.includes('finite-swatch'));
    expect(finite?.actions).toEqual(['Sample']);

    // The infinite one cannot, and says so in the inventory's own words. It is
    // offered a recording instead, which is what a screencast is for.
    const infinite = items.find((item) => item.title.includes('infinite-swatch'));
    expect(infinite?.reason).toContain('repeats forever');
    expect(infinite?.actions).toEqual(['Record']);
  });

  it('never offers to sample something it cannot sample', async () => {
    await openPanel();
    const items = await listed();

    for (const item of items) {
      if (item.actions.includes('Sample')) continue;
      // No action without a reason: a row with neither would be a dead end.
      expect(item.reason.length).toBeGreaterThan(0);
    }

    // A scroll-driven animation is offered nothing at all — a recording of a
    // page that is not scrolling is a still, which is worse than an absence.
    const scrollDriven = items.find((item) => item.reason.includes('scrolling'));
    if (scrollDriven !== undefined) expect(scrollDriven.actions).toEqual([]);
  });

  it('reads the page and changes nothing', async () => {
    await openPanel();

    // Listing is a read. Nothing was paused, and nothing was captured.
    const playStates = await harness.session.page.evaluate(() =>
      document.getAnimations().map((animation) => animation.playState),
    );
    expect(playStates.length).toBeGreaterThan(0);
    expect(playStates.every((state) => state !== 'paused')).toBe(true);
    expect(harness.session.queue.list()).toEqual([]);
  });

  it('samples the animation you picked, and puts it back', async () => {
    await openPanel();
    await harness.session.page.locator('.ua-anims li', { hasText: 'finite-swatch' })
      .getByRole('button', { name: 'Sample', exact: true })
      .click();
    await expect.poll(() => harness.session.queue.list().length, { timeout: 5_000 }).toBe(1);
    await harness.session.queue.drain();

    const records = await readRunCaptures();
    expect(records.length).toBeGreaterThanOrEqual(3);
    expect(records.every((record) => record.kind === 'animation-frame')).toBe(true);
    expect(records.every((record) => record.status === 'captured')).toBe(true);
    // Every frame carries its provenance, exactly as the CLI's frames do.
    expect(records.every((record) => record.animation?.method === 'web-animations')).toBe(true);
    expect(records.every((record) => record.animation?.playState === 'paused')).toBe(true);
    expect(new Set(records.map((record) => record.set?.id)).size).toBe(1);

    // And the page is running again. Comparing play states either side would
    // not hold — sampling takes a couple of seconds, and the fixture's finite
    // 1200ms animation legitimately finishes in that time, on the page's own
    // clock. What restoration actually promises is that nothing is left held:
    // a failed restore leaves the sampled animation `paused`, and a cancelled
    // one that was never put back reads `idle`.
    const after = await harness.session.page.evaluate(() =>
      document.getAnimations().map((animation) => animation.playState),
    );
    expect(after.length).toBeGreaterThan(0);
    expect(after).not.toContain('paused');
    expect(after).not.toContain('idle');
  });

  it('records what cannot be sampled, and does not call it a sample', async () => {
    await openPanel();
    await harness.session.page.locator('.ua-anims li', { hasText: 'infinite-swatch' })
      .getByRole('button', { name: 'Record', exact: true })
      .click();
    await expect.poll(() => harness.session.queue.list().length, { timeout: 5_000 }).toBe(1);
    await harness.session.queue.drain();

    const records = await readRunCaptures();
    expect(records).toHaveLength(1);
    const record = records[0] as CaptureRecord;
    expect(record.kind).toBe('animation-video');
    expect(record.status).toBe('captured');
    expect(record.video?.byteLength).toBeGreaterThan(0);
    expect(record.video?.subjects.join(' ')).toContain('drift');
    // No progress, because there is no honest progress for something that
    // never ends.
    expect(record.animation).toBeUndefined();
    expect(record.video?.limitations.join(' ')).toContain('not a deterministic sample');
  }, 60_000);

  it('names the motion no animation list can see, and offers to record it', async () => {
    await harness.session.navigate(harness.url('/media.html'));
    await harness.session.overlay.waitForMount();
    await harness.session.page.getByRole('button', { name: 'Animation…', exact: true }).click();

    // media.html has canvas and video elements and no `Animation` at all.
    // "Nothing is animating" would be a lie of omission.
    const note = harness.session.page.locator('.ua-section', { hasText: 'no animation list can describe' });
    await note.first().waitFor({ timeout: 10_000 });
    expect(
      await harness.session.page.getByRole('button', { name: 'Record the page', exact: true }).isVisible(),
    ).toBe(true);
  });

  it('refuses honestly when the animation has gone', async () => {
    await openPanel();
    // Cancel everything the list was about, then ask for one of them.
    await harness.session.page.evaluate(() => {
      for (const animation of document.getAnimations()) animation.cancel();
    });

    await harness.session.page.locator('.ua-anims li', { hasText: 'finite-swatch' })
      .getByRole('button', { name: 'Sample', exact: true })
      .click();
    await expect.poll(() => harness.session.queue.list().length, { timeout: 5_000 }).toBe(1);
    await harness.session.queue.drain();

    // A job that failed for a stated reason, rather than a confident frame of
    // whatever happened to be at that index afterwards.
    const job = harness.session.queue.list()[0];
    expect(job?.status).toBe('failed');
    expect(job?.error?.message).toContain('no longer running');
  });

  it('offers the panel from the keyboard as well', async () => {
    await harness.session.navigate(harness.url('/motion.html'));
    await harness.session.overlay.waitForMount();
    await harness.session.page.keyboard.press('Alt+KeyA');
    await harness.session.page.locator('.ua-anims li').first().waitFor({ timeout: 10_000 });
    expect((await listed()).length).toBeGreaterThanOrEqual(3);
  });
});
