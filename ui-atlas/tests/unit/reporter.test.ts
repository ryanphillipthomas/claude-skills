import { describe, expect, it } from 'vitest';
import {
  buildReportModel,
  embedJson,
  escapeHtml,
  groupComponents,
  groupDuplicates,
  type ReportCapture,
} from '@ui-atlas/reporter';
import {
  SCHEMA_VERSION,
  type CaptureRecord,
  type RunManifest,
  type Viewport,
} from '@ui-atlas/protocol';

const VIEWPORT: Viewport = {
  name: 'base',
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
  hasTouch: false,
  userAgentClass: 'desktop',
};

const MANIFEST: RunManifest = {
  schemaVersion: SCHEMA_VERSION,
  runId: 'run-1',
  project: 'demo',
  command: 'capture http://x/',
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:00:10.000Z',
  toolVersion: '0.1.0',
  browser: { engine: 'chromium', version: '141.0.0.0', mode: 'clean', headless: true },
  baseViewport: VIEWPORT,
  counts: { captured: 2, failed: 0, skipped: 1, pages: 1 },
  warnings: [],
};

function record(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `cap-${Math.random().toString(16).slice(2, 8)}`,
    runId: 'run-1',
    project: 'demo',
    sourceUrl: 'http://x/page',
    finalUrl: 'http://x/page',
    routeKey: 'x-page',
    capturedAt: '2026-01-01T00:00:01.000Z',
    kind: 'element',
    status: 'captured',
    state: { name: 'default', provenance: 'observed', verified: true },
    viewport: VIEWPORT,
    readiness: {
      startedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 5,
      deadlineMs: 5000,
      deadlineExceeded: false,
      checks: [],
      warnings: [],
    },
    durationMs: 10,
    warnings: [],
    ...overrides,
  };
}

function element(fingerprint: string, name = 'Save'): CaptureRecord['element'] {
  return {
    framePath: [{ depth: 0, url: 'http://x/page', crossOrigin: false }],
    locatorCandidates: [
      {
        type: 'test-id',
        value: 'save',
        attribute: 'data-testid',
        uniquenessCount: 1,
        score: 96,
        reasons: ['authored test attribute'],
      },
    ],
    chosenLocator: {
      type: 'test-id',
      value: 'save',
      attribute: 'data-testid',
      uniquenessCount: 1,
      score: 96,
      reasons: ['authored test attribute'],
    },
    structuralFingerprint: fingerprint,
    tagName: 'button',
    role: 'button',
    accessibleName: name,
    boundingBox: { x: 0, y: 0, width: 100, height: 40 },
  };
}

const image = (sha: string) => ({
  relativePath: `screenshots/x-page/base/${sha}.png`,
  sha256: sha.padEnd(64, '0'),
  width: 100,
  height: 40,
  byteLength: 512,
});

function build(records: CaptureRecord[]) {
  return buildReportModel({
    manifest: MANIFEST,
    captures: records,
    pages: [],
    unreadableRecords: 0,
    generatedAt: '2026-01-01T00:00:11.000Z',
  });
}

describe('escaping', () => {
  it('escapes markup the generator writes itself', () => {
    expect(escapeHtml('<img src=x onerror="go()">')).toBe(
      '&lt;img src=x onerror=&quot;go()&quot;&gt;',
    );
    expect(escapeHtml("it's & more")).toBe('it&#39;s &amp; more');
  });

  it('cannot break out of a script block', () => {
    const payload = { name: '</script><script>window.pwned=1</script>' };
    const embedded = embedJson(payload);
    expect(embedded).not.toContain('</script>');
    expect(embedded).not.toContain('<');
    expect(JSON.parse(embedded) as typeof payload).toEqual(payload);
  });

  it('escapes the Unicode line terminators that are legal in JSON but not in JS', () => {
    const embedded = embedJson({ text: 'a b c' });
    expect(embedded).not.toContain(' ');
    expect(embedded).not.toContain(' ');
    expect((JSON.parse(embedded) as { text: string }).text).toBe('a b c');
  });
});

describe('buildReportModel', () => {
  it('points image paths at the screenshots folder beside the report', () => {
    const model = build([record({ image: image('aa'), element: element('fp-1') })]);
    expect(model.captures[0]?.image?.src).toBe('../screenshots/x-page/base/aa.png');
  });

  it('carries the run summary and no authentication material', () => {
    const model = build([record({ image: image('aa') })]);
    expect(model.run).toMatchObject({
      runId: 'run-1',
      project: 'demo',
      browserEngine: 'chromium',
      browserMode: 'clean',
      headless: true,
    });

    // Nothing in the serialised model may be an absolute path or a credential.
    const serialised = JSON.stringify(model);
    expect(serialised).not.toContain('/home/');
    expect(serialised).not.toContain('storageState');
    expect(serialised).not.toContain('cookie');
    expect(serialised).not.toContain('.ui-atlas/');
  });

  it('collects facets from the captures actually present', () => {
    const model = build([
      record({ element: element('fp-1'), state: { name: 'hover', provenance: 'interacted', verified: true } }),
      record({ status: 'skipped', state: { name: 'checked', provenance: 'forced', verified: false } }),
    ]);
    expect(model.facets.states).toEqual(['hover', 'checked']);
    expect(model.facets.provenances).toEqual(['interacted', 'forced']);
    expect(model.facets.statuses).toEqual(['captured', 'skipped']);
    expect(model.facets.roles).toEqual(['button']);
  });
});

describe('viewport labelling', () => {
  it('uses the set member for a responsive set', () => {
    const model = build([
      record({ element: element('fp-1'), set: { id: 's', kind: 'responsive', member: 'mobile-sm' } }),
      record({ element: element('fp-1'), set: { id: 's', kind: 'responsive', member: 'laptop' } }),
    ]);
    expect(model.captures.map((capture) => capture.viewportLabel)).toEqual(['mobile-sm', 'laptop']);
  });

  it('keeps the real viewport for a state set, whose member is a state name', () => {
    // Regression: reading `set.member` unconditionally turned a five-state
    // matrix into a diagonal of five one-cell "viewports".
    const model = build([
      record({
        element: element('fp-1'),
        state: { name: 'hover', provenance: 'interacted', verified: true },
        set: { id: 's', kind: 'state', member: 'hover' },
      }),
      record({
        element: element('fp-1'),
        state: { name: 'focus', provenance: 'interacted', verified: true },
        set: { id: 's', kind: 'state', member: 'focus' },
      }),
    ]);
    expect(model.captures.map((capture) => capture.viewportLabel)).toEqual(['base', 'base']);

    const group = model.components[0];
    expect(group?.viewports).toEqual(['base']);
    expect(group?.states).toEqual(['hover', 'focus']);
    expect(group?.cells).toHaveLength(2);
    expect(group?.cells.every((cell) => cell.capture !== undefined)).toBe(true);
  });
});

describe('grouping', () => {
  it('groups element captures by structural fingerprint', () => {
    const model = build([
      record({ element: element('fp-1', 'Save') }),
      record({ element: element('fp-1', 'Save'), state: { name: 'hover', provenance: 'interacted', verified: true } }),
      record({ element: element('fp-2', 'Publish') }),
    ]);
    expect(model.components).toHaveLength(2);
    const save = model.components.find((group) => group.label === 'Save');
    expect(save?.captureIds).toHaveLength(2);
    expect(save?.states).toEqual(['default', 'hover']);
  });

  it('groups page-level captures by route and kind', () => {
    const model = build([
      record({ kind: 'viewport', element: undefined }),
      record({ kind: 'full-page', element: undefined }),
    ]);
    expect(model.components.map((group) => group.key).sort()).toEqual([
      'page:x-page:full-page',
      'page:x-page:viewport',
    ]);
  });

  it('leaves a cell empty when a combination was never attempted', () => {
    const captures: ReportCapture[] = build([
      record({
        element: element('fp-1'),
        set: { id: 'r', kind: 'responsive', member: 'mobile-sm' },
      }),
      record({
        element: element('fp-1'),
        state: { name: 'hover', provenance: 'interacted', verified: true },
        set: { id: 'r', kind: 'responsive', member: 'laptop' },
      }),
    ]).captures;

    const group = groupComponents(captures)[0];
    expect(group?.viewports).toEqual(['mobile-sm', 'laptop']);
    expect(group?.states).toEqual(['default', 'hover']);
    // Two captures across a 2×2 grid: the other two cells were never attempted.
    expect(group?.cells.filter((cell) => cell.capture === undefined)).toHaveLength(2);
  });

  it('counts captured, skipped and failed separately per component', () => {
    const model = build([
      record({ element: element('fp-1') }),
      record({ element: element('fp-1'), status: 'skipped', error: { code: 'locator.hidden', message: 'hidden' } }),
      record({ element: element('fp-1'), status: 'failed', error: { code: 'capture.failed', message: 'boom' } }),
    ]);
    const group = model.components[0];
    expect(group).toMatchObject({ capturedCount: 1, skippedCount: 1, failedCount: 1 });
  });

  it('groups identical images and ignores captures without one', () => {
    const captures = build([
      record({ image: image('aa') }),
      record({ image: image('aa') }),
      record({ image: image('bb') }),
      record({ status: 'skipped' }),
    ]).captures;

    const duplicates = groupDuplicates(captures);
    expect(duplicates).toHaveLength(1);
    expect(duplicates[0]?.captureIds).toHaveLength(2);
  });
});
