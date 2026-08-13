import { describe, expect, it } from 'vitest';
import { CaptureQueue } from '../../packages/capture/src/queue.js';
import { ResponsiveRunner } from '../../packages/capture/src/responsive.js';
import { validateConfig } from '../../packages/config/src/index.js';
import type { QueueJob, StateName } from '../../packages/protocol/src/index.js';

/** Enough config for the runner to read its viewport list. */
function testConfig(): ReturnType<typeof validateConfig> {
  return validateConfig({ project: 'fixture' });
}

/** The runner never reaches the writer in these tests; it stops first. */
function fakeWriter(): unknown {
  return {};
}

/**
 * Stop has to mean something. With one job covering every state a user picked,
 * cancelling only what is *queued* would almost always cancel nothing — so the
 * running job is asked to stop between shots, and keeps what it already took.
 */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = () => done();
  });
  return { promise, resolve };
}

const STATES = ['default', 'hover', 'focus'] as StateName[];

describe('CaptureQueue.stop', () => {
  it('cancels the jobs that have not started', async () => {
    const queue = new CaptureQueue();
    const gate = deferred();

    queue.enqueue({
      kind: 'element',
      states: STATES,
      label: 'first',
      run: async () => {
        await gate.promise;
        return { captureIds: ['a'], warnings: [] };
      },
    });
    const second = queue.enqueue({
      kind: 'element',
      states: STATES,
      label: 'second',
      run: async () => ({ captureIds: ['b'], warnings: [] }),
    });

    // Let the first job actually begin before stopping.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const result = queue.stop();
    expect(result.stopped).toBe(1);
    expect(result.stillRunning).toBe(true);
    expect(queue.get(second.id)?.status).toBe('cancelled');

    gate.resolve();
    await queue.drain();
    expect(queue.get(second.id)?.status).toBe('cancelled');
  });

  it('asks the running job to stop, and keeps the shots it already took', async () => {
    const queue = new CaptureQueue();
    const taken: string[] = [];
    const gate = deferred();

    const job = queue.enqueue({
      kind: 'element',
      states: STATES,
      label: 'element · 3 states',
      run: async (report, shouldStop) => {
        for (const state of STATES) {
          if (shouldStop()) break;
          report(`${state} (${String(taken.length + 1)}/3)`);
          taken.push(state);
          if (taken.length === 1) await gate.promise;
        }
        return { captureIds: taken.map((state) => `cap-${state}`), warnings: [] };
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queue.stop().stillRunning).toBe(true);
    gate.resolve();
    await queue.drain();

    // It stopped where it was safe to, and the one file it wrote still counts.
    expect(taken).toEqual(['default']);
    const finished = queue.get(job.id) as QueueJob;
    expect(finished.status).toBe('done');
    expect(finished.captureIds).toEqual(['cap-default']);
  });

  it('does not carry a stop over to the next capture', async () => {
    const queue = new CaptureQueue();
    const gate = deferred();
    queue.enqueue({
      kind: 'element',
      states: ['default'] as StateName[],
      label: 'first',
      run: async (_report, shouldStop) => {
        await gate.promise;
        return { captureIds: shouldStop() ? [] : ['a'], warnings: [] };
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    queue.stop();
    gate.resolve();
    await queue.drain();

    // A capture pressed after a stop must run in full.
    let stoppedForSecond = true;
    const second = queue.enqueue({
      kind: 'element',
      states: ['default'] as StateName[],
      label: 'second',
      run: async (_report, shouldStop) => {
        stoppedForSecond = shouldStop();
        return { captureIds: ['b'], warnings: [] };
      },
    });
    await queue.drain();

    expect(stoppedForSecond).toBe(false);
    expect(queue.get(second.id)?.status).toBe('done');
  });

  it('reports nothing to stop when the queue is idle', () => {
    const queue = new CaptureQueue();
    expect(queue.stop()).toEqual({ stopped: 0, stillRunning: false });
  });

  it('stops a responsive set between viewports, keeping the ones it ran', async () => {
    const runner = new ResponsiveRunner({
      config: testConfig(),
      writer: fakeWriter(),
      runId: 'run-1',
      project: 'fixture',
      createTarget: () => {
        throw new Error('createTarget should never be reached after a stop');
      },
    } as unknown as ConstructorParameters<typeof ResponsiveRunner>[0]);

    // Stopped before the first viewport opens a context: the runner must not
    // even try to create one, because creating it is the expensive part.
    const result = await runner.run({
      url: 'http://127.0.0.1/x',
      kind: 'viewport',
      states: ['default'],
      setId: 'set-1',
      shouldStop: () => true,
    });

    expect(result.records).toHaveLength(0);
    expect(result.warnings.join(' ')).toContain('stopped after 0 of');
  });

  it('passes a job thumbnail through to the update the panel sees', async () => {
    const updates: QueueJob[] = [];
    const queue = new CaptureQueue((job) => updates.push(job));
    queue.enqueue({
      kind: 'element',
      states: ['default'] as StateName[],
      label: 'shot',
      run: async () => ({
        captureIds: ['a'],
        warnings: [],
        thumbnail: 'data:image/png;base64,iVBORw0KGgo=',
      }),
    });
    await queue.drain();

    const done = updates.filter((job) => job.status === 'done');
    expect(done[0]?.thumbnail).toBe('data:image/png;base64,iVBORw0KGgo=');
    // Absent until there is one, never an empty string.
    expect(updates[0]?.thumbnail).toBeUndefined();
  });
});
