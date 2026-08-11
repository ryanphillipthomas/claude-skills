import { describe, expect, it } from 'vitest';
import { RetryConfigSchema, type RetryConfig } from '@ui-atlas/config';
import { backoffDelayMs, decideRetry, parseRetryAfter, type AttemptOutcome } from '@ui-atlas/crawler';

function retryConfig(overrides: Record<string, unknown> = {}): RetryConfig {
  return RetryConfigSchema.parse(overrides);
}

/** No jitter and a fixed roll, so a delay is a number the test can name. */
const NO_JITTER = () => 0;

describe('Retry-After', () => {
  it('reads delta-seconds', () => {
    expect(parseRetryAfter('120')).toBe(120_000);
    expect(parseRetryAfter('0')).toBe(0);
    expect(parseRetryAfter('  30  ')).toBe(30_000);
  });

  it('reads an HTTP date, relative to now', () => {
    const now = Date.parse('2026-08-11T12:00:00Z');
    expect(parseRetryAfter('Tue, 11 Aug 2026 12:00:30 GMT', now)).toBe(30_000);
  });

  it('treats a date in the past as "you may go now"', () => {
    const now = Date.parse('2026-08-11T12:00:00Z');
    expect(parseRetryAfter('Tue, 11 Aug 2026 11:59:00 GMT', now)).toBe(0);
  });

  it('returns nothing for a header it cannot read, rather than inventing a delay', () => {
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter('   ')).toBeUndefined();
    expect(parseRetryAfter('soon please')).toBeUndefined();
    expect(parseRetryAfter('-5')).toBeUndefined();
  });
});

describe('backoff', () => {
  it('doubles each attempt', () => {
    const config = retryConfig({ baseDelayMs: 100, jitter: 0 });
    expect(backoffDelayMs(1, config, NO_JITTER)).toBe(100);
    expect(backoffDelayMs(2, config, NO_JITTER)).toBe(200);
    expect(backoffDelayMs(3, config, NO_JITTER)).toBe(400);
  });

  it('stops doubling at maxDelayMs', () => {
    const config = retryConfig({ baseDelayMs: 100, maxDelayMs: 250, jitter: 0 });
    expect(backoffDelayMs(3, config, NO_JITTER)).toBe(250);
    expect(backoffDelayMs(9, config, NO_JITTER)).toBe(250);
  });

  it('adds jitter within the configured fraction', () => {
    const config = retryConfig({ baseDelayMs: 100, jitter: 0.5 });
    expect(backoffDelayMs(1, config, () => 0)).toBe(100);
    expect(backoffDelayMs(1, config, () => 1)).toBe(150);
    expect(backoffDelayMs(1, config, () => 0.5)).toBe(125);
  });
});

describe('deciding whether to retry', () => {
  const ok: AttemptOutcome = { kind: 'ok', status: 200 };

  function decide(outcome: AttemptOutcome, attempt = 1, overrides: Record<string, unknown> = {}) {
    return decideRetry(outcome, {
      attempt,
      config: retryConfig({ baseDelayMs: 100, jitter: 0, ...overrides }),
      random: NO_JITTER,
    });
  }

  it('does not retry a page that loaded', () => {
    expect(decide(ok).retry).toBe(false);
  });

  it('retries a navigation failure while attempts remain', () => {
    const first = decide({ kind: 'navigation-error', message: 'timeout' }, 1);
    expect(first.retry).toBe(true);
    expect(first.delayMs).toBe(100);
    expect(first.reason).toContain('timeout');

    // maxAttempts defaults to 3, so the third attempt is the last.
    expect(decide({ kind: 'navigation-error', message: 'timeout' }, 3).retry).toBe(false);
  });

  it('never retries when maxAttempts is 1', () => {
    expect(decide({ kind: 'navigation-error', message: 'x' }, 1, { maxAttempts: 1 }).retry).toBe(
      false,
    );
  });

  it('leaves alone the statuses that will not improve', () => {
    for (const status of [400, 401, 403, 404, 410]) {
      const decision = decide({ kind: 'http-error', status });
      expect(decision.retry, `HTTP ${String(status)}`).toBe(false);
      expect(decision.originPenaltyMs).toBeUndefined();
    }
  });

  it('retries the statuses that might', () => {
    for (const status of [408, 425, 500, 502, 504]) {
      const decision = decide({ kind: 'http-error', status });
      expect(decision.retry, `HTTP ${String(status)}`).toBe(true);
      // These mean "that request went wrong", not "slow down".
      expect(decision.originPenaltyMs).toBeUndefined();
    }
  });

  it('slows the whole origin down for a 429 or a 503', () => {
    for (const status of [429, 503]) {
      const decision = decide({ kind: 'http-error', status });
      expect(decision.retry).toBe(true);
      expect(decision.originPenaltyMs).toBe(100);
    }
  });

  it('still slows the origin down after giving up on the page', () => {
    // Giving up on one page is no reason to keep hammering the host, and by the
    // third 429 the backoff has grown: 100 → 200 → 400.
    const decision = decide({ kind: 'http-error', status: 429 }, 3);
    expect(decision.retry).toBe(false);
    expect(decision.originPenaltyMs).toBe(400);
  });

  it('honours Retry-After over its own backoff', () => {
    const decision = decide({ kind: 'http-error', status: 503, retryAfter: '2' });
    expect(decision.delayMs).toBe(2_000);
    expect(decision.originPenaltyMs).toBe(2_000);
    expect(decision.reason).toContain('Retry-After');
  });

  it('clamps a Retry-After it will not wait out', () => {
    const decision = decide({ kind: 'http-error', status: 503, retryAfter: '86400' }, 1, {
      maxRetryAfterMs: 5_000,
    });
    expect(decision.delayMs).toBe(5_000);
    expect(decision.originPenaltyMs).toBe(5_000);
  });

  it('falls back to backoff when Retry-After is unreadable', () => {
    const decision = decide({ kind: 'http-error', status: 429, retryAfter: 'whenever' });
    expect(decision.delayMs).toBe(100);
  });

  it('respects a configured status list', () => {
    expect(decide({ kind: 'http-error', status: 418 }).retry).toBe(false);
    expect(decide({ kind: 'http-error', status: 418 }, 1, { retryStatuses: [418] }).retry).toBe(
      true,
    );
  });
});
