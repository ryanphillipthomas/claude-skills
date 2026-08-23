import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chromium, type BrowserContext } from 'playwright';
import { launchSession, resolveViewport } from '@ui-atlas/browser';
import { UiAtlasError } from '@ui-atlas/protocol';
import { loadConfig } from '@ui-atlas/config';
import { startFixtureServer, type FixtureServer } from '../support/harness.js';

/**
 * Attach mode, against a browser this test launches and owns — standing in for
 * the Chrome a user starts with `--remote-debugging-port` and signs into by
 * hand.
 *
 * Everything here is about not damaging that browser. It is the only mode where
 * the context outlives the run and belongs to somebody else.
 */
const PORT = 9411;

let theirBrowser: BrowserContext;
let profileDir: string;
let server: FixtureServer;

beforeEach(async () => {
  server = await startFixtureServer();
  profileDir = await mkdtemp(join(tmpdir(), 'ui-atlas-attach-'));
  theirBrowser = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    args: [`--remote-debugging-port=${String(PORT)}`],
  });
  const page = await theirBrowser.newPage();
  await page.goto(server.url('/states.html'));
});

afterEach(async () => {
  await theirBrowser.close().catch(() => undefined);
  await server.close();
  await rm(profileDir, { recursive: true, force: true });
});

async function attach(overrides: Record<string, unknown> = {}) {
  const loaded = await loadConfig({
    overrides: {
      browser: {
        mode: 'attach',
        cdpEndpoint: `http://127.0.0.1:${String(PORT)}`,
        headless: false,
      },
      ...overrides,
    },
  });
  return launchSession({
    config: loaded.config.browser,
    viewport: resolveViewport({ name: 'base', width: 1280, height: 800, mode: 'desktop' }),
  });
}

describe('attach mode', () => {
  it('leaves the attached browser running when the session closes', async () => {
    const pagesBefore = theirBrowser.pages().length;

    const session = await attach();
    expect(session.context.pages().length).toBeGreaterThan(0);
    await session.close();

    // The whole contract: disconnecting is not shutting down. If this ever
    // regresses, a run would take the user's signed-in window with it.
    expect(theirBrowser.pages().length).toBe(pagesBefore);
    const title = await theirBrowser.pages()[0]?.title();
    expect(typeof title).toBe('string');
  });

  it('uses the browser\'s own context, which is the only reason to attach', async () => {
    const session = await attach();
    try {
      // Not a fresh context: a new one would have none of the cookies the user
      // signed in with, which would defeat the entire purpose.
      expect(session.context.pages().length).toBe(theirBrowser.pages().length);
    } finally {
      await session.close();
    }
  });

  it('says out loud that it is less deterministic', async () => {
    const session = await attach();
    try {
      expect(session.warnings.join(' ')).toContain('less deterministic');
    } finally {
      await session.close();
    }
  });

  it('survives a second attached run rather than throwing on the binding', async () => {
    const script = { content: 'globalThis.__uiAtlasAttachTest = true;' };
    const bindings = [{ name: 'uiAtlasAttachProbe', handler: () => 1 }];

    const loaded = await loadConfig({
      overrides: {
        browser: {
          mode: 'attach',
          cdpEndpoint: `http://127.0.0.1:${String(PORT)}`,
          headless: false,
        },
      },
    });
    const viewport = resolveViewport({ name: 'base', width: 1280, height: 800, mode: 'desktop' });

    const first = await launchSession({
      config: loaded.config.browser,
      viewport,
      initScripts: [script],
      bindings,
    });
    await first.close();

    // `exposeBinding` throws outright on a name already registered, and this
    // context is the user's — it is not torn down when the run ends. What this
    // asserts is the outcome rather than the mechanism: a second attached run
    // starts. Playwright turns out to clear the binding on disconnect, so the
    // registration simply succeeds again; the launcher also converts an
    // "already registered" failure into a warning, in case that ever changes.
    const second = await launchSession({
      config: loaded.config.browser,
      viewport,
      initScripts: [script],
      bindings,
    });
    try {
      expect(second.context.pages().length).toBeGreaterThan(0);
    } finally {
      await second.close();
    }
  });

  it('warns that injected scripts outlive the run, because the context is not ours', async () => {
    const loaded = await loadConfig({
      overrides: {
        browser: {
          mode: 'attach',
          cdpEndpoint: `http://127.0.0.1:${String(PORT)}`,
          headless: false,
        },
      },
    });
    const session = await launchSession({
      config: loaded.config.browser,
      viewport: resolveViewport({ name: 'base', width: 1280, height: 800, mode: 'desktop' }),
      initScripts: [{ content: 'globalThis.__uiAtlasNotice = true;' }],
    });
    try {
      expect(session.warnings.join(' ')).toContain('stay until you close it');
    } finally {
      await session.close();
    }
  });
});

describe('attaching to a browser that is not there', () => {
  it('says a browser has to be started first, and how', async () => {
    const loaded = await loadConfig({
      overrides: {
        // A port nothing is listening on, which is the whole failure: attach
        // mode is the one mode with a prerequisite outside the tool.
        browser: { mode: 'attach', cdpEndpoint: 'http://127.0.0.1:9', headless: false },
      },
    });

    const failure = await launchSession({
      config: loaded.config.browser,
      viewport: resolveViewport({ name: 'base', width: 1280, height: 800, mode: 'desktop' }),
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(UiAtlasError);
    const message = (failure as UiAtlasError).message;
    expect(message).toContain('nothing is listening for CDP at http://127.0.0.1:9');
    // The paste-able part: without it the reader still has to go and find out
    // what "attach" needs.
    expect(message).toContain('--remote-debugging-port=9222');
    expect(message).toContain('--user-data-dir');
    expect(message).toContain('Chrome 136 and later refuse');
  });
});
