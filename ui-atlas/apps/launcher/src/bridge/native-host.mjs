#!/usr/bin/env node
/**
 * The relay Chrome spawns.
 *
 * Chrome speaks native messaging: a 32-bit little-endian length followed by
 * that many bytes of JSON, on stdin and stdout. The launcher speaks
 * newline-delimited JSON on a unix socket. This translates between the two and
 * does nothing else — it holds no state, makes no decisions, and never touches
 * the filesystem beyond connecting to the socket.
 *
 * It is deliberately dependency-free and plain `.mjs`: Chrome executes this
 * path directly, so it must run under whatever `node` is on the system without
 * a build step having been run first.
 *
 * Chrome starts one of these per connected extension and kills it when the
 * popup closes. If the launcher is not running the socket is simply not there,
 * and the extension is told so — which is what makes its popover able to offer
 * Start instead of an error.
 */
import { connect } from 'node:net';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SOCKET = process.env['UI_ATLAS_SOCKET'] ?? join(homedir(), '.ui-atlas', 'launcher.sock');

/** Chrome rejects a message over 1 MB; nothing here is remotely that size. */
const MAX_MESSAGE_BYTES = 1024 * 1024;

function writeToChrome(value) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  if (body.length > MAX_MESSAGE_BYTES) return;
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  process.stdout.write(Buffer.concat([header, body]));
}

const socket = connect(SOCKET);
socket.setEncoding('utf8');

socket.on('error', () => {
  // Not an error condition worth a stack trace: a stopped launcher is a normal
  // state the extension knows how to render.
  writeToChrome({ event: 'status', status: { protocol: 0, phase: 'unavailable', title: 'UI Atlas is not running', subtitle: 'Start it from the menu bar' } });
});

// --- launcher -> Chrome -------------------------------------------------------

let lineCarry = '';
socket.on('data', (chunk) => {
  lineCarry += chunk;
  const parts = lineCarry.split('\n');
  lineCarry = parts.pop() ?? '';
  for (const part of parts) {
    if (part.trim().length === 0) continue;
    try {
      writeToChrome(JSON.parse(part));
    } catch {
      // A line the launcher wrote that is not JSON is a launcher bug, not
      // something to forward into the extension.
    }
  }
});

socket.on('close', () => {
  process.exit(0);
});

// --- Chrome -> launcher -------------------------------------------------------

let inbox = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  inbox = Buffer.concat([inbox, chunk]);
  for (;;) {
    if (inbox.length < 4) return;
    const length = inbox.readUInt32LE(0);
    if (length > MAX_MESSAGE_BYTES) {
      process.exit(1);
    }
    if (inbox.length < 4 + length) return;
    const body = inbox.subarray(4, 4 + length).toString('utf8');
    inbox = inbox.subarray(4 + length);
    // Forwarded verbatim. The launcher validates it; re-parsing here would only
    // create a second, differently-wrong idea of what a valid request is.
    socket.write(`${body}\n`);
  }
});

process.stdin.on('end', () => {
  socket.end();
});
