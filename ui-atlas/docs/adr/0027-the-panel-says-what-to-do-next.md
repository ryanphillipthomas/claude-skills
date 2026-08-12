# 27. The panel says what to do next

- Status: accepted
- Date: 2026-08-12

## Context

The toolbar had accumulated every control the tool needs and no answer to the
question a person actually opens it with: *what do I do now?* Two specific
failures:

1. **Walking the DOM tree was arrow-keys-only.** The operation you want
   immediately after clicking slightly the wrong thing — select the parent — had
   no visible control at all. A shortcut list at the bottom of the panel is not
   discovery; it is a reference for someone who already knows.
2. **Nothing described the sequence.** Inspect → select → capture is three steps
   and it is not guessable, because "Inspect" reads as a mode rather than as the
   first step of anything.

## Decision

### One line, at the top, that changes with state

`nextStep` is a pure function from `{connected, inspecting, hasSelection, states,
capturedHere, workingJobs, pageLabel}` to a sentence and a position. The panel
renders it above everything else, because it is the answer to the question, and
the answer should not be below the controls it is about.

| State | It says |
| --- | --- |
| not connected | *Waiting for the UI Atlas session. Nothing is being captured yet.* |
| nothing selected, not inspecting | *Press Inspect, then move the pointer over the page…* |
| inspecting, nothing selected | *Click the element you want…* |
| selected, nothing captured here | *Pick the states you want, then press Capture. Right now: default, hover.* |
| jobs in flight | *Capturing 3 jobs… files land in this run as they finish.* |
| something captured here | *4 captures so far on /pricing. Select the next element, or open another page…* |

Two things this buys beyond instruction. **The capture button is never a
surprise** — the line names the states it is about to take, which was previously
only inferable from which chips looked pressed. And **progress beats
instruction**: while the queue is busy, saying what is happening is more useful
than repeating what to do next.

It is a pure function so the sentence can be tested without a browser, and so
there is one place where "what now?" is decided rather than a condition
scattered across four render methods.

### Three steps, numbered, and the instructions agree with the line

`Step 2 of 3` and a short numbered "How this works" panel, with the current step
marked. Three, not four: choosing states and pressing Capture is one step,
because it happens in one place at one time, and splitting it would have been a
number that looked like progress without being any.

A test asserts that every position `nextStep` can return has a matching
instruction, so the highlight can never point at nothing.

### Every keyboard-only operation gets a button

Parent, child, previous and next are now buttons, disabled until there is a
selection and titled with what they do. The arrow keys still work and are
unchanged; they are now the shortcut for a visible control rather than the only
way to reach a hidden one.

### The count is of captures, on the page you are on

`capturedHere` counts `captureIds` of *completed* jobs, not jobs requested — a
job that failed did not capture anything, and a state set of three produces
three. It is attributed to the page recorded **when the capture was asked for**,
because in a single-page app the location can change while the queue works.

The overlay watches for route changes in the frame loop it already runs, so
"4 captures on /pricing" does not sit there while the browser is on /checkout.

## Consequences

- `ToolbarCallbacks` gains `onMoveSelection`. The overlay already had
  `moveSelection`; it simply had no caller but the keyboard handler.
- The toolbar gains `setProgress`, and `main.ts` gains `refreshJobs` as the one
  place that recomputes both the queue view and the count.
- The instructions panel opens expanded. A first run is the case that matters,
  and someone who does not want it presses Hide — the state is per page load,
  because persisting overlay preferences would mean writing to the site's own
  storage, which this tool does not do.
- The flow line is derived state, recomputed on every render rather than
  cached. Every mutator that could change the answer calls `renderFlow`; a
  missed call would show a stale sentence, which is why the integration test
  drives the whole sequence through a real browser rather than asserting on the
  pure function alone.
- `nextStep` deliberately does not know about animations, viewports or the
  responsive set. They are branches off the main sequence, not steps in it, and
  numbering them would make the sequence look longer than it is.
