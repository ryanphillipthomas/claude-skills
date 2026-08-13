/**
 * Everything the popover shows, as data.
 *
 * The renderer draws this and nothing else — it has no conditions of its own,
 * so the question "what does the panel say when the profile has never been
 * checked?" is answered by a unit test rather than by opening a window and
 * squinting. Same split as the overlay's `flow.ts` against its `toolbar.ts`.
 *
 * The one rule that shaped this file: the launcher may only claim what it can
 * actually observe. It does not know your email address, so it does not print
 * one; it does know which profile is loaded and what `auth check` last said, so
 * it prints that instead.
 */

import { signInCard, type SignInCard } from './signin.js';
import {
  view,
  type LauncherAction,
  type LauncherButton,
  type LauncherState,
  type LauncherTone,
  type StageRow,
  type ViewFacts,
} from './startup.js';

export interface RecentRun {
  runId: string;
  /** `/pricing`, from the first page the run recorded. */
  label: string;
  fileCount: number;
  /** ms epoch, or absent for a run that never wrote a manifest. */
  finishedAt: number | undefined;
  runDir: string;
  hasReport: boolean;
  /** The project — which is to say the site — this session belongs to. */
  project: string;
  /**
   * Where reopening this session would go. Absent when nothing recorded a URL
   * for it, in which case the row cannot offer a resume rather than guessing
   * one.
   */
  resumeUrl: string | undefined;
}

export type AuthVerdict = 'signed-in' | 'signed-out' | 'unclear' | 'unknown';

export interface AuthStatus {
  /** The profile a capture would use, or absent for a clean run. */
  profile: string | undefined;
  verdict: AuthVerdict;
  /** Earliest cookie expiry in the saved state, when one could be read. */
  expiresAt: number | undefined;
  /** When `auth check` last ran. Absent means it never has. */
  checkedAt: number | undefined;
}

export interface PopoverFacts extends ViewFacts {
  /** The URL the next inspect would open. */
  targetUrl: string;
  /** Previously inspected URLs, most recent first, for the field's menu. */
  recentUrls: readonly string[];
  auth: AuthStatus;
  runs: readonly RecentRun[];
}

export interface AuthRow {
  tone: LauncherTone;
  title: string;
  detail: string;
  action: LauncherButton | undefined;
}

export interface RunRow {
  runId: string;
  title: string;
  detail: string;
  runDir: string;
  project: string;
  /** Absent when the run has no report to open yet. */
  reportAction: 'open-report' | undefined;
  /** Absent when nothing recorded where this session was pointed. */
  resumeAction: 'resume-session' | undefined;
}

export type PopoverBody =
  | {
      kind: 'stages';
      stages: StageRow[];
      /**
       * Present on the cold and failed cards, absent mid-launch.
       *
       * The design shows the field only on the running card, because there
       * Start boots an engine and choosing a page is a separate act. This
       * launcher has no daemon, so Start *is* `inspect <url>` — without the
       * field here you can only change the URL after it has already opened
       * something else, which is exactly how it behaved.
       */
      urlField: { value: string; options: readonly string[] } | undefined;
      primary: LauncherButton | undefined;
      footnote: string | undefined;
      showLog: boolean;
    }
  | { kind: 'signin'; card: SignInCard; stages: StageRow[] }
  | {
      kind: 'ready';
      urlField: { value: string; options: readonly string[] };
      auth: AuthRow;
      primary: LauncherButton;
      caption: string;
      runs: RunRow[];
    };

export interface FooterItem {
  label: string;
  action:
    | LauncherAction
    | 'reveal-captures'
    | 'open-project-page'
    | 'export-attachments'
    | 'settings'
    | 'quit';
  /** Shown right-aligned in monospace, e.g. `⌘Q`. */
  shortcut: string | undefined;
}

export interface PopoverModel {
  header: { title: string; subtitle: string; tone: LauncherTone; action: LauncherButton | undefined };
  /** 0–1 hairline under the header, or absent when nothing is in flight. */
  progress: number | undefined;
  body: PopoverBody;
  footer: FooterItem[];
}

export const FOOTER: readonly FooterItem[] = [
  { label: 'Open project page', action: 'open-project-page', shortcut: undefined },
  { label: 'Export images for Claude Design', action: 'export-attachments', shortcut: undefined },
  { label: 'Show captures in Finder', action: 'reveal-captures', shortcut: undefined },
  { label: 'Settings…', action: 'settings', shortcut: '⌘,' },
  { label: 'Quit UI Atlas', action: 'quit', shortcut: '⌘Q' },
];

export function popoverModel(state: LauncherState, now: number, facts: PopoverFacts): PopoverModel {
  const base = view(state, now, facts);
  const header = {
    title: base.title,
    subtitle: base.subtitle,
    tone: base.tone,
    action: base.headerAction,
  };
  const footer = [...FOOTER];

  if (state.phase === 'signin' && state.signIn !== undefined) {
    return {
      header,
      progress: base.progress,
      body: { kind: 'signin', card: signInCard(state.signIn), stages: base.stages },
      footer,
    };
  }

  if (state.phase === 'running') {
    return {
      header,
      progress: undefined,
      body: {
        kind: 'ready',
        urlField: { value: facts.targetUrl, options: facts.recentUrls },
        auth: authRow(facts.auth, now),
        primary: { label: 'Open inspector', action: 'start' },
        caption: 'Opens a clean browser window with the panel attached',
        runs: facts.runs.map((run) => runRow(run, now)),
      },
      footer,
    };
  }

  // Only where pressing something would use it. While starting, the URL is
  // already decided and an editable field would imply otherwise.
  const editable = state.phase === 'cold' || state.phase === 'failed';
  return {
    header,
    progress: base.progress,
    body: {
      kind: 'stages',
      stages: base.stages,
      urlField: editable ? { value: facts.targetUrl, options: facts.recentUrls } : undefined,
      primary: base.primary,
      footnote: base.footnote,
      showLog: base.showLog,
    },
    footer,
  };
}

/**
 * What someone types into a URL field is not a URL.
 *
 * The design's own mock reads `localhost:3000/pricing` — no scheme — and the
 * first version rejected exactly that, leaving the previous target in place
 * and the field reverting on the next redraw. It read as the launcher ignoring
 * the edit.
 *
 * Localhost gets `http`, because a dev server is rarely on TLS and offering
 * `https://localhost:3000` would fail in a way that looks like the tool's
 * fault. Everything else gets `https`.
 */
export function normalizeTargetUrl(input: string): string | undefined {
  const trimmed = input.trim();
  if (trimmed.length === 0) return undefined;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `${isLocal(trimmed) ? 'http' : 'https'}://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
  if (parsed.hostname.length === 0) return undefined;
  return parsed.toString();
}

function isLocal(value: string): boolean {
  const host = value.split('/')[0]?.split(':')[0]?.toLowerCase() ?? '';
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
}

/**
 * What the launcher knows about the saved session, and not a word more. The
 * design's mock reads "Signed in as reviewer@acme.com" — UI Atlas never learns
 * an account name, so the row names the profile it actually loaded.
 */
export function authRow(auth: AuthStatus, now: number): AuthRow {
  const manage: LauncherButton = { label: 'Manage', action: 'choose-profile' };

  if (auth.profile === undefined) {
    return {
      tone: 'idle',
      title: 'No saved sign-in',
      detail: 'Captures will be of the signed-out site',
      action: { label: 'Sign in…', action: 'sign-in' },
    };
  }

  const detail = authDetail(auth, now);
  switch (auth.verdict) {
    case 'signed-in':
      return { tone: 'ok', title: `Signed in as "${auth.profile}"`, detail, action: manage };
    case 'signed-out':
      return {
        tone: 'warn',
        title: `Profile "${auth.profile}" is signed out`,
        detail,
        action: { label: 'Sign in…', action: 'sign-in' },
      };
    case 'unclear':
      return { tone: 'warn', title: `Profile "${auth.profile}" is unreadable`, detail, action: manage };
    case 'unknown':
      return { tone: 'idle', title: `Profile "${auth.profile}" is loaded`, detail, action: manage };
  }
}

function authDetail(auth: AuthStatus, now: number): string {
  if (auth.expiresAt !== undefined) {
    return auth.expiresAt <= now ? 'Expired' : `Expires ${describeDelta(auth.expiresAt - now)}`;
  }
  if (auth.checkedAt === undefined) return 'Not checked yet';
  return `Checked ${relativeTime(auth.checkedAt, now)}`;
}

/**
 * `20260812T160000Z-a1b2c3` is not a thing to put in a 308px popover, and the
 * random suffix is already unique within a project. The full id stays available
 * as the row's tooltip.
 */
export function shortRunLabel(runId: string): string {
  const suffix = runId.slice(runId.lastIndexOf('-') + 1);
  return `run ${suffix.length > 0 ? suffix : runId}`;
}

/**
 * The project leads, because the list now spans every site this launcher has
 * been pointed at and "run 4f2a · /pricing" does not say which site's /pricing
 * that is. The route, the file count and the time move into the detail line,
 * where they still fit at 308px.
 */
function runRow(run: RecentRun, now: number): RunRow {
  const files = run.fileCount === 1 ? '1 file' : `${String(run.fileCount)} files`;
  const when = run.finishedAt === undefined ? 'not finished' : relativeTime(run.finishedAt, now);
  return {
    runId: run.runId,
    title: run.project,
    detail: `${run.label} · ${files} · ${when}`,
    runDir: run.runDir,
    project: run.project,
    reportAction: run.hasReport ? 'open-report' : undefined,
    resumeAction: run.resumeUrl === undefined ? undefined : 'resume-session',
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `just now`, `3 minutes ago`, `yesterday`, `6 days ago`. */
export function relativeTime(at: number, now: number): string {
  const delta = now - at;
  if (delta < 0) return 'just now';
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) return plural(Math.floor(delta / MINUTE), 'minute') + ' ago';
  if (delta < DAY) return plural(Math.floor(delta / HOUR), 'hour') + ' ago';
  const days = Math.floor(delta / DAY);
  if (days === 1) return 'yesterday';
  return `${String(days)} days ago`;
}

/** `in 6 days`, `in 4 hours`. Used only for a future instant. */
export function describeDelta(ms: number): string {
  if (ms < HOUR) return `in ${plural(Math.max(1, Math.floor(ms / MINUTE)), 'minute')}`;
  if (ms < DAY) return `in ${plural(Math.floor(ms / HOUR), 'hour')}`;
  return `in ${plural(Math.floor(ms / DAY), 'day')}`;
}

function plural(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${String(count)} ${noun}s`;
}
