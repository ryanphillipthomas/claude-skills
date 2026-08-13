/**
 * Names shared by the extension and the launcher.
 *
 * Its own module, with no imports at all, because the extension popup is
 * bundled for a browser: pulling this out of `extension-id.ts` would drag
 * `node:crypto` into a bundle that has no Node in it.
 */

/** Reverse-DNS name Chrome uses to find the native messaging host. */
export const NATIVE_HOST_NAME = 'com.ui_atlas.launcher';
