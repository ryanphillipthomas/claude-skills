import { describe, expect, it } from 'vitest';
import {
  authRow,
  describeDelta,
  popoverModel,
  relativeTime,
  type PopoverFacts,
} from '../../apps/launcher/src/popover.js';
import { signInCard } from '../../apps/launcher/src/signin.js';
import { initialState, reduceAll, type LauncherEvent } from '../../apps/launcher/src/startup.js';
import { decideBuild } from '../../apps/launcher/src/build-plan.js';

const T0 = 1_700_000_000_000;

function facts(overrides: Partial<PopoverFacts> = {}): PopoverFacts {
  return {
    engineLabel: 'Chromium 141',
    runsToday: 4,
    targetUrl: 'https://acme.com/pricing',
    recentUrls: ['https://acme.com/pricing'],
    auth: { profile: 'acme', verdict: 'signed-in', expiresAt: undefined, checkedAt: T0 },
    runs: [],
    ...overrides,
  };
}

function ready(events: LauncherEvent[] = []): ReturnType<typeof reduceAll> {
  return reduceAll([
    { kind: 'start', at: T0, buildNeeded: false },
    { kind: 'ready', at: T0 },
    ...events,
  ]);
}

describe('which body the popover shows', () => {
  it('shows the stage list before anything has been launched', () => {
    const model = popoverModel(initialState(), T0, facts());
    expect(model.body.kind).toBe('stages');
  });

  it('shows the ready body once the panel is up', () => {
    const model = popoverModel(ready(), T0, facts());
    expect(model.body.kind).toBe('ready');
    if (model.body.kind !== 'ready') return;
    expect(model.body.primary).toEqual({ label: 'Open inspector', action: 'start' });
    expect(model.body.caption).toBe('Opens a clean browser window with the panel attached');
    expect(model.body.urlField.value).toBe('https://acme.com/pricing');
  });

  it('shows the sign-in card, and keeps the stage rows under it', () => {
    const state = reduceAll([
      { kind: 'start', at: T0, buildNeeded: false },
      {
        kind: 'sign-in-required',
        prompt: { host: 'acme.com', profile: 'acme', verdict: 'signed-out', evidence: ['redirected to /login'] },
      },
    ]);
    const model = popoverModel(state, T0, facts());
    expect(model.body.kind).toBe('signin');
    if (model.body.kind !== 'signin') return;
    expect(model.body.stages).toHaveLength(3);
    expect(model.body.card.evidence).toEqual(['redirected to /login']);
  });

  it('always offers the same three footer items', () => {
    const model = popoverModel(initialState(), T0, facts());
    expect(model.footer.map((item) => item.label)).toEqual([
      'Show captures in Finder',
      'Settings…',
      'Quit UI Atlas',
    ]);
    expect(model.footer[2]?.shortcut).toBe('⌘Q');
  });
});

describe('the sign-in card', () => {
  const base = { host: 'acme.com', profile: 'acme', evidence: ['redirected to /login'] } as const;

  it('offers a way in and a way past, for a session that simply expired', () => {
    const card = signInCard({ ...base, verdict: 'signed-out' });
    expect(card.title).toBe('Page is signed out');
    expect(card.body).toContain('no longer works, so captures would show the login screen');
    expect(card.body).toContain('waits for you and saves the session when you land');
    expect(card.primary?.answer).toBe('sign-in');
    expect(card.secondary.map((button) => button.label)).toEqual(['Capture anyway', 'Choose profile']);
  });

  it('offers neither, for a host that is refusing the browser', () => {
    const card = signInCard({ ...base, verdict: 'challenged' });
    expect(card.title).toBe('acme.com is refusing the browser');
    expect(card.primary).toBeUndefined();
    expect(card.secondary.map((button) => button.answer)).not.toContain('capture-anyway');
    expect(card.body).toContain('signing in again will not fix it');
  });

  it('gives the popover header the same title as the card', () => {
    // Regression: the header hardcoded "Page is signed out" for every verdict,
    // so a challenged host was announced as a sign-in problem — the exact
    // confusion ADR 0030 exists to prevent.
    for (const verdict of ['signed-out', 'unclear', 'challenged'] as const) {
      const state = reduceAll([
        { kind: 'start', at: T0, buildNeeded: false },
        { kind: 'sign-in-required', prompt: { ...base, verdict } },
      ]);
      const model = popoverModel(state, T0, facts());
      if (model.body.kind !== 'signin') throw new Error('expected the sign-in body');
      expect(model.header.title).toBe(model.body.card.title);
    }
  });

  it('says it cannot tell, rather than guessing, when the reading is unclear', () => {
    const card = signInCard({ ...base, verdict: 'unclear' });
    expect(card.title).toBe('Cannot tell if this page is signed in');
    expect(card.primary?.answer).toBe('sign-in');
  });

  it('never repeats the profile name it does not have', () => {
    const card = signInCard({ ...base, profile: undefined, verdict: 'signed-out' });
    expect(card.body).toContain('The saved session for acme.com');
    expect(card.body).not.toContain('undefined');
  });
});

describe('the saved-sign-in row', () => {
  it('names the profile it loaded, and never an account it cannot know', () => {
    const row = authRow({ profile: 'acme', verdict: 'signed-in', expiresAt: undefined, checkedAt: T0 }, T0);
    expect(row.title).toBe('Signed in as "acme"');
    expect(row.title).not.toContain('@');
    expect(row.action?.label).toBe('Manage');
  });

  it('reports the expiry it can actually read out of the saved state', () => {
    const row = authRow(
      { profile: 'acme', verdict: 'signed-in', expiresAt: T0 + 6 * 86_400_000, checkedAt: T0 },
      T0,
    );
    expect(row.detail).toBe('Expires in 6 days');
  });

  it('admits when the profile has never been checked', () => {
    const row = authRow({ profile: 'acme', verdict: 'unknown', expiresAt: undefined, checkedAt: undefined }, T0);
    expect(row.detail).toBe('Not checked yet');
  });

  it('offers signing in, not managing, when there is nothing saved', () => {
    const row = authRow({ profile: undefined, verdict: 'unknown', expiresAt: undefined, checkedAt: undefined }, T0);
    expect(row.title).toBe('No saved sign-in');
    expect(row.detail).toBe('Captures will be of the signed-out site');
    expect(row.action?.action).toBe('sign-in');
  });

  it('turns the row into a way out when the profile is signed out', () => {
    const row = authRow({ profile: 'acme', verdict: 'signed-out', expiresAt: undefined, checkedAt: T0 }, T0);
    expect(row.tone).toBe('warn');
    expect(row.action?.action).toBe('sign-in');
  });
});

describe('recent runs', () => {
  it('counts files and says when, and only links a report that exists', () => {
    const model = popoverModel(
      ready(),
      T0,
      facts({
        runs: [
          {
            runId: '20260812T160000Z-a1b2c3',
            label: '/pricing',
            fileCount: 8,
            finishedAt: T0 - 3 * 60_000,
            runDir: '/runs/a1b2c3',
            hasReport: true,
          },
          {
            runId: '20260811T160000Z-b2c3d4',
            label: '/checkout',
            fileCount: 22,
            finishedAt: T0 - 26 * 3_600_000,
            runDir: '/runs/b2c3d4',
            hasReport: false,
          },
        ],
      }),
    );
    if (model.body.kind !== 'ready') throw new Error('expected the ready body');
    // Short enough for a 308px row; the full id is the row's tooltip.
    expect(model.body.runs[0]?.title).toBe('run a1b2c3 · /pricing');
    expect(model.body.runs[0]?.runId).toBe('20260812T160000Z-a1b2c3');
    expect(model.body.runs[0]?.detail).toBe('8 files · 3 minutes ago');
    expect(model.body.runs[0]?.reportAction).toBe('open-report');
    expect(model.body.runs[1]?.detail).toBe('22 files · yesterday');
    expect(model.body.runs[1]?.reportAction).toBeUndefined();
  });
});

describe('time wording', () => {
  it('reads the way a person would say it', () => {
    expect(relativeTime(T0 - 30_000, T0)).toBe('just now');
    expect(relativeTime(T0 - 60_000, T0)).toBe('1 minute ago');
    expect(relativeTime(T0 - 3 * 3_600_000, T0)).toBe('3 hours ago');
    expect(relativeTime(T0 - 26 * 3_600_000, T0)).toBe('yesterday');
    expect(relativeTime(T0 - 6 * 86_400_000, T0)).toBe('6 days ago');
  });

  it('never says a future capture happened in the past', () => {
    expect(relativeTime(T0 + 5_000, T0)).toBe('just now');
  });

  it('describes an expiry in the future', () => {
    expect(describeDelta(6 * 86_400_000)).toBe('in 6 days');
    expect(describeDelta(4 * 3_600_000)).toBe('in 4 hours');
  });
});

describe('deciding whether to build', () => {
  it('builds when an output is missing', () => {
    expect(decideBuild({ outputs: [1, undefined], newestSource: 0 })).toEqual({
      needed: true,
      reason: 'missing',
    });
  });

  it('builds again when a source changed after the last build wrote anything', () => {
    expect(decideBuild({ outputs: [10, 20], newestSource: 25 })).toEqual({
      needed: true,
      reason: 'stale',
    });
  });

  it('skips the build when everything is present and current', () => {
    expect(decideBuild({ outputs: [30, 40], newestSource: 20 })).toEqual({
      needed: false,
      reason: 'current',
    });
  });

  it('does not call an incremental build stale for not rewriting every output', () => {
    // Regression: measured against the *oldest* output, a current workspace
    // looked stale forever — `tsc -b` legitimately leaves an unchanged
    // `dist/bin.js` from last week alone, and that is not a reason to rebuild.
    expect(decideBuild({ outputs: [10, 20], newestSource: 15 })).toEqual({
      needed: false,
      reason: 'current',
    });
  });

  it('does not skip on an empty output list, which would prove nothing', () => {
    expect(decideBuild({ outputs: [], newestSource: undefined }).needed).toBe(true);
  });
});
