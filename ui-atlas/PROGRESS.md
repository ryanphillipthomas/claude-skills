# Progress

Running log for the build. Updated after each milestone so an interrupted
session is recoverable.

**Last updated:** 2026-08-11, after the static report landed.

## Status

Phases 0, 1 and 2 are complete and their exit criteria pass, with one
environment-bound gap recorded below. The repository is buildable, tested and
documented.

```
npm install
npm run build
npm test
```

## Test results

`npm test` (builds, then Vitest — unit and browser integration):

```
Test Files  16 passed (16)
     Tests  160 passed | 3 skipped (163)
  Duration  ~105s
```

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
| `integration/external-smoke` | 3 skipped | read-only public-site checks; skip without network |

`npm run typecheck` passes for all ten packages and for the test sources.

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

## Known failures

None. The only unverified item is the public-site half of the phase 1 exit
criterion, which is an environment limitation, not a failure — see above and
[docs/limitations.md](docs/limitations.md).

## Next smallest milestone

Phase 3 is the bounded crawler, and it is a much bigger step than anything so
far — it is the first part of the tool that visits pages nobody chose by hand.
The smallest useful slice, and the one everything else in phase 3 depends on:

**URL canonicalisation and a same-origin frontier, with budgets, and no clicking.**

1. Canonicalise scheme/host, drop fragments, normalise trailing slashes, apply
   configured query rules; deduplicate by canonical URL.
2. A frontier that only follows same-origin `<a href>`, honours include/exclude
   globs, and skips `mailto:`, `tel:`, downloads and logout/signout URLs.
3. Budgets enforced as hard limits: max pages, max depth, per-page timeout, total
   run timeout.
4. Nothing is clicked. Link discovery only. The `destructive.html` fixture
   already asserts an empty click log and should be wired into the crawl tests.
5. A resumable queue keyed deterministically, so an interrupted crawl restarts
   without duplicate records.

Recipes, worker concurrency and the suggested-interaction inventory build on top
of that frontier and should come after it, not with it.
