# 35. A project is a website, and a session is a sitting

- Status: accepted
- Date: 2026-08-13

## Context

Until now `project` was a name in a config file — one name for every site anyone
ever pointed the tool at, defaulting to `default` — and a run was an anonymous
timestamped folder underneath it. That is fine for a single afternoon against a
single site, and wrong for what this tool is actually for.

The thing people do with it is come back. You capture a site's pricing page on
Tuesday, notice on Thursday that you never got the empty states, and open it
again. Under the old shape that second visit produced another folder with no
relationship to the first, and there was no way to ask "what do I have about
this site" — only "what happened in this run". The launcher made this concrete:
its list showed the runs of one configured project, so pointing it at a second
site made the first site's work disappear from the panel.

## Decision

### The project directory is named after the site

`projectSlugFromUrl` turns `https://www.stripe.com/pricing` into `stripe-com`
and `http://localhost:3000/` into `localhost-3000`. Every command that takes a
URL derives its project that way, so `inspect`, `capture`, `crawl`, `tokens` and
`animations` against one site all accumulate in one directory.

`www.` is dropped, because nobody thinks of it as part of the site's name and a
project keyed on it would split in two the first time someone typed the bare
domain. The port is kept, because `localhost:3000` and `localhost:4173` really
are two different sites while you are working.

A name someone *chose* is never overridden: `--project` wins, and so does
`project:` in a config file. That needed a small addition to `loadConfig`, which
now reports `projectSource` — `override`, `file` or `default` — because
`config.project` always has a value by the time the schema is finished with it
and the caller has to be able to tell a choice from a default.

### `project.json` records only what a scan cannot recover

The manifest holds the site identity, the creation time and where the last
session was pointed. It does **not** hold the list of sessions, their counts, or
anything they captured — all of that is read back from the run directories.

This is the same rule the launcher's `runs.ts` was already written under: a
second copy is a second bookkeeping system, and the two disagree eventually. It
also means a project directory that predates this decision still lists correctly,
because a directory full of runs and no `project.json` is a project with an
unknown site rather than an error.

`entryUrl` is written once and then left alone. A project opened at `/pricing`
on Tuesday and `/docs` on Thursday is one project about one site; rewriting the
entry each time would lose the first door anyone came in through. `lastUrl` is
what moves.

### A session *is* a run

No new record, no parallel id space. `--resume <session>` reopens a run
directory through the `RunWriter.resume` that interrupted crawls already used,
which means the resumed sitting recovers the counts, keeps the filenames already
claimed, and finalises totals covering the whole session rather than only the
part after the resume. `--resume last` is the only alias, because after a week
nobody remembers a run id and the one they mean is the one they closed last.

A resumed session keeps its original id, start time and command. The command
records how the session *started*, which stays true; what moves is `finishedAt`,
which is rewritten when the second sitting ends.

Naming: on disk and in the schema it is a run, because changing that would break
every artifact ever written. In the CLI, the launcher and the project page it is
a session, because that is what it is.

### The launcher lists sessions across every project

`readRecentSessions` walks the projects and merges, newest first, and each row
names its project because "run 4f2a · /pricing" does not say whose /pricing that
is. A row offers **Resume** when something recorded where that session was
pointed, and nothing when it did not — a resume that guessed a URL would open
the wrong page and look like the tool losing your work.

Resume passes both `--project` and `--resume` explicitly, so reopening a session
cannot land somewhere else because the config changed in between.

### The project page is generated, not maintained

`<project>/index.html` is rebuilt from every session in the project whenever a
session ends. It is static markup — readable with JavaScript off, images by
relative path — because the per-run report (ADR 12) answers "what happened in
this run" and this has to answer "what do I have about this site" to somebody
opening the directory a month later with no memory of either.

The one script on the page is the prompt's copy buttons, which read
`textContent` from a `<pre>`. Site text is escaped and never assembled into
markup, same threat model as the report.

## Consequences

- The shipped `ui-atlas.config.yml` no longer sets `project`. It was there as a
  written-out default, and the default is now the site.
- A workspace that has been capturing several sites into `default` keeps that
  directory and gets new ones alongside it. Nothing is moved or renamed.
- `outputRoot` now has meaningfully more directories in it. That is the point.
- Two commands are new: `ui-atlas project` lists projects and rebuilds a page,
  `ui-atlas export` writes the renamed set (ADR 36).
