/**
 * Serves tests/fixtures/sites over HTTP so the fixture site can be crawled the
 * way a real one is. The test suite starts its own server on an ephemeral port
 * (tests/fixtures/serve.ts); this is the standalone equivalent, on a fixed port
 * so `fixture-atlas.yml` has a stable seed to point at.
 *
 *   node scripts/serve-fixture.mjs
 *   node scripts/serve-fixture.mjs --port 5000
 *
 * It binds 127.0.0.1 and nothing else: the fixture pages are test material, not
 * something to expose on a network interface.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITES = resolve(fileURLToPath(new URL('../tests/fixtures/sites/', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/** A 2x2 opaque PNG, standing in for the fixture's lazy and slow image routes. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z4AATAxIYFRABQEAAP//FpwBFsIhZ+kAAAAASUVORK5CYII=',
  'base64',
);

const portFlag = process.argv.indexOf('--port');
const PORT = portFlag === -1 ? 4173 : Number(process.argv[portFlag + 1]);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`not a usable port: ${process.argv[portFlag + 1]}`);
  process.exit(1);
}

createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? '/', `http://127.0.0.1:${PORT}`);
  const requested = decodeURIComponent(pathname) === '/' ? '/index.html' : decodeURIComponent(pathname);

  // The fixture's synthetic image routes (/__lazy, /__slow, ...).
  if (requested.startsWith('/__')) {
    response.writeHead(200, { 'content-type': 'image/png' });
    response.end(TINY_PNG);
    return;
  }

  // Resolve inside SITES or refuse: a path like /../../.env must not escape.
  const target = resolve(SITES, normalize(requested.replace(/^\/+/, '')));
  if (!target.startsWith(SITES + sep)) {
    response.writeHead(403, { 'content-type': 'text/plain' });
    response.end('forbidden');
    return;
  }

  try {
    const body = await readFile(target);
    response.writeHead(200, {
      'content-type': MIME[extname(target)] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`fixture site on http://127.0.0.1:${PORT} (ctrl-c to stop)`);
});
