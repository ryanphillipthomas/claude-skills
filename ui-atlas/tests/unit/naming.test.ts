import { describe, expect, it } from 'vitest';
import {
  captureSlug,
  groupForIndex,
  describeCapture,
  recordingSlug,
  relativise,
  renderRouteIndex,
  renderRunIndex,
  sanitizeFileStem,
  slugPart,
  trimSlug,
  type CaptureNameInput,
} from '@ui-atlas/artifacts';
import {
  SCHEMA_VERSION,
  type Box,
  type CaptureRecord,
  type ElementIdentity,
  type LocatorCandidate,
  type PageRecord,
  type RunManifest,
  type Viewport,
} from '@ui-atlas/protocol';

const BOX: Box = { x: 0, y: 0, width: 100, height: 40 };

const LOCATOR: LocatorCandidate = {
  type: 'role-name',
  value: 'Save changes',
  role: 'button',
  uniquenessCount: 1,
  score: 95,
  reasons: [],
};

const VIEWPORT: Viewport = {
  name: 'desktop',
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
  hasTouch: false,
  userAgentClass: 'desktop',
};

function element(overrides: Partial<ElementIdentity> = {}): ElementIdentity {
  return {
    framePath: [],
    locatorCandidates: [LOCATOR],
    chosenLocator: LOCATOR,
    structuralFingerprint: 'fp',
    tagName: 'BUTTON',
    role: 'button',
    accessibleName: 'Save changes',
    boundingBox: BOX,
    ...overrides,
  };
}

function slugOf(overrides: Partial<CaptureNameInput> = {}): string {
  return captureSlug({
    kind: 'element',
    state: { name: 'default', provenance: 'observed', verified: true },
    element: element(),
    ...overrides,
  });
}

describe('slugPart', () => {
  it('collapses punctuation, case and whitespace to one word run', () => {
    expect(slugPart('  Save   Changes! ')).toBe('save-changes');
    expect(slugPart('Continue →')).toBe('continue');
  });

  it('strips accents rather than dropping the letters', () => {
    expect(slugPart('Créer un café')).toBe('creer-un-cafe');
  });

  it('returns an empty string when there is nothing nameable', () => {
    expect(slugPart('→ ✓ ·')).toBe('');
  });
});

describe('trimSlug', () => {
  it('cuts on a word boundary so the result reads as a shorter name', () => {
    expect(trimSlug('continue-to-payment-details', 20)).toBe('continue-to-payment');
  });

  it('still cuts a single over-long word, because it has to', () => {
    expect(trimSlug('supercalifragilistic', 10)).toBe('supercalif');
  });

  it('leaves a slug that already fits alone', () => {
    expect(trimSlug('save-changes', 48)).toBe('save-changes');
  });
});

describe('captureSlug', () => {
  it('names an element capture after its role, name and state', () => {
    expect(slugOf({ state: { name: 'hover', provenance: 'interacted', verified: true } })).toBe(
      'button--save-changes--hover',
    );
  });

  it('prefers the ARIA role to the tag that implements it', () => {
    expect(slugOf({ element: element({ tagName: 'DIV', role: 'checkbox' }) })).toBe(
      'checkbox--save-changes--default',
    );
  });

  it('falls back to the tag name when there is no role', () => {
    const identity = element({ tagName: 'SECTION', accessibleName: 'Pricing' });
    delete (identity as { role?: string }).role;
    expect(slugOf({ element: identity })).toBe('section--pricing--default');
  });

  it('falls back to the text excerpt when there is no accessible name', () => {
    const identity = element({ tagName: 'A', role: 'link', textExcerpt: 'Read the docs' });
    delete (identity as { accessibleName?: string }).accessibleName;
    expect(slugOf({ element: identity })).toBe('link--read-the-docs--default');
  });

  it('omits the label rather than inventing one', () => {
    const identity = element({ tagName: 'DIV' });
    delete (identity as { role?: string }).role;
    delete (identity as { accessibleName?: string }).accessibleName;
    expect(slugOf({ element: identity })).toBe('div--default');
  });

  it('ignores a name that is only markup noise', () => {
    expect(slugOf({ element: element({ accessibleName: 'div' }) })).toBe('button--default');
  });

  it('names page-level captures after what they are', () => {
    expect(slugOf({ kind: 'viewport', element: undefined })).toBe('viewport--default');
    expect(slugOf({ kind: 'full-page', element: undefined })).toBe('full-page--default');
  });

  it('carries a custom state label into the name', () => {
    expect(
      slugOf({
        state: { name: 'custom', label: 'Cart open', provenance: 'interacted', verified: true },
      }),
    ).toBe('button--save-changes--custom-cart-open');
  });

  it('zero-pads an animation frame so a listing sorts in time order', () => {
    const frames = [0, 0.5, 1].map((progress) =>
      slugOf({
        kind: 'animation-frame',
        animation: {
          animationId: 'a',
          progress,
          currentTimeMs: 0,
          method: 'web-animations',
          limitations: [],
        },
      }),
    );
    expect(frames).toEqual([
      'button--save-changes--default--frame-000',
      'button--save-changes--default--frame-050',
      'button--save-changes--default--frame-100',
    ]);
    expect([...frames].sort()).toEqual(frames);
  });

  it('names a recording after what it is, with no state to claim', () => {
    expect(recordingSlug()).toBe('recording');
  });
});

describe('sanitizeFileStem', () => {
  it('keeps the double hyphen that separates the parts of a name', () => {
    expect(sanitizeFileStem('button--save-changes--hover')).toBe('button--save-changes--hover');
  });

  it('never yields a path separator or a traversal', () => {
    expect(sanitizeFileStem('../../etc/passwd')).toBe('etc-passwd');
    expect(sanitizeFileStem('..')).toBe('capture');
    expect(sanitizeFileStem('')).toBe('capture');
  });

  it('sidesteps Windows device names', () => {
    expect(sanitizeFileStem('con')).toBe('con-x');
  });
});

/* -------------------------------------------------------------------------- */
/* Index documents                                                             */
/* -------------------------------------------------------------------------- */

function capture(overrides: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'cap-1',
    runId: 'run-1',
    project: 'fixture',
    sourceUrl: 'http://127.0.0.1:4173/pricing',
    finalUrl: 'http://127.0.0.1:4173/pricing',
    routeKey: 'local-pricing',
    capturedAt: '2026-08-12T10:00:00.000Z',
    kind: 'element',
    status: 'captured',
    state: { name: 'hover', provenance: 'interacted', verified: true },
    viewport: VIEWPORT,
    element: element(),
    readiness: {
      startedAt: '2026-08-12T10:00:00.000Z',
      durationMs: 10,
      deadlineMs: 5000,
      deadlineExceeded: false,
      checks: [],
      warnings: [],
    },
    image: {
      relativePath: 'screenshots/local-pricing/desktop/button--save-changes--hover.png',
      sha256: 'a'.repeat(64),
      width: 100,
      height: 40,
      byteLength: 128,
    },
    durationMs: 30,
    warnings: [],
    ...overrides,
  };
}

const MANIFEST: RunManifest = {
  schemaVersion: SCHEMA_VERSION,
  runId: 'run-1',
  project: 'fixture',
  command: 'crawl',
  startedAt: '2026-08-12T10:00:00.000Z',
  toolVersion: '0.1.0',
  browser: { engine: 'chromium', mode: 'clean', headless: true },
  baseViewport: VIEWPORT,
  warnings: [],
};

describe('describeCapture', () => {
  it('says what the file is of, in the vocabulary the name uses', () => {
    expect(describeCapture(capture())).toBe(
      '<button> “Save changes” · state: hover · 1280×800',
    );
  });

  it('collapses newlines out of a text excerpt so a table row survives', () => {
    const identity = element({ accessibleName: 'Save\n  changes' });
    expect(describeCapture(capture({ element: identity }))).toContain('“Save changes”');
  });
});

describe('groupForIndex', () => {
  it('groups by route and carries the page title when there is one', () => {
    const page: PageRecord = {
      schemaVersion: SCHEMA_VERSION,
      id: 'page-1',
      runId: 'run-1',
      requestedUrl: 'http://127.0.0.1:4173/pricing',
      finalUrl: 'http://127.0.0.1:4173/pricing',
      routeKey: 'local-pricing',
      title: 'Pricing',
      visitedAt: '2026-08-12T10:00:00.000Z',
      warnings: [],
    };
    const [route] = groupForIndex([capture()], [page]);
    expect(route?.title).toBe('Pricing');
    expect(route?.entries).toHaveLength(1);
  });

  it('lists a capture with no file as a stated gap rather than dropping it', () => {
    const failed = capture({
      status: 'skipped',
      error: { code: 'locator.not-found', message: 'the element was not resolvable here' },
    });
    delete (failed as { image?: unknown }).image;

    const [route] = groupForIndex([failed]);
    expect(route?.entries).toHaveLength(0);
    expect(route?.missing[0]?.reason).toBe('the element was not resolvable here');
  });

  it('sorts files so sibling states of one component sit together', () => {
    const hover = capture();
    const rest = capture({
      state: { name: 'default', provenance: 'observed', verified: true },
      image: {
        relativePath: 'screenshots/local-pricing/desktop/button--save-changes--default.png',
        sha256: 'b'.repeat(64),
        width: 100,
        height: 40,
        byteLength: 128,
      },
    });
    const [route] = groupForIndex([hover, rest]);
    expect(route?.entries.map((entry) => entry.file)).toEqual([
      'screenshots/local-pricing/desktop/button--save-changes--default.png',
      'screenshots/local-pricing/desktop/button--save-changes--hover.png',
    ]);
  });
});

describe('renderRunIndex', () => {
  it('links each route to its own folder index', () => {
    const text = renderRunIndex({ manifest: MANIFEST, routes: groupForIndex([capture()]) });
    expect(text).toContain('[`local-pricing/`](screenshots/local-pricing/index.md)');
    expect(text).toContain('http://127.0.0.1:4173/pricing');
  });

  it('says plainly that renaming does not update the records', () => {
    const text = renderRunIndex({ manifest: MANIFEST, routes: [] });
    expect(text).toContain('does **not** update `captures.jsonl`');
    expect(text).toContain('No captures were written in this run.');
  });
});

describe('relativise', () => {
  it('strips the folder the index is written in', () => {
    expect(relativise('screenshots/local-pricing/desktop/a.png', 'screenshots/local-pricing')).toBe(
      'desktop/a.png',
    );
  });

  it('climbs out for a recording, which lives in a different tree', () => {
    expect(
      relativise('animations/local-pricing/desktop/recording.webm', 'screenshots/local-pricing'),
    ).toBe('../../animations/local-pricing/desktop/recording.webm');
  });

  it('leaves a path alone when there is no folder to be relative to', () => {
    expect(relativise('screenshots/a/b.png', undefined)).toBe('screenshots/a/b.png');
  });
});

describe('renderRouteIndex', () => {
  it('lists files by their bare name, because it sits beside them', () => {
    const [route] = groupForIndex([capture()]);
    if (route === undefined) throw new Error('expected a route');
    const text = renderRouteIndex(route);
    expect(text).toContain('[`desktop/button--save-changes--hover.png`]');
    expect(text).not.toContain('screenshots/local-pricing/desktop');
  });

  it('links a recording out of the folder the index sits in', () => {
    const recording = capture({ kind: 'animation-video' });
    delete (recording as { image?: unknown }).image;
    delete (recording as { element?: unknown }).element;
    recording.video = {
      relativePath: 'animations/local-pricing/desktop/recording.webm',
      sha256: 'c'.repeat(64),
      byteLength: 2048,
      format: 'webm',
      width: 1280,
      height: 800,
      durationMs: 2000,
      leadInMs: 500,
      truncated: false,
      subjects: [],
      limitations: [],
    };

    const [route] = groupForIndex([recording]);
    if (route === undefined) throw new Error('expected a route');
    expect(renderRouteIndex(route)).toContain(
      '[`../../animations/local-pricing/desktop/recording.webm`]',
    );
  });
});
