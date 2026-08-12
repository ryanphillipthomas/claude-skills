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
export type FindingKind =
  | 'html-for-json'
  | 'unauthorised'
  | 'rate-limited'
  | 'server-error'
  | 'request-failed'
  | 'cancelled';

export interface NetworkFinding {
  kind: FindingKind;
  url: string;
  status: number | undefined;
  contentType: string | undefined;
  resourceType: string;
  /** First line or so of an HTML body, to say *what kind* of page came back. */
  preview: string | undefined;
  reason: string;
}

/**
 * Most significant first. A page's telemetry beacons abort by the handful on
 * every navigation, and in the run this ordering was written for they buried
 * the one 401 that explained everything under five lines of `ERR_ABORTED`.
 */
const KIND_RANK: Record<FindingKind, number> = {
  'html-for-json': 0,
  unauthorised: 1,
  'rate-limited': 2,
  'server-error': 3,
  'request-failed': 4,
  cancelled: 5,
};

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

function reasonFor(kind: FindingKind, status: number | undefined): string {
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
    case 'cancelled':
      return 'cancelled before it finished — usually the page itself, a navigation, or a blocker; rarely the problem';
  }
}

/**
 * `ERR_ABORTED` is what a fire-and-forget beacon looks like when the page
 * navigates away from it, and what a content blocker looks like from inside the
 * page. Reporting it at the same weight as a 401 is how a real diagnosis got
 * buried under analytics noise.
 */
function isCancellation(errorText: string | undefined): boolean {
  return errorText !== undefined && /ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/i.test(errorText);
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
    const errorText = request.failure()?.errorText;
    const kind: FindingKind = isCancellation(errorText) ? 'cancelled' : 'request-failed';
    findings.push({
      kind,
      url: safeUrl(request.url()),
      status: undefined,
      contentType: undefined,
      resourceType: request.resourceType(),
      preview: errorText,
      reason: reasonFor(kind, undefined),
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
        // Stable within a rank, so the order requests happened in survives.
        findings: findings
          .map((finding, index) => ({ finding, index }))
          .sort((a, b) =>
            KIND_RANK[a.finding.kind] - KIND_RANK[b.finding.kind] || a.index - b.index,
          )
          .map((entry) => entry.finding),
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
export function summarise(diagnosis: PageDiagnosis, signedOut?: boolean): string[] {
  const lines: string[] = [];
  const htmlForJson = diagnosis.findings.filter((finding) => finding.kind === 'html-for-json');
  const refused = diagnosis.findings.filter(
    (finding) => finding.kind === 'unauthorised' || finding.kind === 'rate-limited',
  );

  // A block on the document itself is a different shape from a block on a data
  // request — the page never loads at all — and it was previously invisible
  // here, because only `html-for-json` findings were checked for challenge
  // wording. It is the more important case: nothing on the site was reached.
  const blocked = diagnosis.findings.find(
    (finding) =>
      finding.kind !== 'html-for-json' &&
      finding.resourceType === 'document' &&
      looksLikeChallenge(finding.preview),
  );
  if (blocked !== undefined) {
    lines.push(
      `The page itself was answered with a challenge (${String(blocked.status ?? 0)}: ` +
        `"${blocked.preview ?? ''}"). The site is refusing an automated browser — ` +
        'this is not a sign-in problem, and re-saving a profile will not help.',
    );
  }

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
    const first = refused[0];
    lines.push(
      `${String(refused.length)} request(s) were refused outright (${String(first?.status ?? 0)}). ` +
        'The page loaded, but its data did not.',
    );
    // A 401 and a "Sign in" button are one fact, not two, and saying so is the
    // difference between a diagnosis and a list.
    if (signedOut === true && refused.some((finding) => finding.status === 401)) {
      lines.push(
        `That 401 and the sign-in control on the page are the same fact: the session ` +
          'this run used is not authenticated. This is not a bot challenge — no request ' +
          'was answered with a challenge page.',
      );
    }
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
