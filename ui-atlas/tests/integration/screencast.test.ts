import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readCaptures } from '@ui-atlas/artifacts';
import type { CaptureRecord } from '@ui-atlas/protocol';
import { run } from '../../apps/cli/src/index.js';
import { createLogger } from '../../apps/cli/src/logger.js';
import {
  makeOutputDir,
  removeDir,
  startFixtureServer,
  type FixtureServer,
} from '../support/harness.js';

let server: FixtureServer;

beforeAll(async () => {
  server = await startFixtureServer();
});

afterAll(async () => {
  await server.close();
});

const quiet = () => createLogger({ level: 'error', write: () => undefined });

/** The newest run directory under `<outputRoot>/fixture`. */
function latestRun(outputRoot: string): string {
  const projectDir = join(outputRoot, 'fixture');
  const name = readdirSync(projectDir)
    .filter((entry) => statSync(join(projectDir, entry)).isDirectory())
    .sort()
    .at(-1);
  if (name === undefined) throw new Error('no run directory was written');
  return join(projectDir, name);
}

async function animations(
  outputRoot: string,
  path: string,
  extra: string[],
): Promise<{ code: number; runDir: string; records: CaptureRecord[] }> {
  const code = await run({
    argv: [
      'animations', server.url(path),
      '--project', 'fixture',
      '--output', outputRoot,
      '--headless',
      ...extra,
    ],
    logger: quiet(),
  });
  const runDir = latestRun(outputRoot);
  const capturesPath = join(runDir, 'captures.jsonl');
  const records = existsSync(capturesPath)
    ? (await readCaptures(capturesPath)).records
    : [];
  return { code, runDir, records };
}

describe('recording the motion that cannot be sampled', () => {
  it('records the infinite animation and describes what the file is of', async () => {
    const outputRoot = await makeOutputDir('screencast');
    try {
      const { code, runDir, records } = await animations(outputRoot, '/motion.html', [
        '--video',
        '--video-ms', '1200',
      ]);
      expect(code).toBe(0);
      expect(records).toHaveLength(1);

      const record = records[0] as CaptureRecord;
      expect(record.kind).toBe('animation-video');
      expect(record.status).toBe('captured');
      expect(record.video?.format).toBe('webm');
      expect(record.video?.byteLength).toBeGreaterThan(0);
      expect(record.video?.durationMs).toBe(1_200);

      // The file exists where the record says it does, and is the size the
      // record says it is.
      const file = join(runDir, record.video?.relativePath ?? '');
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBe(record.video?.byteLength);

      // What it is of: the infinite drift, named. The fixture runs `drift`
      // twice — once finite, once infinite — and only the one that cannot be
      // sampled belongs in a recording.
      const subjects = record.video?.subjects ?? [];
      expect(subjects).toEqual(['drift on [data-testid="infinite-swatch"]']);

      // A recording is a whole context, so the file starts with the page load
      // it needed, and says how far in the part you asked about begins.
      expect(record.video?.leadInMs).toBeGreaterThan(0);
      expect(record.video?.limitations.join(' ')).toContain('begins about');
    } finally {
      await removeDir(outputRoot);
    }
  }, 60_000);

  it('never presents a recording as a sample', async () => {
    const outputRoot = await makeOutputDir('screencast-not-sample');
    try {
      const { records } = await animations(outputRoot, '/motion.html', [
        '--video',
        '--video-ms', '600',
      ]);
      const record = records[0] as CaptureRecord;

      // No `animation` block at all. A sample carries a `progress`, and there
      // is no honest progress for a recording of something that never ends —
      // inventing one is exactly the lie sampling exists to avoid.
      expect(record.animation).toBeUndefined();
      expect(record.image).toBeUndefined();
      expect(record.video?.limitations.join(' ')).toContain('not a deterministic sample');

      // The state is genuinely default and says how it knows.
      expect(record.state.name).toBe('default');
      expect(record.state.verified).toBe(true);
      expect(record.state.verification).toContain('as served');
    } finally {
      await removeDir(outputRoot);
    }
  }, 60_000);

  it('writes the metadata beside the recording, as it does beside an image', async () => {
    const outputRoot = await makeOutputDir('screencast-sidecar');
    try {
      const { runDir, records } = await animations(outputRoot, '/motion.html', [
        '--video',
        '--video-ms', '600',
      ]);
      const relative = records[0]?.video?.relativePath ?? '';
      const sidecar = join(runDir, relative.replace(/\.webm$/, '.json'));
      expect(existsSync(sidecar)).toBe(true);

      const parsed = JSON.parse(await readFile(sidecar, 'utf8')) as CaptureRecord;
      expect(parsed.id).toBe(records[0]?.id);
      expect(parsed.video?.sha256).toBe(records[0]?.video?.sha256);
    } finally {
      await removeDir(outputRoot);
    }
  }, 60_000);

  it('records canvas and video, which no animation list can describe', async () => {
    const outputRoot = await makeOutputDir('screencast-media');
    try {
      const { records } = await animations(outputRoot, '/media.html', [
        '--video',
        '--video-ms', '600',
      ]);
      expect(records).toHaveLength(1);

      const subjects = (records[0]?.video?.subjects ?? []).join(' ');
      expect(subjects).toContain('canvas element(s)');
      expect(subjects).toContain('video element(s)');
    } finally {
      await removeDir(outputRoot);
    }
  }, 60_000);

  it('records nothing on a page whose motion can all be sampled', async () => {
    const outputRoot = await makeOutputDir('screencast-none');
    try {
      // states.html has no animations at all, so there is nothing a recording
      // could show — and no record is written, because nothing was attempted.
      const { code, records } = await animations(outputRoot, '/states.html', ['--video']);
      expect(code).toBe(0);
      expect(records).toEqual([]);
    } finally {
      await removeDir(outputRoot);
    }
  }, 60_000);

  it('discards a recording over budget and says so rather than going quiet', async () => {
    const outputRoot = await makeOutputDir('screencast-budget');
    const configPath = join(outputRoot, 'tiny.json');
    try {
      await writeFile(
        configPath,
        JSON.stringify({ capture: { animation: { video: { maxBytes: 2048 } } } }),
        'utf8',
      );
      const { code, runDir, records } = await animations(outputRoot, '/motion.html', [
        '--video',
        '--video-ms', '1500',
        '--config', configPath,
      ]);

      // A budget doing its job is not a broken run.
      expect(code).toBe(0);
      expect(records).toHaveLength(1);
      const record = records[0] as CaptureRecord;
      expect(record.status).toBe('skipped');
      expect(record.video).toBeUndefined();
      expect(record.error?.code).toBe('capture.over-budget');
      expect(record.error?.message).toContain('discarded');

      // Nothing was left behind: no file, and no scratch directory either.
      const animationsDir = join(runDir, 'animations');
      const leftovers = existsSync(animationsDir) ? readdirSync(animationsDir) : [];
      expect(leftovers).toEqual([]);
    } finally {
      await removeDir(outputRoot);
    }
  }, 60_000);

  it('leaves no scratch directory behind after a recording it kept', async () => {
    const outputRoot = await makeOutputDir('screencast-clean');
    try {
      const { runDir } = await animations(outputRoot, '/motion.html', [
        '--video',
        '--video-ms', '600',
      ]);
      const leftovers = readdirSync(join(runDir, 'animations'));
      expect(leftovers.some((name) => name.startsWith('.recording-'))).toBe(false);
    } finally {
      await removeDir(outputRoot);
    }
  }, 60_000);
});
