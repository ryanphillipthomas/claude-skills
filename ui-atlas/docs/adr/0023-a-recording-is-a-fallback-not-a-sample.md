# 23. A recording is a fallback, and never a sample

- Status: accepted
- Date: 2026-08-11

## Context

Three slices of phase 4 built an animation inventory
([ADR 20](0020-animation-inventory-describes-without-touching.md)), deterministic
frame sampling ([ADR 21](0021-frame-sampling-restores-what-it-moves.md)) and
provoked motion ([ADR 22](0022-provoked-motion-is-sampled-as-one-group.md)). All
three refuse to photograph motion they cannot photograph *honestly*, and each
one names what it left out and why.

That leaves a growing list of motion the tool can describe and never show: an
animation that repeats forever, one whose duration is `auto`, and the canvas,
WebGL and `requestAnimationFrame` motion the Web Animations API cannot see at
all. `animation-video` has been a stub throwing "not implemented yet" since
phase 0 defined the capture kinds. This is it.

## Decision

### A recording is not a sample, and the record must not let it pass as one

`AnimationSample` carries a `progress` and a `currentTimeMs`. There is no honest
progress for a recording of an animation that never ends, and no honest
`currentTimeMs` for a canvas nobody can time. Attaching a sample with an invented
`progress: 0.5` would be exactly the quiet dishonesty sampling exists to avoid.

So an `animation-video` record carries **no `animation` field at all**. It
carries a `Screencast` instead: what the recording is *of*, how long the window
was, how far into the file the window starts, whether a budget cut it short, and
what it does not promise. A test asserts the absence of `animation` directly.

This corrects the plan that preceded this slice, which assumed
`AnimationSample.method: 'screencast'` was waiting for this. It is not: the
enum member stays unused, because using it would require a number nobody has.

### What it records, and what it refuses to

Recorded: `infinite` and `indeterminate` animations, and any canvas, WebGL or
video element on the page.

Refused, each with a reason on the record:

- **`sampleable`** — it already has exact frames, and a recording of it would
  imply the frames were not enough.
- **`instant`** — there are no intermediate frames to record.
- **`scroll-driven`** — and this is the important one. A scroll-driven animation
  advances with the scroll position. Recording a page that is not scrolling
  produces a *still*, which looks exactly like a recording that failed. A
  broken-looking artifact is worse than an honest absence, so scroll-driven
  motion stays out until something actually scrolls the page.

### It gets a browser context of its own, and says what that costs

Playwright records a **context**, not a page, and only finishes the file when the
context closes. Borrowing the caller's context is therefore impossible: the file
would not exist until the whole run ended, and would contain the whole run.

So a recording opens a short-lived context, loads the page again, waits, and
closes. The cost is real and is recorded rather than hidden: the file begins with
that second page load, and `leadInMs` says how far in the part you asked about
starts. The report prints it as "starts at N ms in".

A persistent profile owns its only context and cannot create a sibling, exactly
as with crawl workers ([ADR 11](0011-responsive-replay.md)). That is a
warning and a skip, not a failure.

### Every bound is hard, and exceeding one is a skip rather than a failure

An infinite animation has no natural end, so the tool has to supply one:

- `maxDurationMs` (5s) caps the window. When the wanted window — `iterations`
  loops of the longest subject — does not fit, the record says `truncated: true`
  and a limitation states what was wanted and what was taken.
- `maxBytes` (10MB) is checked by `stat` on the finished file, before it is read.
  A runaway recording must not become a runaway allocation on the way to being
  rejected. Over budget, the file is discarded and a **`skipped`** record is
  written with `capture.over-budget`: the budget doing its job is not a broken
  run, and a silent absence would be indistinguishable from never having tried.

`capture.over-budget` is a new error code. Every existing one either blames the
page or blames the tool, and this blames neither.

### The frame rate is not recorded, because it is not known

Playwright does not expose the rate it recorded at, and decoding the WebM to find
out is a bigger dependency than this slice earns. So no frame rate is written,
and a limitation says times read off the file are approximate. A plausible-looking
`fps: 25` would be a number that reads like a measurement and is not one.

### The report plays it, and only where playing is what you want

A capture with no image is not automatically a failure; the report now shows a
recording where the thumbnail goes. Player controls appear **only in the detail
panel**, because a card and a matrix cell are both buttons and a `<video
controls>` inside one swallows the click that opens the panel — found by a test
that could no longer open the detail view.

## Consequences

- A recording is pixels, like a screenshot, so it needs no special handling
  beyond what screenshots already have. That is unlike a trace
  ([ADR 19](0019-traces-are-kept-only-for-failures.md)), which records request
  headers and therefore the session cookie: recordings are linked from the
  report, traces still are not.
- It is off by default: `--video`, or `capture.animation.video.enabled`. A second
  page load and a second context are not something to spend without being asked.
- It is a one-shot `animations` command feature, not a crawl feature. Recording
  every page of a crawl would be a very different budget conversation.
- The browser records into a scratch directory *inside the run* rather than the
  system temp directory, so an unclaimed recording is visible where the rest of
  the run's mess would be. It is removed in a `finally` either way, and a test
  requires nothing is left behind after both outcomes.
- A recording is written with the same sidecar JSON a screenshot gets. No
  artifact in this tree is separated from the metadata that explains it.
- `animation-video` no longer routes through the screenshot path at all. Asking
  `CaptureService.capture` for one now says to use `captureVideo`, rather than
  saying it is unimplemented.
