/**
 * What a captured file should be called when it leaves here.
 *
 * The working filename (`captureSlug`) is written for the person scrolling a
 * folder mid-run: it is grouped by route and viewport because that is how the
 * folders are grouped, and it repeats itself freely because the folder gives it
 * context. An export has no folders. It is a flat pile of reference images
 * handed to a design tool, read in the order they sort, with nothing around
 * them to say what they are.
 *
 * So the export name does three things the working name does not:
 *
 *  1. It sorts into reading order — whole pages first, then components, then
 *     motion — because that is the order the reference material is useful in.
 *  2. It says its own group in the name, so a file torn out of the set still
 *     announces whether it is a screen or a button.
 *  3. It starts minimal and grows only where it has to. A name is qualified
 *     with its viewport, or its route, or its session, exactly when something
 *     else would otherwise be called the same thing — so `button-save-hover`
 *     stays `button-save-hover` unless there really are two of them.
 *
 * Nothing here invents a description. Every part comes off the capture record,
 * which means an export name can be shorter than you hoped but never wrong.
 */

import type { CaptureRecord } from '@ui-atlas/protocol';
import { describeCapture } from './index-doc.js';
import { slugPart, trimSlug } from './naming.js';
import type { ProjectCapture } from './project.js';

/**
 * The three kinds of reference material a design tool treats differently: a
 * whole screen to match, a component to reproduce, and motion to feel.
 */
export type ExportGroup = 'page' | 'component' | 'motion';

const GROUP_ORDER: Record<ExportGroup, number> = { page: 0, component: 1, motion: 2 };

export interface ExportPlanEntry {
  /** Project-relative source, exactly as the capture record has it. */
  source: string;
  /** `03-page-pricing-desktop.png` */
  name: string;
  group: ExportGroup;
  /** 1-based position in the exported set, which is what the prefix encodes. */
  index: number;
  /** `/pricing`, or `-` when the capture recorded no page. */
  route: string;
  /** The same sentence the run index uses, carried into the export manifest. */
  description: string;
  sessionId: string;
}

export interface ExportPlan {
  entries: ExportPlanEntry[];
  /** Captures with nothing to export, and the reason, so the gap is visible. */
  skipped: Array<{ description: string; reason: string }>;
}

interface Candidate {
  source: string;
  sessionId: string;
  group: ExportGroup;
  route: string;
  routeSlug: string;
  extension: string;
  description: string;
  /** Sort key within the group, before numbering. */
  sortKey: string;
  parts: string[];
  /** Qualifiers appended, in this order, only when a name collides. */
  extras: string[];
}

/**
 * Plan the whole export in one pass.
 *
 * It has to be one pass over everything: a name can only be known to be unique
 * relative to the other names in the same set, so there is no per-file version
 * of this function that could be right.
 */
export function planDesignExport(captures: readonly ProjectCapture[]): ExportPlan {
  const candidates: Candidate[] = [];
  const skipped: ExportPlan['skipped'] = [];

  // Routes are numbered by when each was *first* captured, so the export reads
  // in the order the site was actually walked. Ordering by iteration would
  // follow the sessions, which arrive newest-first — the pages from the most
  // recent sitting would lead, which is the reverse of how anyone walked them.
  const firstSeen = new Map<string, string>();
  for (const capture of captures) {
    const route = routeOf(capture.record);
    const at = capture.record.capturedAt;
    const existing = firstSeen.get(route);
    if (existing === undefined || at < existing) firstSeen.set(route, at);
  }
  const routeOrder = new Map<string, number>(
    [...firstSeen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
      .map(([route], index) => [route, index]),
  );

  for (const capture of captures) {
    const { record } = capture;
    const description = describeCapture(record);

    if (capture.projectPath.length === 0) {
      skipped.push({
        description,
        reason: record.error?.message ?? `${record.status}, with no file written`,
      });
      continue;
    }

    const route = routeOf(record);
    const routeSlug = trimSlug(slugPart(routeSlugSource(record)), 24) || 'page';
    const group = groupOf(record);
    const rank = routeOrder.get(route) ?? 0;

    candidates.push({
      source: capture.projectPath,
      sessionId: capture.sessionId,
      group,
      route,
      routeSlug,
      extension: extensionOf(capture.projectPath),
      description,
      sortKey: sortKeyFor(record, group, rank, routeSlug),
      parts: baseParts(record, group, routeSlug),
      extras: extrasFor(record, capture.sessionId, group, routeSlug),
    });
  }

  disambiguate(candidates);

  candidates.sort(
    (a, b) =>
      GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
      a.sortKey.localeCompare(b.sortKey) ||
      a.parts.join('-').localeCompare(b.parts.join('-')),
  );

  const width = Math.max(2, String(candidates.length).length);
  const entries = candidates.map((candidate, position) => ({
    source: candidate.source,
    name:
      `${String(position + 1).padStart(width, '0')}-${candidate.group}-` +
      `${candidate.parts.join('-')}${candidate.extension}`,
    group: candidate.group,
    index: position + 1,
    route: candidate.route,
    description: candidate.description,
    sessionId: candidate.sessionId,
  }));

  return { entries, skipped };
}

/**
 * Give colliding names the smallest qualifier that tells them apart.
 *
 * Each round appends one more dimension — viewport, then route, then session —
 * but only to the names that are still ambiguous, so a unique name never grows
 * a suffix it did not need. Anything still identical after every dimension has
 * been tried really is two captures of the same thing, and gets a counter.
 */
function disambiguate(candidates: readonly Candidate[]): void {
  const maxRounds = Math.max(0, ...candidates.map((candidate) => candidate.extras.length));

  for (let round = 0; round < maxRounds; round += 1) {
    const groups = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const key = `${candidate.group}/${candidate.parts.join('-')}`;
      const bucket = groups.get(key);
      if (bucket === undefined) groups.set(key, [candidate]);
      else bucket.push(candidate);
    }

    let stillColliding = false;
    for (const bucket of groups.values()) {
      if (bucket.length < 2) continue;
      stillColliding = true;
      for (const candidate of bucket) {
        const extra = candidate.extras[round];
        // Skip an empty qualifier rather than appending a bare hyphen: two
        // captures at the same viewport genuinely have nothing to add here.
        if (extra !== undefined && extra.length > 0 && !candidate.parts.includes(extra)) {
          candidate.parts.push(extra);
        }
      }
    }
    if (!stillColliding) return;
  }

  // Last resort. Deterministic: the counter follows source path order, which is
  // stable across runs of the planner over the same directory.
  const seen = new Map<string, number>();
  const ordered = [...candidates].sort((a, b) => a.source.localeCompare(b.source));
  for (const candidate of ordered) {
    const key = `${candidate.group}/${candidate.parts.join('-')}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > 1) candidate.parts.push(String(count));
  }
}

function groupOf(record: CaptureRecord): ExportGroup {
  switch (record.kind) {
    case 'viewport':
    case 'full-page':
      return 'page';
    case 'animation-frame':
    case 'animation-video':
      return 'motion';
    case 'element':
      return 'component';
  }
}

/**
 * The shortest name that could work, before anything is disambiguated.
 *
 * A page is named after its route, because that is what distinguishes one
 * screen from another. A component is named after what it is and what state it
 * is in, and deliberately *not* after its route: the same button on three pages
 * should read as one component until it turns out there are three different
 * ones, at which point the route gets added back.
 */
function baseParts(record: CaptureRecord, group: ExportGroup, routeSlug: string): string[] {
  const parts: string[] = [];

  if (group === 'page') {
    parts.push(routeSlug);
    if (record.kind === 'full-page') parts.push('full');
    const state = stateSlug(record);
    if (state !== undefined) parts.push(state);
    return parts;
  }

  if (group === 'motion') {
    // Named the same way a component is. Two animations on one page are two
    // different things, and `img-frame-050` twice would say nothing about
    // which was which.
    parts.push(identityOf(record, routeSlug));
    if (record.kind === 'animation-video') {
      parts.push('recording');
    } else {
      const progress = record.animation?.progress;
      if (progress !== undefined && Number.isFinite(progress)) {
        const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
        parts.push(`frame-${String(percent).padStart(3, '0')}`);
      }
    }
    return parts;
  }

  parts.push(subjectSlug(record) ?? 'element');
  const label = labelSlug(record);
  if (label !== undefined) parts.push(label);
  const state = stateSlug(record);
  if (state !== undefined) parts.push(state);
  return parts;
}

/**
 * The dimensions that could tell two same-named captures apart, in the order
 * they are worth trying.
 *
 * Viewport first because it is the most common reason for a duplicate and the
 * most useful thing to know. Route second. Session last, because a session id
 * says nothing about the picture and is only ever a tie-break.
 */
function extrasFor(
  record: CaptureRecord,
  sessionId: string,
  group: ExportGroup,
  routeSlug: string,
): string[] {
  const viewport = viewportSlug(record);
  const session = trimSlug(slugPart(sessionId.slice(sessionId.lastIndexOf('-') + 1)), 8);
  return group === 'page' ? [viewport, session] : [viewport, routeSlug, session];
}

function viewportSlug(record: CaptureRecord): string {
  const name = record.viewport.name;
  if (name !== undefined && name.length > 0) return trimSlug(slugPart(name), 16);
  return `${String(record.viewport.width)}w`;
}

function subjectSlug(record: CaptureRecord): string | undefined {
  const element = record.element;
  if (element === undefined) return undefined;
  // The ARIA role describes the component; the tag name only describes the
  // markup that happens to implement it.
  const role = trimSlug(slugPart(element.role ?? ''), 20);
  if (role.length > 0) return role;
  const tag = trimSlug(slugPart(element.tagName), 20);
  return tag.length > 0 ? tag : undefined;
}

const USELESS_LABELS = new Set(['', '-', 'div', 'span', 'undefined', 'null']);

function labelSlug(record: CaptureRecord): string | undefined {
  const element = record.element;
  if (element === undefined) return undefined;
  for (const source of [element.accessibleName, element.textExcerpt]) {
    if (source === undefined) continue;
    const slug = trimSlug(slugPart(source), 32);
    if (!USELESS_LABELS.has(slug)) return slug;
  }
  return undefined;
}

/** `default` is the absence of a state, so it is left out of the name. */
function stateSlug(record: CaptureRecord): string | undefined {
  if (record.kind === 'animation-video') return undefined;
  const { name, label } = record.state;
  if (name === 'default') return undefined;
  if (name !== 'custom') return name;
  const detail = label === undefined ? '' : trimSlug(slugPart(label), 24);
  return detail.length > 0 ? `custom-${detail}` : 'custom';
}

/** The order a state matrix is read in, so a component's variants run in it. */
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

function stateRank(record: CaptureRecord): number {
  const index = STATE_ORDER.indexOf(record.state.name);
  return index === -1 ? STATE_ORDER.length : index;
}

/**
 * Where a capture sits in the exported set.
 *
 * Pages sort by route, then widest viewport first — the desktop shot is the one
 * a designer looks at to understand a screen, and the narrow ones qualify it.
 *
 * Components sort by *identity* first, so `button "Save"` and its hover, focus
 * and active shots land next to each other. Sorting components by route would
 * scatter a state matrix across the set, which is precisely the thing the
 * matrix exists to keep together.
 */
function sortKeyFor(
  record: CaptureRecord,
  group: ExportGroup,
  routeRank: number,
  routeSlug: string,
): string {
  const width = String(10_000 - Math.min(9_999, record.viewport.width)).padStart(5, '0');
  const state = String(stateRank(record)).padStart(2, '0');
  const rank = String(routeRank).padStart(4, '0');

  if (group === 'page') return `${rank}-${width}-${state}`;
  if (group === 'motion') return `${rank}-${identityOf(record, routeSlug)}-${frameKey(record)}`;
  return `${identityOf(record, routeSlug)}-${state}-${width}`;
}

/** What the thing is, ignoring which state it happens to be in. */
function identityOf(record: CaptureRecord, routeSlug: string): string {
  return [subjectSlug(record) ?? routeSlug, labelSlug(record)]
    .filter((part): part is string => part !== undefined && part.length > 0)
    .join('-');
}

function frameKey(record: CaptureRecord): string {
  const progress = record.animation?.progress;
  if (progress === undefined || !Number.isFinite(progress)) return '000';
  return String(Math.round(Math.min(1, Math.max(0, progress)) * 100)).padStart(3, '0');
}

/** `/pricing` — how the route is shown to a person, in the manifest. */
function routeOf(record: CaptureRecord): string {
  try {
    const path = new URL(record.finalUrl).pathname;
    return path.length === 0 ? '/' : path;
  } catch {
    return record.routeKey;
  }
}

/** `pricing`, `home` — how the route is spelled inside a filename. */
function routeSlugSource(record: CaptureRecord): string {
  try {
    const path = new URL(record.finalUrl).pathname.replace(/^\/+|\/+$/g, '');
    return path.length === 0 ? 'home' : path;
  } catch {
    return record.routeKey;
  }
}

function extensionOf(path: string): string {
  const match = /\.[A-Za-z0-9]+$/.exec(path);
  return match?.[0]?.toLowerCase() ?? '.png';
}
