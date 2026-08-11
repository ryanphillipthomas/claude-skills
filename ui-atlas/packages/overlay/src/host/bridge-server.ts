import { timingSafeEqual } from 'node:crypto';
import type { Frame, Page } from 'playwright';
import {
  BRIDGE_METHODS,
  BridgeRequestSchema,
  isBridgeMethod,
  toStructuredError,
  UiAtlasError,
  type BridgeMethod,
  type BridgeParams,
  type BridgeResponse,
  type BridgeResult,
} from '@ui-atlas/protocol';

/** Where a message came from. Handlers use this to scope work to one frame. */
export interface BridgeSource {
  page: Page;
  frame: Frame;
}

export type BridgeHandlers = {
  [M in BridgeMethod]?: (source: BridgeSource, params: BridgeParams<M>) => Promise<BridgeResult<M>>;
};

function tokensMatch(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Validates and dispatches every message from page code. Nothing here reads the
 * filesystem, evaluates page-supplied code, or trusts a field without parsing
 * it first — the binding is reachable by any script in the page.
 */
export function createBridgeHandler(
  token: string,
  handlers: BridgeHandlers,
  options: { onError?: (error: unknown) => void } = {},
): (source: BridgeSource, payload: unknown) => Promise<BridgeResponse> {
  return async (source, payload) => {
    const envelope = BridgeRequestSchema.safeParse(payload);
    if (!envelope.success) {
      return {
        ok: false,
        id: 'unknown',
        error: {
          code: 'protocol.invalid-message',
          message: 'message did not match the bridge envelope',
        },
      };
    }

    const request = envelope.data;
    if (!tokensMatch(token, request.token)) {
      return {
        ok: false,
        id: request.id,
        error: { code: 'protocol.invalid-message', message: 'invalid session token' },
      };
    }

    if (!isBridgeMethod(request.method)) {
      return {
        ok: false,
        id: request.id,
        error: { code: 'protocol.unknown-method', message: `unknown method ${request.method}` },
      };
    }

    const method = request.method;
    const definition = BRIDGE_METHODS[method];
    const params = definition.params.safeParse(request.params);
    if (!params.success) {
      return {
        ok: false,
        id: request.id,
        error: {
          code: 'protocol.invalid-message',
          message: `invalid params for ${method}`,
          detail: { issues: params.error.issues.map((issue) => issue.message) },
        },
      };
    }

    const handler = handlers[method] as
      | ((source: BridgeSource, value: unknown) => Promise<unknown>)
      | undefined;
    if (handler === undefined) {
      return {
        ok: false,
        id: request.id,
        error: { code: 'protocol.unknown-method', message: `${method} is not handled` },
      };
    }

    try {
      const result = await handler(source, params.data);
      return { ok: true, id: request.id, result };
    } catch (error) {
      options.onError?.(error);
      return { ok: false, id: request.id, error: toStructuredError(error, 'internal') };
    }
  };
}

export { UiAtlasError };
