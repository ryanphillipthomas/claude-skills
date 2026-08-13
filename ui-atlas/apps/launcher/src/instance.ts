/**
 * What a second launcher should say before it quits.
 *
 * `requestSingleInstanceLock` is the right behaviour and it used to be silent:
 * `npm run launcher` with one already in the menu bar exited 0, printed
 * nothing, and opened no window. That is a bad silence for this particular
 * tool, because the moment it matters is immediately after a rebuild — you
 * relaunch, get nothing, and carry on testing the build you just replaced. It
 * cost exactly that once, and was only caught because a footer had three items
 * instead of five.
 *
 * So the second instance says what happened, and — where it can tell — says the
 * more useful thing: that the launcher holding the lock is *older than the code
 * you just asked to run*. It can tell because the first instance records which
 * build it loaded, and the second can read that and compare it against the
 * files on disk now.
 *
 * The verdict is a pure function, so "what does it say when the running one is
 * stale?" is a unit test rather than something you discover by rebuilding and
 * squinting at a terminal.
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { relativeTime } from './popover.js';

/** Written by the instance holding the lock, read by any that follow. */
export interface RunningBuild {
  startedAt: number;
  /** Newest mtime across the launcher's own outputs when it started. */
  builtAt: number;
}

export interface SecondInstanceVerdict {
  /** The running launcher predates the build on disk. */
  stale: boolean;
  /** Written to stderr, where the person who typed the command is looking. */
  message: string;
}

export function runningBuildPath(userDataDir: string): string {
  return join(userDataDir, 'running-build.json');
}

export async function readRunningBuild(path: string): Promise<RunningBuild | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, 'utf8'));
  } catch {
    // Absent, unreadable, or from a version that wrote something else. The
    // verdict falls back to the plainer message rather than guessing.
    return undefined;
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const { startedAt, builtAt } = parsed as Record<string, unknown>;
  if (typeof startedAt !== 'number' || typeof builtAt !== 'number') return undefined;
  return { startedAt, builtAt };
}

/**
 * Record which build this instance loaded, for whoever tries to start the next
 * one. Never worth failing a launch over: a launcher that started is more
 * useful than one that refused because it could not write a hint file.
 */
export async function writeRunningBuild(path: string, value: RunningBuild): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(value)}\n`);
  } catch {
    // The next second instance falls back to the plainer message.
  }
}

/** Newest mtime across `paths`, or absent when none of them can be read. */
export async function newestMtime(paths: readonly string[]): Promise<number | undefined> {
  let newest: number | undefined;
  for (const path of paths) {
    try {
      const time = (await stat(path)).mtimeMs;
      if (newest === undefined || time > newest) newest = time;
    } catch {
      // A missing output is not newer than anything.
    }
  }
  return newest;
}

/**
 * A second of tolerance, because "the build finished in the same second the
 * launcher read it" is not evidence of anything and a spurious "it is stale"
 * would be worse than saying nothing.
 */
const TOLERANCE_MS = 1_000;

/**
 * Is what is on disk newer than what a running instance loaded?
 *
 * Shared by the two places that ask: a second instance deciding what to print,
 * and the running instance's own panel. They must agree — a terminal saying the
 * launcher is stale while its panel says nothing would be worse than either
 * alone.
 *
 * Deliberately one-directional. A tree rebuilt and then reverted, or a clock
 * that went backwards, leaves disk *older*, and that is not a reason to tell
 * anyone their launcher is out of date.
 */
export function isNewerBuild(
  loadedAt: number | undefined,
  onDiskAt: number | undefined,
): boolean {
  if (loadedAt === undefined || onDiskAt === undefined) return false;
  return onDiskAt > loadedAt + TOLERANCE_MS;
}

export function describeSecondInstance(input: {
  running: RunningBuild | undefined;
  /** Newest mtime across the launcher's outputs right now. */
  builtAt: number | undefined;
  now: number;
}): SecondInstanceVerdict {
  const { running, builtAt, now } = input;

  const stale = running !== undefined && isNewerBuild(running.builtAt, builtAt);

  if (!stale || running === undefined) {
    return {
      stale: false,
      message:
        'UI Atlas is already running — its icon is in the menu bar, and its panel has been ' +
        'brought forward.',
    };
  }

  const since = relativeTime(running.startedAt, now);
  return {
    stale: true,
    message:
      'UI Atlas is already running, and it is older than the build you just asked to run.\n' +
      `  The one in the menu bar started ${since}, from an earlier build.\n` +
      '  A running launcher does not reload itself, so nothing you have just compiled is in it.\n' +
      '  Quit it first — ⌘Q with its panel open, or right-click the menu bar icon — then run this again.',
  };
}
