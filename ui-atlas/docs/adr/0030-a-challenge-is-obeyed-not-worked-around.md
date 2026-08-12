# 30. A challenge is obeyed, not worked around

- Status: accepted
- Date: 2026-08-12

## Context

Working through a real signed-in site ended the way these threads end: the host
started serving a Cloudflare interstitial instead of the site.

This is not a bug, and the temptation is to treat it as one. There is a whole
genre of libraries for this — stealth plugins, fingerprint spoofing, CAPTCHA
solving services, residential proxy rotation — and adding any of them is the
obvious next commit.

We are not going to, for two reasons that both stand on their own. The user set
this constraint at the start of the project, before any of it was built:

> "Ive seen scrappers get blocked and we need to ensure we dont so i can
> complete e2E."

And a challenge is a site saying it does not want automated access. A tool whose
entire pitch is honest, legible capture cannot have a module for lying about
what it is.

So the work is not in getting past it. It is in behaving correctly when it
happens — which was not the case before this change: the run carried on, the
artifacts were fifty screenshots of an interstitial, and the reported cause was
"signed out".

## Decision

### A challenge is not a sign-in state, and is checked first

`probeChallenge` is separate from `judgeSignIn` and runs before it.

Both failures look the same from outside — you cannot see the site — but they
need **opposite responses**. Signed out is fixed by signing in again. Challenged
cannot be fixed here at all, and the natural response to "you are signed out"
is to re-save the profile and try again, which is the single worst thing to do
to a host that has already refused you.

It runs in **every** browser mode, including `clean`. Being signed out in a
clean run is expected and is deliberately not reported; being refused entry is
never expected.

### Structure before wording

Detection looks for the challenge's own machinery first — `#challenge-form`,
`#cf-challenge-running`, `.cf-browser-verification`, `form[action*="__cf_chl"]`
— and only then at wording ("just a moment", "checking your browser", "verify
you are human", "access denied").

Markup survives translation; English does not. A site challenging a French user
still emits the same form.

Tests require that neither an ordinary page nor a sign-in page is mistaken for a
challenge — the false positive here is expensive, because it would tell someone
to stop when the real problem was fixable.

### A challenged crawl stops before it starts

Not "warns and continues". Continuing means fetching the same interstitial for
every page in the frontier: worthless as reference material, and the surest way
to turn a soft challenge into a hard block on the address.

The run is still finalised, because the warning belongs in `run.json` where
whoever reads the artifacts tomorrow will find it. It exits 1 with zero pages,
and a test asserts exactly that.

### The advice is one list, and it never says "try again"

`CHALLENGE_ADVICE` is exported from one place because the wrong words here cost
real time and make the situation worse:

1. this is not a sign-in problem, and re-saving the profile will not help
2. stop running against this host — repeated attempts escalate a soft challenge
3. UI Atlas has no evasion and will not be given any
4. `--mode attach` is the one legitimate route left

A test requires the advice never suggests retrying.

### `--mode attach` is offered, and is not a bypass

Attach drives a Chrome **the user launched and signed into themselves**. That is
categorically different from spoofing: nothing is being misrepresented, because
it is a real browser with a real profile being driven rather than imitated. It
often works against a soft challenge for exactly that reason.

It is offered with its real costs stated: Chrome 136+ refuses
`--remote-debugging-port` on the default profile, so it needs its own
`--user-data-dir` and a fresh sign-in; and captures are less deterministic,
because the attached browser's extensions and flags affect rendering.

If a site blocks attach too, that is the end of the road, and the tool says so
rather than offering a next thing to try.

## Consequences

- `doctor` now also names a challenge served as the **document** itself, not
  only as the answer to a data request. That was a real gap: the previous check
  only looked at `html-for-json` findings, so the more serious case — the site
  never loaded at all — was invisible.
- The fixture gains `blocked.html`, carrying both the structural markers and the
  wording. Unlinked from `index.html`, so the crawl link graph is unchanged.
- The wording list is English-shaped, like ADR 28's and 29's. A challenge with
  no recognised markup **and** no recognised wording is reported as an ordinary
  page. The structural markers make this much less likely than wording alone
  would.
- `checkSignIn` returns a wider type (`RunGateVerdict`) so callers can act on
  `challenged` distinctly. Only `crawl` currently stops on it; `inspect` is
  interactive and the user can see the interstitial for themselves.
- Detection costs one `page.evaluate` on the first page of a run.
