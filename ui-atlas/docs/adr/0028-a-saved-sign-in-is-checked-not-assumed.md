# 28. A saved sign-in is checked, not assumed

- Status: accepted
- Date: 2026-08-12

## Context

Saved sign-ins kept failing, and always in the same shape: `auth save` reported
success, the run started fine, every page returned 200, and the artifacts were
of a signed-out site. On one real site the symptom was
`Unexpected token '<', "<!DOCTYPE "` — the site's own code, expecting JSON and
getting an HTML challenge page. Nothing anywhere said *you are signed out*.

There is one root cause and one aggravating factor.

**The root cause:** `context.storageState()` carries **cookies and localStorage,
and nothing else**. Not IndexedDB, not sessionStorage, not service workers.
Plenty of modern sign-ins keep their token in exactly those places. So the saved
file can be large and healthy-looking — hundreds of cookies — and still contain
none of the session.

**The aggravating factor:** nothing checked. Not at save time, not at run time.
The gap between the mistake and the symptom was the whole run.

## Decision

### `auth save` asks the page what it stores, and says which mode this site needs

After you press Enter, `probeStorage` reads the origin's localStorage and
sessionStorage key counts, its IndexedDB database names and its service worker
registrations. `assessStorage` — pure, so it is tested without a browser —
sorts those into what a storage state will carry and what it will drop, and
recommends a persistent profile when the dropped material is IndexedDB or
sessionStorage.

A service worker is reported but does **not** drive the recommendation: it is
usually an offline cache, and treating it as a lost session would send people to
profile mode for no reason.

### `auth save --persistent` signs you into a real profile

`chromium.launchPersistentContext` at `~/.ui-atlas/profiles/<name>` keeps
everything a browser keeps. The directory *is* the save — there is no export
step to get wrong. `--mode profile --profile <name>` then reuses it.

The persistent-context path already existed for `--mode profile`; what was
missing was a way to *sign in* to one. Without that, profile mode was advice we
could give but not a workflow anyone could follow.

### `auth save` refuses to save silently over a signed-out page

Pressing Enter too early is the easiest way to save nothing, and it produces a
file that looks fine. The save now runs the sign-in probe first and, when the
page still looks signed out, says so and asks for a second Enter. It does not
*refuse* — a page this check reads wrong should never block a real sign-in — but
it cannot be done by accident.

### `auth check <profile> <url>` — ten seconds instead of twenty minutes

Opens the URL with the saved profile and reports the verdict with its evidence.
Exit code 1 for signed-out, so it can gate a script. The mode is inferred from
what is actually on disk, because guessing wrong would report "signed out" for a
perfectly good profile.

### The verdict is three-valued, and the third value is real

| Evidence | Verdict |
| --- | --- |
| a visible sign-out control | `signed-in` |
| a visible password field | `signed-out` |
| the final URL is a sign-in path | `signed-out` |
| a visible sign-in control | `signed-out` |
| none of the above | `unclear` |

A way *out* is the strongest evidence of being *in*, and it deliberately beats a
stray "Log in" link elsewhere on the same page.

`unclear` is not a failure to decide, it is the honest answer for a page that
shows neither, and calling it `signed-in` would be exactly the quiet dishonesty
that made this worth building. `unclear` prints a note and does not fail.

Every verdict carries its evidence, and a test requires the evidence list is
never empty whatever the verdict.

### The check runs on the first page of a run, once

`AtlasSession.navigate` runs it on the first page that loads, which covers
`inspect` and `capture` at no cost — the page is already there. `crawl` loads
its first seed once before starting, which is one page view spent to avoid
crawling fifty pages of a login wall.

It runs **only** when the run is using saved auth. A `clean`-mode run is
expected to be signed out, and warning about it would be noise that teaches
people to ignore the warning.

The warning goes to the log *and* to the run's warnings, so `run.json` and the
report carry it too — the person reading the artifacts a day later gets the same
sentence as the person who watched it run.

## Consequences

- The `browser` package's tsconfig gains the DOM lib, because `signin.ts`
  serialises functions into the page. It is the second package to need this
  after `capture`, and for the same reason.
- The check costs one `page.evaluate` per run, and for `crawl` one extra load of
  the first seed. Both are bounded and both only happen with saved auth.
- The heuristics are English-shaped: they match "sign in", "log in", "sign out"
  and their variants. A site in another language reads as `unclear` rather than
  wrong, which is the right failure — but it is a real limit, and it is written
  down in `docs/limitations.md`.
- A page that blocks `evaluate` returns no verdict rather than failing the run.
  This check is a courtesy, not a gate.
- None of this makes UI Atlas better at *getting* signed in. It still types
  nothing, submits nothing and evades nothing; `--persistent` just keeps more of
  what your own hands achieved. A site that blocks automation still blocks it.
