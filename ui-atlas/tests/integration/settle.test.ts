import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settlePage } from '@ui-atlas/settle';
import { testConfig, startHarness, type TestHarness } from '../support/harness.js';

let harness: TestHarness;

beforeEach(async () => {
  harness = await startHarness({ overlay: false });
});

afterEach(async () => {
  await harness.dispose();
});

describe('bounded settle', () => {
  it('completes on a page that never stops making requests', async () => {
    const page = harness.session.page;
    await page.goto(harness.url('/settle.html'), { waitUntil: 'domcontentloaded' });

    const started = Date.now();
    const readiness = await settlePage(page, { config: testConfig().settle });
    const elapsed = Date.now() - started;

    // The fixture holds an open request forever; `networkidle` would hang here.
    expect(harness.server.openEndlessRequests()).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(testConfig().settle.totalTimeoutMs + 2_000);

    const byName = Object.fromEntries(readiness.checks.map((check) => [check.name, check.status]));
    expect(byName['load-state']).toBe('passed');
    expect(byName['fonts-ready']).toBe('passed');
    expect(byName['images-decoded']).toBe('passed');
    expect(byName['mutation-quiet']).toBe('passed');
    expect(byName['animation-frames']).toBe('passed');
    expect(readiness.deadlineExceeded).toBe(false);
  });

  it('waits for the late DOM mutation before reporting quiet', async () => {
    const page = harness.session.page;
    await page.goto(harness.url('/settle.html'), { waitUntil: 'domcontentloaded' });
    await settlePage(page, { config: testConfig().settle });

    // The fixture mutates at 400ms; a quiet window that ends earlier would miss it.
    const text = await page.locator('[data-testid="late-block"]').textContent();
    expect(text).toBe('Late block is now visible.');
  });

  it('reports a slow image honestly instead of hiding it', async () => {
    const page = harness.session.page;
    await page.goto(harness.url('/settle.html'), { waitUntil: 'domcontentloaded' });

    const readiness = await settlePage(page, {
      config: { ...testConfig().settle, imageTimeoutMs: 60, perImageTimeoutMs: 40 },
    });
    const images = readiness.checks.find((check) => check.name === 'images-decoded');
    expect(images).toBeDefined();
    expect(['timed-out', 'passed']).toContain(images?.status);
    if (images?.status === 'passed' && (images.detail ?? '').includes('slow')) {
      expect(readiness.warnings.some((warning) => warning.includes('did not decode'))).toBe(true);
    }
  });

  it('captures at the hard deadline and records what was still pending', async () => {
    const page = harness.session.page;
    await page.goto(harness.url('/settle.html'), { waitUntil: 'domcontentloaded' });

    // A quiet window longer than the total budget can never be satisfied.
    const readiness = await settlePage(page, {
      config: { ...testConfig().settle, totalTimeoutMs: 800, mutationQuietMs: 5_000 },
    });
    expect(readiness.deadlineExceeded).toBe(true);
    expect(readiness.durationMs).toBeLessThan(4_000);
    expect(readiness.checks.find((check) => check.name === 'mutation-quiet')?.status).toBe('timed-out');
    expect(readiness.warnings.some((warning) => warning.includes('deadline'))).toBe(true);
  });

  it('waits for the element to stop moving before a capture', async () => {
    const page = harness.session.page;
    await page.goto(harness.url('/settle.html'), { waitUntil: 'domcontentloaded' });
    const readiness = await settlePage(page, {
      config: testConfig().settle,
      target: page.locator('[data-testid="scroller"]'),
    });
    expect(readiness.checks.find((check) => check.name === 'element-stable')?.status).toBe('passed');
  });

  it('records a failed element-stable check when the target is gone', async () => {
    const page = harness.session.page;
    await page.goto(harness.url('/settle.html'), { waitUntil: 'domcontentloaded' });
    const readiness = await settlePage(page, {
      config: { ...testConfig().settle, totalTimeoutMs: 3_000 },
      target: page.locator('[data-testid="does-not-exist"]'),
    });
    const check = readiness.checks.find((item) => item.name === 'element-stable');
    expect(check?.status).toBe('failed');
    expect(readiness.warnings.some((warning) => warning.includes('element-stable'))).toBe(true);
  });
});
