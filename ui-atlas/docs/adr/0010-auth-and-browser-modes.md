# 10. Browser modes and where authentication material lives

- Status: accepted
- Date: 2026-08-11

## Context

Some sites need a signed-in session. The brief is explicit: never use the user's
default Chrome data directory, keep auth material out of the artifact tree, set
restrictive permissions, and warn that saved state can impersonate the user.

## Decision

Four modes, chosen with `--mode`:

| Mode            | What it does                                                              |
| --------------- | ------------------------------------------------------------------------- |
| `clean`         | Default. Bundled Chromium, fresh temporary context, no extensions.         |
| `profile`       | A dedicated persistent profile under `~/.ui-atlas/profiles/<name>`.        |
| `storage-state` | A fresh isolated context seeded from `~/.ui-atlas/storage-state/<name>.json`. |
| `attach`        | Experimental CDP attachment to a browser the user already started.          |

Auth material lives under `~/.ui-atlas/` (overridable with `UI_ATLAS_HOME`),
never under the artifact root. Directories are created `0700`, storage-state
files written `0600`, and both are re-`chmod`ed after creation because `mkdir`
ignores its mode for an existing directory. Profile names are validated against
`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` before they reach the filesystem.

`ui-atlas auth save` opens a visible browser, waits for the user to sign in by
hand, and only then saves. It never types credentials, never submits a form, and
refuses to run headless. Every mode that touches saved state prints the
impersonation warning, and the warning is also stored in `run.json`.

Launch flags are limited to determinism (`--force-color-profile=srgb`,
`--font-render-hinting=none`, background-throttling switches). Nothing that
relaxes a security boundary — no `--disable-web-security`, no `--no-sandbox`.

## Consequences

- `attach` mode carries a loud warning: the attached browser's extensions,
  flags and profile all affect rendering, so captures are less deterministic.
- `~/.ui-atlas` is outside the repository, so it cannot be committed by
  accident; the repo `.gitignore` still covers the equivalent names in case
  `UI_ATLAS_HOME` is pointed inside a checkout.
- On Windows the `chmod` calls are skipped; the paths are still outside the
  artifact tree.
