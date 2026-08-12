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

describe('the panel fits on screen', () => {
  it('stays inside the window, so the last section is reachable', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    const fit = await harness.session.page.evaluate(() => {
      const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
      const panel = shadow?.querySelector('.ua-panel') as HTMLElement | null;
      const rect = panel?.getBoundingClientRect();
      return {
        bottom: rect?.bottom ?? 0,
        windowHeight: window.innerHeight,
      };
    });
    expect(fit.bottom).toBeLessThanOrEqual(fit.windowHeight);
  });

  it('collapses the sections you visit occasionally, and keeps their headings', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    const sections = await harness.session.page.evaluate(() => {
      const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
      return Array.from(shadow?.querySelectorAll('.ua-section__heading') ?? []).map((heading) => ({
        title: heading.textContent?.replace(/[▾▸]/g, '').trim() ?? '',
        open: heading.getAttribute('aria-expanded') === 'true',
      }));
    });

    const byTitle = new Map(sections.map((item) => [item.title, item.open]));
    // The main path stays open; every heading is present either way, so nothing
    // becomes unfindable by being collapsed.
    expect(byTitle.get('Mode')).toBe(true);
    expect(byTitle.get('Capture')).toBe(true);
    expect(byTitle.get('Output')).toBe(true);
    expect(byTitle.get('Shortcuts')).toBe(false);
    expect(byTitle.get('Queue')).toBe(false);
  });

  it('opens a collapsed section when its heading is pressed', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    await harness.session.page.getByRole('button', { name: 'Shortcuts' }).click();
    const open = await harness.session.page.evaluate(() => {
      const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
      const headings = Array.from(shadow?.querySelectorAll('.ua-section__heading') ?? []);
      const target = headings.find((h) => (h.textContent ?? '').includes('Shortcuts'));
      return target?.getAttribute('aria-expanded') === 'true';
    });
    expect(open).toBe(true);
  });

  it('keeps the folder button on screen after the panel is dragged down', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    // Drag the title bar as far down as it will go.
    const before = await harness.session.page.evaluate(() => {
      const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
      const bar = shadow?.querySelector('.ua-titlebar') as HTMLElement | null;
      const rect = bar?.getBoundingClientRect();
      return { x: (rect?.left ?? 0) + 20, y: (rect?.top ?? 0) + 8, height: window.innerHeight };
    });
    await harness.session.page.mouse.move(before.x, before.y);
    await harness.session.page.mouse.down();
    await harness.session.page.mouse.move(before.x, before.height - 60, { steps: 8 });
    await harness.session.page.mouse.up();

    const after = await harness.session.page.evaluate(() => {
      const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
      const panel = shadow?.querySelector('.ua-panel') as HTMLElement | null;
      const rect = panel?.getBoundingClientRect();
      return { top: rect?.top ?? 0, bottom: rect?.bottom ?? 0, windowHeight: window.innerHeight };
    });
    // Dragged down, but still fully on screen and still tall enough to use.
    expect(after.bottom).toBeLessThanOrEqual(after.windowHeight + 1);
    expect(after.bottom - after.top).toBeGreaterThanOrEqual(200);
  });

  it('offers the folder from the title bar, which never scrolls away', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    await harness.session.page.getByRole('button', { name: '📁 Folder', exact: true }).click();
    await expect.poll(() => harness.opened.length, { timeout: 10_000 }).toBeGreaterThan(0);
    expect(harness.opened[0]).toBe(harness.session.writer.paths.runDir);
  });

  it('reveals a collapsed section when its own button fills it', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    await harness.session.overlay.waitForMount();

    const isOpen = async (title: string): Promise<boolean> =>
      harness.session.page.evaluate((name) => {
        const shadow = document.querySelector('[data-ui-atlas-overlay]')?.shadowRoot;
        const headings = Array.from(shadow?.querySelectorAll('.ua-section__heading') ?? []);
        const target = headings.find((h) => (h.textContent ?? '').includes(name));
        return target?.getAttribute('aria-expanded') === 'true';
      }, title);

    expect(await isOpen('Animation')).toBe(false);
    await harness.session.page.getByRole('button', { name: 'Animation…', exact: true }).click();
    // A list rendered into a collapsed section reads as "nothing happened".
    await expect.poll(() => isOpen('Animation'), { timeout: 10_000 }).toBe(true);
  });
});
