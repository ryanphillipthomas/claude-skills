import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import { loadConfig } from '@ui-atlas/config';
import { flagBoolean, flagNumber, flagString } from './args.js';
export const TOOL_VERSION = await readToolVersion();
async function readToolVersion() {
    try {
        const path = fileURLToPath(new URL('../package.json', import.meta.url));
        const parsed = JSON.parse(await readFile(path, 'utf8'));
        return parsed.version ?? '0.0.0';
    }
    catch {
        return '0.0.0';
    }
}
/**
 * Config precedence: explicit CLI flags beat the config file, which beats the
 * built-in defaults. Nothing here reads environment variables for secrets.
 */
export async function loadCliConfig(args, extraOverrides = {}) {
    const overrides = { ...extraOverrides };
    const project = flagString(args, 'project');
    if (project !== undefined)
        overrides['project'] = project;
    const output = flagString(args, 'output');
    if (output !== undefined)
        overrides['outputRoot'] = output;
    const viewport = {};
    const width = flagNumber(args, 'width');
    if (width !== undefined)
        viewport['width'] = width;
    const height = flagNumber(args, 'height');
    if (height !== undefined)
        viewport['height'] = height;
    if (Object.keys(viewport).length > 0)
        overrides['viewport'] = viewport;
    const browser = {};
    const mode = flagString(args, 'mode');
    if (mode !== undefined)
        browser['mode'] = mode;
    const profile = flagString(args, 'profile');
    if (profile !== undefined)
        browser['profile'] = profile;
    const cdp = flagString(args, 'cdp-endpoint');
    if (cdp !== undefined)
        browser['cdpEndpoint'] = cdp;
    const headless = flagBoolean(args, 'headless') ?? envHeadless();
    if (headless !== undefined)
        browser['headless'] = headless;
    if (flagBoolean(args, 'headed') === true)
        browser['headless'] = false;
    if (Object.keys(browser).length > 0)
        overrides['browser'] = browser;
    const configPath = flagString(args, 'config');
    const loaded = await loadConfig({
        ...(configPath === undefined ? {} : { configPath }),
        overrides,
    });
    const outputRoot = isAbsolute(loaded.config.outputRoot)
        ? loaded.config.outputRoot
        : resolve(loaded.baseDir, loaded.config.outputRoot);
    return { config: loaded.config, outputRoot, sourcePath: loaded.sourcePath };
}
/** `UI_ATLAS_HEADLESS=1` lets CI run the same commands without a display. */
function envHeadless() {
    const value = process.env['UI_ATLAS_HEADLESS'];
    if (value === undefined)
        return undefined;
    return value === '1' || value.toLowerCase() === 'true';
}
//# sourceMappingURL=config.js.map