# 9. Undo the DOM changes screenshotting itself causes

- Status: accepted
- Date: 2026-08-11

## Context

Taking any screenshot through Playwright/Chromium materialises an empty
`style=""` attribute on some form controls (checkboxes and radios in the
fixture). It happens with plain `page.screenshot()` — no `animations` or `caret`
option required — so it is not something we can opt out of.

It changes nothing visually, but the inspector promises to leave the page as it
found it, and a test that compares the DOM before and after a capture correctly
flagged it.

## Decision

Around every screenshot, in every frame:

1. Before: record which elements already carry a `style` attribute (a `WeakSet`
   on the page).
2. After, in a `finally`: remove `style` attributes that are **empty** and were
   **not** present before.

An element with `style=""` has no inline declarations, so removing the attribute
cannot change rendering, and we only remove ones we introduced.

## Consequences

- Two extra `evaluate` calls per capture, each a `querySelectorAll('[style]')`.
- A page whose CSS uses `[style]` as a selector sees the same DOM it started
  with, which is the correct outcome.
- Chromium may find other ways to touch the DOM during rasterisation; the
  before/after DOM assertion in `tests/integration/inspector.test.ts` is what
  will catch the next one.
