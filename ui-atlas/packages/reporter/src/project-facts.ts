/**
 * Everything a project knows about itself, gathered once.
 *
 * Two things consume this: the project page, which shows it, and the design
 * prompt, which describes it to a model. They must not disagree — a prompt that
 * claims four viewports next to a page listing three is worse than either alone
 * — so both read the same derived object, and the derivation happens here.
 *
 * Nothing in here is a judgement. "This value appears on 34 elements" is a
 * fact; "this is your primary colour" is not, and this file never says the
 * second thing. The same rule the token report already lives under (ADR 24)
 * applies to everything the prompt is built from.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  planDesignExport,
  readPages,
  readProjectContents,
  routeLabel,
  slugPart,
  trimSlug,
  type ExportPlan,
  type ProjectCapture,
  type ProjectContents,
  type ProjectSession,
} from '@ui-atlas/artifacts';
import {
  DesignTokenReportSchema,
  type CaptureRecord,
  type DesignTokenCandidate,
  type DesignTokenReport,
  type ProjectManifest,
  type TokenCategory,
} from '@ui-atlas/protocol';

/** How many observed values of each category are worth putting in front of a person. */
const TOKENS_PER_CATEGORY = 12;

export interface RouteFact {
  /** `/pricing` */
  path: string;
  url: string;
  title: string | undefined;
  captures: number;
  /** Sessions that visited it. */
  sessionIds: string[];
}

export interface ViewportFact {
  label: string;
  width: number;
  height: number;
  captures: number;
  /** True when the capture was taken under real device emulation. */
  mobile: boolean;
}

export interface ComponentFact {
  /** Stable identity: what it is plus what it is called. */
  key: string;
  /** `button`, `checkbox`, `nav` — the ARIA role where there was one. */
  subject: string;
  /** Its accessible name, when it had one. */
  label: string | undefined;
  /** Every state captured of it, in the order states are usually listed. */
  states: string[];
  captures: number;
  routes: string[];
  /** Project-relative path to one representative image, for the page's grid. */
  sampleFile: string | undefined;
}

export interface MotionFact {
  name: string;
  kind: 'frames' | 'recording';
  route: string;
  frames: number;
  durationMs: number | undefined;
}

export interface TokenFact {
  value: string;
  count: number;
  /** The computed properties it turned up as, for context. */
  properties: string[];
}

export type TokenGroups = Partial<Record<TokenCategory, TokenFact[]>>;

export interface SessionFact {
  id: string;
  command: string;
  startedAt: string | undefined;
  finishedAt: string | undefined;
  open: boolean;
  captured: number;
  failed: number;
  skipped: number;
  routes: string[];
  entryUrl: string | undefined;
  hasReport: boolean;
}

export interface ProjectFacts {
  project: string;
  manifest: ProjectManifest | undefined;
  generatedAt: string;
  sessions: SessionFact[];
  totals: {
    sessions: number;
    captured: number;
    failed: number;
    skipped: number;
    /** Captures that produced a file, which is what an export can carry. */
    files: number;
    routes: number;
  };
  routes: RouteFact[];
  viewports: ViewportFact[];
  components: ComponentFact[];
  motion: MotionFact[];
  tokens: TokenGroups;
  /** Which session's token scan this came from, when one ran. */
  tokensFrom: string | undefined;
  /** The renamed set an export would write. Shown on the page before it exists. */
  exportPlan: ExportPlan;
  warnings: string[];
  contents: ProjectContents;
}

export async function collectProjectFacts(input: {
  outputRoot: string;
  project: string;
  generatedAt?: string;
}): Promise<ProjectFacts> {
  const contents = await readProjectContents(input.outputRoot, input.project);
  const warnings: string[] = [];

  if (contents.unreadableSessions.length > 0) {
    warnings.push(
      `${String(contents.unreadableSessions.length)} session(s) could not be read and are not included: ` +
        contents.unreadableSessions.join(', '),
    );
  }
  if (contents.unreadableRecords > 0) {
    warnings.push(
      `${String(contents.unreadableRecords)} record(s) across this project could not be parsed and are not shown.`,
    );
  }

  const routes = await collectRoutes(contents);
  const { tokens, tokensFrom } = await collectTokens(contents.sessions);

  const totals = { sessions: contents.sessions.length, captured: 0, failed: 0, skipped: 0, files: 0, routes: routes.length };
  for (const capture of contents.captures) {
    if (capture.record.status === 'captured') totals.captured += 1;
    else if (capture.record.status === 'failed') totals.failed += 1;
    else totals.skipped += 1;
    if (capture.projectPath.length > 0) totals.files += 1;
  }

  return {
    project: input.project,
    manifest: contents.manifest,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sessions: contents.sessions.map(sessionFact),
    totals,
    routes,
    viewports: collectViewports(contents.captures),
    components: collectComponents(contents.captures),
    motion: collectMotion(contents.captures),
    tokens,
    tokensFrom,
    exportPlan: planDesignExport(contents.captures),
    warnings,
    contents,
  };
}

function sessionFact(session: ProjectSession): SessionFact {
  const counts = session.counts ?? { captured: 0, failed: 0, skipped: 0, pages: 0 };
  return {
    id: session.id,
    command: session.command,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    open: session.open,
    captured: counts.captured,
    failed: counts.failed,
    skipped: counts.skipped,
    routes: session.routes,
    entryUrl: session.entryUrl,
    hasReport: session.hasReport,
  };
}

/**
 * Routes come from the page records rather than from the captures, because a
 * page that was visited and captured nothing is still part of what this project
 * knows about the site.
 */
async function collectRoutes(contents: ProjectContents): Promise<RouteFact[]> {
  const byPath = new Map<string, RouteFact>();

  for (const session of contents.sessions) {
    const pagesPath = join(session.runDir, 'pages.jsonl');
    if (!existsSync(pagesPath)) continue;
    const pages = await readPages(pagesPath).catch(() => undefined);
    for (const page of pages?.records ?? []) {
      const path = routeLabel(page.finalUrl);
      const existing = byPath.get(path);
      if (existing === undefined) {
        byPath.set(path, {
          path,
          url: page.finalUrl,
          title: page.title,
          captures: 0,
          sessionIds: [session.id],
        });
        continue;
      }
      existing.title ??= page.title;
      if (!existing.sessionIds.includes(session.id)) existing.sessionIds.push(session.id);
    }
  }

  for (const capture of contents.captures) {
    const path = routeLabel(capture.record.finalUrl);
    const existing = byPath.get(path);
    if (existing === undefined) {
      byPath.set(path, {
        path,
        url: capture.record.finalUrl,
        title: undefined,
        captures: 1,
        sessionIds: [capture.sessionId],
      });
      continue;
    }
    existing.captures += 1;
  }

  return [...byPath.values()].sort((a, b) => b.captures - a.captures || a.path.localeCompare(b.path));
}

function collectViewports(captures: readonly ProjectCapture[]): ViewportFact[] {
  const byLabel = new Map<string, ViewportFact>();
  for (const { record } of captures) {
    const viewport = record.viewport;
    const label = viewport.name ?? `${String(viewport.width)}×${String(viewport.height)}`;
    const existing = byLabel.get(label);
    if (existing === undefined) {
      byLabel.set(label, {
        label,
        width: viewport.width,
        height: viewport.height,
        captures: 1,
        mobile: viewport.mobile === true,
      });
      continue;
    }
    existing.captures += 1;
  }
  return [...byLabel.values()].sort((a, b) => b.width - a.width);
}

/** The order a state matrix is usually read in, so the lists are comparable. */
const STATE_ORDER = [
  'default',
  'hover',
  'focus',
  'focus-visible',
  'active',
  'checked',
  'selected',
  'expanded',
  'disabled',
];

function collectComponents(captures: readonly ProjectCapture[]): ComponentFact[] {
  const byKey = new Map<string, ComponentFact>();

  for (const capture of captures) {
    const { record } = capture;
    if (record.kind !== 'element' || record.element === undefined) continue;

    const subject = subjectOf(record);
    const label = labelOf(record);
    const key = `${subject}::${label ?? ''}`;
    const state = record.state.label ?? record.state.name;
    const route = routeLabel(record.finalUrl);

    let fact = byKey.get(key);
    if (fact === undefined) {
      fact = { key, subject, label, states: [], captures: 0, routes: [], sampleFile: undefined };
      byKey.set(key, fact);
    }
    fact.captures += 1;
    if (!fact.states.includes(state)) fact.states.push(state);
    if (!fact.routes.includes(route)) fact.routes.push(route);
    // The default state is what a component looks like; anything else is a
    // variation on it, so it is the better thumbnail when there is one.
    if (capture.projectPath.length > 0 && (fact.sampleFile === undefined || state === 'default')) {
      fact.sampleFile = capture.projectPath;
    }
  }

  for (const fact of byKey.values()) {
    fact.states.sort((a, b) => stateRank(a) - stateRank(b) || a.localeCompare(b));
  }

  return [...byKey.values()].sort(
    (a, b) => b.states.length - a.states.length || b.captures - a.captures || a.key.localeCompare(b.key),
  );
}

function stateRank(state: string): number {
  const index = STATE_ORDER.indexOf(state);
  return index === -1 ? STATE_ORDER.length : index;
}

function collectMotion(captures: readonly ProjectCapture[]): MotionFact[] {
  const byKey = new Map<string, MotionFact>();

  for (const { record } of captures) {
    if (record.kind !== 'animation-frame' && record.kind !== 'animation-video') continue;
    const route = routeLabel(record.finalUrl);
    const kind = record.kind === 'animation-video' ? 'recording' : 'frames';
    // The animation id is what the inventory called it; there is no prettier
    // name recorded, and inventing one would name a thing this never saw.
    const name =
      record.animation?.animationId ??
      record.element?.accessibleName ??
      (kind === 'recording' ? 'page recording' : 'animation');
    const key = `${route}::${name}::${kind}`;
    const durationMs = record.animation?.durationMs ?? record.video?.durationMs;

    const existing = byKey.get(key);
    if (existing === undefined) {
      byKey.set(key, { name, kind, route, frames: 1, durationMs });
      continue;
    }
    existing.frames += 1;
    existing.durationMs ??= durationMs;
  }

  return [...byKey.values()].sort((a, b) => b.frames - a.frames || a.name.localeCompare(b.name));
}

/**
 * The newest session that actually scanned styles wins.
 *
 * Merging several scans would double-count: the same value on the same element
 * seen by two runs is one observation of the site, not two, and this module is
 * not allowed to invent a number that no scan produced.
 */
async function collectTokens(
  sessions: readonly ProjectSession[],
): Promise<{ tokens: TokenGroups; tokensFrom: string | undefined }> {
  for (const session of sessions) {
    const report = await readTokenReport(join(session.runDir, 'tokens.json'));
    if (report === undefined) continue;
    return { tokens: groupTokens(report.candidates), tokensFrom: session.id };
  }
  return { tokens: {}, tokensFrom: undefined };
}

async function readTokenReport(path: string): Promise<DesignTokenReport | undefined> {
  if (!existsSync(path)) return undefined;
  try {
    const parsed = DesignTokenReportSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function groupTokens(candidates: readonly DesignTokenCandidate[]): TokenGroups {
  const groups: TokenGroups = {};
  for (const candidate of candidates) {
    const bucket = (groups[candidate.category] ??= []);
    bucket.push({ value: candidate.value, count: candidate.count, properties: candidate.properties });
  }
  for (const key of Object.keys(groups) as TokenCategory[]) {
    const bucket = groups[key];
    if (bucket === undefined) continue;
    bucket.sort((a, b) => b.count - a.count);
    groups[key] = bucket.slice(0, TOKENS_PER_CATEGORY);
  }
  return groups;
}

function subjectOf(record: CaptureRecord): string {
  const element = record.element;
  if (element === undefined) return 'element';
  const role = trimSlug(slugPart(element.role ?? ''), 24);
  if (role.length > 0) return role;
  return trimSlug(slugPart(element.tagName), 24) || 'element';
}

function labelOf(record: CaptureRecord): string | undefined {
  const element = record.element;
  if (element === undefined) return undefined;
  for (const source of [element.accessibleName, element.textExcerpt]) {
    if (source === undefined) continue;
    const flat = source.replace(/\s+/g, ' ').trim();
    if (flat.length > 0) return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat;
  }
  return undefined;
}
