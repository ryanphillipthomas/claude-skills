import type { Page, Request, Response } from 'playwright';

/**
 * One network response worth telling the user about, and why.
 *
 * The failure this exists for is the site's own error, not ours:
 * `Unexpected token '<', "<!DOCTYPE "` means a `fetch` expecting JSON received
 * an HTML document. That message names neither the request nor what the HTML
 * was, so it is indistinguishable from a dozen unrelated problems. This finds
 * the response behind it.
 */
export interface NetworkFinding {
  kind: 'html-for-json' | 'unauthorised' | 'rate-limited' | 'server-error' | 'request-failed';
  url: string;
  status: number | undefined;
  contentType: string | undefined;
  resourceType: string;
  /** First line or so of an HTML body, to say *what kind* of page came back. */
  preview: string | undefined;
  reason: string;
}

export interface PageDiagnosis {
  requestedUrl: string;
  finalUrl: string;
  status: number | undefined;
  /** Errors the page's own scripts threw, in the order they happened. */
  pageErrors: string[];
  consoleErrors: string[];
  findings: NetworkFinding[];
}

const MAX_FINDINGS = 25;
const MAX_ERRORS = 10;
const PREVIEW_LENGTH = 160;

/** Strip query and fragment: either can carry a token or a session id. */
export function safeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const trimmed = `${parsed.origin}${parsed.pathname}`;
    return parsed.search.length > 0 ? `${trimmed}?…` : trimmed;
  } catch {
    return '[unparseable url]';
  }
}

/**
 * Squeeze an HTML body down to the sentence that identifies it — "Just a
 * moment…", "Sign in", "Access denied" — with tags and whitespace gone.
 */
export function previewHtml(body: string): string {
  const title = /<title[^>]*>([\s\S]{0,200}?)<\/title>/i.exec(body)?.[1];
  const source = title ?? body;
  const text = source
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH - 1)}…` : text;
}

function classify(response: Response, request: Request): NetworkFinding['kind'] | undefined {
  const status = response.status();
  const type = request.resourceType();
  const contentType = (response.headers()['content-type'] ?? '').toLowerCase();

  if (status === 401 || status === 403 || status === 407) return 'unauthorised';
  if (status === 429) return 'rate-limited';
  if (status >= 500) return 'server-error';

  // The one that produces `Unexpected token '<'`: the page asked for data and
  // an HTML document came back, whatever the status line said.
  if ((type === 'fetch' || type === 'xhr') && contentType.includes('text/html')) {
    return 'html-for-json';
  }
  return undefined;
}

function reasonFor(kind: NetworkFinding['kind'], status: number | undefined): string {
  switch (kind) {
    case 'html-for-json':
      return 'the page asked for data and received an HTML document — this is what produces "Unexpected token \'<\'"';
    case 'unauthorised':
      return `refused with ${String(status ?? 0)}: this request is not authenticated as far as the server is concerned`;
    case 'rate-limited':
      return 'refused with 429: too many requests, or an automated client was detected';
    case 'server-error':
      return `the server answered ${String(status ?? 0)}`;
    case 'request-failed':
      return 'the request never completed';
  }
}

/**
 * Watch a page load and report what actually happened on the network.
 *
 * Returns a `stop` you call after navigating and settling, so the caller keeps
 * control of when the page is considered loaded.
 */
export function watchPage(page: Page, requestedUrl: string): { stop: () => PageDiagnosis } {
  const findings: NetworkFinding[] = [];
  const pending: Array<Promise<void>> = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];

  const onResponse = (response: Response): void => {
    if (findings.length >= MAX_FINDINGS) return;
    const request = response.request();
    const kind = classify(response, request);
    if (kind === undefined) return;

    const headers = response.headers();
    const contentType = headers['content-type'];
    const finding: NetworkFinding = {
      kind,
      url: safeUrl(response.url()),
      status: response.status(),
      contentType,
      resourceType: request.resourceType(),
      preview: undefined,
      reason: reasonFor(kind, response.status()),
    };
    findings.push(finding);

    // Reading the body can only be done while the response is alive, so start
    // it now and let `stop` wait for it.
    if ((contentType ?? '').toLowerCase().includes('text/html')) {
      pending.push(
        response
          .text()
          .then((body) => {
            finding.preview = previewHtml(body);
          })
          .catch(() => undefined),
      );
    }
  };

  const onRequestFailed = (request: Request): void => {
    if (findings.length >= MAX_FINDINGS) return;
    findings.push({
      kind: 'request-failed',
      url: safeUrl(request.url()),
      status: undefined,
      contentType: undefined,
      resourceType: request.resourceType(),
      preview: request.failure()?.errorText,
      reason: reasonFor('request-failed', undefined),
    });
  };

  const onPageError = (error: Error): void => {
    if (pageErrors.length < MAX_ERRORS) pageErrors.push(error.message);
  };

  const onConsole = (message: { type(): string; text(): string }): void => {
    if (message.type() !== 'error') return;
    if (consoleErrors.length < MAX_ERRORS) consoleErrors.push(message.text().slice(0, 300));
  };

  page.on('response', onResponse);
  page.on('requestfailed', onRequestFailed);
  page.on('pageerror', onPageError);
  page.on('console', onConsole);

  return {
    stop: (): PageDiagnosis => {
      page.off('response', onResponse);
      page.off('requestfailed', onRequestFailed);
      page.off('pageerror', onPageError);
      page.off('console', onConsole);
      return {
        requestedUrl,
        finalUrl: page.url(),
        status: undefined,
        pageErrors,
        consoleErrors,
        findings,
      };
    },
  };
}

/** Wait for any body reads started while watching. Call before `stop`. */
export async function settleDiagnosis(): Promise<void> {
  // Bodies are read eagerly; a short turn of the event loop is enough for the
  // already-started reads to land without holding the command open.
  await new Promise((resolve) => setTimeout(resolve, 250));
}

/**
 * The one-line conclusion, when the findings support one.
 *
 * Pure, so the judgement is testable, and so there is a single place that turns
 * a list of responses into "you are being challenged" versus "you are signed
 * out" — two things that look identical from inside the page.
 */
export function summarise(diagnosis: PageDiagnosis): string[] {
  const lines: string[] = [];
  const htmlForJson = diagnosis.findings.filter((finding) => finding.kind === 'html-for-json');
  const refused = diagnosis.findings.filter(
    (finding) => finding.kind === 'unauthorised' || finding.kind === 'rate-limited',
  );

  if (htmlForJson.length > 0) {
    const challenge = htmlForJson.find((finding) => looksLikeChallenge(finding.preview));
    const login = htmlForJson.find((finding) => looksLikeLoginPage(finding.preview));
    if (challenge !== undefined) {
      lines.push(
        `A bot challenge answered a data request (${challenge.url}: "${challenge.preview ?? ''}"). ` +
          'UI Atlas has no way around that and will not get one.',
      );
    } else if (login !== undefined) {
      lines.push(
        `A sign-in page answered a data request (${login.url}: "${login.preview ?? ''}"). ` +
          'The session this run is using is not signed in as far as the server is concerned.',
      );
    } else {
      lines.push(
        `${String(htmlForJson.length)} data request(s) received HTML instead. ` +
          'That is the cause of any "Unexpected token \'<\'" error on this page.',
      );
    }
  }

  if (refused.length > 0 && htmlForJson.length === 0) {
    lines.push(
      `${String(refused.length)} request(s) were refused outright (${refused[0]?.status ?? 0}). ` +
        'The page loaded, but its data did not.',
    );
  }

  if (lines.length === 0 && diagnosis.pageErrors.length > 0) {
    lines.push(
      'The page threw an error, but no request stands out as the cause. ' +
        'The error text is below verbatim.',
    );
  }
  return lines;
}

function looksLikeChallenge(preview: string | undefined): boolean {
  if (preview === undefined) return false;
  return /just a moment|checking your browser|attention required|cloudflare|are you a robot|captcha|access denied|unusual traffic/i.test(
    preview,
  );
}

function looksLikeLoginPage(preview: string | undefined): boolean {
  if (preview === undefined) return false;
  return /sign in|log in|login|sign up|authenticate|session expired/i.test(preview);
}
