import { readFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isPng, pngDimensions, readCaptures, readPages, readRunManifest } from '@ui-atlas/artifacts';
import { CaptureRecordSchema, RunManifestSchema } from '@ui-atlas/protocol';
import { run } from '../../apps/cli/src/index.js';
import { createLogger } from '../../apps/cli/src/logger.js';
import { makeOutputDir, removeDir, startFixtureServer, type FixtureServer } from '../support/harness.js';

/**
 * Phase 0 exit criterion: one command launches a fixture URL and writes a
 * viewport screenshot plus valid metadata.
 */
let server: FixtureServer;
let outputRoot: string;

beforeAll(async () => {
  server = await startFixtureServer();
  outputRoot = await makeOutputDir('phase0');
});

afterAll(async () => {
  await server.close();
  await removeDir(outputRoot);
});

function findRunDir(root: string, project = 'fixture'): string {
  const projectDir = join(root, project);
  const runs = readdirSync(projectDir).filter((name) => statSync(join(projectDir, name)).isDirectory());
  const runId = runs.sort().at(-1);
  if (runId === undefined) throw new Error(`no run directory under ${projectDir}`);
  return join(projectDir, runId);
}

const quiet = createLogger({ level: 'error', write: () => undefined });

describe('ui-atlas capture (phase 0 exit criterion)', () => {
  it('captures a viewport screenshot with valid metadata', async () => {
    const code = await run({
      argv: [
        'capture',
        server.url('/index.html'),
        '--project',
        'fixture',
        '--output',
        outputRoot,
        '--width',
        '900',
        '--height',
        '600',
      ],
      logger: quiet,
    });
    expect(code).toBe(0);

    const runDir = findRunDir(outputRoot);
    const manifest = await readRunManifest(join(runDir, 'run.json'));
    expect(RunManifestSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.counts).toMatchObject({ captured: 1, failed: 0, skipped: 0, pages: 1 });
    expect(manifest.browser.engine).toBe('chromium');
    expect(manifest.browser.headless).toBe(true);
    expect(manifest.finishedAt).toBeDefined();

    const captures = await readCaptures(join(runDir, 'captures.jsonl'));
    expect(captures.invalidLines).toHaveLength(0);
    expect(captures.records).toHaveLength(1);

    const record = captures.records[0];
    expect(record).toBeDefined();
    if (record === undefined) return;
    expect(CaptureRecordSchema.safeParse(record).success).toBe(true);
    expect(record.kind).toBe('viewport');
    expect(record.status).toBe('captured');
    expect(record.state).toMatchObject({ name: 'default', provenance: 'observed' });
    expect(record.viewport).toMatchObject({ width: 900, height: 600, mobile: false, userAgentClass: 'desktop' });
    expect(record.finalUrl).toBe(server.url('/index.html'));
    expect(record.readiness.checks.map((check) => check.name)).toContain('load-state');

    // The screenshot exists, is a real PNG, and matches the recorded size.
    const image = record.image;
    expect(image).toBeDefined();
    if (image === undefined) return;
    const bytes = await readFile(join(runDir, image.relativePath));
    expect(isPng(bytes)).toBe(true);
    expect(pngDimensions(bytes)).toEqual({ width: image.width, height: image.height });
    expect(image.width).toBe(900);
    expect(bytes.byteLength).toBe(image.byteLength);

    // A sidecar sits next to the image so the two can never be separated.
    const sidecar = JSON.parse(
      await readFile(join(runDir, image.relativePath.replace(/\.png$/, '.json')), 'utf8'),
    ) as { id: string };
    expect(sidecar.id).toBe(record.id);

    const pages = await readPages(join(runDir, 'pages.jsonl'));
    expect(pages.records).toHaveLength(1);
    expect(pages.records[0]?.title).toBe('UI Atlas fixture site');
  });

  it('captures a full page and records the taller image', async () => {
    const code = await run({
      argv: [
        'capture',
        server.url('/settle.html'),
        '--kind',
        'full-page',
        '--project',
        'fullpage',
        '--output',
        outputRoot,
        '--height',
        '400',
      ],
      logger: quiet,
    });
    expect(code).toBe(0);

    const runDir = findRunDir(outputRoot, 'fullpage');
    const captures = await readCaptures(join(runDir, 'captures.jsonl'));
    const record = captures.records[0];
    expect(record?.kind).toBe('full-page');
    expect(record?.image?.height ?? 0).toBeGreaterThan(400);
  });

  it('reports a run through `ui-atlas report`', async () => {
    const runDir = findRunDir(outputRoot);
    const code = await run({ argv: ['report', runDir, '--json'], logger: quiet });
    expect(code).toBe(0);
  });

  it('refuses a non-http URL before opening a browser', async () => {
    const code = await run({ argv: ['capture', 'file:///etc/passwd'], logger: quiet });
    expect(code).toBe(1);
  });
});
