/**
 * What the launcher's list can honestly say about sessions it did not run.
 *
 * The list now spans projects, so these read real directories rather than a
 * fake: the whole point of the change is that the panel agrees with what is on
 * disk, and a mocked filesystem could not catch it disagreeing.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureDir, recordProjectSession } from '@ui-atlas/artifacts';
import { SCHEMA_VERSION } from '@ui-atlas/protocol';
import {
  countSessionsTodayOnDisk,
  readRecentSessions,
} from '../../apps/launcher/src/runs.js';

const ROOT = fileURLToPath(new URL('../../test-output/', import.meta.url));

let dir: string;

beforeEach(async () => {
  mkdirSync(ROOT, { recursive: true });
  dir = await mkdtemp(join(ROOT, 'launcher-sessions-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeSession(input: {
  project: string;
  sessionId: string;
  url: string;
  captured?: number;
  finishedAt?: string | undefined;
  withPage?: boolean;
  withReport?: boolean;
}): Promise<void> {
  const runDir = join(dir, input.project, input.sessionId);
  await ensureDir(runDir);
  await writeFile(
    join(runDir, 'run.json'),
    JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      runId: input.sessionId,
      project: input.project,
      command: `inspect ${input.url}`,
      startedAt: '2026-08-12T16:00:00.000Z',
      ...(input.finishedAt === undefined ? {} : { finishedAt: input.finishedAt }),
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
      counts: { captured: input.captured ?? 2, failed: 0, skipped: 0, pages: 1 },
      warnings: [],
    }),
  );

  if (input.withPage !== false) {
    await writeFile(
      join(runDir, 'pages.jsonl'),
      `${JSON.stringify({
        schemaVersion: SCHEMA_VERSION,
        id: `page-${input.sessionId}`,
        runId: input.sessionId,
        requestedUrl: input.url,
        finalUrl: input.url,
        routeKey: 'route',
        visitedAt: '2026-08-12T16:00:01.000Z',
        warnings: [],
      })}\n`,
    );
  }

  if (input.withReport === true) {
    await ensureDir(join(runDir, 'report'));
    await writeFile(join(runDir, 'report', 'index.html'), '<!doctype html>');
  }

  await recordProjectSession({
    outputRoot: dir,
    project: input.project,
    url: input.url,
    sessionId: input.sessionId,
  });
}

describe('readRecentSessions', () => {
  it('merges every project, newest first, and names which project each is', async () => {
    await writeSession({
      project: 'stripe-com',
      sessionId: '20260811T160000Z-aaa111',
      url: 'https://stripe.com/pricing',
      finishedAt: '2026-08-11T16:10:00.000Z',
    });
    await writeSession({
      project: 'shop-example-com',
      sessionId: '20260812T160000Z-bbb222',
      url: 'https://shop.example.com/cart',
      finishedAt: '2026-08-12T16:10:00.000Z',
    });

    const sessions = await readRecentSessions({ outputRoot: dir });
    expect(sessions.map((session) => session.project)).toEqual(['shop-example-com', 'stripe-com']);
    expect(sessions[0]?.label).toBe('/cart');
    expect(sessions[1]?.label).toBe('/pricing');
  });

  it('offers the page the session actually loaded as where to reopen', async () => {
    await writeSession({
      project: 'stripe-com',
      sessionId: '20260812T160000Z-aaa111',
      url: 'https://stripe.com/pricing',
      finishedAt: '2026-08-12T16:10:00.000Z',
    });

    const [session] = await readRecentSessions({ outputRoot: dir });
    expect(session?.resumeUrl).toBe('https://stripe.com/pricing');
  });

  it('falls back to the project’s last URL when a session recorded no page', async () => {
    await writeSession({
      project: 'stripe-com',
      sessionId: '20260812T160000Z-aaa111',
      url: 'https://stripe.com/docs',
      finishedAt: '2026-08-12T16:10:00.000Z',
      withPage: false,
    });

    const [session] = await readRecentSessions({ outputRoot: dir });
    expect(session?.resumeUrl).toBe('https://stripe.com/docs');
  });

  it('only says a report exists when one does', async () => {
    await writeSession({
      project: 'a-com',
      sessionId: '20260812T160000Z-aaa111',
      url: 'https://a.com/',
      finishedAt: '2026-08-12T16:10:00.000Z',
      withReport: true,
    });
    await writeSession({
      project: 'b-com',
      sessionId: '20260811T160000Z-bbb222',
      url: 'https://b.com/',
      finishedAt: '2026-08-11T16:10:00.000Z',
    });

    const sessions = await readRecentSessions({ outputRoot: dir });
    expect(sessions[0]?.hasReport).toBe(true);
    expect(sessions[1]?.hasReport).toBe(false);
  });

  it('honours the limit across the merged list, not per project', async () => {
    for (let index = 0; index < 3; index += 1) {
      await writeSession({
        project: `site-${String(index)}-com`,
        sessionId: `2026081${String(index + 1)}T160000Z-aaa11${String(index)}`,
        url: `https://site-${String(index)}.com/`,
        finishedAt: `2026-08-1${String(index + 1)}T16:10:00.000Z`,
      });
    }

    expect(await readRecentSessions({ outputRoot: dir, limit: 2 })).toHaveLength(2);
  });

  it('is empty, not an error, when nothing has been captured', async () => {
    expect(await readRecentSessions({ outputRoot: join(dir, 'nothing') })).toEqual([]);
  });
});

describe('countSessionsTodayOnDisk', () => {
  it('counts across every project', async () => {
    const now = Date.parse('2026-08-12T18:00:00.000Z');
    await writeSession({
      project: 'stripe-com',
      sessionId: '20260812T160000Z-aaa111',
      url: 'https://stripe.com/',
      finishedAt: '2026-08-12T16:10:00.000Z',
    });
    await writeSession({
      project: 'shop-example-com',
      sessionId: '20260812T170000Z-bbb222',
      url: 'https://shop.example.com/',
      finishedAt: '2026-08-12T17:10:00.000Z',
    });
    await writeSession({
      project: 'old-com',
      sessionId: '20260801T160000Z-ccc333',
      url: 'https://old.com/',
      finishedAt: '2026-08-01T16:10:00.000Z',
    });

    expect(await countSessionsTodayOnDisk(dir, now)).toBe(2);
  });
});
