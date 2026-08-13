/**
 * Whether the "Build packages" row has anything to do.
 *
 * The design labels that row "first run only", which is true and also the kind
 * of claim that rots: the second run after editing a package is exactly when a
 * skipped build produces a confusing failure three stages later. So the row is
 * skipped on evidence — the outputs exist and none of the sources is newer —
 * rather than on a flag that says a build happened once.
 *
 * Pure, so the staleness rule is a unit test rather than a thing you discover
 * by deleting `dist` and watching.
 */

/** Bundles and compiled entry points a launch actually loads. */
export const BUILD_OUTPUTS: readonly string[] = [
  'apps/cli/dist/bin.js',
  'packages/overlay/dist/page-bundle.js',
  'packages/overlay/dist/probe-bundle.js',
  'packages/reporter/dist/app-bundle.js',
];

export type BuildStep = { label: string; args: readonly string[] };

/**
 * The same three things `npm run build` does, run directly so the launcher
 * needs a working Node and nothing else — not an `npm` on the PATH, which a
 * GUI process launched from Finder frequently does not have.
 */
export const BUILD_STEPS: readonly BuildStep[] = [
  { label: 'typescript', args: ['node_modules/typescript/bin/tsc', '-b', 'tsconfig.json'] },
  { label: 'overlay', args: ['packages/overlay/build.mjs'] },
  { label: 'reporter', args: ['packages/reporter/build.mjs'] },
];

export interface BuildInputs {
  /** Modified time of each output, absent when the file is not there. */
  outputs: ReadonlyArray<number | undefined>;
  /** Newest modified time across the workspace's TypeScript sources. */
  newestSource: number | undefined;
}

export type BuildDecision =
  | { needed: true; reason: 'missing' | 'stale' }
  | { needed: false; reason: 'current' };

/**
 * Every output must exist, and the last time the build wrote anything must be
 * after the last time a source changed.
 *
 * The comparison is against the **newest** output, which reads backwards until
 * you remember that `tsc -b` is incremental: it does not rewrite an output
 * whose inputs did not change. Measured against the *oldest* output, a
 * perfectly current workspace looks stale forever, because some `dist/bin.js`
 * compiled last week is genuinely older than a file edited this morning — and
 * correctly so. The newest output is the honest question: when did a build last
 * do any work at all?
 */
export function decideBuild(inputs: BuildInputs): BuildDecision {
  const times: number[] = [];
  for (const time of inputs.outputs) {
    if (time === undefined) return { needed: true, reason: 'missing' };
    times.push(time);
  }
  if (times.length === 0) return { needed: true, reason: 'missing' };

  const lastBuildWrote = Math.max(...times);
  if (inputs.newestSource !== undefined && inputs.newestSource > lastBuildWrote) {
    return { needed: true, reason: 'stale' };
  }
  return { needed: false, reason: 'current' };
}

/** What the skipped row says, so the reason is never silently swallowed. */
export function buildNote(decision: BuildDecision): string {
  switch (decision.reason) {
    case 'missing':
      return 'first run only';
    case 'stale':
      return 'sources changed';
    case 'current':
      return 'already built';
  }
}
