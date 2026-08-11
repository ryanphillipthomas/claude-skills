# 1. Record architecture decisions

- Status: accepted
- Date: 2026-08-11

## Context

The implementation brief asks for consequential decisions to be written down
before they are made, so that a reader six months later can tell a considered
choice from an accident, and so that an interrupted session can be resumed.

## Decision

Every decision that would be expensive to reverse — a dependency, a data
format, a runtime boundary, a deliberate limitation — gets a short numbered
record in `docs/adr/`. Records state the context, the decision, and the
consequences (including what we gave up). They are append-only: a superseded
record is marked as superseded rather than edited away.

Reversible details (naming, file layout inside a package, formatting) are not
worth a record and are decided in code.

## Consequences

- The number of records stays small enough to read in one sitting.
- `PROGRESS.md` links to them rather than repeating their content.
