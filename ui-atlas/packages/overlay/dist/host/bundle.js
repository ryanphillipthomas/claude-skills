import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { UiAtlasError } from '@ui-atlas/protocol';
/**
 * The page bundle is produced by `packages/overlay/build.mjs`. Both the
 * compiled host (`dist/host/`) and the TypeScript source (`src/host/`) are two
 * directories below the package root, so one relative path serves both.
 */
export function overlayBundlePath() {
    return fileURLToPath(new URL('../../dist/page-bundle.js', import.meta.url));
}
export async function loadOverlayBundle() {
    const path = overlayBundlePath();
    if (!existsSync(path)) {
        throw new UiAtlasError('internal', 'the overlay page bundle is missing; run `npm run build:overlay`', { detail: { expectedPath: path } });
    }
    return readFile(path, 'utf8');
}
/**
 * Wrap the bundle so the session token lives in a closure rather than on
 * `window`. A script in the page can still reach the Playwright binding, but it
 * cannot read the token and therefore cannot forge a request.
 */
export function buildBootstrapScript(bundle, bootstrap) {
    return [
        '(() => {',
        `  const __UI_ATLAS_BOOTSTRAP__ = ${JSON.stringify(bootstrap)};`,
        '  try {',
        bundle,
        '  } catch (error) {',
        '    console.error("[ui-atlas] overlay failed to start", error);',
        '  }',
        '})();',
    ].join('\n');
}
//# sourceMappingURL=bundle.js.map