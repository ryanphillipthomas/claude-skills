import { isAbsolute, resolve } from 'node:path';
import { planDesignExport, projectPaths, readProjectContents, writeDesignExport } from '@ui-atlas/artifacts';
import { flagString, type ParsedArgs } from '../args.js';
import { loadCliConfig } from '../config.js';
import type { Logger } from '../logger.js';
import { platformOpener } from '../reveal.js';

export const EXPORT_HELP = `
ui-atlas export <project> [options]

  Copy a project's captures into one flat folder, renamed for handing to a
  design tool. Pages first, then components, then motion; each name says what
  it is, and gains a viewport, route or session qualifier only where something
  else would otherwise be called the same thing.

  The originals are never touched. Re-running replaces the folder, so it always
  matches what the project currently holds.

  --to <dir>          where to write (default: <project>/exports)
  --dry-run           print the names without copying anything
  --open              open the folder afterwards
  --output <dir>      artifact root (default: ./ui-atlas-output)
  --config <path>     explicit config file
  --json              print the plan as JSON on stdout
`.trim();

export async function runExport(args: ParsedArgs, logger: Logger): Promise<number> {
  const loaded = await loadCliConfig(args);
  const project = args.positionals[1] ?? loaded.config.project;
  const asJson = args.flags.get('json') === true;

  const contents = await readProjectContents(loaded.outputRoot, project);
  const plan = planDesignExport(contents.captures);

  if (plan.entries.length === 0) {
    logger.warn(`project "${project}" has nothing to export yet`);
    if (asJson) process.stdout.write(`${JSON.stringify({ project, files: [] }, null, 2)}\n`);
    return 0;
  }

  const toFlag = flagString(args, 'to');
  const exportsDir =
    toFlag === undefined
      ? projectPaths(loaded.outputRoot, project).exportsDir
      : isAbsolute(toFlag)
        ? toFlag
        : resolve(process.cwd(), toFlag);

  if (args.flags.get('dry-run') === true) {
    if (asJson) {
      process.stdout.write(`${JSON.stringify({ project, exportsDir, plan }, null, 2)}\n`);
    } else {
      for (const entry of plan.entries) process.stdout.write(`${entry.name}\n`);
      logger.info(`${String(plan.entries.length)} files would be written to ${exportsDir}`);
    }
    return 0;
  }

  const written = await writeDesignExport({
    projectDir: contents.paths.projectDir,
    exportsDir,
    plan,
  });

  for (const failure of written.failed) {
    logger.warn(`${failure.name}: ${failure.reason}`);
  }
  for (const item of plan.skipped) {
    logger.debug(`not exported: ${item.description} — ${item.reason}`);
  }

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          project,
          exportsDir: written.exportsDir,
          manifest: written.manifestPath,
          copied: written.copied,
          failed: written.failed,
          skipped: plan.skipped.length,
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(`${written.exportsDir}\n`);
    logger.info(
      `${String(written.copied)} files exported` +
        (written.failed.length === 0 ? '' : `, ${String(written.failed.length)} could not be copied`) +
        (plan.skipped.length === 0 ? '' : `, ${String(plan.skipped.length)} captures had no file`),
    );
  }

  if (args.flags.get('open') === true) {
    const opener = platformOpener();
    if (opener === undefined) logger.warn('this platform has no opener; the path is above');
    else await opener(written.exportsDir);
  }

  return written.failed.length > 0 ? 1 : 0;
}
