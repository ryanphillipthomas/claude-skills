import { describe, expect, it } from 'vitest';
import { buildDesignPrompt, DESIGN_PROMPT_STAGES, type ProjectFacts } from '@ui-atlas/reporter';
import { SCHEMA_VERSION } from '@ui-atlas/protocol';

function facts(overrides: Partial<ProjectFacts> = {}): ProjectFacts {
  return {
    project: 'stripe-com',
    manifest: {
      schemaVersion: SCHEMA_VERSION,
      project: 'stripe-com',
      site: {
        origin: 'https://stripe.com',
        host: 'stripe.com',
        label: 'stripe.com',
        entryUrl: 'https://stripe.com/pricing',
      },
      createdAt: '2026-08-12T16:00:00.000Z',
      updatedAt: '2026-08-12T16:00:00.000Z',
    },
    generatedAt: '2026-08-12T17:00:00.000Z',
    sessions: [],
    totals: { sessions: 2, captured: 9, failed: 0, skipped: 0, files: 9, routes: 2 },
    routes: [
      { path: '/pricing', url: 'https://stripe.com/pricing', title: 'Pricing', captures: 6, sessionIds: ['a'] },
      { path: '/', url: 'https://stripe.com/', title: undefined, captures: 3, sessionIds: ['a'] },
    ],
    viewports: [
      { label: 'desktop', width: 1440, height: 1000, captures: 6, mobile: false },
      { label: 'mobile-sm', width: 375, height: 812, captures: 3, mobile: true },
    ],
    components: [
      {
        key: 'button::Save changes',
        subject: 'button',
        label: 'Save changes',
        states: ['default', 'hover', 'focus'],
        captures: 3,
        routes: ['/pricing'],
        sampleFile: 'a/screenshots/x.png',
      },
    ],
    motion: [],
    tokens: {},
    tokensFrom: undefined,
    exportPlan: {
      entries: [
        {
          source: 'a/screenshots/x.png',
          name: '01-page-pricing-desktop.png',
          group: 'page',
          index: 1,
          route: '/pricing',
          description: 'viewport · state: default · 1440×1000',
          sessionId: 'a',
        },
      ],
      skipped: [],
    },
    warnings: [],
    contents: {
      project: 'stripe-com',
      paths: {
        outputRoot: '/out',
        projectDir: '/out/stripe-com',
        manifest: '/out/stripe-com/project.json',
        indexHtml: '/out/stripe-com/index.html',
        exportsDir: '/out/stripe-com/exports',
      },
      manifest: undefined,
      sessions: [],
      captures: [],
      unreadableSessions: [],
      unreadableRecords: 0,
    },
    ...overrides,
  } as ProjectFacts;
}

describe('buildDesignPrompt', () => {
  it('runs the stages in order, starting with foundations and refining after', () => {
    const prompt = buildDesignPrompt(facts());
    const ids = prompt.stages.map((stage) => stage.id);
    expect(ids[0]).toBe('foundations');
    expect(ids.indexOf('refinement')).toBeGreaterThan(ids.indexOf('components'));
    expect(ids).toContain('assembly');
  });

  it('leaves out a stage the project has nothing for, and says it did', () => {
    const prompt = buildDesignPrompt(facts());
    expect(prompt.stages.map((stage) => stage.id)).not.toContain('motion');
    expect(prompt.omitted.map((stage) => stage.id)).toContain('motion');
  });

  it('includes the motion stage once something has actually moved', () => {
    const prompt = buildDesignPrompt(
      facts({ motion: [{ name: 'fade-in', kind: 'frames', route: '/pricing', frames: 5, durationMs: 300 }] }),
    );
    const motion = prompt.stages.find((stage) => stage.id === 'motion');
    expect(motion?.text).toContain('fade-in');
    expect(motion?.text).toContain('5 sampled frames');
  });

  it('describes only what was captured', () => {
    const text = buildDesignPrompt(facts()).stages[0]?.text ?? '';
    expect(text).toContain('stripe.com');
    expect(text).toContain('1 reference image');
    expect(text).toContain('2 sessions');
  });

  it('says plainly when no style scan has run, rather than going quiet', () => {
    const text = buildDesignPrompt(facts()).stages[0]?.text ?? '';
    expect(text).toContain('No style scan has been run');
    expect(text).toContain('say when you are estimating');
  });

  it('puts the observed values in with their counts, and calls them observations', () => {
    const text =
      buildDesignPrompt(
        facts({
          tokens: {
            color: [{ value: '#2563eb', count: 34, properties: ['color'] }],
            spacing: [{ value: '8px', count: 120, properties: ['padding'] }],
          },
        }),
      ).stages[0]?.text ?? '';

    expect(text).toContain('`#2563eb` (34)');
    expect(text).toContain('`8px` (120)');
    expect(text).toContain('Observations, not decisions');
    expect(text).not.toContain('No style scan has been run');
  });

  it('lists each component with exactly the states that were captured', () => {
    const text = buildDesignPrompt(facts()).stages.find((s) => s.id === 'components')?.text ?? '';
    expect(text).toContain('button “Save changes”');
    expect(text).toContain('states: default, hover, focus');
    expect(text).toContain('Do not add states that are not listed');
  });

  it('asks for Apple-grade precision in the refinement stage', () => {
    const stage = buildDesignPrompt(facts()).stages.find((s) => s.id === 'refinement');
    expect(stage?.title).toContain('Apple precision');
    expect(stage?.text).toContain('optically');
    expect(stage?.text).toContain('device pixel');
    expect(stage?.text).toContain('4.5:1');
  });

  it('lists only the widths captured, and says the rest is interpolation', () => {
    const text = buildDesignPrompt(facts()).stages.find((s) => s.id === 'assembly')?.text ?? '';
    expect(text).toContain('desktop');
    expect(text).toContain('mobile-sm');
    expect(text).toContain('(device emulation)');
    expect(text).toContain('interpolation');
  });

  it('joins the stages into one copyable block', () => {
    const prompt = buildDesignPrompt(facts());
    for (const stage of prompt.stages) expect(prompt.combined).toContain(stage.text);
  });

  it('produces something for a project with nothing in it', () => {
    const empty = buildDesignPrompt(
      facts({
        components: [],
        routes: [],
        viewports: [],
        totals: { sessions: 0, captured: 0, failed: 0, skipped: 0, files: 0, routes: 0 },
        exportPlan: { entries: [], skipped: [] },
      }),
    );
    expect(empty.stages.map((stage) => stage.id)).toEqual(['foundations', 'refinement']);
    expect(empty.stages[0]?.text).toContain('0 reference images');
  });

  it('every shipped stage has an id, a title and an intent', () => {
    for (const stage of DESIGN_PROMPT_STAGES) {
      expect(stage.id).toMatch(/^[a-z-]+$/);
      expect(stage.title.length).toBeGreaterThan(0);
      expect(stage.intent.length).toBeGreaterThan(0);
    }
    // Ids are the page's anchors and the `--prompt <stage>` argument, so a
    // duplicate would make one of them unreachable.
    const ids = DESIGN_PROMPT_STAGES.map((stage) => stage.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
