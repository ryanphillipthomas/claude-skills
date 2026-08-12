# 24. Observed values are candidates, and naming them is yours

- Status: accepted
- Date: 2026-08-11

## Context

The brief's last piece of phase 4 is design-token extraction and duplicate
component grouping. Everything needed for the first was already being read
somewhere — `styleDelta` records computed values either side of a state change,
and the state controller reads a whitelist of properties to do it — but nothing
ever counted values across a page, let alone across a site.

The second turned out to be done already, which is recorded below.

## Decision

### Candidate, not token. Nothing is named.

`ui-atlas tokens <url>` reads every element's computed style and counts what
turns up. **"#2563eb appears on 34 elements" is a fact; "this is your primary
colour" is a judgement**, and this pass makes none. There is no `name` field
anywhere in the artifact, and a test asserts its absence.

The schema is `DesignTokenCandidate`. The file is `tokens.json`, because that is
what a person looks for, and it carries a `note` field stating in the artifact
itself what it is and is not — so the file is honest read with no other context.

The report tab is called **Values**, not Tokens, for the same reason.

### Leaving out the values nobody decided

A transparent background on four hundred `<div>`s, a zero margin, `font-style:
normal`: these are the most common computed values on any page, and none of them
is a design decision. Dropped in the page, before anything is counted.

This is the whole difference between a list of design decisions and a list of
browser defaults. Without it the top of every category is `none`.

### Colours are separated by use, not gathered by type

"What colour is the text" and "what colour is behind it" are different questions
with different answers, so `color` and `background-color` are different
categories. `border` holds both colours and widths, which is why a candidate is
keyed by category *and* kind: a border colour and a border width are both
`border` and neither is a value of the other.

### Near-duplicates are reported and never merged

Two colours one channel apart are usually a rounding error and occasionally
deliberate. Deciding which is exactly the judgement this refuses to make, and
merging them would also destroy the evidence — the counts that tell a person
which one is real. So both survive, and the pair is listed with a reason.

Colours are only compared at the same opacity: a 50% overlay is not a mistyped
solid, however close the channels are.

### Normalisation goes far enough to compare and no further

Chromium answers in `rgb()`/`rgba()` whatever the stylesheet said, so the work is
mostly the other way: back to hex, which is how a person reads a colour, and
**only while the colour is fully opaque**. Flattening alpha would merge an
overlay into the solid colour it is drawn from.

Lengths round to 0.1px, so `12.0001px` from a percentage width joins `12px`
without `12.5px` being swallowed by it. A colour space the parser does not
understand — `color(display-p3 …)`, `color-mix(…)` — is passed through and still
counted; it simply cannot be compared channel by channel.

### It scans a site, not just a page

A design system is not visible from one page. `crawl --tokens` runs the same
scanner on every page a crawl visits, accumulating into one artifact, so a value
used once per page on twelve pages is distinguishable from one used twelve times
on one. The scan runs **before recipes**, for the same reason the interaction
inventory does: a hover held open by a recipe would put its colours in the
counts.

### Every truncation says so

A per-page element cap and a per-category tail cap both bound the work, and both
add a warning naming what was left out. A frequency table that quietly drops the
long tail is the one thing a frequency table must never be.

### The swatch is the only guarded string in the report

The Values tab paints a colour swatch, which means a capture-derived string
reaching a `style` attribute — the only place in the whole report that happens.
It is matched against `#rrggbb` or `rgba(n, n, n, a)` rather than trusted, and a
value the extractor did not build itself gets no swatch. A test feeds it a
`color(display-p3 …)` and requires the row to render with no swatch at all.

The inline style sets `background-color` rather than the `background` shorthand,
so the checkerboard behind a translucent value survives.

## Consequences

- **Cross-route component grouping already worked.** The plan for this slice
  assumed it was missing. `groupComponents` keys an element group by
  `element:<structural fingerprint>` with no route in the key, so the same
  component captured on four routes has always been one group. Nothing to build;
  the assumption was simply wrong.
- Counts include elements that are not visible. A hover menu at rest is
  `display: none` and its computed colours are still real decisions, so it is
  read. A page with a large hidden mega-menu will weight towards it.
- A value is counted once per element, not once per rule. Ten elements sharing a
  class contribute ten.
- Only computed values are seen, so CSS custom properties are invisible as
  properties: `var(--brand)` arrives resolved. The value is right; the fact that
  the site already has a name for it is not visible here.
- `@ui-atlas/crawler` gains a dependency on `@ui-atlas/tokens`, alongside
  `@ui-atlas/animation`, for the same reason: the seam is a whole capability
  rather than one function.
- Nothing is captured. The `tokens` command writes no `captures.jsonl` at all,
  and a test asserts it.
