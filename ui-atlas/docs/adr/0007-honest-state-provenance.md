# 7. States are verified, and a synthesised state is labelled as one

- Status: accepted
- Date: 2026-08-11

## Context

"Label captured states as `observed`, `interacted`, or `forced`. Never present a
synthetic forced state as one observed naturally on the site." A screenshot that
claims to show a hover style, but does not, is worse than no screenshot.

## Decision

Every state goes through a controller with setup, verification, capture, and
cleanup in a `finally` block.

- **hover** — a real Playwright hover; the before/after computed-style delta is
  recorded, and a state that produced no delta gets a warning on the record.
- **focus** — `focus()`, then verify `activeElement` *through the element's own
  root* so shadow DOM is handled correctly.
- **focus-visible** — Chromium only paints a focus ring when its keyboard
  modality flag is set, so: press a harmless modifier, focus, then check the
  element actually matches `:focus-visible`. If not, walk Tab stops (bounded by
  `capture.keyboardFocusMaxTabs`) and check again. If that also fails the capture
  is recorded as `skipped`, never as a focus ring we did not see. CDP
  pseudo-state forcing is a later phase and will be labelled `forced`.
- **active** — mouse down, capture while held, and in `finally` **move the
  pointer off the element before releasing**. A mousedown and mouseup on
  different targets never becomes a click, so photographing the pressed state of
  a checkbox, a link or a submit button cannot activate it. (Releasing in place
  toggled a fixture checkbox; the test that caught it is still there.)
- **checked / selected / expanded / disabled** — captured as `observed` when the
  page is already in that state. Otherwise, and only when
  `capture.allowForcedStates` is on, the state is synthesised by touching one
  attribute or property, labelled `forced`, described as "not observed on the
  site", and undone in `finally`. With forcing off the capture is `skipped`.

## Consequences

- `focus-visible` may be unavailable on sites whose focus styling we cannot
  reach by keyboard. That is reported, not papered over.
- Forced states mutate the live page briefly. The mutation is a single
  attribute/property, recorded in the record's `interactionRecipe`, and reverted.
- Cleanup is idempotent and runs even when the capture threw.
