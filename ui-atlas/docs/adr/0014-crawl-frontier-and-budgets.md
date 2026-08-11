# 14. The crawler follows links and clicks nothing

- Status: accepted
- Date: 2026-08-11

## Context

Phase 3 is the first part of the tool that visits pages nobody chose by hand.
Everything before it was pointed at a URL by a person. That changes the failure
mode: a mistake in the inspector wastes a screenshot, while a mistake here can
sign the user out, empty a cart, send a message or delete an account.

The brief is explicit: "The crawler is a policy-driven queue, not an
unrestricted click bot", "Link discovery may be automatic; clicks that mutate
data require an explicit recipe or approval", and "Only auto-click anchors and
recipe-approved controls."

## Decision

### Nothing is clicked

The crawler's entire interaction with a page is `page.goto()`, a settle pass,
and one `page.evaluate()` that reads `<a href>` out of the DOM. There is no
`click`, `hover`, `press`, `fill`, `selectOption` or `dispatchEvent` anywhere in
`packages/crawler`, and no page-side code that triggers navigation.

This is asserted, not merely intended. `destructive.html` records every activation
of its controls in `window.__uiAtlasDestructiveLog`; the crawl test reads that log
while the page is still current and requires it to be empty, and separately
requires that the browser issued no non-`GET` request during the whole crawl.

### Canonicalisation decides what "the same page" means

Two URLs are one page when they canonicalise to the same string. Canonicalising
drops the fragment, strips credentials, lower-cases the host, drops a default
port, collapses repeated slashes, normalises the trailing slash, removes
configured tracking parameters and sorts what is left.

It is deliberately lossy and deliberately not reversible. The raw `href` stays on
the queue or skip decision so a surprising outcome can be traced back to the
markup that produced it.

Credentials (`https://user:pass@host/`) are stripped rather than preserved: they
are impersonation-capable material, they would otherwise reach `pages.jsonl` and
the run summary, and they say nothing about *which* page this is.

Two URLs that serve identical content under different paths — `/` and
`/index.html` on our own fixture site — stay two pages. Recognising them as one
needs the page structural fingerprint the brief lists as optional, and guessing
without it would silently drop real pages.

### Every skip has a stable reason

`unparseable`, `unsupported-scheme`, `cross-origin`, `download`, `denied-path`,
`excluded`, `not-included`, `nofollow`, `depth-exceeded`, `duplicate`,
`queue-full`. They are counted, and a bounded sample keeps an example of each in
the run summary.

`denied-path` is checked before `excluded` and reported separately, so an
operator reading a summary can see that the crawler declined to sign itself out
without having to read their own glob list to work out why.

### Deny rules default to on

`denyPaths` defaults to the sign-out family (`**/logout`, `**/signout`,
`**/sign-out`, …) whether or not the operator configured anything. Following a
sign-out link ends the session the rest of the crawl depends on, and the failure
is confusing rather than loud: pages start returning a login screen and the run
looks like it worked.

### `/dir/**` also matches `/dir`

The glob dialect is tiny on purpose — `*`, `?`, `**`, and nothing else. These
patterns decide where an automated crawler may go, and a rule an operator cannot
predict by reading it is a safety problem, not a feature gap.

One deviation from common glob semantics: a trailing `/**` matches the parent
too, so `exclude: ['/checkout/**']` also excludes `/checkout`. The standard
reading — where the excluded directory itself is still crawled — is a trap.

### Budgets are hard limits, not targets

`maxPages` stops the queue handing out work. `maxDepth` is enforced at
admission. `maxRunMinutes` is checked before every page. `perPageTimeoutMs`
bounds one page, and is further clamped by whatever is left of the run budget, so
a slow page near the end cannot overrun the total deadline. `maxQueued` bounds
the pending queue, because a crawl of a large site with a small `maxPages` can
still *discover* an unbounded number of links.

Stopping on a budget is a result, not an error: the crawl did what it was told.
It is reported in `stopped`, the leftover queue is counted, and the CLI exits 0.

### A redirect off-origin is recorded but not harvested

If navigation lands outside the allowed origins, the page is recorded honestly
with a warning naming where it went, and its links are *not* read. Otherwise a
single open redirect would widen the crawl to somebody else's site.

An in-scope redirect destination is marked seen rather than queued, so a page
linking to it does not cause a second fetch of a page this run already has. It
is marked *without* charging a navigation: `maxPages` bounds fetches, and a site
full of redirects should not drain that budget at double rate. This is why the
frontier tracks the visited set and the navigation count as two numbers, and why
both are persisted in `crawl-state.json`.

### The queue key is a function of the canonical URL alone

`frontierKey(url) = sha256(url)[0..16]`. Not of the run, the clock, or the order
links were discovered in. The same page produces the same key on every run,
which is what makes a resumed crawl idempotent rather than merely lucky.

`crawl-state.json` — visited set, pending queue, skip counts — is written
atomically after every page into the run directory. `crawl --resume <run-dir>`
reopens that run, so records append to the same `pages.jsonl` and a URL already
visited is refused as a `duplicate`.

### A site config is an ordinary config with a `crawl:` block

Rather than a second parallel schema, the site config the brief describes is a
`UiAtlasConfig` with `crawl:` filled in. That reuses the existing loader, deep
merge, CLI override precedence, prototype-pollution rejection and validation,
and gives `recipes:` an obvious home when it arrives.

### Nothing is injected into crawled pages

`crawl` launches its own browser session with no init scripts: no overlay, no
probe bundle. A page the crawler visits should look exactly like a page a
browser visited. This is why `crawl` does not go through `AtlasSession`, which
injects the probe unconditionally for the inspector's benefit.

## Consequences

- The crawler produces `pages.jsonl` and no screenshots. Captures during a crawl
  need recipes, which are the next slice; until then `crawl` is a survey tool.
- Breadth-first ordering means a crawl cut short by `maxPages` covers the top of
  the site rather than one arbitrary deep branch.
- One worker, one page, one origin at a time. Concurrency and per-origin
  throttling build on this frontier and come after it.
- Links inside iframes are not followed. A frame's links belong to the frame's
  origin, and following them from the parent's scope would quietly widen the
  crawl.
- `rel="nofollow"` is honoured by default. It is what the attribute asks for, and
  `respectNofollow: false` is there for auditing your own site.
