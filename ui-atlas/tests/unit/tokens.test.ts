import { describe, expect, it } from 'vitest';
import {
  categoryOf,
  normaliseFontStack,
  normaliseValue,
  parseColour,
  parseRgb,
  TOKEN_PROPERTIES,
  TokenScanner,
  TOKENS_NOTE,
  type StyleUsage,
} from '@ui-atlas/tokens';
import { TokensConfigSchema } from '@ui-atlas/config';

const config = (overrides: Record<string, unknown> = {}) =>
  TokensConfigSchema.parse({ enabled: true, ...overrides });

function usage(
  entries: Array<{ property: string; value: string; count?: number; examples?: string[] }>,
  extra: Partial<StyleUsage> = {},
): StyleUsage {
  return {
    entries: entries.map((entry) => ({
      property: entry.property,
      value: entry.value,
      count: entry.count ?? 1,
      examples: entry.examples ?? ['div'],
    })),
    elementsScanned: 10,
    elementsSkipped: 0,
    ...extra,
  };
}

function scan(
  pages: Array<{ route: string; usage: StyleUsage }>,
  overrides: Record<string, unknown> = {},
) {
  const scanner = new TokenScanner({ runId: 'run-1', config: config(overrides) });
  for (const page of pages) scanner.add(page.usage, page.route);
  return scanner.summarise('2026-08-11T00:00:00.000Z');
}

describe('normalising a computed value', () => {
  it('brings every spelling of an opaque colour to one hex', () => {
    expect(normaliseValue('color', 'rgb(37, 99, 235)')?.value).toBe('#2563eb');
    expect(normaliseValue('color', 'rgb(37 99 235)')?.value).toBe('#2563eb');
    expect(normaliseValue('color', 'rgba(37, 99, 235, 1)')?.value).toBe('#2563eb');
  });

  it('keeps a translucent colour translucent', () => {
    // Flattening alpha would merge a 50% overlay into the solid colour it is
    // drawn from, which are two different design decisions.
    expect(normaliseValue('color', 'rgba(37, 99, 235, 0.5)')?.value).toBe('rgba(37, 99, 235, 0.5)');
    expect(normaliseValue('color', 'rgba(37, 99, 235, 0.5)')?.value).not.toBe('#2563eb');
  });

  it('drops a fully transparent colour, which nobody chose', () => {
    expect(normaliseValue('background-color', 'rgba(0, 0, 0, 0)')).toBeUndefined();
  });

  it('reads a percentage alpha and percentage channels', () => {
    expect(parseRgb('rgb(100% 0% 0% / 50%)')).toEqual([255, 0, 0, 0.5]);
  });

  it('understands hex, so case and shorthand are not three separate values', () => {
    // Chromium always answers in `rgb()`, so hex only arrives from elsewhere.
    // Handling it anyway keeps `#2563EB`, `#2563eb` and `rgb(37, 99, 235)` one
    // value rather than three.
    expect(parseColour('#2563EB')).toEqual([37, 99, 235, 1]);
    expect(parseColour('#abc')).toEqual([170, 187, 204, 1]);
    expect(parseColour('#00000080')?.[3]).toBeCloseTo(0.502, 2);
    expect(normaliseValue('color', '#2563EB')?.value).toBe('#2563eb');
    expect(parseColour('not a colour')).toBeUndefined();
  });

  it('passes a colour it cannot parse through rather than guessing', () => {
    const parsed = normaliseValue('color', 'color(display-p3 0.2 0.4 0.9)');
    expect(parsed?.kind).toBe('color');
    expect(parsed?.value).toBe('color(display-p3 0.2 0.4 0.9)');
    expect(parsed?.rgba).toBeUndefined();
  });

  it('rounds sub-pixel lengths without collapsing real half-pixels', () => {
    // `12.0001px` comes from a percentage width; `12.5px` is a decision.
    expect(normaliseValue('padding-top', '12.0001px')?.value).toBe('12px');
    expect(normaliseValue('padding-top', '12.5px')?.value).toBe('12.5px');
    expect(normaliseValue('padding-top', '12px')?.px).toBe(12);
  });

  it('normalises a font stack to one comparable string', () => {
    expect(normaliseFontStack('"Inter",  system-ui , sans-serif')).toBe('Inter, system-ui, sans-serif');
    expect(normaliseValue('font-family', "'Inter', sans-serif")?.value).toBe('Inter, sans-serif');
  });

  it('treats a font weight as a number so weights sort', () => {
    const parsed = normaliseValue('font-weight', '600');
    expect(parsed?.kind).toBe('number');
    expect(parsed?.value).toBe('600');
  });

  it('maps every collected property to a category', () => {
    for (const entry of TOKEN_PROPERTIES) {
      expect(categoryOf(entry.property)).toBe(entry.category);
    }
    expect(categoryOf('z-index')).toBeUndefined();
  });

  it('keeps text and background colours in separate categories', () => {
    // "What colour is the text" and "what is behind it" are different
    // questions; one bucket holding both would answer neither.
    expect(categoryOf('color')).toBe('color');
    expect(categoryOf('background-color')).toBe('background');
  });
});

describe('counting what a site is made of', () => {
  it('adds up one value seen across several pages and properties', () => {
    const report = scan([
      { route: 'home', usage: usage([{ property: 'color', value: 'rgb(37, 99, 235)', count: 4 }]) },
      {
        route: 'about',
        usage: usage([
          { property: 'color', value: '#2563EB', count: 2 },
          { property: 'text-decoration-color', value: 'rgb(37, 99, 235)', count: 1 },
        ]),
      },
    ]);

    const blue = report.candidates.find((candidate) => candidate.value === '#2563eb');
    expect(blue?.count).toBe(7);
    expect(blue?.routes).toEqual(['about', 'home']);
    expect(blue?.properties).toEqual(['color', 'text-decoration-color']);
    expect(report.pagesScanned).toBe(2);
  });

  it('does not merge a border colour with a border width', () => {
    // Both are `border`, and neither is a value of the other.
    const report = scan([
      {
        route: 'home',
        usage: usage([
          { property: 'border-top-color', value: 'rgb(0, 0, 0)' },
          { property: 'border-top-width', value: '1px' },
        ]),
      },
    ]);
    expect(report.candidates).toHaveLength(2);
    expect(new Set(report.candidates.map((candidate) => candidate.kind))).toEqual(
      new Set(['color', 'length']),
    );
  });

  it('orders by how often a value was seen', () => {
    const report = scan([
      {
        route: 'home',
        usage: usage([
          { property: 'font-size', value: '14px', count: 3 },
          { property: 'font-size', value: '16px', count: 90 },
        ]),
      },
    ]);
    expect(report.candidates.map((candidate) => candidate.value)).toEqual(['16px', '14px']);
  });

  it('names itself as observations rather than a design system', () => {
    const report = scan([{ route: 'home', usage: usage([{ property: 'color', value: '#111111' }]) }]);
    expect(report.note).toBe(TOKENS_NOTE);
    expect(report.note).toContain('not a design system');
    // Nothing carries a name, because naming is the judgement this refuses.
    expect(Object.keys(report.candidates[0] ?? {})).not.toContain('name');
  });

  it('says when a per-page cap left elements unread', () => {
    const report = scan([
      { route: 'home', usage: usage([{ property: 'color', value: '#111111' }], { elementsSkipped: 42 }) },
    ]);
    expect(report.elementsSkipped).toBe(42);
    expect(report.warnings.join(' ')).toContain('42 element(s)');
  });

  it('says when it truncated the long tail rather than looking complete', () => {
    const report = scan(
      [
        {
          route: 'home',
          usage: usage([
            { property: 'font-size', value: '10px', count: 5 },
            { property: 'font-size', value: '20px', count: 4 },
            { property: 'font-size', value: '30px', count: 3 },
          ]),
        },
      ],
      { maxCandidatesPerCategory: 2 },
    );
    expect(report.candidates).toHaveLength(2);
    expect(report.warnings.join(' ')).toContain('3 distinct values were seen');
  });

  it('reports two almost-identical colours without merging them', () => {
    const report = scan([
      {
        route: 'home',
        usage: usage([
          { property: 'color', value: 'rgb(37, 99, 235)', count: 30 },
          { property: 'color', value: 'rgb(37, 99, 236)', count: 1 },
        ]),
      },
    ]);
    // Both survive: the counts are the evidence a person needs to decide which
    // is real, and merging would destroy exactly that.
    expect(report.candidates).toHaveLength(2);
    expect(report.nearDuplicates).toHaveLength(1);
    expect(report.nearDuplicates[0]?.reason).toContain('rounded two ways');
  });

  it('does not call two clearly different colours near duplicates', () => {
    const report = scan([
      {
        route: 'home',
        usage: usage([
          { property: 'color', value: 'rgb(37, 99, 235)' },
          { property: 'color', value: 'rgb(220, 38, 38)' },
        ]),
      },
    ]);
    expect(report.nearDuplicates).toEqual([]);
  });

  it('leaves colours at different opacities alone', () => {
    // A 50% overlay is not a mistyped solid, however close the channels are.
    const report = scan([
      {
        route: 'home',
        usage: usage([
          { property: 'color', value: 'rgba(37, 99, 235, 0.5)' },
          { property: 'color', value: 'rgb(37, 99, 235)' },
        ]),
      },
    ]);
    expect(report.nearDuplicates).toEqual([]);
  });

  it('reports lengths a rounding error apart', () => {
    const report = scan([
      {
        route: 'home',
        usage: usage([
          { property: 'padding-top', value: '16px', count: 20 },
          { property: 'padding-top', value: '15.5px', count: 1 },
        ]),
      },
    ]);
    expect(report.nearDuplicates).toHaveLength(1);
    expect(report.nearDuplicates[0]?.reason).toContain('0.5px apart');
  });

  it('can be told not to guess at near duplicates at all', () => {
    const report = scan(
      [
        {
          route: 'home',
          usage: usage([
            { property: 'color', value: 'rgb(37, 99, 235)' },
            { property: 'color', value: 'rgb(37, 99, 236)' },
          ]),
        },
      ],
      { nearDuplicates: false },
    );
    expect(report.nearDuplicates).toEqual([]);
    expect(report.candidates).toHaveLength(2);
  });

  it('keeps a bounded number of examples per value', () => {
    const report = scan(
      [
        {
          route: 'home',
          usage: usage([
            { property: 'color', value: '#111111', examples: ['h1', 'h2', 'h3', 'p', 'li', 'td'] },
          ]),
        },
      ],
      { maxExamplesPerValue: 3 },
    );
    expect(report.candidates[0]?.examples).toEqual(['h1', 'h2', 'h3']);
  });

  it('has nothing to say about a page with no decided values', () => {
    const report = scan([{ route: 'home', usage: usage([]) }]);
    expect(report.candidates).toEqual([]);
    expect(report.nearDuplicates).toEqual([]);
    expect(report.pagesScanned).toBe(1);
  });
});
