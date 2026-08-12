# 25. The Animation button is a list, not a shutter

- Status: accepted
- Date: 2026-08-11

## Context

The toolbar has had a disabled **Animation** button since phase 1, sitting
beside Element, Viewport, Full page and Responsive set. Everything behind it now
exists: the inventory ([ADR 20](0020-animation-inventory-describes-without-touching.md)),
frame sampling ([ADR 21](0021-frame-sampling-restores-what-it-moves.md)),
provoked motion ([ADR 22](0022-provoked-motion-is-sampled-as-one-group.md)) and
the screencast fallback ([ADR 23](0023-a-recording-is-a-fallback-not-a-sample.md)).

This is the last unbuilt item in the brief's own list.

## Decision

### It opens a panel, because a shutter would have to guess

Every other capture button photographs something immediately, and can, because
what to photograph is unambiguous: the selected element, the viewport, the page.
An animation button has no such answer. A page has several animations, the user
means one of them, and **most of them cannot be sampled at all** — the fixture
alone has an infinite one, a scroll-driven one and a multi-iteration one.

A button that photographed "the animation" would have to guess which, and would
then fail for most pages. So the button lists, and the list is where the
decisions are made. The keyboard shortcut `Alt+A` does the same thing, for the
same reason.

### The panel offers only the action that would work

This is the whole point of the panel, and it is a straight reading of the four
ADRs behind it:

| Verdict | What the row shows |
| --- | --- |
| `sampleable` | **Sample** — a seek reproduces the frame every time |
| `infinite`, `indeterminate` | **Record** — a seek cannot, but a recording shows it |
| `scroll-driven` | nothing — a recording of a page that is not scrolling is a still |
| `instant` | nothing — there are no intermediate frames to show |

Every row without an action carries **the inventory's own reason** instead —
"it repeats forever, so it has no 100% to sample at" is the same sentence the
`animations` command prints. A test requires that no row is a dead end: an
action, or a reason, and never neither.

The alternative — offering Sample everywhere and failing afterwards — would
teach the user that the tool is unreliable, when in fact it is being careful.

### An animation is re-found by fingerprint, not by the index it was listed at

Seconds pass between listing and clicking. A transition can end in that time and
take every index after it along. So the host does not trust the recorded index:
it re-runs the inventory at capture time and matches the requested animation by
fingerprint (ADR 22's identity), and either finds the same animation or reports
that it is gone.

A test cancels every animation between listing and clicking, and requires the
job to fail with *"no longer running on this page"* rather than produce a
confident frame of whatever now sits at that index.

### Motion no animation list can see is named, with the one action that reaches it

`getAnimations` cannot describe a canvas, a WebGL scene or a video. The panel
counts them and says so, and offers **Record the page** — which is exactly what
[ADR 23](0023-a-recording-is-a-fallback-not-a-sample.md)'s screencast is for.
Without that, `media.html` would show an empty panel, and "nothing is animating"
on a canvas-driven page is a lie of omission.

### Listing is a read

Pressing the button pauses nothing, seeks nothing and captures nothing — the
inventory's contract, unchanged. A test presses it and then requires every
animation on the page to still be unpaused, and the capture queue to be empty.

That is what makes the button safe to press at any time, which is what makes a
panel a reasonable thing to put behind it.

## Consequences

- One new bridge method, `animation/inventory`. The toolbar runs in the page and
  cannot inventory anything itself: `getAnimations` is reachable from page
  script, but the frame walk, the classification and the record shape all live
  host-side, and duplicating them in the overlay bundle would be two
  implementations of one judgement.
- `CaptureRequest` gains `animationId`. The queue, the job kinds and the record
  shapes all already accepted `animation-frame` and `animation-video`; what was
  missing was a way to say *which*.
- `capabilities.animation` is now `true`, and the session no longer throws
  "Animation capture lands in phase 4" for the animation kinds.
- Recording from the toolbar opens a second browser context and loads the page
  again, as the CLI does — visibly, in an interactive session. A persistent
  profile cannot create that context, and the job fails saying so.
- The panel lists the page as it is *now*. It does not update itself when the
  page changes; **Refresh** re-reads it. Live-updating would mean watching every
  document for animation events, which is a much larger promise than a list.
- A hover transition is still absent from the panel, for the reason it is absent
  from the inventory: it does not exist until something provokes it. Reaching
  one from the toolbar would need the panel to hold a hover while it listed,
  which is the `captureAnimation` recipe step's job.
