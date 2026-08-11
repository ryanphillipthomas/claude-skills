# 5. Page-side functions are function literals, never strings

- Status: accepted
- Date: 2026-08-11

## Context

Early code passed page-side helpers to `page.evaluate()` as template strings, on
the assumption that Playwright evaluates the string and calls the resulting
function. It does not: `page.evaluate('() => ({a: 1})')` evaluates the
expression, gets a function object back, cannot serialise it, and returns
`undefined`. Every string-based helper silently returned `undefined`, which
surfaced as `Cannot read properties of undefined` from deep inside the settle
loop.

## Decision

All page-side code passed to `evaluate` is a real, exported function literal,
collected in a `page-scripts.ts` module per package
(`packages/settle`, `packages/capture`, `packages/overlay/src/host`). Those
packages enable the `DOM` lib so the functions are type-checked against the DOM
they run in. Page functions must not close over module state — Playwright
serialises the source only.

## Consequences

- Page-side helpers get compiler checking and IDE navigation.
- The DOM lib is enabled in packages that also contain Node code, so a Node
  module there could reference a DOM global and only fail at runtime. The
  page-side code is confined to `page-scripts.ts` files to make that obvious.
- The injected inspector is a separate concern: it is bundled by esbuild rather
  than serialised per call, because it is thousands of lines with imports.
