# 8. A unique locator beats a better-typed ambiguous one

- Status: accepted
- Date: 2026-08-11

## Context

Candidates are scored by type (accessible role+name, test attribute, authored
id, label/placeholder/alt/title/text, scoped CSS, positional path). Ambiguity is
penalised by a multiplier. On three identical "Duplicate" buttons that produced
an ambiguous `role=button[name="Duplicate"]` at score 32 outranking the
positional path at 16 — so the *chosen* locator matched three elements while a
locator that picks out exactly one sat below it.

## Decision

`rankCandidates` sorts by uniqueness first, then by score, then by type
preference. A candidate that resolved to exactly one element always outranks an
ambiguous one, however good its type.

Ambiguous candidates stay in the list with their scores and reasons: the
resolver still falls back to them, and with an expected bounding box it can pick
the right match by position.

## Consequences

- On pages with no stable identity the chosen locator is often a positional
  path, which is fragile — the score and the reason string say so, and the
  report can surface it.
- Re-resolution warns when a fallback candidate lands on an element with a
  different geometry than the one that was selected. It cannot detect a
  replacement that occupies the same box; the trail of "candidate X matched no
  elements" warnings is the signal there.
