/**
 * Page-side discovery. Typed function literals, never template strings —
 * Playwright evaluates a string as an expression and never calls it (ADR 5).
 *
 * Everything here **reads**. It does not pause, seek, cancel, set a playback
 * rate, or touch `currentTime`. An inventory that perturbed the animations it
 * was describing would report a page that no longer exists.
 */

/** Raw facts about one animation, as plain data Playwright can serialise. */
export interface DiscoveredAnimation {
  /** `Animation.id` when the page set one; otherwise a position-based label. */
  id: string;
  kind: 'css-animation' | 'css-transition' | 'web-animation';
  /** `CSSAnimation.animationName`. */
  animationName: string | undefined;
  /** `CSSTransition.transitionProperty`. */
  transitionProperty: string | undefined;
  playState: string;
  /** Which clock drives it. `scroll`/`view` progress with scrolling, not time. */
  timeline: 'document' | 'scroll' | 'view' | 'unknown';
  playbackRate: number;
  /** `null` for a duration of `auto`, which has no number to sample against. */
  durationMs: number | null;
  delayMs: number;
  endDelayMs: number;
  /** `null` stands for `Infinity`, which does not survive serialisation. */
  iterations: number | null;
  iterationStart: number;
  direction: string;
  fill: string;
  easing: string;
  /** Keyframe offsets, when the effect will report them. */
  offsets: number[];
  /** Properties the keyframes actually animate. */
  properties: string[];
  pseudoElement: string | null;
  target: AnimationTarget | null;
}

export interface AnimationTarget {
  tagName: string;
  id: string | undefined;
  testId: string | undefined;
  /** Best-effort CSS selector, for finding the element again by eye. */
  selectorHint: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}

/** Motion the Web Animations API cannot describe, counted so it is not missed. */
export interface UnobservableMotion {
  canvas2d: number;
  webgl: number;
  video: number;
}

/**
 * Describe every animation the Web Animations API can see in this document.
 *
 * Deliberately *not* recursive into frames: the host iterates
 * `page.frames()` and evaluates this once per frame, which reaches cross-origin
 * frames that page script could never touch.
 */
export function discoverAnimations(): DiscoveredAnimation[] {
  const out: DiscoveredAnimation[] = [];

  const finite = (value: number): number | null => (Number.isFinite(value) ? value : null);

  const describeTarget = (element: Element): AnimationTarget => {
    const box = element.getBoundingClientRect();
    const testId = element.getAttribute('data-testid') ?? undefined;
    const id = element.id.length > 0 ? element.id : undefined;
    let selectorHint = element.tagName.toLowerCase();
    if (testId !== undefined) selectorHint = `[data-testid="${testId}"]`;
    else if (id !== undefined) selectorHint = `#${id}`;
    else if (element.classList.length > 0) {
      selectorHint = `${selectorHint}.${Array.from(element.classList).join('.')}`;
    }
    return {
      tagName: element.tagName.toLowerCase(),
      id,
      testId,
      selectorHint,
      boundingBox: { x: box.x, y: box.y, width: box.width, height: box.height },
    };
  };

  let animations: Animation[];
  try {
    // `Document.getAnimations()` takes no options and already covers the whole
    // document — `{ subtree: true }` is the `Element.getAnimations()` form.
    animations = document.getAnimations();
  } catch {
    return out;
  }

  for (let index = 0; index < animations.length; index += 1) {
    const animation = animations[index];
    if (animation === undefined) continue;

    const effect = animation.effect;
    const timing = effect?.getComputedTiming();

    // `CSSAnimation` and `CSSTransition` are the browser's own subclasses.
    // Feature-detecting the property is safer than an instanceof against a
    // global that may not exist.
    const asCss = animation as Animation & {
      animationName?: string;
      transitionProperty?: string;
    };
    const animationName = typeof asCss.animationName === 'string' ? asCss.animationName : undefined;
    const transitionProperty =
      typeof asCss.transitionProperty === 'string' ? asCss.transitionProperty : undefined;
    const kind: DiscoveredAnimation['kind'] =
      animationName !== undefined
        ? 'css-animation'
        : transitionProperty !== undefined
          ? 'css-transition'
          : 'web-animation';

    // A scroll- or view-driven animation progresses with scrolling rather than
    // with time, so no `currentTime` seek can reproduce a given frame.
    const timelineName = animation.timeline?.constructor?.name ?? '';
    const timeline: DiscoveredAnimation['timeline'] = timelineName.includes('Scroll')
      ? 'scroll'
      : timelineName.includes('View')
        ? 'view'
        : timelineName.includes('Document')
          ? 'document'
          : 'unknown';

    const offsets: number[] = [];
    const properties: string[] = [];
    const keyframeEffect = effect as KeyframeEffect | null;
    if (keyframeEffect !== null && typeof keyframeEffect.getKeyframes === 'function') {
      try {
        for (const frame of keyframeEffect.getKeyframes()) {
          if (typeof frame.offset === 'number') offsets.push(frame.offset);
          for (const key of Object.keys(frame)) {
            if (key === 'offset' || key === 'easing' || key === 'composite') continue;
            if (!properties.includes(key)) properties.push(key);
          }
        }
      } catch {
        // A keyframe list we cannot read is still an animation worth listing.
      }
    }

    const rawDuration = timing?.duration;
    const durationMs = typeof rawDuration === 'number' ? finite(rawDuration) : null;
    const rawIterations = timing?.iterations;

    const targetElement = keyframeEffect?.target ?? null;

    out.push({
      id: animation.id.length > 0 ? animation.id : `${kind}-${String(index)}`,
      kind,
      animationName,
      transitionProperty,
      playState: animation.playState,
      timeline,
      playbackRate: animation.playbackRate,
      durationMs,
      delayMs: typeof timing?.delay === 'number' ? timing.delay : 0,
      endDelayMs: typeof timing?.endDelay === 'number' ? timing.endDelay : 0,
      iterations: typeof rawIterations === 'number' ? finite(rawIterations) : 1,
      iterationStart: typeof timing?.iterationStart === 'number' ? timing.iterationStart : 0,
      direction: timing?.direction ?? 'normal',
      fill: timing?.fill ?? 'auto',
      easing: timing?.easing ?? 'linear',
      offsets,
      properties,
      pseudoElement: keyframeEffect?.pseudoElement ?? null,
      target: targetElement === null ? null : describeTarget(targetElement),
    });
  }

  return out;
}

/**
 * Count the elements whose motion `getAnimations` can never report.
 *
 * A canvas painted by a `requestAnimationFrame` loop, a WebGL scene and a
 * playing video are all moving, and none of them is an `Animation`. Saying
 * "three animations found" on a page driven entirely by canvas would be a lie
 * of omission, so they are counted and named instead.
 */
export function countUnobservableMotion(): UnobservableMotion {
  let canvas2d = 0;
  let webgl = 0;

  const canvases = document.querySelectorAll('canvas');
  for (let index = 0; index < canvases.length; index += 1) {
    const canvas = canvases[index] as HTMLCanvasElement | undefined;
    if (canvas === undefined) continue;
    // Asking for a context would create one; `getContext` on an element that
    // already has a different context returns null, which is the tell.
    let isWebgl = false;
    try {
      isWebgl = canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null;
    } catch {
      isWebgl = false;
    }
    if (isWebgl) webgl += 1;
    else canvas2d += 1;
  }

  return { canvas2d, webgl, video: document.querySelectorAll('video').length };
}
