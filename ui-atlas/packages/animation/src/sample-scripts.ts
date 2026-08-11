/**
 * Page-side sampling primitives, as typed function literals (ADR 5).
 *
 * Unlike the inventory, these deliberately *do* change animation state — that
 * is the point of sampling. Every one of them has a counterpart that puts it
 * back, and the host calls that counterpart in a `finally`.
 */

/** Everything needed to put one animation back exactly as it was. */
export interface AnimationState {
  currentTime: number | null;
  playbackRate: number;
  playState: string;
  /** `startTime` is what a running animation's position is really derived from. */
  startTime: number | null;
}

export function readAnimationState(animation: Animation): AnimationState {
  return {
    currentTime: typeof animation.currentTime === 'number' ? animation.currentTime : null,
    playbackRate: animation.playbackRate,
    playState: animation.playState,
    startTime: typeof animation.startTime === 'number' ? animation.startTime : null,
  };
}

/** Pause without moving: the frame on screen must not change yet. */
export function pauseAnimation(animation: Animation): void {
  animation.pause();
}

/**
 * Seek to `timeMs`. The animation must already be paused, or the clock will
 * carry it away from the moment being photographed.
 */
export function seekAnimation(animation: Animation, timeMs: number): void {
  animation.currentTime = timeMs;
}

/**
 * Put an animation back the way `state` describes.
 *
 * Order matters. Setting `currentTime` on an idle animation makes it paused, so
 * an idle animation is cancelled instead of seeked. Every step is guarded
 * individually: a restore that throws half way is worse than one that does as
 * much as it can and reports the rest.
 */
export function restoreAnimation(animation: Animation, state: AnimationState): string[] {
  const problems: string[] = [];
  const attempt = (what: string, action: () => void): void => {
    try {
      action();
    } catch (error) {
      problems.push(`${what}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  if (state.playState === 'idle') {
    // `cancel()` is the only way back to idle; seeking would leave it paused.
    attempt('cancel', () => animation.cancel());
    return problems;
  }

  attempt('playbackRate', () => {
    animation.playbackRate = state.playbackRate;
  });
  if (state.currentTime !== null) {
    attempt('currentTime', () => {
      animation.currentTime = state.currentTime;
    });
  }

  if (state.playState === 'running') {
    attempt('play', () => animation.play());
    // Restoring `startTime` puts a running animation back on the same clock it
    // was on, rather than restarting it from where it was paused.
    if (state.startTime !== null) {
      attempt('startTime', () => {
        animation.startTime = state.startTime;
      });
    }
  } else if (state.playState === 'finished') {
    attempt('finish', () => animation.finish());
  }
  // 'paused' needs nothing further: it is already paused from the seek.

  return problems;
}

/** Two frames, so a seek has actually been composited before the screenshot. */
export function settleFrames(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
  });
}

/** A fingerprint of every animation on the page, for proving nothing moved. */
export function snapshotAllAnimations(): string {
  return document
    .getAnimations()
    .map((animation) => {
      const time = typeof animation.currentTime === 'number' ? Math.round(animation.currentTime) : 'null';
      return `${animation.playState}@${String(time)}x${String(animation.playbackRate)}`;
    })
    .sort()
    .join('|');
}
