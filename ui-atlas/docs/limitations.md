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
| Animation inventory | **Built.** `ui-atlas animations <url>` lists every animation the Web Animations API can see and says how samplable each is, and `crawl --animations` does the same for every page of a site. It reads and only reads. Details below. |
| Animation frame sampling | **Built.** `animations --sample` photographs the sampleable animations at chosen offsets and restores them. Details below. |
| Provoked motion | **Built.** The `captureAnimation` recipe step hovers or focuses, works out which animations that started, photographs them as one moment and puts them back. It can never click. Details below. |
| Animation video / screencast | **Built.** `animations --video` records the motion no seek can reproduce, for a bounded window. A recording is not a sample and says so. Details below. |
| Design-system extraction | **Built.** `ui-atlas tokens <url>` and `crawl --tokens` count every element's computed values. Observations with counts, not a design system: nothing is named. Duplicate component grouping already spanned routes. Details below. |
| Panel appearance (design 3a/3b) | **Built.** The inspector uses the designed dark and light palettes, chosen separately rather than inverted. Follows the operator's system appearance, and is hidden before every capture so it never reaches an artifact. |
| Scrubbable motion timeline (design 4b) | Not built, deliberately. ADR 25 chose a list over a timeline: most animations cannot be sampled, and a timeline would have to guess which one was meant. |
| CDP forced pseudo-states | Not implemented. `focus-visible` is reached with a real keyboard interaction or reported as `skipped` — never faked. |
| Toolbar Animation panel | **Built.** The Animation button lists what moves and offers each row the one action that would work. Details below. |
| Chrome extension | **Built, unpacked.** `launcher:install-extension` writes the native messaging host manifest; the extension is loaded through Developer mode. Signed Web Store packaging is still not built. Details below. |
| Menu bar launcher | **Built.** `npm run launcher` runs the build and `inspect` as child processes and shows them as three rows, plus the sign-in step. A supervisor, not a daemon: no port, no background service, no engine change. Details below. |

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
- **During a crawl it describes and nothing else.** `crawl --animations` runs
  the same inventory on every page, but never samples: photographing motion
  costs a pause, a seek and a screenshot per frame, which is a
  `captureAnimation` recipe step or the one-shot command, not something a crawl
  spends on every page unasked.
- **Two caps, reported in different places.** The per-page cap is a fact about
  that page and travels with its page record; the run-level cap is a fact about
  the run and is raised once in the run warnings.
- **The unobservable-motion notice is aggregated across a crawl.** Said per page
  it would be true of every page of a canvas-driven site and would bury
  everything else, so it is counted and raised once with a route count.

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
- **CDP animation control is not used.** The Web Animations API answers both the
  inventory and the sampling question on its own.

## Boundaries of the screencast fallback (`--video`)

See [ADR 23](adr/0023-a-recording-is-a-fallback-not-a-sample.md).

- **A recording is not a sample.** It carries no `progress` and no
  `currentTimeMs`, because there is no honest one for an animation that never
  ends. Recording again gives a different file.
- **Scroll-driven animations are refused.** Nothing scrolls during a recording,
  so the video would be a still — indistinguishable from a recording that
  failed, which is worse than an honest absence.
- **`sampleable` and `instant` animations are refused too**, the first because
  exact frames say more, the second because there is nothing in between to show.
- **The file begins with a page load.** Playwright records a browser *context*
  and only writes the file when it closes, so a recording needs a context of its
  own and a second navigation. `leadInMs` says how far in the window starts.
- **A persistent profile cannot record**, because it owns its only context. That
  is a warning and a skip, like single-worker fallback in a crawl.
- **The frame rate is unknown and is not written.** Playwright does not expose
  it, and decoding the WebM to find out is out of scope. Times read off the file
  are approximate.
- **An over-budget recording is discarded**, and recorded as `skipped` with
  `capture.over-budget`. The bytes are checked by `stat` before the file is
  read, so a runaway recording does not become a runaway allocation.
- **It is a one-shot `animations` feature**, not a crawl feature. Recording every
  page of a crawl is a different budget conversation.
- **Nothing trims the file.** The lead-in is reported, not removed; trimming
  would mean decoding and re-encoding.

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

## Boundaries of observed-value extraction (`tokens`)

See [ADR 24](adr/0024-observed-values-are-candidates-not-tokens.md).

- **These are candidates, not tokens.** Nothing is named, because naming is a
  judgement. `tokens.json` has no `name` field anywhere, and a test asserts it.
- **Values that mean nobody decided anything are dropped** — a transparent
  background, a zero margin, `font-style: normal`. They are the most common
  computed values on any page, and keeping them would bury everything real.
- **Only computed values are seen**, so CSS custom properties are invisible as
  properties: `var(--brand)` arrives already resolved. The value is right; the
  fact that the site already has a name for it is not visible here.
- **A value is counted once per element, not once per rule.** Ten elements
  sharing a class contribute ten.
- **Elements that are not visible are still read.** A hover menu at rest is
  `display: none` and its computed colours are real decisions, so a page with a
  large hidden mega-menu weights towards it.
- **Near-duplicates are reported and never merged.** Two colours one channel
  apart may be a mistake or may be deliberate; the counts are the evidence, and
  merging would destroy them.
- **Colours are only compared at the same opacity.** A 50% overlay is not a
  mistyped solid.
- **A colour space the parser does not understand** — `color(display-p3 …)`,
  `color-mix(…)` — is counted but cannot be compared channel by channel, and
  gets no swatch in the report.
- **Both caps are visible.** The per-page element cap and the per-category tail
  cap each add a warning naming what was left out.
- **Nothing is captured.** The `tokens` command writes no `captures.jsonl`.
- **Pseudo-element styles are not read.** `::before` content is often decorative
  and often carries a colour; `getComputedStyle` needs to be asked for it
  separately, and it is not.

## Boundaries of the toolbar's Animation panel

See [ADR 25](adr/0025-the-animation-button-is-a-list-not-a-shutter.md).

- **It lists the page as it is now.** It does not update itself when the page
  changes; *Refresh* re-reads it. Live-updating would mean watching every
  document for animation events, which is a much larger promise than a list.
- **A hover transition is still absent**, for the reason it is absent from the
  inventory: it does not exist until something provokes it. Reaching one from
  the toolbar would need the panel to hold a hover while it listed, which is the
  `captureAnimation` recipe step's job.
- **Recording from the toolbar opens a second browser context** and loads the
  page again, visibly, in an interactive session. A persistent profile cannot
  create that context and the job fails saying so.
- **An animation is re-found by fingerprint at capture time**, not by the index
  it was listed at. A page that changed in between yields "no longer running"
  rather than a confident frame of whatever now sits at that index.
- **Nothing in the panel is named for you.** It shows what the inventory said,
  in the inventory's words.

## Boundaries of the sign-in check

See [ADR 28](adr/0028-a-saved-sign-in-is-checked-not-assumed.md).

- **A storage state carries cookies and localStorage, and nothing else.** Not
  IndexedDB, not sessionStorage, not service workers. `auth save` now reads the
  page and tells you when the session lives somewhere it cannot reach, but the
  limit itself is Playwright's and is not going away. `--persistent` is the way
  round it.
- **The verdict is a heuristic, and it says so.** It reads visible password
  fields, sign-in and sign-out controls, and whether the final URL is a sign-in
  path. A page showing none of those reads `unclear`, which is a real answer and
  not a failure.
- **The wording is English-shaped.** It matches "sign in", "log in", "sign out"
  and their variants. A site in another language reads `unclear` rather than
  wrong — the right failure, but a real limit.
- **`signed-in` means the page offered a way out**, not that every API call will
  succeed. A partially-expired session can still show a sign-out button.
- **It runs once, on the first page of a run.** A session that expires halfway
  through a long crawl is not noticed.
- **`clean` mode is never checked.** It is expected to be signed out, and
  warning about it would teach people to ignore the warning.
- **None of this helps you get signed in.** UI Atlas types nothing, submits
  nothing and evades nothing. A site that blocks automated browsers still blocks
  it, and `--persistent` only preserves more of what you did by hand.

## Being blocked by a site

- **UI Atlas has no evasion and will not be given any.** No fingerprint
  spoofing, no stealth patches, no CAPTCHA solving, no proxy rotation. A site
  that has decided it does not want automated browsers gets to have that.
- **A challenge is detected, named, and then obeyed.** Every run checks its
  first page in every browser mode; a `crawl` stops rather than starting.
  Retrying is what turns a soft challenge into a hard block, so nothing here
  retries.
- **Detection is structural first, wording second.** `#challenge-form`,
  `.cf-browser-verification` and their relatives survive translation; the
  wording list does not. An interstitial with neither is reported as an
  ordinary page.
- **A challenge and a signed-out session are told apart deliberately**, because
  they need opposite responses: one is fixed by signing in again, the other
  cannot be fixed here at all.
- **Attach mode needs a browser you started.** Nothing is launched for you, so
  the failure when that browser is not running is the most common one there is;
  the error names the port and gives the launch line for your platform.
- **`--mode attach` is the only remaining route**, and it is not a bypass: it
  drives a browser you launched and signed into yourself. It is lower fidelity
  (the attached browser's extensions, flags and profile all affect rendering)
  and it is not guaranteed to work. Chrome 136+ refuses
  `--remote-debugging-port` on the default profile, so it needs its own
  `--user-data-dir`.

## Boundaries of `doctor`

See [ADR 29](adr/0029-a-page-that-fails-should-say-what-failed.md).

- **It reports one page load.** A failure that only happens after a click, or
  on the fifth page of a flow, is not seen.
- **"Bot challenge" and "sign-in page" are read from the returned HTML's own
  words** — titles like "Just a moment", "Access denied", "Sign in". An
  interstitial that says none of those is reported as HTML-where-data-was-asked
  for, without a name for it.
- **It cannot see what the page never requested.** A framework that swallows a
  failure and renders an empty state produces no finding.
- **Bodies are read only for HTML responses**, and only the title or first
  sentence is kept. It never prints a JSON body, which could be your data.
- **Query strings are stripped from every URL it prints.** That also means two
  requests to the same path with different parameters look identical in the
  output.
- **It fixes nothing.** Naming a bot challenge does not get past it, and UI
  Atlas will not gain evasion.

## Boundaries of capture names and the index

See [ADR 26](adr/0026-captures-are-named-from-what-they-already-know.md).

- **A name is derived, never invented.** It comes from the element's ARIA role,
  its accessible name or text excerpt, and the state that was applied. A capture
  with none of those gets a *shorter* name — `div--default.png` — rather than a
  guessed one. Nothing is sent anywhere to produce a name.
- **Renaming a file by hand does not update anything else.** `captures.jsonl`,
  the `.json` sidecar beside the image and `index.md` all keep the original
  path. Rename the sidecar to match if you want the pair to stay together. Both
  indexes say so at the top.
- **Names follow the site's content.** A button whose label changes gets a
  different filename on the next run. `captures.jsonl` is the stable record —
  capture ids did not change, only the filenames did.
- **Collisions are resolved by order.** Two captures a person would give the
  same name get `-2`, `-3` in the order they were written; which one is
  unsuffixed depends on which ran first. The sidecar beside each says which is
  which.
- **The index describes what was recorded, not what is on disk now.** It is
  rebuilt from `captures.jsonl` at the end of a run. Files added, removed or
  renamed afterwards are not noticed until another run rewrites it.
- **A capture that produced no file is listed, not hidden**, under "Not captured
  here" with its reason. A gap you can see beats a gap you have to notice.

## Boundaries of the panel's size and position

- **The panel opens at ~370px, not the window height.** It used to ask for
  `calc(100vh - 32px)`, which on a 1000px display made it 970px — 97% of the
  screen, for a tool you are meant to be looking *past*.
- **Four tabs, one rendered at a time.** The whole main loop is in the first
  one; a tab boundary inside select-then-capture would be worse than the
  scrolling tabs replaced.
- **A section, or a tab, that receives content brings itself forward.** Pressing
  a button and getting a result behind a collapsed heading or an unselected tab
  reads as "nothing happened".
- **Collapsed state, the active tab and a dragged size are per page load.**
  Persisting them would mean writing to the site's own storage, which this tool
  does not do.
- **The panel keeps itself inside the window**, recomputing its height from
  wherever its top edge is and on every window resize. It will not shrink below
  a usable height, so a window shorter than ~240px cannot hold it.
- **Resizing is vertical only.** The panel is a fixed 320px wide.

## Boundaries of the Output section

See [ADR 31](adr/0031-the-panel-can-open-the-folder-but-never-names-it.md).

- **The panel never shows an absolute path.** The overlay is injected into the
  site you are looking at and lives in an open shadow root, so anything it
  renders is readable by that site. File names come from the site's own content;
  a path would come from your machine. The absolute path is printed in the
  terminal instead.
- **The list is the most recent few, not everything.** `index.md` in the run
  directory is the complete record.
- **It reads `captures.jsonl`, so it lags a capture that is still running.**
  Press Refresh, or capture again — the list is a read of what has landed.
- **Open folder and Open report are the only two things it can open.** The page
  names a target from a closed enum, never a path.
- **Opening depends on the platform having an opener** (`open`, `explorer`,
  `xdg-open`). Where there is none, the panel says so and the path is in the
  terminal.
- **The report is built from what is captured so far.** Opening it mid-run gives
  a report of the run so far, not of the run you are going to have.

## Boundaries of the guided flow

See [ADR 27](adr/0027-the-panel-says-what-to-do-next.md).

- **The flow describes the main sequence only.** Animations, viewport presets
  and the responsive set are branches off it, not steps in it, so the step
  numbers do not count them.
- **The capture count is per page load and per route, not per run.** It counts
  what this toolbar has captured from the page the browser is on. Reloading the
  page starts it again; the run's own totals are in `run.json`.
- **The instructions panel does not remember being hidden.** Persisting it would
  mean writing to the site's own storage, which this tool does not do.

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

## Boundaries of the launcher

- **It is a supervisor, not a daemon.** It spawns the build and `ui-atlas
  inspect` and reads their log lines. There is no port, no status API and no
  change to the capture engine. The design's mock shows `port 7333` next to the
  running engine; that port does not exist, so the row shows the run id, which
  does.
- **It learns by matching the CLI's log lines.** Those patterns are covered by
  `tests/unit/launcher-progress.test.ts`, which generates the lines through the
  real logger — so rewording a log message fails a test rather than leaving the
  launcher stuck on "Starting engine…". A line the launcher does not recognise
  is still shown in `Show log`; it just does not move the state machine.
- **The stages are three rows, not three processes.** "Start capture engine" and
  "Open browser with panel" are two moments in one `inspect` child, not two
  commands. That is what the design asked for at this stage, and it is why
  nothing in the engine had to change.
- **It never claims an account.** The design's mock reads "Signed in as
  reviewer@acme.com". UI Atlas never learns an account name, so the row names
  the profile it loaded. The expiry beneath it *is* real — it is read from the
  saved storage state's own cookie `expires` fields.
- **A challenge card has no primary button.** A signed-out session and a host
  refusing the browser need opposite responses, so the challenge card offers
  neither "Sign in…" nor "Capture anyway". There is no honest action there.
- **`--mode attach` is not offered.** It drives a browser the launcher did not
  start and cannot close. The CLI still offers it.
- **macOS-shaped.** The tray, the vibrant popover and `⌘Q` assume macOS. The
  supervisor underneath is platform-neutral and would work anywhere Electron
  does, but nothing else has been tried.
- **The popover is now driven as a real window.**
  `tests/integration/launcher-window.test.ts` launches Electron, attaches over
  CDP and asserts the panel paints itself and offers Start. That gap used to be
  recorded here as uncovered, and the thing it failed to cover promptly broke:
  the only state push happened before the page had loaded, `webContents.send`
  dropped it, and the popover sat empty with no Start button on it. The
  renderer asks for state on load now, and the test fails without that.
- **What that test does *not* cover:** it evaluates JavaScript rather than
  moving a pointer, so it proves the popover draws and its handlers are wired,
  not that the window is positioned, visible or clickable on screen. Nothing
  clicks the tray icon.

  Both launcher bugs found in real use landed in exactly that gap — a panel that
  never drew, and then a panel whose window could not take clicks because an
  accessory app is not activated by showing a window. Closing the gap properly
  would mean an automated test that steals keyboard focus from whoever is
  running it, mid-run, to assert `document.hasFocus()`. That is a worse trade
  than the gap, so the gap stays, named rather than implied.
- **Menu bar behaviour is verified from a terminal launch, not a packaged app.**
  `npm run launcher` runs Electron directly. Activation and key-window
  behaviour for an `LSUIElement` app can differ once it is bundled and signed as
  a `.app`, and nothing here has been through that path.

## Boundaries of the browser extension

- **Unpacked and unsigned.** It is loaded through Developer mode, not the Web
  Store. Packaging and signing a `.crx` is not built.
- **The extension id comes from the load path.** Chrome derives an unpacked
  extension's id from the absolute directory it was loaded from, and the host
  manifest names that id. Moving the checkout, or loading a copy from elsewhere,
  means running `launcher:install-extension` again.
- **A socket, not a port.** The launcher listens on `~/.ui-atlas/launcher.sock`
  at mode 0600. Nothing running in a web page can reach it. There is still no
  `port 7333`, and the design's mock of one remains fiction.
- **Four methods, and none of them names a path.** The extension can ask for
  status, start, stop, or capture a URL in one of three modes. It cannot name a
  command, a flag, a profile or a directory. The URL is validated as http(s)
  and passed as a single argv element.
- **macOS host paths only.** `NATIVE_HOST_DIRECTORIES` lists Chromium-family
  locations under `~/Library/Application Support`. Linux and Windows would each
  need their own, and Windows would need a named pipe instead of the socket.
- **Chrome is not in the test suite.** Everything up to the browser is tested,
  including the native messaging framing and the relay driven as a real
  subprocess against a real socket. What is *not* verified is Chrome reading the
  host manifest, checking the extension id, and rendering the popup — that path
  has been reasoned about and built to spec, but not executed here.
- **Page and Whole site are one-shot.** They run `capture` and `crawl`, which
  end by themselves; the launcher reports the finished run and returns to cold.
  Only Element leaves a window open.

## Environment notes

- **External-site smoke tests** (`tests/integration/external-smoke.test.ts`) are
  read-only and skip themselves when the browser has no outbound network access.
  They were **skipped** in the sandbox this was built in, so the part of the
  phase 1 exit criterion that names three unrelated public sites is verified by
  code and by the fixture site, but has not been executed against live sites
  here. Run `npm run test:integration` on a networked machine to close that gap.
- `attach` mode is experimental: the attached browser's extensions, flags and
  profile all affect rendering. It warns on every use.
