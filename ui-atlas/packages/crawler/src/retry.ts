import type { RetryConfig } from '@ui-atlas/config';

/**
 * How one attempt at a page ended. Kept separate from the decision to retry so
 * the policy below is a pure function of facts, testable without a browser.
 */
export type AttemptOutcome =
  | { kind: 'ok'; status: number | undefined }
  | { kind: 'http-error'; status: number; retryAfter?: string | undefined }
  | { kind: 'navigation-error'; message: string };

export interface RetryDecision {
  retry: boolean;
  /** Says what happened, in the words that end up on the page record. */
  reason: string;
  /** How long to wait before the next attempt. */
  delayMs: number;
  /**
   * When set, hold the whole origin back by this long, not just this page: the
   * host said it is overloaded, and that applies to every worker.
   */
  originPenaltyMs?: number;
}

/**
 * `Retry-After` in either form the spec allows: delta-seconds, or an HTTP date.
 *
 * Returns milliseconds, or `undefined` when the header is absent or unparseable
 * — a header we cannot read is not a reason to invent a delay.
 */
export function parseRetryAfter(value: string | undefined, now = Date.now()): number | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;

  // delta-seconds. Checked first: a bare number is never a valid HTTP date.
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1_000;

  // `Date.parse` is far more permissive than the header's grammar — it reads
  // "-5" as a year and returns a real timestamp, which would turn a malformed
  // header into "retry immediately" instead of falling back to our own backoff.
  // Every HTTP-date form carries a day or month name, so require a letter.
  if (!/[a-z]/i.test(trimmed)) return undefined;

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return undefined;
  // A date in the past means "you may go now", not "go back in time".
  return Math.max(0, parsed - now);
}

/**
 * Exponential backoff with jitter.
 *
 * The jitter is the point. Four workers that failed together would otherwise
 * retry together and hand the host the same burst that upset it, so each waits
 * a slightly different amount.
 */
export function backoffDelayMs(
  attempt: number,
  config: RetryConfig,
  random: () => number = Math.random,
): number {
  const exponential = config.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(exponential, config.maxDelayMs);
  return Math.round(capped + capped * config.jitter * random());
}

/**
 * Whether an attempt is worth repeating, and how long to hold off.
 *
 * Two distinct ideas are deliberately kept apart. *Retryable* means the request
 * might work next time. *Backoff* means the host asked us to slow down — and
 * that answer belongs to the origin, so it is applied to every worker rather
 * than only to this page.
 */
export function decideRetry(
  outcome: AttemptOutcome,
  input: { attempt: number; config: RetryConfig; now?: number; random?: () => number },
): RetryDecision {
  const { config } = input;
  const attemptsLeft = input.attempt < config.maxAttempts;

  if (outcome.kind === 'ok') {
    return { retry: false, reason: 'the page loaded', delayMs: 0 };
  }

  if (outcome.kind === 'navigation-error') {
    if (!attemptsLeft) {
      return {
        retry: false,
        reason: `navigation failed and attempt ${String(input.attempt)} was the last`,
        delayMs: 0,
      };
    }
    return {
      retry: true,
      reason: `navigation failed (${outcome.message})`,
      delayMs: backoffDelayMs(input.attempt, config, input.random),
    };
  }

  const { status } = outcome;
  const wantsBackoff = config.backoffStatuses.includes(status);
  const retryable = config.retryStatuses.includes(status);

  const retryAfter = parseRetryAfter(outcome.retryAfter, input.now);
  const honoured =
    retryAfter === undefined ? undefined : Math.min(retryAfter, config.maxRetryAfterMs);
  const delayMs = honoured ?? backoffDelayMs(input.attempt, config, input.random);

  // A 429 slows the origin down whether or not this page has attempts left.
  // Giving up on one page is no reason to keep hammering the host.
  const penalty = wantsBackoff ? { originPenaltyMs: delayMs } : {};

  if (!retryable) {
    return {
      retry: false,
      reason: `HTTP ${String(status)} is not worth retrying`,
      delayMs: 0,
      ...penalty,
    };
  }
  if (!attemptsLeft) {
    return {
      retry: false,
      reason: `HTTP ${String(status)} after ${String(input.attempt)} attempt(s)`,
      delayMs: 0,
      ...penalty,
    };
  }

  const source = honoured === undefined ? 'backing off' : `honouring Retry-After (${outcome.retryAfter ?? ''})`;
  return {
    retry: true,
    reason: `HTTP ${String(status)}, ${source}`,
    delayMs,
    ...penalty,
  };
}
