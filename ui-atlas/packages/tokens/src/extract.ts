import type { Page } from 'playwright';
import type { TokensConfig } from '@ui-atlas/config';
import {
  SCHEMA_VERSION,
  type DesignTokenCandidate,
  type DesignTokenReport,
  type TokenCategory,
  type TokenNearDuplicate,
  type TokenValueKind,
} from '@ui-atlas/protocol';
import { categoryOf, normaliseValue, TOKEN_PROPERTIES } from './normalise.js';
import { collectStyleUsage, type StyleUsage } from './page-scripts.js';

/**
 * The sentence the artifact carries about itself, so the file is honest even
 * when read with no other context.
 */
export const TOKENS_NOTE =
  'These are observed computed values with counts, not a design system. ' +
  '"#2563eb appears on 34 elements" is a fact; "this is your primary colour" ' +
  'is a judgement, and naming things is left to a person.';

export interface ScanTokensOptions {
  runId: string;
  config: TokensConfig;
}

/**
 * Accumulates style usage across pages, then reports what it saw.
 *
 * One instance spans a whole run: a design system is not visible from a single
 * page, and a colour used once per page on twelve pages is a different finding
 * from one used twelve times on one.
 */
export class TokenScanner {
  private readonly buckets = new Map<string, MutableCandidate>();
  private readonly routesSeen = new Set<string>();
  private elementsScanned = 0;
  private elementsSkipped = 0;
  private pagesScanned = 0;
  readonly warnings: string[] = [];

  constructor(private readonly options: ScanTokensOptions) {}

  get enabled(): boolean {
    return this.options.config.enabled;
  }

  get pages(): number {
    return this.pagesScanned;
  }

  /** Read one page. Nothing is clicked, hovered, focused or scrolled. */
  async scan(page: Page, routeKey: string): Promise<void> {
    const usage = await page.evaluate(collectStyleUsage, {
      properties: TOKEN_PROPERTIES.map((entry) => entry.property),
      maxElements: this.options.config.maxElementsPerPage,
      maxExamples: this.options.config.maxExamplesPerValue,
    });
    this.add(usage, routeKey);
  }

  /** Fold one page's readings in. Separated from `scan` so it can be tested. */
  add(usage: StyleUsage, routeKey: string): void {
    this.pagesScanned += 1;
    this.routesSeen.add(routeKey);
    this.elementsScanned += usage.elementsScanned;
    this.elementsSkipped += usage.elementsSkipped;

    if (usage.elementsSkipped > 0) {
      this.warnings.push(
        `${routeKey}: ${String(usage.elementsSkipped)} element(s) were past the ` +
          `${String(this.options.config.maxElementsPerPage)} per-page cap and were not read`,
      );
    }

    for (const entry of usage.entries) {
      const category = categoryOf(entry.property);
      if (category === undefined) continue;
      const normalised = normaliseValue(entry.property, entry.value);
      if (normalised === undefined) continue;

      // Keyed by category *and* kind: a border colour and a border width are
      // both `border`, and are not comparable values.
      const key = `${category}|${normalised.kind}|${normalised.value}`;
      const existing = this.buckets.get(key);
      if (existing === undefined) {
        this.buckets.set(key, {
          category,
          kind: normalised.kind,
          value: normalised.value,
          count: entry.count,
          properties: new Set([entry.property]),
          routes: new Set([routeKey]),
          // Capped here as well as in the page: the page's cap is the same
          // number by configuration rather than by construction, and this is
          // the bound that actually holds the artifact's size down.
          examples: entry.examples.slice(0, this.options.config.maxExamplesPerValue),
          ...(normalised.px === undefined ? {} : { px: normalised.px }),
          ...(normalised.rgba === undefined ? {} : { rgba: normalised.rgba }),
        });
        continue;
      }
      existing.count += entry.count;
      existing.properties.add(entry.property);
      existing.routes.add(routeKey);
      for (const example of entry.examples) {
        if (existing.examples.length >= this.options.config.maxExamplesPerValue) break;
        if (!existing.examples.includes(example)) existing.examples.push(example);
      }
    }
  }

  summarise(generatedAt = new Date().toISOString()): DesignTokenReport {
    const all = [...this.buckets.values()].sort(byCountThenValue);
    const warnings = [...this.warnings];

    const candidates: DesignTokenCandidate[] = [];
    const kept: MutableCandidate[] = [];
    const cap = this.options.config.maxCandidatesPerCategory;
    const perCategory = new Map<TokenCategory, number>();

    for (const bucket of all) {
      const taken = perCategory.get(bucket.category) ?? 0;
      if (taken >= cap) continue;
      perCategory.set(bucket.category, taken + 1);
      kept.push(bucket);
      candidates.push({
        category: bucket.category,
        kind: bucket.kind,
        value: bucket.value,
        count: bucket.count,
        properties: [...bucket.properties].sort(),
        routes: [...bucket.routes].sort(),
        examples: bucket.examples,
      });
    }

    // A cap that quietly drops the long tail would make a partial list look
    // complete, which is the one thing a frequency table must never do.
    for (const [category, taken] of perCategory) {
      const total = all.filter((bucket) => bucket.category === category).length;
      if (total > taken) {
        warnings.push(
          `${category}: ${String(total)} distinct values were seen; the ${String(taken)} ` +
            'most common are listed',
        );
      }
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      runId: this.options.runId,
      generatedAt,
      note: TOKENS_NOTE,
      pagesScanned: this.pagesScanned,
      elementsScanned: this.elementsScanned,
      elementsSkipped: this.elementsSkipped,
      candidates,
      nearDuplicates: this.options.config.nearDuplicates ? findNearDuplicates(kept) : [],
      warnings,
    };
  }
}

interface MutableCandidate {
  category: TokenCategory;
  kind: TokenValueKind;
  value: string;
  count: number;
  properties: Set<string>;
  routes: Set<string>;
  examples: string[];
  px?: number;
  rgba?: [number, number, number, number];
}

function byCountThenValue(a: MutableCandidate, b: MutableCandidate): number {
  return b.count - a.count || a.value.localeCompare(b.value);
}

/**
 * Values close enough that one of them may be a mistake.
 *
 * **Reported, never merged.** Two colours one channel apart are usually a
 * rounding error and occasionally deliberate, and deciding which is exactly the
 * judgement this pass refuses to make. Merging them would also destroy the
 * evidence: the counts that would tell a person which one is the real value.
 */
export function findNearDuplicates(candidates: MutableCandidate[]): TokenNearDuplicate[] {
  const out: TokenNearDuplicate[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      if (a === undefined || b === undefined) continue;
      if (a.category !== b.category || a.kind !== b.kind) continue;
      if (a.value === b.value) continue;

      if (a.kind === 'color' && a.rgba !== undefined && b.rgba !== undefined) {
        // Alpha differences are deliberate — a 50% overlay is not a mistyped
        // solid — so only compare colours at the same opacity.
        if (a.rgba[3] !== b.rgba[3]) continue;
        const distance = channelDistance(a.rgba, b.rgba);
        if (distance > 0 && distance <= 8) {
          out.push({
            category: a.category,
            kind: a.kind,
            a: a.value,
            b: b.value,
            reason:
              `these differ by ${String(distance)} across the colour channels, ` +
              'which is usually one value rounded two ways',
          });
        }
        continue;
      }

      if (a.kind === 'length' && a.px !== undefined && b.px !== undefined) {
        const gap = Math.abs(a.px - b.px);
        if (gap > 0 && gap <= 1) {
          out.push({
            category: a.category,
            kind: a.kind,
            a: a.value,
            b: b.value,
            reason: `these are ${String(Math.round(gap * 10) / 10)}px apart, which is usually a rounding difference rather than a decision`,
          });
        }
      }
    }
  }

  return out;
}

function channelDistance(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}
