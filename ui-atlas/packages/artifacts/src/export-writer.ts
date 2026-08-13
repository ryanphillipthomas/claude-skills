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
import { writeZip } from './zip.js';

export interface WriteExportInput {
  /** The project directory the plan's `source` paths are relative to. */
  projectDir: string;
  /** Where the renamed copies go. Usually `<projectDir>/exports`. */
  exportsDir: string;
  plan: ExportPlan;
  /** Remove files left by a previous export before writing. Default: true. */
  clean?: boolean;
  /**
   * Also archive the folder. Absolute path, written *beside* the export rather
   * than inside it — an archive within the directory it archives grows every
   * time it is rebuilt, and the clean step would delete it anyway.
   */
  zipPath?: string | undefined;
  generatedAt?: string;
}

export interface WrittenExport {
  exportsDir: string;
  manifestPath: string;
  copied: number;
  /** Sources that could not be read, so an incomplete export says so. */
  failed: Array<{ source: string; name: string; reason: string }>;
  /** Present only when an archive was asked for and written. */
  zip: { path: string; entries: number; byteLength: number } | undefined;
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

  // Zipped from the copies rather than the originals, so what comes out of the
  // archive is named the way the manifest and the project page say it is.
  let zip: WrittenExport['zip'];
  if (input.zipPath !== undefined) {
    const written = manifest.files.map((file) => ({
      name: file.name,
      source: resolveWithinRoot(exportsDir, file.name),
    }));
    zip = await writeZip({
      target: input.zipPath,
      // The manifest goes in too: an archive of forty images called
      // `03-component-button-save-changes-hover.png` is legible, and the
      // manifest is what says which session each came from.
      entries: [...written, { name: 'manifest.json', source: manifestPath }],
    });
  }

  return { exportsDir, manifestPath, copied, failed, zip };
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
