import type { Page } from 'playwright';
/**
 * Playwright does not expose the virtual mouse position, so we track it. Every
 * state that moves the pointer restores it afterwards, which stops a hover
 * capture from leaving the page hovering something else.
 */
export declare class PointerTracker {
    private x;
    private y;
    private buttonDown;
    position(): {
        x: number;
        y: number;
    };
    moveTo(page: Page, x: number, y: number): Promise<void>;
    down(page: Page): Promise<void>;
    /** Safe to call unconditionally; used from `finally` blocks. */
    releaseButtons(page: Page): Promise<void>;
    restore(page: Page): Promise<void>;
    /** Record a position set by something other than `moveTo` (e.g. hover()). */
    note(x: number, y: number): void;
}
/** Release any modifier keys we may have pressed. Idempotent. */
export declare function releaseModifiers(page: Page): Promise<void>;
//# sourceMappingURL=pointer.d.ts.map