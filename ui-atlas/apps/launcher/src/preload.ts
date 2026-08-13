/**
 * The only bridge into the popover.
 *
 * Bundled to CommonJS by `build.mjs`, because a sandboxed preload cannot be an
 * ES module. It exposes two functions and no objects with methods on them, so
 * nothing reachable from `window` can be walked back to `require`.
 */

import { contextBridge, ipcRenderer } from 'electron';
import { CHANNEL_ACTION, CHANNEL_STATE, type LauncherRequest, type LauncherSnapshot } from './ipc.js';

contextBridge.exposeInMainWorld('launcher', {
  subscribe: (listener: (snapshot: LauncherSnapshot) => void): void => {
    ipcRenderer.on(CHANNEL_STATE, (_event, snapshot: LauncherSnapshot) => {
      listener(snapshot);
    });
  },
  send: (request: LauncherRequest): void => {
    ipcRenderer.send(CHANNEL_ACTION, request);
  },
});
