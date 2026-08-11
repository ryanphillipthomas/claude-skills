# 17. Workers are isolated; politeness is per origin, not per worker

- Status: accepted
- Date: 2026-08-11

## Context

The crawler visited one page at a time. The brief asks for more:

> Set conservative per-origin concurrency; scale by multiple isolated workers,
> not many simultaneous tabs sharing one mutable session.

Both halves of that sentence matter, and the naive implementation gets both
wrong: opening N tabs in one context shares cookies and history between workers,
and keeping `perPageDelayMs` as a per-worker pause multiplies the request rate a
host sees by N while appearing to be polite.

## Decision

### A worker owns a context, not a tab

Each extra worker gets a fresh `BrowserContext` seeded from the live context's
`storageState()`, so a signed-in crawl stays signed in on every worker without
them sharing a mutable session. This is the same approach responsive replay
already uses ([ADR 11](0011-responsive-replay.md)), for the same reason.

A persistent profile (`browser.mode: profile`) owns its only context and cannot
create siblings. It degrades to one worker with a warning naming the mode —
again matching ADR 11 rather than inventing a second story.

Concurrency defaults to **1**. More workers on someone else's site is a decision
only the operator can make, so it is opt-in via `crawl.concurrency` or
`--concurrency`.

### The throttle claims its slot before waiting

`OriginThrottle` keeps, per origin, the time the next request may go out. A
caller computes its slot, **writes the reservation forward, and only then
waits**. Two workers arriving together therefore take two consecutive intervals
rather than both waiting out the same one and firing together.

That one ordering is the entire difference between a throttle and a sleep, so it
has a test that fails if the reservation moves after the wait: with the naive
order, four workers' navigations land within a millisecond of each other.

`perPageDelayMs` is now documented as *a minimum gap between navigations to one
origin*, not a pause a loop takes. Raising `concurrency` cannot raise the rate a
single host sees.

The wait is clamped by whatever is left of the run budget, so politeness can
never push a crawl past its own deadline.

### The frontier separates handed-out from committed

`next()` moves an item **in flight**. `commit()` — called only once the page
record is on disk — moves it to **committed**. A snapshot serialises committed
URLs as `visited` and both pending *and in-flight* items as `pending`.

This is what makes an interrupted concurrent crawl resumable. A crawl killed
with four pages in flight would otherwise have recorded those four as visited
without their records existing, and the resumed run would skip them as
duplicates: four pages silently lost. Putting them back in the queue means a
crash re-crawls at most the pages that were mid-flight, and loses none.

The remaining window is one operation wide — a crash between `addPage` and the
state write re-crawls that page and duplicates its record. Closing it entirely
needs an atomic multi-file commit, which is not worth a transaction log here.

`maxPages` counts committed **plus in-flight** navigations, so N workers cannot
collectively overshoot a budget by holding N uncommitted pages.

`next()` is safe to call from several workers because nothing in it awaits: it
runs to completion before another worker can enter it, so two workers can never
be handed the same page.

### An idle worker is not a finished worker

A worker that finds the queue empty cannot conclude the crawl is over: another
worker may be on a page that is about to contribute links. Workers exit only
when the frontier is *drained* — queue empty **and** nothing in flight — and
otherwise idle briefly and look again.

The 25ms poll is deliberate. A notification scheme would avoid it, but the
failure mode of a missed notification is a hung crawl, and the cost of the poll
is only paid when a worker is genuinely idle.

## Consequences

- Recipes are per-worker: a `RecipeRunner` binds to a page, so each worker gets
  its own runner and capture service. They share the one `RunWriter`, whose
  appends are already atomic.
- The inventory is shared, because it takes the page as an argument rather than
  holding one.
- Ordering is no longer deterministic. Breadth-first still holds for *handing
  out* work, but pages finish in whatever order they finish, so `pages.jsonl`
  row order varies between runs. Nothing depends on it.
- A worker that throws releases its page back to the queue rather than losing
  it, and the crawl carries on with the remaining workers.
- Per-origin concurrency is not separately capped. With a single-origin crawl,
  `concurrency` *is* the per-origin concurrency, and the throttle bounds the
  rate. A crawl spanning several origins can have all workers on one of them;
  that is the next refinement if it ever matters.
