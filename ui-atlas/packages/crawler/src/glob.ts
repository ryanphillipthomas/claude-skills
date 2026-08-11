/**
 * The small path-glob dialect used by `include`, `exclude` and `denyPaths`.
 * Deliberately tiny — no braces, no character classes, no negation — because
 * these patterns decide what an automated crawler is allowed to visit, and a
 * rule an operator cannot predict from reading it is a safety problem.
 *
 * | Pattern    | Meaning                                          |
 * | ---------- | ------------------------------------------------ |
 * | `*`        | any run of characters within one path segment    |
 * | `?`        | exactly one character, never `/`                 |
 * | `**`       | any run of characters, crossing `/`              |
 * | `/dir/**`  | `/dir` **and** everything under it                |
 *
 * That last row is the one deviation from common glob semantics, and it is
 * deliberate: `exclude: ['/checkout/**']` that still crawled `/checkout` would
 * be a trap.
 */

const SPECIAL = /[.+^${}()|[\]\\]/g;

function escapeLiteral(text: string): string {
  return text.replace(SPECIAL, '\\$&');
}

function translate(pattern: string): string {
  let out = '';
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index];
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        out += '.*';
        index += 2;
        continue;
      }
      out += '[^/]*';
      index += 1;
      continue;
    }
    if (char === '?') {
      out += '[^/]';
      index += 1;
      continue;
    }
    out += escapeLiteral(char as string);
    index += 1;
  }
  return out;
}

const cache = new Map<string, RegExp>();

export function globToRegExp(pattern: string): RegExp {
  const cached = cache.get(pattern);
  if (cached !== undefined) return cached;

  let body = pattern;
  let suffix = '';
  if (body.endsWith('/**')) {
    body = body.slice(0, -3);
    // Optional, so `/checkout/**` covers `/checkout` itself.
    suffix = '(?:/.*)?';
  }

  const compiled = new RegExp(`^${translate(body)}${suffix}$`);
  cache.set(pattern, compiled);
  return compiled;
}

/** The first pattern that matches, so callers can report *which* rule fired. */
export function firstMatchingGlob(path: string, patterns: string[]): string | undefined {
  for (const pattern of patterns) {
    if (globToRegExp(pattern).test(path)) return pattern;
  }
  return undefined;
}
