#!/usr/bin/env node
/**
 * Bundles the two pieces of the launcher that cannot be plain `tsc` output.
 *
 * - `dist/preload.cjs`          CommonJS, because a sandboxed preload must be
 * - `dist/renderer/entry.js`    one IIFE, loaded by a page with no module loader
 * - `dist/renderer/index.html`  copied verbatim
 * - `dist/assets/trayTemplate*` the menu bar icon, drawn here
 *
 * The tray icon is generated rather than committed as a binary: it is sixteen
 * points of rounded rectangle and a circle, it has to exist at 1x and 2x, and a
 * checked-in PNG is a thing nobody can review.
 */
import { build } from 'esbuild';
import { deflateSync } from 'node:zlib';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { stat } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));

const targets = [
  { entry: 'src/preload.ts', out: 'dist/preload.cjs', format: 'cjs', platform: 'node' },
  { entry: 'src/renderer/entry.ts', out: 'dist/renderer/entry.js', format: 'iife', platform: 'browser' },
];

await mkdir(resolve(here, 'dist/renderer'), { recursive: true });
await mkdir(resolve(here, 'dist/assets'), { recursive: true });

let failed = false;
for (const target of targets) {
  const outfile = resolve(here, target.out);
  const result = await build({
    entryPoints: [resolve(here, target.entry)],
    outfile,
    bundle: true,
    format: target.format,
    platform: target.platform,
    target: ['chrome130', 'node20'],
    // `electron` is provided by the runtime and must never be bundled.
    external: ['electron'],
    minify: false,
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'warning',
    metafile: true,
  });

  const { size } = await stat(outfile);
  const inputs = Object.keys(result.metafile.inputs).length;
  process.stdout.write(`${target.out}: ${(size / 1024).toFixed(1)} kB from ${inputs} modules\n`);
  if (result.errors.length > 0) failed = true;
}

await copyFile(resolve(here, 'src/renderer/index.html'), resolve(here, 'dist/renderer/index.html'));

// --- Tray icon ----------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** 8-bit greyscale + alpha, which is all a macOS template image carries. */
function encodePng(size, coverage) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(4, 9); // colour type: grey + alpha
  const raw = Buffer.alloc(size * (size * 2 + 1));
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    raw.writeUInt8(0, offset); // filter: none
    offset += 1;
    for (let x = 0; x < size; x += 1) {
      raw.writeUInt8(0, offset); // black; macOS recolours it
      raw.writeUInt8(Math.round(coverage[y * size + x] * 255), offset + 1);
      offset += 2;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Signed distance to a rounded rectangle; negative inside. */
function roundedRectDistance(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * The same glyph the design puts in the menu bar: a camera body outlined at
 * 1.2/12 of the width, with a filled lens at the centre. Coordinates are in the
 * design's 12-unit space and scaled up, so 1x and 2x are the same drawing.
 */
function drawCamera(size) {
  const unit = size / 12;
  const coverage = new Float32Array(size * size);
  const samples = 4;

  const bodyHalfW = (10 / 2) * unit;
  const bodyHalfH = (7.2 / 2) * unit;
  const bodyCx = 6 * unit;
  const bodyCy = (2.4 + 7.2 / 2) * unit;
  const bodyRadius = 1.6 * unit;
  const halfStroke = (1.2 * unit) / 2;
  const lensRadius = 1.8 * unit;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = x + (sx + 0.5) / samples;
          const py = y + (sy + 0.5) / samples;
          const onBody =
            Math.abs(roundedRectDistance(px, py, bodyCx, bodyCy, bodyHalfW, bodyHalfH, bodyRadius)) <=
            halfStroke;
          const inLens = Math.hypot(px - bodyCx, py - bodyCy) <= lensRadius;
          if (onBody || inLens) hits += 1;
        }
      }
      coverage[y * size + x] = hits / (samples * samples);
    }
  }
  return coverage;
}

for (const [name, size] of [
  ['trayTemplate.png', 16],
  ['trayTemplate@2x.png', 32],
]) {
  const png = encodePng(size, drawCamera(size));
  await writeFile(resolve(here, 'dist/assets', name), png);
  process.stdout.write(`dist/assets/${name}: ${size}×${size}, ${png.length} bytes\n`);
}

if (failed) process.exit(1);
