import type { Frame, JSHandle } from 'playwright';
import type { AnimationRecord } from '@ui-atlas/protocol';

/** The `Animation` objects of one frame, addressable across evaluate calls. */
export interface FrameHandles {
  frame: Frame;
  list: JSHandle<Animation[]>;
  handles: Array<JSHandle<Animation>>;
}

/**
 * One array handle, then one handle per index derived from it. Deriving from
 * the array rather than re-querying keeps the indices stable: a second
 * `getAnimations()` call could return a different order on a live page.
 */
export async function openHandles(frame: Frame): Promise<FrameHandles> {
  const list = await frame.evaluateHandle(() => document.getAnimations());
  const count = await list.evaluate((animations) => animations.length);
  const handles: Array<JSHandle<Animation>> = [];
  for (let index = 0; index < count; index += 1) {
    handles.push(await list.evaluateHandle((animations, at) => animations[at] as Animation, index));
  }
  return { frame, list, handles };
}

export async function closeHandles(held: FrameHandles): Promise<void> {
  for (const handle of held.handles) await handle.dispose().catch(() => undefined);
  await held.list.dispose().catch(() => undefined);
}

/**
 * Match an inventory record back to a live animation.
 *
 * **By position, not by name.** Two elements sharing a `@keyframes` name is
 * completely ordinary — the motion fixture has exactly that, one finite and one
 * infinite `drift` — so a name identifies a rule, not an animation. The
 * inventory describes `document.getAnimations()` in order and records each
 * animation's index, and that index is the key.
 *
 * The name and target are then *verified* rather than searched, so a page that
 * changed between inventory and sampling yields "could not be found again"
 * instead of a confident frame of the wrong animation.
 */
export async function findHandle(
  held: FrameHandles,
  record: AnimationRecord,
): Promise<JSHandle<Animation> | undefined> {
  const handle = held.handles[record.index];
  if (handle === undefined) return undefined;

  const identify = (animation: Animation): { name: string; target: string } => {
    const css = animation as Animation & {
      animationName?: string;
      transitionProperty?: string;
    };
    const element = (animation.effect as KeyframeEffect | null)?.target ?? null;
    const testId = element?.getAttribute('data-testid') ?? '';
    return {
      name: css.animationName ?? css.transitionProperty ?? '',
      target: testId.length > 0 ? testId : (element?.id ?? ''),
    };
  };

  const identity = await handle.evaluate(identify).catch(() => undefined);
  if (identity === undefined) return undefined;

  const wantedName = record.animationName ?? record.transitionProperty ?? '';
  if (identity.name !== wantedName) return undefined;

  const wantedTarget = record.target?.testId ?? record.target?.id ?? '';
  if (wantedTarget.length > 0 && identity.target !== wantedTarget) return undefined;

  return handle;
}
