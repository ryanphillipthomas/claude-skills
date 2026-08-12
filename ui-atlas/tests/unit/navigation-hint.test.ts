import { describe, expect, it } from 'vitest';
import { navigationHint } from '../../apps/cli/src/navigation-hint.js';

const REFUSED = 'page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/';

describe('navigationHint', () => {
  it('says the dev server is not running when localhost refuses', () => {
    const hint = navigationHint(REFUSED, 'http://127.0.0.1:4173/');
    expect(hint).toContain('nothing is listening on 127.0.0.1:4173');
    expect(hint).toContain('npm run fixtures');
  });

  it('recognises every spelling of the local machine', () => {
    for (const host of ['localhost:3000', '127.0.0.1:3000', 'app.localhost:3000']) {
      expect(navigationHint(REFUSED, `http://${host}/`)).toContain('nothing is listening');
    }
  });

  it('does not tell someone to start a dev server for a remote host', () => {
    const hint = navigationHint(REFUSED, 'https://example.com/');
    expect(hint).toContain('refused the connection');
    expect(hint).not.toContain('npm run fixtures');
  });

  it('separates a name that does not resolve from a port that is closed', () => {
    const hint = navigationHint('net::ERR_NAME_NOT_RESOLVED', 'https://exmaple.com/');
    expect(hint).toContain('exmaple.com');
    expect(hint).toContain('could not be resolved');
  });

  it('points a certificate failure at the setting that fixes it', () => {
    const hint = navigationHint('net::ERR_CERT_AUTHORITY_INVALID', 'https://localhost:8443/');
    expect(hint).toContain('ignoreHttpsErrors');
  });

  it('suggests the http/https mix-up when the connection is reset', () => {
    const hint = navigationHint('net::ERR_EMPTY_RESPONSE', 'https://127.0.0.1:4173/');
    expect(hint).toContain('plain http');
  });

  it('says nothing when it has nothing useful to add', () => {
    // A hint that fires on everything teaches people to ignore hints.
    expect(navigationHint('something else entirely', 'http://127.0.0.1:4173/')).toBeUndefined();
  });

  it('does not throw on a value that is not a URL', () => {
    expect(() => navigationHint(REFUSED, 'not a url')).not.toThrow();
  });
});
