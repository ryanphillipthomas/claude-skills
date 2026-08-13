import { describe, expect, it } from 'vitest';
import { planDesignExport, type ProjectCapture } from '@ui-atlas/artifacts';
import {
  SCHEMA_VERSION,
  type CaptureKind,
  type CaptureRecord,
  type ElementIdentity,
  type StateName,
  type Viewport,
} from '@ui-atlas/protocol';

const DESKTOP: Viewport = {
  name: 'desktop',
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
  hasTouch: false,
  userAgentClass: 'desktop',
};

const MOBILE: Viewport = {
  name: 'mobile-sm',
  width: 375,
  height: 812,
  deviceScaleFactor: 2,
  mobile: true,
  hasTouch: true,
  userAgentClass: 'mobile',
};

function element(role: string, accessibleName?: string): ElementIdentity {
  return {
    tagName: 'BUTTON',
    role,
    ...(accessibleName === undefined ? {} : { accessibleName }),
    framePath: [],
    candidates: [],
    chosenLocator: { type: 'css', value: 'button', specificity: 1 },
    structuralFingerprint: `${role}:${accessibleName ?? ''}`,
    boundingBox: { x: 0, y: 0, width: 100, height: 40 },
  } as unknown as ElementIdentity;
}

let counter = 0;

function capture(input: {
  kind: CaptureKind;
  state?: StateName;
  url?: string;
  viewport?: Viewport;
  element?: ElementIdentity;
  sessionId?: string;
  file?: string | null;
  progress?: number;
}): ProjectCapture {
  counter += 1;
  const sessionId = input.sessionId ?? '20260812T160000Z-aaa111';
  const file = input.file === null ? undefined : (input.file ?? `shot-${String(counter)}.png`);

  const record = {
    schemaVersion: SCHEMA_VERSION,
    id: `cap-${String(counter)}`,
    runId: sessionId,
    project: 'example-com',
    sourceUrl: input.url ?? 'https://example.com/',
    finalUrl: input.url ?? 'https://example.com/',
    routeKey: 'example-com-root',
    capturedAt: '2026-08-12T16:00:00.000Z',
    kind: input.kind,
    status: input.file === null ? 'failed' : 'captured',
    state: { name: input.state ?? 'default', provenance: 'observed', verified: true },
    viewport: input.viewport ?? DESKTOP,
    ...(input.element === undefined ? {} : { element: input.element }),
    ...(input.progress === undefined
      ? {}
      : {
          animation: {
            animationId: 'anim-1',
            progress: input.progress,
            currentTimeMs: 0,
            method: 'web-animations',
            limitations: [],
          },
        }),
    readiness: { settled: true, warnings: [], waitedMs: 0 },
    ...(file === undefined ? {} : { image: { relativePath: file, sha256: 'x', width: 1, height: 1, byteLength: 1 } }),
    ...(input.file === null ? { error: { code: 'capture.failed', message: 'the element vanished' } } : {}),
    durationMs: 1,
    warnings: [],
  } as unknown as CaptureRecord;

  return {
    sessionId,
    projectPath: file === undefined ? '' : `${sessionId}/screenshots/${file}`,
    record,
  };
}

describe('planDesignExport', () => {
  it('reads in design order: pages, then components, then motion', () => {
    const plan = planDesignExport([
      capture({ kind: 'animation-frame', progress: 0.5, element: element('img') }),
      capture({ kind: 'element', element: element('button', 'Save') }),
      capture({ kind: 'viewport' }),
    ]);

    expect(plan.entries.map((entry) => entry.group)).toEqual(['page', 'component', 'motion']);
    expect(plan.entries.map((entry) => entry.index)).toEqual([1, 2, 3]);
    expect(plan.entries[0]?.name.startsWith('01-page-')).toBe(true);
  });

  it('keeps a component and its states together, in matrix order', () => {
    const button = element('button', 'Save changes');
    const plan = planDesignExport([
      capture({ kind: 'element', element: button, state: 'active' }),
      capture({ kind: 'element', element: element('link', 'Cancel') }),
      capture({ kind: 'element', element: button, state: 'hover' }),
      capture({ kind: 'element', element: button }),
      capture({ kind: 'element', element: button, state: 'focus' }),
    ]);

    expect(plan.entries.map((entry) => entry.name)).toEqual([
      '01-component-button-save-changes.png',
      '02-component-button-save-changes-hover.png',
      '03-component-button-save-changes-focus.png',
      '04-component-button-save-changes-active.png',
      '05-component-link-cancel.png',
    ]);
  });

  it('leaves a unique name alone rather than qualifying it', () => {
    const plan = planDesignExport([capture({ kind: 'element', element: element('button', 'Save') })]);
    expect(plan.entries[0]?.name).toBe('01-component-button-save.png');
  });

  it('adds the viewport only where two captures would collide', () => {
    const button = element('button', 'Save');
    const plan = planDesignExport([
      capture({ kind: 'element', element: button, viewport: DESKTOP }),
      capture({ kind: 'element', element: button, viewport: MOBILE }),
      capture({ kind: 'element', element: element('link', 'Docs'), viewport: DESKTOP }),
    ]);

    const names = plan.entries.map((entry) => entry.name);
    expect(names).toContain('01-component-button-save-desktop.png');
    expect(names).toContain('02-component-button-save-mobile-sm.png');
    // The link is unique, so it never grew a qualifier it did not need.
    expect(names).toContain('03-component-link-docs.png');
  });

  it('falls back to the route, then to a counter, and never loses a file', () => {
    const button = element('button', 'Save');
    const plan = planDesignExport([
      capture({ kind: 'element', element: button, url: 'https://example.com/one' }),
      capture({ kind: 'element', element: button, url: 'https://example.com/two' }),
      // Same element, same route, same viewport, same session: genuinely two
      // captures of the same thing.
      capture({ kind: 'element', element: button, url: 'https://example.com/one' }),
    ]);

    const names = plan.entries.map((entry) => entry.name);
    expect(new Set(names).size).toBe(3);
    expect(names.some((name) => name.includes('-one'))).toBe(true);
    expect(names.some((name) => name.includes('-two'))).toBe(true);
  });

  it('names pages after their route and keeps the wide shot first', () => {
    const plan = planDesignExport([
      capture({ kind: 'viewport', url: 'https://example.com/pricing', viewport: MOBILE }),
      capture({ kind: 'viewport', url: 'https://example.com/pricing', viewport: DESKTOP }),
    ]);

    expect(plan.entries.map((entry) => entry.name)).toEqual([
      '01-page-pricing-desktop.png',
      '02-page-pricing-mobile-sm.png',
    ]);
  });

  it('zero-pads a frame so an animation sorts in the order it happens', () => {
    const plan = planDesignExport([
      capture({ kind: 'animation-frame', progress: 1, element: element('img', 'Hero') }),
      capture({ kind: 'animation-frame', progress: 0, element: element('img', 'Hero') }),
      capture({ kind: 'animation-frame', progress: 0.5, element: element('img', 'Hero') }),
    ]);

    expect(plan.entries.map((entry) => entry.name)).toEqual([
      '01-motion-img-hero-frame-000.png',
      '02-motion-img-hero-frame-050.png',
      '03-motion-img-hero-frame-100.png',
    ]);
  });

  it('lists a capture with no file as skipped rather than dropping it', () => {
    const plan = planDesignExport([
      capture({ kind: 'element', element: element('button', 'Save'), file: null }),
      capture({ kind: 'viewport' }),
    ]);

    expect(plan.entries).toHaveLength(1);
    expect(plan.skipped).toHaveLength(1);
    expect(plan.skipped[0]?.reason).toBe('the element vanished');
  });

  it('does not use a state name for default, which is the absence of one', () => {
    const plan = planDesignExport([capture({ kind: 'element', element: element('button', 'Save') })]);
    expect(plan.entries[0]?.name).not.toContain('default');
  });

  it('is empty, not an error, for a project with nothing in it', () => {
    expect(planDesignExport([])).toEqual({ entries: [], skipped: [] });
  });
});
