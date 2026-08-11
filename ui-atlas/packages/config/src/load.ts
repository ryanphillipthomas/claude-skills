import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { UiAtlasError } from '@ui-atlas/protocol';
import { UiAtlasConfigSchema, type UiAtlasConfig } from './schema.js';

export const CONFIG_FILE_NAMES = [
  'ui-atlas.config.yml',
  'ui-atlas.config.yaml',
  'ui-atlas.config.json',
  '.ui-atlas.yml',
  '.ui-atlas.yaml',
] as const;

export interface LoadedConfig {
  config: UiAtlasConfig;
  /** Absolute path to the file the config came from, if any. */
  sourcePath: string | undefined;
  /** Directory that relative paths in the config resolve against. */
  baseDir: string;
}

/** Plain-object check that rejects arrays and class instances. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursive merge where `override` wins. Arrays are replaced wholesale — a user
 * setting `viewports` means "use exactly these", not "append to the defaults".
 */
export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (value === undefined) continue;
    const existing = out[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      out[key] = deepMerge(existing, value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/** Walk up from `startDir` looking for a known config file name. */
export function findConfigFile(startDir: string, stopAt?: string): string | undefined {
  let dir = resolve(startDir);
  const stop = stopAt === undefined ? undefined : resolve(stopAt);
  for (;;) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = resolve(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    if (stop !== undefined && dir === stop) return undefined;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function parseConfigText(text: string, sourcePath: string): unknown {
  try {
    if (sourcePath.endsWith('.json')) return JSON.parse(text) as unknown;
    return parseYaml(text) as unknown;
  } catch (cause) {
    throw new UiAtlasError('config.invalid', `could not parse ${sourcePath}`, {
      detail: { sourcePath },
      cause,
    });
  }
}

/** Turn a zod failure into a readable, actionable message. */
export function formatZodError(error: z.ZodError, label: string): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
    return `  - ${path}: ${issue.message}`;
  });
  return `${label} is invalid:\n${lines.join('\n')}`;
}

export function validateConfig(raw: unknown, label = 'configuration'): UiAtlasConfig {
  const parsed = UiAtlasConfigSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new UiAtlasError('config.invalid', formatZodError(parsed.error, label), {
      detail: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}

export interface LoadConfigOptions {
  /** Explicit config file path. When set, a missing file is an error. */
  configPath?: string | undefined;
  /** Directory to start searching from. Defaults to `process.cwd()`. */
  cwd?: string | undefined;
  /** CLI/programmatic overrides applied on top of the file contents. */
  overrides?: Record<string, unknown> | undefined;
  /** Skip filesystem discovery entirely (used by tests). */
  skipDiscovery?: boolean | undefined;
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadedConfig> {
  const cwd = resolve(options.cwd ?? process.cwd());
  let sourcePath: string | undefined;

  if (options.configPath !== undefined) {
    sourcePath = isAbsolute(options.configPath)
      ? options.configPath
      : resolve(cwd, options.configPath);
    if (!existsSync(sourcePath)) {
      throw new UiAtlasError('config.invalid', `config file not found: ${sourcePath}`, {
        detail: { sourcePath },
      });
    }
  } else if (options.skipDiscovery !== true) {
    sourcePath = findConfigFile(cwd);
  }

  let fileData: Record<string, unknown> = {};
  if (sourcePath !== undefined) {
    const text = await readFile(sourcePath, 'utf8');
    const parsed = parseConfigText(text, sourcePath);
    if (parsed !== null && parsed !== undefined) {
      if (!isPlainObject(parsed)) {
        throw new UiAtlasError('config.invalid', `${sourcePath} must contain a mapping`, {
          detail: { sourcePath },
        });
      }
      fileData = parsed;
    }
  }

  const merged = options.overrides ? deepMerge(fileData, options.overrides) : fileData;
  const config = validateConfig(merged, sourcePath ?? 'configuration');
  return {
    config,
    sourcePath,
    baseDir: sourcePath === undefined ? cwd : dirname(sourcePath),
  };
}

/** Absolute artifact root for a loaded config. */
export function resolveOutputRoot(loaded: LoadedConfig): string {
  const { outputRoot } = loaded.config;
  return isAbsolute(outputRoot) ? outputRoot : resolve(loaded.baseDir, outputRoot);
}
