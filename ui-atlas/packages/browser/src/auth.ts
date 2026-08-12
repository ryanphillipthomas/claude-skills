import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { UiAtlasError } from '@ui-atlas/protocol';

/**
 * Auth material lives outside the artifact tree so a run directory can be
 * shared or archived without leaking cookies. Override with `UI_ATLAS_HOME`.
 */
export function uiAtlasHome(): string {
  const override = process.env['UI_ATLAS_HOME'];
  if (override !== undefined && override.trim().length > 0) return resolve(override);
  return join(homedir(), '.ui-atlas');
}

const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function assertProfileName(name: string): string {
  if (!PROFILE_NAME.test(name)) {
    throw new UiAtlasError(
      'config.invalid',
      `profile name must match ${String(PROFILE_NAME)} (got "${name}")`,
      { detail: { name } },
    );
  }
  return name;
}

export interface AuthPaths {
  home: string;
  profilesDir: string;
  storageStateDir: string;
  profileDir: (name: string) => string;
  storageStatePath: (name: string) => string;
}

export function authPaths(home = uiAtlasHome()): AuthPaths {
  const profilesDir = join(home, 'profiles');
  const storageStateDir = join(home, 'storage-state');
  return {
    home,
    profilesDir,
    storageStateDir,
    profileDir: (name) => join(profilesDir, assertProfileName(name)),
    storageStatePath: (name) => join(storageStateDir, `${assertProfileName(name)}.json`),
  };
}

/** Create the auth directories with owner-only permissions where supported. */
export async function ensureAuthDirs(paths: AuthPaths = authPaths()): Promise<void> {
  await mkdir(paths.home, { recursive: true, mode: 0o700 });
  await mkdir(paths.profilesDir, { recursive: true, mode: 0o700 });
  await mkdir(paths.storageStateDir, { recursive: true, mode: 0o700 });
  // mkdir ignores `mode` when the directory already exists, so tighten again.
  await tighten(paths.home);
  await tighten(paths.profilesDir);
  await tighten(paths.storageStateDir);
}

async function tighten(path: string, mode = 0o700): Promise<void> {
  if (process.platform === 'win32') return;
  try {
    await chmod(path, mode);
  } catch {
    // Best effort: some filesystems (network mounts, containers) refuse chmod.
  }
}

export const STORAGE_STATE_WARNING =
  'Saved authentication state can contain session cookies that impersonate you. ' +
  'Keep it private, do not commit it, and clear it with `ui-atlas auth clear <profile>` when finished.';

export interface SavedStorageState {
  path: string;
  cookieCount: number;
  originCount: number;
}

/** Persist a Playwright storage state with owner-only file permissions. */
export async function writeStorageState(
  name: string,
  state: unknown,
  paths: AuthPaths = authPaths(),
): Promise<SavedStorageState> {
  await ensureAuthDirs(paths);
  const path = paths.storageStatePath(name);
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await tighten(path, 0o600);

  const parsed = state as { cookies?: unknown[]; origins?: unknown[] };
  return {
    path,
    cookieCount: Array.isArray(parsed.cookies) ? parsed.cookies.length : 0,
    originCount: Array.isArray(parsed.origins) ? parsed.origins.length : 0,
  };
}

export async function readStorageState(
  name: string,
  paths: AuthPaths = authPaths(),
): Promise<string> {
  const path = paths.storageStatePath(name);
  if (!existsSync(path)) {
    throw new UiAtlasError('auth.not-found', `no saved authentication state for profile "${name}"`, {
      detail: { expectedPath: path },
    });
  }
  await readFile(path, 'utf8');
  return path;
}

/**
 * What is actually saved under a profile name.
 *
 * `--mode profile` and `--mode storage-state` read two different places, and
 * `launchPersistentContext` happily *creates* an empty directory when asked for
 * one that does not exist. So asking for profile mode with only a storage state
 * saved launches successfully, signed out, silently — which is the most
 * expensive way this tool can be wrong.
 */
export interface SavedAuthShape {
  /** A sign-in was completed into this profile — not merely that it exists. */
  hasProfile: boolean;
  hasStorageState: boolean;
  /** The directory is there but carries no record of a sign-in. */
  profileDirWithoutSignIn: boolean;
}

/**
 * Marker written by `auth save --persistent`, and the only reliable evidence
 * that a profile was ever signed in to.
 *
 * Directory existence proves nothing: `launchPersistentContext` **creates** the
 * directory, so any run with `--mode profile` leaves one behind, complete with
 * Chromium's own scaffolding. An empty auto-created profile and a signed-in one
 * are indistinguishable from the filesystem alone, which is how a failed run
 * quietly makes the next check say everything is fine.
 */
const PROFILE_MARKER = '.ui-atlas-profile.json';

export function profileMarkerPath(name: string, paths: AuthPaths = authPaths()): string {
  return join(paths.profileDir(name), PROFILE_MARKER);
}

export async function writeProfileMarker(
  name: string,
  url: string,
  paths: AuthPaths = authPaths(),
): Promise<string> {
  const path = profileMarkerPath(name, paths);
  // The URL is kept so `auth check` can suggest where to check, and nothing
  // else: no cookies, no tokens, no headers.
  const marker = { savedAt: new Date().toISOString(), url: originOf(url) };
  await writeFile(path, `${JSON.stringify(marker, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await tighten(path, 0o600);
  return path;
}

function originOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).origin;
  } catch {
    return rawUrl;
  }
}

export function savedAuthShape(name: string, paths: AuthPaths = authPaths()): SavedAuthShape {
  const dirExists = existsSync(paths.profileDir(name));
  const signedIn = existsSync(profileMarkerPath(name, paths));
  return {
    hasProfile: signedIn,
    hasStorageState: existsSync(paths.storageStatePath(name)),
    profileDirWithoutSignIn: dirExists && !signedIn,
  };
}

/**
 * The warning for asking for a mode nothing was saved in, or `undefined` when
 * the request matches what is on disk.
 */
export function mismatchWarning(
  name: string,
  mode: 'profile' | 'storage-state',
  shape: SavedAuthShape,
): string | undefined {
  if (mode === 'profile' && !shape.hasProfile) {
    // The directory being there is not reassurance — running `--mode profile`
    // is what creates it, so a previous signed-out run leaves one behind.
    const origin = shape.profileDirWithoutSignIn
      ? `the profile directory for "${name}" exists but carries no record of a sign-in ` +
        '(running --mode profile creates the directory, so an earlier run may have made it)'
      : `profile "${name}" has never been signed in`;

    return shape.hasStorageState
      ? `${origin}, but a storage state of that name has been saved. --mode profile reads a ` +
          `different place and will start signed out: either use --mode storage-state, or run ` +
          `\`ui-atlas auth save ${name} <url> --persistent\`.`
      : `${origin}; this run starts with an empty browser profile. ` +
          `Sign in with \`ui-atlas auth save ${name} <url> --persistent\`.`;
  }
  if (mode === 'storage-state' && !shape.hasStorageState && shape.hasProfile) {
    return `no storage state is saved for "${name}", but a browser profile of that name is. ` +
      'Use --mode profile to use it.';
  }
  return undefined;
}

export interface ClearedAuth {
  removedStorageState: boolean;
  removedProfile: boolean;
}

export async function clearProfile(
  name: string,
  paths: AuthPaths = authPaths(),
): Promise<ClearedAuth> {
  const storageStatePath = paths.storageStatePath(name);
  const profileDir = paths.profileDir(name);
  const removedStorageState = existsSync(storageStatePath);
  const removedProfile = existsSync(profileDir);
  await rm(storageStatePath, { force: true });
  await rm(profileDir, { recursive: true, force: true });
  return { removedStorageState, removedProfile };
}
