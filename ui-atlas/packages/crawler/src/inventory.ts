import type { Page } from 'playwright';
import { newInteractionId } from '@ui-atlas/artifacts';
import type { InventoryConfig } from '@ui-atlas/config';
import type {
  InteractionCandidate,
  InteractionClass,
  LocatorCandidate,
  PageRecord,
} from '@ui-atlas/protocol';
import { SCHEMA_VERSION } from '@ui-atlas/protocol';
import { classifyInteraction, REVIEWABLE_CLASSES, type ClassifyOptions } from './classify.js';
import { collectInteractions } from './inventory-page.js';

export interface InventoryOptions extends ClassifyOptions {
  config: InventoryConfig;
  runId: string;
}

/**
 * Reads the interactive controls off a page and says what each is likely to do.
 *
 * It never activates anything. The output is for a person to read before
 * deciding what deserves a recipe — the brief's "suggestion-only" traversal.
 */
export class InteractionInventory {
  constructor(private readonly options: InventoryOptions) {}

  get enabled(): boolean {
    return this.options.config.enabled;
  }

  async collect(page: Page, record: PageRecord): Promise<InteractionCandidate[]> {
    if (!this.enabled) return [];

    const facts = await page.evaluate(collectInteractions, this.options.config.maxPerPage);
    const foundAt = new Date().toISOString();

    return facts.map((fact) => {
      const { classification, reasons } = classifyInteraction(fact, this.options);
      const locator = bestLocator(fact.probe.candidates);
      const candidate: InteractionCandidate = {
        schemaVersion: SCHEMA_VERSION,
        id: newInteractionId(),
        runId: this.options.runId,
        pageId: record.id,
        url: record.finalUrl,
        routeKey: record.routeKey,
        foundAt,
        tagName: fact.tagName,
        classification,
        reasons,
        boundingBox: fact.probe.boundingBox,
        disabled: fact.disabled,
      };
      if (fact.probe.role !== undefined) candidate.role = fact.probe.role;
      if (fact.probe.accessibleName !== undefined) {
        candidate.accessibleName = fact.probe.accessibleName;
      }
      if (fact.probe.textExcerpt !== undefined) candidate.textExcerpt = fact.probe.textExcerpt;
      if (locator !== undefined) candidate.locator = locator;
      if (fact.href !== undefined) candidate.href = fact.href;
      return candidate;
    });
  }
}

/**
 * Highest-scoring unique candidate, falling back to the best of the rest.
 * Uniqueness first, for the same reason capture ranking does it (ADR 8): a
 * suggestion that matches three elements is worse than a plainer one that
 * matches the right one.
 */
function bestLocator(candidates: LocatorCandidate[]): LocatorCandidate | undefined {
  const unique = candidates.filter((candidate) => candidate.uniquenessCount === 1);
  const pool = unique.length > 0 ? unique : candidates;
  return [...pool].sort((a, b) => b.score - a.score)[0];
}

export interface InventorySummary {
  total: number;
  byClass: Record<InteractionClass, number>;
  routes: number;
}

export function summariseInventory(candidates: InteractionCandidate[]): InventorySummary {
  const byClass: Record<InteractionClass, number> = {
    navigation: 0,
    inert: 0,
    mutation: 0,
    unknown: 0,
  };
  const routes = new Set<string>();
  for (const candidate of candidates) {
    byClass[candidate.classification] += 1;
    routes.add(candidate.routeKey);
  }
  return { total: candidates.length, byClass, routes: routes.size };
}

/* -------------------------------------------------------------------------- */
/* Suggested recipes                                                           */
/* -------------------------------------------------------------------------- */

function yamlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * A recipe target for this locator, or `undefined` when the candidate type has
 * no equivalent in the recipe vocabulary. `alt` and `title` have none, and
 * inventing a CSS selector for them would be guessing.
 */
export function targetFor(locator: LocatorCandidate | undefined): string | undefined {
  if (locator === undefined) return undefined;
  switch (locator.type) {
    case 'test-id':
      return `{ testId: ${yamlString(locator.value)} }`;
    case 'role-name':
      // `value` is the accessible name; the role rides alongside it.
      return locator.role === undefined
        ? undefined
        : `{ role: ${yamlString(locator.role)}, name: ${yamlString(locator.value)} }`;
    case 'label':
      return `{ label: ${yamlString(locator.value)} }`;
    case 'placeholder':
      return `{ placeholder: ${yamlString(locator.value)} }`;
    case 'text':
      return `{ text: ${yamlString(locator.value)} }`;
    case 'id':
      // `CSS.escape` is a DOM API and this runs on the host, so an id that is
      // not a plain identifier goes through an attribute selector instead.
      return /^[A-Za-z_][\w-]*$/.test(locator.value)
        ? `{ css: ${yamlString(`#${locator.value}`)} }`
        : `{ css: ${yamlString(`[id="${locator.value.replace(/["\\]/g, '\\$&')}"]`)} }`;
    case 'css-scoped':
    case 'css-path':
      return `{ css: ${yamlString(locator.value)} }`;
    case 'alt':
    case 'title':
      return undefined;
    default:
      return undefined;
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return '/';
  }
}

function safeName(input: string, fallback: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned.length === 0 ? fallback : cleaned;
}

/**
 * Turn an inventory into a recipe skeleton a human can edit and paste.
 *
 * Two rules make this safe to generate automatically:
 *
 * 1. Only `navigation` and `inert` candidates appear as steps. Anything
 *    classified `mutation` or `unknown` is listed in a comment block instead,
 *    never as something the file would execute.
 * 2. The generated steps only ever `select` and `captureStates`, which do not
 *    click. Controls that look safe to click are named in a comment so a person
 *    decides — a generated file that clicked things would be exactly the
 *    automatic traversal the brief rules out.
 */
export function suggestRecipes(candidates: InteractionCandidate[]): string {
  const lines: string[] = [];
  lines.push('# Suggested recipes — a starting point, not a plan.');
  lines.push('#');
  lines.push('# Generated from the interaction inventory. Nothing here has been clicked, and');
  lines.push('# nothing in this file clicks: the steps below only select elements and');
  lines.push('# photograph their states. Read it, edit it, then paste what you want into');
  lines.push('# your site config under `crawl:`.');
  lines.push('#');
  lines.push('# Controls that might change something are listed as comments only. They are');
  lines.push('# never turned into steps, whatever they look like.');
  lines.push('');

  if (candidates.length === 0) {
    lines.push('# The inventory found no interactive controls.');
    lines.push('recipes: []');
    return lines.join('\n');
  }

  const byRoute = new Map<string, InteractionCandidate[]>();
  for (const candidate of candidates) {
    const route = pathOf(candidate.url);
    const bucket = byRoute.get(route) ?? [];
    bucket.push(candidate);
    byRoute.set(route, bucket);
  }

  lines.push('recipes:');
  let emitted = 0;

  for (const [route, all] of [...byRoute.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const reviewable = all.filter(
      (candidate) =>
        REVIEWABLE_CLASSES.includes(candidate.classification) &&
        !candidate.disabled &&
        targetFor(candidate.locator) !== undefined,
    );
    const risky = all.filter((candidate) => !REVIEWABLE_CLASSES.includes(candidate.classification));
    const clickable = reviewable.filter((candidate) => candidate.classification === 'inert');

    lines.push('');
    lines.push(`  # ${route} — ${String(all.length)} control(s) found`);

    if (risky.length > 0) {
      lines.push(`  # ${String(risky.length)} not suggested, because they may change something:`);
      for (const candidate of risky.slice(0, 12)) {
        const label = candidate.accessibleName ?? candidate.textExcerpt ?? candidate.tagName;
        lines.push(`  #   [${candidate.classification}] ${label} — ${candidate.reasons[0] ?? ''}`);
      }
      if (risky.length > 12) lines.push(`  #   ... and ${String(risky.length - 12)} more`);
    }

    if (reviewable.length === 0) {
      lines.push('  # Nothing here looked safe enough to suggest.');
      continue;
    }

    if (clickable.length > 0) {
      lines.push('  # These look safe to click if you want their opened state; add a');
      lines.push('  # `- click: { ... }` step yourself. This file will not add one for you.');
      for (const candidate of clickable.slice(0, 8)) {
        lines.push(`  #   ${targetFor(candidate.locator) ?? ''}`);
      }
    }

    emitted += 1;
    lines.push(`  - name: ${safeName(route, 'route')}-controls`);
    lines.push(`    match: ${yamlString(route)}`);
    lines.push('    steps:');
    for (const candidate of reviewable.slice(0, 10)) {
      const label = candidate.accessibleName ?? candidate.textExcerpt ?? candidate.tagName;
      lines.push(`      # ${label} (${candidate.classification})`);
      lines.push(`      - select: ${targetFor(candidate.locator) ?? ''}`);
      lines.push('      - captureStates: [default, hover, focus-visible]');
    }
    if (reviewable.length > 10) {
      lines.push(`      # ... and ${String(reviewable.length - 10)} more on this route`);
    }
  }

  if (emitted === 0) {
    lines.push('  []');
  }

  return lines.join('\n');
}
