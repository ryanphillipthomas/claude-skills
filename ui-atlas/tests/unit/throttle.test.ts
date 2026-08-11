import { describe, expect, it } from 'vitest';
import { OriginThrottle } from '@ui-atlas/crawler';

/** A clock the test moves by hand, so nothing here waits on real time. */
function fakeClock(start = 0): { now: () => number; advance: (ms: number) => void } {
  let value = start;
  return { now: () => value, advance: (ms) => { value += ms; } };
}

describe('per-origin throttle', () => {
  it('does nothing at all when the delay is zero', async () => {
    const throttle = new OriginThrottle(0);
    expect(await throttle.acquire('https://a.test')).toBe(0);
    expect(await throttle.acquire('https://a.test')).toBe(0);
    expect(throttle.waitFor('https://a.test')).toBe(0);
  });

  it('hands consecutive callers consecutive slots', async () => {
    // The property that makes this a throttle rather than a sleep: the slot is
    // claimed before the wait, so N workers arriving together queue up instead
    // of all waiting out the same interval and then going at once.
    const clock = fakeClock();
    const throttle = new OriginThrottle(100, clock.now);

    // `maxWaitMs: 0` skips the sleeping while still claiming the slot, so the
    // ladder can be inspected without the test taking half a second.
    await throttle.acquire('https://a.test', 0);
    expect(throttle.waitFor('https://a.test')).toBe(100);

    await throttle.acquire('https://a.test', 0);
    expect(throttle.waitFor('https://a.test')).toBe(200);

    await throttle.acquire('https://a.test', 0);
    expect(throttle.waitFor('https://a.test')).toBe(300);
  });

  it('lets the queue drain as time passes', async () => {
    const clock = fakeClock();
    const throttle = new OriginThrottle(100, clock.now);

    await throttle.acquire('https://a.test', 0);
    expect(throttle.waitFor('https://a.test')).toBe(100);

    clock.advance(60);
    expect(throttle.waitFor('https://a.test')).toBe(40);
    clock.advance(40);
    expect(throttle.waitFor('https://a.test')).toBe(0);

    // A caller arriving after the interval waits for nothing.
    expect(await throttle.acquire('https://a.test', 0)).toBe(0);
  });

  it('keeps a separate queue per origin', async () => {
    const clock = fakeClock();
    const throttle = new OriginThrottle(100, clock.now);

    await throttle.acquire('https://a.test', 0);
    await throttle.acquire('https://a.test', 0);
    expect(throttle.waitFor('https://a.test')).toBe(200);
    // Being polite to one host says nothing about another.
    expect(throttle.waitFor('https://b.test')).toBe(0);

    await throttle.acquire('https://b.test', 0);
    expect(throttle.waitFor('https://b.test')).toBe(100);
    expect(throttle.waitFor('https://a.test')).toBe(200);
  });

  it('never waits longer than the budget it was given', async () => {
    const clock = fakeClock();
    const throttle = new OriginThrottle(10_000, clock.now);

    await throttle.acquire('https://a.test', 0);
    // A ten-second politeness delay must not push a crawl past its own
    // deadline, so the wait is clamped by what is left of the run.
    const started = Date.now();
    const waited = await throttle.acquire('https://a.test', 20);
    expect(waited).toBe(20);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('actually waits, against the real clock', async () => {
    const throttle = new OriginThrottle(40);
    await throttle.acquire('https://a.test');
    const started = Date.now();
    await throttle.acquire('https://a.test');
    // Timers fire late, never early; a lower bound is the safe assertion.
    expect(Date.now() - started).toBeGreaterThanOrEqual(30);
  });
});
