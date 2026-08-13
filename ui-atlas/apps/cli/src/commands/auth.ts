import { createInterface } from 'node:readline/promises';
import type { Page } from 'playwright';
import {
  assertProfileName,
  assessStorage,
  authPaths,
  clearProfile,
  ensureAuthDirs,
  judgeSignIn,
  launchSession,
  probeSignIn,
  probeStorage,
  resolveViewport,
  savedAuthShape,
  STORAGE_STATE_WARNING,
  writeProfileMarker,
  writeStorageState,
  type SignInReading,
} from '@ui-atlas/browser';
import { UiAtlasError, type BrowserMode } from '@ui-atlas/protocol';
import { flagBoolean, flagNumber, requireHttpUrl, type ParsedArgs } from '../args.js';
import { loadCliConfig } from '../config.js';
import type { Logger } from '../logger.js';

export const AUTH_HELP = `
ui-atlas auth save <profile-name> <url>
ui-atlas auth check <profile-name> <url>
ui-atlas auth clear <profile-name>

  "save" opens a browser at <url> so you can sign in by hand. Nothing is typed
  for you and nothing is submitted for you.

  Two ways to keep the result:

    (default)     a Playwright storage state under ~/.ui-atlas/storage-state.
                  Carries cookies and localStorage — and nothing else.
    --persistent  a real browser profile under ~/.ui-atlas/profiles. Carries
                  IndexedDB, sessionStorage and service workers too, which is
                  where many sign-ins actually live.

  "save" inspects the signed-in page and tells you which one this site needs.

  "check" opens <url> with a saved profile and reports whether you are still
  signed in. Exit code 1 means signed out, so it can gate a script.

  --persistent   save into (or check) a real browser profile
  --headless     "check" only; "save" always needs a visible browser
  --wait-for-signin
                 "save" only. Watch the page instead of waiting for Enter, and
                 save as soon as it reads as signed in. For callers with no
                 terminal to press Enter in, such as the launcher.
  --wait-timeout <seconds>
                 how long --wait-for-signin waits before giving up (default 300)
`.trim();

export async function runAuth(args: ParsedArgs, logger: Logger): Promise<number> {
  const action = args.positionals[1];
  if (action === 'save') return saveProfile(args, logger);
  if (action === 'check') return checkProfile(args, logger);
  if (action === 'clear') return clearStoredProfile(args, logger);
  throw new UiAtlasError('config.invalid', `unknown auth action "${String(action)}"\n\n${AUTH_HELP}`);
}

function requireNameAndUrl(args: ParsedArgs, action: string): { name: string; url: string } {
  const name = args.positionals[2];
  const rawUrl = args.positionals[3];
  if (name === undefined || rawUrl === undefined) {
    throw new UiAtlasError(
      'config.invalid',
      `auth ${action} needs a profile name and a URL\n\n${AUTH_HELP}`,
    );
  }
  assertProfileName(name);
  return { name, url: requireHttpUrl(rawUrl) };
}

async function saveProfile(args: ParsedArgs, logger: Logger): Promise<number> {
  const { name, url } = requireNameAndUrl(args, 'save');
  const persistent = flagBoolean(args, 'persistent') === true;

  const loaded = await loadCliConfig(args, {
    browser: persistent ? { mode: 'profile', profile: name } : { mode: 'clean' },
  });
  if (loaded.config.browser.headless) {
    throw new UiAtlasError(
      'config.invalid',
      'auth save needs a visible browser so you can sign in; drop --headless',
    );
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

    // Two ways to know you are done. Pressing Enter is the right one at a
    // terminal; watching the page is the only one available to a caller that
    // has no terminal to press it in, such as the launcher.
    const reading = (flagBoolean(args, 'wait-for-signin') ?? false)
      ? await waitForSignedIn(page, url, logger, (flagNumber(args, 'wait-timeout') ?? 300) * 1000)
      : await confirmByEnter(page, url, logger);

    if (reading.verdict !== 'signed-out') {
      logger.info(`sign-in check: ${reading.verdict} (${reading.evidence[0] ?? ''})`);
    }

    const state = await session.context.storageState();
    const cookieCount = Array.isArray(state.cookies) ? state.cookies.length : 0;
    const assessment = assessStorage(await probeStorage(page), cookieCount);

    if (persistent) {
      const dir = authPaths().profileDir(name);
      // Recorded explicitly, because the directory's existence proves nothing:
      // any `--mode profile` run creates one.
      await writeProfileMarker(name, url);
      logger.info(`saved the browser profile at ${dir}`);
      if (assessment.dropped.length > 0) {
        logger.info(`it carries what a storage state would drop: ${assessment.dropped.join('; ')}`);
      }
      logger.warn(STORAGE_STATE_WARNING);
      logger.info(`use it with: ui-atlas inspect <url> --mode profile --profile ${name}`);
      logger.info(`check it later with: ui-atlas auth check ${name} ${url}`);
      return 0;
    }

    const saved = await writeStorageState(name, state);
    logger.info(
      `saved ${String(saved.cookieCount)} cookies and ${String(saved.originCount)} origins to ${saved.path}`,
    );

    // The whole point of the probe: say now, while it is cheap to redo, that
    // this saved state is missing the part the site actually signs you in with.
    if (assessment.recommendPersistent) {
      logger.warn(`${assessment.summary}.`);
      logger.warn(`a storage state cannot carry: ${assessment.dropped.join('; ')}`);
      logger.warn('This profile will probably be signed out when you use it. Save it again with:');
      logger.warn(`  ui-atlas auth save ${name} ${url} --persistent`);
      logger.warn('and then use --mode profile instead of --mode storage-state.');
    }

    logger.warn(STORAGE_STATE_WARNING);
    logger.info(`use it with: ui-atlas inspect <url> --mode storage-state --profile ${name}`);
    logger.info(`check it later with: ui-atlas auth check ${name} ${url}`);
    return 0;
  } finally {
    await session.close();
  }
}

/**
 * Ten seconds of checking, instead of twenty minutes of crawling and a stack of
 * screenshots of a login wall.
 */
async function checkProfile(args: ParsedArgs, logger: Logger): Promise<number> {
  const { name, url } = requireNameAndUrl(args, 'check');
  const mode = resolveSavedMode(args, name);

  const loaded = await loadCliConfig(args, { browser: { mode, profile: name } });
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
    const reading = judgeSignIn(await probeSignIn(page, url));

    logger.info(`profile "${name}" (${mode}) at ${url}`);
    logger.info(`  ${reading.verdict}`);
    for (const line of reading.evidence) logger.info(`  ${line}`);

    if (reading.verdict === 'signed-out') {
      logger.warn(`sign in again with: ui-atlas auth save ${name} ${url}${mode === 'profile' ? ' --persistent' : ''}`);
      return 1;
    }
    if (reading.verdict === 'unclear') {
      logger.warn('the page shows neither a way in nor a way out; open it yourself to be sure');
    }
    return 0;
  } finally {
    await session.close();
  }
}

/**
 * Use whichever the profile was actually saved as. Guessing wrong here would
 * report "signed out" for a perfectly good profile.
 */
function resolveSavedMode(args: ParsedArgs, name: string): BrowserMode {
  if (flagBoolean(args, 'persistent') === true) return 'profile';
  const paths = authPaths();
  const shape = savedAuthShape(name, paths);
  // `hasProfile` means a sign-in was completed, not that a directory is there —
  // otherwise a leftover directory from a signed-out run would win over a
  // storage state that actually works.
  if (shape.hasProfile && !shape.hasStorageState) return 'profile';
  if (shape.hasStorageState) return 'storage-state';
  if (shape.hasProfile) return 'profile';
  throw new UiAtlasError('auth.not-found', `nothing saved for profile "${name}"`, {
    detail: { checked: [paths.profileDir(name), paths.storageStatePath(name)] },
  });
}

async function waitForEnter(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(prompt);
  } finally {
    rl.close();
  }
}

/**
 * The original flow, unchanged: you say when you are done, and the page is
 * checked before anything is written. Pressing Enter too early is the easiest
 * way to save a signed-out session, so a signed-out reading asks a second time
 * rather than saving quietly.
 */
async function confirmByEnter(page: Page, url: string, logger: Logger): Promise<SignInReading> {
  logger.info('When you are done, come back here and press Enter.');
  await waitForEnter('Press Enter once you are signed in… ');

  const reading = judgeSignIn(await probeSignIn(page, url));
  if (reading.verdict === 'signed-out') {
    logger.warn('This page still looks signed out:');
    for (const line of reading.evidence) logger.warn(`  ${line}`);
    await waitForEnter('Save anyway? Press Enter to save, or Ctrl-C to stop… ');
  }
  return reading;
}

/** How often the page is re-read while waiting. Cheap, and not a busy loop. */
const SIGN_IN_POLL_MS = 1_500;

/**
 * Watch the page until it reads as signed in.
 *
 * This exists because a GUI caller has no stdin to press Enter on — the
 * launcher opens this window for you and needs to know, by itself, when you
 * have landed. It only ever *observes*: nothing is typed, submitted or
 * clicked, exactly as with the interactive path.
 *
 * On timeout it returns the last reading rather than throwing, so a session
 * that is genuinely signed in but unreadable is still offered for saving with
 * its evidence shown.
 */
async function waitForSignedIn(
  page: Page,
  url: string,
  logger: Logger,
  timeoutMs: number,
): Promise<SignInReading> {
  const deadline = Date.now() + Math.max(SIGN_IN_POLL_MS, timeoutMs);
  logger.info(`waiting for sign-in at ${url}`);

  let last: SignInReading = { verdict: 'unclear', evidence: ['the page has not been read yet'] };
  while (Date.now() < deadline) {
    if (page.isClosed()) {
      logger.warn('the sign-in window was closed before the page read as signed in');
      return last;
    }
    try {
      last = judgeSignIn(await probeSignIn(page, url));
    } catch {
      // A page mid-navigation cannot be read; the next poll will catch it.
    }
    if (last.verdict === 'signed-in') {
      logger.info('sign-in detected');
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, SIGN_IN_POLL_MS));
  }

  logger.warn(`gave up waiting for sign-in after ${String(Math.round(timeoutMs / 1000))}s`);
  for (const line of last.evidence) logger.warn(`  ${line}`);
  return last;
}

async function clearStoredProfile(args: ParsedArgs, logger: Logger): Promise<number> {
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
  if (result.removedStorageState) logger.info(`removed ${paths.storageStatePath(name)}`);
  if (result.removedProfile) logger.info(`removed ${paths.profileDir(name)}`);
  return 0;
}
