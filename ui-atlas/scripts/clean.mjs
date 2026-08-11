#!/usr/bin/env node
/** Remove build output and test artifacts, leaving node_modules alone. */
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function packageDirs() {
  const groups = ['packages', 'apps'];
  const dirs = [];
  for (const group of groups) {
    const entries = await readdir(join(root, group), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isDirectory()) dirs.push(join(root, group, entry.name));
    }
  }
  return dirs;
}

const targets = [
  join(root, 'test-output'),
  join(root, '*.tsbuildinfo'),
  ...(await packageDirs()).flatMap((dir) => [join(dir, 'dist'), join(dir, 'tsconfig.tsbuildinfo')]),
];

for (const target of targets) {
  await rm(target, { recursive: true, force: true });
}
process.stdout.write(`cleaned ${String(targets.length)} paths\n`);
