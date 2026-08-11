import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import {
  CaptureRecordSchema,
  PageRecordSchema,
  RunManifestSchema,
  UiAtlasError,
  type CaptureRecord,
  type PageRecord,
  type RunManifest,
} from '@ui-atlas/protocol';
import { formatIssues } from './validate.js';

export interface JsonLinesReadResult<T> {
  records: T[];
  /** 1-based line numbers that failed to parse or validate. */
  invalidLines: Array<{ line: number; reason: string }>;
}

/**
 * Read a JSON Lines file tolerantly: one corrupt line (for example a run that
 * was killed mid-append) must not make the whole run unreadable.
 */
export async function readJsonLines<T>(
  path: string,
  schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: import('zod').ZodError } },
): Promise<JsonLinesReadResult<T>> {
  if (!existsSync(path)) return { records: [], invalidLines: [] };
  const text = await readFile(path, 'utf8');
  const records: T[] = [];
  const invalidLines: Array<{ line: number; reason: string }> = [];

  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === undefined || line.trim().length === 0) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      invalidLines.push({ line: index + 1, reason: 'not valid JSON' });
      continue;
    }
    const parsed = schema.safeParse(value);
    if (parsed.success) records.push(parsed.data);
    else invalidLines.push({ line: index + 1, reason: formatIssues(parsed.error).join('; ') });
  }
  return { records, invalidLines };
}

export async function readCaptures(path: string): Promise<JsonLinesReadResult<CaptureRecord>> {
  return readJsonLines(path, CaptureRecordSchema);
}

export async function readPages(path: string): Promise<JsonLinesReadResult<PageRecord>> {
  return readJsonLines(path, PageRecordSchema);
}

export async function readRunManifest(path: string): Promise<RunManifest> {
  const text = await readFile(path, 'utf8');
  const parsed = RunManifestSchema.safeParse(JSON.parse(text) as unknown);
  if (!parsed.success) {
    throw new UiAtlasError('config.invalid', `invalid run manifest at ${path}`, {
      detail: { issues: formatIssues(parsed.error) },
    });
  }
  return parsed.data;
}
