# 11. Responsive sets replay the route in a fresh context per viewport

- Status: accepted
- Date: 2026-08-11

## Context

"By default, create a fresh page/context and reload the route for each viewport
so responsive JavaScript initializes correctly."

The cheap implementation is `page.setViewportSize()` in a loop. It is wrong in
two ways. Layout code that runs once at load — a breakpoint decision written to
a data attribute, a carousel that counts visible slides, anything behind a
`DOMContentLoaded` handler — never re-runs, so the screenshots show a layout the
site would never actually produce at that width. And touch, user agent and
device scale factor are context-level in Chromium, so a resized desktop window
is not a phone no matter how narrow it gets.

## Decision

`ResponsiveRunner` replays the route once per configured preset. For each:

1. A **fresh browser context** with that preset's emulation — viewport, device
   scale factor, `isMobile`, `hasTouch`, and a mobile user agent for mobile
   presets.
2. Seeded with `storageState()` taken from the live session context, so a
   signed-in replay stays signed in and cookies set during the session carry
   over.
3. Its **own navigation** to the route, its own settle pass, its own
   re-resolution of the element, then the captures.
4. The context is closed in a `finally`.

The session's own page is never touched. The user keeps looking at whatever they
were looking at while the set runs in background contexts.

Records are grouped by `set: { id, kind: 'responsive', member: <viewport> }`.

**Per-viewport outcomes are results, not failures.** Captures in a responsive
run use `elementAbsentOutcome: 'skip'`, so:

| Situation | Record |
| --- | --- |
| element resolves and is visible | `captured` |
| element is not in the DOM here | `skipped`, `locator.not-found` |
| element exists but no candidate resolves uniquely | `skipped`, `locator.ambiguous` |
| element resolves but is not rendered | `skipped`, `locator.hidden` |
| the context or navigation itself failed | no record; a warning naming the viewport |

Outside a responsive run the default stays `fail`: if you asked for one specific
element and it is not there, that is a defect, not an observation.

A **persistent profile** (`browser.mode: profile`) owns its only context and
cannot create more, so responsive replay there degrades to a resized page in the
same context, the viewport is recorded as `mobile: false`, and every mobile
preset carries a warning naming the modes that do support emulation.

## Consequences

- A five-viewport set costs five navigations. That is the price of correctness;
  the alternative is fast and wrong.
- The test that proves the reload reads it out of the artifacts: the fixture
  writes its layout mode once at load, and the captured images for the two
  "wide" presets are byte-identical while the "medium" one differs. A
  resize-only implementation would produce three identical images.
- Element-level responsive sets re-resolve at every viewport, which is what makes
  the honest hidden/not-present outcomes possible.
