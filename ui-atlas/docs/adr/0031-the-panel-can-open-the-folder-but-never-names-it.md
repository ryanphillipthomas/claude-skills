# 31. The panel can open the folder, but never names it

- Status: accepted
- Date: 2026-08-12

## Context

Two things came out of using the guided flow for real.

**The flow stopped one step early.** It ended at "capture", which is where the
*tool's* job ends and where the user's very much does not: they still have to
see what they got, and find it on disk. A flow that ends at the moment of least
information is not a flow.

**The panel could not say where anything was saved.** For a tool whose entire
output is files, that is a strange gap — you press Capture, something happens
somewhere, and the only way to find out where is to read the terminal you may
not be looking at.

## Decision

### Five steps: … Review, Open

Steps 4 and 5 are **Review** (see what was written, and what each file is
called) and **Open** (reveal it on disk, or build the report).

Step 4 does not advance on a timer or on a capture count — it advances when the
Output section has actually been looked at. `reviewed` is set by `setOutput`,
so the flow follows what the user did rather than what we hoped they did.

Step 5's sentence switches from the page count to the **run** count, because by
then the question has changed from "what did I get on this page?" to "where is
all of this?".

### The panel shows file names; it never shows a path

`output/summary` returns a file name and a **run-relative** folder. Never an
absolute path.

This is not fussiness. The overlay lives in a shadow root with `mode: 'open'`,
so anything the panel renders is readable by the page it is injected into —
`document.querySelector('ui-atlas-overlay').shadowRoot.textContent` is all it
takes. A file name is derived from the site's own content and tells it nothing
it did not already know. `/Users/someone/…` would hand a website the user's
name and home directory.

`OverlaySession.outputLabel` already carried the comment *"a label, never a
filesystem path"*. This extends the same rule to the new surface rather than
quietly making an exception for it. A test reads the whole shadow root and
requires the output root and any `/Users/`-shaped path to be absent.

The absolute path still reaches the user — it is printed in the terminal, where
they started the run and where no website can read it.

### Reveal takes a target from a closed enum, never a path

`output/reveal` accepts `'folder' | 'report'` and nothing else. This is the one
method in the tool that hands something to the operating system, and a page that
could name the target could name anything. The host resolves both from the run
it owns.

The opener uses `spawn` without a shell, with the path as an argument rather
than interpolated into a command string, so a directory containing a space or a
quote is just a directory containing a space or a quote.

### The report is built on demand

Mid-run is exactly when someone wants to look, and the report is generated from
`captures.jsonl` rather than from live state, so there is nothing to wait for.
A failure to build returns a notice instead of throwing: the folder button still
works, and a broken report is not a broken run.

### The opener is injectable

`StartSessionOptions.opener` defaults to the platform one and is overridden by
the test harness with a recorder. That is what makes "opens the run folder, and
**only** ever the run folder" a testable claim rather than a comment — no window
opens during a test run, and the assertion is on the exact path.

A platform with no opener returns `opened: false` and a notice saying the path
is in the terminal, rather than failing.

## Consequences

- Two new bridge methods on the closed list: `output/summary` and
  `output/reveal`. Both were additions to `BRIDGE_METHODS`, which is a closed
  record precisely so this is an explicit act.
- `summariseOutput` re-reads `captures.jsonl` rather than keeping a list in
  memory, so it describes what is actually recorded — including a resumed run's
  earlier captures, which this process never made.
- The run label now appears twice in the panel: in the titlebar as identity, and
  in the Output section as the answer to "where is this saving?". An existing
  test asserted on a text match that this made ambiguous; it now names the
  titlebar. The duplication is deliberate — the two answer different questions.
- `FLOW_TOTAL` went from 3 to 5, so every "Step N of 3" in the tests and docs
  moved with it. The instruction list grew to match, and the existing test that
  every reachable position has an instruction kept both honest.
- The panel still cannot tell you the absolute path, on purpose. If someone
  wants it on screen rather than in the terminal, that is a decision to revisit
  deliberately — not something to leak by accident.
