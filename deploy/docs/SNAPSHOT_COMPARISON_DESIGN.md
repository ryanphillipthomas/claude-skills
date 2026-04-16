# Snapshot Comparison Design

## Goal

Define how to capture and compare "before bug" and "after fix" evidence so reviewers can trust that a PR resolved the reported issue.

## What Counts as a Snapshot

A snapshot does not need to be limited to an image. The right snapshot type depends on the bug:

- UI bug
  Screenshot, cropped screenshot, or short screen recording.

- API or data bug
  JSON response, rendered payload, or normalized output file.

- Workflow bug
  Step log, state transition record, or assertion report.

- Layout bug
  Screenshot plus element metadata such as frame positions or accessibility labels.

The system should support multiple artifact types, but screenshots are the most likely first step for iOS regressions.

## Verification Contract

Every snapshot comparison should answer two separate questions:

1. Can we show the buggy state in baseline?
2. Can we show the corrected state in candidate?

This matters because "candidate looks fine" is not enough. If the baseline capture does not show the bug, the comparison is weak and may be non-deterministic.

## Comparison Strategy by Bug Type

### Visual UI regressions

Recommended approach:

- Navigate to the exact screen state.
- Capture baseline screenshot.
- Capture candidate screenshot.
- Optionally crop to the region of interest.
- Compute a diff image and similarity score.
- Pair the diff with a scenario assertion.

Best for:

- Missing elements
- Broken styling
- Layout shifts
- Wrong text or icon state

Weakness:

- Sensitive to non-deterministic content, animation, date/time, and live data.

### Functional fixes with visible output

Recommended approach:

- Run a scripted flow.
- Assert a visible success or failure condition.
- Capture a supporting screenshot.

Best for:

- Button flow failures
- Modal behavior
- Form submission bugs
- Navigation bugs

This is usually stronger than image diff alone because it gives both machine validation and human evidence.

### Data or backend-driven fixes

Recommended approach:

- Record normalized structured output for baseline and candidate.
- Diff the normalized files.
- Capture a UI screenshot only if it helps explain the result.

Best for:

- Sorting bugs
- State mapping bugs
- Missing fields
- Response handling bugs

## Requirements for Reliable Snapshots

To make comparisons trustworthy, the scenario should control as many variables as possible:

- Same device model or simulator
- Same OS version
- Same app configuration
- Same seeded test data
- Same account permissions
- Same locale and timezone
- Same feature flags
- Stable clock where possible
- Animations disabled when possible

Without this, image diff noise will create false positives and reviewer fatigue.

## Proposed Snapshot Flow

1. Prepare test state.
2. Launch baseline build.
3. Navigate to the target state.
4. Capture snapshot and assertions.
5. Repeat with candidate build.
6. Normalize outputs if needed.
7. Compare baseline and candidate.
8. Generate a reviewer summary.

## Comparison Output

Each comparison should emit:

- Verdict
  `verified`, `failed`, or `inconclusive`

- Assertion summary
  Which checks passed or failed for each ref

- Snapshot links
  Baseline, candidate, and diff artifacts

- Confidence notes
  Any instability or known noise in the scenario

- Reviewer notes
  Short explanation of why this does or does not prove the fix

## Recommended Decision Logic

Use both assertions and snapshots whenever possible.

Preferred matrix:

- Baseline fails expected assertion, candidate passes, snapshot difference supports the claim:
  `verified`

- Baseline and candidate both pass:
  `inconclusive`

- Baseline and candidate both fail:
  `failed`

- Assertions pass but snapshot is noisy:
  `verified` with warning

- Snapshot differs but assertions do not prove behavior:
  `inconclusive`

## Initial MVP

The first version should avoid expensive image intelligence and focus on deterministic evidence:

- One manually defined scenario per bug
- Simulator-based capture
- One baseline screenshot
- One candidate screenshot
- Optional cropped diff image
- A small JSON assertion report
- A markdown summary attached to the run

This is enough to validate the workflow before investing in a larger snapshot platform.

## Non-Goals for V1

- Pixel-perfect comparison across every screen
- Automatic bug reproduction generation
- AI-based judgment of whether the bug is fixed
- Full visual regression testing for the whole app

The goal is targeted proof for bug-fix PRs, not a complete visual QA replacement.

## Risks

- Baseline may no longer reproduce the bug if the wrong ref is selected.
- Test data drift may make snapshots meaningless.
- Dynamic content may create noisy diffs.
- Some bugs are not meaningfully provable with screenshots alone.
- If scenario setup is too manual, adoption will be low.

## Recommendation

For the first implementation, require each verified bug fix to provide:

- A scenario id
- Baseline ref
- Candidate ref
- A deterministic scripted path
- At least one assertion
- At least one supporting artifact

That gives the team a practical standard for "actual confirmation" without over-designing the system.

## Native iOS Execution Recommendation

Because the app is a native Apple app, the initial snapshot workflow should be executed with `XCUITest` on iOS simulator.

Suggested execution model:

- Build the baseline app for simulator.
- Run the `XCUITest` scenario and capture screenshots plus attachments.
- Build the candidate app for simulator.
- Run the same `XCUITest` scenario again.
- Export the screenshots and structured test outputs into the comparison artifact set.

Why this is the preferred default:

- Screenshot capture is already supported in Apple’s testing stack.
- Assertions and screenshots can live in the same test flow.
- The simulator environment is already part of the native iOS toolchain.
- It avoids introducing a second automation abstraction before the team has proven the workflow.

## Secondary Option

If the team later decides they need faster scenario authoring, `Maestro` is the best secondary option to evaluate for simulator-driven snapshot capture.

However, for V1 the recommendation remains:

- use `XCUITest` for simulator automation
- use screenshots plus assertions for evidence
- add more advanced visual tooling only if the first version proves too noisy or too expensive to maintain
