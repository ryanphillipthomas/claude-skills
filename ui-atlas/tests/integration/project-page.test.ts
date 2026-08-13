/**
 * A project, end to end on disk: two sessions write real files, the project
 * page is generated from them, and the export copies them out under the names
 * the page promised. No browser — everything here is the artifact layer and the
 * reporter, which is exactly the part that has to keep working when someone
 * opens the directory a month later.
 */

import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  emptyManifest,
  newCaptureId,
  newRunId,
  planDesignExport,
  projectPaths,
  readProjectContents,
  recordProjectSession,
  RunWriter,
  writeDesignExport,
} from '@ui-atlas/artifacts';
import { generateProjectPage } from '@ui-atlas/reporter';
import {
  SCHEMA_VERSION,
  type CaptureRecord,
  type ElementIdentity,
  type StateName,
  type Viewport,
} from '@ui-atlas/protocol';

const ROOT = fileURLToPath(new URL('../../test-output/', import.meta.url));

const PNG_2x2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z4AATAxIYFRABQEAAP//FpwBFsIhZ+kAAAAASUVORK5CYII=',
  'base64',
);

const VIEWPORT: Viewport = {
  name: 'desktop',
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
  hasTouch: false,
  userAgentClass: 'desktop',
};

const PROJECT = 'example-com';
const SITE = 'https://example.com/pricing';

let dir: string;

beforeEach(async () => {
  mkdirSync(ROOT, { recursive: true });
  dir = await mkdtemp(join(ROOT, 'project-page-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function button(name: string): ElementIdentity {
  const locator = {
    type: 'role-name' as const,
    value: name,
    role: 'button',
    uniquenessCount: 1,
    score: 90,
    reasons: ['accessible name'],
  };
  return {
    tagName: 'BUTTON',
    role: 'button',
    accessibleName: name,
    framePath: [],
    locatorCandidates: [locator],
    chosenLocator: locator,
    structuralFingerprint: `button:${name}`,
    boundingBox: { x: 0, y: 0, width: 100, height: 40 },
  };
}

async function addCapture(
  writer: RunWriter,
  input: {
    kind: CaptureRecord['kind'];
    state?: StateName;
    url?: string;
    element?: ElementIdentity;
    stem: string;
  },
): Promise<CaptureRecord> {
  const captureId = newCaptureId();
  const url = input.url ?? SITE;
  const image = await writer.writeScreenshot(
    { routeKey: 'example-com-pricing', viewportLabel: 'desktop', captureId, stem: input.stem },
    PNG_2x2,
  );

  return writer.addCapture({
    schemaVersion: SCHEMA_VERSION,
    id: captureId,
    runId: writer.runId,
    project: writer.project,
    sourceUrl: url,
    finalUrl: url,
    routeKey: 'example-com-pricing',
    capturedAt: new Date().toISOString(),
    kind: input.kind,
    status: 'captured',
    state: { name: input.state ?? 'default', provenance: 'observed', verified: true },
    viewport: VIEWPORT,
    ...(input.element === undefined ? {} : { element: input.element }),
    readiness: {
      startedAt: new Date().toISOString(),
      durationMs: 1,
      deadlineMs: 5000,
      deadlineExceeded: false,
      checks: [],
      warnings: [],
    },
    image,
    durationMs: 1,
    warnings: [],
  });
}

async function session(id = newRunId()): Promise<RunWriter> {
  const writer = new RunWriter(
    dir,
    emptyManifest({
      runId: id,
      project: PROJECT,
      command: `inspect ${SITE}`,
      toolVersion: '0.0.0',
      baseViewport: VIEWPORT,
      browser: { engine: 'chromium', mode: 'clean', headless: true },
    }),
  );
  await writer.init();
  await recordProjectSession({ outputRoot: dir, project: PROJECT, url: SITE, sessionId: id });
  return writer;
}

/** Two sessions against one site, the way two sittings would leave it. */
async function buildProject(): Promise<{ first: string; second: string }> {
  const first = await session('20260812T160000Z-aaa111');
  await addCapture(first, { kind: 'viewport', stem: 'viewport--default' });
  await addCapture(first, {
    kind: 'element',
    element: button('Save changes'),
    stem: 'button--save-changes--default',
  });
  await first.finalize();

  const second = await session('20260813T090000Z-bbb222');
  await addCapture(second, {
    kind: 'element',
    state: 'hover',
    element: button('Save changes'),
    stem: 'button--save-changes--hover',
  });
  await addCapture(second, {
    kind: 'element',
    state: 'focus',
    element: button('Save changes'),
    stem: 'button--save-changes--focus',
  });
  await second.finalize();

  return { first: first.runId, second: second.runId };
}

describe('a project across sessions', () => {
  it('gathers every session into one page', async () => {
    const ids = await buildProject();
    const page = await generateProjectPage({ outputRoot: dir, project: PROJECT });

    expect(page.path).toBe(projectPaths(dir, PROJECT).indexHtml);
    expect(page.facts.totals.sessions).toBe(2);
    expect(page.facts.totals.captured).toBe(4);

    const html = await readFile(page.path, 'utf8');
    expect(html).toContain(ids.first);
    expect(html).toContain(ids.second);
    expect(html).toContain('example.com');
  });

  it('treats one component captured across two sessions as one component', async () => {
    await buildProject();
    const page = await generateProjectPage({ outputRoot: dir, project: PROJECT });

    const components = page.facts.components;
    expect(components).toHaveLength(1);
    expect(components[0]?.label).toBe('Save changes');
    // The states came from two different sittings and read as one matrix.
    expect(components[0]?.states).toEqual(['default', 'hover', 'focus']);
  });

  it('links each session folder and only the reports that exist', async () => {
    const ids = await buildProject();
    const html = await readFile(
      (await generateProjectPage({ outputRoot: dir, project: PROJECT })).path,
      'utf8',
    );

    expect(html).toContain(`href="${ids.first}/"`);
    // No report was generated for these sessions, so the page must not offer one.
    expect(html).not.toContain(`${ids.first}/report/index.html`);
    expect(html).toContain('no report');
  });

  it('carries the staged prompt, with the refinement stage in it', async () => {
    await buildProject();
    const page = await generateProjectPage({ outputRoot: dir, project: PROJECT });

    expect(page.prompt.stages.map((stage) => stage.id)).toEqual([
      'foundations',
      'components',
      'refinement',
      'assembly',
    ]);

    const html = await readFile(page.path, 'utf8');
    expect(html).toContain('Apple precision');
    expect(html).toContain('id="stage-foundations"');
    expect(html).toContain('data-copy="stage-all"');
  });

  it('escapes site text rather than letting it become markup', async () => {
    const writer = await session('20260812T160000Z-ccc333');
    await addCapture(writer, {
      kind: 'element',
      element: button('</pre><script>alert(1)</script>'),
      stem: 'button--nasty--default',
    });
    await writer.finalize();

    const html = await readFile(
      (await generateProjectPage({ outputRoot: dir, project: PROJECT })).path,
      'utf8',
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('writes a page for a project that has captured nothing yet', async () => {
    await recordProjectSession({
      outputRoot: dir,
      project: 'empty-com',
      url: 'https://empty.com/',
      sessionId: 'none',
    });
    const page = await generateProjectPage({ outputRoot: dir, project: 'empty-com' });

    expect(page.facts.totals.sessions).toBe(0);
    const html = await readFile(page.path, 'utf8');
    expect(html).toContain('No sessions have been recorded');
  });
});

describe('exporting a project', () => {
  it('copies every file out under its export name, leaving the originals alone', async () => {
    await buildProject();
    const contents = await readProjectContents(dir, PROJECT);
    const plan = planDesignExport(contents.captures);
    const paths = projectPaths(dir, PROJECT);

    const written = await writeDesignExport({
      projectDir: paths.projectDir,
      exportsDir: paths.exportsDir,
      plan,
    });

    expect(written.copied).toBe(4);
    expect(written.failed).toEqual([]);

    const names = (await readdir(paths.exportsDir)).sort();
    expect(names).toEqual([
      '01-page-pricing.png',
      '02-component-button-save-changes.png',
      '03-component-button-save-changes-hover.png',
      '04-component-button-save-changes-focus.png',
      'manifest.json',
    ]);

    // The working names are untouched: a capture record, its sidecar and its
    // image still point at each other.
    const original = join(
      paths.projectDir,
      '20260812T160000Z-aaa111',
      'screenshots',
      'example-com-pricing',
      'desktop',
      'button--save-changes--default.png',
    );
    expect(await readFile(original)).toEqual(PNG_2x2);
  });

  it('writes a manifest saying where each exported file came from', async () => {
    await buildProject();
    const contents = await readProjectContents(dir, PROJECT);
    const paths = projectPaths(dir, PROJECT);
    const written = await writeDesignExport({
      projectDir: paths.projectDir,
      exportsDir: paths.exportsDir,
      plan: planDesignExport(contents.captures),
    });

    const manifest = JSON.parse(await readFile(written.manifestPath, 'utf8')) as {
      counts: { exported: number };
      files: Array<{ name: string; source: string; sessionId: string; group: string }>;
    };

    expect(manifest.counts.exported).toBe(4);
    const hover = manifest.files.find((file) => file.name.includes('hover'));
    expect(hover?.sessionId).toBe('20260813T090000Z-bbb222');
    expect(hover?.source.startsWith('20260813T090000Z-bbb222/')).toBe(true);
    expect(hover?.group).toBe('component');
  });

  it('archives the folder beside it, not inside it, under the project’s name', async () => {
    await buildProject();
    const paths = projectPaths(dir, PROJECT);
    const contents = await readProjectContents(dir, PROJECT);

    const written = await writeDesignExport({
      projectDir: paths.projectDir,
      exportsDir: paths.exportsDir,
      plan: planDesignExport(contents.captures),
      zipPath: paths.exportZip,
    });

    expect(written.zip?.path).toBe(join(paths.projectDir, `${PROJECT}-reference.zip`));
    // Four images plus the manifest that says where each came from.
    expect(written.zip?.entries).toBe(5);
    // Beside the folder: an archive inside the directory it archives grows
    // every time, and the clean step would delete it anyway.
    expect((await readdir(paths.exportsDir)).some((name) => name.endsWith('.zip'))).toBe(false);
  });

  it('offers the zip for download once it exists, and the command before that', async () => {
    await buildProject();
    const paths = projectPaths(dir, PROJECT);

    const before = await generateProjectPage({ outputRoot: dir, project: PROJECT });
    expect(before.facts.attachments.folderExists).toBe(false);
    expect(before.facts.attachments.zipExists).toBe(false);
    const beforeHtml = await readFile(before.path, 'utf8');
    expect(beforeHtml).toContain(`ui-atlas export ${PROJECT} --open`);
    expect(beforeHtml).not.toContain('Download the zip');

    const contents = await readProjectContents(dir, PROJECT);
    await writeDesignExport({
      projectDir: paths.projectDir,
      exportsDir: paths.exportsDir,
      plan: planDesignExport(contents.captures),
      zipPath: paths.exportZip,
    });

    const after = await generateProjectPage({ outputRoot: dir, project: PROJECT });
    expect(after.facts.attachments.folderExists).toBe(true);
    expect(after.facts.attachments.zipExists).toBe(true);
    expect(after.facts.attachments.fileCount).toBe(4);
    expect(after.facts.attachments.totalBytes).toBeGreaterThan(0);

    const afterHtml = await readFile(after.path, 'utf8');
    expect(afterHtml).toContain('Download the zip');
    expect(afterHtml).toContain(`href="${PROJECT}-reference.zip" download`);
    expect(afterHtml).toContain('href="exports/"');
  });

  it('clears a stale export rather than leaving a file nothing points at', async () => {
    await buildProject();
    const paths = projectPaths(dir, PROJECT);
    const contents = await readProjectContents(dir, PROJECT);
    const plan = planDesignExport(contents.captures);

    await writeDesignExport({ projectDir: paths.projectDir, exportsDir: paths.exportsDir, plan });
    // Re-export only the first two, as if two captures had been deleted.
    await writeDesignExport({
      projectDir: paths.projectDir,
      exportsDir: paths.exportsDir,
      plan: { entries: plan.entries.slice(0, 2), skipped: [] },
    });

    const names = await readdir(paths.exportsDir);
    expect(names).toHaveLength(3);
    expect(names.some((name) => name.includes('focus'))).toBe(false);
  });
});
