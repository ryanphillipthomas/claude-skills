# 26. Captures are named from what they already know

- Status: accepted
- Date: 2026-08-12

## Context

Until now every artifact was called `cap-20260811T125501Z-7f3a91.png`. That name
is unique, sortable and completely opaque: to find the hover state of the Save
button you opened the report, or you opened sidecars until one matched.

The first instinct was to have a model look at the images and name them. It is
the wrong first move, because **most of the name is already in the record**. The
inspector scores locators, which means it has already read the element's ARIA
role, its accessible name and an excerpt of its text; the state controller has
already recorded which state was applied and whether it verified. The opaque
filename was not a hard problem, it was an unused one.

## Decision

### The filename is derived, never invented

`captureSlug` composes `<subject>--<label>--<state>`, each part from a field the
record already carries:

| Part | Where it comes from |
| --- | --- |
| subject | `element.role`, falling back to `element.tagName`; the capture kind for `viewport`, `full-page` and `recording` |
| label | `element.accessibleName`, falling back to `element.textExcerpt` |
| state | `state.name`, plus the free-text label for `custom` |
| frame | `animation.progress` as `frame-000`…`frame-100` |

`button--save-changes--hover.png`. Nothing is guessed: a capture with no
accessible name and no text gets a **shorter** name (`div--default.png`), never
a made-up one. No image is sent anywhere; the tool's local-first promise is
untouched by this change.

Frames are zero-padded because they are the one case where the listing order
matters — `frame-050` sorts between `frame-000` and `frame-100`, where `50`
would sort after `100`.

### `--` separates parts, `-` separates words

`sanitizeSegment` collapses runs of hyphens, which would turn
`button--save-changes--hover` into `button-save-changes-hover` and lose the
boundary between the component and its name. `sanitizeFileStem` is the same
function with that one rule relaxed, and every other guarantee kept: no
separators, no traversal, no Windows device name, never empty.

### Collisions get a numeric suffix, from a registry the writer owns

Two "Save" buttons on one page at one viewport is ordinary, and two identical
filenames would silently overwrite an image *and* its sidecar. `RunWriter` keeps
every `<dir>/<stem>` it has issued and appends `-2`, `-3`… The registry is
re-seeded from `captures.jsonl` on resume, so a run that restarts does not write
over the captures it already has — a test kills and resumes a writer to prove it.

Uniqueness lives in the writer rather than in `captureSlug` because only the
writer knows what it has already written. The slug function stays pure.

### The tree is the organisation; `index.md` is the map

The folder shape is unchanged — `screenshots/<route>/<viewport>/` — because it
was already right. What was missing was a way to read it. `finalize()` now
writes `index.md` at the run root and one inside every route folder, listing
each file with a sentence saying what is in it: the element, its accessible
name, the state, the viewport. Captures that produced **no** file are listed too,
under "Not captured here", with the reason — a gap you can see beats a gap you
have to notice.

The index is re-read from `captures.jsonl` rather than accumulated in memory, so
a resumed run's index covers the captures this process never saw.

Both indexes say plainly that renaming a file does not update `captures.jsonl`
or the sidecar beside it. That is the honest caveat for the workflow this is
built for: the names are a good starting point that a human is expected to
improve by hand.

### An unwritable index never fails a finished run

`finalize` writes the indexes before `run.json`, catches any failure and records
it as a run warning. The captures and their sidecars are already on disk by
then; losing a summary of them is not worth failing a run over, and a silent
loss is not acceptable either.

## Consequences

- `ScreenshotTarget` gains an optional `stem`. Callers that do not pass one still
  get the capture id, so nothing can go unwritten for want of a name.
- `screenshotPath` and `videoPath` stay pure and do **not** reserve a name;
  `writeScreenshot` and `writeVideo` are what claim one. A caller that resolves a
  path and writes to it itself would bypass the registry — nothing in the tool
  does, and the two write methods are the supported route.
- Filenames now depend on the page's content, so a site that renames a button
  renames a file. That is the point, and it is why `captures.jsonl` remains the
  stable record: ids did not change, only the filenames did.
- Names are order-dependent when they collide: whichever capture ran first gets
  the unsuffixed name. This is honest — they really are two things a person would
  give the same name — and the sidecar beside each says which is which.
- A route index links a recording with `../../`, because recordings live under
  `animations/` while the index sits under `screenshots/`. A plain prefix strip
  would have produced a broken link, which a test now prevents.
