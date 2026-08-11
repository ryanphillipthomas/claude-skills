/**
 * Page-side RPC client. The session token lives in this closure and is never
 * written to `window`, so a script in the page cannot forge a request even
 * though the Playwright binding itself is globally reachable.
 */
export interface Bridge {
    call<T>(method: string, params: unknown): Promise<T>;
    available(): boolean;
}
export declare class BridgeError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare function createBridge(token: string): Bridge;
//# sourceMappingURL=bridge.d.ts.map