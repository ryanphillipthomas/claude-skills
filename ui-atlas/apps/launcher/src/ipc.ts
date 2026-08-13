/**
 * The whole surface between the Electron main process and the popover.
 *
 * One file, because the renderer runs with `contextIsolation` and no Node
 * access — the only things it can do are the ones named here. Keeping the list
 * short is the point: the popover is a view, and every capability it is handed
 * is a capability page code could reach if the renderer were ever compromised.
 */

import type { PopoverModel } from './popover.js';

export const CHANNEL_STATE = 'launcher:state';
export const CHANNEL_ACTION = 'launcher:action';

export type LauncherRequest =
  | { kind: 'start' }
  | { kind: 'cancel' }
  | { kind: 'stop' }
  | { kind: 'retry' }
  | { kind: 'sign-in' }
  | { kind: 'capture-anyway' }
  | { kind: 'choose-profile' }
  | { kind: 'set-url'; url: string }
  | { kind: 'set-profile'; profile: string | undefined }
  | { kind: 'toggle-log' }
  | { kind: 'reveal-captures' }
  | { kind: 'reveal-run'; runId: string }
  | { kind: 'open-report'; runId: string }
  | { kind: 'settings' }
  | { kind: 'quit' }
  /** Content height after a redraw; only the renderer can know it. */
  | { kind: 'measured'; height: number };

export interface LauncherSnapshot {
  model: PopoverModel;
  /** Tail of the child output, shown when `Show log` is open. */
  log: readonly string[];
  logOpen: boolean;
  /** Profiles with something saved under them, for the Manage menu. */
  profiles: readonly string[];
  selectedProfile: string | undefined;
  /** Set when a transient message should sit above the footer. */
  notice: string | undefined;
}

export interface LauncherBridge {
  subscribe: (listener: (snapshot: LauncherSnapshot) => void) => void;
  send: (request: LauncherRequest) => void;
}
