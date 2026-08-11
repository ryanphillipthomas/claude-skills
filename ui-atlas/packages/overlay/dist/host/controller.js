import { OVERLAY_HOST_ATTRIBUTE } from '@ui-atlas/protocol';
import { dispatchToOverlay, hideOverlayHosts, isOverlayMounted, showOverlayHosts, } from './page-scripts.js';
/**
 * Host-side control of the injected inspector: hide it before a capture, put it
 * back afterwards, and push queue/session events into it.
 */
export class OverlayController {
    page;
    constructor(page) {
        this.page = page;
    }
    /** Hide the inspector in every frame so it can never land in an artifact. */
    async hide() {
        await Promise.all(this.page
            .frames()
            .map((frame) => frame.evaluate(hideOverlayHosts, OVERLAY_HOST_ATTRIBUTE).catch(() => 0)));
    }
    async show() {
        await Promise.all(this.page
            .frames()
            .map((frame) => frame.evaluate(showOverlayHosts, OVERLAY_HOST_ATTRIBUTE).catch(() => 0)));
    }
    /** Send an event to the top frame, which owns the toolbar. */
    async dispatch(event) {
        await this.page.mainFrame().evaluate(dispatchToOverlay, event).catch(() => false);
    }
    /** Send an event to every frame (used for the inspect-mode broadcast). */
    async broadcast(event) {
        await Promise.all(this.page.frames().map((frame) => frame.evaluate(dispatchToOverlay, event).catch(() => false)));
    }
    async isMounted() {
        return this.page.mainFrame().evaluate(isOverlayMounted).catch(() => false);
    }
    /** Wait until the overlay has installed itself in the top frame. */
    async waitForMount(timeoutMs = 10_000) {
        const started = Date.now();
        for (;;) {
            if (await this.isMounted())
                return true;
            if (Date.now() - started >= timeoutMs)
                return false;
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }
}
//# sourceMappingURL=controller.js.map