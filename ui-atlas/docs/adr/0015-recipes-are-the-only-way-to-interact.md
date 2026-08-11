# 15. A recipe is the only thing that may touch a crawled page

- Status: accepted
- Date: 2026-08-11

## Context

[ADR 14](0014-crawl-frontier-and-budgets.md) established a crawler that clicks
nothing. That makes it safe and it makes it a survey tool: it records where the
pages are, not what they look like. Screenshots of anything behind an
interaction — an open menu, an expanded disclosure, a selected tab — need
something to perform that interaction.

The brief is specific about the shape: declarative YAML, validated before
execution, a deliberately small primitive set, no arbitrary JavaScript in
ordinary config, and "Only auto-click anchors and recipe-approved controls."

## Decision

### The recipe *is* the approval

The crawler still touches nothing on its own. A control is clicked because a
human wrote a step naming it, and for no other reason. `Crawler` interacts with
a page only through an injected `RecipeRunner`; construct one without it and the
crawl behaves exactly as it did before this ADR.

The safety property from ADR 14 is unchanged for every route no recipe matches,
and there is a test that says so: a crawl of the whole fixture site with a
recipe that clicks on `/states.html` still leaves `destructive.html`'s audit log
empty and still issues no non-`GET` request.

### There is no primitive that types text

The brief's primitive list includes "fill from secret reference". It is
deliberately **not** implemented, and a `fill:` or `type:` step fails
validation.

Sign-in is a thing a person does, in a visible browser, through
`ui-atlas auth save`; the crawl then reuses that session with
`--mode storage-state --profile <name>`. Automating credential entry is how
tools get a session flagged and blocked, and it is the one part of this system
where being wrong costs the user their account rather than a screenshot. There
is a test asserting `fill`, `type` and `evaluate` are all rejected, so this
cannot be reintroduced by accident.

### Targets are a closed vocabulary, not a selector language

A step points at an element with exactly one of `role` (optionally `name`),
`testId`, `text`, `label`, `placeholder` or `css`. Everything resolves through
Playwright's own locator engines. There is no path from a recipe to arbitrary
page JavaScript, which matters precisely because a recipe can click.

### An unrecognised step is an error, never a skip

Every step variant is a strict object. A misspelled step name, or an unknown
option on a known step, fails validation.

For a config that can click things, "I did not understand that line" must never
quietly become "I ignored that line" — the operator would believe an interaction
happened and read the resulting screenshots as if it had.

### Recipes run after link discovery, always

Link discovery happens before any recipe on that page. A recipe that clicks
something and navigates therefore cannot change which links the page contributed
to the frontier: the shape of the crawl is decided by the markup as served, not
by wherever an interaction ended up.

A recipe that navigates is recorded as a warning naming both URLs, because every
capture after that point is of a different page.

Recipes do not run at all on a page that redirected off-origin. A recipe is
approval to interact with the origins the operator named, not with wherever a
redirect landed.

### `--dry-run` answers before anything exists

The schema rejects malformed recipes, so what is left is the class of mistake
that is valid YAML and still wrong. `crawl --dry-run` launches no browser and
visits nothing, and reports:

- every control each recipe would click, called out in capitals, because
  clicking is the part that can mutate;
- a recipe scoped to a route `denyPaths` or `exclude` will never allow, which is
  invisible at runtime because "recipe never ran" looks exactly like "no page
  matched";
- an element capture with no preceding `select`;
- a recipe that clicks but keeps no artifact;
- duplicate recipe names.

It exits non-zero when it finds any of these, so it can gate a pipeline.

### The probe is injected only when recipes exist

ADR 14 said crawled pages get nothing injected. Element captures need the same
probe the inspector uses, so identity data is identical however it was produced.
The compromise: a crawl with no recipes still injects nothing, and a crawl with
recipes injects the probe bundle only. This is an amendment to ADR 14, not an
exception to it — a crawl that only surveys still leaves pages untouched.

## Consequences

- Recipes are the seam every later phase plugs into. Animation capture and the
  suggested-interaction inventory become new step kinds, not new machinery.
- A failing recipe is recorded and the crawl continues. Detail lands on the page
  record it happened on; the run gets one warning per recipe name rather than
  one per page, because a broken recipe usually fails everywhere it matches.
- `captureResponsive` needs a responsive runner the crawl does not build yet; the
  step is accepted and records a warning saying it was unavailable.
- Recipes see the top document only. Frames need a target vocabulary that can
  name a frame, which is not built.
- The default `perPageDelayMs` is now 750ms rather than 0. Crawling flat out is
  the fastest way to be mistaken for something worth blocking, and this is the
  first slice where a crawl also interacts with pages.
