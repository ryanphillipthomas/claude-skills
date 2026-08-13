/**
 * The launcher's end of the extension bridge.
 *
 * A unix domain socket, not a TCP port. The design's mock shows `port 7333`,
 * and a port is the obvious thing to reach for — but a localhost port is
 * reachable by every page in every browser on the machine, and the only things
 * standing in front of it would be CORS (which does not stop a request being
 * *made*) and a token the extension has no private way to learn.
 *
 * A socket file under `~/.ui-atlas`, which is already 0700, is reachable by
 * nothing that runs in a web page. Chrome gets to it through a native messaging
 * host it spawns itself and will only spawn for one allowlisted extension id.
 * Two independent gates, and neither of them is a string compare in our code.
 */

import { createServer, type Server, type Socket } from 'node:net';
import { chmod, mkdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import {
  BRIDGE_PROTOCOL_VERSION,
  readRequest,
  type BridgeRequest,
  type BridgeStatus,
} from './protocol.js';

/**
 * `UI_ATLAS_SOCKET` overrides the location, which the native host already
 * honours. A second launcher — a test, or a checkout being tried out — must not
 * silently take over the socket a running one is serving.
 */
export function socketPath(home = homedir()): string {
  return process.env['UI_ATLAS_SOCKET'] ?? join(home, '.ui-atlas', 'launcher.sock');
}

export interface BridgeServerOptions {
  /** Answers `status`, and is called again for the pushed events. */
  status: () => BridgeStatus;
  /** Handles a request that changes something. Rejecting is a thrown error. */
  onRequest: (request: BridgeRequest) => Promise<void>;
  path?: string;
  onError?: (error: unknown) => void;
}

/** One line must not be able to exhaust memory before it is rejected. */
const MAX_LINE_BYTES = 64 * 1024;

export class BridgeServer {
  private readonly options: BridgeServerOptions;
  private readonly path: string;
  private server: Server | undefined;
  private readonly clients = new Set<Socket>();

  constructor(options: BridgeServerOptions) {
    this.options = options;
    this.path = options.path ?? socketPath();
  }

  async listen(): Promise<string> {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 });
    // A socket left behind by a crash would otherwise make listen() fail with
    // EADDRINUSE forever.
    if (existsSync(this.path)) await unlink(this.path).catch(() => undefined);

    const server = createServer((socket) => {
      this.accept(socket);
    });
    server.on('error', (error) => this.options.onError?.(error));

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.path, () => {
        server.off('error', reject);
        resolve();
      });
    });

    // Owner-only. The filesystem is the first gate in front of this socket, so
    // it is set explicitly rather than left to the process umask.
    await chmod(this.path, 0o600);
    this.server = server;
    return this.path;
  }

  /** Push the current status to every connected extension. */
  broadcast(): void {
    if (this.clients.size === 0) return;
    const line = `${JSON.stringify({ event: 'status', status: this.options.status() })}\n`;
    for (const client of this.clients) client.write(line);
  }

  async close(): Promise<void> {
    for (const client of this.clients) client.destroy();
    this.clients.clear();
    const server = this.server;
    this.server = undefined;
    if (server === undefined) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await unlink(this.path).catch(() => undefined);
  }

  private accept(socket: Socket): void {
    this.clients.add(socket);
    socket.setEncoding('utf8');

    let carry = '';
    socket.on('data', (chunk: string) => {
      carry += chunk;
      if (carry.length > MAX_LINE_BYTES) {
        socket.destroy();
        return;
      }
      const parts = carry.split('\n');
      carry = parts.pop() ?? '';
      for (const part of parts) {
        if (part.trim().length > 0) void this.dispatch(socket, part);
      }
    });

    socket.on('error', () => socket.destroy());
    socket.on('close', () => this.clients.delete(socket));

    // Greet on connect so the popup can draw immediately rather than round-trip.
    socket.write(`${JSON.stringify({ event: 'status', status: this.options.status() })}\n`);
  }

  private async dispatch(socket: Socket, line: string): Promise<void> {
    const parsed = readRequest(line);
    if (!parsed.ok) {
      socket.write(
        `${JSON.stringify({ id: parsed.id ?? 'unknown', ok: false, error: parsed.error })}\n`,
      );
      return;
    }

    const request = parsed.request;
    try {
      if (request.method !== 'status') await this.options.onRequest(request);
      const status = this.options.status();
      if (status.protocol !== BRIDGE_PROTOCOL_VERSION) {
        socket.write(
          `${JSON.stringify({ id: request.id, ok: false, error: 'protocol version mismatch' })}\n`,
        );
        return;
      }
      socket.write(`${JSON.stringify({ id: request.id, ok: true, status })}\n`);
    } catch (error) {
      this.options.onError?.(error);
      const message = error instanceof Error ? error.message : 'request failed';
      socket.write(`${JSON.stringify({ id: request.id, ok: false, error: message })}\n`);
    }
  }
}
