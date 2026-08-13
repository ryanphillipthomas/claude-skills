# 33. The extension talks over a socket, not a port

- Status: accepted
- Date: 2026-08-12

## Context

Design turn 6's third stage is a browser extension: capture the page you are
already looking at, without retyping its URL into a terminal or a menu bar
field. Its staging note says it "needs only a local connection to the
already-running engine".

The launcher built in ADR 32 deliberately has no such connection. It is a
supervisor — it spawns commands and reads their output — precisely so that
stage one needed no new engine work. Stage three is where that has to change,
and the shape of the connection is the whole decision.

The design's own mock answers it: a `port 7333` chip beside the running engine.
That is the obvious answer and we are not taking it.

## Decision

### A unix domain socket

`~/.ui-atlas/launcher.sock`, mode 0600, in a directory that is already 0700
because it holds saved sessions.

A localhost TCP port is reachable by **every page in every browser on the
machine**. The things that would stand in front of it are weak:

- CORS does not stop a request being *made*. A page cannot read the response of
  a cross-origin `POST`, but the capture would already have started.
- A bearer token would fix that, and the extension has no private way to learn
  one. Anything the extension can read from disk or from a well-known URL, a
  page can be made to read too.

A socket file is reachable by nothing that runs in a web page. The permission
check is the kernel's, not a string compare in our code.

### Chrome reaches it through native messaging

Chrome will not connect to a unix socket, so a small relay
(`bridge/native-host.mjs`) translates between Chrome's length-prefixed stdio
protocol and newline-delimited JSON on the socket. Chrome spawns it, and only
for an extension whose id appears in the host manifest's `allowed_origins`.

That gives two independent gates — the filesystem, and Chrome's own allowlist —
and neither is enforced by us.

The relay holds no state and makes no decisions. It forwards bytes verbatim and
lets the launcher validate them; re-parsing in the relay would only create a
second, differently-wrong idea of what a valid request is.

### The extension id is derived, not configured

Chrome gives an unpacked extension an id computed from its absolute load path.
`unpackedExtensionId` computes the same value, so `launcher:install-extension`
can write a manifest naming the exact extension without anyone copying an id out
of `chrome://extensions`. Moving the checkout changes the id, which is why
installing is a command you re-run rather than a one-off.

### The protocol is four methods and no paths

`status`, `start`, `stop`, `capture`. `capture` carries a URL and a mode, and
nothing else. There is deliberately no method that names a path, a profile
directory, a command or a flag — a browser is the far end of this socket, so it
gets to say *what* to look at and never *how*.

The URL is schema-validated as http(s) before use and then passed as one argv
element, never interpolated into a command string. The three modes map to
`inspect`, `capture` and `crawl`; that mapping lives on this side.

### A stopped launcher is a state, not an error

The design is explicit: "if the engine is stopped, its popover shows the same
Start button rather than an error". So an absent socket, a missing host manifest
and a disconnected port all resolve to the same calm popover with a Start
button. The extension never shows a stack trace for the most ordinary thing
that can happen to it.

While a sign-in question is open, the extension's Start is disabled and its
caption points at the menu bar. An enabled Start beside "answer this in the menu
bar" is contradictory advice, and pressing it would relaunch and ask the same
question again.

### `capture` and `crawl` now announce their run

Only `inspect` printed `run <id> → <dir>`. The launcher watches for that line,
so the extension's Page and Whole-site modes had nothing to watch. Both commands
now print it, in the same format and at the same point — which is independently
useful: a crawl is the longest thing this tool does, and knowing where it writes
before it finishes matters most there.

## Consequences

- The launcher now listens on something. It is a socket in the user's own home
  rather than a port, but it is still a surface, and it is validated as one.
- The `port 7333` from the design does not exist and still does not. The engine
  row shows the run id.
- macOS paths only: `NATIVE_HOST_DIRECTORIES` lists the Chromium-family
  locations under `~/Library/Application Support`. Linux and Windows would need
  their own, and the socket would need a named pipe on Windows.
- The extension is unpacked and unsigned. It is loaded through Developer mode,
  not the Web Store, and packaging one remains out of scope.
- Chrome itself cannot be driven from the test suite, so what is verified here
  stops at the relay: the framing, the socket, the validation and the popover's
  decisions are all tested; the extension actually loading in a browser is not.
