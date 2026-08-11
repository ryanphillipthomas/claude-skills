# 21. Frame sampling moves one animation, and puts it back

- Status: accepted
- Date: 2026-08-11

## Context

[ADR 20](0020-animation-inventory-describes-without-touching.md) built an
inventory that describes animations and touches nothing, and classified each as
`sampleable` or not. This slice photographs the sampleable ones.

Unlike everything before it, sampling *must* change page state: an animation has
to be paused and seeked to be photographed at a chosen moment. That makes
restoration the whole risk. A capture run that leaves a site's animations paused
half way through has silently broken the page the user is still looking at.

## Decision

### Only what the inventory already approved

`sampleAnimations` samples records whose `sampleability` is `sampleable` and
nothing else. Every other record comes back as a skip carrying **the inventory's
own reason**, not a new one invented here — so "not sampled: drift — it repeats
forever, so it has no 100% to sample at" is the same sentence the inventory
already gave.

The judgement lives in one place. The sampler never re-derives it and never
overrides it.

### Restore in a `finally`, defensively, and prove it

Every animation is read before it is touched (`currentTime`, `playbackRate`,
`playState`, `startTime`) and put back in a `finally`. Each restore step is
guarded individually: a restore that throws half way is worse than one that does
as much as it can and reports what it could not.

Order matters. Setting `currentTime` on an **idle** animation makes it paused,
so an idle animation is cancelled instead of seeked. A **running** animation has
its `startTime` restored after `play()`, which puts it back on the same clock
rather than restarting it from where it was paused.

Two tests carry this: one samples every animation on the fixture and requires a
snapshot of *all* animations' play state, time and rate to be identical
afterwards; the other throws from the capture half way through and requires the
same.

### Offsets are within one iteration

`0, 0.25, 0.5, 0.75, 1` of **one iteration**, not of the whole active duration.
One iteration is the keyframe progression, which is what a design reference is
for; "50% of three iterations" is a moment nobody asked about. A multi-iteration
or `alternate` animation says so in the frame's `limitations`.

### An animation is addressed by position, not by name

Two elements sharing a `@keyframes` name is completely ordinary — the motion
fixture has exactly that, one finite and one infinite `drift`. A name identifies
a *rule*, not an animation.

The inventory therefore records each animation's index in its document's
`getAnimations()` list, and the sampler addresses it by that index, then
*verifies* the name and target match. A page that changed in between yields
"could not be found again" rather than a confident frame of the wrong animation.

The first implementation matched by name, and would have sampled the infinite
`drift` while labelling it the finite one. Caught by a test.

### `animations: 'disabled'` had to be turned off for these frames

Playwright's screenshot option that the rest of the tool relies on —
`disableAnimations`, which stops motion so a still is deterministic —
**fast-forwards finite animations to completion** and cancels infinite ones. On
a frame that has just been seeked to 25%, that throws the seek away and
photographs the end state.

`animation-frame` captures therefore use `animations: 'allow'` regardless of
config. That is safe precisely because the animation is already paused: nothing
is moving for the shutter to catch.

### The record says what it does not promise

`AnimationSample.limitations` is filled in, not left empty. `fill: none` at 100%
shows the un-animated element, which looks exactly like a capture that failed;
a multi-iteration or reversed animation means one iteration is not the whole
story; a page-set playback rate is ignored by a seek. Each of those is stated on
the frame that has it.

The capture's `state` stays `default` with honest provenance. The animation
position is forced, but the *state* — hover, focus, active — genuinely is
default, and `animation` carries the truth about the moment.

## Consequences

- `animation-frame` captures element-or-viewport. When the animated element
  cannot be located, the frame falls back to the viewport rather than failing:
  the frame is still what was asked for.
- Frames of one animation share a `set: { kind: 'animation' }`, so the report's
  existing matrix grouping can show them side by side.
- `animation-video` remains unimplemented. A screencast fallback is for motion
  that cannot be represented as keyframes at all, and nothing here needs it yet.
- Sampling needs the probe injected, for the same reason recipes do: an element
  capture must describe its element exactly as the inspector would.
- The whole-page clock is not stopped. Only the animation being sampled is
  paused, so a page with several running animations shows the others wherever
  they happened to be. Freezing everything would be a bigger lie, not a smaller
  one — the frame would show a composite moment that never existed.
