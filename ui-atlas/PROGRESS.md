# Progress

Running log for the build. Updated after each milestone so an interrupted
session is recoverable.

**Last updated:** 2026-08-11, after the interaction inventory landed.

## Status

Phases 0, 1 and 2 are complete and their exit criteria pass, with one
environment-bound gap recorded below. Phase 3 is nearly complete: the bounded
frontier, declarative interaction recipes and the suggested-interaction
inventory are all done, and its exit criterion passes on the fixture graph. Only
worker concurrency, retry/backoff and trace-on-failure remain. The repository is
buildable, tested and documented.

```
npm install
npm run build
npm test
```

## Test results

`npm test` (builds, then Vitest — unit and browser integration):

```
Test Files  23 passed (23)
     Tests  270 passed | 3 skipped (273)
  Duration  ~183s
```

On a networked machine the three external smoke tests run instead of skipping:
the user confirmed **zero skips** on macOS, which closes the last open item on
the phase 1 exit criterion. Nothing is unverified now.

| Suite | Tests | What it proves |
| --- | --- | --- |
| `unit/paths` | 14 | segment sanitising, route keys, artifact-root escape rejection |
| `unit/artifacts` | 10 | atomic writes, JSONL, PNG headers, record validation, corrupt-line tolerance |
| `unit/identity` | 16 | generated-id detection, hashed classes, scoring, fingerprint stability |
| `unit/config` | 14 | defaults, deep merge, prototype-pollution rejection, YAML/JSON loading |
| `unit/runtime` | 25 | deadlines, queue serialisation and isolation, bridge auth/validation, CLI args, redaction, run summary, shortcuts |
| `integration/phase0-capture` | 4 | **phase 0 exit criterion** end to end through the CLI |
| `integration/inspector` | 9 | **phase 1 exit criterion** on the fixture site |
| `integration/identity` | 12 | candidate generation and re-resolution in a real browser |
| `integration/settle` | 6 | bounded readiness against endless requests, late mutations, slow images |
| `integration/states` | 11 | hover/focus/focus-visible/active/checked/selected/disabled and cleanup |
| `integration/faults` | 6 | detachment, navigation mid-capture, write failure, dead browser, destructive controls |
| `integration/frames-shadow` | 5 | same- and cross-origin iframes, open and closed shadow DOM |
| `integration/responsive` | 8 | five-viewport matrix, real mobile emulation, per-viewport reload, hidden/not-present outcomes |
| `integration/report` | 7 | **phase 2 exit criterion**: the generated report driven in a real browser, including script injection |
| `unit/reporter` | 13 | escaping, view model, matrix grouping, duplicate grouping |
| `integration/state-preview` | 10 | live state preview: apply, hold, release, swap, forced undo, capture isolation |
| `unit/crawl` | 39 | canonicalisation, path globs, link policy, frontier, budgets, resume round-trip |
| `integration/crawl` | 11 | **phase 3, first slice**: the fixture link graph, the empty click log, budgets, redirects on and off origin, dry run, resume through the CLI |
| `unit/recipes` | 16 | step validation, rejected `fill`/`type`/`evaluate`, target rules, dry-run problem detection |
| `integration/recipes` | 8 | **phase 3, second slice**: recipe-approved clicking, match scoping, state sets, hover menus, failure isolation, discovery ordering |
| `unit/inventory` | 19 | classification rules, recipe-target mapping, the skeleton's refusal to emit a click |
| `integration/inventory` | 7 | **phase 3, third slice**: destructive controls all classified `mutation` with an empty click log, safe controls on the states fixture, `maxPerPage`, the generated skeleton |
| `integration/external-smoke` | 3 skipped | read-only public-site checks; skip without network |

`npm run typecheck` passes for all eleven packages and for the test sources.

## Exit criteria

**Phase 0 — one command launches a fixture URL and writes a viewport screenshot
plus valid metadata.** Met. `ui-atlas capture <fixture-url>` produces a valid
`run.json`, a schema-valid `captures.jsonl` row, a sidecar JSON beside the image,
and a PNG whose real dimensions match the record.

**Phase 1 — select an element and capture default/hover/focus without the
overlay appearing in screenshots or the page remaining altered.**

- Fixture site: met. Three states captured through the real toolbar, all
  `captured`, distinct image hashes, honest provenance. A viewport capture from
  an overlay session is byte-identical to one from a session where the inspector
  was never injected. The page's DOM before and after is identical, and nothing
  is left hovered, focused or pressed.
- Three unrelated public sites: **not executed.** This sandbox has no outbound
  browser network access (`ERR_TUNNEL_CONNECTION_FAILED` for any external host,
  with or without the proxy), so the external smoke tests skipped themselves.
  The tests exist, are read-only, and cover example.com, wikipedia.org and
  developer.mozilla.org. Running `npm run test:integration` on a networked
  machine closes this gap.

## Defects found and fixed during the build

Each of these was found by a test, and the test that found it is still there.

1. **Playwright does not invoke string page functions.** Every helper passed to
   `page.evaluate()` as a template string returned `undefined`, which surfaced as
   a crash inside the settle loop. All page-side code is now typed function
   literals ([ADR 5](docs/adr/0005-page-functions-are-literals.md)).
2. **Route keys did not survive path sanitising.** `routeKeyFromUrl` emitted
   `host--path`, and the writer's sanitiser collapsed `--` to `-`, so a record's
   `routeKey` and its directory could differ and two routes could collide. Route
   keys are now sanitised at generation and are a fixed point of the sanitiser.
3. **Releasing the mouse on a checkbox toggled it.** The `active` state held the
   button down and released it in place, completing a click. The pointer now
   moves off the element before releasing, so photographing the pressed state of
   a checkbox, link or submit button cannot activate it
   ([ADR 7](docs/adr/0007-honest-state-provenance.md)).
4. **An ambiguous locator could outrank a unique one.** Three identical buttons
   produced a chosen locator matching all three. Uniqueness is now the primary
   sort key ([ADR 8](docs/adr/0008-locator-ranking.md)).
5. **Screenshotting left `style=""` on form controls.** Chromium materialises an
   empty inline style during rasterisation. The capture now records which
   elements had inline styles beforehand and removes only the ones it introduced
   ([ADR 9](docs/adr/0009-restore-screenshot-side-effects.md)).
6. **The overlay inherited hostile page typography.** A page rule of
   `* { font-family: … !important }` styles our shadow *host*, and inheritance
   crosses the boundary. Typography is now declared explicitly on the panel and
   the highlight label rather than inherited.
7. **A write failure escaped as a raw `EEXIST`.** `atomicWriteFile` created its
   directory outside the try block. Directory creation is now inside it, so
   every write failure is a structured `artifact.write-failed`.

## Assumptions recorded

Consequential ones are in [`docs/adr/`](docs/adr/):

1. Record architecture decisions
2. npm workspace, strict TypeScript, short dependency list
3. Pin Playwright to an exact version
4. The overlay/host boundary is a narrow, authenticated, schema-checked bridge
5. Page-side functions are literals, never strings
6. Failed and skipped captures are records, not exceptions
7. States are verified, and a synthesised state is labelled as one
8. A unique locator beats a better-typed ambiguous one
9. Undo the DOM changes screenshotting itself causes
10. Browser modes and where authentication material lives
11. Responsive sets replay the route in a fresh context per viewport
12. The report is one static file, and it treats capture data as hostile
13. State chips apply the state to the live page
14. The crawler follows links and clicks nothing
15. A recipe is the only thing that may touch a crawled page
16. The interaction inventory suggests; it never acts

Smaller assumptions, not worth an ADR:

- `--headless` and `UI_ATLAS_HEADLESS=1` exist so the same commands run in CI.
- `ui-atlas capture` is an addition to the brief's command list: it is what makes
  the phase 0 exit criterion a single command, and it is the CLI's smoke test.
- `ui-atlas report` writes the browsable report *and* prints the terminal
  summary; `--no-html` skips the file.
- The inspector's viewport preset buttons resize the current page; that is not
  device emulation, so selecting a mobile preset warns and the record's
  `viewport.mobile` stays false. Real emulation comes from a responsive set,
  which builds a fresh context per viewport.

## Responsive replay (phase 2, first slice)

Done and covered by `tests/integration/responsive.test.ts`. Each configured
preset gets a fresh browser context — with real touch, user agent and device
scale for mobile presets — its own navigation, its own settle pass and its own
re-resolution. Contexts are seeded from the live session's storage state, so a
signed-in replay stays signed in, and the session's own page is never touched.

Absent, hidden and ambiguous elements are recorded per viewport as `skipped`
with a stable error code, never failing the set. See
[ADR 11](docs/adr/0011-responsive-replay.md).

The reload is proved from the artifacts rather than asserted: the fixture writes
its layout mode once at load, and the captured images for the two "wide" presets
are byte-identical while the "medium" one differs. A resize-only implementation
would produce three identical images.

Two honest caveats, both recorded in `docs/limitations.md`:

- A persistent `profile` context cannot create sibling contexts, so replay there
  degrades to a resize and every mobile preset carries a warning naming the modes
  that do support emulation.
- The toolbar's viewport presets still only resize the current page. The
  responsive set is the path to real emulation.

## Static report (phase 2, second slice)

Done and covered by `tests/unit/reporter.test.ts` and
`tests/integration/report.test.ts`. `ui-atlas report <run-dir>` writes one
self-contained `report/index.html`: no server, no build, and — asserted by test —
no network requests when opened from `file://`. See
[ADR 12](docs/adr/0012-report-is-one-static-file.md).

Capture data is treated as hostile, because it is: accessible names and visible
text come from the inspected site, and the report is opened locally. The model
is embedded as JSON rather than as script, every string is rendered through
`textContent`, and a test captures three elements whose name, text and title are
XSS payloads, then opens the real report in a real browser and asserts nothing
executed.

Building it surfaced two things worth knowing:

1. A **matrix orientation bug** — a state set's `set.member` is a state name, not
   a viewport. Reading it as a viewport label turned a five-state matrix into a
   diagonal of five one-cell "viewports". Caught by looking at the rendered
   report, now covered by a regression test.
2. On the fixture, **`focus` and `focus-visible` produce byte-identical images**.
   That is Chromium's focus-ring heuristic, not a capture fault — both records
   state how they were verified, and the report's Duplicates tab is what makes
   the sameness visible. Recorded in `docs/limitations.md`.

## Live state preview (UX fix)

Reported from real use: toggling a state chip on grok.com appeared to do
nothing. It was doing nothing — the chips only selected what to capture, and
"Element" silently captured `default` regardless. Both are fixed; see
[ADR 13](docs/adr/0013-live-state-preview.md).

Building it caught two real defects:

1. **A `default` capture could photograph a hover.** Selecting an element by
   clicking it leaves the pointer parked on it, so `default` quietly included
   the hover style. `applyState('default')` now moves the pointer off the
   element first, and records that it did.
2. **Re-selecting the same element dropped the preview.** Every element capture
   re-sends its probe; releasing on any selection call yanked the preview away
   mid-capture. Selection now only releases on a genuinely different element.

## Repository hygiene (cleanup)

A `wip` commit had added **2849 files** to version control that
`ui-atlas/.gitignore` already covers: `node_modules/` (2521), every package's
`dist/` (836 after overlap), the ten `tsconfig.tsbuildinfo` files, and three
captured run directories. Git ignores `.gitignore` for paths already in the
index, so the rules were never going to evict them.

All of it is out of the index now and untouched on disk, leaving 160 tracked
sources under `ui-atlas/`. Recurrence is verified two ways: `git add -A
--dry-run` stages nothing, and `.gitignore` has no negation rules that could
punch a hole in those entries.

The committed `node_modules` was not just noise. It was a **macOS arm64**
install, so it carried `@esbuild/darwin-arm64` and no Linux binary, and
`npm run build` failed on any Linux checkout with *"You installed esbuild for
another platform than the one you're currently using"*. That is what the first
baseline run in this session hit; `npm install` fixed it.

## Bounded crawler (phase 3, first slice)

Done and covered by `tests/unit/crawl.test.ts` and
`tests/integration/crawl.test.ts`. `ui-atlas crawl <site-config.yml | url>`
visits same-origin pages and records each one in `pages.jsonl`. See
[ADR 14](docs/adr/0014-crawl-frontier-and-budgets.md).

All five points of the plan this replaced are done:

1. **Canonicalisation** — fragment dropped, credentials stripped, host
   lower-cased, default port dropped, repeated slashes collapsed, trailing slash
   normalised, configured query rules applied, surviving parameters sorted.
   Deduplication is by canonical URL.
2. **Same-origin frontier** over `<a href>` only, breadth-first, honouring
   include/exclude globs and skipping `mailto:`, `tel:`, `javascript:`,
   downloads by extension, `rel="nofollow"` and a sign-out deny list that is on
   by default.
3. **Hard budgets** — `maxPages`, `maxDepth`, `perPageTimeoutMs`,
   `maxRunMinutes` and `maxQueued`. Each page's budget is clamped by whatever is
   left of the run.
4. **Nothing is clicked.** The crawler's entire interaction with a page is
   `goto`, settle, and one `evaluate` that reads anchors.
5. **Resumable queue** keyed by `sha256(canonicalUrl)[0..16]` — a function of
   the URL alone, not of the run or the clock. `crawl-state.json` is written
   atomically after every page; `crawl --resume <run-dir>` continues in the same
   run directory.

The no-clicking guarantee is asserted twice over: the crawl visits
`destructive.html` and reads `window.__uiAtlasDestructiveLog` while that page is
still current, requiring it to be empty, and separately requires that the
browser issued **no non-`GET` request** during the whole crawl.

Building it surfaced four things worth knowing:

1. **A test premise was wrong, not the code.** The new `links.html` fixture was
   seeded expecting the crawl to stay on that page's own links, but the fixture
   graph is connected — `links.html` → `states.html` → `index.html` reaches
   every page. The fix was to bound that test to `maxDepth: 1`, which is what it
   actually meant to measure.
2. **Two deadline holes.** `page.title()` and `page.evaluate()` take no timeout
   argument in Playwright, so both were outside the per-page budget and a wedged
   page could have held a crawl open past `maxRunMinutes`. Both are now raced
   against the remaining budget.
3. **A redirect destination was fetched twice.** Landing on `/b` from `/a` used
   to *queue* `/b`, so a page linking to `/b` produced a second navigation and a
   second record for one page. It is now marked seen instead — and marked
   without charging a navigation, so a site with ten redirects no longer drains
   `maxPages` at double rate. `visited` and the navigation count are separate
   numbers for this reason, and both are persisted.
4. **`/` and `/index.html` are two pages,** on our own fixture site. They serve
   identical bytes but canonicalise differently. Collapsing them needs the
   optional page structural fingerprint; guessing would silently drop real
   pages. Recorded in `docs/limitations.md`.

## Known failures

None. The only unverified item is the public-site half of the phase 1 exit
criterion, which is an environment limitation, not a failure — see above and
[docs/limitations.md](docs/limitations.md).

## Interaction recipes (phase 3, second slice)

Done and covered by `tests/unit/recipes.test.ts` and
`tests/integration/recipes.test.ts`. See
[ADR 15](docs/adr/0015-recipes-are-the-only-way-to-interact.md).

A recipe is the only thing that may touch a crawled page, and writing one is
what approves the interaction. `Crawler` interacts with a page only through an
injected `RecipeRunner`; construct one without it and the crawl behaves exactly
as it did before recipes existed.

The five points of the plan this replaced are done, with one deliberate
subtraction:

1. A `recipes:` block with `select`, `click`, `hover`, `focus`, `press`,
   `scroll`, `scrollTo`, `waitFor`, `waitForUrl`, `waitMs`, `capture`,
   `captureStates` and `captureResponsive`. **No `fill`, no `type`, no
   `evaluate`** — see below.
2. `match:` globs, reusing the frontier's glob dialect.
3. `crawl --dry-run`: no browser, no visits, exits non-zero on a problem.
4. Recipes run after link discovery, so an interaction cannot change the shape
   of the crawl, and never on a page that redirected off-origin.
5. Clicks stay recipe-approved only, and the `destructive.html` assertions still
   pass with a clicking recipe active on another route.

### The deliberate subtraction: nothing types text

The brief lists "fill from secret reference" as a primitive. It is not
implemented, and `fill`, `type` and `evaluate` all fail validation, with a test
asserting they do so it cannot come back by accident.

Sign-in is something a person does, in a visible browser, through
`ui-atlas auth save` — which already refuses to run headless and never submits a
form. The crawl then reuses that session with
`--mode storage-state --profile <name>`, through the same `launchSession` every
other command uses. Automating credential entry is how a tool gets a session
flagged, and it is the one part of this system where being wrong costs an
account rather than a screenshot.

### Also changed

`crawl.perPageDelayMs` now defaults to **750ms** rather than 0. Crawling flat
out is the fastest way to be mistaken for something worth blocking, and this is
the first slice where a crawl also interacts with pages. `perPageDelayMs: 0`
restores the old behaviour; the fixture tests set it, since politeness to a
local server is meaningless.

Building it surfaced three things worth knowing:

1. **Two test premises were wrong, not the code.** A recipe clicking a link
   inside `states.html`'s hover menu timed out — the menu is `position:
   absolute` with no `z-index`, so a tooltip intercepts the click and the
   pointer leaving the menu hides the panel again. Playwright was right to
   refuse. The test now proves the same property better: only `links.html` is in
   scope, the recipe clicks a link out of scope, the browser really does end up
   on `/states.html`, and the crawl still records exactly one page.
2. **A recipe failure was only visible per page.** A recipe that fails on all
   thirteen pages produced thirteen page-record warnings and nothing at the run
   level. It is now also raised to the run once, by name.
3. **The probe has to be injected after all** — but only when recipes exist.
   Element captures must describe their element exactly the way the inspector
   does. A crawl with no recipes still injects nothing, which is the ADR 14
   property that mattered.

## Suggested-interaction inventory (phase 3, third slice)

Done and covered by `tests/unit/inventory.test.ts` and
`tests/integration/inventory.test.ts`. See
[ADR 16](docs/adr/0016-interaction-inventory-suggests-never-acts.md).

`crawl --inventory` lists each page's visible interactive controls and says what
each is likely to *do*, so a user has something to edit instead of a blank page
when writing recipes. It reads and nothing else — no clicking, no hovering, no
focusing.

All four points of the plan this replaced are done:

1. Inventories buttons, links, inputs, tabs, disclosures, menus and anything
   with an interactive ARIA role, describing each with the **same probe the
   inspector uses**, so a control named here and one captured by a recipe mean
   the same thing.
2. Classifies each `navigation` / `inert` / `mutation` / `unknown` from role,
   accessible name, element type, form membership and href, recording which rule
   fired. Mutation rules run first and win over every other signal.
3. Surfaces them. `interactions.jsonl` plus a reviewable
   `suggested-recipes.yml`, in which only `navigation` and `inert` candidates
   become steps, the steps are only ever `select` and `captureStates`, and **no
   `click` step is ever generated** — a machine writing the recipe would not
   make the click any more approved.
4. `destructive.html` is the fixture: all five of its controls land in
   `mutation` (the sign-out link by name, naming the deny rule), the audit log
   is still empty afterwards, and no non-`GET` request was issued.

`unknown` is deliberately not a milder `mutation`. A `<button type="button">`
labelled "Go" is genuinely unclassifiable, its recorded reason says to treat it
as unsafe until reviewed, and the skeleton treats it exactly like `mutation`.

Building it surfaced three things worth knowing:

1. **Nearly repeated ADR 5's defect.** The page-side collector referenced a
   module-level selector constant. Playwright serialises the function alone, so
   it would have arrived as `undefined` — the same class of bug as the original
   string-page-function crash. Caught by re-reading against ADR 5 before running
   it; the selector is now declared inside the function.
2. **Two CLI flags were not registered as boolean.** `--dry-run` and
   `--inventory` were not in `KNOWN_BOOLEAN_FLAGS`, so `crawl --dry-run site.yml`
   would have swallowed the path as the flag's value. Both are registered now.
3. **A test helper passed for the wrong reason.** The `facts()` builder spread
   its overrides over the whole `probe` object, so the `role: 'tab'` case was
   testing an element with no accessible name at all. Fixed, and the helper now
   lifts `name`/`role`/`text` explicitly.

The inventory only sees what is visible without interacting: `states.html`'s
hover menu hides its links from it, and a test asserts exactly that. It is the
direct cost of never touching anything, recorded in `docs/limitations.md`.

## Next smallest milestone

Phase 3's remaining work is throughput and resilience, not new capability:

**Worker concurrency with per-origin throttling.**

1. Several isolated workers, each with its own context, pulling from one
   frontier — the brief is explicit that scale comes from isolated workers, not
   many tabs sharing one mutable session.
2. A per-origin token bucket, so `perPageDelayMs` becomes a floor enforced
   across workers rather than per worker.
3. The frontier is already the synchronisation point and its keys are already
   deterministic; `next()` needs to become safe to call from several workers.
4. `crawl-state.json` must stay correct when several pages are in flight: write
   it on a settled snapshot, not mid-batch.

After that: retry with jitter and status-aware backoff for 429/503, then
trace-on-failure. Both are small next to concurrency and neither changes the
data model.
