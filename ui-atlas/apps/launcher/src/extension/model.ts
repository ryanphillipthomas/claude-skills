/**
 * What the extension's popover shows, as data.
 *
 * Same split as the menu bar popover: every decision here, nothing in the
 * rendering. It matters more in the extension, because there is no way to
 * inspect a Chrome popup from a test — if this logic lived in the DOM code it
 * would be untested, and the state that matters most (the engine is not
 * running) is the one you would never think to open the popup and look at.
 */

import type { BridgeStatus, CaptureMode } from '../bridge/protocol.js';
import type { LauncherTone } from '../startup.js';

export const CAPTURE_MODES: ReadonlyArray<{ mode: CaptureMode; label: string }> = [
  { mode: 'element', label: 'Element' },
  { mode: 'page', label: 'Page' },
  { mode: 'site', label: 'Whole site' },
];

export interface ExtensionButton {
  label: string;
  /** `capture` sends the current tab's URL; `start` boots the engine first. */
  action: 'capture' | 'start';
  enabled: boolean;
}

export interface ExtensionModel {
  header: { title: string; subtitle: string; tone: LauncherTone };
  /** Absent when the engine is not running: there is nothing to choose yet. */
  modes: { options: typeof CAPTURE_MODES; selected: CaptureMode } | undefined;
  primary: ExtensionButton;
  caption: string;
  lastRun: { label: string; files: string; hasReport: boolean } | undefined;
}

export interface ExtensionInput {
  /** Absent when the native host could not reach the launcher at all. */
  status: BridgeStatus | undefined;
  selected: CaptureMode;
  /** The page the popup was opened on, so the caption can name its host. */
  pageHost: string | undefined;
}

/**
 * The design's staging note is explicit that a stopped engine must not be an
 * error here: "if the engine is stopped, its popover shows the same Start
 * button rather than an error". So the unreachable and cold cases produce a
 * Start button and a calm subtitle, not a failure.
 */
export function extensionModel(input: ExtensionInput): ExtensionModel {
  const status = input.status;

  if (status === undefined || status.phase === 'unavailable') {
    /*
     * The design says a stopped *engine* shows a Start button rather than an
     * error, and it does — below, for `cold`. This case is different and was
     * wrongly folded into it: here the launcher itself is not reachable, and
     * an extension cannot start a macOS app it has no connection to. A Start
     * button here is one that provably cannot work, so there isn't one.
     */
    return {
      header: {
        title: 'UI Atlas is not running',
        subtitle: 'Open it from the menu bar',
        tone: 'idle',
      },
      modes: undefined,
      primary: { label: 'Waiting for UI Atlas', action: 'start', enabled: false },
      caption: 'Run `npm run launcher`, then reopen this popover',
      lastRun: undefined,
    };
  }

  if (status.phase !== 'running') {
    // Starting, signed-out or failed: the launcher is the place to answer that,
    // and the extension says so instead of offering a second half-answer.
    return {
      header: { title: status.title, subtitle: status.subtitle, tone: toneFor(status.phase) },
      modes: undefined,
      primary: {
        label: status.phase === 'starting' ? 'Starting…' : 'Start',
        action: 'start',
        // Disabled while starting, and while a sign-in question is open: the
        // caption below sends you to the menu bar, and an enabled Start beside
        // it would be contradictory advice — pressing it would relaunch and
        // ask the same question again.
        enabled: status.phase !== 'starting' && status.phase !== 'signin',
      },
      caption:
        status.phase === 'signin'
          ? 'Answer the sign-in question in the menu bar first'
          : 'Open UI Atlas in the menu bar for details',
      lastRun: lastRunOf(status),
    };
  }

  return {
    header: {
      title: 'Engine connected',
      subtitle: connectedSubtitle(status, input.pageHost),
      tone: 'ok',
    },
    modes: { options: CAPTURE_MODES, selected: input.selected },
    primary: { label: primaryLabel(input.selected), action: 'capture', enabled: true },
    caption: 'This tab reopens in a clean window so captures are deterministic',
    lastRun: lastRunOf(status),
  };
}

function primaryLabel(mode: CaptureMode): string {
  switch (mode) {
    case 'element':
      return 'Pick an element…';
    case 'page':
      return 'Capture this page';
    case 'site':
      return 'Crawl this site';
  }
}

/**
 * `acme.com · signed in`. The sign-in half is omitted rather than guessed when
 * no profile is loaded — a clean run is *expected* to be signed out, and saying
 * "signed out" there would read as a fault.
 */
function connectedSubtitle(status: BridgeStatus, pageHost: string | undefined): string {
  const host = pageHost ?? 'this page';
  if (status.profile === undefined) return host;
  return status.signedIn === true ? `${host} · signed in` : `${host} · signed out`;
}

function lastRunOf(status: BridgeStatus): ExtensionModel['lastRun'] {
  if (status.lastRun === undefined) return undefined;
  const count = status.lastRun.files;
  return {
    label: status.lastRun.label,
    files: count === 1 ? '1 file' : `${String(count)} files`,
    hasReport: status.lastRun.hasReport,
  };
}

function toneFor(phase: string): LauncherTone {
  switch (phase) {
    case 'starting':
      return 'busy';
    case 'signin':
      return 'warn';
    case 'failed':
      return 'error';
    default:
      return 'idle';
  }
}

/** Host of the tab the popup was opened on, for the subtitle. */
export function hostOfTab(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.host;
  } catch {
    return undefined;
  }
}
