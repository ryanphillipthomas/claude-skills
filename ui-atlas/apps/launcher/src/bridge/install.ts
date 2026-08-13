/**
 * Installing the native messaging host manifest.
 *
 * Chrome will not talk to a native host it has no manifest for, and the
 * manifest names both the executable and the single extension id allowed to
 * reach it. Writing it is therefore a deliberate, re-runnable step rather than
 * something that happens silently at launch.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import {
  NATIVE_HOST_DIRECTORIES,
  NATIVE_HOST_NAME,
  nativeHostManifest,
  unpackedExtensionId,
} from './extension-id.js';

export interface InstallResult {
  extensionId: string;
  extensionDir: string;
  hostPath: string;
  /** Manifests actually written; a browser that is not installed is skipped. */
  written: string[];
  /** Browser directories that were absent. */
  skipped: string[];
}

export interface InstallOptions {
  /** The built, loadable extension directory — what you point Chrome at. */
  extensionDir: string;
  /** The relay script Chrome will execute. */
  hostPath: string;
  home?: string;
}

/**
 * Write `com.ui_atlas.launcher.json` into every Chromium-family browser
 * directory that exists. Only directories that are already there are written
 * to: creating one would be this tool inventing a browser profile.
 */
export async function installNativeHost(options: InstallOptions): Promise<InstallResult> {
  const home = options.home ?? homedir();
  const extensionId = unpackedExtensionId(options.extensionDir);
  const manifest = nativeHostManifest(options.hostPath, extensionId);
  const body = `${JSON.stringify(manifest, null, 2)}\n`;

  const written: string[] = [];
  const skipped: string[] = [];

  for (const relative of NATIVE_HOST_DIRECTORIES) {
    const directory = join(home, relative);
    // The *parent* is the evidence the browser exists; the NativeMessagingHosts
    // directory itself often does not until something creates it.
    if (!existsSync(dirname(directory))) {
      skipped.push(directory);
      continue;
    }
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${NATIVE_HOST_NAME}.json`);
    await writeFile(path, body, 'utf8');
    written.push(path);
  }

  return { extensionId, extensionDir: options.extensionDir, hostPath: options.hostPath, written, skipped };
}

/** What to tell the user once the manifest is in place. */
export function installSummary(result: InstallResult): string[] {
  const lines = [
    `extension id: ${result.extensionId}`,
    `load unpacked from: ${result.extensionDir}`,
  ];
  if (result.written.length === 0) {
    lines.push('no Chromium-family browser was found, so no host manifest was written');
    return lines;
  }
  for (const path of result.written) lines.push(`wrote ${path}`);
  lines.push(
    'The id above is derived from that directory path, so moving the checkout',
    'means running this again.',
  );
  return lines;
}
