# UI Atlas — implementation brief for Claude Code

## Repository scope

Claude Code may start at the root of a cloud checkout of the containing repository. Build this project entirely inside the repository-relative `ui-atlas/` directory. Treat other top-level projects, including `deploy/`, as unrelated and do not modify them. Preserve all pre-existing changes elsewhere in the repository.

Do not rely on local-machine absolute paths such as `/Users/...`; discover the checkout root at runtime. All implementation paths in this brief are relative to `ui-atlas/` unless explicitly stated otherwise. Run package installation, builds, tests, and generated artifacts from that directory. The implementation may create `ui-atlas/apps/`, `ui-atlas/packages/`, `ui-atlas/tests/`, and documentation within `ui-atlas/`; it must not turn the containing repository root into the npm workspace.

## Mission

Build a local-first tool for collecting website UI reference material for design-system work. It must support two workflows over one shared capture engine:

1. **Guided inspection:** open a site in a clean browser, point at an element, inspect it, choose a state and viewport, and capture it with one click or shortcut.
2. **Repeatable collection:** crawl approved pages and replay explicit interaction recipes to produce consistent screenshots, state metadata, responsive variants, and animation samples.

The first useful release is the guided inspector. Do not start by building a general autonomous web agent. The automated crawler should reuse the same element identity, settling, state, capture, and artifact services established by the inspector.

## Product decisions

- Use **TypeScript, Node.js, and Playwright**.
- Launch Playwright's bundled Chromium in a dedicated profile by default. Do not attach to the user's daily browser and do not load their extensions.
- Implement the inspector as an injected, isolated overlay. A Chrome extension can be an optional package later, but must not be required.
- Keep the system local-first. No cloud account, AI API, browser plugin, or database server is required.
- Store every capture with machine-readable metadata. A screenshot without its URL, viewport, state, selector, and timing context is incomplete.
- Treat automatic interaction as potentially destructive. Link discovery may be automatic; clicks that mutate data require an explicit recipe or approval.
- Label captured states as `observed`, `interacted`, or `forced`. Never present a synthetic forced state as one observed naturally on the site.

## User experience

### Primary commands

```text
ui-atlas inspect <url> [--project <name>] [--profile <name>]
ui-atlas crawl <site-config.yml>
ui-atlas report <run-directory>
ui-atlas auth save <profile-name> <url>
ui-atlas auth clear <profile-name>
```

`inspect` launches a visible, clean Chromium window and injects the overlay into every eligible page after navigation.

### Inspector overlay

The overlay should live in a top-level host element with a Shadow DOM so site CSS does not corrupt it. It contains:

- a small draggable toolbar;
- an inspect-mode toggle;
- the current element's tag, role, accessible name, dimensions, and stable-locator preview;
- state buttons: default, hover, focus, focus-visible, active, checked/selected where applicable;
- viewport presets and a custom width/height control;
- buttons for element, viewport, full-page, state-set, responsive-set, and animation captures;
- a capture queue with success/error status;
- keyboard-shortcut help.

Recommended shortcuts:

```text
Alt/Option + I   toggle inspect mode
Alt/Option + C   capture selected element
Alt/Option + V   capture current viewport
Alt/Option + R   capture responsive set
Alt/Option + A   open animation capture
Escape           cancel or leave inspect mode
Arrow keys       move selection among parent/sibling/child candidates
```

When inspect mode is active:

- use `elementsFromPoint()` to find the deepest visible element under the pointer;
- ignore the overlay and its descendants;
- draw a non-layout-shifting highlight using a fixed-position overlay rectangle;
- show margin/padding/bounds only when requested, to keep the default view calm;
- intercept the selection click but provide a modifier or toolbar command for “interact with this element”;
- support DOM changes by recalculating bounds on scroll, resize, and animation frames while selected;
- restore all listeners and styles when inspection ends.

Before any screenshot, hide all inspector UI and highlight layers, wait two `requestAnimationFrame` ticks, capture, then restore the inspector. The inspector itself must never appear in a normal artifact unless `includeOverlay: true` is explicitly chosen.

## Architecture

Use an npm workspace with packages that can be tested independently:

```text
apps/
  cli/                 command parsing and process lifecycle
  report/              static local capture browser
packages/
  browser/             Playwright launch, contexts, auth, pages, frames
  overlay/             injected inspector UI and page-side element probing
  protocol/            typed messages between overlay and Node host
  identity/            locator candidates and element fingerprints
  settle/              deterministic page/element readiness
  capture/             screenshots, state transitions, responsive runs
  animation/           animation discovery, pause/seek/sample
  crawler/             URL frontier, policies, budgets, recipes
  artifacts/           paths, manifests, hashing, atomic writes
  config/              schema and validation
  reporter/            read-only run index generation
tests/
  fixtures/sites/      controlled pages for states, frames, motion, SPA behavior
```

### Runtime boundary

The Node host owns the browser, filesystem, capture queue, and policy. Page-side code only inspects DOM state, renders the overlay, and sends typed requests.

Use a narrow bridge created by Playwright context bindings. Every incoming message must be schema-validated and associated with the originating page/frame. Do not expose arbitrary filesystem paths or an arbitrary-eval endpoint to page code.

Inject a minimal bootstrap on every new document. Mount the overlay after the document root is available. Re-mount after full navigations; keep it alive across normal SPA route changes. Observe URL/history changes in the host and update run context without monkey-patching application APIs unless necessary.

### Browser modes

Support these modes explicitly:

1. `clean` — default bundled Chromium, temporary context, zero third-party extensions.
2. `profile` — dedicated UI Atlas persistent profile for sites requiring interactive sign-in.
3. `storage-state` — isolated context seeded from a saved Playwright authentication state.
4. `attach` — later/experimental Chromium CDP attachment with a warning that fidelity is lower and behavior is less deterministic.

Never use the user's default Chrome data directory. Keep auth material outside artifacts, add it to `.gitignore`, set restrictive file permissions where the OS supports them, and warn that saved state may contain impersonation-capable cookies.

## Shared data model

Create versioned schemas at the beginning. Suggested core types:

```ts
type CaptureKind =
  | 'element'
  | 'viewport'
  | 'full-page'
  | 'animation-frame'
  | 'animation-video';

type StateName =
  | 'default'
  | 'hover'
  | 'focus'
  | 'focus-visible'
  | 'active'
  | 'checked'
  | 'selected'
  | 'expanded'
  | 'disabled'
  | 'custom';

interface ElementIdentity {
  framePath: FrameIdentity[];
  locatorCandidates: LocatorCandidate[];
  chosenLocator: LocatorCandidate;
  structuralFingerprint: string;
  tagName: string;
  role?: string;
  accessibleName?: string;
  textExcerpt?: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}

interface CaptureRecord {
  schemaVersion: 1;
  id: string;
  runId: string;
  project: string;
  sourceUrl: string;
  finalUrl: string;
  routeKey: string;
  capturedAt: string;
  kind: CaptureKind;
  state: { name: StateName; provenance: 'observed' | 'interacted' | 'forced' };
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
    mobile: boolean;
    hasTouch: boolean;
    userAgentClass: 'desktop' | 'mobile';
  };
  element?: ElementIdentity;
  interactionRecipe?: RecipeStep[];
  readiness: ReadinessResult;
  animation?: AnimationSample;
  image: { relativePath: string; sha256: string; width: number; height: number };
  warnings: string[];
  error?: StructuredError;
}
```

Store metadata as JSON Lines for append-only run recording plus one JSON record next to each image. Generate indexes from those files. Avoid requiring SQLite in the MVP; add an index database only after real runs prove JSONL lookup is too slow.

Suggested artifact layout:

```text
ui-atlas-output/
  <project>/
    <run-id>/
      run.json
      captures.jsonl
      pages.jsonl
      screenshots/<route>/<viewport>/<capture-id>.png
      animations/<route>/<capture-id>/frame-000.png
      traces/
      report/index.html
```

All writes should be atomic: write a temporary file in the same directory, checksum it, then rename it.

## Element identity

Do not save a raw CSS path as the only identity. Generate and score candidates in this order:

1. accessible role plus accessible name when unique;
2. stable test attributes such as `data-testid` when present;
3. stable ID after rejecting generated-looking IDs;
4. label, placeholder, alt text, title, or scoped visible text;
5. a CSS selector scoped to a stable ancestor;
6. a positional CSS path only as a last resort.

Each candidate should include type, value, uniqueness count, score, and reasons. Re-resolve the selected candidate immediately before acting or capturing. If it resolves to zero or multiple elements, try the next candidate and add a warning.

The structural fingerprint should hash stable facts such as tag, role, normalized accessible name/text class, selected stable attributes, ancestor roles, and component-sized geometry bucket. Do not include transient class hashes, absolute page coordinates, or user data.

Playwright locators already pierce open Shadow DOM. Document closed Shadow DOM as unsupported for element-level inspection. Represent iframe ancestry explicitly. For cross-origin frames, let the Playwright host inspect and capture through frame locators even when top-page JavaScript cannot traverse the frame DOM.

## Readiness and determinism

Never wait indefinitely for `networkidle`; analytics, streaming, and long polling can keep a page busy forever.

Implement a bounded settle policy:

1. wait for `domcontentloaded` or the configured load state;
2. wait for `document.fonts.ready` with a timeout;
3. ask currently visible images to decode, with per-image and total timeouts;
4. wait for the target element to be attached, visible, and geometrically stable;
5. require a short DOM/layout quiet window, reset by meaningful mutations;
6. wait two animation frames;
7. capture at the hard deadline even if incomplete, recording timed-out checks as warnings.

Make defaults configurable, for example:

```yaml
settle:
  totalTimeoutMs: 12000
  mutationQuietMs: 500
  geometryQuietMs: 250
  fontTimeoutMs: 3000
  imageTimeoutMs: 3000
```

Provide optional masking rules for timestamps, ads, rotating carousels, cursors, and user-specific data. Default still captures should disable animations. A motion capture explicitly enables and controls them.

## State capture

Build a `StateController` with setup, verify, capture, and guaranteed cleanup for every state.

- **Hover:** prefer a real Playwright hover. Verify that the element remains attached and that a style/layout/descendant visibility change occurred when possible.
- **Focus:** call focus and verify `document.activeElement` through the correct frame.
- **Focus-visible:** prefer keyboard navigation or a real key interaction. CDP pseudo-state forcing may be a fallback and must be labeled `forced`.
- **Active/pressed:** mouse down, capture while held, and release in `finally`. Avoid controls where mouse down itself mutates data unless explicitly approved.
- **Checked/selected/expanded:** capture an already-observed state, or use an explicit safe interaction recipe. Direct attribute manipulation is a forced state.
- **Disabled:** capture native/ARIA-disabled elements as observed. Attribute injection is optional and forced.
- **Text selection:** allow the user to drag/select text in manual mode, or define a Range for a selected element in forced mode.

For every state, collect a compact before/after computed-style diff from a whitelist relevant to design systems: color, background, border, outline, box-shadow, opacity, transform, typography, cursor, visibility, and key spacing/layout properties.

Always unwind pointer buttons, keyboard modifiers, forced pseudo states, injected attributes, scroll changes where practical, and temporary styles in `finally` blocks.

## Responsive capture

Ship sensible presets but allow project configuration:

```yaml
viewports:
  - { name: mobile-sm, width: 375, height: 812, mode: mobile }
  - { name: mobile-lg, width: 430, height: 932, mode: mobile }
  - { name: tablet, width: 768, height: 1024, mode: desktop }
  - { name: laptop, width: 1280, height: 800, mode: desktop }
  - { name: desktop, width: 1440, height: 1000, mode: desktop }
```

Distinguish a resized desktop viewport from true mobile emulation, which also changes user agent, touch capability, and device scale. By default, create a fresh page/context and reload the route for each viewport so responsive JavaScript initializes correctly. Re-run the explicit setup recipe before each capture.

For element responsive sets, re-resolve the element at every viewport. Record `not-present`, `hidden`, and `locator-ambiguous` as valid outcomes instead of failing the whole set.

## Animation capture

Implement in two steps.

### Animation MVP

- Discover animations using `document.getAnimations({ subtree: true })` in accessible frames.
- Record target, type when inferable, duration, delay, iterations, easing, play state, and keyframe offsets.
- Pause relevant finite animations and sample at 0%, 25%, 50%, 75%, and 100%, configurable by the user.
- Capture the target element or viewport for each sample.
- Restore every animation's original current time, playback rate, and play state.
- For hover-triggered transitions, enter hover first, discover the newly created animations, then sample.
- Mark infinite, scroll-driven, spring/script-driven, canvas, WebGL, video, and cross-origin-frame limitations clearly.

### Advanced motion

- Add Chrome DevTools Protocol animation controls for browser-level CSS transition/animation discovery and seeking.
- Add a bounded screencast or Playwright video mode for motion that cannot be represented as deterministic keyframes.
- Allow a scripted interaction recipe to trigger motion before recording.
- Keep the raw frame sequence even when generating GIF/WebM/MP4 derivatives.

Do not promise pixel-perfect deterministic capture for script-driven physics or remote video. Report the capture method and uncertainty.

## Crawler and recipes

The crawler is a policy-driven queue, not an unrestricted click bot.

### URL discovery

- Start with same-origin `<a href>` links and optional sitemap URLs.
- Canonicalize scheme/host, remove fragments, normalize trailing slashes, and apply configured query-parameter rules.
- Honor include/exclude globs, maximum pages, maximum depth, per-page timeout, and total run timeout.
- Skip `mailto:`, `tel:`, downloads, logout/signout URLs, and non-HTTP schemes by default.
- Deduplicate by canonical URL and optionally by page structural fingerprint.
- Use bounded retries with jitter for navigation failures and status-aware backoff for 429/503.
- Set conservative per-origin concurrency; scale by multiple isolated workers, not many simultaneous tabs sharing one mutable session.

### Interaction recipes

Use declarative YAML, validated before execution:

```yaml
project: example-design-audit
baseUrl: https://example.com
allowOrigins: [https://example.com]
include: ['/**']
exclude: ['/logout', '/account/delete/**', '/checkout/**']
budgets:
  maxPages: 100
  maxDepth: 4
  maxRunMinutes: 30
concurrency: 2
authProfile: example-reviewer
recipes:
  - name: open-primary-navigation
    match: '/**'
    steps:
      - hover: { role: button, name: Menu }
      - waitFor: { role: navigation }
      - capture: { kind: viewport, state: nav-open }
  - name: button-state-set
    match: '/components/buttons'
    steps:
      - select: { role: button, name: Save }
      - captureStates: [default, hover, focus-visible, active]
```

Allowed primitives should be deliberately small: navigate, select, click, hover, focus, press, fill from secret reference, scroll, wait-for locator, wait-for URL, capture, capture states, capture responsive set, and capture animation. Disallow arbitrary JavaScript in ordinary config. If an escape hatch is later added, isolate it in a clearly unsafe expert mode.

Automatic button traversal should initially be suggestion-only: inventory visible interactive elements, classify likely navigation versus mutation, and surface safe-looking candidates to the user. Only auto-click anchors and recipe-approved controls. This prevents accidental purchases, submissions, deletes, messages, or account changes.

## Report

Generate a self-contained, read-only local report from run artifacts. It should provide:

- filters for route, viewport, element role/type, state, provenance, and warnings;
- side-by-side responsive comparison;
- a state matrix for a selected component;
- animation frame strip/playback;
- screenshot plus metadata and locator candidates;
- computed-style delta for state changes;
- duplicate/near-duplicate grouping based on exact image hash first, optional perceptual hash later;
- failed and skipped captures as first-class rows.

Do not embed authentication material, full storage state, request headers, or secrets in the report.

## Phased delivery

### Phase 0 — foundation

Deliver:

- npm workspace and strict TypeScript configuration;
- config schemas and protocol schemas;
- artifact writer and run manifest;
- Playwright browser launcher in clean/profile/storage-state modes;
- controlled fixture site and baseline automated tests.

Exit criteria: one command launches a fixture URL and writes a viewport screenshot plus valid metadata.

### Phase 1 — guided inspector MVP

Deliver:

- injected Shadow DOM overlay;
- hover highlight and click-to-select;
- stable locator candidates and re-resolution;
- element, viewport, and full-page capture;
- default, hover, and focus capture;
- overlay hiding and guaranteed cleanup;
- capture queue and keyboard shortcuts.

Exit criteria: on at least three unrelated public sites and the fixture site, the user can select an element and capture default/hover/focus images without the overlay appearing in screenshots or the page remaining altered afterward.

### Phase 2 — responsive and report

Deliver:

- viewport presets and responsive capture sets;
- fresh-context replay per viewport;
- static report with responsive and state matrices;
- authentication profile flow;
- iframe and open Shadow DOM test fixtures.

Exit criteria: a selected component produces a five-viewport matrix, including honest hidden/missing outcomes, and can be browsed in the report.

### Phase 3 — recipes and bounded crawler

Deliver:

- URL canonicalization and same-origin frontier;
- budgets, allowlists, deny rules, retry/backoff, and resumable queue;
- declarative recipes and dry-run validation;
- suggested-interaction inventory;
- worker concurrency and per-origin throttling;
- trace-on-failure.

Exit criteria: a 50-page test site can be interrupted and resumed without duplicate records, exceeding budgets, or clicking destructive fixture controls.

### Phase 4 — motion and design-system extraction

Deliver:

- animation inventory and deterministic frame sampling;
- hover-transition sampling;
- optional video/screencast fallback;
- computed-style state deltas;
- first-pass token extraction and duplicate component grouping.

Exit criteria: fixture CSS animations, transitions, and Web Animations produce timestamped samples with restored page state and documented limitations.

### Phase 5 — scale hardening

Deliver only after profiling real workloads:

- multi-machine sharding if needed;
- an indexed catalog if JSONL/report generation becomes a bottleneck;
- object-storage adapter if local artifacts become impractical;
- optional extension packaging for users who prefer a browser-native side panel.

Do not add distributed infrastructure speculatively.

## Testing matrix

Create fixture pages for:

- hover-only menus and tooltips;
- focus and focus-visible distinctions;
- active/pressed state requiring mouse-down capture;
- checkboxes, tabs, selected options, expanded disclosures, and disabled controls;
- CSS transitions, finite/infinite animations, Web Animations, and scroll-driven motion;
- sticky headers, nested scrolling, lazy images, web fonts, and endless network requests;
- SPA route changes and DOM replacement after selection;
- same-origin and cross-origin iframes;
- open and closed Shadow DOM;
- responsive JS that only runs at initial load;
- canvas/WebGL/video limitations;
- destructive buttons that the crawler must never click;
- pages with hostile global CSS and high z-index overlays.

Test layers:

1. unit tests for schemas, URL normalization, selector scoring, paths, and policies;
2. browser integration tests against fixtures;
3. golden screenshot tests for the inspector, state captures, and responsive sets;
4. fault-injection tests for detached elements, navigation during capture, timeouts, write failures, and browser crashes;
5. small external-site smoke tests that make no mutation and tolerate expected site change.

## Non-functional requirements

- Every wait and crawl has a hard deadline and a structured timeout error.
- Cleanup runs in `finally`, including mouse-up and modifier-key release.
- A failed capture does not terminate the run unless policy says fail-fast.
- Queue work is resumable and idempotent through deterministic job keys.
- No secrets in logs; redact configured fields and common auth headers.
- Default crawler mode is same-origin, GET/navigation-oriented, and mutation-averse.
- Output paths are sanitized and cannot escape the configured artifact root.
- Overlay events do not leak to the page while inspecting, and normal page interaction returns after inspect mode exits.
- Keep dependencies few and justified. Avoid plugin architectures until two genuinely different integrations require one.

## Definition of done for the first release

The first release is complete when a designer can run one command, manually sign in if needed, point at a component on an arbitrary site, and save:

- a clean element screenshot;
- default, hover, and focus states;
- a configurable responsive set;
- metadata sufficient to revisit and attempt to re-identify the component;
- a local visual report.

It must recover cleanly from an element detaching, a navigation occurring, or a capture timing out. It must not require an extension, cloud service, AI model, or site-specific code.

## Instructions to Claude Code

1. Read this brief fully and inspect the repository before changing files.
2. Work only within the repository-relative `ui-atlas/` directory. Preserve unrelated changes and do not modify sibling projects such as `deploy/`.
3. Create a short implementation checklist mapped to Phase 0 and Phase 1 only.
4. Record assumptions in an ADR before making decisions that change the architecture.
5. Implement vertical slices: launch → inject → select → identify → settle → capture → persist. Avoid building empty abstractions for later phases.
6. Add or update tests with each slice and run them before moving on.
7. Do not implement the crawler, extension, distributed workers, AI control, or advanced animation CDP in the first pass.
8. Do not weaken browser security flags to make injection easier.
9. At the end, provide exact run commands, known limitations, test results, and the next smallest milestone.

## Autonomous execution contract

When this brief is invoked with the autonomous launch prompt below, begin implementation immediately after inspecting the repository. Do not stop after proposing a plan and do not wait for confirmation on routine technical choices.

Continue working through Phase 0 and Phase 1 for as long as useful progress can be made. This includes creating the project structure, installing ordinary project dependencies when authorized by the environment, implementing vertical slices, running tests, diagnosing failures, fixing defects, and repeating tests.

Use these rules while the user is away:

- Make reasonable, reversible assumptions and record consequential ones in `docs/adr/`.
- Prefer the simplest implementation that satisfies the current acceptance criteria.
- Do not pause to ask about naming, minor UX details, internal organization, formatting, or library choices that can be changed later.
- If one task is blocked, document the issue and continue with another independent Phase 0 or Phase 1 task.
- Never bypass permission prompts, weaken security controls, expose credentials, access unrelated files, publish anything, purchase anything, or interact destructively with external sites.
- Use only controlled local fixtures for interaction tests. External-site smoke tests must be read-only and may be skipped when network access is unavailable.
- Do not commit, push, deploy, or open a pull request unless the user separately authorizes it.
- Keep a running `PROGRESS.md` with completed work, current test results, assumptions, known failures, and the exact next action. Update it after every meaningful milestone so interruption is recoverable.
- Keep going until Phase 0 and Phase 1 acceptance criteria pass, a genuine permission/external dependency makes further progress impossible, or the execution environment ends the session.
- If Phase 0 and Phase 1 finish with time remaining, harden tests and documentation. Do not expand into the crawler, extension, distributed execution, or advanced animation work without separate authorization.

### Autonomous launch prompt

```text
You are starting at the repository root in a cloud checkout. Read ui-atlas/CLAUDE_CODE_IMPLEMENTATION_PLAN.md completely and execute it in autonomous mode. Perform all implementation work inside ui-atlas/.

Start building immediately. Work through Phase 0 and Phase 1 end to end: inspect the repository, create the implementation checklist, scaffold the project, implement each vertical slice, run tests, diagnose failures, fix them, and continue until the Phase 0 and Phase 1 acceptance criteria pass or you are genuinely blocked by a permission or external dependency.

Do not stop after giving me a plan and do not wait for my input on routine, reversible decisions. Make reasonable assumptions, record consequential decisions in docs/adr/, and maintain PROGRESS.md after every meaningful milestone. If one task is blocked, continue with other independent work. Use controlled local fixtures for interaction tests and keep external actions read-only.

Do not bypass security or permission controls. Do not publish, deploy, commit, push, purchase, submit forms on external sites, access unrelated files, or begin Phase 2+ without my explicit authorization.

Preserve all pre-existing repository changes. Do not modify sibling projects, including deploy/.

I will be away. Continue doing all safe, useful work available within this scope and leave the repository runnable, tested, and documented with exact commands and current test results.
```

## Technical references

- Playwright locator API: https://playwright.dev/docs/api/class-locator
- Playwright locator guidance and Shadow DOM behavior: https://playwright.dev/docs/locators
- Playwright browser/context and CDP attachment behavior: https://playwright.dev/docs/api/class-browsertype
- Playwright authentication state guidance: https://playwright.dev/docs/auth
- Playwright Chrome-extension constraints: https://playwright.dev/docs/chrome-extensions
- Chrome content-script isolation: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome Side Panel API: https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- Chrome DevTools Protocol DOM snapshots: https://chromedevtools.github.io/devtools-protocol/tot/DOMSnapshot/
- Chrome DevTools Protocol CSS forced pseudo states: https://chromedevtools.github.io/devtools-protocol/tot/CSS/
- Chrome DevTools Protocol animation controls: https://chromedevtools.github.io/devtools-protocol/tot/Animation/
- Chrome DevTools Protocol screenshot/screencast controls: https://chromedevtools.github.io/devtools-protocol/tot/Page/
