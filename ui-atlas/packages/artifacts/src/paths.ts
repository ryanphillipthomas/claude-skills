import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { UiAtlasError } from '@ui-atlas/protocol';

const MAX_SEGMENT_LENGTH = 80;

/** Windows reserved device names, rejected on every platform for portability. */
const RESERVED_NAMES = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

/**
 * Reduce arbitrary text to one safe path segment. Never returns an empty
 * string, `.`, `..`, or anything containing a separator.
 */
export function sanitizeSegment(input: string, fallback = 'unnamed'): string {
  const collapsed = input
    .normalize('NFKD')
    // Drop combining marks left by NFKD so accented letters keep their base form.
    .replace(/\p{M}+/gu, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '');

  // Trim *after* truncating so the result is a fixed point: sanitising an
  // already-sanitised segment must return it unchanged, otherwise a record's
  // routeKey and its on-disk directory could drift apart.
  let out = collapsed.slice(0, MAX_SEGMENT_LENGTH).replace(/[-.]+$/, '');
  if (out.length === 0 || out === '.' || out === '..') out = fallback;
  if (RESERVED_NAMES.has(out.toLowerCase())) out = `${out}-x`;
  return out;
}

function shortHash(input: string, length = 8): string {
  return createHash('sha256').update(input).digest('hex').slice(0, length);
}

/**
 * Stable, human-readable key for a URL, used as the per-route artifact folder.
 * Differing query strings get distinct keys so they cannot collide, but the
 * query itself is not written into the path (it may carry user data).
 */
export function routeKeyFromUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return `invalid-url-${shortHash(rawUrl)}`;
  }

  const segments = parsed.pathname.split('/').filter((part) => part.length > 0);
  const base = segments.length === 0 ? 'root' : segments.join('-');
  const host = parsed.host;
  const suffix = parsed.search.length > 0 ? `-q${shortHash(parsed.search)}` : '';

  // Sanitised here so the key is already a valid path segment: the writer's own
  // sanitising pass then leaves it untouched.
  return sanitizeSegment(`${host}-${base}${suffix}`, 'route');
}

/**
 * Join `segments` under `root`, guaranteeing the result stays inside `root`.
 * Absolute or traversing segments are rejected rather than silently clamped.
 */
export function resolveWithinRoot(root: string, ...segments: string[]): string {
  const absoluteRoot = resolve(root);
  for (const segment of segments) {
    if (isAbsolute(segment)) {
      throw new UiAtlasError('artifact.path-escape', `absolute path segment rejected: ${segment}`, {
        detail: { root: absoluteRoot, segment },
      });
    }
  }
  const target = resolve(absoluteRoot, ...segments);
  const rel = relative(absoluteRoot, target);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new UiAtlasError('artifact.path-escape', `path escapes artifact root: ${target}`, {
      detail: { root: absoluteRoot, target },
    });
  }
  return target;
}

/** POSIX-style relative path for storage inside records (portable across OSes). */
export function toRecordPath(root: string, absolutePath: string): string {
  return relative(resolve(root), resolve(absolutePath)).split(sep).join('/');
}
