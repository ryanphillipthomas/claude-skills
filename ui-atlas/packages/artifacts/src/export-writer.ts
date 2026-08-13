/**
 * Materialise an export plan: the renamed copies, and the note that says where
 * each one came from.
 *
 * Copies rather than moves, and never touches the originals. A capture record,
 * its sidecar and its image are a set that has to stay together — renaming the
 * image in place would break that, which is exactly what the run index has been
 * warning about since the beginning. The export is a *second* view of the same
 * files, produced for somewhere else, and it can be deleted and regenerated
 * without losing anything.
 */

import { copyFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWriteFile, ensureDir } from './atomic.js';
import type { ExportPlan } from './export-name.js';
import { resolveWithinRoot } from './paths.js';

export interface WriteExportInput {
  /** The project directory the plan's `source` paths are relative to. */
  projectDir: string;
  /** Where the renamed copies go. Usually `<projectDir>/exports`. */
  exportsDir: string;
  plan: ExportPlan;
  /** Remove files left by a previous export before writing. Default: true. */
  clean?: boolean;
  generatedAt?: string;
}

export interface WrittenExport {
  exportsDir: string;
  manifestPath: string;
  copied: number;
  /** Sources that could not be read, so an incomplete export says so. */
  failed: Array<{ source: string; name: string; reason: string }>;
}

export async function writeDesignExport(input: WriteExportInput): Promise<WrittenExport> {
  const { projectDir, exportsDir, plan } = input;
  await ensureDir(exportsDir);

  if (input.clean !== false) await removePreviousExport(exportsDir);

  const failed: WrittenExport['failed'] = [];
  let copied = 0;

  for (const entry of plan.entries) {
    const from = resolveWithinRoot(projectDir, ...entry.source.split('/'));
    const to = resolveWithinRoot(exportsDir, entry.name);
    try {
      await copyFile(from, to);
      copied += 1;
    } catch (error) {
      // One unreadable capture must not lose the rest of the export.
      failed.push({
        source: entry.source,
        name: entry.name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const manifest = {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    note:
      'Renamed copies of this project’s captures, for handing to a design tool. ' +
      'The originals are unchanged; regenerate this folder with `ui-atlas export`.',
    counts: { exported: copied, failed: failed.length, skipped: plan.skipped.length },
    files: plan.entries
      .filter((entry) => !failed.some((failure) => failure.name === entry.name))
      .map((entry) => ({
        name: entry.name,
        group: entry.group,
        route: entry.route,
        description: entry.description,
        source: entry.source,
        sessionId: entry.sessionId,
      })),
    notExported: [
      ...plan.skipped,
      ...failed.map((failure) => ({
        description: failure.source,
        reason: `could not be copied: ${failure.reason}`,
      })),
    ],
  };

  const manifestPath = resolveWithinRoot(exportsDir, 'manifest.json');
  await atomicWriteFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  return { exportsDir, manifestPath, copied, failed };
}

/**
 * Clear the previous export so a removed capture does not linger under a name
 * this run no longer assigns. Only files are removed, and only from inside the
 * export directory — anything a person put in a subfolder of their own is left
 * where they put it.
 */
async function removePreviousExport(exportsDir: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(exportsDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    await rm(join(exportsDir, entry.name), { force: true }).catch(() => undefined);
  }
}
