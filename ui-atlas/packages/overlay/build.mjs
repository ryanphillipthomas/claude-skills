#!/usr/bin/env node
/**
 * Bundles the page-side code into self-contained IIFEs.
 *
 * - `page-bundle.js`  the full inspector overlay
 * - `probe-bundle.js` the element probe alone, with no UI
 *
 * Both are injected verbatim through Playwright's `addInitScript`; the overlay
 * is wrapped by `buildBootstrapScript` so the session token stays in a closure.
 * Nothing is fetched at runtime: the inspected page never makes a request for us.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stat } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));

const targets = [
  { entry: 'src/page/main.ts', out: 'dist/page-bundle.js' },
  { entry: 'src/page/probe-entry.ts', out: 'dist/probe-bundle.js' },
];

let failed = false;
for (const target of targets) {
  const outfile = resolve(here, target.out);
  const result = await build({
    entryPoints: [resolve(here, target.entry)],
    outfile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110'],
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'warning',
    metafile: true,
  });

  const { size } = await stat(outfile);
  const inputs = Object.keys(result.metafile.inputs).length;
  process.stdout.write(
    `${target.out}: ${(size / 1024).toFixed(1)} kB from ${String(inputs)} modules\n`,
  );
  if (result.errors.length > 0) failed = true;
}

if (failed) process.exit(1);
