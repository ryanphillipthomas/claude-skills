/**
 * What the launcher can say about the past without opening a browser.
 *
 * Everything here reads artifacts the engine already writes — run manifests,
 * page records, the report directory — so the popover's "4 runs today" and its
 * recent-runs list are observations rather than a second bookkeeping system
 * that could disagree with the first.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readPages, readRunManifest } from '@ui-atlas/artifacts';
import { authPaths, savedAuthShape, type AuthPaths } from '@ui-atlas/browser';
import { shortRunLabel, type AuthStatus, type AuthVerdict, type RecentRun } from './popover.js';

function millisOf(iso: string | undefined): number | undefined {
  if (iso === undefined) return undefined;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? undefined : value;
}

export interface ReadRunsOptions {
  outputRoot: string;
  project: string;
  /** How many rows the popover has space for. */
  limit?: number;
}

/**
 * Newest first. A run directory that cannot be read — killed mid-write, or
 * from a future schema — is skipped rather than failing the whole list: the
 * launcher showing three runs is better than it showing an error because of a
 * fourth.
 */
export async function readRecentRuns(options: ReadRunsOptions): Promise<RecentRun[]> {
  const projectDir = join(options.outputRoot, options.project);
  let entries: string[];
  try {
    entries = (await readdir(projectDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  // Run ids sort lexicographically by start time, so this is chronological.
  entries.sort((a, b) => b.localeCompare(a));

  const runs: RecentRun[] = [];
  for (const runId of entries) {
    if (runs.length >= (options.limit ?? 4)) break;
    const runDir = join(projectDir, runId);
    const run = await readOneRun(runDir, runId);
    if (run !== undefined) runs.push(run);
  }
  return runs;
}

async function readOneRun(runDir: string, runId: string): Promise<RecentRun | undefined> {
  const manifestPath = join(runDir, 'run.json');
  if (!existsSync(manifestPath)) return undefined;

  try {
    const manifest = await readRunManifest(manifestPath);
    const pages = await readPages(join(runDir, 'pages.jsonl'));
    const first = pages.records[0];
    return {
      runId,
      label: first === undefined ? shortRunLabel(runId) : pageLabelFrom(first.finalUrl),
      fileCount: manifest.counts?.captured ?? 0,
      finishedAt: millisOf(manifest.finishedAt) ?? millisOf(manifest.startedAt),
      runDir,
      hasReport: existsSync(join(runDir, 'report', 'index.html')),
    };
  } catch {
    return undefined;
  }
}

/** `/pricing`, matching what the overlay's own flow calls a page. */
export function pageLabelFrom(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.length > 0 ? parsed.pathname : parsed.href;
  } catch {
    return url;
  }
}

/** Runs whose manifest starts on or after local midnight. */
export function countRunsToday(runs: readonly RecentRun[], now: number): number {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const start = midnight.getTime();
  return runs.filter((run) => run.finishedAt !== undefined && run.finishedAt >= start).length;
}

/**
 * Counting today's runs needs every run, not the four the popover shows, so it
 * reads directory names alone — no manifest parsing for a number in a subtitle.
 */
export async function countRunsTodayOnDisk(
  options: Omit<ReadRunsOptions, 'limit'>,
  now: number,
): Promise<number> {
  const projectDir = join(options.outputRoot, options.project);
  let names: string[];
  try {
    names = (await readdir(projectDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return 0;
  }

  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  let count = 0;
  for (const name of names) {
    const started = runIdToMillis(name);
    if (started !== undefined) {
      if (started >= midnight.getTime()) count += 1;
      continue;
    }
    // A directory whose name is not a run id still gets counted honestly, by
    // asking the filesystem rather than guessing.
    try {
      const info = await stat(join(projectDir, name));
      if (info.mtimeMs >= midnight.getTime()) count += 1;
    } catch {
      // Unreadable: not counted.
    }
  }
  return count;
}

/** `20260812T160000Z-a1b2c3` → epoch ms, or absent when it is not a run id. */
export function runIdToMillis(runId: string): number | undefined {
  const match = /^(\d{8})T(\d{6})Z/.exec(runId);
  const date = match?.[1];
  const time = match?.[2];
  if (date === undefined || time === undefined) return undefined;
  const iso =
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T` +
    `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? undefined : value;
}

/** Every profile with something actually saved under it, alphabetically. */
export async function listProfiles(paths: AuthPaths = authPaths()): Promise<string[]> {
  const names = new Set<string>();

  try {
    for (const entry of await readdir(paths.profilesDir, { withFileTypes: true })) {
      if (entry.isDirectory() && savedAuthShape(entry.name, paths).hasProfile) names.add(entry.name);
    }
  } catch {
    // No profiles directory yet.
  }

  try {
    for (const entry of await readdir(paths.storageStateDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.json')) names.add(entry.name.slice(0, -5));
    }
  } catch {
    // No storage-state directory yet.
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

export interface ReadAuthOptions {
  profile: string | undefined;
  verdict: AuthVerdict;
  checkedAt: number | undefined;
  paths?: AuthPaths;
}

/**
 * The saved session's shape, and its earliest cookie expiry when there is one.
 *
 * The expiry is the only forward-looking thing the launcher can honestly say
 * about a sign-in — it is written in the storage state, whereas an account name
 * is not written anywhere and is therefore never shown.
 */
export async function readAuthStatus(options: ReadAuthOptions): Promise<AuthStatus> {
  const base: AuthStatus = {
    profile: options.profile,
    verdict: options.verdict,
    expiresAt: undefined,
    checkedAt: options.checkedAt,
  };
  if (options.profile === undefined) return base;

  const paths = options.paths ?? authPaths();
  const expiresAt = await earliestCookieExpiry(paths.storageStatePath(options.profile));
  return { ...base, expiresAt };
}

/**
 * Reads only the `expires` fields. Nothing else in the file is parsed, kept or
 * logged — the rest of it is the session itself.
 */
async function earliestCookieExpiry(path: string): Promise<number | undefined> {
  if (!existsSync(path)) return undefined;
  let parsed: { cookies?: Array<{ expires?: unknown }> };
  try {
    parsed = JSON.parse(await readFile(path, 'utf8')) as { cookies?: Array<{ expires?: unknown }> };
  } catch {
    return undefined;
  }

  let earliest: number | undefined;
  for (const cookie of parsed.cookies ?? []) {
    const expires = cookie.expires;
    // Playwright writes -1 for a session cookie, which has no expiry to report.
    if (typeof expires !== 'number' || expires <= 0) continue;
    const millis = expires * 1000;
    if (earliest === undefined || millis < earliest) earliest = millis;
  }
  return earliest;
}
