import { describe, expect, it } from 'vitest';
import {
  BASE_SCORES,
  chooseCandidate,
  cssEscapeIdent,
  cssQuoteAttrValue,
  geometryBucket,
  hashFingerprint,
  inspectId,
  looksGenerated,
  looksHashedClass,
  normalizeNameClass,
  rankCandidates,
  type CandidateDraft,
} from '@ui-atlas/identity';
import type { FingerprintInput } from '@ui-atlas/protocol';

describe('generated id detection', () => {
  it('accepts authored ids', () => {
    for (const id of ['publish-button', 'account_email', 'mainNavigation', 'step-2-summary']) {
      expect(looksGenerated(id)).toBe(false);
    }
  });

  it('rejects framework and random ids', () => {
    for (const id of [
      ':r7a:',
      'mui-1234',
      'ember42',
      'radix-:r1:',
      'headlessui-menu-button-3',
      '550e8400-e29b-41d4-a716-446655440000',
      'c4f9a1e77b0d42',
      '12345',
      'aB3xQ9zK',
      '',
    ]) {
      expect(looksGenerated(id), id).toBe(true);
    }
  });

  it('explains itself', () => {
    expect(inspectId('12345').reason).toMatch(/generated pattern|digits/);
    expect(inspectId('publish-button').reason).toBe('looks authored');
  });
});

describe('hashed class detection', () => {
  it('rejects build-hash classes and keeps authored ones', () => {
    expect(looksHashedClass('css-1x2y3z')).toBe(true);
    expect(looksHashedClass('sc_a1b2c3')).toBe(true);
    expect(looksHashedClass('x1y2z3')).toBe(true);
    expect(looksHashedClass('btn')).toBe(false);
    expect(looksHashedClass('btn--primary')).toBe(false);
    expect(looksHashedClass('card-header')).toBe(false);
  });
});

describe('geometryBucket', () => {
  it('groups similar sizes and separates different ones', () => {
    expect(geometryBucket(140, 40)).toBe(geometryBucket(150, 44));
    expect(geometryBucket(32, 32)).not.toBe(geometryBucket(320, 200));
  });
});

describe('normalizeNameClass', () => {
  it('masks digits so per-row names collapse together', () => {
    expect(normalizeNameClass('Order #10231')).toBe(normalizeNameClass('Order #99887'));
    expect(normalizeNameClass('Save')).toBe('save');
    expect(normalizeNameClass(undefined)).toBe('');
  });
});

describe('css escaping', () => {
  it('escapes identifiers safely', () => {
    expect(cssEscapeIdent('simple-id')).toBe('simple-id');
    expect(cssEscapeIdent('has space')).toBe('has\\ space');
    expect(cssEscapeIdent('1leading')).toBe('\\31 leading');
    expect(cssEscapeIdent(':r7a:')).toBe('\\:r7a\\:');
  });

  it('quotes attribute values', () => {
    expect(cssQuoteAttrValue('plain')).toBe('"plain"');
    expect(cssQuoteAttrValue('say "hi"')).toBe('"say \\"hi\\""');
  });
});

function draft(overrides: Partial<CandidateDraft>): CandidateDraft {
  return {
    type: 'role-name',
    value: 'Save',
    uniquenessCount: 1,
    reasons: [],
    ...overrides,
  } as CandidateDraft;
}

describe('candidate scoring', () => {
  it('prefers test ids and roles over positional paths', () => {
    const ranked = rankCandidates([
      draft({ type: 'css-path', value: 'html > body > div > button' }),
      draft({ type: 'role-name', role: 'button', value: 'Save' }),
      draft({ type: 'test-id', value: 'save-button', attribute: 'data-testid' }),
    ]);
    expect(ranked[0]?.type).toBe('test-id');
    expect(ranked[1]?.type).toBe('role-name');
    expect(ranked[2]?.type).toBe('css-path');
  });

  it('zeroes a candidate that matched nothing', () => {
    const [candidate] = rankCandidates([draft({ uniquenessCount: 0 })]);
    expect(candidate?.score).toBe(0);
    expect(candidate?.reasons).toContain('matched nothing when generated');
  });

  it('heavily penalises ambiguity and says so', () => {
    const [ambiguous] = rankCandidates([draft({ uniquenessCount: 3 })]);
    expect(ambiguous?.score).toBeLessThan(BASE_SCORES['role-name'] / 2);
    expect(ambiguous?.reasons.some((reason) => reason.includes('matched 3 elements'))).toBe(true);
  });

  it('penalises deep positional paths that depend on sibling order', () => {
    const [shallow] = rankCandidates([draft({ type: 'css-path', value: 'main > button' })]);
    const [deep] = rankCandidates([
      draft({ type: 'css-path', value: 'html > body > div > div > div > span:nth-child(3)' }),
    ]);
    expect(deep?.score).toBeLessThan(shallow?.score ?? 0);
  });

  it('chooses the first usable candidate', () => {
    const ranked = rankCandidates([
      draft({ type: 'test-id', value: 'gone', uniquenessCount: 0 }),
      draft({ type: 'role-name', role: 'button', value: 'Save' }),
    ]);
    expect(chooseCandidate(ranked)?.type).toBe('role-name');
  });
});

describe('structural fingerprint', () => {
  const base: FingerprintInput = {
    tagName: 'button',
    role: 'button',
    nameClass: 'save',
    stableAttributes: { 'data-testid': 'save-button' },
    ancestorRoles: ['main', 'form'],
    geometryBucket: 'w<=256|h<=64',
  };

  it('is stable regardless of key order', () => {
    const reordered: FingerprintInput = {
      geometryBucket: base.geometryBucket,
      ancestorRoles: base.ancestorRoles,
      stableAttributes: base.stableAttributes,
      nameClass: base.nameClass,
      role: base.role,
      tagName: base.tagName,
    };
    expect(hashFingerprint(reordered)).toBe(hashFingerprint(base));
  });

  it('changes when a meaningful fact changes', () => {
    expect(hashFingerprint({ ...base, role: 'link' })).not.toBe(hashFingerprint(base));
    expect(hashFingerprint({ ...base, geometryBucket: 'w<=1024|h<=64' })).not.toBe(hashFingerprint(base));
  });

  it('is not affected by the digits inside a name', () => {
    const a = { ...base, nameClass: normalizeNameClass('Order 12') };
    const b = { ...base, nameClass: normalizeNameClass('Order 4471') };
    expect(hashFingerprint(a)).toBe(hashFingerprint(b));
  });
});
