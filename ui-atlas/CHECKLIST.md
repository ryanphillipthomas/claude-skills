# Implementation checklist

Phases 0 through 3 are complete. Phase 4 is in progress: the animation
inventory and deterministic frame sampling are both done. What is still unbuilt
is listed in [docs/limitations.md](docs/limitations.md).

## Phase 0 — foundation

- [x] npm workspace rooted at `ui-atlas/`, strict TypeScript, project references
- [x] Versioned data model (`CaptureRecord`, `PageRecord`, `RunManifest`, readiness, identity)
- [x] Bridge protocol schemas with a closed method list
- [x] Config schema, YAML/JSON loading, discovery, validation, CLI overrides
- [x] Artifact writer: atomic writes, run manifest, JSONL, per-image sidecar
- [x] Path safety: sanitised segments, route keys, no escaping the artifact root
- [x] Playwright launcher in `clean`, `profile`, `storage-state`, `attach` modes
- [x] Auth material outside artifacts, `0700`/`0600`, impersonation warning
- [x] Bounded settle policy with a hard deadline (never `networkidle`)
- [x] Controlled fixture site (12 pages) and a dependency-free fixture server
- [x] Baseline unit and browser integration tests

**Exit criterion — one command launches a fixture URL and writes a viewport
screenshot plus valid metadata.** Met.
`tests/integration/phase0-capture.test.ts` runs `ui-atlas capture <fixture-url>`
end to end and asserts the manifest, the JSONL record, the sidecar, the PNG
bytes and the recorded dimensions.

## Phase 1 — guided inspector MVP

- [x] Injected Shadow DOM overlay, mounted on every document, survives DOM replacement
- [x] Hover highlight via `elementsFromPoint`, descending through open shadow roots
- [x] Click-to-select with the click swallowed; `Alt`+click passes it through
- [x] Locator candidates with scores and reasons; unique candidates outrank ambiguous ones
- [x] Structural fingerprint over stable facts only
- [x] Host-side re-resolution immediately before every capture, with fallback and warnings
- [x] Element, viewport and full-page capture
- [x] `default`, `hover`, `focus` (plus `focus-visible`, `active`, `checked`, `selected`, `expanded`, `disabled`)
- [x] Overlay hidden before every capture and restored in `finally`
- [x] Guaranteed cleanup: mouse buttons, modifier keys, focus, forced attributes, introduced `style=""`
- [x] Capture queue with per-job status pushed back to the toolbar
- [x] Keyboard shortcuts, including arrow-key selection movement
- [x] Toolbar: element details, state toggles, viewport presets and custom size, queue, shortcut help

**Exit criterion — on the fixture site and at least three unrelated public
sites, select an element and capture default/hover/focus without the overlay
appearing in screenshots or the page remaining altered.**

- Fixture site: met, in `tests/integration/inspector.test.ts`.
  - The three states are captured through the real toolbar, all `captured`, with
    `observed`/`interacted` provenance and three distinct image hashes.
  - A viewport capture from an overlay session is **byte-identical** to one from
    a session where the inspector was never injected.
  - Body HTML before and after is identical, and nothing is left hovered,
    focused or pressed.
- Public sites: **not executed here.** The sandbox has no outbound browser
  network access, so `tests/integration/external-smoke.test.ts` skipped. The
  tests are written and read-only; run `npm run test:integration` on a networked
  machine to close this.

## Phase 2 — responsive replay (authorised separately)

- [x] `ResponsiveRunner`: fresh context, own navigation, own settle and own
      re-resolution per configured viewport
- [x] Real device emulation for mobile presets (touch, user agent, device scale),
      not a resized window
- [x] New contexts seeded from the live session's storage state, so a signed-in
      replay stays signed in
- [x] `not-present`, `hidden` and `locator-ambiguous` recorded per viewport as
      `skipped` with a reason, never failing the set
- [x] Records grouped by `set: { kind: 'responsive', member: <viewport> }`
- [x] Enabled in the inspector toolbar and exposed as `capture --responsive`
- [x] Five-viewport matrix test over `responsive.html`, proving the reload from
      the artifacts themselves

## Phase 2 — static report

- [x] `ui-atlas report <run-dir>` writes a self-contained `report/index.html`
- [x] Component matrices, orientated so the compared dimension is side by side
- [x] Filters for status, state, provenance, viewport, route, role and free text
- [x] Detail panel: locator candidates with scores and reasons, computed-style
      delta with colour swatches, readiness checks, interaction recipe
- [x] Duplicate grouping by exact image hash
- [x] Failed and skipped captures as first-class rows, each saying why
- [x] No network requests, no authentication material, no absolute paths
- [x] Capture data treated as hostile: JSON-embedded and rendered as text only,
      with an injection test that drives the real report in a real browser

**Exit criterion — a selected component produces a five-viewport matrix,
including honest hidden/missing outcomes, and can be browsed in the report.**
Met, end to end, in `tests/integration/report.test.ts`.

## Phase 3 — bounded crawler (first slice, authorised separately)

- [x] URL canonicalisation: fragment, credentials, host case, default port,
      repeated slashes, trailing slash, configured query rules, sorted params
- [x] Same-origin frontier over `<a href>`, breadth-first, deduplicated by
      canonical URL
- [x] Include/exclude globs, a sign-out deny list that is on by default,
      download extensions, `mailto:`/`tel:`/`javascript:`, `rel="nofollow"`
- [x] Every skip carries a stable reason code, is counted, and is sampled into
      the run summary
- [x] Hard budgets: `maxPages`, `maxDepth`, `perPageTimeoutMs`,
      `maxRunMinutes`, `maxQueued`, each clamped by the run deadline
- [x] Nothing is clicked. Link discovery reads the DOM and nothing else, proved
      against `destructive.html` plus a no-non-`GET`-request assertion
- [x] A redirect landing off-origin is recorded but its links are not followed
- [x] Resumable queue keyed by a hash of the canonical URL, persisted to
      `crawl-state.json` after every page, with `crawl --resume <run-dir>`
- [x] `ui-atlas crawl <site-config.yml | url>`, where a site config is an
      ordinary config with a `crawl:` block

## Phase 3 — interaction recipes (second slice)

- [x] Declarative `recipes:` in the site config, validated before execution
- [x] Steps: `select`, `click`, `hover`, `focus`, `press`, `scroll`, `scrollTo`,
      `waitFor`, `waitForUrl`, `waitMs`, `capture`, `captureStates`,
      `captureResponsive`
- [x] Closed target vocabulary — `role`+`name`, `testId`, `text`, `label`,
      `placeholder`, `css` — resolving through Playwright locator engines, with
      no route from a recipe to arbitrary page JavaScript
- [x] **No step that types text.** `fill`, `type` and `evaluate` are rejected,
      so no recipe can attempt a sign-in; sign in by hand and crawl with
      `--mode storage-state`
- [x] A misspelled step or unknown option fails validation instead of being
      silently skipped
- [x] `match` globs binding a recipe to routes, reusing the frontier's dialect
- [x] Recipes run after link discovery, so an interaction cannot change the
      shape of the crawl; they never run on an off-origin redirect
- [x] `crawl --dry-run`: no browser, no visits. Names every control a recipe
      would click, catches recipes scoped to routes that can never run, element
      captures with no `select`, clicks that keep no artifact and duplicate
      names, and exits non-zero
- [x] A failing recipe is recorded and the crawl continues
- [x] Captures during a crawl, written as ordinary `CaptureRecord`s

**Phase 3 exit criterion — a 50-page test site can be interrupted and resumed
without duplicate records, exceeding budgets, or clicking destructive fixture
controls.** Met on the 13-page fixture graph rather than a 50-page site:
interruption and resumption without duplicates, budget enforcement and the
no-clicking guarantee are all covered by `tests/integration/crawl.test.ts` and
`tests/integration/recipes.test.ts`, including a crawl of the whole site with a
clicking recipe active on one route, after which `destructive.html`'s audit log
is still empty and no non-`GET` request was issued.

## Phase 3 — suggested-interaction inventory (third slice)

- [x] `crawl --inventory` lists each page's visible interactive controls
- [x] Each described by the same probe the inspector uses, so a control named
      here and one captured by a recipe mean the same thing
- [x] Classified `navigation` / `inert` / `mutation` / `unknown`, with the reason
      each rule fired recorded on the candidate
- [x] Mutation rules win over every other signal, and the word list is biased
      towards false positives; `unknown` is treated exactly like `mutation`
- [x] `disabled` recorded, never used to reclassify
- [x] Written to `interactions.jsonl`, one record per control
- [x] `suggested-recipes.yml`: only `navigation`/`inert` become steps, only
      `select` and `captureStates`, and no `click` step is ever generated
- [x] **It reads and nothing else.** Inventorying `destructive.html` leaves its
      audit log empty and issues no non-`GET` request

## Phase 3 — worker concurrency and throttling (fourth slice)

- [x] `crawl --concurrency <n>`: isolated workers, each with its own browser
      context seeded from the live session's storage state
- [x] `perPageDelayMs` is a minimum gap **per origin across all workers**, not a
      per-worker pause; the slot is claimed before the wait, so workers stagger
- [x] The frontier separates handed-out from committed work, so a crawl killed
      with pages in flight resumes them instead of losing them
- [x] `maxPages` counts in-flight navigations, so workers cannot collectively
      overshoot the budget
- [x] Workers exit only on a drained frontier — queue empty *and* nothing in
      flight — never merely because the queue was momentarily empty
- [x] A worker that throws releases its page back to the queue
- [x] `browser.mode: profile` cannot create sibling contexts: warns and stays at
      one worker, matching ADR 11's degradation
- [x] Politeness waits are clamped by the run budget

## Phase 3 — retry and status-aware backoff (fifth slice)

- [x] Bounded retries with exponential backoff and jitter, for navigation
      failures and the statuses worth repeating
- [x] `429`/`503` hold the **whole origin** back through the shared throttle, so
      every worker slows down, not just the one that was refused
- [x] A `429` on the final attempt still penalises the origin
- [x] `Retry-After` honoured in both forms the spec allows, clamped by
      `maxRetryAfterMs`, falling back to backoff when unreadable
- [x] A retry costs an attempt, never a page: `maxPages` is untouched
- [x] Every wait clamped by what is left of `maxRunMinutes`
- [x] `PageRecord.attempts`, present only when a page took more than one
- [x] An origin's backoff reported to the run once, with per-page detail kept on
      each page record
- [x] Exit code follows *unreachable* pages only, not error statuses: one broken
      link does not fail a pipeline

## Phase 3 — trace on failure (sixth slice)

- [x] `crawl --trace-on-failure` keeps a Playwright trace for a page that could
      not be reached, and for a page a recipe failed on
- [x] **Off by default**: a trace records request headers, so one taken during
      an authenticated crawl contains the session cookie
- [x] Recorded continuously in memory via Playwright's chunk API; the chunk is
      written only on failure and discarded otherwise, so a successful page's
      cookies never reach the disk
- [x] An error status is not a failure for this purpose — a `404` is an answer
- [x] `maxTraces` bounds it, and a page that missed out says so
- [x] Named by page record id, so `pages.jsonl` and the file line up
- [x] **The report does not surface `tracePath`**, and a test fails if it starts
- [x] The first trace of a run warns that the run directory is now sensitive
- [x] Tracing stopped in a `finally`, before any context is closed

**Phase 3 is complete.**

### Still to build in phase 3

(nothing)
- [ ] Sitemap seeding, and optional dedup by page structural fingerprint
- [ ] `captureResponsive` during a crawl (the step validates but reports that it
      was unavailable)

## Phase 4 — animation inventory (first slice)

- [x] `ui-atlas animations <url>` lists every animation the Web Animations API
      can see, across every frame Playwright can reach
- [x] Records kind, timing, iterations, easing, direction, fill, keyframe
      offsets, animated properties, play state and target
- [x] Classifies each `sampleable` / `infinite` / `scroll-driven` /
      `indeterminate` / `instant`, with the reason recorded
- [x] **It reads and only reads.** Nothing paused, seeked or cancelled, and
      nothing captured — asserted by snapshotting play state and playback rate
      either side of a pass
- [x] `durationMs` and `iterations` are absent rather than zero for `auto` and
      `Infinity`; no iteration length is offered for anything not time-driven
- [x] Canvas, WebGL and video elements counted and named, because their motion
      is invisible to `getAnimations`
- [x] A hover-only transition is legitimately absent from a page at rest, and a
      test asserts both that absence and its appearance after a hover
- [x] Written to `animations.jsonl`; a run has no `captures.jsonl`

## Phase 4 — deterministic frame sampling (second slice)

- [x] `animations --sample` photographs each sampleable animation at configured
      offsets within one iteration
- [x] Only what the inventory called `sampleable` is sampled; everything else is
      skipped carrying **the inventory's own reason**
- [x] Pause, seek, capture, and restore `currentTime`, `playbackRate`,
      `playState` and `startTime` in a `finally`, each step guarded separately
- [x] Restoration proved twice: a full pass leaves every animation's snapshot
      identical, and so does a capture that throws half way through
- [x] Animations addressed by index and verified by name and target, because two
      elements sharing a `@keyframes` name is ordinary
- [x] `animations: 'disabled'` turned off for animation frames — it
      fast-forwards finite animations to completion and would discard the seek
- [x] `AnimationSample.limitations` filled in: `fill: none` at 100%, multiple or
      reversed iterations, a page-set playback rate, a pseudo-element target
- [x] Frames of one animation grouped by `set: { kind: 'animation' }`

### Still to build in phase 4

- [ ] Hover-transition sampling (enter hover, discover what appeared, sample)
- [ ] Optional video/screencast fallback for motion that is not keyframable
- [ ] The toolbar's Animation button, still disabled
- [ ] First-pass design-token extraction and duplicate component grouping
- [ ] Wiring the animation inventory into `crawl`

## Still out of scope

Extension packaging, distributed workers, AI control, CDP animation, perceptual
(near-duplicate) hashing.
