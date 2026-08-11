# Known limitations

Everything here is a deliberate boundary of the current release, not a bug
waiting to be filed. Where a limitation is visible in output, the record says so
in its `warnings` or its `error`.

## Not built yet (later phases)

| Area | Status |
| --- | --- |
| Responsive capture sets | The toolbar control exists and is disabled. Correct responsive replay needs a fresh context and a reload per viewport (so responsive JS that only runs at load initialises properly); that is phase 2. `viewport/set` resizes the current page and warns that a mobile *preset* is not real device emulation. |
| Static HTML report | `ui-atlas report <run-dir>` prints a terminal summary of the same artifacts the browsable report will be generated from. The HTML report is phase 2. |
| Crawler and recipes | `ui-atlas crawl` exits with a message. URL frontier, budgets, declarative recipes and the suggested-interaction inventory are phase 3. |
| Animation capture | The motion fixture exists; discovery and deterministic frame sampling are phase 4. The toolbar's Animation button is disabled. |
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

## Environment notes

- **External-site smoke tests** (`tests/integration/external-smoke.test.ts`) are
  read-only and skip themselves when the browser has no outbound network access.
  They were **skipped** in the sandbox this was built in, so the part of the
  phase 1 exit criterion that names three unrelated public sites is verified by
  code and by the fixture site, but has not been executed against live sites
  here. Run `npm run test:integration` on a networked machine to close that gap.
- `attach` mode is experimental: the attached browser's extensions, flags and
  profile all affect rendering. It warns on every use.
