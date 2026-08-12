import type { AnimationRecord } from '@ui-atlas/protocol';

/**
 * An animation's identity for the single question "is this one new?".
 *
 * Not the index: provoking a transition inserts it into `getAnimations()` in
 * composite order, which shifts everything after it, so the same animation can
 * have a different index either side of a hover. Not `animationId` either —
 * that falls back to a position-derived label whenever the page did not set
 * `Animation.id`, which is almost always.
 *
 * What is left is what the animation *is*: which document, which kind, which
 * keyframe rule or transitioned property, and which element it runs on.
 */
export function fingerprintAnimation(record: AnimationRecord): string {
  const name = record.animationName ?? record.transitionProperty ?? '';
  const where = record.target?.selectorHint ?? '(no target)';
  return [record.url, record.kind, name, where, record.pseudoElement ?? ''].join('|');
}

/**
 * The animations present in `after` that were not already present in `before`.
 *
 * A **multiset** difference, not a set difference. Two indistinguishable
 * elements running the same animation is ordinary — a row of cards, a list of
 * icons — and collapsing them to one identity would silently drop half of what
 * an interaction started.
 *
 * An animation that disappeared in between simply leaves an unmatched entry in
 * `before`, which is correct: this answers what *appeared*, and nothing else.
 */
export function newAnimations(
  before: AnimationRecord[],
  after: AnimationRecord[],
): AnimationRecord[] {
  const unmatched = new Map<string, number>();
  for (const record of before) {
    const key = fingerprintAnimation(record);
    unmatched.set(key, (unmatched.get(key) ?? 0) + 1);
  }

  const appeared: AnimationRecord[] = [];
  for (const record of after) {
    const key = fingerprintAnimation(record);
    const remaining = unmatched.get(key) ?? 0;
    if (remaining > 0) unmatched.set(key, remaining - 1);
    else appeared.push(record);
  }
  return appeared;
}

/**
 * Group animations by the document they live in.
 *
 * Every member of one group shares a clock, which is what makes seeking them
 * to a common time meaningful. Animations in different documents do not, so
 * they are never mixed into one frame.
 */
export function groupByFrame(records: AnimationRecord[]): Array<{
  url: string;
  members: AnimationRecord[];
}> {
  const byUrl = new Map<string, AnimationRecord[]>();
  for (const record of records) {
    byUrl.set(record.url, [...(byUrl.get(record.url) ?? []), record]);
  }
  return [...byUrl].map(([url, members]) => ({ url, members }));
}
