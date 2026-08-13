import { describe, expect, it } from 'vitest';
import { createLineSplitter, readLogLine, readProgress } from '../../apps/launcher/src/progress.js';
import { createLogger } from '../../apps/cli/src/logger.js';

/**
 * The launcher learns what is happening by reading the CLI's own log lines, so
 * these tests generate the lines through the real logger rather than by hand.
 * A reworded log message should fail here, which is the point: the alternative
 * is a launcher that sits on "Starting engine…" forever and no test that minds.
 */
function emit(level: 'info' | 'warn' | 'error', message: string): string {
  const lines: string[] = [];
  const logger = createLogger({ level: 'debug', write: (line) => lines.push(line) });
  logger[level](message);
  return lines[0] ?? '';
}

describe('readLogLine', () => {
  it('undoes each of the logger prefixes', () => {
    expect(readLogLine(emit('info', 'opening https://acme.com'))).toEqual({
      level: 'info',
      text: 'opening https://acme.com',
    });
    expect(readLogLine(emit('warn', 'careful')).level).toBe('warn');
    expect(readLogLine(emit('error', 'broken')).level).toBe('error');
  });
});

describe('readProgress', () => {
  it('reads the run id and directory the session announces', () => {
    const signal = readProgress(emit('info', 'run 20260812T160000Z-a1b2c3 → ui-atlas-output/default/run'));
    expect(signal).toEqual({
      kind: 'run-started',
      runId: '20260812T160000Z-a1b2c3',
      runDir: 'ui-atlas-output/default/run',
    });
  });

  it('separates opening the page from the panel reporting in', () => {
    expect(readProgress(emit('info', 'opening https://acme.com/pricing'))).toEqual({
      kind: 'opening',
      url: 'https://acme.com/pricing',
    });
    expect(
      readProgress(emit('info', 'inspector ready — Alt+I toggles inspect mode, Alt+C captures the selection')),
    ).toEqual({ kind: 'panel-ready' });
  });

  it('treats a missing overlay as its own signal, not as a failure', () => {
    const signal = readProgress(
      emit('warn', 'the inspector overlay did not report in; the page may block script injection'),
    );
    expect(signal).toEqual({ kind: 'panel-missing' });
  });

  it('reads the three sign-in verdicts the CLI can print', () => {
    expect(
      readProgress(emit('warn', 'the saved sign-in "acme" (profile) looks signed out: redirected to /login')),
    ).toEqual({ kind: 'signed-out', evidence: 'redirected to /login' });

    expect(readProgress(emit('info', 'sign-in check for "acme" (profile): signed in'))).toEqual({
      kind: 'signed-in',
    });

    expect(
      readProgress(emit('info', 'sign-in check for "acme" (profile): unclear — no way in and no way out')),
    ).toEqual({ kind: 'sign-in-unclear', evidence: 'no way in and no way out' });
  });

  it('reads a challenge as a challenge and not as being signed out', () => {
    const signal = readProgress(
      emit('error', 'acme.com is serving a challenge page instead of the site: #challenge-form is present'),
    );
    expect(signal).toEqual({
      kind: 'challenged',
      host: 'acme.com',
      evidence: '#challenge-form is present',
    });
  });

  it('reads a failed navigation and a structured error', () => {
    expect(readProgress(emit('error', 'navigation failed: net::ERR_CONNECTION_REFUSED'))).toEqual({
      kind: 'navigation-failed',
      message: 'net::ERR_CONNECTION_REFUSED',
    });
    expect(readProgress(emit('error', 'config.invalid: inspect needs a URL'))).toEqual({
      kind: 'fatal',
      message: 'config.invalid: inspect needs a URL',
    });
  });

  it('ignores an error code quoted at info level, which is help text and not a failure', () => {
    expect(readProgress(emit('info', 'config.invalid: is what you would see'))).toBeUndefined();
  });

  it('returns nothing for lines it has no use for', () => {
    expect(readProgress(emit('info', 'artifacts: /tmp/run'))).toBeUndefined();
    expect(readProgress('')).toBeUndefined();
  });
});

describe('createLineSplitter', () => {
  it('rejoins a line that arrived in two chunks', () => {
    const seen: string[] = [];
    const push = createLineSplitter((line) => seen.push(line));
    push('run 2026');
    push('0812-a1 → out\nopening https://a\n');
    expect(seen).toEqual(['run 20260812-a1 → out', 'opening https://a']);
  });

  it('holds back a partial tail rather than emitting half a line', () => {
    const seen: string[] = [];
    const push = createLineSplitter((line) => seen.push(line));
    push('inspector ');
    expect(seen).toEqual([]);
  });
});
