import type { CaptureRecord, PageRecord, RunManifest } from '@ui-atlas/protocol';

/**
 * A capture as the index shows it: the file, and the sentence that says what is
 * in it. Everything here is read off the record — the index never re-derives a
 * name, so what it lists is exactly what is on disk.
 */
export interface IndexEntry {
  file: string;
  description: string;
  viewportLabel: string;
  status: CaptureRecord['status'];
}

export interface IndexRoute {
  routeKey: string;
  url: string;
  title: string | undefined;
  entries: IndexEntry[];
  /** Captures that produced no file: failed, or skipped for a stated reason. */
  missing: Array<{ description: string; reason: string }>;
}

/**
 * Group a run's captures the way the folders are grouped: by route, then by
 * viewport, in the order the routes were first seen. Pure, so the index can be
 * tested without a filesystem.
 */
export function groupForIndex(captures: CaptureRecord[], pages: PageRecord[] = []): IndexRoute[] {
  const titles = new Map<string, { url: string; title: string | undefined }>();
  for (const page of pages) {
    if (!titles.has(page.routeKey)) {
      titles.set(page.routeKey, { url: page.finalUrl, ...(page.title === undefined ? { title: undefined } : { title: page.title }) });
    }
  }

  const routes = new Map<string, IndexRoute>();
  for (const capture of captures) {
    let route = routes.get(capture.routeKey);
    if (route === undefined) {
      const known = titles.get(capture.routeKey);
      route = {
        routeKey: capture.routeKey,
        url: known?.url ?? capture.finalUrl,
        title: known?.title,
        entries: [],
        missing: [],
      };
      routes.set(capture.routeKey, route);
    }

    const file = capture.image?.relativePath ?? capture.video?.relativePath;
    if (file === undefined) {
      route.missing.push({
        description: describeCapture(capture),
        reason: capture.error?.message ?? `${capture.status}, with no reason recorded`,
      });
      continue;
    }
    route.entries.push({
      file,
      description: describeCapture(capture),
      viewportLabel: capture.viewport.name ?? `${String(capture.viewport.width)}w`,
      status: capture.status,
    });
  }

  for (const route of routes.values()) {
    route.entries.sort((a, b) => a.file.localeCompare(b.file));
  }
  return [...routes.values()];
}

/**
 * One sentence describing what a capture is of, in the same vocabulary the
 * filename uses. This is the column a human reads when deciding what to rename
 * a file to, so it says what the name could not fit.
 */
export function describeCapture(capture: CaptureRecord): string {
  const parts: string[] = [];
  const element = capture.element;
  if (element === undefined) {
    parts.push(capture.kind === 'animation-video' ? 'page recording' : capture.kind);
  } else {
    const what = element.role ?? element.tagName.toLowerCase();
    const named = element.accessibleName ?? element.textExcerpt;
    parts.push(named === undefined ? `<${what}>` : `<${what}> “${collapse(named)}”`);
  }

  if (capture.kind !== 'animation-video') {
    parts.push(
      capture.state.name === 'custom' && capture.state.label !== undefined
        ? `state: ${capture.state.label}`
        : `state: ${capture.state.name}`,
    );
  }
  if (capture.animation !== undefined) {
    parts.push(`frame at ${String(Math.round(capture.animation.progress * 100))}%`);
  }
  parts.push(`${String(capture.viewport.width)}×${String(capture.viewport.height)}`);
  return parts.join(' · ');
}

const RENAME_NOTE =
  'Renaming a file here does **not** update `captures.jsonl`, this index, or the ' +
  '`.json` sidecar beside it. Rename the sidecar to match if you want the pair to stay together.';

/** The run-level index: every route, with a link into its own folder index. */
export function renderRunIndex(input: {
  manifest: RunManifest;
  routes: IndexRoute[];
}): string {
  const { manifest, routes } = input;
  const lines: string[] = [
    `# ${manifest.project} — ${manifest.runId}`,
    '',
    `Captured by \`ui-atlas ${manifest.command}\` at ${manifest.startedAt}.`,
    '',
    RENAME_NOTE,
    '',
  ];

  if (routes.length === 0) {
    lines.push('No captures were written in this run.', '');
    return `${lines.join('\n')}\n`;
  }

  lines.push('| Page | Captures | Folder |', '| --- | --- | --- |');
  for (const route of routes) {
    const label = route.title === undefined ? route.url : `${route.title} — ${route.url}`;
    lines.push(
      `| ${escapeCell(label)} | ${String(route.entries.length)} | [\`${route.routeKey}/\`](screenshots/${route.routeKey}/index.md) |`,
    );
  }
  lines.push('');

  for (const route of routes) {
    lines.push(...routeSection(route, 2));
  }
  return `${lines.join('\n')}\n`;
}

/** The per-folder index, written beside the images it lists. */
export function renderRouteIndex(route: IndexRoute): string {
  const heading = route.title === undefined ? route.routeKey : route.title;
  const lines: string[] = [
    `# ${heading}`,
    '',
    route.url,
    '',
    RENAME_NOTE,
    '',
    ...routeSection(route, 2, { pathsRelativeTo: `screenshots/${route.routeKey}` }),
  ];
  return `${lines.join('\n')}\n`;
}

function routeSection(
  route: IndexRoute,
  level: number,
  options: { pathsRelativeTo?: string } = {},
): string[] {
  const hashes = '#'.repeat(level);
  const lines: string[] = [];
  if (options.pathsRelativeTo === undefined) {
    lines.push(`${hashes} ${route.url}`, '');
  }

  const byViewport = new Map<string, IndexEntry[]>();
  for (const entry of route.entries) {
    const bucket = byViewport.get(entry.viewportLabel);
    if (bucket === undefined) byViewport.set(entry.viewportLabel, [entry]);
    else bucket.push(entry);
  }

  for (const [viewport, entries] of byViewport) {
    lines.push(`${hashes}# ${viewport}`, '', '| File | What it is |', '| --- | --- |');
    for (const entry of entries) {
      const path = relativise(entry.file, options.pathsRelativeTo);
      lines.push(`| [\`${path}\`](${encodeURI(path)}) | ${escapeCell(entry.description)} |`);
    }
    lines.push('');
  }

  if (route.missing.length > 0) {
    lines.push(
      `${hashes}# Not captured here`,
      '',
      'These were attempted and produced no file. They are listed so the gap is visible.',
      '',
    );
    for (const item of route.missing) {
      lines.push(`- ${escapeCell(item.description)} — ${escapeCell(item.reason)}`);
    }
    lines.push('');
  }
  return lines;
}

/**
 * Rewrite a run-relative path so it resolves from a folder inside the run.
 *
 * Not just prefix-stripping: a route's recordings live under `animations/`
 * while its index sits under `screenshots/`, so those links have to climb out
 * of the folder they are written in or they point at nothing.
 */
export function relativise(file: string, base: string | undefined): string {
  if (base === undefined) return file;
  const from = base.split('/').filter((part) => part.length > 0);
  const to = file.split('/').filter((part) => part.length > 0);

  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared += 1;

  const up = Array.from({ length: from.length - shared }, () => '..');
  return [...up, ...to.slice(shared)].join('/');
}

function collapse(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
}

/** Pipes and newlines would break the table row this text sits in. */
function escapeCell(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/g, ' ').replace(/\|/g, '\\|');
}
