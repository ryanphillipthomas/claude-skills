import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildElementIdentity, buildFramePath } from '@ui-atlas/identity';
import { probeSelector } from '@ui-atlas/overlay';
import { generateReport } from '@ui-atlas/reporter';
import { TokenScanner } from '@ui-atlas/tokens';
import { TokensConfigSchema } from '@ui-atlas/config';
import { startHarness, type TestHarness } from '../support/harness.js';

/**
 * The report is opened from `file://`, so these tests open the real generated
 * file in a real browser and drive it.
 */
let browser: Browser;
let harness: TestHarness;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
}, 60_000);

afterAll(async () => {
  await browser.close();
});

beforeEach(async () => {
  harness = await startHarness({ overlay: false });
});

afterEach(async () => {
  await harness.dispose();
});

interface OpenedReport {
  page: Page;
  errors: string[];
  close(): Promise<void>;
}

async function openReport(runDir: string): Promise<OpenedReport> {
  const generated = await generateReport({ runDir });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.goto(pathToFileURL(generated.path).href, { waitUntil: 'load' });
  await page.waitForSelector('.tab');
  return {
    page,
    errors,
    close: async () => {
      await page.close();
    },
  };
}

describe('generated report', () => {
  it('renders a responsive matrix with honest hidden cells', async () => {
    await harness.session.navigate(harness.url('/responsive.html'));
    const probe = await probeSelector(harness.session.page, '[data-testid="mobile-only"]');
    const identity = buildElementIdentity(probe, await buildFramePath(harness.session.page.mainFrame()));
    await harness.session.runResponsive({ kind: 'element', states: ['default'], identity });
    await harness.session.close();

    const report = await openReport(harness.session.writer.paths.runDir);
    try {
      expect(report.errors).toEqual([]);

      // Five viewports, side by side in one row.
      const cells = report.page.locator('.cell__button');
      expect(await cells.count()).toBe(5);
      const headers = await report.page.locator('.matrix thead th').allTextContents();
      expect(headers.join(' ')).toContain('mobile-sm');
      expect(headers.join(' ')).toContain('desktop');

      // The three hidden viewports say so instead of showing a blank.
      const empties = report.page.locator('.shot--empty');
      expect(await empties.count()).toBe(3);
      expect(await empties.first().textContent()).toContain('hidden at this viewport');
      expect(await empties.first().textContent()).toContain('locator.hidden');

      // Real images for the two viewports where it was visible.
      const broken = await report.page.evaluate(() =>
        Array.from(document.querySelectorAll('.shot img')).filter(
          (image) => !(image as HTMLImageElement).complete || (image as HTMLImageElement).naturalWidth === 0,
        ).length,
      );
      expect(broken).toBe(0);
    } finally {
      await report.close();
    }
  });

  it('renders a state matrix as one row of states, not a diagonal', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    const probe = await probeSelector(harness.session.page, '[data-testid="focus-demo"]');
    const identity = buildElementIdentity(probe, await buildFramePath(harness.session.page.mainFrame()));
    for (const state of ['default', 'hover', 'focus'] as const) {
      await harness.session.captures.capture({
        kind: 'element',
        state,
        identity,
        set: { id: 'set-1', kind: 'state', member: state },
      });
    }
    await harness.session.close();

    const report = await openReport(harness.session.writer.paths.runDir);
    try {
      expect(report.errors).toEqual([]);
      expect(await report.page.locator('.matrix tbody tr').count()).toBe(1);
      expect(await report.page.locator('.cell__button').count()).toBe(3);
      expect(await report.page.locator('.cell--empty').count()).toBe(0);
    } finally {
      await report.close();
    }
  });

  it('opens a detail panel with locator candidates, style delta and readiness', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    const probe = await probeSelector(harness.session.page, '[data-testid="focus-demo"]');
    const identity = buildElementIdentity(probe, await buildFramePath(harness.session.page.mainFrame()));
    await harness.session.captures.capture({ kind: 'element', state: 'hover', identity });
    await harness.session.close();

    const report = await openReport(harness.session.writer.paths.runDir);
    try {
      await report.page.locator('.cell__button').first().click();
      const detail = report.page.locator('.detail');
      await detail.waitFor();

      const text = (await detail.textContent()) ?? '';
      expect(text).toContain('Focus me');
      expect(text.toLowerCase()).toContain('locator candidates');
      expect(text).toContain('focus-demo');
      expect(text).toContain('background-color');
      expect(text).toContain('mutation-quiet');
      expect(text).toContain('hover');

      // Escape closes it again.
      await report.page.keyboard.press('Escape');
      expect(await report.page.locator('.detail').count()).toBe(0);
      expect(report.errors).toEqual([]);
    } finally {
      await report.close();
    }
  });

  it('filters captures by state and resets again', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    const probe = await probeSelector(harness.session.page, '[data-testid="focus-demo"]');
    const identity = buildElementIdentity(probe, await buildFramePath(harness.session.page.mainFrame()));
    for (const state of ['default', 'hover'] as const) {
      await harness.session.captures.capture({ kind: 'element', state, identity });
    }
    await harness.session.close();

    const report = await openReport(harness.session.writer.paths.runDir);
    try {
      await report.page.getByRole('tab', { name: 'Gallery' }).click();
      expect(await report.page.locator('.card').count()).toBe(2);

      await report.page.locator('.chip', { hasText: 'hover' }).first().click();
      expect(await report.page.locator('.card').count()).toBe(1);
      expect(await report.page.locator('#resultbar').textContent()).toBe('1 of 2 captures');

      await report.page.getByRole('button', { name: 'Reset filters' }).click();
      expect(await report.page.locator('.card').count()).toBe(2);
      expect(report.errors).toEqual([]);
    } finally {
      await report.close();
    }
  });

  it('never executes script that came from the inspected page', async () => {
    await harness.session.navigate(harness.url('/injection.html'));
    for (const selector of ['[data-testid="xss-button"]', '[data-testid="xss-text"]', '[data-testid="xss-title"]']) {
      const probe = await probeSelector(harness.session.page, selector);
      const identity = buildElementIdentity(probe, await buildFramePath(harness.session.page.mainFrame()));
      await harness.session.captures.capture({ kind: 'element', state: 'default', identity });
    }
    await harness.session.close();

    const runDir = harness.session.writer.paths.runDir;
    const generated = await generateReport({ runDir });
    const html = await readFile(generated.path, 'utf8');

    // The payloads are in the file, but only ever as escaped data.
    expect(html).toContain('onerror');
    expect(html).not.toContain('<img src=x onerror');
    expect(html).not.toContain('</script><script>window.__uiAtlasPwned');

    const report = await openReport(runDir);
    try {
      const pwned = await report.page.evaluate(
        () => (window as unknown as { __uiAtlasPwned?: number }).__uiAtlasPwned,
      );
      expect(pwned).toBeUndefined();

      // Rendered literally, as text, exactly as the site wrote it.
      const body = (await report.page.locator('body').textContent()) ?? '';
      expect(body).toContain('<img src=x onerror="window.__uiAtlasPwned=1">');
      expect(await report.page.locator('body img[src="x"]').count()).toBe(0);
      expect(await report.page.locator('body svg').count()).toBe(0);
      expect(report.errors).toEqual([]);
    } finally {
      await report.close();
    }
  });

  it('is self-contained: no network requests when opened', async () => {
    await harness.session.navigate(harness.url('/index.html'));
    await harness.session.captures.capture({ kind: 'viewport', state: 'default' });
    await harness.session.close();

    const generated = await generateReport({ runDir: harness.session.writer.paths.runDir });
    const page = await browser.newPage();
    const offSite: string[] = [];
    page.on('request', (request) => {
      if (!request.url().startsWith('file://')) offSite.push(request.url());
    });
    try {
      await page.goto(pathToFileURL(generated.path).href, { waitUntil: 'load' });
      await page.waitForSelector('.tab');
      expect(offSite).toEqual([]);

      // Styles and behaviour are inlined, not linked.
      const html = await readFile(generated.path, 'utf8');
      expect(html).not.toContain('<link rel="stylesheet"');
      expect(html).not.toContain('src="http');
      expect(html).not.toContain('//cdn.');
    } finally {
      await page.close();
    }
  });

  it('plays a recording where a screenshot would go, rather than calling it missing', async () => {
    await harness.session.navigate(harness.url('/motion.html'));
    const writer = harness.session.writer;
    const captureId = 'cap-recording';
    const screencast = await writer.writeVideo(
      { routeKey: 'motion', viewportLabel: 'base', captureId },
      Buffer.from('a recording stands in for itself here'),
      {
        width: 800,
        height: 600,
        durationMs: 3_000,
        leadInMs: 700,
        truncated: true,
        subjects: ['drift on [data-testid="infinite-swatch"]'],
        limitations: ['a recording is not a deterministic sample'],
      },
    );
    await harness.session.captures.captureVideo({ captureId, screencast, durationMs: 3_700 });
    await harness.session.close();

    const report = await openReport(writer.paths.runDir);
    try {
      await report.page.getByRole('tab', { name: 'Gallery' }).click();

      // A capture with no image is not automatically a failure. This one has a
      // recording, and the report shows it instead of "nothing was captured".
      const video = report.page.locator('.card .shot video').first();
      await video.waitFor();
      expect(await video.getAttribute('src')).toBe(
        '../animations/motion/base/cap-recording.webm',
      );
      expect(await report.page.locator('.shot--empty').count()).toBe(0);

      await report.page.locator('.card').first().click();
      const detail = report.page.locator('.detail');
      await detail.waitFor();
      const panel = (await detail.textContent()) ?? '';
      expect(panel).toContain('cut short by the budget');
      expect(panel).toContain('700 ms in');
      expect(panel).toContain('not a deterministic sample');
      expect(report.errors).toEqual([]);
    } finally {
      await report.close();
    }
  });

  it('shows observed values without ever naming one', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    const writer = harness.session.writer;
    const scanner = new TokenScanner({
      runId: harness.session.runId,
      config: TokensConfigSchema.parse({ enabled: true }),
    });
    await scanner.scan(harness.session.page, 'states');
    // A value the extractor could not parse, to prove the swatch is guarded.
    scanner.add(
      {
        entries: [
          { property: 'color', value: 'color(display-p3 0.2 0.4 0.9)', count: 3, examples: ['b'] },
        ],
        elementsScanned: 1,
        elementsSkipped: 0,
      },
      'states',
    );
    await writer.writeTokens(scanner.summarise());
    await harness.session.close();

    const report = await openReport(writer.paths.runDir);
    try {
      await report.page.getByRole('tab', { name: 'Values' }).click();
      const view = report.page.locator('#view');
      const text = (await view.textContent()) ?? '';

      expect(text).toContain('not a design system');
      expect(text).toContain('element(s) read across');
      expect(await view.locator('.tokens__group').count()).toBeGreaterThan(0);

      // Colours get a swatch, and its background is the value itself.
      const swatch = view.locator('.swatch').first();
      await swatch.waitFor();
      const background = await swatch.evaluate((node) => getComputedStyle(node).backgroundColor);
      expect(background).toMatch(/^rgba?\(/);

      // A value the extractor did not build itself gets no swatch, so no
      // capture-derived string ever reaches a style attribute unchecked.
      const rows = view.locator('.table tbody tr');
      const exotic = rows.filter({ hasText: 'display-p3' });
      expect(await exotic.count()).toBe(1);
      expect(await exotic.locator('.swatch').count()).toBe(0);

      expect(report.errors).toEqual([]);
    } finally {
      await report.close();
    }
  });

  it('reports failed and skipped captures as first-class rows', async () => {
    await harness.session.navigate(harness.url('/identity.html'));
    const probe = await probeSelector(harness.session.page, '[data-testid="save-button"]');
    const identity = buildElementIdentity(probe, await buildFramePath(harness.session.page.mainFrame()));
    await harness.session.captures.capture({ kind: 'element', state: 'default', identity });
    await harness.session.page.evaluate(() => document.querySelector('main')?.remove());
    await harness.session.captures.capture({ kind: 'element', state: 'default', identity });
    await harness.session.close();

    const report = await openReport(harness.session.writer.paths.runDir);
    try {
      await report.page.getByRole('tab', { name: 'Issues' }).click();
      const rows = report.page.locator('.table tbody tr');
      expect(await rows.count()).toBeGreaterThanOrEqual(1);
      const text = (await rows.first().textContent()) ?? '';
      expect(text).toContain('failed');
      expect(text).toContain('locator.not-found');
      expect(report.errors).toEqual([]);
    } finally {
      await report.close();
    }
  });
});
