# 34. The panel is designed twice, not inverted once

- Status: accepted
- Date: 2026-08-12

## Context

Design turn 3 has two screens: 3a, the inspector at a native macOS standard, and
3b, "Light · compact — designed, not inverted".

Neither had been built. The panel had every *feature* turn 3 describes — the
five-step flow, the tabs, the states grid, the output list — and none of its
appearance: a slate-and-indigo palette inherited from the first prototype,
`#0f172a` panels, `#2563eb` buttons, a magenta primary. It was reported the only
way this kind of thing is: "why don't I see the new UI, I'm confused".

The launcher built for turn 6 *was* built from the design, so the two surfaces of
the same tool did not look like the same tool.

## Decision

### Every colour is a token

`:host` declares the palette; nothing below it names a colour. That is what
makes a second appearance possible at all — the previous stylesheet had 60-odd
literal hexes spread through 40 rules, and a light theme would have meant
editing every one of them and missing some.

### The light theme redefines the tokens; it does not invert them

An inversion is the cheap version of this, and it is wrong in ways that are easy
to see once stated. Apple's light and dark semantics are not reflections of each
other:

| | Dark (3a) | Light (3b) |
| --- | --- | --- |
| Accent | `#0a84ff` | `#007aff` |
| Success | `#30d158` | `#248a3d` |
| Selection | `#ff375f` | `#ff2d55` |

No inversion produces those pairs. An inversion would also turn a translucent
dark scrim into a muddy translucent white one, and would make the panel's
shadow — which reads as depth in both — into a glow.

The panel follows the **operator's** system appearance, not the captured page's.
It is hidden before every capture, so its theme can never reach an artifact.

### 3a's chrome, at last

340pt wide, 12px corners, a 38px title bar, 0.5px hairlines, SF text and SF Mono,
and the translucent scrim with a backdrop blur that the design draws over a live
page.

## Consequences

- The one test that pinned the panel's background to `rgb(15, 23, 42)` now
  compares it against the panel's own `--ua-surface` token, so it asserts what
  it always meant — the background is the panel's and not one the page imposed —
  without depending on the appearance the test runner happens to be set to.
- Two tests cover the pair: that the palettes differ in the specific ways above,
  and that a spread of real elements repaints between appearances. The second
  is what catches a rule left on a literal colour, which is how a half-themed
  panel happens.
- 4b remains unbuilt, and deliberately: ADR 25 chose a list over a scrubbable
  timeline, because most animations cannot be sampled and a timeline would have
  to guess which one was meant.
