import { sleep } from '@ui-atlas/settle';

/**
 * A minimum interval between requests to one origin, enforced across every
 * worker rather than per worker.
 *
 * This is the whole reason the throttle exists. `perPageDelayMs` used to be a
 * pause a single loop took between pages; with four workers, four pauses run at
 * once and the origin sees four times the traffic it agreed to. Reserving the
 * slot *before* awaiting turns concurrent callers into a queue: each one takes
 * the next interval rather than all of them waiting out the same one.
 */
export class OriginThrottle {
  private readonly nextFreeAt = new Map<string, number>();

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** How long the next caller for `origin` would have to wait, right now. */
  waitFor(origin: string): number {
    if (this.minIntervalMs <= 0) return 0;
    return Math.max(0, (this.nextFreeAt.get(origin) ?? 0) - this.now());
  }

  /**
   * Wait until this origin may be visited again, then claim the slot.
   *
   * `maxWaitMs` bounds the wait by whatever is left of the run budget, so the
   * politeness delay can never push a crawl past its own deadline.
   */
  async acquire(origin: string, maxWaitMs = Number.POSITIVE_INFINITY): Promise<number> {
    if (this.minIntervalMs <= 0) return 0;

    const now = this.now();
    const earliest = Math.max(now, this.nextFreeAt.get(origin) ?? 0);
    // Claim before awaiting: two workers arriving together must get two
    // consecutive slots, not the same one.
    this.nextFreeAt.set(origin, earliest + this.minIntervalMs);

    const waitMs = Math.min(Math.max(0, earliest - now), Math.max(0, maxWaitMs));
    if (waitMs > 0) await sleep(waitMs);
    return waitMs;
  }
}
