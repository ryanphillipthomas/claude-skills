import { describe, expect, it, vi } from 'vitest';
import { CaptureQueue } from '@ui-atlas/capture';
import { Deadline, TIMED_OUT, withTimeout } from '@ui-atlas/settle';
import { createBridgeHandler } from '@ui-atlas/overlay';
import { PROTOCOL_VERSION, type QueueJob } from '@ui-atlas/protocol';
import { flagBoolean, flagNumber, flagString, parseArgs, requireHttpUrl } from '../../apps/cli/src/args.js';
import { createLogger, redact } from '../../apps/cli/src/logger.js';
import { summariseCaptures } from '../../apps/cli/src/commands/report.js';
import { matchesCombo } from '../../packages/overlay/src/page/shortcuts.js';

describe('Deadline', () => {
  it('shrinks each step budget to what is left', () => {
    let now = 1_000;
    const deadline = new Deadline(500, () => now);
    expect(deadline.budgetFor(300)).toBe(300);
    now = 1_400;
    expect(deadline.budgetFor(300)).toBe(100);
    now = 1_600;
    expect(deadline.budgetFor(300)).toBe(0);
    expect(deadline.expired()).toBe(true);
  });
});

describe('withTimeout', () => {
  it('returns the value when work finishes first', async () => {
    await expect(withTimeout(Promise.resolve('done'), 1_000)).resolves.toBe('done');
  });

  it('reports a timeout instead of throwing', async () => {
    const never = new Promise<string>(() => undefined);
    await expect(withTimeout(never, 20)).resolves.toBe(TIMED_OUT);
  });

  it('treats a zero budget as already expired', async () => {
    await expect(withTimeout(Promise.resolve('x'), 0)).resolves.toBe(TIMED_OUT);
  });
});

describe('CaptureQueue', () => {
  it('runs jobs one at a time, in order', async () => {
    const events: string[] = [];
    const queue = new CaptureQueue();
    for (const name of ['a', 'b', 'c']) {
      queue.enqueue({
        kind: 'viewport',
        states: ['default'],
        label: name,
        run: async () => {
          events.push(`start:${name}`);
          await new Promise((resolve) => setTimeout(resolve, 5));
          events.push(`end:${name}`);
          return { captureIds: [name], warnings: [] };
        },
      });
    }
    await queue.drain();
    expect(events).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);
    expect(queue.list().map((job) => job.status)).toEqual(['done', 'done', 'done']);
  });

  it('isolates a failing job from the rest of the queue', async () => {
    const queue = new CaptureQueue();
    queue.enqueue({
      kind: 'element',
      states: ['default'],
      label: 'bad',
      run: async () => {
        throw new Error('capture exploded');
      },
    });
    const good = queue.enqueue({
      kind: 'element',
      states: ['default'],
      label: 'good',
      run: async () => ({ captureIds: ['ok'], warnings: [] }),
    });
    await queue.drain();
    const jobs = queue.list();
    expect(jobs[0]?.status).toBe('failed');
    expect(jobs[0]?.error?.message).toBe('capture exploded');
    expect(queue.get(good.id)?.status).toBe('done');
  });

  it('emits an update for every status change', async () => {
    const updates: QueueJob[] = [];
    const queue = new CaptureQueue((job) => updates.push(job));
    queue.enqueue({
      kind: 'viewport',
      states: ['default'],
      label: 'x',
      run: async (report) => {
        report('half way');
        return { captureIds: [], warnings: [] };
      },
    });
    await queue.drain();
    expect(updates.map((job) => job.status)).toEqual(['queued', 'running', 'running', 'done']);
    expect(updates.some((job) => job.progress === 'half way')).toBe(true);
  });

  it('survives a listener that throws', async () => {
    const queue = new CaptureQueue(() => {
      throw new Error('listener blew up');
    });
    queue.enqueue({
      kind: 'viewport',
      states: ['default'],
      label: 'x',
      run: async () => ({ captureIds: ['a'], warnings: [] }),
    });
    await queue.drain();
    expect(queue.list()[0]?.status).toBe('done');
  });
});

describe('bridge server', () => {
  const source = { page: {}, frame: {} } as never;

  it('rejects a message without the session token', async () => {
    const dispatch = createBridgeHandler('correct-token-value', {
      'queue/list': async () => ({ jobs: [] }),
    });
    const response = await dispatch(source, {
      v: PROTOCOL_VERSION,
      token: 'wrong-token-value',
      id: '1',
      method: 'queue/list',
      params: {},
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.message).toBe('invalid session token');
  });

  it('rejects a malformed envelope', async () => {
    const dispatch = createBridgeHandler('correct-token-value', {});
    const response = await dispatch(source, { hello: 'there' });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('protocol.invalid-message');
  });

  it('rejects an unknown method', async () => {
    const dispatch = createBridgeHandler('correct-token-value', {});
    const response = await dispatch(source, {
      v: PROTOCOL_VERSION,
      token: 'correct-token-value',
      id: '1',
      method: 'read/file',
      params: { path: '/etc/passwd' },
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.code).toBe('protocol.unknown-method');
  });

  it('rejects params that do not match the method schema', async () => {
    const dispatch = createBridgeHandler('correct-token-value', {
      'viewport/set': async () => ({ viewport: {} as never }),
    });
    const response = await dispatch(source, {
      v: PROTOCOL_VERSION,
      token: 'correct-token-value',
      id: '1',
      method: 'viewport/set',
      params: { width: 5, height: 999_999 },
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.message).toContain('invalid params');
  });

  it('passes validated params through to the handler', async () => {
    const handler = vi.fn(async () => ({ jobs: [] }));
    const dispatch = createBridgeHandler('correct-token-value', { 'queue/list': handler });
    const response = await dispatch(source, {
      v: PROTOCOL_VERSION,
      token: 'correct-token-value',
      id: 'abc',
      method: 'queue/list',
      params: {},
    });
    expect(response.ok).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('turns a handler failure into a structured error, not a crash', async () => {
    const dispatch = createBridgeHandler('correct-token-value', {
      'queue/list': async () => {
        throw new Error('handler failed');
      },
    });
    const response = await dispatch(source, {
      v: PROTOCOL_VERSION,
      token: 'correct-token-value',
      id: '1',
      method: 'queue/list',
      params: {},
    });
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.message).toBe('handler failed');
  });
});

describe('CLI argument parsing', () => {
  it('separates positionals from flags', () => {
    const args = parseArgs(['inspect', 'https://example.com', '--project', 'demo', '--headless']);
    expect(args.positionals).toEqual(['inspect', 'https://example.com']);
    expect(flagString(args, 'project')).toBe('demo');
    expect(flagBoolean(args, 'headless')).toBe(true);
  });

  it('supports --flag=value and --no-flag', () => {
    const args = parseArgs(['capture', 'https://x.test', '--width=800', '--no-headless']);
    expect(flagNumber(args, 'width')).toBe(800);
    expect(flagBoolean(args, 'headless')).toBe(false);
  });

  it('rejects a numeric flag that is not a number', () => {
    const args = parseArgs(['capture', '--width', 'wide']);
    expect(() => flagNumber(args, 'width')).toThrow(/expects a number/);
  });

  it('only accepts http(s) URLs', () => {
    expect(requireHttpUrl('https://example.com/x')).toBe('https://example.com/x');
    expect(() => requireHttpUrl('file:///etc/passwd')).toThrow(/must be http or https/);
    expect(() => requireHttpUrl('javascript:alert(1)')).toThrow(/must be http or https/);
    expect(() => requireHttpUrl('nonsense')).toThrow(/not a valid URL/);
  });
});

describe('logging', () => {
  it('redacts auth headers and secret fields', () => {
    const redacted = redact({
      Authorization: 'Bearer abc',
      cookie: 'session=1',
      nested: { password: 'hunter2', keep: 'visible' },
    }) as Record<string, unknown>;
    expect(redacted['Authorization']).toBe('[redacted]');
    expect(redacted['cookie']).toBe('[redacted]');
    expect((redacted['nested'] as Record<string, unknown>)['password']).toBe('[redacted]');
    expect((redacted['nested'] as Record<string, unknown>)['keep']).toBe('visible');
  });

  it('never prints below the configured level', () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'warn', write: (line) => lines.push(line) });
    logger.info('quiet');
    logger.warn('loud');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('loud');
  });

  it('redacts detail objects it prints', () => {
    const lines: string[] = [];
    const logger = createLogger({ level: 'debug', write: (line) => lines.push(line) });
    logger.info('request', { headers: { cookie: 'session=secret' } });
    expect(lines[0]).not.toContain('session=secret');
    expect(lines[0]).toContain('[redacted]');
  });
});

describe('shortcut matching', () => {
  const event = (init: Partial<KeyboardEvent>): KeyboardEvent =>
    ({ altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, key: '', code: '', ...init }) as KeyboardEvent;

  it('matches a letter by physical code, as Alt rewrites key on macOS', () => {
    expect(matchesCombo(event({ altKey: true, code: 'KeyI', key: 'ˆ' }), 'Alt+I')).toBe(true);
    expect(matchesCombo(event({ altKey: true, code: 'KeyC', key: 'ç' }), 'Alt+C')).toBe(true);
  });

  it('requires the exact modifier set', () => {
    expect(matchesCombo(event({ altKey: true, shiftKey: true, code: 'KeyI' }), 'Alt+I')).toBe(false);
    expect(matchesCombo(event({ code: 'KeyI', key: 'i' }), 'Alt+I')).toBe(false);
  });

  it('matches named keys by key', () => {
    expect(matchesCombo(event({ key: 'Escape' }), 'Escape')).toBe(true);
    expect(matchesCombo(event({ key: 'ArrowUp' }), 'ArrowUp')).toBe(true);
    expect(matchesCombo(event({ key: 'ArrowDown' }), 'ArrowUp')).toBe(false);
  });
});

describe('run summary', () => {
  it('groups states, provenance, failures and duplicate images', () => {
    const base = {
      schemaVersion: 1 as const,
      runId: 'r',
      project: 'p',
      sourceUrl: 'http://x/',
      finalUrl: 'http://x/',
      routeKey: 'x-root',
      capturedAt: '2026-01-01T00:00:00.000Z',
      kind: 'element' as const,
      viewport: {
        width: 100,
        height: 100,
        deviceScaleFactor: 1,
        mobile: false,
        hasTouch: false,
        userAgentClass: 'desktop' as const,
      },
      readiness: {
        startedAt: '2026-01-01T00:00:00.000Z',
        durationMs: 1,
        deadlineMs: 1,
        deadlineExceeded: false,
        checks: [],
        warnings: [],
      },
      durationMs: 1,
      warnings: [],
    };
    const image = (sha: string) => ({ relativePath: `${sha}.png`, sha256: sha.padEnd(64, '0'), width: 1, height: 1, byteLength: 1 });

    const summary = summariseCaptures([
      { ...base, id: '1', status: 'captured', state: { name: 'default', provenance: 'observed', verified: true }, image: image('aa') },
      { ...base, id: '2', status: 'captured', state: { name: 'hover', provenance: 'interacted', verified: true }, image: image('aa') },
      {
        ...base,
        id: '3',
        status: 'failed',
        state: { name: 'focus', provenance: 'interacted', verified: false },
        error: { code: 'locator.not-found', message: 'gone' },
      },
    ]);

    expect(summary.byState).toEqual({ default: 1, hover: 1, focus: 1 });
    expect(summary.byProvenance).toEqual({ observed: 1, interacted: 2 });
    expect(summary.failures).toHaveLength(1);
    expect(summary.duplicateGroups).toHaveLength(1);
    expect(summary.duplicateGroups[0]?.captures).toEqual(['1', '2']);
  });
});
