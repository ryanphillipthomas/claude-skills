# Progress

Running log for the build. Updated after each milestone so an interrupted
session is recoverable.

**Last updated:** 2026-08-11, after responsive replay landed.

## Status

Phases 0 and 1 are complete and their exit criteria pass, with one
environment-bound gap recorded below. **Responsive replay** — the first slice of
phase 2, authorised separately — is also done. The repository is buildable,
tested and documented.

```
npm install
npm run build
npm test
```

## Test results

`npm test` (builds, then Vitest — unit and browser integration):

```
Test Files  14 passed (14)
     Tests  140 passed | 3 skipped (143)
  Duration  ~90s
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
| `integration/external-smoke` | 3 skipped | read-only public-site checks; skip without network |

`npm run typecheck` passes for all nine packages and for the test sources.

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

Smaller assumptions, not worth an ADR:

- `--headless` and `UI_ATLAS_HEADLESS=1` exist so the same commands run in CI.
- `ui-atlas capture` is an addition to the brief's command list: it is what makes
  the phase 0 exit criterion a single command, and it is the CLI's smoke test.
- `ui-atlas report` prints a terminal summary now; the browsable report is
  phase 2 and will read the same artifacts.
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

## Known failures

None. The only unverified item is the public-site half of the phase 1 exit
criterion, which is an environment limitation, not a failure — see above and
[docs/limitations.md](docs/limitations.md).

## Next smallest milestone

**The static HTML report** — the remaining half of phase 2, and the thing that
makes a responsive matrix legible instead of a folder of PNGs:

1. Generate `report/index.html` into the run directory from `captures.jsonl` and
   `pages.jsonl`, self-contained and read-only, with images referenced by their
   relative paths.
2. A state matrix and a responsive matrix for a selected component, driven by
   `set.id` / `set.member` / `state.name` — the grouping is already on every
   record.
3. Failed and skipped rows shown as first-class cells, carrying their error code
   and reason, so a hidden-at-tablet outcome reads as a result rather than a gap.
4. Filters for route, viewport, role, state, provenance and warnings; duplicate
   grouping by image SHA-256 (`summariseCaptures` already computes it).
5. Nothing about authentication in the output: no storage state, no request
   headers, no secrets.

`ui-atlas report <run-dir>` already reads exactly these artifacts for its
terminal summary, so the data layer is proven; this is the presentation.
