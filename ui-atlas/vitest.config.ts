import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (name: string, sub = 'src/index.ts'): string =>
  fileURLToPath(new URL(`./packages/${name}/${sub}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Run tests against TypeScript sources, not build output, so a stale
    // `dist/` can never mask a source regression. The overlay page bundle is
    // still built by `pretest` because it is loaded from disk at runtime.
    alias: [
      { find: /^@ui-atlas\/protocol$/, replacement: pkg('protocol') },
      { find: /^@ui-atlas\/protocol\/constants$/, replacement: pkg('protocol', 'src/constants.ts') },
      { find: /^@ui-atlas\/config$/, replacement: pkg('config') },
      { find: /^@ui-atlas\/artifacts$/, replacement: pkg('artifacts') },
      { find: /^@ui-atlas\/identity$/, replacement: pkg('identity') },
      { find: /^@ui-atlas\/identity\/dom$/, replacement: pkg('identity', 'src/dom/index.ts') },
      { find: /^@ui-atlas\/identity\/core$/, replacement: pkg('identity', 'src/core/index.ts') },
      { find: /^@ui-atlas\/settle$/, replacement: pkg('settle') },
      { find: /^@ui-atlas\/browser$/, replacement: pkg('browser') },
      { find: /^@ui-atlas\/capture$/, replacement: pkg('capture') },
      { find: /^@ui-atlas\/overlay$/, replacement: pkg('overlay', 'src/host/index.ts') },
      { find: /^@ui-atlas\/reporter$/, replacement: pkg('reporter') },
      { find: /^@ui-atlas\/crawler$/, replacement: pkg('crawler') },
      { find: /^@ui-atlas\/animation$/, replacement: pkg('animation') },
    ],
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    teardownTimeout: 20_000,
    pool: 'forks',
    poolOptions: {
      // Browser integration tests are heavy; keep them serialised so a single
      // machine does not thrash between many concurrent Chromium instances.
      forks: { singleFork: true },
    },
    reporters: ['default'],
  },
});
