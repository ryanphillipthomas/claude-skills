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
| Worker concurrency | **Built.** `--concurrency <n>` runs isolated workers, each with its own context. `perPageDelayMs` is enforced per origin across all of them. Details below. |
| Retry and backoff | **Built.** Bounded retries with jitter for timeouts and 5xx; a 429 or 503 holds the whole origin back, honouring `Retry-After`. Details below. |
| Trace on failure | **Built.** `--trace-on-failure` keeps a Playwright trace for unreachable pages and for pages a recipe failed on. Off by default: a trace can contain session cookies. Details below. |
| Animation inventory | **Built.** `ui-atlas animations <url>` lists every animation the Web Animations API can see and says how samplable each is. It reads and only reads. Details below. |
| Animation frame sampling | **Built.** `animations --sample` photographs the sampleable animations at chosen offsets and restores them. Details below. |
| Animation video / screencast | Not built. `animation-video` still reports that it is unimplemented; it is for motion that cannot be represented as keyframes. |
| Design-system extraction | Not built. Token extraction and duplicate component grouping are the rest of phase 4. |
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
- **Concurrency is opt-in and defaults to one worker.** `--concurrency <n>`
  raises it; `perPageDelayMs` then applies per origin across every worker rather
  than per worker, so more workers never means more requests per second to one
  host.
- **`maxRunMinutes` is checked between pages** and also clamps each page's own
  budget, so navigation, settle, the title read and link discovery are all
  bounded by whatever is left of the run. A crawl can still overshoot slightly:
  a step that hits its budget is abandoned rather than cancelled, because
  Playwright's `evaluate` and `title` take no timeout argument.
- **Retries do not survive a resume.** A page's attempt count starts again in a
  resumed run. That is deliberate: the host may well have recovered since, and
  carrying a stale count would give it fewer chances than a fresh crawl would.
- **Nothing retries a recipe.** A recipe that failed did so against a page that
  loaded, and repeating an interaction is not the same kind of safe as
  repeating a `GET`.
- **`Retry-After` is clamped**, by `retry.maxRetryAfterMs` (two minutes). A host
  asking for an hour gets two minutes and a warning.
- **An error status stops link discovery.** A `4xx`/`5xx` page is recorded with
  a structured error and its links are not followed, on the grounds that an
  error page's navigation is not the site's link graph.
- **A trace can contain session cookies.** It records network traffic including
  request headers. This is the one deliberate exception to
  [ADR 10](adr/0010-auth-and-browser-modes.md)'s rule that auth material stays
  out of artifacts, which is why tracing is off by default, why nothing is
  written for a page that worked, and why the run warns the first time it keeps
  one. Treat a run directory containing `traces/` as sensitive.
- **Traces are not redacted.** Playwright offers no redaction hook, so there is
  no way to strip a cookie from a trace after the fact. The only control is
  whether the file exists.
- **The report deliberately does not link traces.** It is the artifact you send
  to someone. Find them under the run's `traces/`, named by page record id.
- **An error status is not traced.** A `404` is an answer; its status is the
  whole story, so a trace would add a sensitive file and no information.
- **Nothing outside `crawl` traces.** The inspector and `capture` are
  interactive and already show you what happened.
- **A persistent profile cannot run concurrently.** `browser.mode: profile` owns
  its only context and cannot create siblings, so it warns and stays at one
  worker. Use `clean` or `storage-state`.
- **Per-origin concurrency is not separately capped.** With a single-origin
  crawl, `concurrency` *is* the per-origin concurrency and the throttle bounds
  the rate. A crawl spanning several origins can have every worker on one of
  them at once.
- **Page order is not deterministic under concurrency.** Work is still handed
  out breadth-first, but pages finish when they finish, so `pages.jsonl` row
  order varies between runs.
- **Resuming can repeat one page per worker.** A crash between writing a page
  record and writing `crawl-state.json` re-crawls that page, because the two are
  separate files and there is no transaction across them. A crash with pages
  mid-flight re-crawls those pages and loses none — that direction is the one
  worth being safe in.

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

## Boundaries of the animation inventory

See [ADR 20](adr/0020-animation-inventory-describes-without-touching.md).

- **It captures nothing and changes nothing.** No animation is paused, seeked or
  cancelled, and no screenshot is taken. A test snapshots every animation's play
  state and playback rate before and after a pass and requires them identical.
- **Canvas, WebGL and video motion is invisible to it.** None of them is an
  `Animation`, so `getAnimations` cannot report them. They are counted and named
  in a warning instead, because "no animations found" on a canvas-driven page
  would be a lie of omission.
- **A `requestAnimationFrame` loop is equally invisible**, and unlike a canvas
  there is nothing to count. Script-driven motion simply will not appear.
- **A hover transition does not exist on a page at rest**, so it is absent from
  the inventory of a page nobody has touched. Provoking one is the
  `captureAnimation` recipe step's job, below. The fixture proves both halves:
  absent at rest, present after a hover.
- **Only what is running when the page settles is listed.** An animation that
  starts later, or one already finished and garbage-collected, is not there.
- **`sampleable` is a statement about determinism, not about usefulness.** It
  says a seek would reproduce a frame; it does not promise the frame is
  interesting.
- **Nothing is wired into `crawl` yet.** The inventory is a one-shot command; a
  site-wide animation inventory would be a small addition alongside the
  interaction inventory.

## Boundaries of frame sampling

See [ADR 21](adr/0021-frame-sampling-restores-what-it-moves.md).

- **Only `sampleable` animations are sampled.** Everything else is skipped with
  the inventory's own reason. Seeking an infinite or scroll-driven animation
  would produce a frame the site never shows while looking exactly like a
  successful capture.
- **Only the sampled animation is paused.** A page with several running
  animations shows the others wherever they happened to be. Freezing everything
  would produce a composite moment that never existed — a bigger lie, not a
  smaller one.
- **Offsets are within one iteration**, not the whole active duration. A
  multi-iteration or `alternate` animation says so in the frame's
  `limitations`.
- **`fill: none` at 100% shows the un-animated element**, because that is what
  the browser shows at the end of an unfilled animation. It looks exactly like a
  failed capture, so the frame says so.
- **A resumed animation continues from where it was paused.** The `startTime` is
  restored so it goes back on the same clock, but wall-clock time spent
  sampling is not replayed.
- **`animation-video` is not implemented.** A screencast fallback is for motion
  that cannot be represented as keyframes; nothing here needs it yet.
- **CDP animation control is not used.** The Web Animations API answers both the
  inventory and the sampling question on its own.

## Boundaries of provoked motion (`captureAnimation`)

See [ADR 22](adr/0022-provoked-motion-is-sampled-as-one-group.md).

- **It hovers or focuses, and can never click.** A click is the one interaction
  that changes the world, so it stays a step somebody wrote on purpose. A test
  points this step at `destructive.html`'s *Delete account* button and requires
  the audit log to stay empty.
- **`progress` means something different here.** For a group it is a fraction of
  the *interaction's whole span*, not of one animation's iteration, because two
  transitions from one hover are one picture and must share a clock. A member
  with a shorter duration reaches its end partway through and holds it, which is
  what the page does; the frame says so.
- **Offsets are seeked in ascending order whatever order they were written in.**
  A CSS transition leaves `getAnimations()` the moment it finishes, so a
  backwards seek lands on an animation the document no longer has and silently
  photographs the wrong moment.
- **An interaction that restarts an animation already running is invisible to
  it.** The diff answers "what appeared", and a re-run looks identical to being
  left alone.
- **Letting go of a hover is `mouse.move(0, 0)`.** There is no `unhover`, so a
  page with something interactive in its top-left corner gets that hovered
  instead.
- **The reverse transition is never photographed.** Releasing runs the
  transition backwards; every frame is taken strictly before the release.
- **Only the provoked group is frozen.** The page's own animations keep running,
  for the same reason as above, and a test requires it.
- **One interaction per step.** Motion that needs a sequence — hover, then wait,
  then hover a child — is out of reach; write the sequence as steps and accept
  that only the last provocation is diffed.

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
