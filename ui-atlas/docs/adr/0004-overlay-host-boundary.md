# 4. The overlay/host boundary is a narrow, authenticated, schema-checked bridge

- Status: accepted
- Date: 2026-08-11

## Context

The inspector runs inside arbitrary pages. Page-side code must not be able to
reach the filesystem, run host code, or drive captures on its own. Playwright's
`exposeBinding` installs a function on `window`, which *any* script in the page
can call — including the site's own scripts.

## Decision

1. **One binding, one shape.** `window.__uiAtlasBridge(envelope)` is the only
   channel. Every envelope is parsed with `BridgeRequestSchema`, every method's
   params with that method's own schema, before a handler sees it.
2. **A per-session token.** The host generates a 24-byte random token, injects it
   into the overlay bootstrap as a *closure variable* (never on `window`), and
   compares it with `timingSafeEqual` on every request. Page scripts can call the
   binding but cannot produce a valid request.
3. **A closed method list.** `hello`, `element/selected`, `element/cleared`,
   `capture/request`, `queue/list`, `viewport/set`, `inspect/mode`, `log`.
   There is no "evaluate", no "read file", and no path in any request or
   response. The overlay is told `"<project>/<run-id>"` as a *label*; it never
   learns where artifacts live.
4. **Frame attribution.** Playwright hands the host the originating page and
   frame; element identity is built against that frame, so a message from an
   iframe cannot act on the top document.
5. **Page-side code is a renderer, not an authority.** It probes the DOM and
   renders UI. Locators are always re-resolved host-side immediately before a
   capture.

The page can still *observe* that UI Atlas is present (the binding name, the
overlay's shadow host) and can call `window.__uiAtlasOverlay.dispatch(...)` to
show a misleading notice in our toolbar. That is cosmetic, and the alternative —
hiding the overlay from the page entirely — is not achievable from an injected
script.

## Consequences

- A new capability means a new method with a schema, reviewed as an API change.
- Bridge failures are structured errors with stable codes, so the toolbar can
  show something useful rather than a stack trace.
- A Chrome extension (with real content-script isolation) remains a possible
  later package; nothing here depends on one.
