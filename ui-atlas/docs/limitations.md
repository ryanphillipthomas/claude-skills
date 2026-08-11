# Known limitations

Everything here is a deliberate boundary of the current release, not a bug
waiting to be filed. Where a limitation is visible in output, the record says so
in its `warnings` or its `error`.

## Not built yet (later phases)

| Area | Status |
| --- | --- |
| Responsive capture sets | **Built.** Each preset gets a fresh context, its own reload and its own re-resolution; absent, hidden and ambiguous elements are recorded per viewport. Two caveats: a persistent `profile` context cannot create sibling contexts, so replay there degrades to a resize with a warning on every mobile preset; and the toolbar's `viewport/set` control still only resizes the current page (it warns that a mobile preset is not real emulation) — use the responsive set for true emulation. |
| Static HTML report | **Built.** `ui-atlas report <run-dir>` writes `report/index.html`. It references screenshots by relative path, so the report travels with its run directory rather than as a lone file. |
| Bounded crawler | **Built.** URL canonicalisation, a same-origin frontier, hard budgets and a resumable queue. It follows `<a href>` and, on its own, clicks nothing. Details below. |
| Interaction recipes | **Built.** Declarative steps validated before execution, plus `--dry-run`. A recipe is the only thing that may touch a crawled page. Details below. |
| Interaction inventory | **Built.** `crawl --inventory` lists each page's interactive controls, classifies what each is likely to do, and writes a reviewable recipe skeleton. It reads and nothing else. Details below. |
| Scale | Worker concurrency, per-origin throttling, retry/backoff and trace-on-failure are the rest of phase 3. |
| Animation capture | The motion fixture exists; discovery and deterministic frame sampling are phase 4. The toolbar's Animation button is disabled. |
| CDP forced pseudo-states | Not implemented. `focus-visible` is reached with a real keyboard interaction or reported as `skipped` — never faked. |
| Chrome extension packaging | Not required and not built. |

## Boundaries of what is possible

- **Closed shadow DOM** is unsupported for element-level inspection. Nothing
  outside a closed root can traverse it. The probe flags a likely closed host
  (`closedShadowEncountered`) and the inspector says so instead of guessing. The
  host element itself can still be captured. Open shadow DOM is fully supported:
  Playwright's locator engines pierce it.
- **Cross-origin iframes** cannot be traversed by top-page JavaScript. The host
  inspects and captures them through Playwright frame locators instead, and the
  frame path records `crossOrigin: true`.
- **Canvas, WebGL and video** are captured as whatever the compositor produced
  at that instant. There is no promise of determinism for script-driven physics
  or remote media.
- **Positional CSS paths** are a last resort and are scored as such. Re-resolution
  warns when a fallback lands on an element with a different geometry, but it
  cannot tell apart a replacement that occupies exactly the same box. The trail
  of "candidate X matched no elements" warnings on the record is the signal.
- **Screenshot determinism** holds within one pinned Playwright/Chromium version
  on one platform. Fonts, GPU and platform rasterisation all move the pixels.
  The browser version is recorded in `run.json`.
- **Detaching a large fixed layer** (for example removing the inspector from the
  DOM) leaves a stale composited layer in Chromium for a short time. This is why
  the inspector is hidden with `display: none` before a capture rather than
  removed, and why the "no overlay in artifacts" test compares against a session
  where the overlay was never injected.

## Boundaries of the crawler

All of these are deliberate for the first crawl slice; see
[ADR 14](adr/0014-crawl-frontier-and-budgets.md).

- **Two URLs serving identical content stay two pages.** `/` and `/index.html`
  on our own fixture site canonicalise differently and are both crawled.
  Recognising them as one needs the optional page structural fingerprint;
  guessing without it would silently drop real pages.
- **Only `<a href>` is followed.** Links a site exposes some other way — a
  sitemap, `<link rel>`, a JavaScript router with no anchors, a `<form>` GET —
  are invisible to the crawler. Sitemap seeding is listed in the brief and is
  not built yet.
- **Anchors inside iframes are not followed.** A frame's links belong to the
  frame's origin, and following them from the parent's scope would quietly widen
  the crawl.
- **Deny rules match on the path only.** `/logout` is refused;
  `/account?action=logout` is not, because the rule set does not look at query
  parameters. Add a query-bearing pattern to `exclude` if a site works that way.
- **Downloads are detected by file extension.** An extensionless URL that
  responds with `Content-Disposition: attachment` will be navigated to. Chromium
  will not render it and the page record carries whatever the navigation
  produced.
- **One worker, one page at a time.** Concurrency and per-origin throttling are
  the next part of phase 3, so `perPageDelayMs` is currently the only politeness
  control.
- **`maxRunMinutes` is checked between pages** and also clamps each page's own
  budget, so navigation, settle, the title read and link discovery are all
  bounded by whatever is left of the run. A crawl can still overshoot slightly:
  a step that hits its budget is abandoned rather than cancelled, because
  Playwright's `evaluate` and `title` take no timeout argument.
- **Retry and status-aware backoff are not built.** A navigation failure is
  recorded on the page record and the crawl moves on; a 429 or 503 is recorded
  as an ordinary status and not retried.

## Boundaries of recipes

See [ADR 15](adr/0015-recipes-are-the-only-way-to-interact.md).

- **No step types text.** `fill`, `type` and `evaluate` are rejected by
  validation, on purpose. Sign in by hand with `ui-atlas auth save`, then crawl
  with `--mode storage-state --profile <name>`. Automating credential entry is
  how tools get a session flagged, and it is the one place where being wrong
  costs an account rather than a screenshot.
- **A crawl cannot tell you the session expired.** If saved storage state has
  gone stale, the crawl will happily record fifty copies of a sign-in page. Run
  a small `--max-pages 2` crawl first and look at the page titles.
- **Recipes see the top document only.** There is no way to name an element
  inside an iframe from a recipe; the target vocabulary has no frame selector.
- **`captureResponsive` is accepted but inert during a crawl.** The crawl does
  not build a responsive runner yet, so the step records a warning saying it was
  unavailable rather than failing the recipe.
- **`--dry-run` cannot tell you a recipe will match a real page.** It knows the
  configuration, not the site. It catches a recipe that can *never* run, not one
  that merely happens not to.
- **A recipe that navigates leaves the page it was capturing.** Later steps
  capture the new page. The outcome carries a warning naming both URLs, but
  nothing stops it.

## Boundaries of the interaction inventory

See [ADR 16](adr/0016-interaction-inventory-suggests-never-acts.md).

- **It only sees what is visible without interacting.** A menu whose items are
  `display: none` until hover hides them: the trigger is inventoried, its items
  are not. That is the direct cost of never touching anything. On the fixture
  site, `states.html`'s hover menu links never appear in the inventory, and a
  test asserts exactly that.
- **Classification is a heuristic over words and markup**, so it will be wrong
  about some site's vocabulary. Every candidate carries the reason its rule
  fired, and `crawl.inventory.mutationWords` extends the word list rather than
  replacing it.
- **It is biased towards false positives.** "Save", "Cancel" and "Apply" are all
  treated as mutations. A wrongly flagged control costs a human ten seconds of
  review; a missed "Delete account" costs them an account.
- **`unknown` is not a milder `mutation`.** It means nothing in the markup said
  either way, and it is treated identically by the recipe skeleton.
- **Top document only.** Controls inside iframes are not inventoried, for the
  same reason recipes cannot name them.
- **It costs one page evaluation per page**, which is why it is off by default.

## Things the tool reports that surprise people

- **`focus` and `focus-visible` can produce identical images.** Chromium decides
  whether to paint a focus ring from its "last interaction was keyboard"
  heuristic, and on a page nothing has been pointer-clicked yet a programmatic
  `focus()` can satisfy it too. Both captures are labelled honestly — each says
  how it was verified — and the report's Duplicates tab is what makes the
  sameness visible. It is a fact about the browser, not a fault in the capture.
- **A state with no computed-style delta gets a warning.** If hovering changed
  nothing in the watched properties, the record says so rather than implying a
  hover style exists.

## Environment notes

- **External-site smoke tests** (`tests/integration/external-smoke.test.ts`) are
  read-only and skip themselves when the browser has no outbound network access.
  They were **skipped** in the sandbox this was built in, so the part of the
  phase 1 exit criterion that names three unrelated public sites is verified by
  code and by the fixture site, but has not been executed against live sites
  here. Run `npm run test:integration` on a networked machine to close that gap.
- `attach` mode is experimental: the attached browser's extensions, flags and
  profile all affect rendering. It warns on every use.
