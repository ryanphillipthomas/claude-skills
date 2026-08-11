# 6. Failed and skipped captures are records, not exceptions

- Status: accepted
- Date: 2026-08-11

## Context

The brief's `CaptureRecord` sketch has a required `image` and an optional
`error`. It also asks that a failed capture not terminate the run and that the
report show failed and skipped captures as first-class rows.

Those two things pull in opposite directions: a capture that failed has no
image.

## Decision

`CaptureRecord` gains a required `status: 'captured' | 'failed' | 'skipped'`, and
`image` becomes optional — absent exactly when `status !== 'captured'`.

- `captured` — an image exists and its checksum and pixel dimensions are recorded.
- `failed` — something went wrong (element gone, navigation mid-capture, write
  failure). `error` carries a stable code.
- `skipped` — the capture was *deliberately* not taken because the state could
  not be reached honestly (for example `focus-visible` where no real keyboard
  interaction produced a focus ring, or `checked` on an unchecked control when
  forced states are disabled). `error` explains why.

The distinction matters: `failed` is a defect to investigate, `skipped` is the
tool declining to fabricate.

Additional fields beyond the brief's sketch, all optional:
`state.verified` / `state.verification` (evidence the state applied),
`styleDelta`, `set` (grouping for state/responsive sets), `durationMs`.

## Consequences

- Reports can count and filter on `status` without inspecting `image`.
- The schema version stays 1: these fields were added before anything shipped.
- Every writer path validates against the schema before touching disk, so a
  record that cannot be read back is caught at its source.
