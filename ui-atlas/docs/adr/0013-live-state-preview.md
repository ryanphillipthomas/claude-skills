# 13. State chips apply the state to the live page

- Status: accepted
- Date: 2026-08-11

## Context

The toolbar's state chips selected which states a capture would include. They
did nothing visible. A user toggled "hover" on a real site, watched the page not
change, and reasonably concluded state capture was broken.

Worse, the two capture buttons disagreed: "Element" silently captured only
`default` while "State set" honoured the chips. Pressing the obvious one threw
the selection away without saying so.

## Decision

**One chip, two effects.** Clicking a state chip adds it to the capture set *and*
applies it to the live page, held until you click it off. Selecting a state that
produces no visible feedback is the most confusing thing this panel could do.

The host holds exactly one preview at a time (`state/preview`, `null` releases).
It is released when: the state is toggled off, a *different* element is selected,
the page navigates, or the session closes. Re-selecting the same element does not
release it — every element capture re-sends its probe, and dropping the preview
there would yank it out from under the user mid-click.

**Captures are never contaminated.** A capture applies its own state, so the
queued job releases any held preview first and restores it afterwards. Capturing
`default` while previewing `hover` produces a real default image.

**`active` is captured but never held.** Holding a mouse button down indefinitely
would take the pointer away from the user, who needs it to reach the toolbar. The
chip says so instead of pretending.

**One capture button, honestly labelled.** "Capture default" / "Capture 3 states"
— it names what it will do, and it always captures exactly what the chips show.
The old "Element" / "State set" pair is gone.

## Consequences

- After previewing, the page *is* in a non-default state until released. That is
  deliberate and visible in the toolbar, not residue — the phase 1 test now
  proves reversibility rather than asserting the states never happened.
- Hover preview ends the moment the user moves their physical mouse: in a headed
  browser the virtual and physical pointers are the same device. The toolbar says
  so when hover is previewed.
- Forced states (checked, expanded, …) mutate an attribute for as long as the
  preview is held. The chip shows the `forced` provenance and the undo runs on
  release.
