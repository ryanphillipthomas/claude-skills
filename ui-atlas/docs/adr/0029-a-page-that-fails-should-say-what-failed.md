# 29. A page that fails should say what failed

- Status: accepted
- Date: 2026-08-12

## Context

The same message kept coming back from real use:

```
Error: Unexpected token '<', "<!DOCTYPE "... is not valid JSON
Trace ID: -
```

It is not UI Atlas's error. It is the site's own JavaScript: a `fetch` asked for
JSON and received an HTML document, and `JSON.parse` reported the first
character it could not use. Everything that matters is missing from it — which
request, what the HTML was, and therefore *why*.

That last part is the whole problem, because at least three unrelated causes
produce this identical sentence:

- a bot challenge or WAF interstitial answered an API call
- the session expired and the API redirected to a sign-in page
- the endpoint genuinely 500'd behind a friendly error page

The first cannot be fixed by UI Atlas at all. The second is fixed by re-saving
the profile. The third is the site's problem. Telling a user "sign in again"
when the truth is "you are being challenged" wastes their afternoon, and the
error message gives no way to tell.

[ADR 28](0028-a-saved-sign-in-is-checked-not-assumed.md) made the sign-in state
legible. This makes the network legible, which is the layer the actual symptom
lives in.

## Decision

### `ui-atlas doctor <url>` watches a page load and reports what happened

`watchPage` attaches to `response`, `requestfailed`, `pageerror` and `console`
before navigation, and returns a `stop` the caller invokes once the page has
settled — so the command, not the watcher, decides when a load is over.

A response is worth reporting when it is:

| Kind | Condition |
| --- | --- |
| `html-for-json` | the request was `fetch`/`xhr` and the response is `text/html` |
| `unauthorised` | 401, 403 or 407 |
| `rate-limited` | 429 |
| `server-error` | 5xx |
| `request-failed` | the request never completed |

`html-for-json` is the finding this command exists for, and it is deliberately
**not** conditioned on the status: an edge layer commonly returns its
interstitial with a 200, which is exactly why the failure is confusing.

### The HTML body is read, because the body is the answer

A finding says `403 fetch https://example.com/api/me`. That still does not say
whether it was a challenge or a login page. So for HTML responses the body is
read, reduced to its `<title>` or first sentence, and printed:
`body: "Just a moment…"`.

`summarise` — pure, so it is tested without a browser — turns that into the one
sentence the user needs, matching the interstitial's own words:

- *"A bot challenge answered a data request. UI Atlas has no way around that and
  will not get one."*
- *"A sign-in page answered a data request. The session this run is using is not
  signed in as far as the server is concerned."*

When it matches neither, it says plainly that HTML came back where data was
expected and stops there, rather than inventing a cause.

### The page's own error is reported verbatim, next to the request that caused it

`pageerror` and console errors are captured and printed unchanged. The point is
not to replace the message the user already saw — it is to put it directly
beside the response that produced it, so the two are obviously one event.

### Query strings never reach the output

Every URL is reduced to `origin + pathname`, with a bare `?…` when parameters
were present. Access tokens, session ids and signed URLs live in query strings,
and a diagnostic that a user will paste into a chat window must not carry them.
Only HTML bodies are previewed, never JSON — a JSON body is the user's data.

### It writes nothing

No run directory, no captures, no manifest. `doctor` is a read, and it says so.
Exit code 1 when it found something, so it can gate a script; the findings, not
the load, decide.

## Consequences

- One new command and one new module. `doctor` deliberately does not reuse the
  `AtlasSession` machinery: a diagnosis should work on a page too broken to
  capture, and should not create a run directory to be cleaned up afterwards.
- Reading response bodies is bounded — HTML only, capped at 25 findings, and
  reduced to a title-length preview. A page with a hundred failing requests
  reports the first 25.
- The interstitial vocabulary ("just a moment", "access denied", "sign in") is
  English-shaped, like ADR 28's. A challenge page in another language is
  reported as `html-for-json` without a name, which is the right failure.
- The fixture site gains `broken-api.html` and `challenge.html`, reproducing the
  exact failure: a 200 document whose `fetch` receives `text/html` and throws.
  Neither is linked from `index.html`, so the crawl tests' link graph is
  unchanged.
- **This diagnoses; it does not fix.** Naming a bot challenge does not get past
  one, and UI Atlas will not gain evasion. The most useful thing the command can
  do in that case is say so in one sentence, so nobody spends an afternoon
  re-saving a profile that was never the problem.
