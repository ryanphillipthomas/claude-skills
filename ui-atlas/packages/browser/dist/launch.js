import { chromium } from 'playwright';
import { UiAtlasError } from '@ui-atlas/protocol';
import { authPaths, ensureAuthDirs, readStorageState, STORAGE_STATE_WARNING } from './auth.js';
import { emulationOptions } from './viewport.js';
/**
 * Launch flags. These improve capture determinism only — none of them relax a
 * browser security boundary, and the inspector never needs them to inject.
 */
const DETERMINISM_ARGS = [
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
];
function baseContextOptions(config, viewport, browserVersion) {
    const emulation = emulationOptions(viewport, browserVersion);
    return {
        ...emulation,
        locale: config.locale,
        colorScheme: config.colorScheme,
        reducedMotion: config.reducedMotion,
        ignoreHTTPSErrors: config.ignoreHttpsErrors,
        ...(config.timezoneId === undefined ? {} : { timezoneId: config.timezoneId }),
    };
}
async function applyContextExtras(context, options) {
    for (const binding of options.bindings ?? []) {
        await context.exposeBinding(binding.name, binding.handler);
    }
    for (const script of options.initScripts ?? []) {
        await context.addInitScript({ content: script.content });
    }
    context.setDefaultNavigationTimeout(options.config.navigationTimeoutMs);
}
/**
 * Launch a browser in one of the four supported modes. `clean` is the default
 * and never touches the user's own Chrome data directory.
 */
export async function launchSession(options) {
    const { config } = options;
    switch (config.mode) {
        case 'clean':
            return launchClean(options);
        case 'profile':
            return launchProfile(options);
        case 'storage-state':
            return launchStorageState(options);
        case 'attach':
            return attachOverCdp(options);
        default: {
            const exhaustive = config.mode;
            throw new UiAtlasError('browser.launch-failed', `unknown browser mode ${String(exhaustive)}`);
        }
    }
}
async function launchBrowser(config) {
    try {
        return await chromium.launch({
            headless: config.headless,
            slowMo: config.slowMoMs,
            args: DETERMINISM_ARGS,
        });
    }
    catch (cause) {
        throw new UiAtlasError('browser.launch-failed', 'could not launch bundled Chromium', { cause });
    }
}
async function launchClean(options) {
    const browser = await launchBrowser(options.config);
    const context = await browser.newContext(baseContextOptions(options.config, options.viewport, browser.version()));
    await applyContextExtras(context, options);
    return {
        mode: 'clean',
        browser,
        context,
        browserVersion: browser.version(),
        headless: options.config.headless,
        warnings: [],
        close: async () => {
            await context.close().catch(() => undefined);
            await browser.close().catch(() => undefined);
        },
    };
}
async function launchProfile(options) {
    const { config } = options;
    if (config.profile === undefined) {
        throw new UiAtlasError('config.invalid', 'browser.mode "profile" requires browser.profile');
    }
    const paths = authPaths();
    await ensureAuthDirs(paths);
    const userDataDir = paths.profileDir(config.profile);
    let context;
    try {
        context = await chromium.launchPersistentContext(userDataDir, {
            headless: config.headless,
            slowMo: config.slowMoMs,
            args: DETERMINISM_ARGS,
            ...baseContextOptions(config, options.viewport),
        });
    }
    catch (cause) {
        throw new UiAtlasError('browser.launch-failed', 'could not open the UI Atlas profile', {
            detail: { profile: config.profile },
            cause,
        });
    }
    await applyContextExtras(context, options);
    return {
        mode: 'profile',
        browser: context.browser() ?? undefined,
        context,
        browserVersion: context.browser()?.version(),
        headless: config.headless,
        warnings: [
            `Using the dedicated UI Atlas profile "${config.profile}". ${STORAGE_STATE_WARNING}`,
        ],
        close: async () => {
            await context.close().catch(() => undefined);
        },
    };
}
async function launchStorageState(options) {
    const { config } = options;
    if (config.profile === undefined) {
        throw new UiAtlasError('config.invalid', 'browser.mode "storage-state" requires browser.profile');
    }
    const statePath = await readStorageState(config.profile);
    const browser = await launchBrowser(config);
    const context = await browser.newContext({
        ...baseContextOptions(config, options.viewport, browser.version()),
        storageState: statePath,
    });
    await applyContextExtras(context, options);
    return {
        mode: 'storage-state',
        browser,
        context,
        browserVersion: browser.version(),
        headless: config.headless,
        warnings: [`Seeded an isolated context from profile "${config.profile}". ${STORAGE_STATE_WARNING}`],
        close: async () => {
            await context.close().catch(() => undefined);
            await browser.close().catch(() => undefined);
        },
    };
}
/**
 * Experimental. Attaching to an already-running Chromium gives lower fidelity:
 * the target's own extensions, flags and profile all affect rendering, and we
 * cannot guarantee determinism.
 */
async function attachOverCdp(options) {
    const { config } = options;
    if (config.cdpEndpoint === undefined) {
        throw new UiAtlasError('config.invalid', 'browser.mode "attach" requires browser.cdpEndpoint');
    }
    let browser;
    try {
        browser = await chromium.connectOverCDP(config.cdpEndpoint);
    }
    catch (cause) {
        throw new UiAtlasError('browser.launch-failed', 'could not attach over CDP', {
            detail: { cdpEndpoint: config.cdpEndpoint },
            cause,
        });
    }
    const existing = browser.contexts()[0];
    const context = existing ?? (await browser.newContext());
    await applyContextExtras(context, options);
    return {
        mode: 'attach',
        browser,
        context,
        browserVersion: browser.version(),
        headless: false,
        warnings: [
            'attach mode is experimental: the attached browser\'s extensions, flags and profile ' +
                'affect rendering, so captures are less deterministic than clean mode.',
        ],
        close: async () => {
            // Never close a browser we did not start.
            await browser.close().catch(() => undefined);
        },
    };
}
//# sourceMappingURL=launch.js.map