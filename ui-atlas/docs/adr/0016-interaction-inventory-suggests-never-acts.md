# 16. The interaction inventory suggests; it never acts

- Status: accepted
- Date: 2026-08-11

## Context

[ADR 15](0015-recipes-are-the-only-way-to-interact.md) made recipes the only
way anything on a crawled page is touched. That is safe, and it leaves the user
with a blank page: to write a recipe you have to already know what is on the
site and what it is called.

The brief asks for the missing half, and is unusually specific about its shape:

> Automatic button traversal should initially be suggestion-only: inventory
> visible interactive elements, classify likely navigation versus mutation, and
> surface safe-looking candidates to the user. Only auto-click anchors and
> recipe-approved controls. This prevents accidental purchases, submissions,
> deletes, messages, or account changes.

## Decision

### It reads, and that is all

`collectInteractions` queries, measures and describes. It does not click, hover,
focus, scroll, dispatch an event or set a single attribute. The output is
`interactions.jsonl`, a list of observations.

The test that guards this inventories `destructive.html` — a page whose every
control records its own activation — and requires the audit log to be empty
afterwards and no non-`GET` request to have been issued.

### It reuses the inspector's description of an element

Each control is described by `window.__uiAtlasProbe`, the same probe the
inspector and `capture --select` use. Role, accessible name, visible text,
geometry and scored locator candidates therefore mean exactly the same thing in
the inventory as they do on a `CaptureRecord`.

The alternative — a second, simpler accessible-name implementation inlined into
the page script — would have drifted from the real one within a release, and the
inventory would have started naming controls something the rest of the tool did
not recognise.

### Four classes, and the fourth is not "probably fine"

`navigation`, `inert`, `mutation`, `unknown`. `unknown` exists because "a
`<button type="button">` with the label *Go*" is genuinely unclassifiable, and
the honest answer is to say so. Its recorded reason says to treat it as unsafe
until reviewed, and the recipe skeleton treats it exactly like `mutation`.

Mutation rules run first and win, including over signals that would otherwise
say `inert`: a disclosure labelled "Delete options" is a delete as far as we
know. The word list is biased towards false positives on purpose. A wrongly
flagged "Save" costs a human ten seconds of review; a missed "Delete account"
costs them an account.

`disabled` is recorded but never used to reclassify. What a control *does* has
not changed just because it cannot be pressed today.

### The generated skeleton cannot click

`suggested-recipes.yml` is the point of the whole slice: something to edit
rather than a blank page. Two rules make generating it safe:

1. Only `navigation` and `inert` candidates become steps. `mutation` and
   `unknown` appear in comments, so the reader knows they exist, and never as
   something the file would execute.
2. The generated steps are only ever `select` and `captureStates`, which do not
   click. Controls that look safe to click are *named in a comment* so a person
   decides and types it themselves.

A generated file that clicked things would be precisely the automatic traversal
the brief rules out — the fact that a machine wrote the recipe would not make
the click any more approved.

## Consequences

- **The inventory only sees what is visible without interacting.** A menu that
  only exists on hover hides its contents; the trigger is inventoried, its items
  are not. That is the direct cost of never touching anything, and it is
  recorded in `docs/limitations.md` rather than worked around.
- Classification is a heuristic over words and markup. It will be wrong about
  some site's vocabulary, which is why every candidate carries the reason the
  rule fired and why `inventory.mutationWords` extends the list rather than
  replacing it.
- The inventory needs the probe injected, so it joins recipes as a reason to
  inject it. A crawl with neither still injects nothing.
- It runs before recipes on each page, so it describes the page as served rather
  than whatever a recipe left behind.
- It costs one extra page evaluation per page, which is why it is off by default
  and opt-in with `--inventory`.
