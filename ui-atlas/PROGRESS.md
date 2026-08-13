# Progress

Running log for the build. Updated after each milestone so an interrupted
session is recoverable.

**Last updated:** 2026-08-12, after `doctor` landed. The brief is delivered;
the last three slices are usability work on top of it, each one driven by a
real failure during real use.

## Status

Phases 0 through 4 are complete and their exit criteria pass, with one
environment-bound gap recorded below. Phase 3 shipped in six slices: the bounded
frontier, declarative interaction recipes, the suggested-interaction inventory,
worker concurrency with per-origin throttling, retry with status-aware backoff,
and trace-on-failure. The repository is buildable, tested and documented.

**Phase 4 is complete**, in seven slices: the animation inventory, deterministic
frame sampling, provoked hover/focus motion, the screencast fallback,
observed-value extraction, the animation inventory during a crawl, and the
toolbar's Animation panel. **Everything the brief scopes is built** — the last
item on its own list was the Animation button, and it is no longer disabled.

Two more slices followed the first real external runs. The eighth: guided flow,
buttons for everything the keyboard could reach, and filenames derived from what
each capture already knows about itself. The ninth: a saved sign-in that is
checked rather than assumed, after the same authentication failure happened
repeatedly and always looked like something else. The tenth: `doctor`, which
says what actually failed when a page reports something inscrutable.

```
npm install
npm run build
npm test
```

## Test results

`npm test` (builds, then Vitest — unit and browser integration):

```
Test Files  45 passed (45)
     Tests  565 passed | 3 skipped (568)
  Duration  ~310s
```

On a networked machine the three external smoke tests run instead of skipping:
the user confirmed **zero skips** on macOS, which closes the last open item on
the phase 1 exit criterion. Nothing is unverified now.

| Suite | Tests | What it proves |
| --- | --- | --- |
| `unit/paths` | 14 | segment sanitising, route keys, artifact-root escape rejection |
| `unit/artifacts` | 15 | atomic writes, JSONL, PNG headers, record validation, corrupt-line tolerance, descriptive filenames, collision suffixes surviving a resume, the indexes |
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
| `integration/report` | 9 | **phase 2 exit criterion**: the generated report driven in a real browser, including script injection |
| `unit/reporter` | 14 | escaping, view model, matrix grouping, duplicate grouping, recordings in the allowlist |
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
| `integration/animation` | 13 | **phase 4, first and sixth slices**: every kind of motion on the fixture, the scroll-driven verdict, the hover transition's honest absence, nothing perturbed, canvas/video counted, frames reached, end to end through the CLI — plus the crawl seam: every page described, nothing perturbed, off by default, the unobservable notice raised once for the run, and both caps reported where each belongs |
| `integration/animation-sampling` | 8 | **phase 4, second slice**: only sampleable animations sampled, seek arithmetic, restoration after a full pass and after a thrown capture, the right animation of two sharing a name, the element really moving, real frames through the CLI |
| `unit/animation-diff` | 10 | what an interaction started: index-independence, multiset counting, per-element and per-frame separation |
| `integration/provoked-animation` | 13 | **phase 4, third slice**: the two transitions one hover starts, the group on one clock, the page's own animations left running, restore then release, no reverse frame, ascending seeks, an interaction that starts nothing, release after a thrown capture, and the step's inability to click |
| `unit/screencast` | 12 | what a recording would be of, how long it needs, and everything it refuses |
| `integration/screencast` | 7 | **phase 4, fourth slice**: a real webm of the infinite animation, the record refusing to look like a sample, the sidecar, canvas and video as subjects, a page that needs no recording, an over-budget discard, and no scratch left behind |
| `unit/tokens` | 24 | colour/length/font normalisation, category mapping, counting across pages, truncation warnings, near duplicates reported and never merged |
| `integration/tokens` | 9 | **phase 4, fifth slice**: browser defaults excluded, script/style never read, the page unchanged either side, the per-page cap, the fixture's real colours, the CLI across several pages and past an unreachable one, a whole-site crawl scan, and doing nothing when switched off |
| `integration/animation-panel` | 9 | **phase 4, seventh slice**: the panel driven through the real overlay — what it lists, the action each row gets, no row without a reason, listing changing nothing, a sample that restores, a recording that is not called a sample, canvas named with an action, an honest refusal when the animation has gone, and the keyboard route |
| `unit/naming` | 31 | slug composition and what it refuses to invent, word-boundary trimming, stem sanitising that keeps `--`, the index's grouping, descriptions and relative links |
| `unit/flow` | 13 | what the panel says at each point in the sequence, and that every step it points at has an instruction |
| `integration/guided-flow` | 20 | **eighth slice**: the flow line through a real browser at each step, the instructions and their current-step marking, tree navigation as buttons, the count after a real capture, and the filenames, sidecar and index the run writes |
| `unit/signin` | 19 | what a storage state drops and when that matters, login-path matching, and the three-valued verdict with its evidence |
| `integration/doctor` | 10 | **tenth slice**: the request behind an "Unexpected token" error found, the HTML identified as a challenge, the page's own error captured, nothing reported for a page that works, and query strings kept out of the output |
| `integration/signin` | 12 | **ninth and eleventh slices**: the page-side probes against real pages — a login page read as signed out, a way out read as signed in, an ordinary page read as unclear, a hidden password field ignored, a redirect noticed, IndexedDB/sessionStorage actually found, a challenge page recognised by its markup and its wording, neither an ordinary nor a sign-in page mistaken for one, and a challenged crawl stopping with zero pages and the warning in `run.json` |
| `integration/attach` | 5 | attach mode against a real browser with a debugging port: the attached browser survives the run, its own context is used rather than a fresh one, the determinism warning is raised, a second attached run starts, and injected scripts are declared as outliving the run |
| `integration/external-smoke` | 3 skipped | read-only public-site checks; skip without network |

`npm run typecheck` passes for all thirteen packages and for the test sources.

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

## Provoked motion (phase 4, third slice)

Done and covered by `tests/unit/animation-diff.test.ts` and
`tests/integration/provoked-animation.test.ts`. See
[ADR 22](docs/adr/0022-provoked-motion-is-sampled-as-one-group.md).

The `captureAnimation` recipe step reaches the motion the previous two slices
could not: the transition that does not exist until something provokes it, which
is most of the motion in a design system.

```yaml
- captureAnimation: { hover: { testId: product-card }, kind: element }
```

All four points of the plan this replaces are done, and two of them changed
shape once the browser had a say:

1. The step takes an inventory, hovers or focuses, takes another, and **the
   difference is what that interaction started**.
2. The provocation lives *inside* the step rather than beside it. A separate
   `hover` step would throw away the before-list, and a 200ms transition
   provoked by one step has usually finished by the time the next runs.
3. `hover` and `focus` only: the step **cannot click**. A test points it at
   `destructive.html`'s *Delete account* button and requires the audit log empty.
4. Animations restored first, provocation released second, both in a `finally`.
   The reverse transition is never photographed because every frame is taken
   before the release.

### The design decision that was not in the plan

**A group is one picture.** Hovering the fixture swatch starts two transitions —
`transform` and `background-color` — at the same instant. Sampling them one at a
time, the way ADR 21 samples ambient animations, would produce a frame with the
transform half way and the colour still at its start: a composite that never
existed.

So every member is paused first, then all of them are seeked to the **same
absolute time** and photographed once. `progress` therefore means a fraction of
the interaction's span here, not of one animation's iteration — a deliberate
divergence from ADR 21, because for a group the only meaningful "50%" is the
same instant for every member.

### The defect the browser taught us

Seeking to 100% **removes a CSS transition from `getAnimations()` outright** —
it is finished, and a transition has nothing to fill with, so the browser drops
it. Everything after that seek then addresses an animation the document no
longer has: no error, no movement, and a frame that looks exactly like every
other frame while showing the end state.

`--offsets 1,0.5,0` was therefore a silent wrong-frame bug. Offsets are now
seeked in ascending order whatever order they were written in, which is the one
order in which every frame is the moment it claims to be, and nothing is lost
because each frame carries its own offset. The test requires the middle frame to
be genuinely in the middle; removing the sort turns it red.

### And one caveat that was a false alarm

`limitationsFor` warns that `fill: backwards` means 100% may show the
un-animated element. True for a CSS animation, wrong for a transition: past its
end a transition falls back to the underlying style, and while the hover is
still applied that style *is* the value it was transitioning to. The warning is
suppressed for transitions, so the frame most likely to be looked at no longer
carries a false alarm.

### One test premise that was wrong

The freeze test asserted both transitions were `paused` in every frame. They are
not present at all in the 100% frame — see above — and the element correctly
shows its end state without them. The test now requires them paused in every
frame where they still exist, and requires that to be all but the last, so it
cannot pass vacuously.

### One dependency added

`@ui-atlas/crawler` now depends on `@ui-atlas/animation`. The probe stayed
injected because it was one function; this is a whole capability, and injecting
it would have scattered the interesting logic across the wiring.

## The screencast fallback (phase 4, fourth slice)

Done and covered by `tests/unit/screencast.test.ts` and
`tests/integration/screencast.test.ts`. See
[ADR 23](docs/adr/0023-a-recording-is-a-fallback-not-a-sample.md).

`ui-atlas animations <url> --video` records the motion the previous three slices
could describe and never show. `animation-video` was a stub throwing "not
implemented yet" since phase 0 defined the capture kinds.

The plan's four points, and how each turned out:

1. **What it records.** `infinite` and `indeterminate` animations plus canvas,
   WebGL and video elements — but **not** `scroll-driven`, which was in the plan
   and should not have been. Nothing scrolls during a recording, so the video
   would be a still, and a still that looks exactly like a recording that failed
   is worse than an honest absence. It is refused with that reason.
2. **Its own context.** Playwright records a browser context rather than a page
   and only writes the file when the context closes, exactly as the plan said. So
   a recording opens a short-lived context and loads the page again. The cost is
   reported rather than hidden: the file begins with that second page load, and
   `leadInMs` says how far in the part you asked about starts. A persistent
   profile cannot create a sibling context, so it warns and skips.
3. **Hard bounds.** `maxDurationMs` caps the window and sets `truncated` when it
   bites; `maxBytes` is checked by `stat` before the file is read, so a runaway
   recording cannot become a runaway allocation on its way to being rejected.
   Over budget is a `skipped` record with a new `capture.over-budget` code —
   a budget doing its job is not a broken run, and a silent absence would look
   identical to never having tried.
4. **Not a sample.** Carried through, more strictly than planned — see below.

### Two corrections to the plan

**`AnimationSample.method: 'screencast'` is not what a recording needs.** The
plan assumed the enum member was waiting for this. It is not: an
`AnimationSample` requires a `progress` and a `currentTimeMs`, and there is no
honest value for either when the subject repeats forever. So an
`animation-video` record carries **no `animation` field at all** — a `Screencast`
instead, saying what the recording is of and what it does not promise. A test
asserts the absence directly. The enum member stays unused.

**The frame rate cannot be "recorded rather than assumed".** Playwright does not
expose the rate it recorded at, and decoding the WebM to find out is a bigger
dependency than this slice earns. So none is written, and a limitation says
times read off the file are approximate. A plausible `fps: 25` would be a number
that reads like a measurement and is not one.

### One defect, found by a test that could no longer click

A `<video controls>` inside a gallery card swallowed the click that opens the
detail panel — a card and a matrix cell are both `<button>`s. Player controls now
appear only in the detail panel, backed by `pointer-events: none` on the preview.
It looked like a broken test and was a broken UI.

### One test premise that was wrong

The first assertion required the recording's subjects not to mention
`finite-swatch`, to prove the infinite `drift` was recorded and the finite one
was not. But `"infinite-swatch"` *contains* `"finite-swatch"`. The subject list
was right all along; the assertion now compares the whole list exactly.

## Observed-value extraction (phase 4, fifth slice)

Done and covered by `tests/unit/tokens.test.ts` and
`tests/integration/tokens.test.ts`. See
[ADR 24](docs/adr/0024-observed-values-are-candidates-not-tokens.md).

`ui-atlas tokens <url>` and `crawl --tokens` read every element's computed style
and count what turns up, into `tokens.json` and the report's **Values** tab.

The plan's four points:

1. **The raw material.** Reading captured elements' `styleDelta` would only ever
   describe the handful of things somebody photographed. The scan reads *every*
   element instead, which is one page-side evaluation and gives real frequencies.
2. **The property set and the artifact**, as planned — colour, background,
   border, radius, spacing, typography, shadow.
3. **The framing**, carried all the way through. See below.
4. **Duplicate grouping across routes was already done.** See below.

### The framing is the feature

"#2563eb appears on 34 elements" is a fact; "this is your primary colour" is a
judgement. There is **no `name` field anywhere** in the artifact, and a test
asserts its absence. The schema is `DesignTokenCandidate`, the report tab is
called *Values* rather than *Tokens*, and `tokens.json` carries a `note` saying
what it is and is not, so the file is honest read with no other context.

Three decisions follow from it:

- **Values that mean nobody decided anything are dropped** — a transparent
  background, a zero margin, `font-style: normal`. They are the most common
  computed values on any page, and this is the whole difference between a list
  of design decisions and a list of browser defaults.
- **Near-duplicates are reported and never merged.** Two colours one channel
  apart are usually a rounding error and occasionally deliberate. The counts are
  the evidence that answers which, and merging would destroy exactly that.
- **Every truncation says so.** Both the per-page element cap and the
  per-category tail cap add a warning naming what was left out.

### One correction to the plan

**Cross-route component grouping already worked.** The plan assumed it was
missing and would need a new key. `groupComponents` keys an element group by
`element:<structural fingerprint>` with no route in it, so the same component
captured on four routes has always been one group. Nothing to build; the
assumption was simply wrong.

### Two defects, both found by a test

1. **The examples cap was only applied when merging**, not when a value was
   first seen. The page-side cap happened to be the same number by
   configuration, so the bound held by coincidence rather than by construction.
2. **Hex colours were not normalised**, so `#2563EB` and `#2563eb` would have
   been two values. Chromium always answers in `rgb()`, so this never fires in
   practice — but a function that is right about its input rather than right
   about its current caller is the difference between a bug and a near miss.
   Hex parsing was added, including `#abc` and `#rrggbbaa`.

### The one guarded string in the report

The Values tab paints colour swatches, which means a capture-derived string
reaching a `style` attribute — the only place in the whole report that happens.
It is matched against `#rrggbb` or `rgba(n, n, n, a)` rather than trusted, and a
test feeds it a `color(display-p3 …)` and requires the row to render with no
swatch at all.

## The animation inventory during a crawl (phase 4, sixth slice)

Done and covered by the second `describe` block in
`tests/integration/animation.test.ts`.

`crawl --animations` runs the phase-4 inventory on every page a crawl visits,
into `animations.jsonl` keyed by route, so "what moves on this site" is
answerable from one run. It reuses the seam the interaction inventory and the
style scan already use — `runInventory` / `runTokens` / `runAnimations`, all
called before recipes so each describes the page as served.

Three things it deliberately does *not* do:

- **It never samples.** Photographing motion costs a pause, a seek and a
  screenshot per frame; that is a `captureAnimation` recipe step or the one-shot
  command, not something a crawl spends on every page unasked.
- **It needs no probe injected**, unlike an element capture, because it reads
  the page's own animation state rather than describing an element.
- **It leaves the page alone**, proved by the fixture's infinite `drift` still
  reading `running` in its record.

### Where a warning belongs turned out to be the design question

Two caps, and they are not the same kind of fact:

- The **per-page cap** ("motion.html has 300 animations; only the first 200 were
  recorded") is about that page, so it travels with the page record.
- The **run-level cap** ("the inventory reached its 5000 record budget") is about
  the run. Attached to whichever page happened to trip it, it would be one line
  inside one page record and easy to miss entirely, so it is raised once in the
  run warnings.

The same reasoning moved the unobservable-motion notice. "This page contains 2
canvas elements whose motion cannot be described" is true of every page of a
canvas-driven site; said fifty times it buries everything else. It is counted
across the crawl and raised once, with a route count.

### One test premise that was wrong, twice over

The first crawl tests found zero animations, then found the caps' warnings
missing. Neither was a code fault:

1. The budget was `maxPages: 6`, and the fixture pages with motion are the
   eighth and ninth discovered. The crawl never reached them. Raised to cover
   the whole fixture.
2. The warnings were asserted on `result.warnings` — but the per-page cap is a
   page-record warning, which is correct. The run-level cap genuinely was in the
   wrong place, and moving it is the change above. So one half of the premise
   was wrong and the other half found a real defect.

## The toolbar's Animation panel (phase 4, seventh slice)

Done and covered by `tests/integration/animation-panel.test.ts`. See
[ADR 25](docs/adr/0025-the-animation-button-is-a-list-not-a-shutter.md).

The Animation button has been disabled since phase 1. It is not any more, and
what it does is **list**, not photograph.

### Why a list and not a shutter

Every other capture button photographs something immediately, and can, because
what to photograph is unambiguous. An animation button has no such answer: a
page has several animations, the user means one, and **most of them cannot be
sampled at all**. The fixture alone has an infinite one, a scroll-driven one and
a multi-iteration one. A button that shot "the animation" would have to guess
which, then fail for most pages.

So the panel lists what moves and gives each row the one action that would work:

| Verdict | The row shows |
| --- | --- |
| `sampleable` | **Sample** — a seek reproduces the frame every time |
| `infinite`, `indeterminate` | **Record** — a seek cannot, but a recording shows it |
| `scroll-driven` | nothing — a recording of a page not scrolling is a still |
| `instant` | nothing — there are no intermediate frames |

Every row without an action carries the **inventory's own reason**, the same
sentence the `animations` command prints. A test requires no row to be a dead
end: an action, or a reason, never neither.

Canvas, WebGL and video are counted and named too, with **Record the page** —
without that, `media.html` would show an empty panel, and "nothing is animating"
on a canvas-driven page is a lie of omission.

### Two things that make it safe

**Listing is a read.** Pressing the button pauses nothing, seeks nothing and
captures nothing. A test presses it and then requires every animation still
unpaused and the queue still empty. That is what makes a panel a reasonable
thing to put behind a button.

**An animation is re-found by fingerprint at capture time**, not by the index it
was listed at. Seconds pass between listing and clicking, and a transition that
ends in that time takes every index after it along. A test cancels every
animation between the two and requires the job to fail with *"no longer running
on this page"* rather than produce a confident frame of the wrong one.

### One test premise that was wrong

The sampling test compared every animation's play state either side of the
capture and required them identical. They are not: sampling takes a couple of
seconds, and the fixture's finite 1200ms animation legitimately *finishes* in
that time on the page's own clock. Restoration never promised to stop time. What
it does promise is that nothing is left held — so the test now requires no
animation to read `paused` (a failed restore) or `idle` (a cancel never undone).

## Guided flow and readable filenames (eighth slice)

Done and covered by `tests/unit/naming.test.ts`, `tests/unit/flow.test.ts` and
`tests/integration/guided-flow.test.ts`. See
[ADR 26](docs/adr/0026-captures-are-named-from-what-they-already-know.md) and
[ADR 27](docs/adr/0027-the-panel-says-what-to-do-next.md).

This came out of the first real run against an external site. Four things were
asked for: the shortcuts are hard, there are no instructions, there is no sense
of flow, and the output is disorganised — with a suggestion that Claude could
look at the images and name them.

### The finding that reordered the work

**Most of the naming problem was already solvable locally.** Every capture
already stores the element's ARIA role, its accessible name, a text excerpt and
the state that was applied — the inspector reads all of them to score locators.
So `cap-7f3a91.png` could be `button--save-changes--hover.png` with nothing sent
anywhere. AI was only ever needed for the residue: wrapper divs and sections
with no accessible name.

Having seen that, the ask changed to *keep them organised so a manual rename is
easy* — so there is no AI pass, and the README's opening promise ("no cloud
account, no AI service") is untouched.

### Names

`captureSlug` composes `<subject>--<label>--<state>` from fields the record
already carries. `button--save-changes--hover.png`,
`checkbox--email-me-about-updates--checked.png`, `viewport--default.png`.

Four decisions worth keeping:

- **Nothing is invented.** A capture with no accessible name and no text gets a
  *shorter* name (`div--default.png`), never a guessed one.
- **Frames are zero-padded** — `frame-050` sorts between `frame-000` and
  `frame-100`, where `50` would sort after `100`.
- **`--` separates parts, `-` separates words.** `sanitizeSegment` collapses
  hyphen runs, which would turn `button--save-changes--hover` into
  `button-save-changes-hover` and lose the boundary. `sanitizeFileStem` relaxes
  that one rule and keeps every other guarantee.
- **Collisions get `-2`, `-3`** from a registry `RunWriter` owns. Two "Save"
  buttons on one page is ordinary, and a collision would have silently
  overwritten an image *and* its sidecar.

The registry is re-seeded from `captures.jsonl` on resume. Without that, a
resumed run would write `button--save--hover.png` straight over the one it
already had and the earlier record would point at the later image. A test kills
and resumes a writer to prove it does not.

### Organisation

The folder shape was already right — `screenshots/<route>/<viewport>/` — what
was missing was a way to read it. `finalize()` now writes `index.md` at the run
root and one inside each route folder, listing every file with a sentence saying
what is in it. Captures that produced **no** file are listed too, under "Not
captured here", with the reason.

Both indexes say plainly that renaming a file does not update `captures.jsonl`
or the sidecar beside it. That is the honest caveat for the workflow this exists
for: the names are a starting point a human is expected to improve.

An unwritable index is a run warning, not a failed run — the captures and their
sidecars are already on disk by then.

### Flow

`nextStep` is a pure function from the panel's state to one sentence and a
position. It renders above everything else, because it answers the question a
person opens the panel with, and the answer should not sit below the controls it
is about.

| State | It says |
| --- | --- |
| not connected | *Waiting for the UI Atlas session. Nothing is being captured yet.* |
| nothing selected | *Press Inspect, then move the pointer over the page…* |
| inspecting, nothing selected | *Click the element you want…* |
| selected | *Pick the states you want, then press Capture. Right now: default, hover.* |
| jobs in flight | *Capturing 3 jobs… files land in this run as they finish.* |
| captured here | *4 captures so far on /pricing. Select the next element, or open another page…* |

Two things this buys beyond instruction: **the capture button is never a
surprise**, because the line names the states it is about to take; and
**progress beats instruction**, so while the queue works it says what is
happening rather than repeating what to do.

Three numbered steps, not four — choosing states and pressing Capture happens in
one place at one time, and splitting it would have been a number that looked
like progress without being any. A test asserts every position `nextStep` can
return has a matching instruction, so the highlight can never point at nothing.

### Buttons

Walking the DOM tree was arrow-keys-only, which meant it may as well not have
existed: the operation you want immediately after clicking slightly the wrong
thing had no visible control at all. Parent, child, previous and next are now
buttons, disabled until there is a selection. The arrow keys are unchanged, and
are now the shortcut for a visible control rather than the only way in.

The count is of **captures**, not jobs — a failed job captured nothing, and a
three-state set produces three — attributed to the page recorded when the
capture was *asked for*, since a single-page app can navigate while the queue
works. The overlay watches for route changes in the frame loop it already runs,
so the count does not go stale on a route change.

### One bug caught by writing the test for it

A route index sits under `screenshots/<route>/`, but recordings live under
`animations/<route>/`. Prefix-stripping produced a link that resolved to
nothing. `relativise` now computes a real relative path and climbs out with
`../../` where it has to.

## A saved sign-in that is checked, not assumed (ninth slice)

Done and covered by `tests/unit/signin.test.ts` and
`tests/integration/signin.test.ts`. See
[ADR 28](docs/adr/0028-a-saved-sign-in-is-checked-not-assumed.md).

Saved sign-ins kept failing, always in the same shape: `auth save` reported
success, the run started fine, every page returned 200, and the artifacts were
of a signed-out site. On one real site the visible symptom was
`Unexpected token '<', "<!DOCTYPE "` — the site's own code, expecting JSON and
receiving an HTML challenge page. Nothing anywhere said *you are signed out*.

### The root cause, and the aggravating factor

`context.storageState()` carries **cookies and localStorage, and nothing else**.
Not IndexedDB, not sessionStorage, not service workers. Plenty of modern
sign-ins keep their token in exactly those places, so a saved file can be large
and healthy-looking and contain none of the session.

What made it hurt was that nothing checked — not at save time, not at run time.
The gap between the mistake and the symptom was the whole run.

### Three changes, in the order they help

**`auth save` asks the page what it stores.** `probeStorage` reads localStorage
and sessionStorage key counts, IndexedDB database names and service worker
registrations; `assessStorage` — pure, so it is tested without a browser —
sorts them into carried and dropped, and recommends a persistent profile when
the dropped material is where a session would live. A service worker is
reported but does not drive the recommendation: it is usually an offline cache.

**`auth save --persistent` signs you into a real profile.** The persistent
context at `~/.ui-atlas/profiles/<name>` keeps everything a browser keeps, and
the directory *is* the save — no export step to get wrong. `--mode profile`
already existed; what was missing was any way to sign in to one, which made it
advice rather than a workflow.

**`auth check <profile> <url>`** opens the URL with the saved profile and
reports the verdict with its evidence, exit 1 for signed out. Ten seconds
instead of twenty minutes and fifty screenshots of a login wall.

### The verdict is three-valued, and the third value is real

| Evidence | Verdict |
| --- | --- |
| a visible sign-out control | `signed-in` |
| a visible password field | `signed-out` |
| the final URL is a sign-in path | `signed-out` |
| a visible sign-in control | `signed-out` |
| none of the above | `unclear` |

A way *out* is the strongest evidence of being *in*, and it deliberately beats a
stray "Log in" link elsewhere on the page. `unclear` is the honest answer for a
page showing neither; rounding it up to signed-in would be the quiet dishonesty
this whole slice exists to remove. A test requires the evidence list is never
empty, whatever the verdict.

### Where the check runs

`AtlasSession.navigate` runs it on the first page that loads, which covers
`inspect` and `capture` for free. `crawl` loads its first seed once before
starting — one page view spent to avoid crawling fifty. It runs only when the
run is using saved auth, because a `clean` run is *expected* to be signed out
and warning about it would teach people to ignore the warning.

The warning goes to the log **and** the run warnings, so `run.json` and the
report carry it too: the person reading the artifacts tomorrow gets the same
sentence as the person who watched it run.

### What this does not do

It does not make UI Atlas better at getting signed in. It still types nothing,
submits nothing and evades nothing. `--persistent` only keeps more of what your
own hands achieved, and a site that blocks automation still blocks it.

## Saying what actually failed (tenth slice)

Done and covered by `tests/integration/doctor.test.ts`. See
[ADR 29](docs/adr/0029-a-page-that-fails-should-say-what-failed.md).

The same message kept coming back from real use:

```
Error: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
Trace ID: -
```

It is the site's own JavaScript — a `fetch` asked for JSON and got an HTML
document — and everything that matters is missing from it: which request, what
the HTML was, and therefore why.

### Why that gap costs an afternoon

Three unrelated causes produce that identical sentence: a bot challenge answered
an API call, the session expired and the API redirected to a sign-in page, or
the endpoint failed behind a friendly error page. The first cannot be fixed by
this tool at all; the second is fixed by re-saving the profile. Telling someone
to sign in again when they are being challenged is a wasted afternoon, and the
message gives no way to tell.

ADR 28 made the sign-in state legible. This makes the network legible, which is
the layer the symptom actually lives in.

### What it reports

`watchPage` attaches to `response`, `requestfailed`, `pageerror` and `console`
before navigation and returns a `stop` the command calls once the page settled.
A response is worth reporting when it is `unauthorised` (401/403/407),
`rate-limited` (429), a `server-error` (5xx), a `request-failed`, or —
the one this exists for — `html-for-json`: a `fetch`/`xhr` request answered with
`text/html`.

`html-for-json` is deliberately **not** conditioned on the status. An edge layer
commonly returns its interstitial with a 200, which is exactly why the failure
is so confusing.

### The body is the answer

`403 fetch https://example.com/api/me` still does not say whether that was a
challenge or a login page. So HTML bodies are read, reduced to their title, and
printed — `body: "Just a moment…"` — and `summarise` (pure, tested without a
browser) turns that into the one sentence needed:

> A bot challenge answered a data request. UI Atlas has no way around that and
> will not get one.

When it matches neither vocabulary it says plainly that HTML came back where
data was expected, and stops, rather than inventing a cause.

### What it refuses to print

Every URL is reduced to origin plus pathname, with a bare `?…` where parameters
were. Tokens and session ids live in query strings, and a diagnostic is
something people paste into chat windows. Only HTML bodies are previewed, never
JSON — a JSON body is the user's data.

It writes nothing at all: no run directory, no captures. It deliberately does
not reuse `AtlasSession`, because a diagnosis has to work on a page too broken
to capture.

### Three things the first real run against grok.com corrected

Running it in anger immediately found flaws in its own output, all three now
fixed and covered:

**Analytics noise buried the finding.** Five `net::ERR_ABORTED` beacons printed
above the one 401 that explained everything. `ERR_ABORTED` and
`ERR_BLOCKED_BY_CLIENT` are now their own `cancelled` kind, ranked last and
listed separately as "rarely the problem".

**It gave advice that was already being followed.** The storage-state guidance
fired while the run was in `--mode profile`, telling the user to use profile
mode. Advice that describes what you are already doing is worse than silence,
because it reads as a finding. It is now suppressed in profile mode.

**A 401 and a "Sign in" button were reported as two facts.** They are one, and
saying so is the difference between a diagnosis and a list. `summarise` now
takes the sign-in verdict and, when both are present, says explicitly that this
is *not* a bot challenge — because ruling that out is what tells the user
re-saving the profile will actually help.

### The trap underneath it

`--mode profile` reads `~/.ui-atlas/profiles/<name>`; the default `auth save`
writes `~/.ui-atlas/storage-state/<name>.json`. Ask for profile mode with only a
storage state saved and `launchPersistentContext` cheerfully **creates** an
empty profile directory — the launch succeeds, and you are signed out with no
indication why.

`savedAuthShape` and `mismatchWarning` now check before launching (after would
be too late: launching is what creates the directory) and say exactly that, in
both directions.

### The check that was not a check

The first fix for the profile/storage-state mixup tested `existsSync` on the
profile directory — and that is worthless, because **`launchPersistentContext`
creates the directory**. Any `--mode profile` run leaves one behind, complete
with Chromium's own scaffolding, so a run that failed *because* the profile was
empty made the next check say everything was fine.

A profile now carries a marker file written by `auth save --persistent`, and
"has been signed in" means the marker is there. Existence is reported
separately, as `profileDirWithoutSignIn`, so the warning can say what actually
happened rather than implying the user never tried:

> the profile directory for "grok" exists but carries no record of a sign-in
> (running --mode profile creates the directory, so an earlier run may have made
> it), but a storage state of that name has been saved…

The marker holds a timestamp and an origin. No cookies, no tokens, no headers.

### What it does not do

It diagnoses; it does not fix. Naming a bot challenge does not get past one, and
this tool will not gain evasion. The most useful thing it can do in that case is
say so in one sentence.

## Being blocked, named and obeyed (eleventh slice)

Done and covered by `tests/integration/signin.test.ts`. See
[ADR 30](docs/adr/0030-a-challenge-is-obeyed-not-worked-around.md).

The grok.com thread ended where these threads end: Cloudflare started serving a
challenge instead of the site. That is not a bug to fix, and the useful work is
entirely in how the tool behaves when it happens.

### A challenge and a signed-out session need opposite responses

Both fail to show you the site. One is fixed by signing in again; the other
cannot be fixed here at all. Reporting a challenge as "signed out" sends someone
round a loop of re-saving profiles that were never the problem — and every
attempt is another automated request against a host that has already said no.

So `probeChallenge` is separate from `judgeSignIn`, runs **first**, and runs in
every browser mode including `clean`: being signed out in a clean run is
expected, being refused entry is not.

### Structure before wording

Detection looks for the challenge's own machinery — `#challenge-form`,
`.cf-browser-verification`, `form[action*="__cf_chl"]` — before it looks at
wording. Markup survives translation; "Just a moment" does not. A test requires
that neither an ordinary page nor a sign-in page is mistaken for a challenge.

### The crawl stops

Fetching the same interstitial fifty more times is worthless as reference
material and is the surest way to turn a soft challenge into a hard block on
your address. A challenged crawl finalises its run — the warning belongs in
`run.json`, where whoever reads the artifacts later will find it — and exits 1
with zero pages. A test asserts exactly that.

### The advice never says "try again"

`CHALLENGE_ADVICE` is one exported list, because the wrong words here are
expensive. It says the profile is not the problem, that repeated attempts make
it worse, that this tool has no evasion and will not be given any, and that
`--mode attach` — driving a browser you launched and signed into yourself — is
the one legitimate route left. A test requires it never advises retrying.

## Attach mode, tested against a browser it does not own (twelfth slice)

Done and covered by `tests/integration/attach.test.ts`.

Attach mode got someone past a Cloudflare challenge for the first time — real
Chrome, real profile, signed in by hand — and it had no tests at all. It is also
the only mode where the context **belongs to somebody else and outlives the
run**, which is exactly the thing worth pinning down.

### A guess, corrected by testing it

The `close()` handler carried the comment *"Never close a browser we did not
start"* directly above a call to `browser.close()`. That reads like a bug, and I
wrote a fix and a commit message claiming it took the user's window down with
the run.

Then I tested it: launch a browser with a debugging port, attach, close the
session, and check. **The window survives with its pages intact** —
`browser.close()` on a CDP connection disconnects rather than shutting down. The
comment and the code agreed after all; only the comment was ambiguous.

The lesson is the ordinary one: the plausible story was wrong, and five minutes
of a real browser settled what an hour of reading could not. The fix that
remained is narrow and correct — close a context only if we created it — and
the behaviour is now pinned by a test that would fail loudly if a future
Playwright changed it.

### A second test premise that was also wrong

`exposeBinding` throws on a name already registered, and this context persists
between runs, so a second attached run looked certain to die on start-up. It
does not: Playwright clears the binding on disconnect. The test now asserts the
outcome — a second attached run starts — which holds whether or not the
registration throws, and the launcher still converts an "already registered"
failure into a warning in case that changes.

### What attach mode now says about itself

Injected scripts go into the user's own context and stay there until it closes,
so the session says so rather than leaving it to be discovered. The
determinism warning was already there and is now asserted.

## Where the files went (thirteenth slice)

Done and covered by `tests/integration/guided-flow.test.ts`. See
[ADR 31](docs/adr/0031-the-panel-can-open-the-folder-but-never-names-it.md).

Steps 1-3 of the guided flow worked. Two things did not.

**The flow stopped one step early.** It ended at "capture", which is where the
*tool's* job ends and where the user's very much does not: they still have to
see what they got and find it on disk. A flow that ends at the moment of least
information is not a flow.

**The panel could not say where anything was saved** — a strange gap in a tool
whose entire output is files. You pressed Capture, something happened somewhere,
and the only way to find out where was to read a terminal you might not be
looking at.

### Five steps

Steps 4 and 5 are **Review** and **Open**. Step 4 does not advance on a timer or
a capture count: it advances when the Output section has actually been looked
at, so the flow follows what the user did rather than what we hoped. Step 5's
sentence switches from the page count to the *run* count, because by then the
question has changed from "what did I get on this page?" to "where is all of
this?".

### An Output section, and two buttons

It lists the most recent files by the name they were written under —
`button--save-changes--hover.png` — with the run-relative folder each sits in.
**Open folder** reveals the run in Finder, Explorer or whatever the platform
uses. **Open report** builds the report from what is captured so far and opens
that instead.

### The one rule that shaped the whole design

**The panel never renders an absolute path.**

The overlay lives in a shadow root with `mode: 'open'`, so everything it renders
is readable by the site it is injected into — one `shadowRoot.textContent` away.
A file name is derived from the site's own content and tells it nothing new.
`/Users/someone/…` would hand a website the user's name and home directory.

`OverlaySession.outputLabel` already carried the comment *"a label, never a
filesystem path"*; this extends that rule to the new surface rather than quietly
making an exception for it. A test reads the whole shadow root and requires both
the output root and any `/Users/`-shaped path to be absent. The absolute path
still reaches the user — printed in the terminal, where they started the run and
where no website can read it.

The same reasoning shapes `output/reveal`: it takes `'folder' | 'report'` and
nothing else. It is the one method in the tool that hands something to the
operating system, and a page that could name the target could name anything. The
opener uses `spawn` with no shell and the path as an argument.

### Making the claim testable

`StartSessionOptions.opener` is injectable, and the harness replaces it with a
recorder. That is what turns "opens the run folder, and **only** ever the run
folder" into an assertion on an exact path, with no window opening during a test
run.

### One stale test premise

`inspector.test.ts` asserted the run label was visible by matching its text. The
label now appears twice — the titlebar as identity, the Output section as the
answer to "where is this saving?" — so the match became ambiguous. The
duplication is deliberate and the locator now names the titlebar.

## A panel that fits (fourteenth slice)

Reported from real use: the panel is too tall to see the bottom of, so the
Output buttons — added in the last slice, and the ones you press *last* — could
not be reached at all.

### Three separate causes

**Eleven sections.** They all render at once, and the sum was taller than a
laptop window. Sections now collapse: the main path (Mode, Element, States,
Capture, Output) starts open, the occasional ones (Viewport, Animation, Queue,
Shortcuts) start closed, and every heading is a real button — keyboard
reachable, `aria-expanded` set — so nothing becomes unfindable by being closed.

**A height that only worked in one place.** `max-height: calc(100vh - 32px)` is
correct while the panel sits at its starting `top: 16px`, and wrong the moment
it is dragged: the limit no longer matches the space below it, so the bottom
goes off screen with no way to scroll to it. It now recomputes from the panel's
own top edge, and on window resize.

**The last action was in the last place.** **📁 Folder** now sits in the title
bar, which never scrolls away, so "where did my files go?" is reachable whatever
the panel is doing. It stops pointer events so pressing it does not start a
drag.

### Two bugs the tests found

A 1px overflow when dragged to the very bottom: the drag clamp used
`innerHeight - MIN_PANEL_HEIGHT` while the height calculation subtracted a 16px
margin, so the two disagreed about where the bottom was. They now share one
constant.

And a worse one: collapsing the Animation section by default meant pressing
**Animation…** rendered its list into something hidden. Eight animation-panel
tests went red, which is exactly right — a button that produces a result you
cannot see is worse than a button that does nothing, because it looks like
nothing happened. Sections now open themselves when content arrives.

## One Start button instead of two terminals (fifteenth slice)

Starting the tool took two terminal windows and, when a site needed signing in,
a third command you could skip without anything failing. The design's answer is
a menu bar extra. Its own staging note is unusually specific about how far the
first pass should go: run the same two commands as child processes, show them as
three rows, change nothing in the engine.

That constraint is the whole design. `apps/launcher` spawns a build and
`ui-atlas inspect` and reads their log lines. No port, no daemon, no second
protocol. Deleting the directory leaves the CLI exactly as it was.

### Three rows, and the third one is the point

Two commands became three rows because there were always three things, and only
two of them ever reported. `npm run build` said it built. `inspect` said it
started. Whether a browser had actually opened with the panel mounted in it was
something you found out by looking at the screen.

The engine row finishes when the session announces its run id; the browser row
finishes when the overlay reports in. A page that blocks script injection is
**not** a failed launch — the window is open and usable — so it lands as a row
noted "no panel" and the launch still succeeds. Reporting that as a failure
would hide a working browser.

### The claim that would have rotted

The design labels the build row "first run only". That is true once, and then it
is the thing that makes the second run after an edit fail confusingly two stages
later. The row is skipped on evidence instead: every output present, and the
last build write newer than the newest source. So it says "first run only",
"sources changed" or "already built", and each of those was checked.

That rule took three attempts, and the last two failures were only visible by
running it against the real tree:

**Directory mtimes miss every edit.** Scanning `packages` and `apps` themselves
seemed cheap and sufficient — writing a file updates its directory's mtime. It
updates its *immediate* directory. Editing `packages/overlay/src/page/toolbar.ts`
never touches `packages`, so every ordinary edit looked current. It walks the
tree now, skipping `node_modules` and `dist`, in four milliseconds.

**Incremental builds are not stale.** Comparing against the oldest output
reported "sources changed" immediately after a successful full build, because
`tsc -b` does not rewrite an output whose inputs did not change — `dist/bin.js`
was twenty minutes older than the build that had just finished, correctly. The
question worth asking is when a build last did any work, which is the *newest*
output.

Writing the test for the row also found the bug underneath it: `buildNeeded`
arrived only on the `start` event, so the cold card — which is drawn *before*
Start — promised "about 40 seconds the first time" on every launch forever. It
has its own `build-checked` event now, fired when the popover opens.

### A sign-in step, and one card with no buttons

`auth check` already knew the saved session was dead. It had nowhere to say so,
and the failure surfaced twenty minutes later as a stack of screenshots of a
login wall. The launcher stops the sequence on that verdict and asks.

The card that matters most is the one with nothing to press. A signed-out
session and a host refusing the browser look identical from outside and need
opposite responses — signing in again is the fix for one and the worst possible
move against the other (ADR 30). So the challenge card offers neither "Sign
in…" nor "Capture anyway". Inventing a button there would be the tool lying
about what it can do.

Building the sign-in card exposed a second version of the same mistake: the
popover header hardcoded "Page is signed out" for *every* verdict, so a
challenged host was being announced as a sign-in problem — precisely the
confusion ADR 30 exists to prevent. The title now comes from one function, and a
test asserts the header and the card cannot disagree.

### One flag in the CLI

`auth save` waited on Enter, and a GUI has no stdin to press it on.
`--wait-for-signin` watches the page instead and saves when it reads as signed
in — which is what the design describes. It only observes; nothing is typed or
submitted, exactly as before. The interactive path is untouched, including its
second Enter gate before saving a session that still looks signed out.

### What the popover refuses to say

The design's mock reads "Signed in as reviewer@acme.com". UI Atlas never learns
an account name, so the row names the profile it loaded. The expiry underneath
*is* knowable — it is written in the saved storage state — so that one is shown,
read from the cookies' own `expires` fields and nothing else in the file. Same
for the mock's `port 7333`: there is no port, so the row shows the run id.

### Where the seams are

Every decision is pure and unit-tested — the state machine, the sign-in wording,
the build decision, the popover model — and the renderer draws the model with no
conditions of its own. Fifty-two tests, and the log-line patterns are asserted
against lines generated by the real logger, so rewording a CLI message fails a
test rather than leaving the launcher stuck on "Starting engine…".

What is *not* covered: nothing drives the rendered Electron window, so a change
that broke only the drawing would pass. That is recorded in `docs/limitations.md`
rather than implied away.

## Capturing the page you are already on (sixteenth slice)

Design turn 6's third stage: an extension, so the page you are looking at can be
captured without retyping its URL somewhere else. Its staging note says it
"needs only a local connection to the already-running engine" — and the launcher
from the last slice deliberately had no such connection, because not having one
is what let stage one ship without touching the engine.

So the whole slice is that connection, and the interesting decision is its
shape.

### The obvious answer, and why not

The design's mock shows `port 7333`. A localhost port is reachable by every page
in every browser on the machine, and the guards you would put in front of it are
weak: CORS does not stop a request being *made*, only read, and the capture
would already have started. A token fixes that, and the extension has no private
way to learn one — anything it can read, a page can be made to read.

`~/.ui-atlas/launcher.sock`, mode 0600, is reachable by nothing that runs in a
page. The check is the kernel's rather than a string compare in our code, and
the directory is already 0700 because it holds saved sessions.

Chrome will not talk to a socket, so a relay translates its length-prefixed
stdio protocol to newline-delimited JSON. Chrome spawns that relay itself, and
only for an extension whose id is in the host manifest. Two gates, neither ours.

The relay holds no state and validates nothing — it forwards bytes and lets the
launcher parse them. Two parsers would eventually disagree, and the one that
disagreed quietly would be the security hole.

### What the extension is allowed to say

Four methods, and none of them names a path, a command, a flag or a profile. It
can ask for status, start, stop, or capture a URL in one of three modes. The URL
is schema-validated as http(s) and then passed as a single argv element, so a
host with a space or a quote in it stays one argument.

The three modes map to `inspect`, `capture` and `crawl` — a mapping that lives
on this side of the socket. Which meant the third stage row could no longer be
called "Open browser with panel": two of the three never mount a panel, and one
of them is a crawl. The row is named from the command now.

### The one-line CLI change underneath it

Only `inspect` printed `run <id> → <dir>`, and the launcher watches for that
line — so Page and Whole site had nothing to watch. Both commands print it now,
same format, same position. That is independently worth having: a crawl is the
longest thing this tool does, and knowing where it is writing before it finishes
matters most there.

### Two things the tests found

A rejected request came back as `id: "unknown"`, because validation fails before
the id can be read — so a client with two requests in flight learned only that
*something* had been refused. Rejections now carry the id when the line had a
usable one.

And the sign-in state gave contradictory advice: a caption reading "answer this
in the menu bar first" beside an enabled Start button, which would relaunch and
ask the same question again. Start is disabled while a question is open.

### What is not verified

Chrome cannot be driven from this suite. Everything up to it is: the framing,
the relay as a real subprocess against a real socket, the validation, and every
decision the popover makes. Chrome reading the host manifest, checking the id
and rendering the popup has been built to spec and reasoned about, but not
executed here. That is in `docs/limitations.md` rather than implied away.

## The panel that never drew itself (seventeenth slice)

Reported from real use, in three words: hitting Start did nothing.

It was not Start. Driving the same code path over the extension socket worked
perfectly — cold, starting, running — and clicking the real button through the
debugger worked too, once there *was* a button. The popover was empty. `#panel`
had zero children.

### One dropped message

The launcher pushed state once at startup, and `webContents.send` to a page
that has not finished loading is dropped silently. Nothing re-sent it, so the
panel stayed blank until some later event happened to change state. Open the
menu bar in the first seconds after launching — which is exactly what you do
after running `npm run launcher` — and there is nothing to press.

The renderer asks now, with a `hello` on load, instead of being told. Asking is
reliable in a way that being told is not: the renderer knows when it exists and
the main process only guesses. `did-finish-load` pushes as well, to cover a
reload replacing the page and its listener.

### The gap that was recorded, and then happened

`docs/limitations.md` said it plainly: every decision the popover makes is
unit-tested, but nothing drove the rendered window, so a change that broke only
the drawing would pass. That is precisely the bug that shipped.

So the fix comes with the missing test. It launches Electron with its own
user-data directory and its own socket — so it cannot collide with a launcher
already running, or steal its socket — attaches over CDP, and asserts the panel
paints itself without being touched. Removing either half of the fix makes it
fail with `expected 0 to be greater than 0`, which is the bug exactly.

It evaluates JavaScript rather than moving a pointer, so it proves the popover
draws and its handlers are wired, not that the window is on screen where you can
click it. Nothing clicks the tray icon; that is still recorded as uncovered.

## Where this leaves the project

**The brief is delivered.** Phases 0 through 4 are complete and every item on the
brief's own list is built, including the Animation button that had been disabled
since phase 1. The eighth slice is usability work on top of a delivered brief,
driven by what the first real external run felt like to use.

Design turn 6 is delivered in full. The fifteenth slice is the first surface
outside the CLI — a menu bar launcher covering stages one and two — and the
sixteenth adds the extension, which is stage three. What remains unbuilt there
is signed Web Store packaging; the extension is loaded unpacked.

Anything further is new scope rather than an unfinished milestone:

- a `relink` command, so renaming a file by hand could update `captures.jsonl`,
  the sidecar and the index together instead of the index warning about it
- perceptual near-duplicate hashing (the report groups by exact image hash today)
- sitemap seeding, and dedup by page structural fingerprint
- `captureResponsive` during a crawl (the step validates and reports that it was
  unavailable)
- signed Web Store packaging of the extension (it loads unpacked today),
  distributed workers, CDP forced pseudo-states

The environment-bound gap recorded under Exit criteria is **closed on a
networked machine**: the three external-site smoke tests ran and passed against
example.com, wikipedia.org and developer.mozilla.org during the sixteenth slice.
They still skip themselves in a sandbox with no outbound browser network
access, which is the behaviour that was always intended.
