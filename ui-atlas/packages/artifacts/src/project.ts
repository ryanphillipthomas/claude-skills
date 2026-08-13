/**
 * A project is a website. A session is one sitting in front of it.
 *
 * Until now the project was whatever `project:` said in the config — one name
 * for every site anyone ever pointed the tool at — and a run was an anonymous
 * timestamped folder underneath it. That is fine for a single afternoon and
 * wrong for the thing this tool is actually for, which is coming back to the
 * same site repeatedly and accumulating reference material about it.
 *
 * So: the project directory is named after the site, deterministically, and
 * opening the same URL a week later lands in the same directory as before. The
 * sessions inside it are the runs that were already being written; nothing
 * about their shape changes, and this module reads them back rather than
 * keeping a second list that could drift from what is on disk.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ProjectManifestSchema,
  SCHEMA_VERSION,
  UiAtlasError,
  type CaptureRecord,
  type ProjectManifest,
  type ProjectSite,
} from '@ui-atlas/protocol';
import { atomicWriteFile } from './atomic.js';
import { resolveWithinRoot, sanitizeSegment } from './paths.js';
import { readCaptures, readPages, readRunManifest } from './read.js';
import { formatIssues } from './validate.js';

/** Run ids start with a compact UTC timestamp; anything else is not a session. */
const RUN_ID_PATTERN = /^\d{8}T\d{6}Z-/;

export interface ProjectPaths {
  outputRoot: string;
  /** `<outputRoot>/<project>` */
  projectDir: string;
  manifest: string;
  /** The page that lists everything captured about this project. */
  indexHtml: string;
  /** Renamed copies, written by `ui-atlas export`. */
  exportsDir: string;
}

export function projectPaths(outputRoot: string, project: string): ProjectPaths {
  const projectDir = resolveWithinRoot(outputRoot, sanitizeSegment(project, 'default'));
  return {
    outputRoot,
    projectDir,
    manifest: resolveWithinRoot(projectDir, 'project.json'),
    indexHtml: resolveWithinRoot(projectDir, 'index.html'),
    exportsDir: resolveWithinRoot(projectDir, 'exports'),
  };
}

/**
 * The directory name a URL belongs in: `https://www.stripe.com/pricing` →
 * `stripe-com`, `http://localhost:3000/` → `localhost-3000`.
 *
 * `www.` is dropped because nobody thinks of it as part of the site's name, and
 * a project keyed on it would split in two the first time someone typed the
 * bare domain. The port is kept, because `localhost:3000` and `localhost:4173`
 * are genuinely two different sites during development.
 *
 * The result satisfies the config schema's project pattern, so it can be passed
 * straight to `--project`.
 */
export function projectSlugFromUrl(rawUrl: string): string {
  let host: string;
  try {
    host = new URL(rawUrl).host.toLowerCase();
  } catch {
    return sanitizeSegment(rawUrl.toLowerCase(), 'project');
  }
  const bare = host.startsWith('www.') ? host.slice(4) : host;
  // Dots and the port colon both become hyphens: one separator reads better in
  // a file listing than two, and a leading-dot directory is a hidden one.
  const slug = sanitizeSegment(bare.replace(/[.:]/g, '-'), 'project');
  // The config schema requires a leading alphanumeric; an IPv6 literal in
  // brackets would not have one.
  return /^[A-Za-z0-9]/.test(slug) ? slug : `site-${slug}`;
}

/** What is known about the site from the URL alone, before a page has loaded. */
export function siteFromUrl(rawUrl: string): ProjectSite {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { origin: rawUrl, host: rawUrl, label: rawUrl, entryUrl: rawUrl };
  }
  const host = parsed.host;
  return {
    origin: parsed.origin,
    host,
    label: host.startsWith('www.') ? host.slice(4) : host,
    entryUrl: parsed.toString(),
  };
}

export async function readProjectManifest(path: string): Promise<ProjectManifest | undefined> {
  if (!existsSync(path)) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return undefined;
  }
  const parsed = ProjectManifestSchema.safeParse(value);
  // A manifest from a future schema is not a reason to refuse to write this
  // session; it is replaced, and the site identity is re-derived from the URL.
  return parsed.success ? parsed.data : undefined;
}

export interface RecordProjectSessionInput {
  outputRoot: string;
  project: string;
  /** The URL this session was pointed at. */
  url: string;
  sessionId: string;
  /** Injectable so a test can assert the timestamps it wrote. */
  now?: Date;
}

/**
 * Create the project on first sight and stamp it on every session after that.
 *
 * The site identity is written once and then left alone: a project opened at
 * `/pricing` on Tuesday and `/docs` on Thursday is one project about one site,
 * and rewriting `entryUrl` each time would lose the first door anyone came in
 * through. `lastUrl` is what moves.
 */
export async function recordProjectSession(
  input: RecordProjectSessionInput,
): Promise<ProjectManifest> {
  const paths = projectPaths(input.outputRoot, input.project);
  const at = (input.now ?? new Date()).toISOString();
  const existing = await readProjectManifest(paths.manifest);

  const manifest: ProjectManifest = {
    schemaVersion: SCHEMA_VERSION,
    project: input.project,
    site: existing?.site ?? siteFromUrl(input.url),
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
    lastUrl: input.url,
    lastSessionId: input.sessionId,
  };

  const parsed = ProjectManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    throw new UiAtlasError('artifact.write-failed', 'invalid project manifest', {
      detail: { project: input.project, issues: formatIssues(parsed.error) },
    });
  }
  await atomicWriteFile(paths.manifest, `${JSON.stringify(parsed.data, null, 2)}\n`);
  return parsed.data;
}

/**
 * One session, as read back off the disk.
 *
 * Everything here is observed: the counts come from the run manifest the
 * session finalised, the routes from the pages it recorded. A session that was
 * killed before it finalised has no counts and `open: true`, which is the
 * honest thing to show rather than a zero.
 */
export interface ProjectSession {
  id: string;
  project: string;
  runDir: string;
  command: string;
  startedAt: string | undefined;
  finishedAt: string | undefined;
  counts: { captured: number; failed: number; skipped: number; pages: number } | undefined;
  /** The first page it recorded — where a resume should go back to. */
  entryUrl: string | undefined;
  /** `/`, `/pricing`, … in the order first visited. */
  routes: string[];
  hasReport: boolean;
  /** No `finishedAt`: still running, or it died before it could say. */
  open: boolean;
}

export interface ReadSessionsOptions {
  /** Newest first; absent reads them all. */
  limit?: number;
  /** Skip `pages.jsonl` when only the manifest is needed. */
  withRoutes?: boolean;
}

/** Every session in a project, newest first. */
export async function readProjectSessions(
  outputRoot: string,
  project: string,
  options: ReadSessionsOptions = {},
): Promise<ProjectSession[]> {
  const { projectDir } = projectPaths(outputRoot, project);
  let names: string[];
  try {
    names = (await readdir(projectDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && RUN_ID_PATTERN.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  // Run ids sort lexicographically by start time, so this is chronological.
  names.sort((a, b) => b.localeCompare(a));

  const sessions: ProjectSession[] = [];
  for (const id of names) {
    if (options.limit !== undefined && sessions.length >= options.limit) break;
    const session = await readSession(projectDir, project, id, options);
    // A directory killed mid-write, or written by a future schema, is skipped
    // rather than failing the list: three readable sessions beat an error
    // about a fourth.
    if (session !== undefined) sessions.push(session);
  }
  return sessions;
}

export async function readSession(
  projectDir: string,
  project: string,
  sessionId: string,
  options: ReadSessionsOptions = {},
): Promise<ProjectSession | undefined> {
  const runDir = join(projectDir, sessionId);
  const manifestPath = join(runDir, 'run.json');
  if (!existsSync(manifestPath)) return undefined;

  try {
    const manifest = await readRunManifest(manifestPath);
    const routes: string[] = [];
    let entryUrl: string | undefined;

    if (options.withRoutes !== false) {
      const pages = await readPages(join(runDir, 'pages.jsonl'));
      const seen = new Set<string>();
      for (const page of pages.records) {
        entryUrl ??= page.finalUrl;
        const label = routeLabel(page.finalUrl);
        if (!seen.has(label)) {
          seen.add(label);
          routes.push(label);
        }
      }
    }

    return {
      id: sessionId,
      project,
      runDir,
      command: manifest.command,
      startedAt: manifest.startedAt,
      finishedAt: manifest.finishedAt,
      counts: manifest.counts,
      entryUrl,
      routes,
      hasReport: existsSync(join(runDir, 'report', 'index.html')),
      open: manifest.finishedAt === undefined,
    };
  } catch {
    return undefined;
  }
}

/** `/pricing`, the way the launcher and the report both name a page. */
export function routeLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.length > 0 ? parsed.pathname : '/';
  } catch {
    return url;
  }
}

export interface ProjectSummary {
  project: string;
  paths: ProjectPaths;
  manifest: ProjectManifest | undefined;
  sessionCount: number;
  /** Newest session's start time, in ms, for ordering the list. */
  lastActiveAt: number | undefined;
}

/**
 * Every project under `outputRoot`, most recently used first.
 *
 * A directory with no `project.json` still counts — runs written before this
 * existed, or by an explicit `--project` — so nothing already captured
 * disappears from the list just because it predates the manifest.
 */
export async function listProjects(outputRoot: string): Promise<ProjectSummary[]> {
  let names: string[];
  try {
    names = (await readdir(outputRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name);
  } catch {
    return [];
  }

  const summaries: ProjectSummary[] = [];
  for (const project of names) {
    const paths = projectPaths(outputRoot, project);
    const manifest = await readProjectManifest(paths.manifest);
    const sessionIds = await listSessionIds(paths.projectDir);
    if (manifest === undefined && sessionIds.length === 0) continue;
    summaries.push({
      project,
      paths,
      manifest,
      sessionCount: sessionIds.length,
      lastActiveAt: await lastActive(paths, sessionIds, manifest),
    });
  }

  summaries.sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0));
  return summaries;
}

async function listSessionIds(projectDir: string): Promise<string[]> {
  try {
    return (await readdir(projectDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && RUN_ID_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}

async function lastActive(
  paths: ProjectPaths,
  sessionIds: readonly string[],
  manifest: ProjectManifest | undefined,
): Promise<number | undefined> {
  const newest = sessionIds[0];
  if (newest !== undefined) {
    const fromId = sessionIdToMillis(newest);
    if (fromId !== undefined) return fromId;
  }
  if (manifest !== undefined) {
    const parsed = Date.parse(manifest.updatedAt);
    if (!Number.isNaN(parsed)) return parsed;
  }
  try {
    return (await stat(paths.projectDir)).mtimeMs;
  } catch {
    return undefined;
  }
}

/** `20260812T160000Z-a1b2c3` → epoch ms, or absent when it is not a session id. */
export function sessionIdToMillis(sessionId: string): number | undefined {
  const match = /^(\d{8})T(\d{6})Z/.exec(sessionId);
  const date = match?.[1];
  const time = match?.[2];
  if (date === undefined || time === undefined) return undefined;
  const iso =
    `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T` +
    `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? undefined : value;
}

/**
 * Everything a project has captured, read from every session in it.
 *
 * This is the input to both the project page and the export: one flat view of
 * the whole project, with each capture still knowing which session wrote it so
 * a path can be resolved back to a real file.
 */
export interface ProjectContents {
  project: string;
  paths: ProjectPaths;
  manifest: ProjectManifest | undefined;
  sessions: ProjectSession[];
  captures: ProjectCapture[];
  /** Sessions whose records could not be read at all, so the gap is visible. */
  unreadableSessions: string[];
  /** Individual JSONL lines that failed to parse, across all sessions. */
  unreadableRecords: number;
}

export interface ProjectCapture {
  sessionId: string;
  /** Path relative to the project directory: `<sessionId>/screenshots/…`. */
  projectPath: string;
  record: CaptureRecord;
}

export async function readProjectContents(
  outputRoot: string,
  project: string,
): Promise<ProjectContents> {
  const paths = projectPaths(outputRoot, project);
  const manifest = await readProjectManifest(paths.manifest);
  const sessions = await readProjectSessions(outputRoot, project);

  const captures: ProjectCapture[] = [];
  const unreadableSessions: string[] = [];
  let unreadableRecords = 0;

  for (const session of sessions) {
    try {
      const read = await readCaptures(join(session.runDir, 'captures.jsonl'));
      unreadableRecords += read.invalidLines.length;
      for (const record of read.records) {
        const artifact = record.image?.relativePath ?? record.video?.relativePath;
        captures.push({
          sessionId: session.id,
          // Run-relative paths become project-relative by prefixing the session
          // directory, which is exactly where the run directory sits.
          projectPath: artifact === undefined ? '' : `${session.id}/${artifact}`,
          record,
        });
      }
    } catch {
      unreadableSessions.push(session.id);
    }
  }

  return {
    project,
    paths,
    manifest,
    sessions,
    captures,
    unreadableSessions,
    unreadableRecords,
  };
}
