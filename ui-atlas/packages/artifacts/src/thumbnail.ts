import { deflateSync, inflateSync } from 'node:zlib';
import { isPng } from './png.js';

/**
 * A tiny preview of a capture, small enough to hand to the inspector panel.
 *
 * The panel is injected into the site being captured, so it cannot read the run
 * directory the way the report can — a thumbnail has to travel as bytes. That
 * rules out an image library too: this is the same bargain `png.ts` already
 * struck for width and height, which is to read the format directly rather than
 * take a dependency to learn two numbers.
 *
 * Everything here fails soft. A PNG shape we do not understand produces no
 * thumbnail rather than an exception, because a missing preview is a cosmetic
 * loss and a thrown error would fail the capture that succeeded.
 */

/** Twice the 44×28 slot the row draws, so it stays sharp on a retina display. */
export const THUMBNAIL_WIDTH = 88;
export const THUMBNAIL_HEIGHT = 56;

/**
 * Above this, decoding costs more memory than a preview is worth — a full-page
 * capture of a long site can be tens of megapixels. Those rows simply show no
 * thumbnail.
 */
const MAX_SOURCE_PIXELS = 12_000_000;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface RawImage {
  width: number;
  height: number;
  channels: number;
  /** 8-bit samples, `channels` per pixel, row-major. */
  data: Buffer;
}

/**
 * A capture as a `data:` URI, or nothing if it cannot be read cheaply.
 *
 * Always a `data:` URI: the panel assigns it to an `img` in the page under
 * capture, where any other scheme would be a network request made from the
 * site's own origin.
 */
export function pngThumbnail(bytes: Buffer): string | undefined {
  const decoded = decodePng(bytes);
  if (decoded === undefined) return undefined;
  const scaled = downsample(decoded);
  const encoded = encodePng(scaled.width, scaled.height, scaled.rgb);
  return `data:image/png;base64,${encoded.toString('base64')}`;
}

/* -------------------------------------------------------------------------- */
/* Decode                                                                      */
/* -------------------------------------------------------------------------- */

/** Samples per pixel for the colour types that carry their own pixels. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

function decodePng(buffer: Buffer): RawImage | undefined {
  if (!isPng(buffer) || buffer.length < 24) return undefined;

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24] ?? 0;
  const colourType = buffer[25] ?? 0;
  const interlace = buffer[28] ?? 0;

  // Eight bits a sample, no palette and no interlacing: what a browser
  // screenshot always is. Anything else is somebody else's PNG.
  const channels = CHANNELS[colourType];
  if (channels === undefined || bitDepth !== 8 || interlace !== 0) return undefined;
  if (width === 0 || height === 0 || width * height > MAX_SOURCE_PIXELS) return undefined;

  const parts: Buffer[] = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const start = offset + 8;
    if (start + length > buffer.length) return undefined;
    if (type === 'IDAT') parts.push(buffer.subarray(start, start + length));
    if (type === 'IEND') break;
    offset = start + length + 4;
  }
  if (parts.length === 0) return undefined;

  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(parts));
  } catch {
    return undefined;
  }

  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return undefined;
  return { width, height, channels, data: unfilter(raw, width, height, channels) };
}

/**
 * Undo the per-row filter each PNG scanline carries.
 *
 * Every row is predicted from the pixel to its left, the row above, or both,
 * so the rows have to be walked in order — there is no reading one scanline
 * without the one before it.
 */
function unfilter(raw: Buffer, width: number, height: number, channels: number): Buffer {
  const stride = width * channels;
  const out = Buffer.allocUnsafe(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const source = (y * (stride + 1)) + 1;
    const target = y * stride;
    const above = target - stride;

    for (let x = 0; x < stride; x += 1) {
      const value = raw[source + x] ?? 0;
      const a = x >= channels ? (out[target + x - channels] ?? 0) : 0;
      const b = y > 0 ? (out[above + x] ?? 0) : 0;
      const c = y > 0 && x >= channels ? (out[above + x - channels] ?? 0) : 0;

      let restored: number;
      switch (filter) {
        case 1:
          restored = value + a;
          break;
        case 2:
          restored = value + b;
          break;
        case 3:
          restored = value + ((a + b) >> 1);
          break;
        case 4:
          restored = value + paeth(a, b, c);
          break;
        default:
          restored = value;
          break;
      }
      out[target + x] = restored & 0xff;
    }
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/* -------------------------------------------------------------------------- */
/* Scale                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Box-average down to fit the slot, keeping the aspect ratio.
 *
 * Averaging rather than sampling because a screenshot is mostly thin edges —
 * one-pixel borders and text stems — and picking every nth pixel drops them
 * entirely, which makes a UI thumbnail look like a blank card.
 */
function downsample(image: RawImage): { width: number; height: number; rgb: Buffer } {
  const scale = Math.min(
    1,
    THUMBNAIL_WIDTH / image.width,
    THUMBNAIL_HEIGHT / image.height,
  );
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const rgb = Buffer.allocUnsafe(width * height * 3);
  const { channels, data } = image;
  const alpha = channels === 2 || channels === 4;
  const grey = channels < 3;

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.floor((y * image.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * image.height) / height));

    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor((x * image.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * image.width) / width));

      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        const row = sy * image.width * channels;
        for (let sx = x0; sx < x1; sx += 1) {
          const at = row + sx * channels;
          const s0 = data[at] ?? 0;
          const sr = s0;
          const sg = grey ? s0 : (data[at + 1] ?? 0);
          const sb = grey ? s0 : (data[at + 2] ?? 0);
          // Flattened onto white, which is what the panel draws behind it —
          // a transparent element shot would otherwise average towards black.
          const a = alpha ? (data[at + channels - 1] ?? 255) / 255 : 1;
          r += sr * a + 255 * (1 - a);
          g += sg * a + 255 * (1 - a);
          b += sb * a + 255 * (1 - a);
          count += 1;
        }
      }

      const target = (y * width + x) * 3;
      rgb[target] = Math.round(r / count);
      rgb[target + 1] = Math.round(g / count);
      rgb[target + 2] = Math.round(b / count);
    }
  }
  return { width, height, rgb };
}

/* -------------------------------------------------------------------------- */
/* Encode                                                                      */
/* -------------------------------------------------------------------------- */

function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const stride = width * 3;
  const raw = Buffer.allocUnsafe((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    // Filter 0: at this size prediction saves less than it costs to describe.
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.allocUnsafe(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (CRC_TABLE[(crc ^ (buffer[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
