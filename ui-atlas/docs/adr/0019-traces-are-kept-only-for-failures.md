# 19. A trace is kept only for a failure, and never leaves the run directory

- Status: accepted
- Date: 2026-08-11

## Context

The brief lists trace-on-failure as a phase 3 deliverable, and `traces/` has
been in the artifact layout since phase 0 — created, documented, and never
written to.

A Playwright trace is the best debugging artifact this tool can produce: a
steppable filmstrip with the DOM, the console and every network request. It is
also the most dangerous one it can produce, because "every network request"
includes request headers, and a trace taken during an authenticated crawl
contains the session cookie that authenticated it.

That tension is the whole decision.

## Decision

### Off by default

`crawl.trace.enabled` is `false`, and `--trace-on-failure` turns it on for a
run. Every other diagnostic in this tool is safe to leave on; this one writes
impersonation-capable material to disk, so switching it on is a decision about
where that material is allowed to land, and the operator makes it.

### Recorded always, written only on failure

Playwright's chunk API fits exactly. `tracing.start()` runs once per worker
context; `startChunk()` before each page and `stopChunk()` after. A chunk is
written to disk only when the page failed, and discarded otherwise. Recording
costs memory; only a failure costs a file.

This is what makes trace-on-failure possible at all: you cannot know a page will
fail before you visit it, so the alternative would be tracing everything and
deleting most of it — which means the cookies of every successful page hit the
disk on the way to being deleted.

### "Failure" means unreachable, or a recipe that failed

A page that never answered, after every retry, and a page a recipe failed
against. Not an error *status*: a `404` is an answer, and its status is the whole
story, so a trace would add a sensitive file and no information.

The recipe case is the one that most justifies the feature — the page loaded
fine, so nothing in `pages.jsonl` explains why a step could not find its
element, and a trace does.

### `maxTraces` bounds it

Twenty by default. A badly broken site could otherwise fill a disk with files
that all need handling carefully. A page that missed out says so in its warnings
rather than silently having no trace.

### The report does not surface it

`PageRecord` gains an optional `tracePath`, and the report deliberately does not
show it. The report is the artifact that gets shared — it is one self-contained
file precisely so it can be sent to someone ([ADR 12](0012-report-is-one-static-file.md))
— and a trace path in it invites a reader to open, copy or forward a file full
of request headers.

The report already builds an explicit allowlist view model rather than spreading
records into the page, so this needed no new mechanism. It did need a test:
adding `tracePath` to that view model makes the test fail, which is the only way
to know the allowlist is doing anything.

### Written traces are announced once

The first trace of a run raises a warning saying the run directory now contains
network traffic including request headers and should be treated as sensitive.
Once per run, because it is a fact about the directory rather than about a page.

## Consequences

- Traces live under the run directory, where the brief's layout puts them, and
  are named by page record id so `pages.jsonl` and the file line up.
  [ADR 10](0010-auth-and-browser-modes.md) keeps auth material out of artifacts;
  this is the one deliberate exception, which is why it is opt-in and announced.
- `sources: false`, so the tool's own source files are never embedded in an
  artifact.
- Tracing is started on contexts the crawler does not own — worker 0's context
  belongs to the caller. It is stopped in a `finally`, before any context is
  closed, so no context is torn down with a chunk still open.
- A context where tracing is already running warns and continues untraced rather
  than failing the crawl.
- Nothing else in the tool traces. The inspector and `capture` are interactive
  and already show you what happened.
- `traces/` is created lazily, so a run with no failures has no empty directory
  suggesting something is missing.
