import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { UiAtlasError } from '@ui-atlas/protocol';
/**
 * Auth material lives outside the artifact tree so a run directory can be
 * shared or archived without leaking cookies. Override with `UI_ATLAS_HOME`.
 */
export function uiAtlasHome() {
    const override = process.env['UI_ATLAS_HOME'];
    if (override !== undefined && override.trim().length > 0)
        return resolve(override);
    return join(homedir(), '.ui-atlas');
}
const PROFILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export function assertProfileName(name) {
    if (!PROFILE_NAME.test(name)) {
        throw new UiAtlasError('config.invalid', `profile name must match ${String(PROFILE_NAME)} (got "${name}")`, { detail: { name } });
    }
    return name;
}
export function authPaths(home = uiAtlasHome()) {
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
export async function ensureAuthDirs(paths = authPaths()) {
    await mkdir(paths.home, { recursive: true, mode: 0o700 });
    await mkdir(paths.profilesDir, { recursive: true, mode: 0o700 });
    await mkdir(paths.storageStateDir, { recursive: true, mode: 0o700 });
    // mkdir ignores `mode` when the directory already exists, so tighten again.
    await tighten(paths.home);
    await tighten(paths.profilesDir);
    await tighten(paths.storageStateDir);
}
async function tighten(path, mode = 0o700) {
    if (process.platform === 'win32')
        return;
    try {
        await chmod(path, mode);
    }
    catch {
        // Best effort: some filesystems (network mounts, containers) refuse chmod.
    }
}
export const STORAGE_STATE_WARNING = 'Saved authentication state can contain session cookies that impersonate you. ' +
    'Keep it private, do not commit it, and clear it with `ui-atlas auth clear <profile>` when finished.';
/** Persist a Playwright storage state with owner-only file permissions. */
export async function writeStorageState(name, state, paths = authPaths()) {
    await ensureAuthDirs(paths);
    const path = paths.storageStatePath(name);
    await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await tighten(path, 0o600);
    const parsed = state;
    return {
        path,
        cookieCount: Array.isArray(parsed.cookies) ? parsed.cookies.length : 0,
        originCount: Array.isArray(parsed.origins) ? parsed.origins.length : 0,
    };
}
export async function readStorageState(name, paths = authPaths()) {
    const path = paths.storageStatePath(name);
    if (!existsSync(path)) {
        throw new UiAtlasError('auth.not-found', `no saved authentication state for profile "${name}"`, {
            detail: { expectedPath: path },
        });
    }
    await readFile(path, 'utf8');
    return path;
}
export async function clearProfile(name, paths = authPaths()) {
    const storageStatePath = paths.storageStatePath(name);
    const profileDir = paths.profileDir(name);
    const removedStorageState = existsSync(storageStatePath);
    const removedProfile = existsSync(profileDir);
    await rm(storageStatePath, { force: true });
    await rm(profileDir, { recursive: true, force: true });
    return { removedStorageState, removedProfile };
}
//# sourceMappingURL=auth.js.map