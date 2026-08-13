/**
 * `npm run launcher:install-extension`.
 *
 * Writes the native messaging host manifest and prints where to load the
 * extension from. Separate from the launcher itself because it touches
 * directories belonging to browsers, which is not something an app should do
 * quietly at startup.
 */

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

const result = await installNativeHost({ extensionDir, hostPath });
for (const line of installSummary(result)) process.stdout.write(`${line}\n`);

if (result.written.length > 0) {
  process.stdout.write(
    '\nIn Chrome: chrome://extensions → Developer mode → Load unpacked → the path above.\n' +
      'Then restart the browser so it picks up the host manifest.\n',
  );
}
