import { describe, expect, it } from 'vitest';
import {
  FLOW_INSTRUCTIONS,
  FLOW_TOTAL,
  nextStep,
  pageLabelFrom,
  type FlowInput,
} from '../../packages/overlay/src/page/flow.js';

function flow(overrides: Partial<FlowInput> = {}): ReturnType<typeof nextStep> {
  return nextStep({
    connected: true,
    inspecting: false,
    hasSelection: false,
    states: ['default'],
    capturedHere: 0,
    workingJobs: 0,
    pageLabel: '/pricing',
    runTotal: 0,
    reviewed: false,
    ...overrides,
  });
}

describe('nextStep', () => {
  it('says nothing can be captured before the session connects', () => {
    const advice = flow({ connected: false });
    expect(advice.step).toBe('connect');
    expect(advice.position).toBe(0);
  });

  it('walks inspect → select → capture as the user gets further', () => {
    expect(flow().step).toBe('inspect');
    expect(flow({ inspecting: true }).step).toBe('select');
    expect(flow({ inspecting: true, hasSelection: true }).step).toBe('capture');
  });

  it('numbers the steps consistently and never past the total', () => {
    const steps = [
      flow(),
      flow({ inspecting: true }),
      flow({ inspecting: true, hasSelection: true }),
      flow({ inspecting: true, hasSelection: true, capturedHere: 2 }),
      flow({ inspecting: true, hasSelection: true, capturedHere: 2, reviewed: true }),
    ];
    expect(steps.map((advice) => advice.position)).toEqual([1, 2, 3, 4, 5]);
    for (const advice of steps) expect(advice.position).toBeLessThanOrEqual(advice.total);
    expect(steps[0]?.total).toBe(FLOW_TOTAL);
  });

  it('names the states it is about to capture, so Capture is never a surprise', () => {
    const advice = flow({ inspecting: true, hasSelection: true, states: ['default', 'hover'] });
    expect(advice.text).toContain('default, hover');
  });

  it('reports progress rather than instructions while the queue is busy', () => {
    const advice = flow({ inspecting: true, hasSelection: true, workingJobs: 3 });
    expect(advice.step).toBe('working');
    expect(advice.text).toContain('3 jobs');
  });

  it('sends you to review once something has been captured here', () => {
    const advice = flow({ inspecting: true, hasSelection: true, capturedHere: 4 });
    expect(advice.step).toBe('review');
    expect(advice.position).toBe(4);
    expect(advice.text).toContain('4 captures so far on /pricing');
    expect(advice.text).toContain('Output tab');
  });

  it('only reaches the last step once the output has actually been looked at', () => {
    const advice = flow({
      inspecting: true,
      hasSelection: true,
      capturedHere: 4,
      runTotal: 11,
      reviewed: true,
    });
    expect(advice.step).toBe('finish');
    expect(advice.position).toBe(5);
    // The run total, not the page total: by now the question is "where is all
    // of this?", not "what did I get on this page?".
    expect(advice.text).toContain('11 captures so far in this run');
    expect(advice.text).toContain('Open folder');
  });

  it('counts one capture in the singular', () => {
    const advice = flow({ inspecting: true, hasSelection: true, capturedHere: 1 });
    expect(advice.text).toContain('1 capture so far');
  });

  it('keeps asking for a selection even after captures, when there is none', () => {
    const advice = flow({ inspecting: true, hasSelection: false, capturedHere: 4 });
    expect(advice.step).toBe('select');
  });
});

describe('FLOW_INSTRUCTIONS', () => {
  it('has one numbered instruction per step, in order', () => {
    expect(FLOW_INSTRUCTIONS).toHaveLength(FLOW_TOTAL);
    expect(FLOW_INSTRUCTIONS.map((item) => item.step)).toEqual([1, 2, 3, 4, 5]);
  });

  it('has an instruction for every position nextStep can point at', () => {
    const positions = new Set(
      [
        flow(),
        flow({ inspecting: true }),
        flow({ inspecting: true, hasSelection: true }),
        flow({ inspecting: true, hasSelection: true, capturedHere: 2 }),
        flow({ inspecting: true, hasSelection: true, capturedHere: 2, reviewed: true }),
        flow({ inspecting: true, hasSelection: true, workingJobs: 1 }),
      ].map((advice) => advice.position),
    );
    for (const position of positions) {
      expect(FLOW_INSTRUCTIONS.some((item) => item.step === position)).toBe(true);
    }
  });
});

describe('pageLabelFrom', () => {
  it('reduces a URL to the path a person would say out loud', () => {
    expect(pageLabelFrom('http://127.0.0.1:4173/pricing?plan=pro')).toBe('/pricing');
    expect(pageLabelFrom('http://127.0.0.1:4173/')).toBe('/');
  });

  it('falls back to the raw value rather than throwing', () => {
    expect(pageLabelFrom('not a url')).toBe('not a url');
  });
});
