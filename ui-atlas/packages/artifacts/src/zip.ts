/**
 * A minimal ZIP writer, stored (uncompressed) only.
 *
 * Node has no zip in its standard library, and this is the whole of what is
 * needed: a flat archive of PNGs and one JSON file, written once, read by
 * Finder and every browser. A dependency for that would be a dependency to
 * audit, pin and carry forever (ADR 2), against about a hundred lines of a
 * format that has not changed since 1993.
 *
 * Stored rather than deflated on purpose. A PNG is already a deflate stream —
 * compressing it again typically *grows* it, and costs the CPU to find that
 * out. The one file here that would compress is `manifest.json`, and the few
 * kilobytes it would save are not worth an implementation of deflate.
 *
 * What it deliberately does not do: ZIP64, encryption, directory entries,
 * symlinks, or anything outside the flat list it is handed. Both ZIP64 limits
 * are checked and refused with a clear error rather than written as a corrupt
 * archive that only fails when someone tries to open it.
 */

import { createWriteStream } from 'node:fs';
import { readFile, rename, rm } from 'node:fs/promises';
import { UiAtlasError } from '@ui-atlas/protocol';

/** Beyond either of these the format needs ZIP64, which this does not write. */
const MAX_ENTRIES = 0xffff;
const MAX_BYTES = 0xffff_ffff;

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;

/** 2.0: the lowest version that specifies the stored method as used here. */
const VERSION = 20;

export interface ZipEntry {
  /** Path inside the archive. Always forward slashes, never absolute. */
  name: string;
  /** Absolute path to read the bytes from. */
  source: string;
}

export interface WrittenZip {
  path: string;
  entries: number;
  byteLength: number;
}

export interface WriteZipOptions {
  /** Absolute path of the archive to write. */
  target: string;
  entries: readonly ZipEntry[];
  /**
   * Timestamp stamped on every entry. One value for the whole archive rather
   * than each file's mtime: the archive is one act, and identical content then
   * produces identical bytes.
   */
  modifiedAt?: Date;
}

/**
 * Write the archive, one entry at a time.
 *
 * Streamed to a temporary file and renamed, like every other write in this
 * package: an interrupted zip is a file no tool can open, and half of one under
 * the name of a whole one is worse than none. Only one entry is held in memory
 * at a time.
 */
export async function writeZip(options: WriteZipOptions): Promise<WrittenZip> {
  const { target, entries } = options;

  if (entries.length > MAX_ENTRIES) {
    throw new UiAtlasError(
      'artifact.write-failed',
      `a zip of ${String(entries.length)} files needs ZIP64, which this does not write`,
      { detail: { entries: entries.length, max: MAX_ENTRIES } },
    );
  }

  const { time, date } = dosTimestamp(options.modifiedAt ?? new Date());
  const temporary = `${target}.tmp`;
  // A previous attempt killed outright — the launcher stops its child when a
  // capture is started — leaves this behind with no chance to clean up. Removed
  // here rather than appended to, so a stray one heals on the next export
  // instead of sitting in the project directory forever.
  await rm(temporary, { force: true }).catch(() => undefined);
  const stream = createWriteStream(temporary);

  // Registered before the first write, and kept for the whole life of the
  // stream. Without it a write that fails — or a destroy while one is still in
  // flight — is an unhandled error event, which takes the process down rather
  // than the archive.
  let streamError: Error | undefined;
  stream.on('error', (error: Error) => {
    streamError ??= error;
  });

  const central: Buffer[] = [];
  let offset = 0;

  const push = async (chunk: Buffer): Promise<void> => {
    if (streamError !== undefined) throw streamError;
    if (!stream.write(chunk)) {
      await new Promise<void>((resolve) => stream.once('drain', resolve));
    }
    if (streamError !== undefined) throw streamError;
    offset += chunk.byteLength;
  };

  try {
    for (const entry of entries) {
      const name = Buffer.from(archiveName(entry.name), 'utf8');
      const bytes = await readFile(entry.source);
      if (bytes.byteLength > MAX_BYTES) {
        throw new UiAtlasError(
          'artifact.write-failed',
          `${entry.name} is too large for a zip without ZIP64`,
          { detail: { name: entry.name, byteLength: bytes.byteLength } },
        );
      }

      const crc = crc32(bytes);
      const localOffset = offset;

      await push(localHeader({ name, crc, size: bytes.byteLength, time, date }));
      await push(bytes);
      central.push(
        centralHeader({ name, crc, size: bytes.byteLength, time, date, localOffset }),
      );

      if (offset > MAX_BYTES) {
        throw new UiAtlasError(
          'artifact.write-failed',
          'this export is too large for a zip without ZIP64; export the folder instead',
          { detail: { byteLength: offset } },
        );
      }
    }

    const directoryOffset = offset;
    for (const header of central) await push(header);
    const directorySize = offset - directoryOffset;
    await push(endOfCentralDirectory(entries.length, directorySize, directoryOffset));

    await new Promise<void>((resolve, reject) => {
      stream.once('finish', resolve);
      stream.once('error', reject);
      stream.end();
    });
    if (streamError !== undefined) throw streamError;

    await rename(temporary, target);
    return { path: target, entries: entries.length, byteLength: offset };
  } catch (error) {
    // Wait for the teardown before unlinking. Destroying leaves any queued
    // write to fail on its way out, and removing the file underneath one is how
    // that becomes a second, more confusing error than the real one.
    await new Promise<void>((resolve) => {
      if (stream.destroyed) {
        resolve();
        return;
      }
      stream.once('close', () => resolve());
      stream.destroy();
    });
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

/**
 * Names inside an archive are relative and forward-slashed. A leading slash or
 * a `..` segment is how an archive escapes the directory it is unpacked into,
 * so both are removed rather than trusted.
 */
export function archiveName(name: string): string {
  return name
    .split(/[\\/]+/)
    .filter((part) => part.length > 0 && part !== '.' && part !== '..')
    .join('/');
}

interface HeaderInput {
  name: Buffer;
  crc: number;
  size: number;
  time: number;
  date: number;
}

function localHeader(input: HeaderInput): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(LOCAL_HEADER, 0);
  header.writeUInt16LE(VERSION, 4);
  header.writeUInt16LE(0, 6); // No flags: no encryption, no data descriptor.
  header.writeUInt16LE(0, 8); // Method 0: stored.
  header.writeUInt16LE(input.time, 10);
  header.writeUInt16LE(input.date, 12);
  header.writeUInt32LE(input.crc, 14);
  header.writeUInt32LE(input.size, 18); // Compressed size…
  header.writeUInt32LE(input.size, 22); // …equals uncompressed, being stored.
  header.writeUInt16LE(input.name.byteLength, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, input.name]);
}

function centralHeader(input: HeaderInput & { localOffset: number }): Buffer {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(CENTRAL_HEADER, 0);
  header.writeUInt16LE(VERSION, 4);
  header.writeUInt16LE(VERSION, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(input.time, 12);
  header.writeUInt16LE(input.date, 14);
  header.writeUInt32LE(input.crc, 16);
  header.writeUInt32LE(input.size, 20);
  header.writeUInt32LE(input.size, 24);
  header.writeUInt16LE(input.name.byteLength, 28);
  header.writeUInt16LE(0, 30); // extra
  header.writeUInt16LE(0, 32); // comment
  header.writeUInt16LE(0, 34); // disk number
  header.writeUInt16LE(0, 36); // internal attributes
  // 0644, shifted into the high word where Unix permissions live.
  header.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  header.writeUInt32LE(input.localOffset, 42);
  return Buffer.concat([header, input.name]);
}

function endOfCentralDirectory(entries: number, size: number, offset: number): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with the central directory
  end.writeUInt16LE(entries, 8);
  end.writeUInt16LE(entries, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length
  return end;
}

/**
 * MS-DOS time and date, which is what the format stores: two-second resolution,
 * and years counted from 1980. Anything earlier than that cannot be
 * represented, so it is clamped rather than written as a negative year.
 */
export function dosTimestamp(at: Date): { time: number; date: number } {
  const year = Math.max(1980, at.getFullYear());
  return {
    time: (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
  };
}

const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

/** CRC-32/ISO-HDLC, which is what a zip entry carries. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
