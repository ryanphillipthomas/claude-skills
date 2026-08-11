# Progress

Running log for the build. Updated after each milestone so an interrupted
session is recoverable.

**Last updated:** 2026-08-11, after animation frame sampling landed.

## Status

Phases 0, 1, 2 and 3 are complete and their exit criteria pass, with one
environment-bound gap recorded below. Phase 3 shipped in six slices: the bounded
frontier, declarative interaction recipes, the suggested-interaction inventory,
worker concurrency with per-origin throttling, retry with status-aware backoff,
and trace-on-failure. The repository is buildable, tested and documented.

Phase 4 is under way: the animation inventory and deterministic frame sampling
are both done. Hover-transition sampling, the screencast fallback and
design-system extraction are still to come.

```
npm install
npm run build
npm test
```

## Test results

`npm test` (builds, then Vitest — unit and browser integration):

```
Test Files  31 passed (31)
     Tests  349 passed | 3 skipped (352)
  Duration  ~222s
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
| `unit/crawl` | 43 | canonicalisation, path globs, link policy, frontier, budgets, in-flight vs committed, resume round-trip |
| `integration/crawl` | 12 | **phase 3, first slice**: the fixture link graph, the empty click log, budgets, redirects on and off origin, dry run, concurrent and resumed runs through the CLI |
| `unit/recipes` | 16 | step validation, rejected `fill`/`type`/`evaluate`, target rules, dry-run problem detection |
| `integration/recipes` | 8 | **phase 3, second slice**: recipe-approved clicking, match scoping, state sets, hover menus, failure isolation, discovery ordering |
| `unit/inventory` | 19 | classification rules, recipe-target mapping, the skeleton's refusal to emit a click |
| `integration/inventory` | 7 | **phase 3, third slice**: destructive controls all classified `mutation` with an empty click log, safe controls on the states fixture, `maxPerPage`, the generated skeleton |
| `unit/throttle` | 6 | the reservation ladder, per-origin independence, budget clamping, real-clock waiting |
| `integration/concurrency` | 5 | **phase 3, fourth slice**: same coverage as one worker, no duplicate records, budget under parallel flight, the delay holding across workers, concurrent resume, loud single-worker fallback |
| `unit/retry` | 18 | `Retry-After` in both forms, backoff doubling and jitter bounds, which statuses retry, which slow the origin |
| `integration/retry` | 8 | **phase 3, fifth slice**: recovery after two failures, giving up honestly, no retry on 404, `Retry-After` honoured and clamped, origin backoff reported once, retries not eating the page budget, the run deadline winning |
| `integration/traces` | 8 | **phase 3, sixth slice**: nothing written for a healthy crawl, a trace for an unreachable page and for a failed recipe, no trace for a 404, `maxTraces`, and the report not leaking `tracePath` |
| `unit/animation` | 14 | sampleability rules, scroll beating every other signal, summaries, unobservable-motion wording |
| `integration/animation` | 7 | **phase 4, first slice**: every kind of motion on the fixture, the scroll-driven verdict, the hover transition's honest absence, nothing perturbed, canvas/video counted, frames reached, end to end through the CLI |
| `integration/animation-sampling` | 8 | **phase 4, second slice**: only sampleable animations sampled, seek arithmetic, restoration after a full pass and after a thrown capture, the right animation of two sharing a name, the element really moving, real frames through the CLI |
| `integration/external-smoke` | 3 skipped | read-only public-site checks; skip without network |

`npm run typecheck` passes for all twelve packages and for the test sources.

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
17. Workers are isolated; politeness is per origin, not per worker
18. Retrying is per page; backing off is per origin
19. A trace is kept only for a failure, and never leaves the run directory
20. The animation inventory describes without touching, and says what it cannot sample
21. Frame sampling moves one animation, and puts it back

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

## Worker concurrency and throttling (phase 3, fourth slice)

Done and covered by `tests/unit/throttle.test.ts` and
`tests/integration/concurrency.test.ts`. See
[ADR 17](docs/adr/0017-worker-concurrency-and-per-origin-throttling.md).

All four points of the plan this replaced are done:

1. `crawl --concurrency <n>` runs isolated workers, each with its own browser
   context seeded from the live session's storage state, so a signed-in crawl
   stays signed in on every worker without them sharing a mutable session.
2. `perPageDelayMs` is now **a minimum gap per origin across all workers**. The
   throttle claims its slot *before* waiting, so workers arriving together take
   consecutive intervals rather than all waiting out the same one and firing at
   once. That one ordering is the whole difference between a throttle and a
   sleep, and the test for it fails if the reservation moves after the wait —
   verified by making that change and watching gaps collapse to 1ms.
3. `next()` is safe from several workers: nothing in it awaits, so it runs to
   completion before another worker can enter it.
4. `crawl-state.json` stays correct mid-flight — see below.

Concurrency defaults to **1**. More workers on someone else's site is a decision
only the operator can make.

### The frontier now separates handed-out from committed

This was the non-obvious part. `next()` moves an item *in flight*; `commit()`,
called only once the page record is on disk, moves it to *committed*. A snapshot
writes committed URLs as `visited` and both pending **and in-flight** items as
`pending`.

Without that, a crawl killed with four pages in flight would have recorded those
four as visited with no records to show for it, and the resumed run would skip
them as duplicates: **four pages silently lost**. Putting them back in the queue
means a crash re-crawls what was mid-flight and loses nothing.

`maxPages` counts committed plus in-flight, so N workers cannot collectively
overshoot the budget by holding N uncommitted pages.

### One behaviour change worth knowing

The unit test `round-trips through persisted state without re-handing out
visited pages` failed after this change, correctly. It asserted that a page
handed out but never committed counts as visited on resume — which is exactly
the data-loss behaviour above. It has been replaced by two tests that pin the
new contract: a committed page is not re-handed out, and an in-flight page is.

Building it surfaced two other things:

1. **A test filter was too broad.** Counting `resourceType === 'document'`
   requests to measure navigations also counted `frames.html`'s iframe, so six
   pages produced seven "navigations". The harness now records whether a request
   was for the main frame.
2. **An idle worker is not a finished worker.** The queue can be empty while
   another worker is on a page about to contribute links. Workers exit only on a
   drained frontier — queue empty *and* nothing in flight.

## Retry and status-aware backoff (phase 3, fifth slice)

Done and covered by `tests/unit/retry.test.ts` and
`tests/integration/retry.test.ts`. See
[ADR 18](docs/adr/0018-retry-and-status-aware-backoff.md).

The central idea is that two things were being conflated. **Retryable** means
this request might work next time, and belongs to the *page*. **Backoff** means
the host is asking for less traffic, and belongs to the *origin*. They are
decided separately and applied separately:

1. Navigation failures and the statuses worth repeating (408, 425, 429, 500,
   502, 503, 504) are retried with exponential backoff and jitter. A `404` is
   an answer, not a hiccup, and is left alone.
2. A `429` or `503` additionally penalises the origin through the same
   `OriginThrottle` that enforces `perPageDelayMs`, so **every** worker's next
   request to that host is pushed back. The corollary is easy to get wrong and
   is tested: a `429` on the *last* attempt still penalises the origin, because
   giving up on one page is no reason to keep hammering.
3. `Retry-After` is honoured in both forms the spec allows, clamped by
   `maxRetryAfterMs`, falling back to our own backoff when unreadable.
4. A retry costs an attempt, never a page. `maxPages` counts pages, and a host
   that made us try three times has not shown us three pages. Every wait is
   clamped by what is left of `maxRunMinutes`.

### Two departures from the plan, both deliberate

**Retries loop in place rather than re-queueing.** The plan said to hand a failed
page back through `release()`. That turned out to be more machinery for no gain:
the origin is throttled either way, so a re-queued page waits exactly as long,
and `visit()` would have had to return a "not finished" signal and defer writing
its record. Looping inside `visit()` keeps the retry story in one function and
keeps `visit()` returning a finished `PageRecord`. `release()` is still there for
a worker that dies or is cut off by a budget.

**An error status is now a failed page record.** A `4xx`/`5xx` used to be an
ordinary page with an `httpStatus`; it now carries a structured error, and its
links are not harvested — an error page's navigation is not the site's link
graph. The exit code deliberately does not follow: a `404` is a finding about the
site and belongs in the report, while a page that never answered is a finding
about the run, and only the latter makes `crawl` exit non-zero. One broken link
should not fail a pipeline that was checking whether the crawl worked.

Building it surfaced one real defect and one wrong expectation:

1. **`Date.parse` accepted garbage as a date.** `Retry-After: -5` parsed as a
   year and produced a real timestamp, so a malformed header would have become
   "retry immediately" rather than falling back to backoff. Every HTTP-date form
   carries a day or month name, so a letter is now required before a date is
   attempted. Found by a unit test.
2. **A test expected the wrong backoff.** The "still penalises on the last
   attempt" case asserted the first attempt's delay; by the third 429 the
   backoff has doubled twice. The code was right.

## Trace on failure (phase 3, sixth slice — phase 3 complete)

Done and covered by `tests/integration/traces.test.ts`. See
[ADR 19](docs/adr/0019-traces-are-kept-only-for-failures.md).

`crawl --trace-on-failure` keeps a Playwright trace for a page that could not be
reached and for a page a recipe failed on. That second case is what the feature
is really for: the page loaded fine, so nothing in `pages.jsonl` explains why a
step could not find its element.

All four points of the plan this replaced are done, and the fourth turned out to
be the whole design:

1. `RunPaths.tracesDir` is finally used, created lazily so a clean run has no
   empty directory suggesting something is missing.
2. Playwright's chunk API does the work: `tracing.start()` once per worker
   context, `startChunk()` before each page, and a chunk written **only** when
   the page failed. Recording costs memory; only a failure costs a file.
3. Named by page record id, with an optional `tracePath` on `PageRecord`.
4. A trace records network traffic including request headers, so one taken
   during an authenticated crawl contains the session cookie that authenticated
   it.

### That last point drove everything

- **Off by default.** Every other diagnostic here is safe to leave on; this one
  writes impersonation-capable material to disk.
- **Nothing is written for a page that worked.** The chunk API is what makes
  that possible — the alternative is tracing everything and deleting most of it,
  which puts every successful page's cookies on the disk on the way to being
  deleted.
- **An error status is not a failure for this purpose.** A `404` is an answer;
  its status is the whole story, so a trace would add a sensitive file and no
  information.
- **The report does not surface `tracePath`.** The report is the artifact you
  send to someone ([ADR 12](docs/adr/0012-report-is-one-static-file.md)), and a
  trace path in it invites forwarding a file full of request headers. The report
  already builds an allowlist view model, so this needed no new mechanism — but
  it needed a test, because an allowlist that is never challenged proves
  nothing. Adding `tracePath` to that view model makes the test fail; verified
  by doing exactly that and watching it go red.
- **The first trace of a run warns** that the run directory is now sensitive.
  Once per run, because it is a fact about the directory.

This is the one deliberate exception to
[ADR 10](docs/adr/0010-auth-and-browser-modes.md)'s rule that auth material
stays out of artifacts, which is why it is opt-in, bounded by `maxTraces`, and
announced.

## Animation inventory (phase 4, first slice)

Done and covered by `tests/unit/animation.test.ts` and
`tests/integration/animation.test.ts`. See
[ADR 20](docs/adr/0020-animation-inventory-describes-without-touching.md).

`ui-atlas animations <url>` lists every animation the Web Animations API can see
and says of each whether it could be sampled at a chosen point and give the same
frame every time. It writes `animations.jsonl` and captures nothing.

All four points of the plan this replaced are done:

1. `document.getAnimations()` in every frame Playwright can reach — which
   includes cross-origin frames that page script could never evaluate in —
   recording kind, timing, iterations, easing, direction, fill, keyframe offsets,
   animated properties, play state and target.
2. Each classified `sampleable` / `infinite` / `scroll-driven` /
   `indeterminate` / `instant`, with the reason recorded on the record.
3. Surfaced as a list to read. Frame sampling is the next slice.
4. `motion.html` is the fixture, and the honest outcomes are what the tests
   assert: the infinite animation is reported *and* explicitly not sampleable,
   and the scroll-driven one is marked reachable only by scrolling.

### Why this slice captures nothing

Sampling an infinite animation "at 100%" produces a screenshot of an arbitrary
moment presented as an end state. Seeking `currentTime` on a scroll-driven
animation produces a frame the site would never show at that scroll position.
Both look exactly like a successful capture, which is why the classification
comes first and the sampling comes second.

Three decisions follow from that:

- **It reads and only reads.** Nothing is paused, seeked or cancelled. A test
  snapshots every animation's play state and playback rate either side of a full
  pass and requires them identical. The restore step is the part most likely to
  be subtly wrong, and a slice that needs no restore cannot get it wrong.
- **`durationMs` and `iterations` are absent, not zero**, for `auto` and
  `Infinity`. A zero would be a lie with a number on it. Nothing not driven by
  time gets an `iterationDurationMs` at all, because offering a number there
  invites exactly the seek that cannot work.
- **Scroll beats every other verdict.** When a scroll-driven animation is also
  infinite, the reason it cannot be sampled is the timeline, and the reason is
  what a person acts on.

### Two honest gaps, both tested

1. **Canvas, WebGL and video motion is invisible**, because none of them is an
   `Animation`. Those elements are counted and named in a warning: "no animations
   found" on a canvas-driven page would be a lie of omission. `media.html` proves
   it.
2. **A hover transition does not exist on a page at rest**, so it is absent. That
   falls out of refusing to interact, and the test asserts both halves — absent
   before the hover, present after it.

One correction to the plan as written: `Document.getAnimations()` takes no
options. `{ subtree: true }` is the `Element.getAnimations()` form, and the
document-level call already covers the whole document. Caught by the compiler.

## Deterministic frame sampling (phase 4, second slice)

Done and covered by `tests/integration/animation-sampling.test.ts`. See
[ADR 21](docs/adr/0021-frame-sampling-restores-what-it-moves.md).

`ui-atlas animations <url> --sample` photographs each sampleable animation at
chosen points within one iteration, pausing and seeking it and then putting it
back exactly as it was found.

All five points of the plan this replaced are done:

1. Pause, seek to each configured offset, capture, and restore `currentTime`,
   `playbackRate`, `playState` and `startTime` in a `finally`.
2. Only what the inventory called `sampleable` is sampled. Everything else comes
   back as a skip carrying **the inventory's own reason** — the judgement lives
   in one place and the sampler never re-derives or overrides it.
3. `AnimationSample` is filled in rather than reshaped, `limitations` included.
4. Restoration is proved twice: a full pass leaves a snapshot of *every*
   animation's play state, time and rate identical, and so does a capture that
   throws half way through.
5. The toolbar's Animation button is still disabled — enabling it needs the
   bridge's `capabilities.animation` flipped and a queue job kind, which is UI
   work rather than capture work.

### Three real defects, each found by a test

1. **Playwright's `animations: 'disabled'` would have destroyed every frame.**
   The option the rest of the tool relies on to make stills deterministic
   *fast-forwards finite animations to completion*. On a frame just seeked to
   25% it throws the seek away and photographs the end state. `animation-frame`
   captures now use `'allow'`, which is safe precisely because the animation is
   already paused.
2. **Matching an animation by name sampled the wrong one.** The fixture runs
   `drift` twice — once finite, once infinite — because two elements sharing a
   `@keyframes` name is completely ordinary. A name identifies a rule, not an
   animation. The inventory now records each animation's index in its document's
   `getAnimations()` list, and the sampler addresses it by index and *verifies*
   name and target, so a changed page yields "could not be found again" rather
   than a confident frame of the wrong animation.
3. **`animation-frame` was still a stub** in the capture service, throwing "not
   implemented yet". It now takes an ordinary still of the element, falling back
   to the viewport when the animated element cannot be located.

### And one test premise that was wrong

The restoration tests paused every animation and snapshotted immediately. But
`pause()` *queues* a pause task: `playState` reads `paused` at once while
`currentTime` keeps tracking the timeline until the task runs at the next frame.
The snapshot was catching animations mid-flight, so every later comparison
drifted by exactly one frame — 16ms. Waiting two frames after pausing makes
"before" a genuinely settled state, and restoration then compares exact.

### One thing deliberately not done

Only the animation being sampled is paused. A page with several running
animations shows the others wherever they happened to be. Freezing everything
would produce a composite moment that never existed — a bigger lie, not a
smaller one.

## Next smallest milestone

**Hover-transition sampling**, which closes the loop between recipes and motion.

1. A transition does not exist until something provokes it, which is why the
   inventory legitimately cannot see one on a page at rest.
2. The shape: enter hover, re-run the inventory, diff against the pre-hover list
   to find what *appeared*, and sample only those. `motion.html`'s
   `transition-swatch` is the fixture, and the inventory test already proves the
   before/after asymmetry the diff depends on.
3. It belongs behind a recipe step rather than a new command — `hover` already
   exists as a step, so this is `captureAnimation` alongside `captureStates`.
4. The restore story gets one step longer: release the hover as well as the
   animation, and the transition that then runs *backwards* must not be
   photographed as though it were the forward one.

After that: the bounded screencast fallback for motion that cannot be
represented as keyframes (`animation-video` is still a stub), then first-pass
design-token extraction and duplicate component grouping, which closes phase 4.
