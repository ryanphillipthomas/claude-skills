import { type OverlayBootstrap } from '@ui-atlas/protocol';
/**
 * The page bundle is produced by `packages/overlay/build.mjs`. Both the
 * compiled host (`dist/host/`) and the TypeScript source (`src/host/`) are two
 * directories below the package root, so one relative path serves both.
 */
export declare function overlayBundlePath(): string;
export declare function loadOverlayBundle(): Promise<string>;
/**
 * Wrap the bundle so the session token lives in a closure rather than on
 * `window`. A script in the page can still reach the Playwright binding, but it
 * cannot read the token and therefore cannot forge a request.
 */
export declare function buildBootstrapScript(bundle: string, bootstrap: OverlayBootstrap): string;
//# sourceMappingURL=bundle.d.ts.map