import { spawn, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BridgeServer } from '../../apps/launcher/src/bridge/server.js';
import {
  BRIDGE_PROTOCOL_VERSION,
  type BridgeRequest,
  type BridgeStatus,
} from '../../apps/launcher/src/bridge/protocol.js';

/**
 * The extension bridge, end to end, without Chrome.
 *
 * Chrome cannot be driven from a test here, but everything between it and the
 * launcher can: the native messaging framing, the relay, the socket and the
 * request validation. What is left unverified is only the part Chrome itself
 * performs — reading the host manifest and checking the extension id.
 */

const HOST_SCRIPT = fileURLToPath(
  new URL('../../apps/launcher/src/bridge/native-host.mjs', import.meta.url),
);

function status(): BridgeStatus {
  return {
    protocol: BRIDGE_PROTOCOL_VERSION,
    phase: 'running',
    title: 'Engine running',
    subtitle: 'Chromium 141 · 1 run today',
  };
}

/** Chrome's framing: 32-bit little-endian length, then that many bytes of JSON. */
function frame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

function readFrames(buffer: Buffer): unknown[] {
  const out: unknown[] = [];
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    if (offset + 4 + length > buffer.length) break;
    out.push(JSON.parse(buffer.subarray(offset + 4, offset + 4 + length).toString('utf8')));
    offset += 4 + length;
  }
  return out;
}

describe('the extension bridge', () => {
  let directory: string;
  let socketPath: string;
  let server: BridgeServer;
  let received: BridgeRequest[];
  let host: ChildProcess | undefined;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ui-atlas-bridge-'));
    socketPath = join(directory, 'launcher.sock');
    received = [];
    server = new BridgeServer({
      path: socketPath,
      status,
      onRequest: async (request) => {
        received.push(request);
      },
    });
    await server.listen();
  });

  afterEach(async () => {
    host?.kill('SIGKILL');
    host = undefined;
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('creates the socket owner-only, because the filesystem is the first gate', async () => {
    const info = await stat(socketPath);
    expect(info.mode & 0o777).toBe(0o600);
  });

  it('greets a new connection so the popup can draw without a round trip', async () => {
    const line = await new Promise<string>((resolve) => {
      const socket = connect(socketPath);
      socket.setEncoding('utf8');
      socket.once('data', (chunk: string) => {
        socket.destroy();
        resolve(chunk);
      });
    });
    expect(JSON.parse(line.trim())).toEqual({ event: 'status', status: status() });
  });

  it('answers a request and reports it to the launcher', async () => {
    const replies = await exchange('{"id":"a","method":"start"}\n', 2);
    expect(received.map((request) => request.method)).toEqual(['start']);
    expect(replies[1]).toEqual({ id: 'a', ok: true, status: status() });
  });

  it('rejects a malformed line without dropping the connection', async () => {
    const replies = await exchange('this is not json\n{"id":"b","method":"status"}\n', 3);
    expect(replies[1]).toEqual({ id: 'unknown', ok: false, error: 'not valid JSON' });
    expect(replies[2]).toMatchObject({ id: 'b', ok: true });
  });

  it('refuses a capture of a URL that is not http or https', async () => {
    const replies = await exchange('{"id":"c","method":"capture","url":"file:///etc/passwd","mode":"page"}\n', 2);
    expect(replies[1]).toMatchObject({ id: 'c', ok: false });
    expect(received).toHaveLength(0);
  });

  it('pushes status to everything connected when the launcher changes', async () => {
    const socket = connect(socketPath);
    socket.setEncoding('utf8');
    const seen: string[] = [];
    socket.on('data', (chunk: string) => seen.push(chunk));
    await new Promise((resolve) => socket.once('data', resolve));

    server.broadcast();
    await new Promise((resolve) => setTimeout(resolve, 60));
    socket.destroy();
    expect(seen.length).toBeGreaterThanOrEqual(2);
  });

  /** Drive the real relay the way Chrome would: framed stdin, framed stdout. */
  it('relays Chrome-framed messages both ways through the native host', async () => {
    host = spawn(process.execPath, [HOST_SCRIPT], {
      env: { ...process.env, UI_ATLAS_SOCKET: socketPath },
      stdio: ['pipe', 'pipe', 'ignore'],
    });

    const chunks: Buffer[] = [];
    host.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));

    // Wait for the greeting the server sends on connect.
    await new Promise((resolve) => setTimeout(resolve, 250));
    host.stdin?.write(frame({ id: 'z', method: 'status' }));
    await new Promise((resolve) => setTimeout(resolve, 250));

    const messages = readFrames(Buffer.concat(chunks));
    expect(messages[0]).toEqual({ event: 'status', status: status() });
    expect(messages).toContainEqual({ id: 'z', ok: true, status: status() });
  });

  it('tells the extension the launcher is unavailable rather than dying', async () => {
    // No server on this path at all — the stopped-launcher case, which must
    // render as a Start button and not as an error.
    host = spawn(process.execPath, [HOST_SCRIPT], {
      env: { ...process.env, UI_ATLAS_SOCKET: join(directory, 'absent.sock') },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const chunks: Buffer[] = [];
    host.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
    await new Promise((resolve) => setTimeout(resolve, 300));

    const messages = readFrames(Buffer.concat(chunks)) as Array<{ status?: { phase?: string } }>;
    expect(messages[0]?.status?.phase).toBe('unavailable');
  });

  async function exchange(payload: string, expectedLines: number): Promise<unknown[]> {
    return new Promise((resolve) => {
      const socket = connect(socketPath);
      socket.setEncoding('utf8');
      let carry = '';
      const lines: unknown[] = [];
      socket.on('data', (chunk: string) => {
        carry += chunk;
        const parts = carry.split('\n');
        carry = parts.pop() ?? '';
        for (const part of parts) if (part.trim().length > 0) lines.push(JSON.parse(part));
        if (lines.length >= expectedLines) {
          socket.destroy();
          resolve(lines);
        }
      });
      socket.once('data', () => socket.write(payload));
    });
  }
});
