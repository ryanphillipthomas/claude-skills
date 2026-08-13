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
  /**
   * The renderer is loaded and has nothing to draw yet.
   *
   * State used to be pushed at startup and never re-sent, which is a race the
   * renderer always loses: `webContents.send` to a page that has not finished
   * loading is dropped silently, and the popover then sat empty — with no
   * Start button on it — until something else happened to change state.
   * Asking is reliable in a way that being told is not.
   */
  | { kind: 'hello' }
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
