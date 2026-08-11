import { describe, expect, it } from 'vitest';
import { resolveWithinRoot, routeKeyFromUrl, sanitizeSegment, toRecordPath } from '@ui-atlas/artifacts';
import { UiAtlasError } from '@ui-atlas/protocol';

describe('sanitizeSegment', () => {
  it('keeps safe characters and collapses the rest', () => {
    expect(sanitizeSegment('Buttons / Primary')).toBe('Buttons-Primary');
    expect(sanitizeSegment('hello_world.v2')).toBe('hello_world.v2');
  });

  it('never returns a traversal or empty segment', () => {
    expect(sanitizeSegment('..')).toBe('unnamed');
    expect(sanitizeSegment('.')).toBe('unnamed');
    expect(sanitizeSegment('')).toBe('unnamed');
    expect(sanitizeSegment('///')).toBe('unnamed');
    expect(sanitizeSegment('../../etc/passwd')).not.toContain('/');
  });

  it('strips combining marks rather than emitting separators', () => {
    expect(sanitizeSegment('café')).toBe('cafe');
  });

  it('avoids Windows reserved device names', () => {
    expect(sanitizeSegment('con')).toBe('con-x');
    expect(sanitizeSegment('LPT1')).toBe('LPT1-x');
  });

  it('bounds the length', () => {
    expect(sanitizeSegment('a'.repeat(400)).length).toBeLessThanOrEqual(80);
  });
});

describe('routeKeyFromUrl', () => {
  it('produces a stable, readable key per route', () => {
    expect(routeKeyFromUrl('https://example.com/')).toBe('example.com-root');
    expect(routeKeyFromUrl('https://example.com/components/buttons')).toBe(
      'example.com-components-buttons',
    );
  });

  it('separates routes that differ only by query, without leaking the query', () => {
    const a = routeKeyFromUrl('https://example.com/search?q=secret-term');
    const b = routeKeyFromUrl('https://example.com/search?q=other');
    expect(a).not.toBe(b);
    expect(a).not.toContain('secret-term');
    expect(a.startsWith('example.com-search-q')).toBe(true);
  });

  it('ignores the fragment', () => {
    expect(routeKeyFromUrl('https://example.com/a#one')).toBe(routeKeyFromUrl('https://example.com/a#two'));
  });

  it('is already a safe path segment, so sanitising it again is a no-op', () => {
    for (const url of [
      'https://example.com/',
      'https://example.com/a/b/c?d=e',
      'http://127.0.0.1:4173/states.html',
      'https://ex.com/' + 'x'.repeat(300),
      'https://ex.com/con',
    ]) {
      const key = routeKeyFromUrl(url);
      expect(sanitizeSegment(key)).toBe(key);
    }
  });

  it('degrades gracefully for a non-URL', () => {
    expect(routeKeyFromUrl('not a url')).toMatch(/^invalid-url-[0-9a-f]{8}$/);
  });
});

describe('resolveWithinRoot', () => {
  it('joins normal segments', () => {
    expect(resolveWithinRoot('/tmp/atlas', 'project', 'run', 'run.json')).toBe(
      '/tmp/atlas/project/run/run.json',
    );
  });

  it('rejects traversal out of the artifact root', () => {
    expect(() => resolveWithinRoot('/tmp/atlas', '..', 'escape')).toThrow(UiAtlasError);
    expect(() => resolveWithinRoot('/tmp/atlas', 'a/../../b')).toThrow(/escapes artifact root/);
  });

  it('rejects absolute segments', () => {
    expect(() => resolveWithinRoot('/tmp/atlas', '/etc/passwd')).toThrow(/absolute path segment/);
  });
});

describe('toRecordPath', () => {
  it('stores POSIX-style relative paths', () => {
    expect(toRecordPath('/tmp/atlas/run', '/tmp/atlas/run/screenshots/a/b/c.png')).toBe(
      'screenshots/a/b/c.png',
    );
  });
});
