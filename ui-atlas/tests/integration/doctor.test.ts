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
