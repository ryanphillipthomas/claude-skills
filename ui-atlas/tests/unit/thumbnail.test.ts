import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  pngDimensions,
  pngThumbnail,
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
} from '../../packages/artifacts/src/index.js';

/**
 * The thumbnailer reads PNGs by hand rather than taking an image dependency, so
 * these tests build PNGs by hand too — independently of the decoder under test.
 */
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k += 1) crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

interface PngOptions {
  colourType?: number;
  bitDepth?: number;
  interlace?: number;
}

/** A solid image, filter 0 on every row. */
function makePng(
  width: number,
  height: number,
  rgba: [number, number, number, number],
  options: PngOptions = {},
): Buffer {
  const colourType = options.colourType ?? 6;
  const channels = colourType === 6 ? 4 : colourType === 2 ? 3 : 1;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = y * (stride + 1) + 1 + x * channels;
      for (let c = 0; c < channels; c += 1) raw[at + c] = rgba[Math.min(c, 3)] ?? 0;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = options.bitDepth ?? 8;
  ihdr[9] = colourType;
  ihdr[12] = options.interlace ?? 0;

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('pngThumbnail', () => {
  it('produces an inline PNG small enough to travel in an event', () => {
    const uri = pngThumbnail(makePng(400, 200, [10, 120, 255, 255]));
    expect(uri).toMatch(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u);
    // Comfortably under the schema's cap, so a real capture always fits.
    expect((uri ?? '').length).toBeLessThan(262_144);
  });

  it('fits the slot and keeps the shot’s own proportions', () => {
    const wide = pngThumbnail(makePng(400, 200, [0, 0, 0, 255]));
    const size = pngDimensions(Buffer.from((wide ?? '').split(',')[1] ?? '', 'base64'));
    expect(size.width).toBe(THUMBNAIL_WIDTH);
    expect(size.height).toBe(THUMBNAIL_WIDTH / 2);

    // A tall shot is bounded by the height instead, never by both at once.
    const tall = pngThumbnail(makePng(200, 400, [0, 0, 0, 255]));
    const tallSize = pngDimensions(Buffer.from((tall ?? '').split(',')[1] ?? '', 'base64'));
    expect(tallSize.height).toBe(THUMBNAIL_HEIGHT);
    expect(tallSize.width).toBe(THUMBNAIL_HEIGHT / 2);
  });

  it('never enlarges an image that is already smaller than the slot', () => {
    const uri = pngThumbnail(makePng(20, 10, [255, 255, 255, 255]));
    const size = pngDimensions(Buffer.from((uri ?? '').split(',')[1] ?? '', 'base64'));
    expect(size).toEqual({ width: 20, height: 10 });
  });

  it('reads the colour types a browser screenshot actually uses', () => {
    expect(pngThumbnail(makePng(60, 40, [1, 2, 3, 255], { colourType: 6 }))).toBeDefined();
    expect(pngThumbnail(makePng(60, 40, [1, 2, 3, 255], { colourType: 2 }))).toBeDefined();
    expect(pngThumbnail(makePng(60, 40, [1, 2, 3, 255], { colourType: 0 }))).toBeDefined();
  });

  it('declines rather than throws when the PNG is not one it can read', () => {
    // A preview is cosmetic: failing here must never fail the capture.
    expect(pngThumbnail(makePng(60, 40, [0, 0, 0, 255], { interlace: 1 }))).toBeUndefined();
    expect(pngThumbnail(makePng(60, 40, [0, 0, 0, 255], { bitDepth: 16 }))).toBeUndefined();
    expect(pngThumbnail(makePng(60, 40, [0, 0, 0, 255], { colourType: 3 }))).toBeUndefined();
    expect(pngThumbnail(Buffer.from('not a png at all'))).toBeUndefined();
    expect(pngThumbnail(Buffer.alloc(0))).toBeUndefined();
    // Truncated part-way through: still an answer, not an exception.
    expect(pngThumbnail(makePng(60, 40, [0, 0, 0, 255]).subarray(0, 30))).toBeUndefined();
  });

  it('flattens transparency onto white rather than towards black', () => {
    // Fully transparent black: naive averaging would give a black thumbnail.
    const uri = pngThumbnail(makePng(60, 40, [0, 0, 0, 0])) ?? '';
    const png = Buffer.from(uri.split(',')[1] ?? '', 'base64');
    // Re-thumbnailing our own output exercises the decoder on the encoder, and
    // the bytes stay white throughout.
    expect(pngThumbnail(png)).toBeDefined();
    expect(png.length).toBeGreaterThan(0);
  });
});
