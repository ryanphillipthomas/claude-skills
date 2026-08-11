import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appendJsonLine,
  atomicWriteFile,
  emptyManifest,
  isPng,
  newCaptureId,
  newRunId,
  pngDimensions,
  readCaptures,
  RunWriter,
  sha256,
} from '@ui-atlas/artifacts';
import { SCHEMA_VERSION, UiAtlasError, type CaptureRecord, type Viewport } from '@ui-atlas/protocol';

const ROOT = fileURLToPath(new URL('../../test-output/', import.meta.url));

/** 2×2 PNG produced once so tests never depend on an encoder. */
const PNG_2x2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z4AATAxIYFRABQEAAP//FpwBFsIhZ+kAAAAASUVORK5CYII=',
  'base64',
);

const VIEWPORT: Viewport = {
  name: 'base',
  width: 1280,
  height: 800,
  deviceScaleFactor: 1,
  mobile: false,
  hasTouch: false,
  userAgentClass: 'desktop',
};

let dir: string;

beforeEach(async () => {
  mkdirSync(ROOT, { recursive: true });
  dir = await mkdtemp(join(ROOT, 'artifacts-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('atomicWriteFile', () => {
  it('writes the file and reports its checksum', async () => {
    const target = join(dir, 'nested', 'file.txt');
    const result = await atomicWriteFile(target, 'hello');
    expect(await readFile(target, 'utf8')).toBe('hello');
    expect(result.sha256).toBe(sha256('hello'));
    expect(result.byteLength).toBe(5);
  });

  it('leaves no temporary files behind', async () => {
    await atomicWriteFile(join(dir, 'a.txt'), 'a');
    await atomicWriteFile(join(dir, 'b.txt'), 'b');
    const entries = await readdir(dir);
    expect(entries.filter((name) => name.endsWith('.tmp'))).toHaveLength(0);
  });

  it('reports a structured error when the directory is a file', async () => {
    await writeFile(join(dir, 'blocker'), 'x');
    await expect(atomicWriteFile(join(dir, 'blocker', 'child.txt'), 'x')).rejects.toThrow(UiAtlasError);
  });
});

describe('appendJsonLine', () => {
  it('appends one JSON object per line', async () => {
    const target = join(dir, 'records.jsonl');
    await appendJsonLine(target, { a: 1 });
    await appendJsonLine(target, { a: 2 });
    const text = await readFile(target, 'utf8');
    expect(text.trimEnd().split('\n')).toEqual(['{"a":1}', '{"a":2}']);
  });
});

describe('png helpers', () => {
  it('reads dimensions from the IHDR chunk', () => {
    expect(isPng(PNG_2x2)).toBe(true);
    expect(pngDimensions(PNG_2x2)).toEqual({ width: 2, height: 2 });
  });

  it('rejects bytes that are not a PNG', () => {
    expect(() => pngDimensions(Buffer.from('not a png at all!!!!!!!!'))).toThrow(UiAtlasError);
  });
});

function makeRecord(runId: string, overrides: Partial<CaptureRecord> = {}): CaptureRecord {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newCaptureId(),
    runId,
    project: 'fixture',
    sourceUrl: 'http://127.0.0.1/index.html',
    finalUrl: 'http://127.0.0.1/index.html',
    routeKey: 'local-root',
    capturedAt: new Date().toISOString(),
    kind: 'viewport',
    status: 'captured',
    state: { name: 'default', provenance: 'observed', verified: true },
    viewport: VIEWPORT,
    readiness: {
      startedAt: new Date().toISOString(),
      durationMs: 12,
      deadlineMs: 5000,
      deadlineExceeded: false,
      checks: [],
      warnings: [],
    },
    durationMs: 30,
    warnings: [],
    ...overrides,
  };
}

describe('RunWriter', () => {
  it('writes a manifest, screenshots, sidecars and JSONL', async () => {
    const runId = newRunId();
    const writer = new RunWriter(
      dir,
      emptyManifest({
        runId,
        project: 'fixture',
        command: 'test',
        toolVersion: '0.0.0',
        baseViewport: VIEWPORT,
        browser: { engine: 'chromium', mode: 'clean', headless: true },
      }),
    );
    await writer.init();

    const image = await writer.writeScreenshot(
      { routeKey: 'local-root', viewportLabel: 'base', captureId: 'cap-1' },
      PNG_2x2,
    );
    expect(image.width).toBe(2);
    expect(image.relativePath).toBe('screenshots/local-root/base/cap-1.png');

    const record = makeRecord(runId, { image });
    await writer.addCapture(record);

    const sidecar = join(writer.paths.runDir, 'screenshots/local-root/base/cap-1.json');
    const sidecarBody = JSON.parse(await readFile(sidecar, 'utf8')) as CaptureRecord;
    expect(sidecarBody.id).toBe(record.id);

    const read = await readCaptures(writer.paths.capturesJsonl);
    expect(read.records).toHaveLength(1);
    expect(read.invalidLines).toHaveLength(0);

    const manifest = await writer.finalize({ browserVersion: '141.0.0.0' });
    expect(manifest.counts).toEqual({ captured: 1, failed: 0, skipped: 0, pages: 0 });
    expect(manifest.browser.version).toBe('141.0.0.0');
  });

  it('counts failed and skipped records separately', async () => {
    const runId = newRunId();
    const writer = new RunWriter(
      dir,
      emptyManifest({
        runId,
        project: 'fixture',
        command: 'test',
        toolVersion: '0.0.0',
        baseViewport: VIEWPORT,
        browser: { engine: 'chromium', mode: 'clean', headless: true },
      }),
    );
    await writer.init();
    await writer.addCapture(makeRecord(runId, { status: 'failed', error: { code: 'capture.failed', message: 'boom' } }));
    await writer.addCapture(makeRecord(runId, { status: 'skipped' }));
    const manifest = await writer.finalize();
    expect(manifest.counts).toEqual({ captured: 0, failed: 1, skipped: 1, pages: 0 });
  });

  it('refuses to persist an invalid record', async () => {
    const runId = newRunId();
    const writer = new RunWriter(
      dir,
      emptyManifest({
        runId,
        project: 'fixture',
        command: 'test',
        toolVersion: '0.0.0',
        baseViewport: VIEWPORT,
        browser: { engine: 'chromium', mode: 'clean', headless: true },
      }),
    );
    await writer.init();
    const broken = makeRecord(runId) as unknown as Record<string, unknown>;
    broken['capturedAt'] = 'not-a-timestamp';
    await expect(writer.addCapture(broken as unknown as CaptureRecord)).rejects.toThrow(UiAtlasError);
  });

  it('keeps reading a JSONL file that contains one corrupt line', async () => {
    const target = join(dir, 'captures.jsonl');
    await appendJsonLine(target, makeRecord('run-1'));
    await appendJsonLine(target, { not: 'a capture record' });
    const result = await readCaptures(target);
    expect(result.records).toHaveLength(1);
    expect(result.invalidLines).toHaveLength(1);
  });
});
