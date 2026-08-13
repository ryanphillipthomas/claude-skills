import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ensureDir,
  listProjects,
  projectPaths,
  projectSlugFromUrl,
  readProjectManifest,
  readProjectSessions,
  recordProjectSession,
  siteFromUrl,
} from '@ui-atlas/artifacts';
import { SCHEMA_VERSION } from '@ui-atlas/protocol';

const ROOT = fileURLToPath(new URL('../../test-output/', import.meta.url));

let dir: string;

beforeEach(async () => {
  mkdirSync(ROOT, { recursive: true });
  dir = await mkdtemp(join(ROOT, 'project-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A finished session on disk, without running a browser to make one. */
async function writeSession(
  outputRoot: string,
  project: string,
  sessionId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const runDir = join(outputRoot, project, sessionId);
  await ensureDir(runDir);
  await writeFile(
    join(runDir, 'run.json'),
    JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      runId: sessionId,
      project,
      command: 'inspect https://example.com/',
      startedAt: '2026-08-12T16:00:00.000Z',
      finishedAt: '2026-08-12T16:04:00.000Z',
      toolVersion: '0.1.0',
      browser: { engine: 'chromium', mode: 'clean', headless: true },
      baseViewport: {
        name: 'base',
        width: 1280,
        height: 800,
        deviceScaleFactor: 1,
        mobile: false,
        hasTouch: false,
        userAgentClass: 'desktop',
      },
      counts: { captured: 3, failed: 0, skipped: 0, pages: 1 },
      warnings: [],
      ...overrides,
    }),
  );
  return runDir;
}

describe('projectSlugFromUrl', () => {
  it('names the directory after the site', () => {
    expect(projectSlugFromUrl('https://stripe.com/pricing')).toBe('stripe-com');
    expect(projectSlugFromUrl('https://shop.example.co.uk/a/b?c=1')).toBe('shop-example-co-uk');
  });

  it('drops www so the bare domain and the www one are one project', () => {
    expect(projectSlugFromUrl('https://www.stripe.com/')).toBe('stripe-com');
    expect(projectSlugFromUrl('https://www.stripe.com/')).toBe(projectSlugFromUrl('https://stripe.com/'));
  });

  it('keeps the port, because two dev servers are two sites', () => {
    expect(projectSlugFromUrl('http://localhost:3000/')).toBe('localhost-3000');
    expect(projectSlugFromUrl('http://localhost:4173/')).toBe('localhost-4173');
    expect(projectSlugFromUrl('http://localhost:3000/')).not.toBe(
      projectSlugFromUrl('http://localhost:4173/'),
    );
  });

  it('always starts with an alphanumeric, so it is a valid project name', () => {
    for (const url of ['https://stripe.com', 'http://[::1]:8080/', 'http://127.0.0.1:4173/']) {
      expect(projectSlugFromUrl(url)).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
    }
  });

  it('does not throw on something that is not a URL', () => {
    expect(projectSlugFromUrl('not a url')).toMatch(/^[A-Za-z0-9]/);
  });
});

describe('siteFromUrl', () => {
  it('records the origin and the entry, not the path as the site', () => {
    const site = siteFromUrl('https://www.stripe.com/pricing?plan=pro');
    expect(site.origin).toBe('https://www.stripe.com');
    expect(site.host).toBe('www.stripe.com');
    expect(site.label).toBe('stripe.com');
    expect(site.entryUrl).toBe('https://www.stripe.com/pricing?plan=pro');
  });
});

describe('recordProjectSession', () => {
  it('creates the project on first sight', async () => {
    const manifest = await recordProjectSession({
      outputRoot: dir,
      project: 'stripe-com',
      url: 'https://stripe.com/pricing',
      sessionId: '20260812T160000Z-a1b2c3',
      now: new Date('2026-08-12T16:00:00.000Z'),
    });

    expect(manifest.site.origin).toBe('https://stripe.com');
    expect(manifest.createdAt).toBe('2026-08-12T16:00:00.000Z');
    expect(manifest.lastSessionId).toBe('20260812T160000Z-a1b2c3');

    const onDisk = await readProjectManifest(projectPaths(dir, 'stripe-com').manifest);
    expect(onDisk?.project).toBe('stripe-com');
  });

  it('keeps the first door in, and moves only what changed', async () => {
    await recordProjectSession({
      outputRoot: dir,
      project: 'stripe-com',
      url: 'https://stripe.com/pricing',
      sessionId: 'one',
      now: new Date('2026-08-12T16:00:00.000Z'),
    });
    const second = await recordProjectSession({
      outputRoot: dir,
      project: 'stripe-com',
      url: 'https://stripe.com/docs',
      sessionId: 'two',
      now: new Date('2026-08-13T09:00:00.000Z'),
    });

    // One project, one site, whichever page each sitting started on.
    expect(second.site.entryUrl).toBe('https://stripe.com/pricing');
    expect(second.createdAt).toBe('2026-08-12T16:00:00.000Z');
    expect(second.updatedAt).toBe('2026-08-13T09:00:00.000Z');
    expect(second.lastUrl).toBe('https://stripe.com/docs');
    expect(second.lastSessionId).toBe('two');
  });

  it('replaces a manifest it cannot read rather than refusing to write', async () => {
    const paths = projectPaths(dir, 'stripe-com');
    await ensureDir(paths.projectDir);
    await writeFile(paths.manifest, '{ this is not json');

    const manifest = await recordProjectSession({
      outputRoot: dir,
      project: 'stripe-com',
      url: 'https://stripe.com/',
      sessionId: 'one',
    });
    expect(manifest.site.host).toBe('stripe.com');
  });
});

describe('readProjectSessions', () => {
  it('reads sessions newest first, with what each one recorded', async () => {
    await writeSession(dir, 'stripe-com', '20260811T160000Z-old111');
    await writeSession(dir, 'stripe-com', '20260812T160000Z-new222');

    const sessions = await readProjectSessions(dir, 'stripe-com');
    expect(sessions.map((session) => session.id)).toEqual([
      '20260812T160000Z-new222',
      '20260811T160000Z-old111',
    ]);
    expect(sessions[0]?.counts?.captured).toBe(3);
    expect(sessions[0]?.open).toBe(false);
  });

  it('calls a session with no finishedAt open rather than reporting a zero', async () => {
    await writeSession(dir, 'stripe-com', '20260812T160000Z-live33', {
      finishedAt: undefined,
      counts: undefined,
    });
    const [session] = await readProjectSessions(dir, 'stripe-com');
    expect(session?.open).toBe(true);
    expect(session?.counts).toBeUndefined();
  });

  it('skips a directory it cannot read instead of failing the list', async () => {
    await writeSession(dir, 'stripe-com', '20260812T160000Z-good44');
    const broken = join(dir, 'stripe-com', '20260812T170000Z-bad555');
    await ensureDir(broken);
    await writeFile(join(broken, 'run.json'), 'not json at all');

    const sessions = await readProjectSessions(dir, 'stripe-com');
    expect(sessions.map((session) => session.id)).toEqual(['20260812T160000Z-good44']);
  });

  it('ignores directories that are not sessions', async () => {
    await writeSession(dir, 'stripe-com', '20260812T160000Z-real66');
    await ensureDir(join(dir, 'stripe-com', 'exports'));

    const sessions = await readProjectSessions(dir, 'stripe-com');
    expect(sessions).toHaveLength(1);
  });
});

describe('listProjects', () => {
  it('lists projects most recently used first', async () => {
    await writeSession(dir, 'stripe-com', '20260811T160000Z-aaa111');
    await writeSession(dir, 'shop-example-com', '20260812T160000Z-bbb222');

    const projects = await listProjects(dir);
    expect(projects.map((project) => project.project)).toEqual(['shop-example-com', 'stripe-com']);
    expect(projects[0]?.sessionCount).toBe(1);
  });

  it('still lists a project written before project.json existed', async () => {
    await writeSession(dir, 'legacy-project', '20260812T160000Z-ccc333');
    const projects = await listProjects(dir);
    expect(projects[0]?.project).toBe('legacy-project');
    expect(projects[0]?.manifest).toBeUndefined();
  });

  it('is empty, not an error, when nothing has been captured', async () => {
    expect(await listProjects(join(dir, 'nothing-here'))).toEqual([]);
  });
});
