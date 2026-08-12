# 22. Motion you have to provoke is sampled as one group

- Status: accepted
- Date: 2026-08-11

## Context

[ADR 20](0020-animation-inventory-describes-without-touching.md) built an
inventory that refuses to interact, and recorded the honest consequence: **a
hover transition does not exist on a page at rest**, so it is absent from the
list. [ADR 21](0021-frame-sampling-restores-what-it-moves.md) then sampled what
the inventory could see.

This slice reaches the motion neither of them could: the transition that only
exists once something provokes it. That is most of the motion in a design
system — hover states, focus rings, the thing a card does when you point at it.

## Decision

### The provocation lives inside the step

`captureAnimation` hovers or focuses the element itself rather than relying on a
`hover` step written before it. Two reasons, and both are about correctness
rather than convenience:

1. Knowing which animations an interaction *started* means holding the list from
   before it. Once a separate `hover` step has run, that list is gone.
2. A 200ms transition provoked by one step and sampled by the next has usually
   finished in between. `getAnimations()` drops a transition the instant it
   ends, so the sampler would find nothing and say so — correctly, and
   uselessly.

So the shape is: inventory, provoke, inventory, and the difference is the
answer.

### `captureAnimation` cannot click

`hover` and `focus`, and nothing else. A click is the one interaction that can
change the world, so it stays a step somebody wrote on purpose; a step whose
job is "photograph some motion" must never be the thing that submits a form.
A test points `captureAnimation` at `destructive.html`'s *Delete account* button
and requires the fixture's audit log to stay empty.

### Identity for the diff is what an animation *is*, not where it sits

Not the index — provoking a transition inserts it into `getAnimations()` in
composite order, which shifts everything after it, so the same animation has
different indices either side of one hover. Not `animationId` either, which
falls back to a position-derived label whenever the page did not set
`Animation.id`, which is nearly always.

What is left is document, kind, keyframe rule or transitioned property, and
target element. The comparison is a **multiset** difference: a row of identical
cards is ordinary, and collapsing them to one identity would silently drop half
of what an interaction started.

One limitation follows and is documented: an interaction that *restarts* an
animation which was already running looks exactly like one that left it alone.

### A group is photographed as one moment, on one clock

Hovering the fixture's swatch starts two transitions — `transform` and
`background-color` — at the same instant. They are one visual event. Sampling
them one at a time, as ADR 21 does for ambient animations, would produce a frame
with the transform half way and the colour still at its start: a composite that
never existed.

So every member is paused *first*, then all of them are seeked to the **same
absolute time** and photographed once. `progress` is therefore a fraction of the
interaction's span rather than of any one animation's iteration, and the span is
however long the last member takes.

That is deliberately different from ADR 21, where `progress` is a fraction of
one iteration. The two answer different questions. For a single animation, "50%"
means half way through its keyframes, which is what a designer asks for. For a
group it must mean the same instant for every member, or it is not a moment at
all. A member with a shorter duration reaches its own end partway through and
holds its end value — which is exactly what the page does — and the frame says
so in `limitations`.

### Offsets are always seeked in ascending order

A CSS transition is removed from `getAnimations()` the instant it finishes. A
seek that goes backwards afterwards lands on an animation the document no longer
has: it changes nothing, throws nothing, and yields a frame that looks exactly
like every other frame while showing the wrong moment.

Moving only forwards is the one order in which every frame is the moment it
claims to be. Nothing is lost by sorting, because each frame carries the offset
it was taken at. `--offsets 1,0.5,0` was a silent wrong-frame bug until a test
required the middle frame to actually be in the middle.

### Release last, and never photograph the way back

Every member is restored — the ADR 21 machinery, unchanged — and only then is
the provocation released. Letting go of a hover starts the transition running
*backwards*, and a reverse transition photographed as though it were the forward
one would be a frame that looks right and is wrong. Because every capture
happens strictly before the release, there is no reverse frame to mistake.

Releasing a hover is `mouse.move(0, 0)`; there is no `unhover`. A page with
something interactive in its top-left corner will get that hovered instead,
which is worth knowing and is not worth a cleverer heuristic.

The release runs in a `finally`, so a capture that throws still lets go.

### Backwards fill is not a caveat for a transition

`limitationsFor` warns that `fill: none`/`backwards` means 100% may show the
un-animated state rather than the final keyframe. That is right for a CSS
animation and wrong for a transition: past its end a transition falls back to
the underlying style, and for a transition provoked by a hover that is still
applied, the underlying style *is* the value it was transitioning to. The
warning is now suppressed for transitions, so the frame most likely to be looked
at does not carry a false alarm.

## Consequences

- `@ui-atlas/crawler` now depends on `@ui-atlas/animation`. The probe stayed
  injected because it was one function; this is a whole capability, and the
  alternative was scattering the interesting logic across the wiring.
- The animations an interaction provoked are written to `animations.jsonl` like
  any other, so "what does this button do when you point at it" is answerable
  from the artifacts without opening an image.
- The step needs the probe injected, like every other element capture.
- The whole-page clock is still not stopped (ADR 21). Only the provoked group is
  frozen; the page's own animations keep running and are asserted to.
- Nothing here reaches motion driven by canvas, WebGL or video, or by scrolling.
  Those remain what they were.
