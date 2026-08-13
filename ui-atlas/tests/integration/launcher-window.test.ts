import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The popover, driven as a real window.
 *
 * This is the gap `docs/limitations.md` used to record: everything the popover
 * *decides* was unit-tested, but nothing drew it, so a change that broke only
 * the rendering would pass. It broke — the first state push raced the page
 * load, `webContents.send` dropped it, and the panel sat empty with no Start
 * button on it. Every assertion here is about that class of failure.
 *
 * It talks to Electron over CDP rather than clicking anything, so it needs no
 * accessibility permissions and no human at the keyboard.
 */

const require = createRequire(import.meta.url);
const APP_DIR = fileURLToPath(new URL('../../apps/launcher', import.meta.url));

/** `require('electron')` in plain Node resolves to the binary's path. */
function electronBinary(): string | undefined {
  try {
    const path = require('electron') as unknown;
    return typeof path === 'string' && existsSync(path) ? path : undefined;
  } catch {
    return undefined;
  }
}

interface Cdp {
  evaluate: (expression: string) => Promise<unknown>;
  close: () => void;
}

async function attach(port: number): Promise<Cdp> {
  const targets = (await (await fetch(`http://127.0.0.1:${String(port)}/json`)).json()) as Array<{
    type: string;
    webSocketDebuggerUrl: string;
  }>;
  const page = targets.find((target) => target.type === 'page');
  if (page === undefined) throw new Error('no page target');

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map<number, (value: unknown) => void>();
  let id = 0;
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown };
    if (message.id !== undefined) {
      pending.get(message.id)?.(message.result);
      pending.delete(message.id);
    }
  };
  await new Promise<void>((resolve) => {
    socket.onopen = () => resolve();
  });

  const call = (method: string, params: unknown): Promise<unknown> =>
    new Promise((resolve) => {
      id += 1;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });

  await call('Runtime.enable', {});
  return {
    evaluate: async (expression: string) => {
      const result = (await call('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      })) as { result?: { value?: unknown }; exceptionDetails?: unknown };
      if (result.exceptionDetails !== undefined) throw new Error(`evaluate threw: ${expression}`);
      return result.result?.value;
    },
    close: () => socket.close(),
  };
}

/** Poll until `check` is true, so the test never depends on a fixed sleep. */
async function until<T>(check: () => Promise<T>, ok: (value: T) => boolean, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = await check();
  while (!ok(last) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    last = await check();
  }
  return last;
}

describe('the launcher window', () => {
  let child: ChildProcess | undefined;
  let userData: string | undefined;
  let cdp: Cdp | undefined;

  afterEach(async () => {
    cdp?.close();
    cdp = undefined;
    child?.kill('SIGKILL');
    child = undefined;
    if (userData !== undefined) await rm(userData, { recursive: true, force: true });
    userData = undefined;
  });

  const binary = electronBinary();
  const maybe = binary === undefined ? it.skip : it;

  maybe('paints itself without being touched, and offers Start', async () => {
    userData = await mkdtemp(join(tmpdir(), 'ui-atlas-launcher-'));
    const port = 9300 + Math.floor(Math.random() * 400);

    child = spawn(
      binary ?? '',
      [
        APP_DIR,
        `--remote-debugging-port=${String(port)}`,
        // Its own user-data directory, so the single-instance lock does not
        // collide with a launcher the developer already has running.
        `--user-data-dir=${userData}`,
      ],
      {
        // And its own socket, so the test cannot take over the real one.
        env: { ...process.env, UI_ATLAS_SOCKET: join(userData, 'launcher.sock') },
        stdio: 'ignore',
      },
    );

    // Wait for the debugger, not for a guessed number of seconds.
    await until(
      async () => {
        try {
          return (await (await fetch(`http://127.0.0.1:${String(port)}/json`)).json()) as unknown[];
        } catch {
          return [];
        }
      },
      (targets) => targets.length > 0,
    );

    cdp = await attach(port);

    // The regression: this used to stay 0 forever, because the only state push
    // happened before the page had loaded and was dropped.
    const children = await until(
      () => cdp?.evaluate('document.querySelector("#panel")?.children.length ?? 0') as Promise<number>,
      (count) => count > 0,
    );
    expect(children).toBeGreaterThan(0);

    const primary = await cdp.evaluate('document.querySelector(".primary")?.textContent ?? ""');
    expect(primary).toBe('Start');

    // The three rows the design promises, drawn rather than merely decided.
    // A pending row's mark is itself a `span`, so the title is the one span
    // that is neither the mark nor the right-hand note.
    const stages = await cdp.evaluate(
      'JSON.stringify([...document.querySelectorAll("#panel .stage")]' +
        '.map((row) => row.querySelector("span:not(.mark):not(.note)")?.textContent ?? ""))',
    );
    expect(JSON.parse(String(stages))).toEqual([
      'Build packages',
      'Start capture engine',
      'Open browser with panel',
    ]);

    // And the bridge the extension uses is exposed to it.
    expect(await cdp.evaluate('typeof window.launcher?.send')).toBe('function');
  }, 60_000);
});
