import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCaptures, readPages, readRunManifest, runPaths } from '@ui-atlas/artifacts';
import { generateReport } from '@ui-atlas/reporter';
import { UiAtlasError, type CaptureRecord } from '@ui-atlas/protocol';
import type { ParsedArgs } from '../args.js';
import type { Logger } from '../logger.js';

export const REPORT_HELP = `
ui-atlas report <run-directory>

  Writes a browsable, self-contained report to <run-directory>/report/index.html
  and prints a summary: counts, warnings, failed and skipped captures, and
  duplicate images by content hash.

  The report opens straight from disk. It needs no server and makes no network
  requests, and it contains no authentication material.

  --no-html   only print the summary, do not write the report
  --open      print the file:// URL on its own line, ready to open
  --json      print the summary as JSON instead of text
`.trim();

export interface RunSummary {
  runId: string;
  project: string;
  startedAt: string;
  finishedAt: string | undefined;
  counts: { captured: number; failed: number; skipped: number; pages: number };
  byState: Record<string, number>;
  byProvenance: Record<string, number>;
  warnings: string[];
  failures: Array<{ id: string; state: string; code: string; message: string }>;
  duplicateGroups: Array<{ sha256: string; captures: string[] }>;
  invalidLines: number;
}

export function summariseCaptures(records: CaptureRecord[]): Pick<
  RunSummary,
  'byState' | 'byProvenance' | 'failures' | 'duplicateGroups'
> {
  const byState: Record<string, number> = {};
  const byProvenance: Record<string, number> = {};
  const failures: RunSummary['failures'] = [];
  const byHash = new Map<string, string[]>();

  for (const record of records) {
    byState[record.state.name] = (byState[record.state.name] ?? 0) + 1;
    byProvenance[record.state.provenance] = (byProvenance[record.state.provenance] ?? 0) + 1;
    if (record.status !== 'captured' && record.error !== undefined) {
      failures.push({
        id: record.id,
        state: record.state.name,
        code: record.error.code,
        message: record.error.message,
      });
    }
    if (record.image !== undefined) {
      const group = byHash.get(record.image.sha256) ?? [];
      group.push(record.id);
      byHash.set(record.image.sha256, group);
    }
  }

  const duplicateGroups = [...byHash.entries()]
    .filter(([, captures]) => captures.length > 1)
    .map(([sha256, captures]) => ({ sha256, captures }));

  return { byState, byProvenance, failures, duplicateGroups };
}

export async function runReport(args: ParsedArgs, logger: Logger): Promise<number> {
  const dir = args.positionals[1];
  if (dir === undefined) {
    throw new UiAtlasError('config.invalid', `report needs a run directory\n\n${REPORT_HELP}`);
  }
  const runDir = resolve(dir);
  const paths = runPaths(runDir, '.', '.');
  const manifestPath = existsSync(paths.runManifest) ? paths.runManifest : resolve(runDir, 'run.json');
  if (!existsSync(manifestPath)) {
    throw new UiAtlasError('config.invalid', `no run.json in ${runDir}`);
  }

  let reportPath: string | undefined;
  if (args.flags.get('no-html') !== true) {
    const generated = await generateReport({ runDir });
    reportPath = generated.path;
    logger.debug('report written', { byteLength: generated.byteLength });
  }

  const manifest = await readRunManifest(manifestPath);
  const captures = await readCaptures(resolve(runDir, 'captures.jsonl'));
  const pages = await readPages(resolve(runDir, 'pages.jsonl'));
  const details = summariseCaptures(captures.records);

  const summary: RunSummary = {
    runId: manifest.runId,
    project: manifest.project,
    startedAt: manifest.startedAt,
    finishedAt: manifest.finishedAt,
    counts: manifest.counts ?? {
      captured: captures.records.filter((record) => record.status === 'captured').length,
      failed: captures.records.filter((record) => record.status === 'failed').length,
      skipped: captures.records.filter((record) => record.status === 'skipped').length,
      pages: pages.records.length,
    },
    warnings: [...new Set([...manifest.warnings, ...captures.records.flatMap((r) => r.warnings)])],
    invalidLines: captures.invalidLines.length + pages.invalidLines.length,
    ...details,
  };

  if (args.flags.get('json') === true) {
    process.stdout.write(
      `${JSON.stringify({ ...summary, ...(reportPath === undefined ? {} : { reportPath }) }, null, 2)}\n`,
    );
    return 0;
  }

  const lines: string[] = [
    `run       ${summary.runId}  (${summary.project})`,
    `started   ${summary.startedAt}`,
    `finished  ${summary.finishedAt ?? 'still running or interrupted'}`,
    `captures  ${String(summary.counts.captured)} captured · ${String(summary.counts.failed)} failed · ${String(summary.counts.skipped)} skipped`,
    `pages     ${String(summary.counts.pages)}`,
    `states    ${formatCounts(summary.byState)}`,
    `sources   ${formatCounts(summary.byProvenance)}`,
  ];
  if (summary.duplicateGroups.length > 0) {
    lines.push(`duplicates ${String(summary.duplicateGroups.length)} group(s) of identical images`);
  }
  if (summary.invalidLines > 0) {
    lines.push(`! ${String(summary.invalidLines)} unreadable JSONL line(s) were skipped`);
  }
  for (const failure of summary.failures.slice(0, 20)) {
    lines.push(`  ✖ ${failure.id} ${failure.state}: ${failure.code} — ${failure.message}`);
  }
  for (const warning of summary.warnings.slice(0, 20)) {
    lines.push(`  ! ${warning}`);
  }
  if (reportPath !== undefined) {
    lines.push('', `report    ${pathToFileURL(reportPath).href}`);
  }

  process.stdout.write(`${lines.join('\n')}\n`);
  logger.debug('report rendered', { runDir });
  return summary.counts.failed > 0 ? 1 : 0;
}

function formatCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'none';
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(' ');
}
