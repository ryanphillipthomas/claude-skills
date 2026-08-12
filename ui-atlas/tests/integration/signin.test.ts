import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assessStorage,
  CHALLENGE_ADVICE,
  judgeSignIn,
  probeChallenge,
  probeSignIn,
  probeStorage,
} from '@ui-atlas/browser';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readRunManifest } from '@ui-atlas/artifacts';
import { run } from '../../apps/cli/src/index.js';
import { createLogger } from '../../apps/cli/src/logger.js';
import {
  makeOutputDir,
  removeDir,
  startFixtureServer,
  startHarness,
  type TestHarness,
} from '../support/harness.js';

function findRunDir(root: string, project = 'fixture'): string {
  const projectDir = join(root, project);
  const runs = readdirSync(projectDir).filter((name) =>
    statSync(join(projectDir, name)).isDirectory(),
  );
  const runId = runs.sort().at(-1);
  if (runId === undefined) throw new Error(`no run directory under ${projectDir}`);
  return join(projectDir, runId);
}

/**
 * The sign-in check against real pages in a real browser. The pure judgement is
 * covered in `tests/unit/signin.test.ts`; what this proves is that the page-side
 * probes actually read what they claim to.
 */
let harness: TestHarness;

beforeEach(async () => {
  harness = await startHarness({ overlay: false });
});

afterEach(async () => {
  await harness.dispose();
});

describe('the sign-in probe', () => {
  it('reads a login page as signed out, and says why', async () => {
    const url = harness.url('/signin.html');
    await harness.session.navigate(url);

    const reading = judgeSignIn(await probeSignIn(harness.session.page, url));
    expect(reading.verdict).toBe('signed-out');
    expect(reading.evidence.join(' ')).toContain('password field');
  });

  it('reads a page offering a way out as signed in', async () => {
    const url = harness.url('/account.html');
    await harness.session.navigate(url);

    const reading = judgeSignIn(await probeSignIn(harness.session.page, url));
    expect(reading.verdict).toBe('signed-in');
    expect(reading.evidence.join(' ')).toContain('Sign out');
  });

  it('says unclear for an ordinary page rather than guessing', async () => {
    const url = harness.url('/states.html');
    await harness.session.navigate(url);

    const reading = judgeSignIn(await probeSignIn(harness.session.page, url));
    expect(reading.verdict).toBe('unclear');
  });

  it('ignores a hidden password field, which is not a sign-in page', async () => {
    const url = harness.url('/states.html');
    await harness.session.navigate(url);
    await harness.session.page.evaluate(() => {
      const hidden = document.createElement('input');
      hidden.type = 'password';
      hidden.style.display = 'none';
      document.body.append(hidden);
    });

    expect(judgeSignIn(await probeSignIn(harness.session.page, url)).verdict).toBe('unclear');
  });

  it('notices a redirect away from what was asked for', async () => {
    const asked = harness.url('/account.html');
    await harness.session.navigate(harness.url('/signin.html'));

    const reading = judgeSignIn(await probeSignIn(harness.session.page, asked));
    expect(reading.evidence[0]).toContain('redirected to');
    expect(reading.evidence[0]).toContain('/signin.html');
  });
});

describe('the storage probe', () => {
  it('finds the storage a saved state would silently leave behind', async () => {
    await harness.session.navigate(harness.url('/account.html'));
    // The fixture opens the database on load; give the request a turn to settle
    // before asking what exists.
    await harness.session.page.waitForFunction(async () => {
      const factory = indexedDB as IDBFactory & { databases?: () => Promise<unknown[]> };
      if (typeof factory.databases !== 'function') return true;
      return (await factory.databases()).length > 0;
    });

    const probe = await probeStorage(harness.session.page);
    expect(probe.indexedDbNames).toContain('ui-atlas-fixture-db');
    expect(probe.sessionStorageKeys).toBeGreaterThan(0);
    expect(probe.localStorageKeys).toBeGreaterThan(0);

    const assessment = assessStorage(probe, 0);
    expect(assessment.recommendPersistent).toBe(true);
    expect(assessment.dropped.join(' ')).toContain('ui-atlas-fixture-db');
    expect(assessment.carried.join(' ')).toContain('localStorage');
  });

  it('is content with a page that stores nothing a state cannot carry', async () => {
    await harness.session.navigate(harness.url('/signin.html'));
    const assessment = assessStorage(await probeStorage(harness.session.page), 3);
    expect(assessment.recommendPersistent).toBe(false);
    expect(assessment.dropped).toEqual([]);
  });
});

describe('being refused entry, which is not a sign-in problem', () => {
  it('recognises a challenge page by its own machinery and its wording', async () => {
    await harness.session.navigate(harness.url('/blocked.html'));

    const reading = await probeChallenge(harness.session.page);
    expect(reading.challenged).toBe(true);
    // Both signals: the marker survives a translated site, the wording does not.
    expect(reading.evidence.join(' ')).toContain('#challenge-form');
    expect(reading.evidence.join(' ')).toContain('Just a moment');
  });

  it('does not call an ordinary page a challenge', async () => {
    await harness.session.navigate(harness.url('/states.html'));
    expect((await probeChallenge(harness.session.page)).challenged).toBe(false);
  });

  it('does not call a sign-in page a challenge — the two need opposite responses', async () => {
    await harness.session.navigate(harness.url('/signin.html'));
    expect((await probeChallenge(harness.session.page)).challenged).toBe(false);
  });

  it('never advises retrying, which is what makes a block worse', () => {
    const advice = CHALLENGE_ADVICE.join(' ');
    expect(advice).toContain('Re-saving the profile will not help');
    expect(advice).toContain('Stop running against this host');
    expect(advice).toContain('no evasion');
  });
});

describe('a crawl against a host that is refusing the browser', () => {
  it('stops before crawling instead of fetching the interstitial fifty times', async () => {
    const server = await startFixtureServer();
    const outputRoot = await makeOutputDir('crawl-challenged');
    const quiet = createLogger({ level: 'error', write: () => undefined });
    try {
      const code = await run({
        argv: [
          'crawl', server.url('/blocked.html'),
          '--project', 'fixture',
          '--output', outputRoot,
          '--headless',
        ],
        logger: quiet,
      });
      expect(code).toBe(1);

      // The run directory is still finalised — the warning is the artifact, and
      // it belongs in run.json where someone reading later will find it.
      const runDir = findRunDir(outputRoot);
      const manifest = await readRunManifest(join(runDir, 'run.json'));
      expect(manifest.warnings.join(' ')).toContain('challenge page');
      expect(manifest.counts?.pages ?? 0).toBe(0);
    } finally {
      await removeDir(outputRoot);
      await server.close();
    }
  });
});
