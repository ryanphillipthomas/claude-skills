import type { LocatorCandidate, LocatorCandidateType } from '@ui-atlas/protocol';

export type CandidateDraft = Omit<LocatorCandidate, 'score'>;

/**
 * Preference order from the brief: accessible role+name, stable test
 * attributes, authored ids, labels/placeholder/alt/title/text, a selector
 * scoped to a stable ancestor, and a positional path only as a last resort.
 */
export const BASE_SCORES: Record<LocatorCandidateType, number> = {
  'test-id': 96,
  'role-name': 92,
  id: 88,
  label: 84,
  alt: 74,
  placeholder: 72,
  title: 66,
  text: 62,
  'css-scoped': 50,
  'css-path': 20,
};

/** Tie-break order when two candidates score the same. */
const TYPE_ORDER: LocatorCandidateType[] = [
  'role-name',
  'test-id',
  'id',
  'label',
  'placeholder',
  'alt',
  'title',
  'text',
  'css-scoped',
  'css-path',
];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Turn a draft into a scored candidate. Every adjustment appends a reason so a
 * user can see *why* a locator was preferred or rejected.
 */
export function scoreCandidate(draft: CandidateDraft): LocatorCandidate {
  const reasons = [...draft.reasons];
  let score = BASE_SCORES[draft.type];
  reasons.push(`base score ${score} for ${draft.type}`);

  if (draft.uniquenessCount === 0) {
    reasons.push('matched nothing when generated');
    return { ...draft, reasons, score: 0 };
  }

  if (draft.uniquenessCount > 1) {
    const penalised = score * 0.35;
    reasons.push(`ambiguous: matched ${draft.uniquenessCount} elements`);
    score = penalised;
  }

  if (draft.scope !== undefined && draft.scope.length > 0) {
    score += 4;
    reasons.push('scoped to a stable ancestor');
  }

  const value = draft.value;
  if (draft.type !== 'css-path' && draft.type !== 'css-scoped') {
    if (value.length > 80) {
      score -= 12;
      reasons.push('value is long and likely to change');
    }
    if (/\d{2,}/.test(value)) {
      score -= 6;
      reasons.push('value contains numbers that may change');
    }
  }

  if (draft.type === 'css-path') {
    const depth = value.split('>').length;
    if (depth > 3) {
      score -= (depth - 3) * 2;
      reasons.push(`positional path is ${depth} levels deep`);
    }
    if (value.includes(':nth-child')) {
      score -= 8;
      reasons.push('depends on sibling position');
    }
  }

  return { ...draft, reasons, score: clamp(score) };
}

/**
 * Score, then order best-first. Candidates that resolve to exactly one element
 * always outrank ambiguous ones, however good the ambiguous one's type is: a
 * locator that cannot pick out the element is not a locator. Ambiguous
 * candidates stay in the list so the resolver can still fall back to them (and
 * disambiguate by geometry) when the unique ones stop matching.
 */
export function rankCandidates(drafts: CandidateDraft[]): LocatorCandidate[] {
  return drafts
    .map(scoreCandidate)
    .sort((a, b) => {
      const aUnique = a.uniquenessCount === 1 ? 1 : 0;
      const bUnique = b.uniquenessCount === 1 ? 1 : 0;
      if (aUnique !== bUnique) return bUnique - aUnique;
      if (b.score !== a.score) return b.score - a.score;
      return TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
    });
}

/** The candidate a capture should try first; undefined when nothing is usable. */
export function chooseCandidate(candidates: LocatorCandidate[]): LocatorCandidate | undefined {
  return candidates.find((candidate) => candidate.score > 0) ?? candidates[0];
}
