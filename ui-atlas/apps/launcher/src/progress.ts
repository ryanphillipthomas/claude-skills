/**
 * Reading the child process's own log lines.
 *
 * The launcher deliberately learns what is happening by watching `ui-atlas
 * inspect` say it, rather than by being reimplemented as a daemon with a
 * status API. That keeps the promise the design made about this stage: the
 * menu bar extra runs the same commands the two terminals ran, and nothing in
 * the capture engine changes.
 *
 * It also means these patterns are load-bearing. They are matched against the
 * exact strings `apps/cli` prints, they are pure, and they are tested — a
 * reworded log line should fail a test here rather than quietly leave the
 * launcher stuck on "Starting engine…".
 */

export type ProgressSignal =
  | { kind: 'run-started'; runId: string; runDir: string }
  | { kind: 'opening'; url: string }
  | { kind: 'panel-ready' }
  | { kind: 'panel-missing' }
  | { kind: 'navigation-failed'; message: string }
  | { kind: 'signed-in' }
  | { kind: 'signed-out'; evidence: string }
  | { kind: 'sign-in-unclear'; evidence: string }
  | { kind: 'challenged'; host: string; evidence: string }
  | { kind: 'fatal'; message: string };

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogLine {
  level: LogLevel;
  text: string;
}

/**
 * Undo `createLogger`'s prefixes. Kept separate from the matching below so a
 * change to the prefixes breaks one small test rather than ten patterns.
 */
export function readLogLine(raw: string): LogLine {
  const trimmed = raw.trimEnd().replace(/^\s+/, '');
  if (trimmed.startsWith('✖ ')) return { level: 'error', text: trimmed.slice(2) };
  if (trimmed.startsWith('! ')) return { level: 'warn', text: trimmed.slice(2) };
  if (trimmed.startsWith('· ')) return { level: 'debug', text: trimmed.slice(2) };
  return { level: 'info', text: trimmed };
}

const RUN_STARTED = /^run (\S+) → (.+)$/;
const OPENING = /^opening (\S+)$/;
const PANEL_READY = /^inspector ready\b/;
const PANEL_MISSING = /^the inspector overlay did not report in\b/;
const NAVIGATION_FAILED = /^navigation failed: (.+)$/;
const SIGNED_OUT = /^the saved sign-in .* looks signed out: (.+)$/;
const SIGN_IN_CHECK = /^sign-in check for .*: (signed in|unclear)(?: — (.+))?$/;
const CHALLENGED = /^(\S+) is serving a challenge page instead of the site: (.+)$/;
const STRUCTURED_ERROR = /^([a-z]+\.[a-z-]+): (.+)$/;

/**
 * One line in, at most one signal out. Lines the launcher has no use for
 * return `undefined` rather than a catch-all, so the log pane stays the place
 * where everything is visible and the state machine only moves on things it
 * actually understands.
 */
export function readProgress(raw: string): ProgressSignal | undefined {
  const { level, text } = readLogLine(raw);
  if (text.length === 0) return undefined;

  const started = RUN_STARTED.exec(text);
  if (started !== null && started[1] !== undefined && started[2] !== undefined) {
    return { kind: 'run-started', runId: started[1], runDir: started[2] };
  }

  const opening = OPENING.exec(text);
  if (opening !== null && opening[1] !== undefined) return { kind: 'opening', url: opening[1] };

  if (PANEL_READY.test(text)) return { kind: 'panel-ready' };
  if (PANEL_MISSING.test(text)) return { kind: 'panel-missing' };

  const navigation = NAVIGATION_FAILED.exec(text);
  if (navigation !== null && navigation[1] !== undefined) {
    return { kind: 'navigation-failed', message: navigation[1] };
  }

  // Checked before the signed-out pattern: a challenge is not a sign-in state,
  // and the two need opposite responses (ADR 0030).
  const challenged = CHALLENGED.exec(text);
  if (challenged !== null && challenged[1] !== undefined && challenged[2] !== undefined) {
    return { kind: 'challenged', host: challenged[1], evidence: challenged[2] };
  }

  const signedOut = SIGNED_OUT.exec(text);
  if (signedOut !== null && signedOut[1] !== undefined) {
    return { kind: 'signed-out', evidence: signedOut[1] };
  }

  const check = SIGN_IN_CHECK.exec(text);
  if (check !== null) {
    if (check[1] === 'signed in') return { kind: 'signed-in' };
    return { kind: 'sign-in-unclear', evidence: check[2] ?? 'the page shows neither a way in nor a way out' };
  }

  // Only at error level, so a command that merely *mentions* an error code in
  // help text cannot fail the launch.
  if (level === 'error') {
    const structured = STRUCTURED_ERROR.exec(text);
    if (structured !== null && structured[2] !== undefined) {
      return { kind: 'fatal', message: `${structured[1] ?? 'error'}: ${structured[2]}` };
    }
  }

  return undefined;
}

/**
 * Split a chunk of child stdio into whole lines, carrying the partial tail over
 * to the next chunk. A `run … → …` line arriving in two pieces would otherwise
 * be silently dropped.
 */
export function createLineSplitter(onLine: (line: string) => void): (chunk: string) => void {
  let carry = '';
  return (chunk: string) => {
    carry += chunk;
    const parts = carry.split('\n');
    carry = parts.pop() ?? '';
    for (const part of parts) onLine(part);
  };
}
