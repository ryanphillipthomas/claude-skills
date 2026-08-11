import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEWPORT_PRESETS,
  defaultConfig,
  deepMerge,
  findConfigFile,
  loadConfig,
  validateConfig,
} from '@ui-atlas/config';
import { UiAtlasError } from '@ui-atlas/protocol';

const ROOT = fileURLToPath(new URL('../../test-output/', import.meta.url));
let dir: string;

beforeEach(async () => {
  mkdirSync(ROOT, { recursive: true });
  dir = await mkdtemp(join(ROOT, 'config-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('defaults', () => {
  it('fills in a complete, usable configuration', () => {
    const config = defaultConfig();
    expect(config.project).toBe('default');
    expect(config.browser.mode).toBe('clean');
    expect(config.settle.totalTimeoutMs).toBe(12_000);
    expect(config.settle.loadState).not.toBe('networkidle');
    expect(config.viewports).toHaveLength(DEFAULT_VIEWPORT_PRESETS.length);
    expect(config.capture.disableAnimations).toBe(true);
  });

  it('marks mobile presets as mobile emulation', () => {
    const config = defaultConfig();
    const mobile = config.viewports.filter((preset) => preset.mode === 'mobile');
    expect(mobile.map((preset) => preset.name)).toEqual(['mobile-sm', 'mobile-lg']);
  });
});

describe('deepMerge', () => {
  it('merges nested objects and replaces arrays wholesale', () => {
    const merged = deepMerge(
      { a: { b: 1, c: 2 }, list: [1, 2, 3] },
      { a: { c: 9 }, list: [7] },
    );
    expect(merged).toEqual({ a: { b: 1, c: 9 }, list: [7] });
  });

  it('ignores undefined overrides', () => {
    expect(deepMerge({ a: 1, b: 2 }, { a: undefined, b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it('drops prototype-polluting keys from untrusted config', () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": true}, "a": 2}') as Record<string, unknown>;
    const merged = deepMerge({ a: 1 }, hostile);
    expect(merged['a']).toBe(2);
    expect(Object.prototype.hasOwnProperty.call(merged, '__proto__')).toBe(false);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });
});

describe('validateConfig', () => {
  it('rejects a project name that is not a safe directory name', () => {
    expect(() => validateConfig({ project: '../escape' })).toThrow(UiAtlasError);
    expect(() => validateConfig({ project: 'ok-name_1' })).not.toThrow();
  });

  it('reports the offending path in the message', () => {
    try {
      validateConfig({ settle: { totalTimeoutMs: 5 } }, 'my-config.yml');
      throw new Error('expected a failure');
    } catch (error) {
      expect((error as UiAtlasError).message).toContain('my-config.yml is invalid');
      expect((error as UiAtlasError).message).toContain('settle.totalTimeoutMs');
    }
  });

  it('rejects an unusable viewport', () => {
    expect(() => validateConfig({ viewport: { width: 10 } })).toThrow(/viewport.width/);
  });
});

describe('loadConfig', () => {
  it('reads YAML and applies overrides on top', async () => {
    const path = join(dir, 'ui-atlas.config.yml');
    await writeFile(
      path,
      ['project: from-file', 'settle:', '  mutationQuietMs: 750', 'viewports:', '  - { name: only, width: 900, height: 700 }'].join('\n'),
    );

    const loaded = await loadConfig({ configPath: path, overrides: { project: 'from-cli' } });
    expect(loaded.config.project).toBe('from-cli');
    expect(loaded.config.settle.mutationQuietMs).toBe(750);
    expect(loaded.config.viewports).toHaveLength(1);
    expect(loaded.config.settle.totalTimeoutMs).toBe(12_000);
    expect(loaded.sourcePath).toBe(path);
  });

  it('reads JSON too', async () => {
    const path = join(dir, 'ui-atlas.config.json');
    await writeFile(path, JSON.stringify({ project: 'json-project' }));
    const loaded = await loadConfig({ configPath: path });
    expect(loaded.config.project).toBe('json-project');
  });

  it('fails loudly when an explicit config file is missing', async () => {
    await expect(loadConfig({ configPath: join(dir, 'nope.yml') })).rejects.toThrow(/config file not found/);
  });

  it('reports a parse error against the file it came from', async () => {
    const path = join(dir, 'ui-atlas.config.yml');
    await writeFile(path, 'project: [unclosed\n');
    await expect(loadConfig({ configPath: path })).rejects.toThrow(/could not parse/);
  });

  it('falls back to defaults when there is no config file', async () => {
    const loaded = await loadConfig({ cwd: dir, skipDiscovery: true });
    expect(loaded.sourcePath).toBeUndefined();
    expect(loaded.config.project).toBe('default');
  });

  it('discovers a config file by walking up', async () => {
    const path = join(dir, 'ui-atlas.config.yml');
    await writeFile(path, 'project: discovered\n');
    mkdirSync(join(dir, 'a', 'b'), { recursive: true });
    expect(findConfigFile(join(dir, 'a', 'b'))).toBe(path);
  });
});
