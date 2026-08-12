import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { BrowserConfig } from '@ui-atlas/config';
import { UiAtlasError, type BrowserMode, type Viewport } from '@ui-atlas/protocol';
import {
  authPaths,
  ensureAuthDirs,
  mismatchWarning,
  readStorageState,
  savedAuthShape,
  STORAGE_STATE_WARNING,
} from './auth.js';
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

export interface LaunchOptions {
  config: BrowserConfig;
  viewport: Viewport;
  /** Scripts injected into every new document before any page script runs. */
  initScripts?: Array<{ content: string }>;
  /** Bindings exposed to every frame, e.g. the overlay bridge. */
  bindings?: Array<{
    name: string;
    handler: (source: { page: Page; frame: import('playwright').Frame }, ...args: unknown[]) => unknown;
  }>;
}

export interface BrowserSession {
  mode: BrowserMode;
  browser: Browser | undefined;
  context: BrowserContext;
  browserVersion: string | undefined;
  warnings: string[];
  headless: boolean;
  close(): Promise<void>;
}

function baseContextOptions(config: BrowserConfig, viewport: Viewport, browserVersion?: string) {
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

async function applyContextExtras(
  context: BrowserContext,
  options: LaunchOptions,
): Promise<void> {
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
export async function launchSession(options: LaunchOptions): Promise<BrowserSession> {
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
      const exhaustive: never = config.mode;
      throw new UiAtlasError('browser.launch-failed', `unknown browser mode ${String(exhaustive)}`);
    }
  }
}

async function launchBrowser(config: BrowserConfig): Promise<Browser> {
  try {
    return await chromium.launch({
      headless: config.headless,
      slowMo: config.slowMoMs,
      args: DETERMINISM_ARGS,
    });
  } catch (cause) {
    throw new UiAtlasError('browser.launch-failed', 'could not launch bundled Chromium', { cause });
  }
}

async function launchClean(options: LaunchOptions): Promise<BrowserSession> {
  const browser = await launchBrowser(options.config);
  const context = await browser.newContext(
    baseContextOptions(options.config, options.viewport, browser.version()),
  );
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

async function launchProfile(options: LaunchOptions): Promise<BrowserSession> {
  const { config } = options;
  if (config.profile === undefined) {
    throw new UiAtlasError('config.invalid', 'browser.mode "profile" requires browser.profile');
  }
  const paths = authPaths();
  await ensureAuthDirs(paths);
  const userDataDir = paths.profileDir(config.profile);

  // Checked *before* launching, because launching creates the directory and
  // makes an unsigned-in profile indistinguishable from a signed-in one.
  const mismatch = mismatchWarning(config.profile, 'profile', savedAuthShape(config.profile, paths));

  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: config.headless,
      slowMo: config.slowMoMs,
      args: DETERMINISM_ARGS,
      ...baseContextOptions(config, options.viewport),
    });
  } catch (cause) {
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
      ...(mismatch === undefined ? [] : [mismatch]),
      `Using the dedicated UI Atlas profile "${config.profile}". ${STORAGE_STATE_WARNING}`,
    ],
    close: async () => {
      await context.close().catch(() => undefined);
    },
  };
}

async function launchStorageState(options: LaunchOptions): Promise<BrowserSession> {
  const { config } = options;
  if (config.profile === undefined) {
    throw new UiAtlasError('config.invalid', 'browser.mode "storage-state" requires browser.profile');
  }
  const mismatch = mismatchWarning(
    config.profile,
    'storage-state',
    savedAuthShape(config.profile),
  );
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
    warnings: [
      ...(mismatch === undefined ? [] : [mismatch]),
      `Seeded an isolated context from profile "${config.profile}". ${STORAGE_STATE_WARNING}`,
    ],
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
async function attachOverCdp(options: LaunchOptions): Promise<BrowserSession> {
  const { config } = options;
  if (config.cdpEndpoint === undefined) {
    throw new UiAtlasError('config.invalid', 'browser.mode "attach" requires browser.cdpEndpoint');
  }
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(config.cdpEndpoint);
  } catch (cause) {
    throw new UiAtlasError('browser.launch-failed', 'could not attach over CDP', {
      detail: { cdpEndpoint: config.cdpEndpoint },
      cause,
    });
  }
  // The signed-in context is the reason to attach at all, so the existing one
  // is reused rather than creating a fresh (cookie-less) context.
  const existing = browser.contexts()[0];
  const context = existing ?? (await browser.newContext());

  const warnings = [
    'attach mode is experimental: the attached browser\'s extensions, flags and profile ' +
      'affect rendering, so captures are less deterministic than clean mode.',
  ];

  // Unlike every other mode, this context belongs to the user and outlives the
  // run, so its state carries between runs. Playwright turns out to clear a
  // binding on disconnect, so a second attached run re-registers cleanly — but
  // `exposeBinding` throws outright on a duplicate name, so the failure is
  // converted to a warning rather than killing a run if that ever changes.
  try {
    await applyContextExtras(context, options);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (/already registered|has been already/i.test(message)) {
      warnings.push(
        'this browser context already carries UI Atlas bindings from an earlier attached run; ' +
          'reusing them. Close and reopen the Chrome window for a clean slate.',
      );
    } else {
      throw new UiAtlasError('browser.launch-failed', 'could not prepare the attached context', {
        detail: { cdpEndpoint: config.cdpEndpoint },
        cause,
      });
    }
  }

  if ((options.initScripts ?? []).length > 0) {
    warnings.push(
      'scripts were injected into your own browser context and stay until you close it. ' +
        'Close the Chrome window when you are finished.',
    );
  }

  return {
    mode: 'attach',
    browser,
    context,
    browserVersion: browser.version(),
    headless: false,
    warnings,
    close: async () => {
      // `close()` on a CDP-connected browser disconnects rather than shutting
      // the browser down — verified in `tests/integration/attach.test.ts`,
      // which attaches to a real browser and requires its pages to survive.
      // A context we created ourselves is ours to close; the user's is not.
      if (existing === undefined) await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
}
