import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { mkdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  describeSecondInstance,
  newestMtime,
  readRunningBuild,
  runningBuildPath,
  writeRunningBuild,
} from '../../apps/launcher/src/instance.js';

const ROOT = fileURLToPath(new URL('../../test-output/', import.meta.url));
const NOW = Date.parse('2026-08-13T12:00:00.000Z');

let dir: string;

beforeEach(async () => {
  mkdirSync(ROOT, { recursive: true });
  dir = await mkdtemp(join(ROOT, 'instance-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('describeSecondInstance', () => {
  it('says the running one is older when the build on disk has moved on', () => {
    const verdict = describeSecondInstance({
      running: { startedAt: NOW - 20 * 60_000, builtAt: NOW - 30 * 60_000 },
      builtAt: NOW - 60_000,
      now: NOW,
    });

    expect(verdict.stale).toBe(true);
    // The useful facts: which one is running, why it matters, and what to do.
    expect(verdict.message).toContain('older than the build you just asked to run');
    expect(verdict.message).toContain('20 minutes ago');
    expect(verdict.message).toContain('does not reload itself');
    expect(verdict.message).toContain('Quit it first');
  });

  it('says only that one is running when it is the same build', () => {
    const verdict = describeSecondInstance({
      running: { startedAt: NOW - 60_000, builtAt: NOW - 90_000 },
      builtAt: NOW - 90_000,
      now: NOW,
    });

    expect(verdict.stale).toBe(false);
    expect(verdict.message).toContain('already running');
    expect(verdict.message).not.toContain('older');
  });

  it('does not call a build stale for finishing in the same second', () => {
    const verdict = describeSecondInstance({
      running: { startedAt: NOW - 60_000, builtAt: NOW - 90_000 },
      // Within the tolerance: this is clock noise, not a rebuild.
      builtAt: NOW - 90_000 + 400,
      now: NOW,
    });
    expect(verdict.stale).toBe(false);
  });

  it('falls back to the plain message when there is nothing to compare', () => {
    for (const input of [
      { running: undefined, builtAt: NOW, now: NOW },
      { running: { startedAt: NOW, builtAt: NOW }, builtAt: undefined, now: NOW },
    ]) {
      const verdict = describeSecondInstance(input);
      expect(verdict.stale).toBe(false);
      expect(verdict.message).toContain('already running');
    }
  });

  it('never claims the running one is newer than the disk', () => {
    // A rebuilt-then-reverted tree, or a clock that went backwards. Neither is
    // a reason to tell someone to quit a launcher that is perfectly current.
    const verdict = describeSecondInstance({
      running: { startedAt: NOW, builtAt: NOW },
      builtAt: NOW - 10 * 60_000,
      now: NOW,
    });
    expect(verdict.stale).toBe(false);
  });
});

describe('the running-build record', () => {
  it('round-trips what the next instance needs', async () => {
    const path = runningBuildPath(join(dir, 'userData'));
    await writeRunningBuild(path, { startedAt: 111, builtAt: 222 });
    expect(await readRunningBuild(path)).toEqual({ startedAt: 111, builtAt: 222 });
  });

  it('reads absent, corrupt and wrong-shaped records as simply unknown', async () => {
    expect(await readRunningBuild(join(dir, 'nothing.json'))).toBeUndefined();

    const corrupt = join(dir, 'corrupt.json');
    await writeFile(corrupt, '{ not json');
    expect(await readRunningBuild(corrupt)).toBeUndefined();

    const wrong = join(dir, 'wrong.json');
    await writeFile(wrong, JSON.stringify({ startedAt: 'yesterday' }));
    expect(await readRunningBuild(wrong)).toBeUndefined();
  });

  it('does not throw when it cannot write, because a launch is worth more', async () => {
    // A path whose parent is a file: the record cannot be written, and starting
    // is still the right outcome.
    const blocker = join(dir, 'blocker');
    await writeFile(blocker, 'x');
    await expect(
      writeRunningBuild(join(blocker, 'running-build.json'), { startedAt: 1, builtAt: 2 }),
    ).resolves.toBeUndefined();
  });
});

describe('newestMtime', () => {
  it('takes the newest of the files that exist', async () => {
    const older = join(dir, 'older.js');
    const newer = join(dir, 'newer.js');
    await writeFile(older, 'a');
    await writeFile(newer, 'b');
    utimesSync(older, new Date(NOW - 60_000), new Date(NOW - 60_000));
    utimesSync(newer, new Date(NOW), new Date(NOW));

    const newest = await newestMtime([older, newer, join(dir, 'missing.js')]);
    expect(newest).toBe(NOW);
  });

  it('is absent when none of them can be read', async () => {
    expect(await newestMtime([join(dir, 'nope.js')])).toBeUndefined();
    expect(await newestMtime([])).toBeUndefined();
  });
});
