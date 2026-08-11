import type { Page } from 'playwright';
import { type HostEvent } from '@ui-atlas/protocol';
/**
 * Host-side control of the injected inspector: hide it before a capture, put it
 * back afterwards, and push queue/session events into it.
 */
export declare class OverlayController {
    private readonly page;
    constructor(page: Page);
    /** Hide the inspector in every frame so it can never land in an artifact. */
    hide(): Promise<void>;
    show(): Promise<void>;
    /** Send an event to the top frame, which owns the toolbar. */
    dispatch(event: HostEvent): Promise<void>;
    /** Send an event to every frame (used for the inspect-mode broadcast). */
    broadcast(event: HostEvent): Promise<void>;
    isMounted(): Promise<boolean>;
    /** Wait until the overlay has installed itself in the top frame. */
    waitForMount(timeoutMs?: number): Promise<boolean>;
}
//# sourceMappingURL=controller.d.ts.map