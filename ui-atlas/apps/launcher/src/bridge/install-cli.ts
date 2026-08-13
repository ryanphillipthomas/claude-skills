/**
 * `npm run launcher:install-extension`.
 *
 * Writes the native messaging host manifest and prints where to load the
 * extension from. Separate from the launcher itself because it touches
 * directories belonging to browsers, which is not something an app should do
 * quietly at startup.
 */

import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { installNativeHost, installSummary } from './install.js';

const here = dirname(fileURLToPath(import.meta.url));
const extensionDir = resolve(here, '..', 'chrome-extension');
const hostPath = resolve(here, '..', 'native-host.mjs');

if (!existsSync(extensionDir) || !existsSync(hostPath)) {
  process.stderr.write('build first: npm run build\n');
  process.exit(1);
}

/**
 * Prefer the bundled Electron binary over whatever Node ran this.
 *
 * Anyone using the extension is by definition running the launcher, so Electron
 * is present; a system Node might be a version manager's shim that disappears
 * when the shell that installed it does. `ELECTRON_RUN_AS_NODE` makes it a
 * plain Node — the same trick the supervisor uses for its child processes.
 */
function interpreter(): { path: string; env: Record<string, string> } {
  try {
    const electron = createRequire(import.meta.url)('electron') as unknown;
    if (typeof electron === 'string' && existsSync(electron)) {
      return { path: electron, env: { ELECTRON_RUN_AS_NODE: '1' } };
    }
  } catch {
    // Not installed; fall back to this Node, which at least resolved.
  }
  return { path: process.execPath, env: {} };
}

const chosen = interpreter();
const result = await installNativeHost({
  extensionDir,
  hostPath,
  interpreter: chosen.path,
  interpreterEnv: chosen.env,
});
for (const line of installSummary(result)) process.stdout.write(`${line}\n`);

if (result.written.length > 0) {
  process.stdout.write(
    '\nIn Chrome: chrome://extensions → Developer mode → Load unpacked → the path above.\n' +
      'Then restart the browser so it picks up the host manifest.\n',
  );
}
