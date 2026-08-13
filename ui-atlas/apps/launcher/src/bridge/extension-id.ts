/**
 * The extension's identity, derived rather than configured.
 *
 * Chrome gives an unpacked extension an id computed from the absolute path it
 * was loaded from: SHA-256 of the path, first sixteen bytes, each nibble mapped
 * to `a`–`p`. Deriving it the same way means the native messaging manifest can
 * name the exact extension allowed to talk to the launcher without anyone
 * copying an id out of `chrome://extensions` by hand.
 *
 * It also means moving the checkout changes the id, which is why installing the
 * host manifest is a command you re-run rather than a one-off.
 */

import { createHash } from 'node:crypto';
import { NATIVE_HOST_NAME } from './constants.js';

export { NATIVE_HOST_NAME };

/** Chrome's alphabet: hex digit `0`–`f` becomes `a`–`p`. */
function toChromeAlphabet(hex: string): string {
  let out = '';
  for (const digit of hex) {
    out += String.fromCharCode('a'.charCodeAt(0) + Number.parseInt(digit, 16));
  }
  return out;
}

/**
 * The id Chrome will give an unpacked extension loaded from `absolutePath`.
 * The path is hashed as UTF-8 bytes, exactly as Chrome does on macOS and Linux.
 */
export function unpackedExtensionId(absolutePath: string): string {
  const digest = createHash('sha256').update(absolutePath, 'utf8').digest('hex');
  return toChromeAlphabet(digest.slice(0, 32));
}

/** `chrome-extension://<id>/`, the origin form Chrome matches against. */
export function extensionOrigin(id: string): string {
  return `chrome-extension://${id}/`;
}

/**
 * Chromium-family browsers that read native messaging manifests, and where.
 * Relative to the user's home directory; a browser that is not installed simply
 * has no such directory and is skipped.
 */
export const NATIVE_HOST_DIRECTORIES: readonly string[] = [
  'Library/Application Support/Google/Chrome/NativeMessagingHosts',
  'Library/Application Support/Google/Chrome Beta/NativeMessagingHosts',
  'Library/Application Support/Chromium/NativeMessagingHosts',
  'Library/Application Support/Microsoft Edge/NativeMessagingHosts',
  'Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts',
  'Library/Application Support/Arc/User Data/NativeMessagingHosts',
];

export interface NativeHostManifest {
  name: string;
  description: string;
  path: string;
  type: 'stdio';
  allowed_origins: string[];
}

export function nativeHostManifest(hostPath: string, extensionId: string): NativeHostManifest {
  return {
    name: NATIVE_HOST_NAME,
    description: 'UI Atlas launcher bridge',
    path: hostPath,
    type: 'stdio',
    // Exactly one origin. This is the second of the two gates in front of the
    // socket, the first being the socket's own file permissions.
    allowed_origins: [extensionOrigin(extensionId)],
  };
}
