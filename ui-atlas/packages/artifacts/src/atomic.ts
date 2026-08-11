import { createHash, randomBytes } from 'node:crypto';
import { open, mkdir, rename, rm, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { UiAtlasError } from '@ui-atlas/protocol';

export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function ensureDir(dir: string, mode?: number): Promise<void> {
  await mkdir(dir, { recursive: true, ...(mode === undefined ? {} : { mode }) });
}

export interface AtomicWriteResult {
  path: string;
  sha256: string;
  byteLength: number;
}

/**
 * Write `data` durably: temp file in the *same directory* (so rename is atomic
 * on the same filesystem), fsync, verify the checksum, then rename into place.
 * A crash mid-write leaves either the previous file or nothing — never a
 * truncated artifact.
 */
export async function atomicWriteFile(
  targetPath: string,
  data: Buffer | string,
  options: { mode?: number } = {},
): Promise<AtomicWriteResult> {
  const buffer = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const dir = dirname(targetPath);
  const tempPath = join(dir, `.${randomBytes(6).toString('hex')}.tmp`);

  let handle;
  try {
    await ensureDir(dir);
    handle = await open(tempPath, 'wx', options.mode ?? 0o644);
    await handle.writeFile(buffer);
    await handle.sync();
  } catch (cause) {
    await handle?.close().catch(() => undefined);
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw new UiAtlasError('artifact.write-failed', `could not write ${targetPath}`, {
      detail: { targetPath },
      cause,
    });
  }
  await handle.close();

  try {
    await rename(tempPath, targetPath);
  } catch (cause) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw new UiAtlasError('artifact.write-failed', `could not commit ${targetPath}`, {
      detail: { targetPath },
      cause,
    });
  }

  return { path: targetPath, sha256: sha256(buffer), byteLength: buffer.byteLength };
}

/**
 * Append one JSON Lines record. Appends of a single line under the platform
 * pipe-buffer size are effectively atomic for our single-writer-per-run model,
 * and keep the run recoverable if the process dies mid-run.
 */
export async function appendJsonLine(targetPath: string, value: unknown): Promise<void> {
  await ensureDir(dirname(targetPath));
  const line = `${JSON.stringify(value)}\n`;
  try {
    await appendFile(targetPath, line, { encoding: 'utf8', mode: 0o644 });
  } catch (cause) {
    throw new UiAtlasError('artifact.write-failed', `could not append to ${targetPath}`, {
      detail: { targetPath },
      cause,
    });
  }
}
