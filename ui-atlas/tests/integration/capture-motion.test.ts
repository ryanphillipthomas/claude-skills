import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startHarness, type TestHarness } from '../support/harness.js';

/**
 * The unit tests prove the state machine walks the right sequence. These prove
 * the panel is actually wired to it: that a real capture moves the hairline,
 * changes the footer control, adds a row and says so out loud.
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

/** Read something out of the panel's shadow root. */
function panel<T>(read: (root: ShadowRoot) => T): Promise<T> {
  return harness.session.page.evaluate((source) => {
    const host = document.querySelector('[data-ui-atlas-overlay]');
    const root = host?.shadowRoot;
    if (root === null || root === undefined) throw new Error('overlay is not mounted');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    return (new Function(`return (${source})`)() as (r: ShadowRoot) => unknown)(root) as never;
  }, read.toString());
}

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
  await page.mouse.move(2, 2);
}

describe('capture progress, in the panel', () => {
  it('is at rest before anything is captured', async () => {
    expect(await panel((root) => root.querySelector('.ua-progress')?.hasAttribute('hidden'))).toBe(
      true,
    );
    expect(
      await panel((root) =>
        root.querySelector('.ua-btn--capture')?.getAttribute('data-phase'),
      ),
    ).toBe('idle');
  });

  it('moves the hairline, the control and the list from real queue events', async () => {
    await selectFocusDemo();
    const page = harness.session.page;

    await page.getByRole('button', { name: 'hover', exact: true }).click();
    await page.getByRole('button', { name: 'Capture 2 states', exact: true }).click();

    // The control turns over on the press, not a round trip later.
    await expect
      .poll(
        () => panel((root) => root.querySelector('.ua-btn--capture')?.getAttribute('data-phase')),
        { timeout: 5_000 },
      )
      .toBe('capturing');
    expect(await panel((root) => root.querySelector('.ua-progress')?.hasAttribute('hidden'))).toBe(
      false,
    );

    await harness.session.queue.drain();

    // Finished: the hairline is full, the control says what it got, and the
    // list has a row carrying a drawn checkmark.
    await expect
      .poll(
        () => panel((root) => root.querySelector('.ua-btn--capture')?.getAttribute('data-phase')),
        { timeout: 5_000 },
      )
      .toBe('complete');
    expect(
      await panel((root) => root.querySelector('.ua-btn--capture')?.textContent),
    ).toContain('2 shots captured');
    expect(
      await panel((root) =>
        (root.querySelector('.ua-progress__fill') as HTMLElement | null)?.style.transform,
      ),
    ).toBe('scaleX(1)');

    // Said out loud, not only shown.
    expect(await panel((root) => root.querySelector('.ua-live')?.textContent)).toBe(
      '2 shots captured',
    );

    // The captured list is on screen the whole time — there is no tab to switch
    // to, which is the point: a row cannot land somewhere you are not looking.
    expect(await panel((root) => root.querySelectorAll('.ua-shot__ring .ua-ring__tick').length))
      .toBeGreaterThan(0);
    expect(await panel((root) => root.querySelector('.ua-count')?.textContent)).toBe('2 files');

    // And it is never a dead end: the control comes back to Ready on its own.
    await expect
      .poll(
        () => panel((root) => root.querySelector('.ua-btn--capture')?.getAttribute('data-phase')),
        { timeout: 5_000 },
      )
      .toBe('idle');
    expect(await panel((root) => root.querySelector('.ua-progress')?.hasAttribute('hidden'))).toBe(
      true,
    );
  });

  it('carries a real thumbnail of the shot into the row', async () => {
    await selectFocusDemo();
    const page = harness.session.page;

    await page.getByRole('button', { name: 'Capture default', exact: true }).click();
    // The press is a bridge round trip; the job exists a moment after the click.
    await expect.poll(() => harness.session.queue.list().length, { timeout: 5_000 }).toBe(1);
    await harness.session.queue.drain();

    // The host made a preview out of the bytes it actually wrote.
    const job = harness.session.queue.list().at(-1);
    expect(job?.status).toBe('done');
    expect(job?.thumbnail).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u);

    // And the panel drew it, inline — never as a request from the site.
    const src = await panel(
      (root) => (root.querySelector('.ua-shot__image') as HTMLImageElement | null)?.getAttribute('src') ?? '',
    );
    expect(src.startsWith('data:image/png;base64,')).toBe(true);

    // The captured row names the file the way it is named on disk.
    expect(await panel((root) => root.querySelector('.ua-shot__name')?.textContent)).toBe(
      job?.fileNames[0],
    );
  });

  it('stops the shots that have not been taken, and keeps the ones that have', async () => {
    await selectFocusDemo();
    const page = harness.session.page;

    // Three states in one job: the case where stopping has to reach inside it.
    await page.getByRole('button', { name: 'hover', exact: true }).click();
    await page.getByRole('button', { name: 'focus', exact: true }).click();
    await page.getByRole('button', { name: 'Capture 3 states', exact: true }).click();

    // Stop appears only while there is something it could stop.
    const stop = page.getByRole('button', { name: 'Stop', exact: true });
    await expect.poll(() => stop.isVisible(), { timeout: 5_000 }).toBe(true);
    await stop.click();
    await harness.session.queue.drain();

    const job = harness.session.queue.list().at(-1);
    expect(job?.status).toBe('done');
    // It kept what it had already written and skipped the rest.
    expect(job?.captureIds.length).toBeLessThan(3);
    expect(job?.warnings.join(' ')).toContain('stopped after');

    // It stopped at a boundary, so the chip preview the user had asked for is
    // back on the page rather than whatever the capture was mid-way through.
    expect(harness.session.previewedState).toBe('focus');
    await expect.poll(() => stop.isVisible(), { timeout: 5_000 }).toBe(false);
  });

  it('draws the shutter inside its own overlay, never in the page', async () => {
    await selectFocusDemo();
    const page = harness.session.page;

    // The shutter is part of the inspector, which is hidden for every capture.
    const before = await page.evaluate(
      () => document.querySelector('[data-testid="focus-demo"]')?.getAttribute('style') ?? null,
    );
    await page.getByRole('button', { name: 'Capture default', exact: true }).click();
    await harness.session.queue.drain();

    expect(
      await page.evaluate(
        () => document.querySelector('[data-testid="focus-demo"]')?.getAttribute('style') ?? null,
      ),
    ).toBe(before);
    // The shutter lives in the overlay's own layer and nowhere else.
    expect(await page.evaluate(() => document.querySelectorAll('.ua-shutter').length)).toBe(0);
    expect(await panel((root) => root.querySelectorAll('.ua-shutter').length)).toBe(1);
  });
});
