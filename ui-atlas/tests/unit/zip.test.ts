/**
 * The archive is read by Finder, by Windows Explorer and by every unzip on the
 * planet, none of which are here to say whether it worked. So these check the
 * bytes against the format rather than round-tripping through the same code
 * that wrote them — and `unzip -t`, when it is available, checks it against a
 * real implementation.
 */

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { archiveName, crc32, dosTimestamp, writeZip } from '@ui-atlas/artifacts';
import { UiAtlasError } from '@ui-atlas/protocol';

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL('../../test-output/', import.meta.url));

let dir: string;

beforeEach(async () => {
  mkdirSync(ROOT, { recursive: true });
  dir = await mkdtemp(join(ROOT, 'zip-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function file(name: string, contents: string): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, contents);
  return path;
}

describe('crc32', () => {
  it('matches the published check value', () => {
    // The standard CRC-32/ISO-HDLC check: "123456789" is 0xcbf43926.
    expect(crc32(Buffer.from('123456789'))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });
});

describe('dosTimestamp', () => {
  it('encodes the date the way the format stores it', () => {
    const { time, date } = dosTimestamp(new Date(2026, 7, 13, 14, 30, 20));
    expect(date >> 9).toBe(2026 - 1980);
    expect((date >> 5) & 0xf).toBe(8);
    expect(date & 0x1f).toBe(13);
    expect(time >> 11).toBe(14);
    expect((time >> 5) & 0x3f).toBe(30);
    // Two-second resolution is the format's, not a rounding mistake here.
    expect((time & 0x1f) * 2).toBe(20);
  });

  it('clamps below 1980, which the format cannot represent', () => {
    expect(dosTimestamp(new Date(1970, 0, 1)).date >> 9).toBe(0);
  });
});

describe('archiveName', () => {
  it('refuses to write a path that would escape the unpack directory', () => {
    expect(archiveName('/etc/passwd')).toBe('etc/passwd');
    expect(archiveName('../../etc/passwd')).toBe('etc/passwd');
    expect(archiveName('a/./b.png')).toBe('a/b.png');
    expect(archiveName('a\\b.png')).toBe('a/b.png');
  });
});

describe('writeZip', () => {
  it('writes an archive with the entries it was given', async () => {
    const target = join(dir, 'out.zip');
    const result = await writeZip({
      target,
      entries: [
        { name: 'one.txt', source: await file('a', 'first') },
        { name: 'two.txt', source: await file('b', 'second') },
      ],
      modifiedAt: new Date(2026, 7, 13, 12, 0, 0),
    });

    expect(result.entries).toBe(2);
    const bytes = await readFile(target);
    expect(bytes.byteLength).toBe(result.byteLength);
    // Local header, then the central directory, then the end record.
    expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
    expect(bytes.readUInt32LE(bytes.byteLength - 22)).toBe(0x06054b50);
    expect(bytes.readUInt16LE(bytes.byteLength - 14)).toBe(2);
  });

  it('stores rather than compresses, so the sizes agree', async () => {
    const target = join(dir, 'out.zip');
    await writeZip({ target, entries: [{ name: 'one.txt', source: await file('a', 'hello') }] });

    const bytes = await readFile(target);
    expect(bytes.readUInt16LE(8)).toBe(0); // method 0
    expect(bytes.readUInt32LE(18)).toBe(5); // compressed
    expect(bytes.readUInt32LE(22)).toBe(5); // uncompressed
    expect(bytes.readUInt32LE(14)).toBe(crc32(Buffer.from('hello')));
  });

  it('produces the same bytes twice for the same content', async () => {
    const source = await file('a', 'stable');
    const at = new Date(2026, 7, 13, 12, 0, 0);
    const first = join(dir, 'first.zip');
    const second = join(dir, 'second.zip');

    await writeZip({ target: first, entries: [{ name: 'one.txt', source }], modifiedAt: at });
    await writeZip({ target: second, entries: [{ name: 'one.txt', source }], modifiedAt: at });

    expect(await readFile(first)).toEqual(await readFile(second));
  });

  it('leaves nothing behind when an entry cannot be read', async () => {
    const target = join(dir, 'out.zip');
    await expect(
      writeZip({
        target,
        entries: [
          { name: 'one.txt', source: await file('a', 'first') },
          { name: 'missing.txt', source: join(dir, 'not-here') },
        ],
      }),
    ).rejects.toThrow();

    // Neither a half-written archive under the real name, nor its temporary.
    expect(existsSync(target)).toBe(false);
    expect(existsSync(`${target}.tmp`)).toBe(false);
  });

  it('refuses more entries than the format can index, rather than truncating', async () => {
    const source = await file('a', 'x');
    const entries = Array.from({ length: 70_000 }, (_, index) => ({
      name: `${String(index)}.txt`,
      source,
    }));
    await expect(writeZip({ target: join(dir, 'out.zip'), entries })).rejects.toThrow(UiAtlasError);
  });

  it('writes an empty archive rather than failing on nothing', async () => {
    const target = join(dir, 'empty.zip');
    const result = await writeZip({ target, entries: [] });
    expect(result.entries).toBe(0);
    expect((await readFile(target)).byteLength).toBe(22);
  });

  it('is readable by a real unzip', async () => {
    const target = join(dir, 'out.zip');
    await writeZip({
      target,
      entries: [
        { name: '01-page-home.png', source: await file('a', 'not really a png') },
        { name: 'manifest.json', source: await file('b', '{"ok":true}') },
      ],
    });

    let unzip: { stdout: string } | undefined;
    try {
      unzip = await run('unzip', ['-t', target]);
    } catch (error) {
      // Present on macOS and most Linux images. If it is genuinely missing the
      // header assertions above still stand; a *failing* unzip is a real
      // failure and is rethrown.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }

    expect(unzip.stdout).toContain('No errors detected');
    const listing = await run('unzip', ['-l', target]);
    expect(listing.stdout).toContain('01-page-home.png');
    expect(listing.stdout).toContain('manifest.json');
  });
});
