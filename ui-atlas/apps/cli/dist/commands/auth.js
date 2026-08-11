import { createInterface } from 'node:readline/promises';
import { assertProfileName, authPaths, clearProfile, ensureAuthDirs, launchSession, resolveViewport, STORAGE_STATE_WARNING, writeStorageState, } from '@ui-atlas/browser';
import { UiAtlasError } from '@ui-atlas/protocol';
import { requireHttpUrl } from '../args.js';
import { loadCliConfig } from '../config.js';
export const AUTH_HELP = `
ui-atlas auth save <profile-name> <url>
ui-atlas auth clear <profile-name>

  "save" opens a browser at <url> so you can sign in by hand, then stores the
  resulting Playwright storage state under ~/.ui-atlas/storage-state with
  owner-only permissions. Nothing is captured and nothing is submitted for you.

  --headless   fail fast instead of waiting for an interactive sign-in
`.trim();
export async function runAuth(args, logger) {
    const action = args.positionals[1];
    if (action === 'save')
        return saveProfile(args, logger);
    if (action === 'clear')
        return clearStoredProfile(args, logger);
    throw new UiAtlasError('config.invalid', `unknown auth action "${String(action)}"\n\n${AUTH_HELP}`);
}
async function saveProfile(args, logger) {
    const name = args.positionals[2];
    const rawUrl = args.positionals[3];
    if (name === undefined || rawUrl === undefined) {
        throw new UiAtlasError('config.invalid', `auth save needs a profile name and a URL\n\n${AUTH_HELP}`);
    }
    assertProfileName(name);
    const url = requireHttpUrl(rawUrl);
    const loaded = await loadCliConfig(args, { browser: { mode: 'clean' } });
    if (loaded.config.browser.headless) {
        throw new UiAtlasError('config.invalid', 'auth save needs a visible browser so you can sign in; drop --headless');
    }
    await ensureAuthDirs();
    const viewport = resolveViewport({
        name: 'auth',
        width: loaded.config.viewport.width,
        height: loaded.config.viewport.height,
        mode: 'desktop',
    });
    const session = await launchSession({ config: loaded.config.browser, viewport });
    try {
        const page = session.context.pages()[0] ?? (await session.context.newPage());
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        logger.info(`Sign in at ${url} in the browser window that just opened.`);
        logger.info('When you are done, come back here and press Enter to save the session.');
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
            await rl.question('Press Enter once you are signed in… ');
        }
        finally {
            rl.close();
        }
        const state = await session.context.storageState();
        const saved = await writeStorageState(name, state);
        logger.info(`saved ${String(saved.cookieCount)} cookies and ${String(saved.originCount)} origins to ${saved.path}`);
        logger.warn(STORAGE_STATE_WARNING);
        logger.info(`use it with: ui-atlas inspect <url> --mode storage-state --profile ${name}`);
        return 0;
    }
    finally {
        await session.close();
    }
}
async function clearStoredProfile(args, logger) {
    const name = args.positionals[2];
    if (name === undefined) {
        throw new UiAtlasError('config.invalid', `auth clear needs a profile name\n\n${AUTH_HELP}`);
    }
    assertProfileName(name);
    const paths = authPaths();
    const result = await clearProfile(name, paths);
    if (!result.removedProfile && !result.removedStorageState) {
        logger.warn(`nothing stored for profile "${name}"`);
        return 0;
    }
    if (result.removedStorageState)
        logger.info(`removed ${paths.storageStatePath(name)}`);
    if (result.removedProfile)
        logger.info(`removed ${paths.profileDir(name)}`);
    return 0;
}
//# sourceMappingURL=auth.js.map