import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { UiAtlasError } from '@ui-atlas/protocol';
import { UiAtlasConfigSchema } from './schema.js';
export const CONFIG_FILE_NAMES = [
    'ui-atlas.config.yml',
    'ui-atlas.config.yaml',
    'ui-atlas.config.json',
    '.ui-atlas.yml',
    '.ui-atlas.yaml',
];
/** Plain-object check that rejects arrays and class instances. */
function isPlainObject(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
/**
 * Recursive merge where `override` wins. Arrays are replaced wholesale — a user
 * setting `viewports` means "use exactly these", not "append to the defaults".
 */
export function deepMerge(base, override) {
    const out = { ...base };
    for (const [key, value] of Object.entries(override)) {
        if (FORBIDDEN_KEYS.has(key))
            continue;
        if (value === undefined)
            continue;
        const existing = out[key];
        if (isPlainObject(existing) && isPlainObject(value)) {
            out[key] = deepMerge(existing, value);
        }
        else {
            out[key] = value;
        }
    }
    return out;
}
/** Walk up from `startDir` looking for a known config file name. */
export function findConfigFile(startDir, stopAt) {
    let dir = resolve(startDir);
    const stop = stopAt === undefined ? undefined : resolve(stopAt);
    for (;;) {
        for (const name of CONFIG_FILE_NAMES) {
            const candidate = resolve(dir, name);
            if (existsSync(candidate))
                return candidate;
        }
        if (stop !== undefined && dir === stop)
            return undefined;
        const parent = dirname(dir);
        if (parent === dir)
            return undefined;
        dir = parent;
    }
}
export function parseConfigText(text, sourcePath) {
    try {
        if (sourcePath.endsWith('.json'))
            return JSON.parse(text);
        return parseYaml(text);
    }
    catch (cause) {
        throw new UiAtlasError('config.invalid', `could not parse ${sourcePath}`, {
            detail: { sourcePath },
            cause,
        });
    }
}
/** Turn a zod failure into a readable, actionable message. */
export function formatZodError(error, label) {
    const lines = error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '<root>';
        return `  - ${path}: ${issue.message}`;
    });
    return `${label} is invalid:\n${lines.join('\n')}`;
}
export function validateConfig(raw, label = 'configuration') {
    const parsed = UiAtlasConfigSchema.safeParse(raw ?? {});
    if (!parsed.success) {
        throw new UiAtlasError('config.invalid', formatZodError(parsed.error, label), {
            detail: { issues: parsed.error.issues },
        });
    }
    return parsed.data;
}
export async function loadConfig(options = {}) {
    const cwd = resolve(options.cwd ?? process.cwd());
    let sourcePath;
    if (options.configPath !== undefined) {
        sourcePath = isAbsolute(options.configPath)
            ? options.configPath
            : resolve(cwd, options.configPath);
        if (!existsSync(sourcePath)) {
            throw new UiAtlasError('config.invalid', `config file not found: ${sourcePath}`, {
                detail: { sourcePath },
            });
        }
    }
    else if (options.skipDiscovery !== true) {
        sourcePath = findConfigFile(cwd);
    }
    let fileData = {};
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
export function resolveOutputRoot(loaded) {
    const { outputRoot } = loaded.config;
    return isAbsolute(outputRoot) ? outputRoot : resolve(loaded.baseDir, outputRoot);
}
//# sourceMappingURL=load.js.map