import { describe, expect, it } from 'vitest';
import type { QueueJob, StateName } from '../../packages/protocol/src/index.js';
import {
  CaptureProgressMachine,
  parseJobProgress,
} from '../../packages/overlay/src/page/capture-progress.js';

/**
 * The panel never sees a capture happen; it sees `queue/update` events. So the
 * tests are those events and nothing else — no browser, no timers, no DOM.
 */
function job(overrides: Partial<QueueJob> = {}): QueueJob {
  return {
    id: 'job-1',
    createdAt: '2026-08-12T00:00:00.000Z',
    kind: 'element',
    states: ['default', 'hover', 'focus'] as StateName[],
    label: 'element · default, hover, focus',
    status: 'queued',
    captureIds: [],
    warnings: [],
    fileNames: [],
    ...overrides,
  };
}

/** The queue reports one of these immediately before it photographs a state. */
function working(index: number, state: string, captured = index - 1): QueueJob {
  return job({
    status: 'running',
    progress: `${state} (${String(index)}/3)`,
    captureIds: Array.from({ length: captured }, (_, i) => `cap-${String(i)}`),
  });
}

describe('parseJobProgress', () => {
  it('reads the state and its place in the job', () => {
    expect(parseJobProgress('hover (2/3)')).toEqual({ state: 'hover', index: 2, total: 3 });
  });

  it('returns nothing for a string that is not per-state progress', () => {
    expect(parseJobProgress(undefined)).toBeUndefined();
    expect(parseJobProgress('working')).toBeUndefined();
  });
});

describe('CaptureProgressMachine', () => {
  it('walks idle → capturing → complete → idle', () => {
    const machine = new CaptureProgressMachine();
    expect(machine.view.phase).toBe('idle');

    machine.apply(job({ status: 'queued' }));
    expect(machine.view.phase).toBe('capturing');

    machine.apply(working(1, 'default'));
    expect(machine.view.phase).toBe('capturing');

    const finished = machine.apply(
      job({ status: 'done', captureIds: ['a', 'b', 'c'] }),
    );
    expect(finished.runFinished).toBe(true);
    expect(finished.view.phase).toBe('complete');
    expect(finished.view.captured).toBe(3);

    // The terminal state is a pause, never a resting place.
    expect(machine.releaseComplete().phase).toBe('idle');
  });

  it('goes to error when a job is lost, and still leaves the terminal state', () => {
    const machine = new CaptureProgressMachine();
    machine.apply(job({ status: 'running', progress: 'default (1/3)' }));

    const failed = machine.apply(
      job({
        status: 'failed',
        captureIds: ['a'],
        error: { code: 'capture.failed', message: 'the element went away' },
      }),
    );
    expect(failed.view.phase).toBe('error');
    expect(failed.view.failed).toBe(2);
    expect(failed.view.announcement).toBe('2 shots failed');
    expect(machine.releaseComplete().phase).toBe('idle');
  });

  it('fills the hairline across the whole run, not per job', () => {
    const machine = new CaptureProgressMachine();
    const first = job({ id: 'a', states: ['default', 'hover', 'focus'] as StateName[] });
    const second = job({ id: 'b', states: ['default', 'hover', 'focus'] as StateName[] });

    machine.apply({ ...first, status: 'running', progress: 'default (1/3)' });
    machine.apply({ ...second, status: 'queued' });
    // Six shots are pending, none finished.
    expect(machine.view.total).toBe(6);
    expect(machine.view.progress).toBe(0);

    machine.apply({ ...first, status: 'done', captureIds: ['1', '2', '3'] });
    // Half the run, though one of its two jobs is entirely finished.
    expect(machine.view.progress).toBeCloseTo(0.5);
    expect(machine.view.phase).toBe('capturing');

    machine.apply({ ...second, status: 'done', captureIds: ['4', '5', '6'] });
    expect(machine.view.progress).toBe(1);
    expect(machine.view.phase).toBe('complete');
    expect(machine.view.announcement).toBe('6 shots captured');
  });

  it('reports a shot starting once, and counts it across the run', () => {
    const machine = new CaptureProgressMachine();
    const first = machine.apply(working(1, 'default'));
    expect(first.startedShot?.state).toBe('default');
    expect(first.startedShot?.position).toBe(1);

    // The same update arriving twice is not a second shutter.
    expect(machine.apply(working(1, 'default')).startedShot).toBeUndefined();

    const second = machine.apply(working(2, 'hover'));
    expect(second.startedShot).toEqual({
      jobId: 'job-1',
      state: 'hover',
      position: 2,
      total: 3,
    });
    expect(second.view.announcement).toBe('Capturing hover, 2 of 3');
    expect(second.view.active).toEqual(['hover']);
  });

  it('announces the row it just added, so the list is never silent', () => {
    const machine = new CaptureProgressMachine();
    const first = job({ id: 'a', label: 'element · hover' });
    const second = job({ id: 'b', label: 'element · focus' });
    machine.apply({ ...first, status: 'running', progress: 'hover (1/3)' });
    machine.apply({ ...second, status: 'queued' });

    const done = machine.apply({ ...first, status: 'done', captureIds: ['a', 'b', 'c'] });
    expect(done.completedJobs).toHaveLength(1);
    expect(done.view.announcement).toBe('Captured element · hover');

    // Re-delivery of a finished job does not insert the row a second time.
    expect(
      machine.apply({ ...first, status: 'done', captureIds: ['a', 'b', 'c'] }).completedJobs,
    ).toHaveLength(0);

    // The run summary supersedes the last row: one announcement, not two.
    const last = machine.apply({ ...second, status: 'done', captureIds: ['d', 'e', 'f'] });
    expect(last.completedJobs).toHaveLength(1);
    expect(last.view.announcement).toBe('6 shots captured');
  });

  it('starts a fresh run rather than adding to the finished one', () => {
    const machine = new CaptureProgressMachine();
    machine.apply(job({ id: 'a', states: ['default'] as StateName[], status: 'running', progress: 'default (1/1)' }));
    machine.apply(job({ id: 'a', states: ['default'] as StateName[], status: 'done', captureIds: ['1'] }));
    expect(machine.view.phase).toBe('complete');

    // A capture pressed during the two-second hold opens a new run.
    machine.apply(job({ id: 'b', states: ['hover'] as StateName[], status: 'queued' }));
    expect(machine.view.phase).toBe('capturing');
    expect(machine.view.total).toBe(1);
    expect(machine.view.progress).toBe(0);
    expect(machine.view.captured).toBe(0);
  });

  it('does not strand the bar on a cancelled job', () => {
    const machine = new CaptureProgressMachine();
    machine.apply(job({ status: 'running', progress: 'default (1/3)' }));
    const cancelled = machine.apply(job({ status: 'cancelled', captureIds: ['a'] }));

    expect(cancelled.view.progress).toBe(1);
    // Cancelled is not failure: the control says what was captured, not what broke.
    expect(cancelled.view.phase).toBe('complete');
  });

  it('holds no active state once the run is over', () => {
    const machine = new CaptureProgressMachine();
    machine.apply(working(2, 'hover'));
    expect(machine.view.active).toEqual(['hover']);

    machine.apply(job({ status: 'done', captureIds: ['a', 'b', 'c'] }));
    expect(machine.view.active).toEqual([]);
    expect(machine.view.position).toBe(0);
  });
});
