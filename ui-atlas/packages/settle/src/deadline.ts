/** A monotonic budget shared by every step of one settle pass. */
export class Deadline {
  readonly startedAt: number;
  readonly totalMs: number;

  constructor(totalMs: number, now: () => number = () => Date.now()) {
    this.totalMs = totalMs;
    this.now = now;
    this.startedAt = now();
  }

  private readonly now: () => number;

  elapsedMs(): number {
    return this.now() - this.startedAt;
  }

  remainingMs(): number {
    return Math.max(0, this.totalMs - this.elapsedMs());
  }

  expired(): boolean {
    return this.remainingMs() <= 0;
  }

  /** Budget for one step: never more than what is left overall. */
  budgetFor(stepMs: number): number {
    return Math.max(0, Math.min(stepMs, this.remainingMs()));
  }
}

export const TIMED_OUT = Symbol('timed-out');

/**
 * Race `work` against `ms`. Returns {@link TIMED_OUT} instead of throwing so
 * callers can record a timed-out check and carry on to the next one.
 */
export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
): Promise<T | typeof TIMED_OUT> {
  if (ms <= 0) return TIMED_OUT;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}
