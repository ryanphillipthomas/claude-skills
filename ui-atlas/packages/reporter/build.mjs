#!/usr/bin/env node
/**
 * Bundles the report viewer into a single IIFE, inlined into every generated
 * `report/index.html`. The report has to work from `file://` with no network,
 * so nothing may be fetched at runtime.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stat } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const outfile = resolve(here, 'dist/app-bundle.js');

const result = await build({
  entryPoints: [resolve(here, 'src/app/main.ts')],
  outfile,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome110', 'firefox115', 'safari16'],
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'warning',
});

const { size } = await stat(outfile);
process.stdout.write(`report viewer: ${(size / 1024).toFixed(1)} kB\n`);

if (result.errors.length > 0) process.exit(1);
