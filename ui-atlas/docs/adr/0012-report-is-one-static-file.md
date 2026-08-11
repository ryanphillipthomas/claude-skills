# 12. The report is one static file, and it treats capture data as hostile

- Status: accepted
- Date: 2026-08-11

## Context

"Generate a self-contained, read-only local report from run artifacts." It needs
filters, a state matrix, a responsive comparison, screenshots with their
metadata and locator candidates, computed-style deltas, duplicate grouping, and
failed/skipped captures as first-class rows. It must not embed authentication
material.

## Decision

**One file, no server, no build.** `ui-atlas report <run-dir>` writes
`<run-dir>/report/index.html`. The stylesheet and the viewer are inlined; the
model is embedded as JSON. Opening it from `file://` makes zero network
requests, and a test asserts that.

Images are *referenced* by relative path (`../screenshots/...`) rather than
base64-inlined. The unit you share is the run directory, and a report with a
few hundred inlined screenshots is a file no browser wants to open. The
inlining that does happen — CSS and JS — is what makes the file work with no
server at all.

**Capture data is hostile input.** Accessible names, visible text and URLs all
come from the inspected website, and the report is opened locally where script
would run with access to the user's disk through relative paths. Three rules:

1. The model goes in a `<script type="application/json">` block, not as
   executable JavaScript, with `<`, `>`, `&`, U+2028 and U+2029 escaped so no
   value can close the block.
2. The viewer renders every string through `textContent`. There is no
   `innerHTML` anywhere in `packages/reporter/src/app/`, and adding one would be
   a security bug.
3. Markup the generator writes itself goes through `escapeHtml`.

An integration test captures three elements whose accessible name, text and
title are XSS payloads, then opens the real report in a real browser and asserts
the payloads render as literal text and nothing executed.

**Matrix orientation adapts.** Whichever of viewports/states has more members
becomes the columns, so the thing being compared is always side by side: five
viewports of one state read across, and five states at one viewport read across
too. (Fixing this also caught a bug — a state set's `set.member` is a *state*
name, and reading it as a viewport label turned a five-state matrix into a
diagonal of five one-cell "viewports".)

**Nothing sensitive is embedded.** The model carries no storage state, no
cookies, no request headers, and no absolute filesystem paths — only the profile
*name* from the manifest. A unit test asserts the serialised model contains
none of those.

## Consequences

- The report lives in `packages/reporter`, not the `apps/report` the brief
  sketched: there is no server and no separate build, so an app would be a
  directory with one function in it.
- Moving `index.html` away from its run directory breaks the images. That is the
  right trade — the directory is the artifact.
- The viewer re-groups filtered captures in the browser using the same pure
  functions the generator uses, so filters and matrices can never disagree.
