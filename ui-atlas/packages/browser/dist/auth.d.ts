/**
 * Auth material lives outside the artifact tree so a run directory can be
 * shared or archived without leaking cookies. Override with `UI_ATLAS_HOME`.
 */
export declare function uiAtlasHome(): string;
export declare function assertProfileName(name: string): string;
export interface AuthPaths {
    home: string;
    profilesDir: string;
    storageStateDir: string;
    profileDir: (name: string) => string;
    storageStatePath: (name: string) => string;
}
export declare function authPaths(home?: string): AuthPaths;
/** Create the auth directories with owner-only permissions where supported. */
export declare function ensureAuthDirs(paths?: AuthPaths): Promise<void>;
export declare const STORAGE_STATE_WARNING: string;
export interface SavedStorageState {
    path: string;
    cookieCount: number;
    originCount: number;
}
/** Persist a Playwright storage state with owner-only file permissions. */
export declare function writeStorageState(name: string, state: unknown, paths?: AuthPaths): Promise<SavedStorageState>;
export declare function readStorageState(name: string, paths?: AuthPaths): Promise<string>;
export interface ClearedAuth {
    removedStorageState: boolean;
    removedProfile: boolean;
}
export declare function clearProfile(name: string, paths?: AuthPaths): Promise<ClearedAuth>;
//# sourceMappingURL=auth.d.ts.map