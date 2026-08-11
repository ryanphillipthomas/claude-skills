# 18. Retrying is per page; backing off is per origin

- Status: accepted
- Date: 2026-08-11

## Context

Until now a navigation failure became a page record with an error and the crawl
moved on. That loses a page to a dropped connection or a slow moment, and it
answers a `429` — a host explicitly asking for less traffic — by carrying on at
exactly the same rate.

The brief asks for both halves:

> Use bounded retries with jitter for navigation failures and status-aware
> backoff for 429/503.

## Decision

### Two different ideas, kept apart

*Retryable* means this request might work next time, and belongs to the **page**.
*Backoff* means the host is asking us to slow down, and belongs to the **origin**.

They are computed separately and applied separately. A `500` is retried without
touching the origin's rate. A `429` is retried **and** pushes every worker's next
request to that host back, through the same `OriginThrottle` that enforces
`perPageDelayMs`.

The corollary is easy to get wrong and is tested explicitly: a `429` on the last
attempt still penalises the origin. Giving up on one page is no reason to keep
hammering the host.

### `Retry-After` is honoured, but not unboundedly

Both header forms are parsed — delta-seconds and HTTP-date — and the value is
clamped by `maxRetryAfterMs` (two minutes by default). A header we will not wait
out is still a wait; a header we cannot read falls back to our own backoff.

`Date.parse` is far more permissive than the header's grammar: it reads `-5` as a
year and returns a real timestamp, which would have turned a malformed header
into "retry immediately" rather than falling back to backoff. Since every
HTTP-date form carries a day or month name, an alphabetic character is now
required before a date is attempted. Found by a unit test.

### Jitter is the point, not a decoration

Backoff doubles per attempt and is capped. On top of that sits a random fraction,
because workers that failed together would otherwise retry together and hand the
host the same burst that upset it.

### A retry costs an attempt, never a page

`maxPages` counts pages, and a host that made us try three times has not shown us
three pages. Retries happen inside one `visit()`, so the frontier never sees
them, and the budget is untouched.

Every wait is clamped by what is left of the run. If the next backoff would not
fit inside `maxRunMinutes`, the crawl records that it stopped trying rather than
overrunning its own deadline.

### Retries loop in place rather than re-queueing

The earlier plan was to hand a failed page back to the frontier via `release()`
and let a worker pick it up later. That is more machinery for no real gain: the
origin is throttled either way, so a re-queued page waits exactly as long, and
`visit()` would have had to return a "not finished" signal and defer writing its
record. Looping inside `visit()` keeps the whole retry story in one readable
function and keeps `visit()` returning a finished `PageRecord`.

`release()` still exists, for a worker that dies or is cut off by a budget.

### An error status is now a failed page record

This is a behaviour change. A `4xx`/`5xx` response used to be recorded as an
ordinary page with an `httpStatus` and no error; it is now a record with a
structured error, and its links are not harvested — an error page's navigation
is not the site's link graph, and anything real on it is reachable elsewhere.

The exit code deliberately does **not** follow. A page that answered `404` is a
finding about the site, and belongs in the report; a page that never answered at
all is a finding about the run. Only the latter makes `ui-atlas crawl` exit
non-zero, so one broken link cannot fail a pipeline that was checking whether the
crawl worked.

## Consequences

- `PageRecord` gains an optional `attempts`, present only when a page took more
  than one. Absent means it worked first time.
- A throttled origin is reported to the run once, by origin, rather than once per
  page; the per-page detail stays on each page record.
- Retrying is on by default (`maxAttempts: 3`). It only ever fires on failures,
  so a healthy crawl is unaffected, and `--max-attempts 1` turns it off.
- Retries are invisible to `crawl-state.json`: a page is committed or it is not,
  and a resumed crawl starts its attempt count again. That is the right
  behaviour — the host may well have recovered in the meantime.
- Nothing retries a recipe. A recipe that failed did so against a page that
  loaded, and repeating an interaction is not the same kind of safe as repeating
  a `GET`.
