# 3. Pin Playwright to an exact version

- Status: accepted
- Date: 2026-08-11

## Context

Playwright downloads a browser build whose revision is chosen by the library
version. A floating range (`^1.56.1`) silently changes the browser, which
changes rendering, which changes every screenshot hash — and in environments
where browsers are pre-installed (CI images, this sandbox) a version bump
leaves the library looking for a revision that is not on disk.

## Decision

`playwright` is pinned to an exact version (`1.56.1`) in every package. Upgrades
are a deliberate commit that also re-runs the golden captures.

## Consequences

- Upgrading requires editing every `package.json`; there are nine of them, and
  that friction is the point.
- A machine with a different pre-installed browser revision must run
  `npx playwright install chromium` once, or set `PLAYWRIGHT_BROWSERS_PATH` to a
  directory that has the matching build.
- Screenshot comparisons are only meaningful within one pinned version. The
  browser version is recorded in `run.json` so a report can say so.
