import { BRIDGE_BINDING, PROTOCOL_VERSION } from '@ui-atlas/protocol/constants';

/**
 * Page-side RPC client. The session token lives in this closure and is never
 * written to `window`, so a script in the page cannot forge a request even
 * though the Playwright binding itself is globally reachable.
 */
export interface Bridge {
  call<T>(method: string, params: unknown): Promise<T>;
  available(): boolean;
}

interface BridgeSuccess {
  ok: true;
  id: string;
  result: unknown;
}
interface BridgeFailure {
  ok: false;
  id: string;
  error: { code: string; message: string };
}

type BridgeBinding = (envelope: unknown) => Promise<BridgeSuccess | BridgeFailure>;

export class BridgeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
  }
}

export function createBridge(token: string): Bridge {
  let counter = 0;

  const binding = (): BridgeBinding | undefined => {
    const candidate = (window as unknown as Record<string, unknown>)[BRIDGE_BINDING];
    return typeof candidate === 'function' ? (candidate as BridgeBinding) : undefined;
  };

  return {
    available: () => binding() !== undefined,
    async call<T>(method: string, params: unknown): Promise<T> {
      const send = binding();
      if (send === undefined) {
        throw new BridgeError('protocol.invalid-message', 'UI Atlas host bridge is not available');
      }
      counter += 1;
      const response = await send({
        v: PROTOCOL_VERSION,
        token,
        id: `p${String(counter)}`,
        method,
        params,
      });
      if (response.ok) return response.result as T;
      throw new BridgeError(response.error.code, response.error.message);
    },
  };
}
