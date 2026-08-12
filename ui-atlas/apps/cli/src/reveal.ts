import { spawn } from 'node:child_process';

/**
 * Ask the desktop to open a path.
 *
 * This is the one place in the tool that hands something to the operating
 * system, so the shape matters more than the implementation: it takes a path
 * the **host** resolved, never one that arrived from a page. The bridge method
 * above it accepts a closed enum (`folder` | `report`) for exactly that reason
 * — a page that could name the target could name anything.
 *
 * `spawn` without a shell, and the path as an argument rather than interpolated
 * into a command string, so a directory with a space or a quote in it is a
 * directory with a space or a quote in it.
 */
export type Opener = (path: string) => Promise<boolean>;

export function platformOpener(platform = process.platform): Opener | undefined {
  const command =
    platform === 'darwin' ? 'open' : platform === 'win32' ? 'explorer' : platform === 'linux' ? 'xdg-open' : undefined;
  if (command === undefined) return undefined;

  return async (path: string) =>
    new Promise<boolean>((resolve) => {
      try {
        const child = spawn(command, [path], { stdio: 'ignore', detached: true });
        child.on('error', () => resolve(false));
        // `explorer` exits non-zero even when it worked, so a spawn that did not
        // error is treated as success rather than waiting on the exit code.
        child.unref();
        resolve(true);
      } catch {
        resolve(false);
      }
    });
}
