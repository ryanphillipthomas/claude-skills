/**
 * Turn a Chromium network error into the sentence that says what to do.
 *
 * `net::ERR_CONNECTION_REFUSED at http://127.0.0.1:4173/` is accurate and
 * useless: it describes the socket, not the situation. On a loopback address it
 * means one thing almost every time — the dev server is not running — and
 * saying so is the difference between a five-second fix and a puzzled minute.
 *
 * Pure, so the wording is tested without a browser, and `undefined` when there
 * is nothing useful to add: a hint that fires on everything teaches people to
 * ignore hints.
 */
export function navigationHint(message: string, url: string): string | undefined {
  const local = isLoopback(url);

  if (message.includes('ERR_CONNECTION_REFUSED')) {
    return local
      ? `nothing is listening on ${hostPort(url)}. Start the app you want to capture first — ` +
          "for UI Atlas's own fixture site, that is `npm run fixtures`."
      : `${hostPort(url)} refused the connection. The host is reachable but nothing is serving that port.`;
  }

  if (message.includes('ERR_NAME_NOT_RESOLVED')) {
    return `${hostName(url)} could not be resolved. Check the spelling, or your network.`;
  }

  if (message.includes('ERR_CONNECTION_TIMED_OUT') || message.includes('Timeout')) {
    return local
      ? `${hostPort(url)} accepted the connection but never answered. The app may still be starting.`
      : `${hostPort(url)} did not answer in time. It may be slow, or blocking this browser.`;
  }

  if (message.includes('ERR_CERT_') || message.includes('ERR_SSL_')) {
    return (
      "the certificate was rejected. For a local server with a self-signed certificate, set " +
      '`browser.ignoreHttpsErrors: true` in the config.'
    );
  }

  if (message.includes('ERR_CONNECTION_RESET') || message.includes('ERR_EMPTY_RESPONSE')) {
    return `${hostPort(url)} closed the connection without answering. If this is an https:// URL, check the app is not serving plain http.`;
  }

  return undefined;
}

function parsed(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

function isLoopback(url: string): boolean {
  const target = parsed(url);
  if (target === undefined) return false;
  return (
    target.hostname === 'localhost' ||
    target.hostname === '127.0.0.1' ||
    target.hostname === '::1' ||
    target.hostname === '0.0.0.0' ||
    target.hostname.endsWith('.localhost')
  );
}

function hostPort(url: string): string {
  return parsed(url)?.host ?? url;
}

function hostName(url: string): string {
  return parsed(url)?.hostname ?? url;
}
