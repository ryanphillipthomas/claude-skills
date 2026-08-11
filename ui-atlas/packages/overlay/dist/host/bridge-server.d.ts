import type { Frame, Page } from 'playwright';
import { UiAtlasError, type BridgeMethod, type BridgeParams, type BridgeResponse, type BridgeResult } from '@ui-atlas/protocol';
/** Where a message came from. Handlers use this to scope work to one frame. */
export interface BridgeSource {
    page: Page;
    frame: Frame;
}
export type BridgeHandlers = {
    [M in BridgeMethod]?: (source: BridgeSource, params: BridgeParams<M>) => Promise<BridgeResult<M>>;
};
/**
 * Validates and dispatches every message from page code. Nothing here reads the
 * filesystem, evaluates page-supplied code, or trusts a field without parsing
 * it first — the binding is reachable by any script in the page.
 */
export declare function createBridgeHandler(token: string, handlers: BridgeHandlers, options?: {
    onError?: (error: unknown) => void;
}): (source: BridgeSource, payload: unknown) => Promise<BridgeResponse>;
export { UiAtlasError };
//# sourceMappingURL=bridge-server.d.ts.map