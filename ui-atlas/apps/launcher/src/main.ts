/**
 * The menu bar extra.
 *
 * A tray icon, a popover under it, and a supervisor running the same two
 * commands the two terminal windows used to run. It holds the state, sends a
 * snapshot to the renderer after every change, and takes requests back — it is
 * the only place in the launcher allowed to touch the filesystem, spawn a
 * process, or ask the desktop to open something.
 */

import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectSlugFromUrl } from '@ui-atlas/artifacts';
import { loadConfig } from '@ui-atlas/config';
import { authPaths } from '@ui-atlas/browser';
import { CHANNEL_ACTION, CHANNEL_STATE, type LauncherRequest, type LauncherSnapshot } from './ipc.js';
import { BridgeServer } from './bridge/server.js';
import { BRIDGE_PROTOCOL_VERSION, commandFor, type BridgeRequest, type BridgeStatus } from './bridge/protocol.js';
import {
  normalizeTargetUrl,
  popoverModel,
  type AuthVerdict,
  type PopoverFacts,
  type RecentRun,
} from './popover.js';
import {
  countSessionsTodayOnDisk,
  listProfiles,
  readAuthStatus,
  readRecentSessions,
} from './runs.js';
import { initialState, reduce, type LauncherEvent, type LauncherState } from './startup.js';
import { Supervisor, type InspectTarget } from './supervisor.js';
import { PANEL_WIDTH } from './renderer/styles.js';

const here = dirname(fileURLToPath(import.meta.url));
/** `apps/launcher/dist` → the workspace root. */
const WORKSPACE_ROOT = resolve(here, '..', '..', '..');

const DEFAULT_URL = 'http://localhost:3000';
const MAX_RECENT_URLS = 6;

interface Session {
  state: LauncherState;
  target: InspectTarget;
  recentUrls: string[];
  runs: RecentRun[];
  runsToday: number;
  engineLabel: string | undefined;
  authVerdict: AuthVerdict;
  authCheckedAt: number | undefined;
  profiles: string[];
  logOpen: boolean;
  notice: string | undefined;
  outputRoot: string;
  /**
   * A project name from the config, when the config actually chose one.
   *
   * Absent is the normal case and means "named after whatever site is being
   * captured" — the engine derives that itself, so the launcher only needs to
   * agree with it well enough to look in the right directory afterwards.
   */
  configuredProject: string | undefined;
}

let tray: Tray | undefined;
let popover: BrowserWindow | undefined;
let supervisor: Supervisor;
let bridge: BridgeServer | undefined;

const session: Session = {
  state: initialState(),
  target: { url: DEFAULT_URL, profile: undefined, mode: undefined, persistent: false },
  recentUrls: [],
  runs: [],
  runsToday: 0,
  engineLabel: undefined,
  authVerdict: 'unknown',
  authCheckedAt: undefined,
  profiles: [],
  logOpen: false,
  notice: undefined,
  outputRoot: join(WORKSPACE_ROOT, 'ui-atlas-output'),
  configuredProject: undefined,
};

/**
 * The project the *next* capture would write into.
 *
 * Same rule the CLI follows, so the launcher's "Open project page" and the
 * engine's output directory cannot disagree: a name from the config wins,
 * otherwise the site names it.
 */
function currentProject(): string {
  return session.configuredProject ?? projectSlugFromUrl(session.target.url);
}

function projectDir(project: string): string {
  return join(session.outputRoot, project);
}

// --- Snapshot ----------------------------------------------------------------

async function snapshot(): Promise<LauncherSnapshot> {
  const now = Date.now();
  const facts: PopoverFacts = {
    engineLabel: session.engineLabel,
    runsToday: session.runsToday,
    targetUrl: session.target.url,
    recentUrls: session.recentUrls,
    auth: await readAuthStatus({
      profile: session.target.profile,
      verdict: session.authVerdict,
      checkedAt: session.authCheckedAt,
    }),
    runs: session.runs,
  };
  return {
    model: popoverModel(session.state, now, facts),
    log: supervisor.log.slice(-200),
    logOpen: session.logOpen,
    profiles: session.profiles,
    selectedProfile: session.target.profile,
    notice: session.notice,
  };
}

let pushQueued = false;
function push(): void {
  // Events arrive in bursts — three per stage transition — and one redraw per
  // burst is enough.
  if (pushQueued) return;
  pushQueued = true;
  queueMicrotask(() => {
    pushQueued = false;
    void snapshot().then((value) => {
      popover?.webContents.send(CHANNEL_STATE, value);
      updateTrayTitle();
    });
  });
}

function updateTrayTitle(): void {
  if (tray === undefined) return;
  const phase = session.state.phase;
  tray.setToolTip(
    phase === 'running'
      ? 'UI Atlas — engine running'
      : phase === 'starting'
        ? 'UI Atlas — starting'
        : phase === 'signin'
          ? 'UI Atlas — sign-in needed'
          : phase === 'failed'
            ? 'UI Atlas — startup failed'
            : 'UI Atlas — stopped',
  );
}

function apply(event: LauncherEvent): void {
  session.state = reduce(session.state, event);
  if (event.kind === 'ready' || event.kind === 'stopped') void refreshRuns();
  if (event.kind === 'ready') session.notice = undefined;
  push();
  bridge?.broadcast();
}

// --- The extension bridge ------------------------------------------------------

/**
 * The only view of the launcher an extension gets. Deliberately narrow: a
 * phase, two already-worded lines, and the last run's counts. No paths, no
 * output root, no profile material — a browser is the far end of this.
 */
function bridgeStatus(): BridgeStatus {
  const model = popoverModel(session.state, Date.now(), {
    engineLabel: session.engineLabel,
    runsToday: session.runsToday,
    targetUrl: session.target.url,
    recentUrls: session.recentUrls,
    auth: { profile: session.target.profile, verdict: session.authVerdict, expiresAt: undefined, checkedAt: session.authCheckedAt },
    runs: session.runs,
  });
  const latest = session.runs[0];
  return {
    protocol: BRIDGE_PROTOCOL_VERSION,
    phase: session.state.phase,
    title: model.header.title,
    subtitle: model.header.subtitle,
    ...(session.target.profile === undefined ? {} : { profile: session.target.profile }),
    ...(session.authVerdict === 'unknown' ? {} : { signedIn: session.authVerdict === 'signed-in' }),
    ...(latest === undefined
      ? {}
      : { lastRun: { label: latest.label, files: latest.fileCount, hasReport: latest.hasReport } }),
  };
}

/**
 * A request from the extension. `capture` is the only one that carries data,
 * and the URL has already been validated as http(s) by the schema — it is then
 * passed as an argv element, never interpolated into a command string.
 */
async function handleBridge(request: BridgeRequest): Promise<void> {
  switch (request.method) {
    case 'status':
      return;
    case 'stop':
      supervisor.stop();
      return;
    case 'start':
      await supervisor.start(session.target);
      return;
    case 'capture': {
      session.target = { ...session.target, url: request.url };
      rememberUrl(request.url);
      session.authVerdict = 'unknown';
      session.authCheckedAt = undefined;
      await supervisor.start(session.target, commandFor(request.mode, request.url));
      return;
    }
  }
}

// --- Facts from disk ----------------------------------------------------------

async function refreshRuns(): Promise<void> {
  // Across every project, not just the one the next capture would use: the list
  // is what you go back into, and yesterday's site is exactly the thing you
  // would want to reopen.
  session.runs = await readRecentSessions({ outputRoot: session.outputRoot, limit: 3 });
  session.runsToday = await countSessionsTodayOnDisk(session.outputRoot, Date.now());
  // The bundled browser's version is recorded in every manifest, so the header
  // states the engine it actually used rather than one it might use next time.
  session.engineLabel = undefined;
  push();
}

async function loadWorkspace(): Promise<void> {
  try {
    const loaded = await loadConfig({ overrides: {} });
    session.configuredProject =
      loaded.projectSource === 'default' ? undefined : loaded.config.project;
    session.outputRoot = resolve(loaded.baseDir, loaded.config.outputRoot);
    if (loaded.config.browser.profile !== undefined) {
      session.target.profile = loaded.config.browser.profile;
      // `attach` drives a browser the launcher did not start and cannot close,
      // which is the one mode this window has no honest story for. The CLI
      // still offers it; the launcher falls back to the mode's own default.
      const mode = loaded.config.browser.mode;
      session.target.mode = mode === 'profile' || mode === 'storage-state' ? mode : undefined;
    }
  } catch {
    // Defaults already point at the workspace; a missing config is normal.
  }
  session.profiles = await listProfiles(authPaths());
  await refreshRuns();
}

// --- Requests -----------------------------------------------------------------

function rememberUrl(url: string): void {
  session.recentUrls = [url, ...session.recentUrls.filter((item) => item !== url)].slice(
    0,
    MAX_RECENT_URLS,
  );
}

async function handle(request: LauncherRequest): Promise<void> {
  switch (request.kind) {
    case 'hello':
      // The renderer is up and has nothing drawn. Answer immediately rather
      // than waiting for the next state change, which may never come.
      push();
      return;

    case 'measured':
      resizePopover(request.height);
      return;

    case 'start':
      session.notice = undefined;
      rememberUrl(session.target.url);
      await supervisor.start(session.target);
      return;

    case 'retry':
      session.notice = undefined;
      await supervisor.start(session.target);
      return;

    case 'cancel':
      supervisor.cancel();
      return;

    case 'stop':
      supervisor.stop();
      return;

    case 'set-url': {
      const url = normalizeTargetUrl(request.url);
      if (url === undefined) {
        session.notice = `${request.url.trim()} is not a page this can open.`;
        push();
        return;
      }
      if (url === session.target.url && session.notice === undefined) return;
      session.target = { ...session.target, url };
      session.authVerdict = 'unknown';
      session.authCheckedAt = undefined;
      session.notice = undefined;
      // Deliberately no `push()`. This arrives from the field on blur — which
      // is on the way to clicking the button beside it — and a redraw here
      // destroys that button mid-click, so the press is lost. The field
      // already shows what was typed; the next real state change redraws it.
      return;
    }

    case 'set-profile':
      session.target = { ...session.target, profile: request.profile, mode: request.profile === undefined ? undefined : session.target.mode };
      session.authVerdict = 'unknown';
      session.authCheckedAt = undefined;
      push();
      return;

    case 'sign-in': {
      if (session.target.profile === undefined) {
        await chooseProfile();
        if (session.target.profile === undefined) return;
      }
      session.notice = 'A sign-in window is open. UI Atlas saves the session when you land.';
      push();
      const code = await supervisor.signIn(session.target);
      session.authVerdict = code === 0 ? 'signed-in' : 'signed-out';
      session.authCheckedAt = Date.now();
      session.notice = code === 0 ? undefined : 'The sign-in was not saved.';
      apply({ kind: 'sign-in-cleared' });
      if (code === 0) await supervisor.start(session.target);
      return;
    }

    case 'capture-anyway':
      // The browser is already open behind the card; dismissing it is the whole
      // action. Nothing is re-launched, and nothing is re-checked — so the
      // verdict stays on record rather than being quietly cleared.
      session.authVerdict = 'signed-out';
      session.authCheckedAt = Date.now();
      apply({ kind: 'sign-in-cleared' });
      return;

    case 'choose-profile':
      await chooseProfile();
      return;

    case 'toggle-log':
      session.logOpen = !session.logOpen;
      push();
      return;

    case 'reveal-captures':
      await openPath(supervisor.runDir ?? projectDir(currentProject()));
      return;

    case 'reveal-run': {
      const run = session.runs.find((item) => item.runId === request.runId);
      if (run !== undefined) await openPath(run.runDir);
      return;
    }

    case 'open-report': {
      const run = session.runs.find((item) => item.runId === request.runId);
      if (run !== undefined) await openPath(join(run.runDir, 'report', 'index.html'));
      return;
    }

    case 'open-project-page':
      await openPath(join(projectDir(currentProject()), 'index.html'));
      return;

    case 'resume-session': {
      const run = session.runs.find((item) => item.runId === request.runId);
      if (run === undefined) return;
      if (run.resumeUrl === undefined) {
        // Only rows that recorded a URL offer this, so reaching here means the
        // list moved underneath the click. Saying so beats opening something
        // else.
        session.notice = 'That session did not record a page to reopen.';
        push();
        return;
      }

      // The session is reopened where it was, in the project it belongs to —
      // not in whatever the URL field happens to say. Both are passed
      // explicitly so a resume cannot land somewhere else because the config
      // changed since.
      session.target = { ...session.target, url: run.resumeUrl };
      rememberUrl(run.resumeUrl);
      session.authVerdict = 'unknown';
      session.authCheckedAt = undefined;
      session.notice = undefined;
      await supervisor.start(session.target, [
        'inspect',
        run.resumeUrl,
        '--auto-inspect',
        '--project',
        run.project,
        '--resume',
        run.runId,
      ]);
      return;
    }

    case 'settings':
      await openSettings();
      return;

    case 'quit':
      supervisor.stop();
      app.quit();
      return;
  }
}

async function openPath(target: string): Promise<void> {
  if (!existsSync(target)) {
    session.notice = 'That has not been written yet.';
    push();
    return;
  }
  const error = await shell.openPath(target);
  if (error.length > 0) {
    session.notice = error;
    push();
  }
}

/**
 * There is no settings window yet, and inventing an empty one would be worse
 * than being honest: this reveals the config the run actually loaded.
 */
async function openSettings(): Promise<void> {
  const candidates = ['ui-atlas.config.yml', 'ui-atlas.config.yaml'].map((name) =>
    join(WORKSPACE_ROOT, name),
  );
  const found = candidates.find((path) => existsSync(path));
  await openPath(found ?? WORKSPACE_ROOT);
}

/** A native menu, because a picker inside a 308px popover is a worse picker. */
async function chooseProfile(): Promise<void> {
  session.profiles = await listProfiles(authPaths());
  const buttons = [...session.profiles, 'No saved sign-in', 'Cancel'];
  const cancelId = buttons.length - 1;
  const result = await dialog.showMessageBox({
    type: 'question',
    message: 'Which saved sign-in should captures use?',
    detail:
      session.profiles.length === 0
        ? 'Nothing is saved yet. Sign in once and UI Atlas will keep the session.'
        : 'Saved with `ui-atlas auth save`. Captures use this profile’s cookies.',
    buttons,
    cancelId,
    defaultId: 0,
  });

  if (result.response === cancelId) return;
  const chosen = session.profiles[result.response];
  await handle({ kind: 'set-profile', profile: chosen });
}

// --- Window -------------------------------------------------------------------

function resizePopover(contentHeight: number): void {
  if (popover === undefined) return;
  const height = Math.min(Math.max(contentHeight, 120), 720);
  const [width] = popover.getSize();
  if (popover.getSize()[1] === height) return;
  popover.setSize(width ?? PANEL_WIDTH, height, false);
  positionPopover();
}

function positionPopover(): void {
  if (popover === undefined || tray === undefined) return;
  const bounds = tray.getBounds();
  const [width, height] = popover.getSize();
  const work = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;

  const centred = Math.round(bounds.x + bounds.width / 2 - (width ?? PANEL_WIDTH) / 2);
  const x = Math.min(Math.max(centred, work.x + 8), work.x + work.width - (width ?? PANEL_WIDTH) - 8);
  const y = Math.min(bounds.y + bounds.height + 6, work.y + work.height - (height ?? 200) - 8);
  popover.setPosition(x, y, false);
}

function createPopover(): BrowserWindow {
  const window = new BrowserWindow({
    width: PANEL_WIDTH,
    height: 220,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // macOS paints the blur behind the panel's translucent scrim, which is what
    // the design's `backdrop-filter` is standing in for.
    vibrancy: 'popover',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  void window.loadFile(join(here, 'renderer', 'index.html'));

  // The renderer's `hello` is the reliable path; this covers a reload, where
  // the page is replaced and its listener with it.
  window.webContents.on('did-finish-load', () => {
    push();
  });

  // Clicking away closes it, exactly like a real menu bar extra.
  window.on('blur', () => {
    if (!window.webContents.isDevToolsOpened()) window.hide();
  });

  // Nothing in the popover should ever navigate or open a second window.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  return window;
}

function togglePopover(): void {
  if (popover === undefined) return;
  if (popover.isVisible()) {
    popover.hide();
    return;
  }
  positionPopover();

  /*
   * Hiding the Dock tile makes this an accessory app, and showing a window
   * does not activate an accessory app. The window then never becomes the key
   * window, macOS swallows the first click on it, and the panel reads — from
   * the outside — as simply not responding: the button is drawn, hit-testable
   * and wired to a working handler, and nothing happens when you press it.
   *
   * `steal: true` activates the app so the window can take key status. The
   * order matters: activate, show, then focus.
   */
  app.focus({ steal: true });
  popover.show();
  popover.focus();

  // Re-read the build and the run list on every open: both change underneath a
  // launcher that has been sitting in the menu bar all afternoon.
  void supervisor.checkBuild();
  void refreshRuns();
  void snapshot().then((value) => {
    popover?.webContents.send(CHANNEL_STATE, value);
  });
}

/**
 * A 16pt template image, drawn as a camera because that is what the tool does.
 * Template images are black-plus-alpha and are recoloured by macOS for light,
 * dark and menu-highlighted states, so this must not carry colour of its own.
 */
function trayIcon(): Electron.NativeImage {
  const path = join(here, 'assets', 'trayTemplate.png');
  const image = nativeImage.createFromPath(path);
  image.setTemplateImage(true);
  return image;
}

function createTray(): Tray {
  const created = new Tray(trayIcon());
  created.setIgnoreDoubleClickEvents(true);
  created.on('click', togglePopover);
  // Right-click keeps working when the popover is the wrong answer — quitting a
  // launcher that failed to draw should not require the launcher to draw.
  created.on('right-click', () => {
    created.popUpContextMenu(
      Menu.buildFromTemplate([
        { label: 'Open UI Atlas', click: togglePopover },
        { type: 'separator' },
        {
          label: 'Quit UI Atlas',
          accelerator: 'Command+Q',
          click: () => {
            supervisor.stop();
            app.quit();
          },
        },
      ]),
    );
  });
  return created;
}

// --- Lifecycle ----------------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // A menu bar extra has no Dock tile and no windows of its own.
  app.dock?.hide();

  app.on('second-instance', togglePopover);
  app.on('window-all-closed', () => {
    // Deliberately empty: closing the popover must not quit the launcher.
  });
  app.on('before-quit', () => {
    supervisor.stop();
    void bridge?.close();
  });

  void app.whenReady().then(async () => {
    supervisor = new Supervisor({
      workspaceRoot: WORKSPACE_ROOT,
      onEvent: apply,
      onLog: () => {
        if (session.logOpen) push();
      },
      onFinished: (result) => {
        // A one-shot run leaves no window behind, so the only place it can
        // report itself is here.
        void refreshRuns().then(() => {
          const latest = session.runs[0];
          session.notice =
            result.ok && latest !== undefined
              ? `Finished ${latest.label} — ${String(latest.fileCount)} files.`
              : 'The run finished.';
          push();
        });
      },
    });

    ipcMain.on(CHANNEL_ACTION, (_event, request: LauncherRequest) => {
      void handle(request);
    });

    popover = createPopover();
    tray = createTray();

    // The extension bridge. A failure to listen must not stop the launcher —
    // the menu bar is the primary surface and works without any extension.
    bridge = new BridgeServer({
      status: bridgeStatus,
      onRequest: handleBridge,
      onError: (error) => {
        session.notice = error instanceof Error ? error.message : 'the extension bridge failed';
        push();
      },
    });
    try {
      await bridge.listen();
    } catch {
      bridge = undefined;
    }

    await loadWorkspace();
    await supervisor.checkBuild();
    push();
  });
}
