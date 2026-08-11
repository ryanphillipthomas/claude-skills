import { mkdtemp, rm } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig, type UiAtlasConfig } from '@ui-atlas/config';
import { AtlasSession } from '../../apps/cli/src/session.js';
import { createLogger, type Logger } from '../../apps/cli/src/logger.js';
import { startFixtureServer, type FixtureServer } from '../fixtures/serve.ts';

const TEST_OUTPUT_ROOT = fileURLToPath(new URL('../../test-output/', import.meta.url));

export function silentLogger(): Logger {
  const lines: string[] = [];
  const logger = createLogger({ level: 'warn', write: (line) => lines.push(line) });
  return logger;
}

export async function makeOutputDir(prefix = 'run'): Promise<string> {
  mkdirSync(TEST_OUTPUT_ROOT, { recursive: true });
  return mkdtemp(join(TEST_OUTPUT_ROOT, `${prefix}-`));
}

export async function removeDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export interface TestHarness {
  server: FixtureServer;
  session: AtlasSession;
  outputRoot: string;
  url(path: string): string;
  dispose(): Promise<void>;
}

export function testConfig(overrides: Record<string, unknown> = {}): UiAtlasConfig {
  return validateConfig({
    project: 'fixture',
    browser: { headless: true, mode: 'clean', navigationTimeoutMs: 20_000 },
    // Short budgets keep the suite quick; the fixture pages settle fast.
    settle: { totalTimeoutMs: 6_000, mutationQuietMs: 200, geometryQuietMs: 120, fontTimeoutMs: 1_500, imageTimeoutMs: 1_500 },
    capture: { screenshotTimeoutMs: 12_000 },
    overlay: { enabled: true, autoInspect: false },
    ...overrides,
  });
}

export interface HarnessOptions {
  overlay?: boolean;
  config?: Record<string, unknown>;
  /** Start a second origin so cross-origin iframe tests have somewhere to point. */
  secondOrigin?: boolean;
}

/**
 * Boots the controlled fixture site plus a real headless session. Every
 * interaction test runs against this and never touches an external site.
 */
export async function startHarness(options: HarnessOptions = {}): Promise<TestHarness> {
  const server = await startFixtureServer();
  const outputRoot = await makeOutputDir();
  const session = await AtlasSession.start({
    config: testConfig(options.config),
    outputRoot,
    command: 'test',
    toolVersion: '0.0.0-test',
    logger: silentLogger(),
    overlay: options.overlay ?? true,
  });

  return {
    server,
    session,
    outputRoot,
    url: (path: string) => server.url(path),
    dispose: async () => {
      await session.close().catch(() => undefined);
      await server.close();
      await removeDir(outputRoot);
    },
  };
}

export { startFixtureServer };
export type { FixtureServer };
