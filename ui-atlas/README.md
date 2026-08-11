# UI Atlas

A local-first tool for collecting website UI reference material for
design-system work. Point at a component on any site, capture it with its
states, and keep enough metadata to find it again.

No cloud account, no AI service, no browser extension, no database server.
Everything runs on your machine and writes plain files.

**Current release: the guided inspector, responsive replay, the report, and a
bounded link crawler.** Interaction recipes and animation capture are later
phases — see [docs/limitations.md](docs/limitations.md).

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

The crawl takes no screenshots. Captures during a crawl need interaction
recipes, which are the next slice.

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
packages/crawler  URL canonicalisation, link policy, frontier, budgets
```

The Node host owns the browser, the filesystem, the capture queue and policy.
Page-side code only inspects the DOM, renders the inspector, and sends typed
requests over a single authenticated, schema-validated binding — see
[ADR 4](docs/adr/0004-overlay-host-boundary.md).

Design decisions are recorded in [`docs/adr/`](docs/adr/).
