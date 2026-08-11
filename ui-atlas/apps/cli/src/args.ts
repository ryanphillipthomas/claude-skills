import { UiAtlasError } from '@ui-atlas/protocol';

export interface ParsedArgs {
  command: string[];
  positionals: string[];
  flags: Map<string, string | boolean>;
}

const KNOWN_BOOLEAN_FLAGS = new Set([
  'help',
  'version',
  'headless',
  'headed',
  'auto-inspect',
  'no-overlay',
  'json',
  'full-page',
  'quiet',
  'responsive',
  'open',
  'dry-run',
  'inventory',
  'trace-on-failure',
  'sample',
  'video',
  'tokens',
]);

/**
 * Small hand-rolled parser. The CLI surface is deliberately narrow, so a
 * dependency for `--flag value` parsing would not earn its place.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;

    if (token === '--') {
      positionals.push(...argv.slice(index + 1));
      break;
    }

    if (token.startsWith('--')) {
      const body = token.slice(2);
      const equals = body.indexOf('=');
      if (equals >= 0) {
        flags.set(body.slice(0, equals), body.slice(equals + 1));
        continue;
      }
      if (KNOWN_BOOLEAN_FLAGS.has(body) || body.startsWith('no-')) {
        flags.set(body, true);
        continue;
      }
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('-')) {
        flags.set(body, true);
        continue;
      }
      flags.set(body, next);
      index += 1;
      continue;
    }

    if (token.startsWith('-') && token.length > 1) {
      throw new UiAtlasError('config.invalid', `unknown short flag "${token}"; use --long-form`);
    }

    positionals.push(token);
  }

  return { command: [], positionals, flags };
}

export function flagString(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') {
    throw new UiAtlasError('config.invalid', `--${name} needs a value`);
  }
  return value;
}

export function flagBoolean(args: ParsedArgs, name: string): boolean | undefined {
  const value = args.flags.get(name);
  if (value === undefined) {
    return args.flags.get(`no-${name}`) === true ? false : undefined;
  }
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new UiAtlasError('config.invalid', `--${name} expects true or false`);
}

export function flagNumber(args: ParsedArgs, name: string): number | undefined {
  const value = flagString(args, name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new UiAtlasError('config.invalid', `--${name} expects a number, got "${value}"`);
  }
  return parsed;
}

/** Reject anything that is not an http(s) URL before we hand it to a browser. */
export function requireHttpUrl(value: string, label = 'url'): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new UiAtlasError('config.invalid', `${label} is not a valid URL: ${value}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UiAtlasError(
      'config.invalid',
      `${label} must be http or https (got ${parsed.protocol.replace(':', '')})`,
    );
  }
  return parsed.toString();
}
