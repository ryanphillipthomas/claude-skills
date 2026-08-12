import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readCaptures } from '@ui-atlas/artifacts';
import type { CaptureRecord } from '@ui-atlas/protocol';
import { startHarness, type TestHarness } from '../support/harness.js';

/**
 * The guided flow and the readable filenames, driven through the real overlay
 * in a real browser: every control the keyboard could reach is now a button,
 * the panel says what to do next, and the files it writes are named after what
 * is in them.
 */
let harness: TestHarness;

beforeEach(async () => {
  harness = await startHarness({ overlay: true });
});

afterEach(async () => {
  await harness.dispose();
});

/** The flow line as the panel actually renders it. */
async function flowLine(): Promise<{ step: string; badge: string; text: string }> {
  return harness.session.page.evaluate(() => {
    const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
    const host = shadow?.querySelector('.ua-flow');
    return {
      step: host?.getAttribute('data-step') ?? '',
      badge: host?.querySelector('.ua-flow__step')?.textContent ?? '',
      text: host?.querySelector('.ua-flow__text')?.textContent ?? '',
    };
  });
}

async function selectMenuButton(): Promise<void> {
  const box = await harness.session.page.locator('[data-testid="menu-trigger"]').boundingBox();
  if (box === null) throw new Error('no box for the menu trigger');
  await harness.session.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await harness.session.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  // Selecting crosses the bridge, so wait for the host to have the element
  // rather than for a tick.
  await expect
    .poll(() => harness.session.selectedIdentity?.chosenLocator.value, { timeout: 10_000 })
    .toBe('menu-trigger');
}

/** Press the element capture button and wait for the run to have the files. */
async function captureSelection(): Promise<void> {
  await harness.session.page.getByRole('button', { name: /^Capture /u }).first().click();
  // The request crosses the bridge asynchronously; the job has to exist before
  // draining, or `drain` returns having waited for nothing.
  await expect.poll(() => harness.session.queue.list().length, { timeout: 10_000 }).toBe(1);
  await harness.session.queue.drain();
}

async function readRunCaptures(): Promise<CaptureRecord[]> {
  const result = await readCaptures(harness.session.writer.paths.capturesJsonl);
  expect(result.invalidLines).toHaveLength(0);
  return result.records;
}

describe('the guided flow', () => {
  it('opens on step 1 and asks for the one thing that has to happen first', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    const flow = await flowLine();
    expect(flow.step).toBe('inspect');
    expect(flow.badge).toBe('Step 1 of 5');
    expect(flow.text).toContain('Press Inspect');
  });

  it('moves to step 2 when inspect is on, and step 3 once something is selected', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    await harness.session.page.getByRole('button', { name: 'Inspect', exact: true }).click();
    expect((await flowLine()).step).toBe('select');
    expect((await flowLine()).badge).toBe('Step 2 of 5');

    await selectMenuButton();
    await harness.session.page.waitForFunction(() => {
      const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
      return shadow?.querySelector('.ua-flow')?.getAttribute('data-step') === 'capture';
    });
    expect((await flowLine()).text).toContain('press Capture');
  });

  it('shows the instructions, and marks the step the flow line is talking about', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    const steps = await harness.session.page.evaluate(() => {
      const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
      return Array.from(shadow?.querySelectorAll('.ua-steps__list li') ?? []).map((item) => ({
        text: item.textContent ?? '',
        current: item.className.includes('current'),
      }));
    });
    expect(steps).toHaveLength(5);
    expect(steps.map((step) => step.current)).toEqual([true, false, false, false, false]);
    expect(steps[0]?.text).toContain('never clicks the page');
  });

  it('hides and shows the instructions without losing the flow line', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    const toggle = harness.session.page.getByRole('button', { name: 'Hide', exact: true });
    await toggle.click();
    expect(
      await harness.session.page.evaluate(() => {
        const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
        return (shadow?.querySelector('.ua-steps') as HTMLElement | null)?.hidden ?? null;
      }),
    ).toBe(true);
    expect((await flowLine()).text).toContain('Press Inspect');

    await harness.session.page.getByRole('button', { name: 'Show', exact: true }).click();
    expect(
      await harness.session.page.evaluate(() => {
        const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
        return (shadow?.querySelector('.ua-steps') as HTMLElement | null)?.hidden ?? null;
      }),
    ).toBe(false);
  });

  it('offers tree navigation as buttons, disabled until there is a selection', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    const parent = harness.session.page.getByRole('button', { name: '↑ Parent', exact: true });
    expect(await parent.isDisabled()).toBe(true);

    await harness.session.page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await selectMenuButton();
    await parent.waitFor();
    expect(await parent.isDisabled()).toBe(false);

    // The button does what the arrow key did: widens the selection to the
    // element that contains this one.
    const before = await harness.session.page.evaluate(() => {
      const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
      return shadow?.querySelector('.ua-kv dd')?.textContent ?? '';
    });
    expect(before.toLowerCase()).toBe('button');

    await parent.click();
    await harness.session.page.waitForFunction(() => {
      const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
      return (shadow?.querySelector('.ua-kv dd')?.textContent ?? '').toLowerCase() !== 'button';
    });
  });

  it('counts what has been captured here and sends you to review', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    await harness.session.page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await selectMenuButton();
    await captureSelection();

    await harness.session.page.waitForFunction(() => {
      const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
      return shadow?.querySelector('.ua-flow')?.getAttribute('data-step') === 'review';
    });
    const flow = await flowLine();
    expect(flow.badge).toBe('Step 4 of 5');
    expect(flow.text).toContain('on /states.html');
    expect(flow.text).toContain('Output section');
  });
});

describe('the Output section', () => {
  async function captureOne(): Promise<void> {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();
    await harness.session.page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await selectMenuButton();
    await captureSelection();
  }

  /** The file rows as the panel actually renders them. */
  async function files(): Promise<Array<{ name: string; folder: string }>> {
    return harness.session.page.evaluate(() => {
      const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
      return Array.from(shadow?.querySelectorAll('.ua-files li') ?? []).map((item) => ({
        name: item.querySelector('.ua-file__name')?.textContent ?? '',
        folder: item.querySelector('.ua-hint')?.textContent ?? '',
      }));
    });
  }

  it('lists what was written, by the name it was written under', async () => {
    await captureOne();
    await harness.session.page
      .getByRole('button', { name: 'What have I captured?', exact: true })
      .click();
    await harness.session.page.locator('.ua-files li').first().waitFor({ timeout: 10_000 });

    const written = await files();
    expect(written[0]?.name).toBe('button--menu--default.png');
    expect(written[0]?.folder).toContain('screenshots/');
  });

  it('never shows an absolute path, which would leak the home directory', async () => {
    await captureOne();
    await harness.session.page
      .getByRole('button', { name: 'What have I captured?', exact: true })
      .click();
    await harness.session.page.locator('.ua-files li').first().waitFor({ timeout: 10_000 });

    // The panel lives in an open shadow root, so anything rendered here is
    // readable by the site. Names come from the site's own content; a path
    // would come from the user's machine.
    const text = await harness.session.page.evaluate(
      () => document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot?.textContent ?? '',
    );
    expect(text).not.toContain(harness.outputRoot);
    expect(text).not.toMatch(/(^|\s)\/(Users|home|tmp)\//);
  });

  it('opens the run folder, and only ever the run folder', async () => {
    await captureOne();
    await harness.session.page.getByRole('button', { name: 'Open folder', exact: true }).click();

    await expect.poll(() => harness.opened.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(harness.opened[0]).toBe(harness.session.writer.paths.runDir);
  });

  it('builds the report on demand and opens that instead', async () => {
    await captureOne();
    await harness.session.page.getByRole('button', { name: 'Open report', exact: true }).click();

    await expect.poll(() => harness.opened.length, { timeout: 20_000 }).toBeGreaterThan(0);
    expect(harness.opened[0]).toContain('report');
    expect(harness.opened[0]).toContain(harness.session.writer.paths.runDir);
  });

  it('reaches the last step once the output has been looked at', async () => {
    await captureOne();
    await harness.session.page
      .getByRole('button', { name: 'What have I captured?', exact: true })
      .click();

    await harness.session.page.waitForFunction(() => {
      const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
      return shadow?.querySelector('.ua-flow')?.getAttribute('data-step') === 'finish';
    });
    const flow = await flowLine();
    expect(flow.badge).toBe('Step 5 of 5');
    expect(flow.text).toContain('Open folder');
  });
});

describe('capture filenames', () => {
  it('names an element capture after its role, name and state', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    await harness.session.page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await selectMenuButton();
    await captureSelection();

    const records = await readRunCaptures();
    const captured = records.filter((record) => record.status === 'captured');
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]?.image?.relativePath).toMatch(/\/button--menu--default\.png$/);
  });

  it('writes a sidecar beside the image, under the same name', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    await harness.session.page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await selectMenuButton();
    await captureSelection();

    const [record] = (await readRunCaptures()).filter((item) => item.status === 'captured');
    const image = record?.image?.relativePath;
    if (image === undefined) throw new Error('expected a captured image');

    const sidecar = join(harness.session.writer.paths.runDir, image.replace(/\.png$/, '.json'));
    const parsed = JSON.parse(await readFile(sidecar, 'utf8')) as CaptureRecord;
    expect(parsed.id).toBe(record?.id);
  });

  it('writes an index describing every file it wrote', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    await harness.session.page.getByRole('button', { name: 'Inspect', exact: true }).click();
    await selectMenuButton();
    await captureSelection();
    await harness.session.writer.writeIndexes();

    const index = await readFile(join(harness.session.writer.paths.runDir, 'index.md'), 'utf8');
    expect(index).toContain('button--menu--default.png');
    expect(index).toContain('<button> “Menu”');
    expect(index).toContain('does **not** update `captures.jsonl`');
  });
});
