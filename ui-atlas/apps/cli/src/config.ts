import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import { projectSlugFromUrl } from '@ui-atlas/artifacts';
import { loadConfig, type UiAtlasConfig } from '@ui-atlas/config';
import { flagBoolean, flagNumber, flagString, type ParsedArgs } from './args.js';

export const TOOL_VERSION = await readToolVersion();

async function readToolVersion(): Promise<string> {
  try {
    const path = fileURLToPath(new URL('../package.json', import.meta.url));
    const parsed = JSON.parse(await readFile(path, 'utf8')) as { version?: string };
    return parsed.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export interface CliConfig {
  config: UiAtlasConfig;
  outputRoot: string;
  sourcePath: string | undefined;
  /** Whether `config.project` was chosen or merely defaulted. */
  projectSource: 'override' | 'file' | 'default';
}

/**
 * The project a URL belongs in.
 *
 * A project is a website, so the directory is named after the site unless
 * somebody said otherwise — with `--project`, or with `project:` in a config
 * file. Both of those are a deliberate choice and neither is overridden here.
 */
export function projectForUrl(loaded: CliConfig, url: string): string {
  return loaded.projectSource === 'default' ? projectSlugFromUrl(url) : loaded.config.project;
}

/**
 * Apply `projectForUrl` to a loaded config, so a command can pass one object on
 * to the session without the two disagreeing about which project it is in.
 */
export function withProjectForUrl(loaded: CliConfig, url: string): CliConfig {
  const project = projectForUrl(loaded, url);
  if (project === loaded.config.project) return loaded;
  return { ...loaded, config: { ...loaded.config, project } };
}

/**
 * Config precedence: explicit CLI flags beat the config file, which beats the
 * built-in defaults. Nothing here reads environment variables for secrets.
 */
export async function loadCliConfig(
  args: ParsedArgs,
  extraOverrides: Record<string, unknown> = {},
): Promise<CliConfig> {
  const overrides: Record<string, unknown> = { ...extraOverrides };

  const project = flagString(args, 'project');
  if (project !== undefined) overrides['project'] = project;

  const output = flagString(args, 'output');
  if (output !== undefined) overrides['outputRoot'] = output;

  const viewport: Record<string, unknown> = {};
  const width = flagNumber(args, 'width');
  if (width !== undefined) viewport['width'] = width;
  const height = flagNumber(args, 'height');
  if (height !== undefined) viewport['height'] = height;
  if (Object.keys(viewport).length > 0) overrides['viewport'] = viewport;

  const browser: Record<string, unknown> = {};
  const mode = flagString(args, 'mode');
  if (mode !== undefined) browser['mode'] = mode;
  const profile = flagString(args, 'profile');
  if (profile !== undefined) browser['profile'] = profile;
  const cdp = flagString(args, 'cdp-endpoint');
  if (cdp !== undefined) browser['cdpEndpoint'] = cdp;
  const headless = flagBoolean(args, 'headless') ?? envHeadless();
  if (headless !== undefined) browser['headless'] = headless;
  if (flagBoolean(args, 'headed') === true) browser['headless'] = false;
  if (Object.keys(browser).length > 0) overrides['browser'] = browser;

  const configPath = flagString(args, 'config');
  const loaded = await loadConfig({
    ...(configPath === undefined ? {} : { configPath }),
    overrides,
  });

  const outputRoot = isAbsolute(loaded.config.outputRoot)
    ? loaded.config.outputRoot
    : resolve(loaded.baseDir, loaded.config.outputRoot);

  return {
    config: loaded.config,
    outputRoot,
    sourcePath: loaded.sourcePath,
    projectSource: loaded.projectSource,
  };
}

/** `UI_ATLAS_HEADLESS=1` lets CI run the same commands without a display. */
function envHeadless(): boolean | undefined {
  const value = process.env['UI_ATLAS_HEADLESS'];
  if (value === undefined) return undefined;
  return value === '1' || value.toLowerCase() === 'true';
}
