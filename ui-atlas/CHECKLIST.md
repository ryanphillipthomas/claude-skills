# Implementation checklist

Phases 0 through 4 are complete. Phase 4 shipped in six slices: the animation
inventory, deterministic frame sampling, provoked (hover/focus) motion, the
screencast fallback, observed-value extraction, and the animation inventory
during a crawl. What is still unbuilt is listed in
[docs/limitations.md](docs/limitations.md).

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
      `captureResponsive`, `captureAnimation` (added in phase 4)
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

## Phase 4 — provoked motion (third slice)

- [x] `captureAnimation` recipe step: inventory, provoke, inventory, and the
      difference is what that interaction started
- [x] `hover` and `focus` only — the step **cannot click**, asserted against
      `destructive.html`'s audit log
- [x] The diff identifies an animation by what it is, not by index or id, and
      compares as a multiset so duplicates are not collapsed
- [x] Every member of a group is paused first, then all are seeked to the *same
      absolute time* and photographed once
- [x] `progress` is a fraction of the interaction's span, and a member that ends
      earlier says so in `limitations`
- [x] Offsets are seeked in ascending order, because a finished CSS transition
      leaves `getAnimations()` and a backwards seek then shows the wrong moment
- [x] Animations restored, *then* the provocation released, so the transition
      running backwards is never photographed
- [x] Release runs in a `finally`, so a capture that throws still lets go
- [x] Only the provoked group is frozen; the page's own animations keep running
- [x] The provoked animations are written to `animations.jsonl`

## Phase 4 — the screencast fallback (fourth slice)

- [x] `animations <url> --video` records the motion no seek can reproduce:
      `infinite` and `indeterminate` animations, and canvas/WebGL/video elements
- [x] **A recording carries no `progress`.** An `animation-video` record has no
      `AnimationSample` at all, because there is no honest progress for motion
      that never ends
- [x] Scroll-driven animations are refused with their reason: nothing scrolls
      during a recording, so the video would be a still that looks like a failure
- [x] Its own short-lived browser context, because Playwright records a context
      and only writes the file on close; `leadInMs` reports what that costs
- [x] Hard bounds: `maxDurationMs` with `truncated` when it bites, and `maxBytes`
      checked by `stat` before the file is read
- [x] Over budget is a `skipped` record with `capture.over-budget`, never a
      silent absence
- [x] No frame rate is written, because Playwright does not expose one
- [x] The scratch directory lives inside the run and is removed either way
- [x] Metadata sidecar beside the recording, as beside a screenshot
- [x] The report plays it where a thumbnail would go, with controls only in the
      detail panel

## Phase 4 — observed-value extraction (fifth slice)

- [x] `ui-atlas tokens <url> [more urls...]` reads every element's computed
      style and counts what turns up
- [x] `crawl --tokens` scans every page a crawl visits into one artifact,
      because a design system is not visible from one page
- [x] **Candidates, not tokens.** No `name` field anywhere, asserted by a test;
      `tokens.json` carries a note saying so in the artifact itself
- [x] Values that mean nobody decided anything are dropped in the page
- [x] Colours separated by use — text, background, border — rather than gathered
      by type; candidates keyed by category *and* kind
- [x] Opaque colours normalised to hex, alpha preserved, sub-pixel lengths
      rounded to 0.1px, font stacks collapsed to one comparable string
- [x] Near-duplicates reported and never merged, and only at the same opacity
- [x] Both caps — per-page elements and per-category tail — add a warning naming
      what was left out
- [x] The report's **Values** tab, with a swatch guarded by shape rather than
      trusted: the only capture-derived string that reaches a style attribute
- [x] Read-only: a test snapshots the DOM, focus and scroll either side of a scan
- [x] Duplicate component grouping across routes — already worked, since
      `groupComponents` keys by structural fingerprint with no route in the key

**Phase 4 is complete.**

## Phase 4 — the animation inventory during a crawl (sixth slice)

- [x] `crawl --animations` runs the same inventory on every page, into
      `animations.jsonl`, keyed by route
- [x] It describes and nothing else: no pausing, no seeking, no capture, proved
      by the infinite fixture animation still reading `running`
- [x] Needs no probe injected, unlike an element capture
- [x] Runs before recipes, so it describes the page as served
- [x] Per-page cap, reported on the page record it is about
- [x] Run-level cap, raised once in the run warnings rather than buried on
      whichever page tripped it
- [x] The unobservable-motion notice aggregated across the crawl and raised once
      with a route count, instead of once per page

## Phase 4 — the toolbar's Animation panel (seventh slice)

- [x] The Animation button **lists** rather than captures: which animation you
      mean is a question only a list can answer, and most cannot be sampled
- [x] Each row gets the one action that would work — `Sample`, `Record`, or
      neither with the inventory's own reason. No row is a dead end
- [x] Scroll-driven and instant animations are offered nothing, with the reason
- [x] Canvas, WebGL and video counted and named, with `Record the page`
- [x] Listing is a read: nothing paused, seeked or captured, asserted by a test
- [x] Re-found by fingerprint at capture time, not by the index it was listed
      at, so a page that changed yields "no longer running" not the wrong frame
- [x] `Alt`+`A` opens the panel, for the same reason the button does
- [x] `capabilities.animation` is true; one new bridge method,
      `animation/inventory`, and `CaptureRequest.animationId`

**The brief is delivered through phase 4.**

## Usability — flow, buttons and file names (eighth slice)

Asked for after the first real external run: the shortcuts were hard, there was
nothing telling you what to do, and the output was a wall of `cap-7f3a91.png`.

- [x] Filenames derived from the record itself: `button--save-changes--hover.png`
      from the element's role, accessible name and applied state
- [x] Nothing invented — a capture with no name gets a **shorter** name, never a
      guessed one, and no image leaves the machine
- [x] Animation frames zero-padded (`frame-000`…`frame-100`) so a listing sorts
      in the order the frames happen
- [x] `--` separates parts, `-` separates words: `sanitizeFileStem` keeps the
      boundary that `sanitizeSegment` would collapse
- [x] Collisions get `-2`, `-3` from a registry the writer owns, re-seeded from
      `captures.jsonl` on resume so a restart cannot overwrite earlier captures
- [x] `index.md` at the run root and in each route folder, listing every file
      with a sentence saying what is in it
- [x] Captures that produced no file listed too, under "Not captured here", with
      the reason
- [x] Both indexes say plainly that renaming does not update `captures.jsonl`
      or the sidecar
- [x] An unwritable index is a run warning, never a failed run
- [x] A flow line at the top of the panel that changes with state, from a pure
      `nextStep` function
- [x] Three numbered steps, with the instructions panel marking the current one
- [x] The capture button's states named in the flow line, so Capture is never a
      surprise
- [x] Progress while the queue is busy, and a "keep going" line with a count
      once something has been captured on this page
- [x] Tree navigation (parent / child / previous / next) as buttons; the arrow
      keys are now a shortcut for a visible control, not the only way in
- [x] The count follows single-page-app route changes rather than going stale

## Authentication that fails loudly (ninth slice)

Saved sign-ins kept failing the same way: `auth save` reported success, every
page returned 200, and the artifacts were of a signed-out site.

- [x] `auth save` probes the signed-in page for IndexedDB, sessionStorage and
      service workers — the things `storageState()` silently drops
- [x] It says which mode this site needs, and gives the command to fix it
- [x] `auth save --persistent` signs you into a real browser profile, which
      keeps everything a browser keeps; the directory is the save
- [x] `auth save` will not save over a signed-out page by accident — it says so
      and asks for a second Enter
- [x] `auth check <profile> <url>` reports signed-in / signed-out / unclear with
      evidence, exit 1 for signed out so it can gate a script
- [x] The mode is inferred from what is on disk, so a good profile is never
      reported signed out because the wrong mode was guessed
- [x] A sign-out control beats a stray "Log in" link — a way out is the
      strongest evidence of being in
- [x] `unclear` is a real verdict, not rounded up to signed-in
- [x] Every verdict carries its evidence, asserted by a test
- [x] The check runs on the first page of every run using saved auth, into the
      log *and* the run warnings, so `run.json` carries it too
- [x] `clean` mode is never checked — it is expected to be signed out

## Saying what actually failed (tenth slice)

`Unexpected token '<', "<!DOCTYPE "` is the site's own error, and it names
neither the request nor what came back — so a bot challenge and an expired
session look identical.

- [x] `ui-atlas doctor <url>` watches a page load and reports the requests that
      were refused, failed, or answered with HTML where data was asked for
- [x] `html-for-json` is not conditioned on the status: an interstitial commonly
      returns 200, which is exactly why the failure is confusing
- [x] HTML bodies read down to their title, because the body is what identifies
      a challenge versus a login page
- [x] One-sentence conclusion naming which, or plainly declining to name one
- [x] The page's own error printed verbatim, beside the request that caused it
- [x] Query strings stripped from every URL; JSON bodies never previewed
- [x] Writes nothing — no run, no captures. Exit 1 when it found something
- [x] Fixture reproducing the real failure: a 200 document whose fetch receives
      text/html and throws

### Corrected by the first real run

- [x] `ERR_ABORTED` / `ERR_BLOCKED_BY_CLIENT` demoted to a `cancelled` kind,
      ranked last and listed separately — beacons were burying the real finding
- [x] Storage-state advice suppressed in profile mode; telling someone to do
      what they are already doing reads as a finding
- [x] A 401 plus a sign-in control reported as one fact, explicitly ruling out
      a bot challenge
- [x] `--mode profile` with only a storage state saved now warns before
      launching — `launchPersistentContext` creates the empty directory, so
      after would be too late

- [x] "Has this profile been signed in?" answered by a marker written at save
      time, not by `existsSync` — launching is what creates the directory, so
      the obvious check was no check at all
- [x] The warning distinguishes "never signed in" from "directory left by an
      earlier run", so it does not imply the user never tried

## Being blocked, named and obeyed (eleventh slice)

- [x] `probeChallenge` separate from the sign-in check and run first — a
      challenge and a signed-out session need opposite responses
- [x] Runs in every browser mode, including `clean`: being signed out in a clean
      run is expected, being refused entry is not
- [x] Structural markers before wording, so a translated interstitial is still
      recognised
- [x] Neither an ordinary page nor a sign-in page mistaken for a challenge
- [x] A challenged crawl stops before crawling, finalises the run so the warning
      lands in `run.json`, and exits 1 with zero pages
- [x] `doctor` names a challenge served as the document itself, not only as the
      answer to a data request
- [x] One exported advice list that never says "try again", and says plainly
      that this tool has no evasion and will not be given any

## Attach mode, tested (twelfth slice)

- [x] The attached browser survives the run — verified against a real browser
      with a debugging port, not assumed from the docs
- [x] A context is closed only if we created it; the user's is never ours
- [x] The browser's own context is used, since a fresh one would have none of
      the cookies that are the entire reason to attach
- [x] A second attached run starts rather than dying on a duplicate binding
- [x] Injected scripts declared as outliving the run, because the context is
      not ours to clean up
- [x] `doctor` no longer offers storage-state advice in attach or profile mode
- [x] `unclear` with no refused requests and no challenge says so, instead of
      reading as a problem

## Where the files went (thirteenth slice)

Steps 1-3 worked; the flow stopped at the moment of least information, and the
panel could not say where anything was saved.

- [x] Five steps, not three: **Review** (see what was written) and **Open**
      (reveal it on disk) are where the user's job actually ends
- [x] Step 4 advances when the Output section has been *looked at*, not on a
      timer or a capture count
- [x] Step 5 switches from the page count to the run count, because the question
      has changed from "what did I get here?" to "where is all of this?"
- [x] An **Output** section listing the most recent files by the name they were
      written under, with the run-relative folder each sits in
- [x] **Open folder** reveals the run in Finder / Explorer / the file manager
- [x] **Open report** builds the report from what is captured so far and opens it
- [x] The panel never renders an absolute path — the overlay is injected into
      the site and its shadow root is readable, so a path would leak the home
      directory. The terminal gets it instead
- [x] `output/reveal` takes a closed enum, never a path: it is the one method
      that reaches the operating system
- [x] `spawn` without a shell, path as an argument, so a directory with a space
      or a quote in it is just that
- [x] The opener is injectable, so "opens the run folder, and only ever the run
      folder" is a test rather than a comment
- [x] A platform with no opener says so and prints the path, rather than failing

- [x] Sections collapse, main path open and occasional ones closed, every
      heading a keyboard-reachable toggle
- [x] **📁 Folder** in the title bar, which never scrolls away however tall the
      panel is or wherever it is dragged
- [x] The panel recomputes its height from its own top edge, and on resize —
      `max-height: calc(100vh - 32px)` was only correct at the starting position
- [x] The drag clamp and the height calculation share one margin; a 1px overflow
      when dragged to the bottom was caught by a test
- [x] A section that receives content opens itself, so a button never produces a
      result the user cannot see

## A panel the size of what you are doing (fifteenth slice)

Measured first: the panel was 970px of a 1000px window, and 274px of that was
the instructions block.

- [x] Four tabs — Capture, Viewport, Animation, Output — one rendered at a time
- [x] The whole main loop (Mode, Element, States, Capture) in the first tab: a
      tab boundary inside select-then-capture would be worse than scrolling
- [x] Instructions collapsed by default; the flow line already says what to do
- [x] One collapse mechanism, not two — the heading is the toggle, and the inner
      Hide/Show button that duplicated it is gone
- [x] Default height ~370px instead of the whole window, with a drag handle on
      the bottom edge for when you want more
- [x] A compact toggle in the title bar: flow line plus the capture buttons,
      ~220px. The capture row is **moved**, not copied, so there is only ever
      one of it
- [x] A tab that receives content brings itself forward, for the same reason a
      collapsed section opens itself

## Launcher — one Start button instead of two terminals (design turn 6)

- [x] `npm run launcher` — a menu bar extra with a popover, no terminal left open
- [x] Three rows for what used to be two commands and one unreported outcome:
      build, capture engine, browser with the panel actually mounted
- [x] The build row is skipped on evidence — outputs present *and* no source
      newer — so "first run only" cannot rot into a lie
- [x] That check runs when the popover opens, not only on Start; otherwise the
      cold card promises a 40-second first run forever
- [x] Each finished row reports its own elapsed time; the running row reports
      whatever the process said about itself
- [x] `Show log` is the output the two terminals used to print, unfiltered
- [x] Cancel while starting, Stop while running; closing the browser window ends
      the session without reporting a failure
- [x] Sign-in is a step with three answers, not a warning nobody reads
- [x] A challenge gets a different card with no way past it — ADR 30
- [x] `auth save --wait-for-signin`, because a GUI has no stdin to press Enter on
- [x] The popover names the profile it loaded, never an account name it cannot
      know; the expiry beside it is read from the saved state's own cookies
- [x] Recent runs, each opening its folder, with a Report link only where a
      report exists
- [x] Node comes from Electron with `ELECTRON_RUN_AS_NODE`, so a launch from
      Finder does not depend on a PATH it did not inherit
- [x] Every decision is pure and unit-tested; the renderer draws the model and
      has no conditions of its own

## Browser extension — capture the page you are already on (design 6c)

- [x] MV3 extension with a popover: Element / Page / Whole site, mapping to
      `inspect`, `capture` and `crawl`
- [x] A unix domain socket at mode 0600, not a localhost port — a port is
      reachable by every page in every browser on the machine
- [x] Chrome reaches it through a native messaging host it spawns itself, and
      only for one allowlisted extension id: two independent gates
- [x] The relay forwards bytes verbatim and validates nothing, so there is one
      idea of what a valid request is rather than two
- [x] Four methods, none of which names a path, a command, a flag or a profile
- [x] The URL is schema-validated as http(s) and passed as one argv element
- [x] A rejection carries the request id, so a client with two requests in
      flight is not told only that *something* failed
- [x] `launcher:install-extension` derives the extension id the way Chrome does
      and writes the host manifest for every Chromium-family browser present
- [x] A stopped launcher shows the same Start button, never an error
- [x] Start is disabled while a sign-in question is open — the caption sends you
      to the menu bar, and an enabled button beside it is contradictory advice
- [x] `capture` and `crawl` announce their run id like `inspect` always did
- [x] The relay and socket are driven end to end by an integration test, with
      real Chrome-style framing, as a real subprocess

## The popover, drawn rather than only decided

- [x] The renderer asks for state on load; a push at startup races the page
      load and is dropped, which left the panel empty with no Start on it
- [x] `did-finish-load` pushes too, for a reload that replaces the listener
- [x] An integration test launches Electron and asserts the panel paints itself
      and offers Start — the gap `docs/limitations.md` had recorded, and the
      one that actually broke
- [x] That test runs with its own user-data directory and its own socket, so it
      cannot collide with a running launcher or take over its socket
- [x] `UI_ATLAS_SOCKET` overrides the socket path for exactly that reason
- [x] The popover is **activated**, not merely shown: an accessory app is not
      activated by showing a window, so the window never became key and macOS
      swallowed every click — a drawn, hit-testable, correctly wired button that
      did nothing. `app.focus({ steal: true })`, then `show()`, then `focus()`

## What real use found

- [x] A URL field on the cold card. Start opens a page, not just an engine, so
      without it the first launch always went to the default
- [x] Scheme-less input is normalised — the design's own mock shows
      `localhost:3000/pricing`, which the first version rejected in silence
- [x] `http` for a local host; `https://localhost:3000` fails in a way that
      looks like the tool's fault
- [x] A successful URL change does not redraw: `change` fires on blur, on the
      way to the button beside it, and redrawing ate the click
- [x] The primary button reads the field itself before acting
- [x] Starting while a session is live stops it first, instead of orphaning a
      browser nothing owns
- [x] Chrome runs a wrapper with an absolute interpreter, not a `#!/usr/bin/env
      node` script it cannot resolve — verified under Chrome's exact PATH
- [x] The extension offers no Start button when the launcher is unreachable; it
      cannot start an app it has no connection to

### Still to build

(nothing in the brief)

## Still out of scope

Signed Web Store packaging of the extension, distributed workers, AI control,
CDP animation, perceptual (near-duplicate) hashing.
