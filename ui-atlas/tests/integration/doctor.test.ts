import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settleDiagnosis, summarise, watchPage } from '@ui-atlas/browser';
import { startHarness, type TestHarness } from '../support/harness.js';

/**
 * The diagnosis, against a page that really does fail the way the real one did:
 * a 200 document whose own `fetch` receives an HTML interstitial and throws
 * `Unexpected token '<', "<!DOCTYPE "`.
 */
let harness: TestHarness;

beforeEach(async () => {
  harness = await startHarness({ overlay: false });
});

afterEach(async () => {
  await harness.dispose();
});

async function diagnose(path: string): Promise<ReturnType<ReturnType<typeof watchPage>['stop']>> {
  const url = harness.url(path);
  const watch = watchPage(harness.session.page, url);
  await harness.session.navigate(url);
  await settleDiagnosis();
  return watch.stop();
}

describe('doctor', () => {
  it('finds the request behind an "Unexpected token" error', async () => {
    const diagnosis = await diagnose('/broken-api.html');

    const finding = diagnosis.findings.find((item) => item.kind === 'html-for-json');
    expect(finding).toBeDefined();
    expect(finding?.url).toContain('/challenge.html');
    expect(finding?.resourceType).toBe('fetch');
    expect(finding?.reason).toContain('HTML document');
  });

  it('says what the HTML actually was, which is the part that identifies it', async () => {
    const diagnosis = await diagnose('/broken-api.html');
    const finding = diagnosis.findings.find((item) => item.kind === 'html-for-json');
    expect(finding?.preview).toContain('Just a moment');
  });

  it('names it a bot challenge rather than leaving the user to guess', async () => {
    const conclusions = summarise(await diagnose('/broken-api.html'));
    expect(conclusions.join(' ')).toContain('bot challenge');
    expect(conclusions.join(' ')).toContain('will not get one');
  });

  it('captures the page\'s own error verbatim', async () => {
    const diagnosis = await diagnose('/broken-api.html');
    const text = [...diagnosis.pageErrors, ...diagnosis.consoleErrors].join(' ');
    expect(text).toContain('JSON');
  });

  it('finds nothing worth reporting on a page that works', async () => {
    const diagnosis = await diagnose('/states.html');
    expect(diagnosis.findings).toEqual([]);
    expect(summarise(diagnosis)).toEqual([]);
  });

  it('keeps query strings out of what it prints, since they carry tokens', async () => {
    const diagnosis = await diagnose('/broken-api.html');
    for (const finding of diagnosis.findings) {
      expect(finding.url).not.toMatch(/\?[^…]/);
    }
  });
});

describe('the noise it refuses to let bury a finding', () => {
  it('ranks a cancelled beacon below a request that was actually refused', async () => {
    const url = harness.url('/broken-api.html');
    const watch = watchPage(harness.session.page, url);
    await harness.session.navigate(url);
    // Beacons that abort on navigation are what a real page produces by the
    // handful; the fixture's failing fetch is the one that matters.
    await harness.session.page.evaluate(() => {
      const controller = new AbortController();
      void fetch('/challenge.html', { signal: controller.signal }).catch(() => undefined);
      controller.abort();
    });
    await settleDiagnosis();
    const diagnosis = watch.stop();

    const kinds = diagnosis.findings.map((finding) => finding.kind);
    const cancelledAt = kinds.indexOf('cancelled');
    const significantAt = kinds.indexOf('html-for-json');
    expect(significantAt).toBeGreaterThanOrEqual(0);
    if (cancelledAt >= 0) expect(significantAt).toBeLessThan(cancelledAt);
  });

  it('calls an aborted request cancelled, not failed', async () => {
    const url = harness.url('/states.html');
    const watch = watchPage(harness.session.page, url);
    await harness.session.navigate(url);
    await harness.session.page.evaluate(() => {
      const controller = new AbortController();
      void fetch('/challenge.html', { signal: controller.signal }).catch(() => undefined);
      controller.abort();
    });
    await settleDiagnosis();

    const cancelled = watch.stop().findings.find((finding) => finding.kind === 'cancelled');
    expect(cancelled).toBeDefined();
    expect(cancelled?.reason).toContain('rarely the problem');
  });
});

describe('a 401 next to a sign-in button', () => {
  it('says the two are one fact, and rules out a bot challenge', async () => {
    const diagnosis = {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      status: 200,
      pageErrors: [],
      consoleErrors: [],
      findings: [
        {
          kind: 'unauthorised' as const,
          url: 'https://example.com/rest/profile',
          status: 401,
          contentType: 'application/json',
          resourceType: 'fetch',
          preview: undefined,
          reason: 'refused with 401',
        },
      ],
    };
    const text = summarise(diagnosis, true).join(' ');
    expect(text).toContain('same fact');
    expect(text).toContain('not a bot challenge');
  });

  it('does not claim that when the page looks signed in', () => {
    const diagnosis = {
      requestedUrl: 'https://example.com/',
      finalUrl: 'https://example.com/',
      status: 200,
      pageErrors: [],
      consoleErrors: [],
      findings: [
        {
          kind: 'unauthorised' as const,
          url: 'https://example.com/rest/profile',
          status: 401,
          contentType: 'application/json',
          resourceType: 'fetch',
          preview: undefined,
          reason: 'refused with 401',
        },
      ],
    };
    expect(summarise(diagnosis, false).join(' ')).not.toContain('same fact');
  });
});
