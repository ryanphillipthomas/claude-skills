import { describe, expect, it } from 'vitest';
import {
  assessStorage,
  judgeSignIn,
  looksLikeLoginUrl,
  mismatchWarning,
  type SavedAuthShape,
  type SignInSignals,
  type StorageProbe,
} from '@ui-atlas/browser';

function probe(overrides: Partial<StorageProbe> = {}): StorageProbe {
  return {
    origin: 'https://example.com',
    localStorageKeys: 0,
    sessionStorageKeys: 0,
    indexedDbNames: [],
    serviceWorkers: 0,
    ...overrides,
  };
}

function signals(overrides: Partial<SignInSignals> = {}): SignInSignals {
  return {
    requestedUrl: 'https://example.com/app',
    finalUrl: 'https://example.com/app',
    looksLikeLoginUrl: false,
    visiblePasswordFields: 0,
    signInControls: [],
    signOutControls: [],
    ...overrides,
  };
}

describe('assessStorage', () => {
  it('is content with a site that keeps its session in cookies', () => {
    const assessment = assessStorage(probe({ localStorageKeys: 3 }), 12);
    expect(assessment.recommendPersistent).toBe(false);
    expect(assessment.carried).toEqual(['12 cookies', '3 localStorage keys']);
    expect(assessment.dropped).toEqual([]);
  });

  it('recommends a persistent profile when the session is in IndexedDB', () => {
    const assessment = assessStorage(probe({ indexedDbNames: ['firebaseLocalStorageDb'] }), 4);
    expect(assessment.recommendPersistent).toBe(true);
    expect(assessment.dropped[0]).toContain('firebaseLocalStorageDb');
    expect(assessment.summary).toContain('cannot carry');
  });

  it('recommends one for sessionStorage too, which a storage state also drops', () => {
    expect(assessStorage(probe({ sessionStorageKeys: 2 }), 4).recommendPersistent).toBe(true);
  });

  it('reports a service worker without treating it as a lost session', () => {
    const assessment = assessStorage(probe({ serviceWorkers: 1 }), 4);
    expect(assessment.recommendPersistent).toBe(false);
    expect(assessment.dropped[0]).toContain('service worker');
  });
});

describe('looksLikeLoginUrl', () => {
  it('recognises the usual sign-in paths', () => {
    for (const path of ['/login', '/sign-in', '/signin', '/oauth/authorize', '/auth/callback']) {
      expect(looksLikeLoginUrl(`https://example.com${path}`)).toBe(true);
    }
  });

  it('does not mistake a word that merely contains one', () => {
    expect(looksLikeLoginUrl('https://example.com/authors')).toBe(false);
    expect(looksLikeLoginUrl('https://example.com/blog/logins-explained')).toBe(false);
  });

  it('returns false rather than throwing on a value that is not a URL', () => {
    expect(looksLikeLoginUrl('not a url')).toBe(false);
  });
});

describe('judgeSignIn', () => {
  it('treats a way out as the strongest evidence of being in', () => {
    const reading = judgeSignIn(signals({ signOutControls: ['Sign out'] }));
    expect(reading.verdict).toBe('signed-in');
    expect(reading.evidence[0]).toContain('Sign out');
  });

  it('lets a sign-out control beat a stray sign-in link on the same page', () => {
    const reading = judgeSignIn(
      signals({ signOutControls: ['Log out'], signInControls: ['Log in'], visiblePasswordFields: 1 }),
    );
    expect(reading.verdict).toBe('signed-in');
  });

  it('calls a visible password field a sign-in page', () => {
    const reading = judgeSignIn(signals({ visiblePasswordFields: 1 }));
    expect(reading.verdict).toBe('signed-out');
    expect(reading.evidence.join(' ')).toContain('password field');
  });

  it('reads a redirect to a login path as signed out, and says where it went', () => {
    const reading = judgeSignIn(
      signals({ finalUrl: 'https://example.com/login', looksLikeLoginUrl: true }),
    );
    expect(reading.verdict).toBe('signed-out');
    expect(reading.evidence[0]).toContain('redirected to https://example.com/login');
  });

  it('does not call a fragment change a redirect', () => {
    const reading = judgeSignIn(
      signals({ finalUrl: 'https://example.com/app#section', signOutControls: ['Sign out'] }),
    );
    expect(reading.evidence.join(' ')).not.toContain('redirected');
  });

  it('says unclear rather than guessing when the page shows neither', () => {
    const reading = judgeSignIn(signals());
    expect(reading.verdict).toBe('unclear');
    expect(reading.evidence[0]).toContain('no sign-in or sign-out control');
  });

  it('always gives a reason, whatever it decides', () => {
    const cases = [
      signals({ signOutControls: ['Sign out'] }),
      signals({ visiblePasswordFields: 1 }),
      signals({ looksLikeLoginUrl: true, finalUrl: 'https://example.com/login' }),
      signals({ signInControls: ['Sign in'] }),
      signals(),
    ];
    for (const input of cases) {
      expect(judgeSignIn(input).evidence.length).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Asking for a mode nothing was saved in                                      */
/* -------------------------------------------------------------------------- */

function shape(overrides: Partial<SavedAuthShape> = {}): SavedAuthShape {
  return {
    hasProfile: false,
    hasStorageState: false,
    profileDirWithoutSignIn: false,
    ...overrides,
  };
}

describe('mismatchWarning', () => {
  it('names the trap: profile mode with only a storage state saved', () => {
    const warning = mismatchWarning('grok', 'profile', shape({ hasStorageState: true }));
    expect(warning).toContain('has never been signed in');
    expect(warning).toContain('--mode storage-state');
    expect(warning).toContain('--persistent');
  });

  it('is not reassured by a directory an earlier run created', () => {
    const warning = mismatchWarning(
      'grok',
      'profile',
      shape({ hasStorageState: true, profileDirWithoutSignIn: true }),
    );
    expect(warning).toContain('carries no record of a sign-in');
    expect(warning).toContain('creates the directory');
  });

  it('still says something when nothing at all was saved', () => {
    const warning = mismatchWarning('grok', 'profile', shape());
    expect(warning).toContain('empty browser profile');
    expect(warning).toContain('--persistent');
  });

  it('points the other way round too', () => {
    const warning = mismatchWarning('grok', 'storage-state', shape({ hasProfile: true }));
    expect(warning).toContain('--mode profile');
  });

  it('says nothing when the request matches what is on disk', () => {
    expect(mismatchWarning('grok', 'profile', shape({ hasProfile: true }))).toBeUndefined();
    expect(
      mismatchWarning('grok', 'storage-state', shape({ hasStorageState: true })),
    ).toBeUndefined();
  });
});
