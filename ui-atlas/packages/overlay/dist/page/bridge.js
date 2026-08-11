import { BRIDGE_BINDING, PROTOCOL_VERSION } from '@ui-atlas/protocol/constants';
export class BridgeError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'BridgeError';
        this.code = code;
    }
}
export function createBridge(token) {
    let counter = 0;
    const binding = () => {
        const candidate = window[BRIDGE_BINDING];
        return typeof candidate === 'function' ? candidate : undefined;
    };
    return {
        available: () => binding() !== undefined,
        async call(method, params) {
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
            if (response.ok)
                return response.result;
            throw new BridgeError(response.error.code, response.error.message);
        },
    };
}
//# sourceMappingURL=bridge.js.map