import type { Locator, Page } from 'playwright';
import type { CaptureConfig } from '@ui-atlas/config';
import { type CaptureState, type RecipeStep, type StateName } from '@ui-atlas/protocol';
import { PointerTracker } from './pointer.js';
import { type StyleProbe } from './style-diff.js';
export interface StateContext {
    page: Page;
    /** Required for every state except `default` and `custom`. */
    locator: Locator | undefined;
    config: CaptureConfig;
    pointer: PointerTracker;
    timeoutMs: number;
}
export interface StateApplication {
    state: CaptureState;
    steps: RecipeStep[];
    /** Undo everything this state did. Always invoked from a `finally` block. */
    cleanup: () => Promise<void>;
    /** Set when the state could not be reached honestly. */
    skipped?: string;
    before?: StyleProbe;
}
/**
 * Put the page into `name`, capture-ready. The returned `cleanup` must always
 * run: it releases mouse buttons and modifier keys and undoes any forced
 * attribute, so the page is left exactly as it was found.
 */
export declare function applyState(ctx: StateContext, name: StateName, label?: string): Promise<StateApplication>;
//# sourceMappingURL=state-controller.d.ts.map