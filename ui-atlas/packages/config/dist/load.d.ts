import { z } from 'zod';
import { type UiAtlasConfig } from './schema.js';
export declare const CONFIG_FILE_NAMES: readonly ["ui-atlas.config.yml", "ui-atlas.config.yaml", "ui-atlas.config.json", ".ui-atlas.yml", ".ui-atlas.yaml"];
export interface LoadedConfig {
    config: UiAtlasConfig;
    /** Absolute path to the file the config came from, if any. */
    sourcePath: string | undefined;
    /** Directory that relative paths in the config resolve against. */
    baseDir: string;
}
/**
 * Recursive merge where `override` wins. Arrays are replaced wholesale — a user
 * setting `viewports` means "use exactly these", not "append to the defaults".
 */
export declare function deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T;
/** Walk up from `startDir` looking for a known config file name. */
export declare function findConfigFile(startDir: string, stopAt?: string): string | undefined;
export declare function parseConfigText(text: string, sourcePath: string): unknown;
/** Turn a zod failure into a readable, actionable message. */
export declare function formatZodError(error: z.ZodError, label: string): string;
export declare function validateConfig(raw: unknown, label?: string): UiAtlasConfig;
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
export declare function loadConfig(options?: LoadConfigOptions): Promise<LoadedConfig>;
/** Absolute artifact root for a loaded config. */
export declare function resolveOutputRoot(loaded: LoadedConfig): string;
//# sourceMappingURL=load.d.ts.map