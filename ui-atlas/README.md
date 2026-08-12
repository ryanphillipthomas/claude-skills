# UI Atlas

A local-first tool for collecting website UI reference material for
design-system work. Point at a component on any site, capture it with its
states, and keep enough metadata to find it again.

No cloud account, no AI service, no browser extension, no database server.
Everything runs on your machine and writes plain files.

**Current release: the guided inspector, responsive replay, the report, a
bounded crawler with declarative interaction recipes, animation inventory with
frame sampling and a screencast fallback, and observed-value extraction.** What
each of those does *not* promise is written down in
[docs/limitations.md](docs/limitations.md).

## Requirements

- Node.js 20.11 or newer
- The Chromium build that ships with the pinned Playwright version
  (`npx playwright install chromium`, or set `PLAYWRIGHT_BROWSERS_PATH` to a
  directory that already has it)

## Install and build

```bash
cd ui-atlas
npm install
npm run build          # compiles the packages and bundles the injected inspector
```

## Commands

### Guided inspection

```bash
npm run ui-atlas -- inspect https://example.com
```

Opens a clean Chromium window with the inspector injected and runs until you
close the browser.

**There are three steps, and the panel tells you which one you are on.**

1. **Inspect** — turns the pointer into a picker. It highlights what is under it
   and never clicks the page.
2. **Select** — click to lock onto an element. The panel shows the locator that
   will find it again and how many things on the page match it. The
   `↑ Parent` / `↓ Child` / `← Previous` / `→ Next` buttons adjust the selection
   when you catch slightly the wrong thing.
3. **Capture** — pick the states you want and press Capture.

A line at the top of the panel says what to do next, and changes as you go:
while captures are running it says so, and once you have captured something it
turns into *"4 captures so far on /pricing — select the next element, or open
another page."* The "How this works" section repeats the three steps and marks
the one you are on; press **Hide** if you do not want it.

Every control has a button. The keyboard shortcuts are faster once you know
them, and none of them is the only way to reach anything:

| Key | Action |
| --- | --- |
| `Alt`/`Option` + `I` | toggle inspect mode |
| `Alt`/`Option` + `C` | capture the selected element |
| `Alt`/`Option` + `V` | capture the viewport |
| `Alt`/`Option` + `R` | capture a responsive set |
| `Alt`/`Option` + `A` | list what is animating, and what can be done with each |
| `Escape` | leave inspect mode, then clear the selection |
| Arrow keys | move the selection to parent / child / sibling |
| `Alt`/`Option` + click | let the click through to the page instead of selecting |

In the toolbar you get the element's tag, role, accessible name, size and
chosen locator (with its score and the reasons behind it), viewport presets and
a custom size, capture buttons, and the capture queue.

**The Animation panel lists rather than shoots.** Every other capture button
photographs something immediately; this one cannot, because a page has several
animations and most of them cannot be sampled at all. So it lists what moves and
offers each row the one action that would work: **Sample** where a seek
reproduces the frame, **Record** where it cannot, and neither — with the
inventory's own reason — where nothing honest is possible. Canvas, WebGL and
video are named too, with **Record the page**, because "nothing is animating" on
a canvas-driven page is a lie of omission. Pressing it changes nothing: no
animation is paused, seeked or captured until you pick a row.

**The state chips are live.** Clicking `hover` both adds it to the capture set
and applies it to the page in front of you, held until you click it off. The
capture button names exactly what it will do — "Capture 3 states" — and captures
exactly that. A capture releases any held preview first, so photographing
`default` while previewing `hover` gives you a real default image.

`active` is captured but never held: keeping a mouse button down would take the
pointer away from you.

Useful options:

```
--project <name>      artifact project directory
--mode <mode>         clean | profile | storage-state | attach   (default: clean)
--profile <name>      named auth profile for profile / storage-state
--width / --height    base viewport size
--headless            run without a visible window (CI)
--open-timeout <ms>   stop automatically after this long
--config <path>       explicit config file
```

### One-shot capture

```bash
npm run ui-atlas -- capture https://example.com --kind viewport
npm run ui-atlas -- capture https://example.com \
  --kind element --select '[data-testid="save-button"]' \
  --states default,hover,focus
npm run ui-atlas -- capture https://example.com \
  --kind element --select '[data-testid="save-button"]' --responsive
```

Non-interactive and headless. `--select` uses exactly the same element probe the
inspector uses, so a selector-driven capture and a clicked capture produce
identical identity data.

`--responsive` replays the route once per configured viewport, each in a fresh
context with its own reload — so responsive JavaScript that only runs at load
initialises properly, and mobile presets get real emulation (touch, user agent,
device scale) rather than a narrow window. A component that is absent or hidden
at one breakpoint is recorded there as `skipped` with a reason, not as a
failure.

### Report

```bash
npm run ui-atlas -- report ui-atlas-output/default/<run-id>
```

Writes `report/index.html` into the run directory and prints its `file://` URL.
Open it straight from disk — no server, no network requests, nothing to install.

- **Components** — every component you captured, as a matrix. Whichever of
  viewports or states has more members becomes the columns, so what you are
  comparing is always side by side. Cells that were skipped say *why* (hidden at
  this viewport, not present, locator matched several elements) instead of
  showing a blank.
- **Gallery, Duplicates, Issues, Values, Pages** — a flat grid, images that came
  out byte-identical, everything that failed or was skipped or raised a warning,
  the observed computed values with counts and swatches, and the page visits.
- **Detail panel** — click any capture for its locator candidates with scores and
  the reasons behind them, the computed-style delta with colour swatches, the
  readiness checks and their timings, and exactly what the tool did to reach the
  state. Arrow keys move between captures, `/` focuses search, `Escape` closes.

Filter by status, state, provenance, viewport, route and role. `--json` prints
the summary instead; `--no-html` skips writing the report.

The report contains no authentication material, no absolute paths, and no
executable content derived from the sites you captured.

### Crawl

```bash
npm run ui-atlas -- crawl https://example.com --max-pages 50
npm run ui-atlas -- crawl site-config.yml
npm run ui-atlas -- crawl site-config.yml --resume ui-atlas-output/<project>/<run-id>
```

Visits same-origin pages and records each one in `pages.jsonl`.

**It follows `<a href>` links and clicks nothing.** No buttons, no forms, no
interaction of any kind — the only things it does to a page are navigate to it,
wait for it to settle, and read anchors out of the DOM. That is asserted by a
test which crawls a fixture page full of destructive controls and requires both
the page's own audit log and the browser's non-`GET` request list to be empty.

Turned away by default, each with its own reason in the summary: other origins,
`mailto:`/`tel:`/`javascript:`, downloads by extension, `rel="nofollow"`, and
anything matching the sign-out deny list — following a sign-out link would end
the session the rest of the crawl depends on.

URLs are canonicalised before anything is compared: fragment dropped,
credentials stripped, host lower-cased, default port dropped, repeated slashes
collapsed, trailing slash normalised, tracking parameters removed and the rest
sorted. So `/docs/`, `/docs#install` and `/docs?utm_source=news` are one page,
crawled once.

Every budget is a hard limit — `maxPages`, `maxDepth`, `perPageTimeoutMs`,
`maxRunMinutes` and a bound on the pending queue. Stopping on one is a result,
not an error: the run says which budget stopped it and how much was left queued.

### Concurrency and politeness

```bash
npm run ui-atlas -- crawl site.yml --concurrency 4 --delay-ms 750
```

Each worker gets its own browser context, seeded from the live session's storage
state — so a signed-in crawl stays signed in on every worker, without workers
sharing one mutable session. Concurrency defaults to **1**; more workers on
someone else's site is a decision only you can make.

**`perPageDelayMs` is a minimum gap between navigations to one origin, enforced
across every worker.** Raising `--concurrency` cannot raise the rate a single
host sees; the workers stagger instead. That is the difference between a
throttle and a sleep, and there is a test that fails if it regresses.

A persistent profile (`--mode profile`) owns its only context and cannot create
siblings, so it warns and stays single-worker. Use `clean` or `storage-state`
for concurrency.

### Retry and backoff

Timeouts, dropped connections and `5xx` responses are retried with exponential
backoff and jitter — three attempts by default, `--max-attempts 1` to turn it
off. A `404` is not retried: it is an answer, not a hiccup.

**A `429` or `503` slows the whole origin down, not just that page.** It feeds
the same per-origin throttle, so every worker's next request to that host is
pushed back. `Retry-After` is honoured in either form the spec allows, clamped
by `retry.maxRetryAfterMs`. A `429` on the final attempt still slows the origin
— giving up on one page is no reason to keep hammering.

Retries cost attempts, never pages: `maxPages` counts pages, and a host that
made you try three times has not shown you three pages. Every wait is clamped by
what is left of `maxRunMinutes`.

A page that answered `404` is a finding about the site and appears in the run;
a page that never answered at all is a finding about the run, and is the only
thing that makes `crawl` exit non-zero. One broken link will not fail your
pipeline.

### Trace on failure

```bash
npm run ui-atlas -- crawl site.yml --trace-on-failure
```

Keeps a Playwright trace — a steppable filmstrip with the DOM, the console and
every network request — for pages that could not be reached, and for pages a
recipe failed on. That second case is the one it is really for: the page loaded
fine, so nothing in `pages.jsonl` explains why a step could not find its element.

**It is off by default, on purpose.** A trace records network traffic including
request headers, so a trace taken during an authenticated crawl contains the
session cookie that authenticated it. Turning it on is a decision about where
that material is allowed to land, and the run says so the first time it writes
one.

Nothing is written for a page that worked: recording runs continuously in memory
and the chunk is discarded unless the page failed. An error *status* does not
count — a `404` is an answer, and its status is the whole story. `maxTraces`
(20) bounds how many are kept.

Traces are named by page record id, so `pages.jsonl` and the file line up. **The
report does not show them**, and a test fails if that changes: the report is the
artifact you send to someone, and a trace path in it invites forwarding a file
full of request headers.

A site config is an ordinary UI Atlas config with a `crawl:` block:

```yaml
project: example-audit
crawl:
  seeds: [https://example.com]
  include: ['/**']
  exclude: ['/checkout/**']       # also excludes /checkout itself
  budgets: { maxPages: 100, maxDepth: 4, maxRunMinutes: 30 }
```

The frontier is written to `crawl-state.json` after every page, keyed by a hash
of the canonical URL, so `--resume <run-dir>` continues an interrupted crawl in
the same run directory without visiting or recording a page twice.

### Recipes

A recipe is the only thing that may touch a crawled page, and writing one is
what approves the interaction. On any route no recipe matches, the crawl still
clicks nothing.

```yaml
crawl:
  seeds: [https://example.com]
  recipes:
    - name: open-primary-navigation
      match: '/**'
      steps:
        - hover: { role: button, name: Menu }
        - waitFor: { role: navigation }
        - capture: { kind: viewport, label: nav-open }

    - name: button-state-set
      match: '/components/buttons'
      steps:
        - select: { role: button, name: Save }
        - captureStates: [default, hover, focus, focus-visible]
```

Steps: `select`, `click`, `hover`, `focus`, `press`, `scroll`, `scrollTo`,
`waitFor`, `waitForUrl`, `waitMs`, `capture`, `captureStates`,
`captureResponsive`. A step points at an element with exactly one of `role`
(plus optional `name`), `testId`, `text`, `label`, `placeholder` or `css` — a
closed vocabulary that resolves through Playwright's locator engines, so there
is no path from a recipe to arbitrary page JavaScript.

**There is deliberately no step that types text.** No `fill`, no `type`, no
`evaluate` — all three fail validation. Sign in by hand with `auth save`, then
point the crawl at that session:

```bash
npm run ui-atlas -- auth save my-reviewer https://example.com/login
npm run ui-atlas -- auth check my-reviewer https://example.com/dashboard
npm run ui-atlas -- crawl site.yml --mode storage-state --profile my-reviewer
```

If `auth save` tells you this site keeps its session somewhere a storage state
cannot carry, re-save with `--persistent` and use `--mode profile` instead. See
[Authentication](#authentication).

A misspelled step name or an unknown option is a validation error, never a
silent skip: for a config that can click things, "I did not understand that
line" must not quietly become "I ignored that line".

### Interaction inventory

```bash
npm run ui-atlas -- crawl site.yml --inventory
```

To write a recipe you have to know what is on the site and what it is called.
The inventory answers that: on each page it lists the visible interactive
controls and classifies what each is *likely to do* — `navigation`, `inert`
(changes presentation only), `mutation` (might change data, spend money, send
something, or end the session), or `unknown`.

**It reads and nothing else.** No clicking, no hovering, no focusing. Each
control is described by the same probe the inspector uses, so a control named
here and the same control captured by a recipe mean the same thing.

Output is `interactions.jsonl`, plus a reviewable `suggested-recipes.yml`:

- Only `navigation` and `inert` candidates become steps. `mutation` and
  `unknown` appear in comments so you know they exist, never as something the
  file would execute.
- The generated steps only ever `select` and `captureStates`, which do not
  click. Controls that look safe to click are *named in a comment* for you to
  decide. A generated file that clicked things would be exactly the automatic
  traversal this design rules out.

`unknown` is not "probably fine" — a `<button type="button">` labelled "Go" is
genuinely unclassifiable, and it is treated exactly like `mutation`. Mutation
wording wins over every other signal, so a disclosure labelled "Delete options"
is a mutation. Extend the word list with `crawl.inventory.mutationWords`.

### Dry run

```bash
npm run ui-atlas -- crawl site.yml --dry-run
```

Launches no browser and visits nothing. It prints the plan and calls out, in
capitals, every control a recipe would click. It also catches the mistakes that
are valid YAML and still wrong — a recipe scoped to a route `denyPaths` or
`exclude` will never allow, an element capture with no preceding `select`, a
recipe that clicks but keeps no artifact, duplicate names — and exits non-zero
when it finds one, so it can gate a pipeline.

### Animations

```bash
npm run ui-atlas -- animations https://example.com
```

Lists every animation the Web Animations API can see and says of each whether it
could be sampled at a chosen point and give the same frame every time:

| Verdict | Meaning |
| --- | --- |
| `sampleable` | Finite, time-driven, known duration. A seek reproduces a frame. |
| `infinite` | Repeats forever, so there is no 100% to sample at. |
| `scroll-driven` | Progress follows the scroll position, not the clock. |
| `indeterminate` | Duration is `auto`, or the timeline could not be identified. |
| `instant` | Zero duration or iterations: no intermediate frames exist. |

**By default it reads and only reads.** Nothing is paused, seeked or cancelled,
and no screenshot is taken — a test snapshots every animation's play state and
playback rate before and after a pass and requires them identical.

Written to `animations.jsonl`. `crawl --animations` runs the same inventory on
every page a crawl visits, so "what moves on this site" is answerable from one
run — describing only, never sampling: photographing motion costs a pause, a
seek and a screenshot per frame, which is not something a crawl should spend on
every page unasked.

Two gaps it tells you about rather than hiding:

- **Canvas, WebGL and video are not `Animation`s**, so `getAnimations` cannot
  see them. Those elements are counted and named, because "no animations found"
  on a canvas-driven page is a lie of omission.
- **A hover transition does not exist on a page at rest**, so it will not
  appear. Provoking one is the `captureAnimation` recipe step's job, below.

### Animation frames

```bash
npm run ui-atlas -- animations https://example.com --sample
npm run ui-atlas -- animations https://example.com --sample --offsets 0,0.5,1
```

Photographs each **sampleable** animation at chosen points within one iteration
(`0, 0.25, 0.5, 0.75, 1` by default), pausing and seeking it and then putting it
back exactly as it was found.

Anything the inventory could not call sampleable is skipped, carrying *the
inventory's own reason* — "it repeats forever, so it has no 100% to sample at" —
rather than being seeked anyway and presented as if the frame meant something.

Restoration is the risk, so it is the thing most heavily tested: one test
samples every animation on the fixture and requires a snapshot of *all*
animations' play state, time and rate to be identical afterwards; another throws
from the capture half way through and requires the same.

Each frame records what it does not promise, in `animation.limitations`:
`fill: none` at 100% shows the un-animated element (which looks exactly like a
failed capture), a multi-iteration or `alternate` animation means one iteration
is not the whole story, and a page-set playback rate is ignored by a seek.

Only the animation being sampled is paused. A page with several running
animations shows the others wherever they happened to be — freezing everything
would produce a composite moment that never existed.

### Hover and focus transitions

Most of the motion in a design system is not running when a page loads. A hover
transition does not *exist* until something provokes it, which is why the
inventory above cannot see one. The `captureAnimation` recipe step can:

```yaml
crawl:
  recipes:
    - name: card-hover
      match: '/products/**'
      steps:
        - captureAnimation: { hover: { testId: product-card }, kind: element }
```

It takes an inventory, hovers (or focuses), takes another, and **the difference
is what that interaction started**. Those animations are photographed at each
offset, put back, and only then is the hover released.

- **It can never click.** `hover` and `focus`, and nothing else — a click is the
  one interaction that can change the world, so it stays a step somebody wrote
  on purpose. A test points this step at `destructive.html`'s *Delete account*
  button and requires the audit log to stay empty afterwards.
- **A group is one picture.** Hovering typically starts several transitions at
  once — `transform` and `background-color`, say. They are seeked to the *same
  moment* and photographed together, because a frame with the transform half way
  and the colour still at its start is a composite that never existed. `progress`
  is therefore a fraction of the whole interaction here, not of one animation's
  iteration.
- **The way back is never photographed.** Letting go of a hover runs the
  transition *backwards*; every frame is taken strictly before the release.
- **Offsets are seeked in ascending order** whatever order you write them in. A
  CSS transition leaves `getAnimations()` the instant it finishes, so a backwards
  seek lands on an animation the document no longer has and quietly shows the
  wrong moment.

The animations it provoked are written to `animations.jsonl` like any others, so
"what does this card do when you point at it" is answerable without opening an
image.

### Recording what cannot be sampled

```bash
npm run ui-atlas -- animations https://example.com --video
npm run ui-atlas -- animations https://example.com --video --video-ms 3000
```

Three slices of animation work all refuse to photograph motion they cannot
photograph honestly, which leaves a list of things the tool can describe and
never show: an animation that repeats forever, one whose duration is `auto`, and
the canvas, WebGL and `requestAnimationFrame` motion no animation list can see.
`--video` records those, for a bounded window.

**A recording is not a sample**, and the record does not let it pass as one. It
carries no `progress` — there is no honest progress for something that never
ends — only what the recording is *of*, how long it ran, and what it does not
promise. Recording again gives a different file.

- **Scroll-driven animations are deliberately left out.** Nothing scrolls during
  a recording, so the video would be a still — which looks exactly like a
  recording that failed, and a broken-looking artifact is worse than an honest
  absence.
- **It needs a browser context of its own**, because Playwright records a
  context rather than a page and only writes the file when that context closes.
  So the file begins with a second page load, and `leadInMs` says how far in the
  part you asked about starts.
- **Every bound is hard.** `maxDurationMs` caps the window, and a window cut
  short says `truncated`. A file over `maxBytes` is discarded and recorded as
  *skipped* with `capture.over-budget` — a budget doing its job is not a broken
  run, and a silent absence would look identical to never having tried.
- **The frame rate is not recorded**, because Playwright does not expose it.
  Times read off the file are approximate, and the record says so rather than
  printing a plausible number nobody measured.

The report plays the recording where a thumbnail would go, with the player
controls in the detail panel.

### What a site is made of

```bash
npm run ui-atlas -- tokens https://example.com
npm run ui-atlas -- tokens https://example.com/a https://example.com/b
npm run ui-atlas -- crawl site.yml --tokens
```

Reads every element's computed style and counts what turns up: colours,
backgrounds, borders, radii, spacing, typography and shadows. Written to
`tokens.json`, and shown in the report's **Values** tab with swatches.

**These are observations, not a design system.** "#2563eb appears on 34
elements" is a fact; "this is your primary colour" is a judgement, and this
makes none — nothing in the artifact has a name, because naming is yours to do.

- **Values nobody decided are left out.** A transparent background, a zero
  margin, `font-style: normal`. They are the most common computed values on any
  page and none of them is a design decision; without dropping them the list is
  mostly browser defaults.
- **Colours are separated by use.** "What colour is the text" and "what colour
  is behind it" are different questions, so `color` and `background-color` are
  different categories.
- **Near-duplicates are reported and never merged.** Two colours one channel
  apart are usually a rounding error and occasionally deliberate — and the
  counts are the evidence that answers which. Merging them would destroy exactly
  that, so both survive and the pair is flagged.
- **Every truncation says so.** A per-page element cap and a per-category tail
  cap both bound the work, and both add a warning naming what was left out.

`crawl --tokens` scans every page a crawl visits into one artifact, because a
design system is not visible from a single page.

### Authentication

```bash
npm run ui-atlas -- auth save my-profile https://example.com/login
npm run ui-atlas -- auth check my-profile https://example.com/dashboard
npm run ui-atlas -- inspect https://example.com --mode storage-state --profile my-profile
npm run ui-atlas -- auth clear my-profile
```

`auth save` opens a browser and waits for you to sign in **by hand**. It never
types credentials and never submits a form. The saved state lives in
`~/.ui-atlas/` with owner-only permissions, never in the artifact tree, and
every command that uses it warns that session cookies can impersonate you.

#### Two ways to keep a session, and how to tell which you need

A Playwright storage state — the default — carries **cookies and localStorage,
and nothing else**. No IndexedDB, no sessionStorage, no service workers. Plenty
of sign-ins keep their token in exactly those places, which is how a saved
profile can look healthy (hundreds of cookies) and still be signed out on first
use.

So `auth save` reads the signed-in page and tells you which mode this site
needs. When it finds a session a storage state cannot carry, it says so and
gives you the command to fix it:

```bash
npm run ui-atlas -- auth save my-profile https://example.com/login --persistent
npm run ui-atlas -- crawl site.yml --mode profile --profile my-profile
```

`--persistent` signs you into a real browser profile under
`~/.ui-atlas/profiles/`, which keeps everything a browser keeps. The directory
*is* the saved session — there is no export step to get wrong.

#### Check before a long run

```bash
npm run ui-atlas -- auth check my-profile https://example.com/dashboard
```

Opens the URL with the saved profile and reports `signed-in`, `signed-out` or
`unclear`, with the evidence. Exit code 1 means signed out, so it can gate a
script. This is ten seconds; discovering it at page 50 of a crawl is twenty
minutes and a run of screenshots of a login wall.

Every run using a profile does the same check on its first page and warns
loudly if it is signed out — into the log *and* into `run.json`, so the warning
is still there when you read the artifacts tomorrow. A `clean`-mode run is
expected to be signed out, so it is not checked.

None of this makes UI Atlas better at *getting* signed in. It still types
nothing, submits nothing, and evades nothing — `--persistent` only keeps more of
what your own hands achieved. A site that blocks automation still blocks it.

### When a page says something inscrutable

```bash
npm run ui-atlas -- doctor https://example.com/dashboard
npm run ui-atlas -- doctor https://example.com/dashboard --mode profile --profile my-profile
```

`Unexpected token '<', "<!DOCTYPE "... is not valid JSON` is **the site's own
error**, not UI Atlas's: one of its `fetch` calls asked for JSON and received an
HTML page. That message names neither the request nor what the HTML was, so a
bot challenge and an expired session look identical.

`doctor` loads the page and says which:

```
requested https://example.com/dashboard
document status 200

! A bot challenge answered a data request (https://example.com/api/me:
  "Just a moment…"). UI Atlas has no way around that and will not get one.

1 request(s) worth looking at:
  [html-for-json] 403 fetch https://example.com/api/me
      the page asked for data and received an HTML document — this is what
      produces "Unexpected token '<'"
      body: "Just a moment…"

the page's own scripts threw:
  Unexpected token '<', "<!doctype "... is not valid JSON

sign-in: signed-out
  a sign-in control is on the page ("Sign in")
```

It captures nothing and writes no run — it is a read. Query strings are stripped
from every URL it prints, because they carry tokens. Exit code 1 when it found
something, so it can gate a script.

The two answers it separates:

- **a sign-in page came back** — your saved session is not signed in as far as
  the server is concerned. Re-save it, with `--persistent` if `auth save` said
  this site needs it.
- **a bot challenge came back** — the site is refusing automated browsers. UI
  Atlas has no evasion and will not get any. `--mode attach` against a Chrome
  you launched and signed into yourself is the only remaining option, and it is
  not guaranteed to work either.

## Output

```
ui-atlas-output/
  <project>/
    <run-id>/
      run.json                                        run manifest
      index.md                                        every capture, with what it is
      captures.jsonl                                  one record per capture
      pages.jsonl                                     one record per page visit
      crawl-state.json                                resumable crawl frontier
      interactions.jsonl                              inventoried controls, classified
      suggested-recipes.yml                           a recipe skeleton to review
      traces/<page-id>.zip                            failures only; can contain cookies
      animations.jsonl                                described animations, sampled or not
      screenshots/<route>/index.md                       this page's captures
      screenshots/<route>/<viewport>/<name>.png
      screenshots/<route>/<viewport>/<name>.json         metadata beside the image
      animations/<route>/<viewport>/<name>.webm           recordings, when --video asked for one
      animations/<route>/<viewport>/<name>.json           metadata beside the recording
      tokens.json                                        observed values with counts
      report/index.html                                  browsable report
```

### File names

`<name>` is derived from what the capture already knows about itself — the
element's ARIA role, its accessible name and the state that was applied:

```
screenshots/localhost-4173-pricing/desktop/
  button--save-changes--default.png
  button--save-changes--hover.png
  checkbox--email-me-about-updates--checked.png
  viewport--default.png
```

Nothing is guessed and no image is sent anywhere: a capture with no accessible
name and no text gets a **shorter** name (`div--default.png`), never an invented
one. Repeats within a folder get `-2`, `-3`. Animation frames are zero-padded
(`frame-000` … `frame-100`) so a listing sorts them in the order they happen.

These names are a starting point you are expected to improve by hand. `index.md`
at the run root — and one inside each route folder — lists every file with a
sentence saying what is in it, so a renaming pass has a map. **Renaming a file
does not update `captures.jsonl` or the `.json` sidecar beside it**; rename the
sidecar to match if you want the pair to stay together.

Every write is atomic: a temporary file in the same directory, fsynced,
checksummed, then renamed. A capture that failed or was skipped is written as a
record too — with a stable error code and no image — so nothing disappears
silently. Those appear in `index.md` under "Not captured here", with the reason.

Each record carries the URL, route key, viewport (including whether it was real
mobile emulation), the state and **how it was reached**
(`observed` / `interacted` / `forced`), the readiness checks and their outcomes,
the locator candidates with scores and reasons, a structural fingerprint, the
computed-style delta for state changes, and the image's SHA-256.

## Configuration

`ui-atlas.config.yml` in the project root (or any parent directory) is picked up
automatically; `--config` overrides it, and CLI flags override the file. The
checked-in file lists every option with its default.

## Testing

```bash
npm test                  # builds, then runs unit + integration tests
npm run test:unit
npm run test:integration
npm run typecheck
npm run fixtures          # serve the fixture site at http://127.0.0.1:4173
```

Interaction tests run only against the controlled fixture site in
`tests/fixtures/sites/`, which covers hover menus, focus vs focus-visible,
pressed state, checked/selected/expanded/disabled, motion, lazy images and
never-ending requests, SPA route changes and DOM replacement, same- and
cross-origin iframes, open and closed shadow DOM, hostile global CSS, every kind
of `href` a crawler meets, and destructive controls that must never be clicked.

The external-site smoke tests are read-only and skip themselves when the browser
has no network access.

## How it works

```
apps/cli          command parsing, session wiring, process lifecycle
packages/protocol versioned schemas: records, manifests, bridge messages
packages/config   configuration schema, discovery and validation
packages/artifacts atomic writes, run manifest, JSONL, path safety, PNG headers
packages/browser  Playwright launch in clean/profile/storage-state/attach modes
packages/identity locator candidates, scoring, structural fingerprint, re-resolution
packages/settle   bounded readiness with a hard deadline
packages/capture  screenshots, the state controller, computed-style deltas, queue
packages/overlay  the injected inspector and the host side of its bridge
packages/reporter the static report: view model, viewer, generator
packages/crawler  URL canonicalisation, link policy, frontier, budgets, recipes
packages/animation animation discovery and sampleability classification
```

The Node host owns the browser, the filesystem, the capture queue and policy.
Page-side code only inspects the DOM, renders the inspector, and sends typed
requests over a single authenticated, schema-validated binding — see
[ADR 4](docs/adr/0004-overlay-host-boundary.md).

Design decisions are recorded in [`docs/adr/`](docs/adr/).
