import type { StateName } from '@ui-atlas/protocol';

/**
 * Where the user is in the one sequence this tool has: turn on inspect, pick an
 * element, capture it. Three steps, and then a fourth thing that is not a step
 * but a rhythm — keep going, on this page or the next.
 */
export type FlowStep =
  | 'connect'
  | 'inspect'
  | 'select'
  | 'capture'
  | 'working'
  | 'review'
  | 'finish';

/**
 * Five, not three. The first version stopped at "capture", which is where the
 * *tool's* job ends and where the user's job very much does not: they still
 * have to see what they got and find it on disk. A flow that ends at the
 * moment of least information is not a flow.
 */
export const FLOW_TOTAL = 5;

export interface FlowInput {
  /** The host has answered `hello`; before that nothing can be captured. */
  connected: boolean;
  inspecting: boolean;
  hasSelection: boolean;
  states: StateName[];
  /** Captures written for the page the browser is on right now. */
  capturedHere: number;
  /** Jobs queued or running, from the queue the toolbar already renders. */
  workingJobs: number;
  /** Human label for the current page, e.g. `/pricing`. */
  pageLabel: string;
  /** Captures written across the whole run, not just this page. */
  runTotal: number;
  /** The user has opened the Output section at least once. */
  reviewed: boolean;
}

export interface FlowAdvice {
  step: FlowStep;
  /** 1-based position among the three steps; 0 while there is nothing to do. */
  position: number;
  total: number;
  /** What to do next, in one sentence, addressed to the person reading it. */
  text: string;
}

/**
 * Pure so the sentence the panel shows can be tested without a browser — and
 * so there is exactly one place where "what now?" is decided, rather than a
 * condition scattered across four render methods.
 */
export function nextStep(input: FlowInput): FlowAdvice {
  if (!input.connected) {
    return {
      step: 'connect',
      position: 0,
      total: FLOW_TOTAL,
      text: 'Waiting for the UI Atlas session. Nothing is being captured yet.',
    };
  }

  // Progress beats instruction: while the queue is busy, saying what is
  // happening is more useful than repeating what to do next.
  if (input.workingJobs > 0) {
    return {
      step: 'working',
      position: FLOW_TOTAL,
      total: FLOW_TOTAL,
      text:
        input.workingJobs === 1
          ? 'Capturing… the file lands in this run when it finishes.'
          : `Capturing ${String(input.workingJobs)} jobs… files land in this run as they finish.`,
    };
  }

  if (!input.hasSelection) {
    return input.inspecting
      ? {
          step: 'select',
          position: 2,
          total: FLOW_TOTAL,
          text: 'Click the element you want. Parent and child buttons widen or narrow it afterwards.',
        }
      : {
          step: 'inspect',
          position: 1,
          total: FLOW_TOTAL,
          text: 'Press Inspect, then move the pointer over the page to find something to capture.',
        };
  }

  if (input.capturedHere > 0) {
    // Step 4 is review: the files exist, and the useful next move is to look at
    // what actually came out before capturing thirty more of the same mistake.
    if (!input.reviewed) {
      return {
        step: 'review',
        position: 4,
        total: FLOW_TOTAL,
        text:
          `${countCaptures(input.capturedHere)} on ${input.pageLabel}. ` +
          'Open the Output tab to see what was written, and what each file is called.',
      };
    }

    // Step 5 is the one thing the panel could never answer before: where did it
    // all go? "Open folder" is the answer, and it is a button.
    return {
      step: 'finish',
      position: FLOW_TOTAL,
      total: FLOW_TOTAL,
      text:
        `${countCaptures(input.runTotal)} in this run. Open folder shows them on disk; ` +
        'Open report shows them side by side. Or carry on — the next capture joins the same run.',
    };
  }

  return {
    step: 'capture',
    position: 3,
    total: FLOW_TOTAL,
    text: `Pick the states you want, then press Capture. Right now: ${input.states.join(', ')}.`,
  };
}

function countCaptures(count: number): string {
  return count === 1 ? '1 capture so far' : `${String(count)} captures so far`;
}

/**
 * The short, ordered instructions the panel shows under "How this works". They
 * are numbered to match `nextStep`'s positions, so the highlighted line is
 * always the one the sentence above is talking about.
 */
export const FLOW_INSTRUCTIONS: ReadonlyArray<{ step: number; title: string; detail: string }> = [
  {
    step: 1,
    title: 'Inspect',
    detail: 'Turns the pointer into a picker. It highlights what is under it and never clicks the page.',
  },
  {
    step: 2,
    title: 'Select',
    detail:
      'Click to lock onto an element. The panel shows the locator that will find it again, and how ' +
      'many things on the page match it.',
  },
  {
    step: 3,
    title: 'Capture',
    detail:
      'Each state you pick is applied to the live page first, so what you see is what gets ' +
      'photographed.',
  },
  {
    step: 4,
    title: 'Review',
    detail:
      'The Output tab lists what was written and what each file is called — names come ' +
      'from the element itself, like button--save-changes--hover.png.',
  },
  {
    step: 5,
    title: 'Open',
    detail:
      '📁 Folder in the title bar reveals the run on disk from anywhere; Open report builds a ' +
      'page showing every capture side by side. Both print the path in the terminal too.',
  },
];

/** `/pricing`, `/`, or the whole URL when it has no readable path. */
export function pageLabelFrom(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.length > 0 ? parsed.pathname : parsed.href;
  } catch {
    return url;
  }
}
