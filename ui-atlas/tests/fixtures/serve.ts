import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';

const SITES_DIR = fileURLToPath(new URL('./sites/', import.meta.url));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/** A 2×2 opaque PNG, used by the lazy/slow image routes. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z4AATAxIYFRABQEAAP//FpwBFsIhZ+kAAAAASUVORK5CYII=',
  'base64',
);

export interface FixtureServer {
  origin: string;
  port: number;
  url(path: string): string;
  /** Open connections held by `/__endless`, so tests can assert they exist. */
  openEndlessRequests(): number;
  close(): Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve_) => setTimeout(resolve_, ms));
}

function safeFilePath(pathname: string): string | undefined {
  const relativePath = decodeURIComponent(pathname).replace(/^\/+/, '');
  const target = resolve(SITES_DIR, normalize(relativePath));
  if (!target.startsWith(resolve(SITES_DIR) + sep) && target !== resolve(SITES_DIR)) return undefined;
  return target;
}

/**
 * A dependency-free static server for the controlled fixture site. Interaction
 * tests only ever run against this: nothing here reaches the network, and no
 * external site is ever mutated.
 */
export async function startFixtureServer(options: { port?: number } = {}): Promise<FixtureServer> {
  const endless = new Set<ServerResponse>();

  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    void handle(request, response, endless).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end('fixture server error');
    });
  });

  await new Promise<void>((resolve_, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => resolve_());
  });

  const address = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${String(address.port)}`;

  return {
    origin,
    port: address.port,
    url: (path: string) => new URL(path, origin).toString(),
    openEndlessRequests: () => endless.size,
    close: async () => {
      for (const held of endless) held.destroy();
      endless.clear();
      await new Promise<void>((resolve_) => {
        server.closeAllConnections();
        server.close(() => resolve_());
      });
    },
  };
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  endless: Set<ServerResponse>,
): Promise<void> {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;

  // Long-poll that never completes: proves settle never waits for networkidle.
  if (pathname === '/__endless') {
    response.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
    response.write('holding');
    endless.add(response);
    request.on('close', () => endless.delete(response));
    return;
  }

  if (pathname === '/__slow-image') {
    const delayMs = Math.min(Number(url.searchParams.get('ms') ?? '400'), 5_000);
    await sleep(delayMs);
    response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
    response.end(TINY_PNG);
    return;
  }

  if (pathname === '/__image') {
    response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' });
    response.end(TINY_PNG);
    return;
  }

  if (pathname === '/__slow-page') {
    const delayMs = Math.min(Number(url.searchParams.get('ms') ?? '300'), 5_000);
    await sleep(delayMs);
    response.writeHead(200, { 'content-type': MIME['.html'] as string });
    response.end('<!doctype html><title>slow</title><h1>slow page</h1>');
    return;
  }

  const filePath = safeFilePath(pathname);
  if (filePath === undefined || !existsSync(filePath)) {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
    return;
  }

  const body = await readFile(filePath);
  response.writeHead(200, {
    'content-type': MIME[extname(filePath)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  response.end(body);
}

/* Allow `npm run fixtures` to serve the site for manual inspection. */
if (process.argv[1] !== undefined && process.argv[1].endsWith(join('tests', 'fixtures', 'serve.ts'))) {
  const started = await startFixtureServer({ port: Number(process.env['PORT'] ?? '4173') });
  process.stdout.write(`fixture site on ${started.origin}\n`);
}
