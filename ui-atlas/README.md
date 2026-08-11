# UI Atlas

A local-first tool for collecting website UI reference material for
design-system work. Point at a component on any site, capture it with its
states, and keep enough metadata to find it again.

No cloud account, no AI service, no browser extension, no database server.
Everything runs on your machine and writes plain files.

**Current release: the guided inspector, responsive replay, the report, a
bounded crawler with declarative interaction recipes, and animation inventory
plus frame sampling.** Design-system extraction is still to come — see
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

| Key | Action |
| --- | --- |
| `Alt`/`Option` + `I` | toggle inspect mode |
| `Alt`/`Option` + `C` | capture the selected element |
| `Alt`/`Option` + `V` | capture the viewport |
| `Alt`/`Option` + `R` | capture a responsive set |
| `Alt`/`Option` + `A` | animation capture *(phase 4)* |
| `Escape` | leave inspect mode, then clear the selection |
| Arrow keys | move the selection to parent / child / sibling |
| `Alt`/`Option` + click | let the click through to the page instead of selecting |

In the toolbar you get the element's tag, role, accessible name, size and
chosen locator (with its score and the reasons behind it), viewport presets and
a custom size, capture buttons, and the capture queue.

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
- **Gallery, Duplicates, Issues, Pages** — a flat grid, images that came out
  byte-identical, everything that failed or was skipped or raised a warning, and
  the page visits.
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
npm run ui-atlas -- crawl site.yml --mode storage-state --profile my-reviewer
```

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

Written to `animations.jsonl`. Two gaps it tells you about rather than hiding:

- **Canvas, WebGL and video are not `Animation`s**, so `getAnimations` cannot
  see them. Those elements are counted and named, because "no animations found"
  on a canvas-driven page is a lie of omission.
- **A hover transition does not exist on a page at rest**, so it will not
  appear. Provoking one is a recipe's job.

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

### Authentication

```bash
npm run ui-atlas -- auth save my-profile https://example.com/login
npm run ui-atlas -- inspect https://example.com --mode storage-state --profile my-profile
npm run ui-atlas -- auth clear my-profile
```

`auth save` opens a browser and waits for you to sign in **by hand**. It never
types credentials and never submits a form. The saved state lives in
`~/.ui-atlas/` with owner-only permissions, never in the artifact tree, and
every command that uses it warns that session cookies can impersonate you.

## Output

```
ui-atlas-output/
  <project>/
    <run-id>/
      run.json                                        run manifest
      captures.jsonl                                  one record per capture
      pages.jsonl                                     one record per page visit
      crawl-state.json                                resumable crawl frontier
      interactions.jsonl                              inventoried controls, classified
      suggested-recipes.yml                           a recipe skeleton to review
      traces/<page-id>.zip                            failures only; can contain cookies
      animations.jsonl                                described animations, never sampled
      screenshots/<route>/<viewport>/<capture-id>.png
      screenshots/<route>/<viewport>/<capture-id>.json   metadata beside the image
      report/index.html                                  browsable report
```

Every write is atomic: a temporary file in the same directory, fsynced,
checksummed, then renamed. A capture that failed or was skipped is written as a
record too — with a stable error code and no image — so nothing disappears
silently.

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
