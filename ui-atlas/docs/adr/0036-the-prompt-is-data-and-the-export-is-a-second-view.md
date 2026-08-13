# 36. The prompt is data, and the export is a second view

- Status: accepted
- Date: 2026-08-13

## Context

Collecting reference material is not the goal; handing it to something that will
build a design system is. That handover has two halves, and both were being done
by hand: writing a prompt that describes what was captured, and picking out the
files to attach.

Both halves have the same failure mode. A prompt that says "build a design
system from these screenshots" invites a model to fill every gap with something
plausible, and a folder of files called `button--save-changes--hover.png` next to
`viewport--default-2.png` gives it no order to read them in.

## Decision

### The prompt is a list of stages, in one file, as data

`packages/reporter/src/design-prompt.ts` exports `DESIGN_PROMPT_STAGES`: an id,
a title, an intent, an optional `applies` predicate, and a `body` function from
observed facts to text. Everything above a marked line in that file is prose;
everything below it is plumbing.

This is the part of the tool most likely to be wrong on the first try and most
likely to keep changing, so changing what it asks for means editing prose in one
place and rebuilding — not tracing string concatenation through a page renderer.
The stage list is exported rather than hidden, so a caller can render one stage,
all of them, or a subset; the page shows each with its own copy button, and
`ui-atlas project <name> --prompt <stage>` prints one to stdout.

The stages are Foundations, Components, Refinement at Apple precision, Motion
and Screens. Each assumes the previous one's output, so they run in order.

Two rules the stages are written under:

- **Only say what was observed.** Every number, route, component and colour in a
  built prompt came off a capture record or a token scan. It may say "34
  elements used `#2563eb`"; it may not say "your primary colour is `#2563eb`",
  because nothing measured that. Same rule the token report already lives under
  (ADR 24).
- **Say what is missing too.** A prompt that lists three viewports and stays
  quiet about the fourth invites invention. Where the material is thin the stage
  says so — a project with no token scan gets a paragraph explaining that no
  scan has run and that estimates must be labelled, rather than an absent
  section.

A stage whose `applies` is false is omitted and *listed as omitted*. Asking for
a motion system from a project where nothing moved is asking for fiction.

### `ProjectFacts` is derived once and shared

The page and the prompt read the same object. A prompt claiming four viewports
next to a page listing three would be worse than either alone, so there is one
derivation (`project-facts.ts`) and both consume it.

### Export names start minimal and grow only where they must

`planDesignExport` plans the whole set in one pass, because a name can only be
known to be unique relative to the other names in the set — there is no
per-file version of this function that could be right.

Names sort into reading order: `NN-page-…` first, then `NN-component-…`, then
`NN-motion-…`. Pages sort by route then widest viewport first. Components sort
by *identity* first, so a component and its hover, focus and active shots land
together; sorting components by route would scatter a state matrix across the
set, which is the one thing a matrix exists to prevent.

Each name starts as the shortest thing that could work, and gains a qualifier —
viewport, then route, then session — only when something else would otherwise be
called the same thing. So `button-save-hover` stays `button-save-hover` unless
there really are two of them, and when there are, the part that differs is the
part that appears. Anything still identical after every dimension has been tried
genuinely is two captures of the same thing and gets a counter.

The group is in the name because a file torn out of the set should still
announce whether it is a screen or a button.

### The export copies; it never renames in place

A capture record, its sidecar and its image are a set that points at each other,
and the run index has been warning since the beginning that renaming an image
breaks it. So `exports/` is a *second* view of the same files, produced for
somewhere else, safe to delete and regenerate. Re-running clears the folder
first, so a name this run no longer assigns cannot linger.

The project page lists the export name for every file before the export exists,
so you can see what you would get without producing it.

### The folder is the attachment; the zip is the parcel

A handover is a prompt *and* its images, and the images were the half you had to
go and find. There are two shapes for that and they are not interchangeable:

- **Loose files in a folder** are what you attach. A design tool reads a PNG; it
  cannot read a zip, so an archive is the wrong thing to drag into one.
- **An archive** is what you send. It travels as one item and carries
  `manifest.json`, which says which session each image came from.

So an export writes both, and every surface leads with the folder. `--no-zip`
opts out, because the archive is a third copy of the bytes and a large crawl
makes that real.

Only one surface here can open Finder, and it is not the page: `index.html` is
opened from `file://`, where there is no way to reveal a directory, build an
archive, or run a command. So the page offers what a static page genuinely can —
a link to the folder, a `download` of an archive that is already on disk — and
prints the command for the rest instead of drawing a button that would do
nothing. The launcher, which is an application, gets the real Finder button.

### The zip writer is ours, and stores rather than deflates

Node has no zip. `packages/artifacts/src/zip.ts` is about a hundred lines of a
format that has not changed since 1993, against a dependency to audit, pin and
carry (ADR 2).

Stored, not deflated: a PNG is already a deflate stream, so compressing it again
typically *grows* it and costs the CPU to discover that. The only file here that
would compress is the manifest, and a few kilobytes is not worth an
implementation of deflate.

Both ZIP64 thresholds — 65,535 entries and 4 GB — are checked and refused with a
message naming the limit, rather than written as an archive that is only
discovered to be corrupt by whoever tries to open it. It is verified against the
format's own bytes and, where `unzip` exists, against a real implementation.

## Consequences

- `exports/` duplicates the bytes of every capture with a file. For a large
  crawl that is real disk; it is also the thing being handed over, and a
  symlinked version would not survive being dragged into a browser.
- The prompt text will keep changing, and that is expected. It is prose in one
  file with unit tests asserting behaviour — a stage is omitted when its subject
  is absent, observed values carry their counts, nothing invents a number —
  rather than tests asserting the wording.
- `ui-atlas export --dry-run` prints the names without writing, which is how you
  check a naming change before it copies a few hundred files.
- With the archive on by default an export is three copies of the bytes: the
  originals, the renamed folder, and the zip. `--no-zip` is the escape hatch,
  and the command prints the archive's size so the cost is visible.
