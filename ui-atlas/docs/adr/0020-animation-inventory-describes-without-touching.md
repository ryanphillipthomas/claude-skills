# 20. The animation inventory describes without touching, and says what it cannot sample

- Status: accepted
- Date: 2026-08-11

## Context

Phase 4 is animation capture. The brief's MVP is a list of steps that end in
sampling: discover animations, record their timing, pause them, sample at 0/25/
50/75/100%, restore everything.

The last two steps are where a tool of this kind usually starts lying. Sampling
an infinite animation "at 100%" produces a screenshot of an arbitrary moment
presented as an end state. Sampling a scroll-driven animation by seeking
`currentTime` produces a frame the site would never show at that scroll
position. Both look exactly like a successful capture.

So the first slice discovers and classifies, and captures nothing.

## Decision

### It reads, and only reads

`discoverAnimations` calls `document.getAnimations()` and reports what it finds.
It does not pause, seek, cancel, set a playback rate or touch `currentTime`.

An inventory that perturbed the animations it was describing would report a page
that no longer exists — and the restore step is exactly the part most likely to
be subtly wrong, so a slice that needs no restore is a slice that cannot get it
wrong. There is a test that snapshots every animation's play state and playback
rate before and after a full pass and requires them identical.

### Sampleability is the point, not a footnote

Every animation gets one of five verdicts, each with its reason:

| Verdict | Meaning |
| --- | --- |
| `sampleable` | Finite, time-driven, known duration. A seek reproduces a frame. |
| `infinite` | Repeats forever, so there is no 100% to sample at. |
| `scroll-driven` | Progress follows the scroll position, not the clock. |
| `indeterminate` | Duration is `auto`, or the timeline could not be identified. |
| `instant` | Zero duration or zero iterations: no intermediate frames exist. |

The scroll verdict is checked first and wins over everything else, because when
a scroll-driven animation is *also* infinite the reason it cannot be sampled is
the timeline, not the repetition — and the reason is what a person acts on.

For anything not driven by time, no `iterationDurationMs` is reported at all.
Offering a number there would invite precisely the seek that cannot work.

`durationMs` and `iterations` are **absent** rather than zero when the values are
`auto` and `Infinity`. A zero would be a lie with a number on it.

### Motion the API cannot see is counted, not omitted

A canvas painted by a `requestAnimationFrame` loop, a WebGL scene and a playing
video are all moving, and none of them is an `Animation`. "No animations found"
on a page driven entirely by canvas is a lie of omission, so those elements are
counted and named in a warning.

### A hover transition legitimately does not appear

A transition does not exist until something provokes it, so a page at rest has
none. This falls out of refusing to interact, and it is a real limitation rather
than a bug: the fixture's hover swatch is absent from the inventory, and a test
asserts both that absence *and* that hovering makes it appear. Reaching one is a
recipe's job.

### Frames are walked from the host

The host iterates `page.frames()` and evaluates once per frame, which reaches
cross-origin frames that page script could never touch. A frame that navigated
or detached mid-pass produces a warning naming it rather than losing the frames
that did answer.

## Consequences

- `animations.jsonl` joins the run's artifacts, and `ui-atlas animations <url>`
  is the one-shot command that writes it. Nothing is captured, so a run has no
  `captures.jsonl` — asserted, so the "describes only" property is structural
  rather than a matter of intent.
- Sampling gets a foundation it can trust: the slice after this one only has to
  sample what is already marked `sampleable`, and can refuse the rest by
  reading the verdict rather than re-deriving it.
- The inventory is not wired into `crawl` yet. It would be a small addition
  alongside the interaction inventory, and it is deliberately not bundled with
  this slice.
- `Document.getAnimations()` takes no options — `{ subtree: true }` is the
  `Element.getAnimations()` form, and the document-level call already covers the
  whole document.
- Nothing here uses the Chrome DevTools Protocol. CDP animation control is the
  brief's "advanced motion", and the Web Animations API answers the inventory
  question on its own.
