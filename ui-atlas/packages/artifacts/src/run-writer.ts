import {
  AnimationRecordSchema,
  CaptureRecordSchema,
  CrawlStateSchema,
  DesignTokenReportSchema,
  InteractionCandidateSchema,
  PageRecordSchema,
  RunManifestSchema,
  SCHEMA_VERSION,
  UiAtlasError,
  type AnimationRecord,
  type CaptureRecord,
  type CrawlState,
  type DesignTokenReport,
  type InteractionCandidate,
  type PageRecord,
  type RunManifest,
  type Screencast,
} from '@ui-atlas/protocol';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { appendJsonLine, atomicWriteFile, ensureDir, sha256 } from './atomic.js';
import { groupForIndex, renderRouteIndex, renderRunIndex } from './index-doc.js';
import { pngDimensions } from './png.js';
import { resolveWithinRoot, sanitizeFileStem, sanitizeSegment, toRecordPath } from './paths.js';
import { readCaptures, readPages, readRunManifest } from './read.js';
import { formatIssues } from './validate.js';

export interface RunPaths {
  /** Absolute root that nothing may escape. */
  outputRoot: string;
  /** `<outputRoot>/<project>/<runId>` */
  runDir: string;
  runManifest: string;
  capturesJsonl: string;
  pagesJsonl: string;
  screenshotsDir: string;
  animationsDir: string;
  tracesDir: string;
  reportDir: string;
  crawlState: string;
  interactionsJsonl: string;
  suggestedRecipes: string;
  animationsJsonl: string;
  tokens: string;
}

export function runPaths(outputRoot: string, project: string, runId: string): RunPaths {
  const projectSegment = sanitizeSegment(project, 'default');
  const runSegment = sanitizeSegment(runId, 'run');
  const runDir = resolveWithinRoot(outputRoot, projectSegment, runSegment);
  return {
    outputRoot,
    runDir,
    runManifest: resolveWithinRoot(runDir, 'run.json'),
    capturesJsonl: resolveWithinRoot(runDir, 'captures.jsonl'),
    pagesJsonl: resolveWithinRoot(runDir, 'pages.jsonl'),
    screenshotsDir: resolveWithinRoot(runDir, 'screenshots'),
    animationsDir: resolveWithinRoot(runDir, 'animations'),
    tracesDir: resolveWithinRoot(runDir, 'traces'),
    reportDir: resolveWithinRoot(runDir, 'report'),
    crawlState: resolveWithinRoot(runDir, 'crawl-state.json'),
    interactionsJsonl: resolveWithinRoot(runDir, 'interactions.jsonl'),
    suggestedRecipes: resolveWithinRoot(runDir, 'suggested-recipes.yml'),
    animationsJsonl: resolveWithinRoot(runDir, 'animations.jsonl'),
    tokens: resolveWithinRoot(runDir, 'tokens.json'),
  };
}

export interface ScreenshotTarget {
  routeKey: string;
  viewportLabel: string;
  captureId: string;
  /**
   * Readable filename stem, from `captureSlug`. The capture id is used when
   * this is absent — an opaque name is worse than a descriptive one, but it is
   * still a name, and nothing may go unwritten for want of one.
   */
  stem?: string | undefined;
}

/**
 * Owns everything written for one run. Records are validated before they touch
 * the disk so a malformed record fails loudly at its source rather than being
 * discovered later by the report.
 */
export class RunWriter {
  readonly paths: RunPaths;
  private manifest: RunManifest;
  private counts = { captured: 0, failed: 0, skipped: 0, pages: 0 };
  private initialised = false;
  /**
   * Every `<dir>/<stem>` this run has already used. Descriptive names collide —
   * two "Save" buttons on one page at one viewport is ordinary — and a
   * collision would silently overwrite an artifact *and* its sidecar.
   */
  private readonly claimedStems = new Set<string>();

  constructor(outputRoot: string, manifest: RunManifest) {
    const parsed = RunManifestSchema.safeParse(manifest);
    if (!parsed.success) {
      throw new UiAtlasError('artifact.write-failed', 'invalid run manifest', {
        detail: { issues: formatIssues(parsed.error) },
      });
    }
    this.manifest = parsed.data;
    this.paths = runPaths(outputRoot, manifest.project, manifest.runId);
  }

  get runId(): string {
    return this.manifest.runId;
  }

  get project(): string {
    return this.manifest.project;
  }

  async init(): Promise<void> {
    await ensureDir(this.paths.runDir);
    await ensureDir(this.paths.screenshotsDir);
    await this.writeManifest();
    this.initialised = true;
  }

  /**
   * Reopen an existing run directory so a resumed crawl appends to the run it
   * was interrupted in rather than starting a new one. Counts are recovered
   * from the records already on disk, so the final manifest totals the whole
   * run and not just the part after the restart.
   */
  static async resume(outputRoot: string, project: string, runId: string): Promise<RunWriter> {
    const paths = runPaths(outputRoot, project, runId);
    if (!existsSync(paths.runManifest)) {
      throw new UiAtlasError('artifact.write-failed', `no run to resume at ${paths.runDir}`, {
        detail: { runDir: paths.runDir },
      });
    }
    const manifest = await readRunManifest(paths.runManifest);
    const writer = new RunWriter(outputRoot, manifest);

    const [captures, pages] = await Promise.all([
      readCaptures(paths.capturesJsonl),
      readPages(paths.pagesJsonl),
    ]);
    for (const record of captures.records) {
      if (record.status === 'captured') writer.counts.captured += 1;
      else if (record.status === 'failed') writer.counts.failed += 1;
      else writer.counts.skipped += 1;

      // Names claimed before the interruption stay claimed, or the resumed run
      // would write `button--save--hover.png` straight over the one it already
      // has and the earlier record would point at the later image.
      const artifact = record.image?.relativePath ?? record.video?.relativePath;
      if (artifact !== undefined) writer.claimedStems.add(stripExtension(artifact));
    }
    writer.counts.pages = pages.records.length;

    await writer.init();
    return writer;
  }

  /**
   * Absolute path a failure trace for `pageId` must be written to, with its
   * directory created. Traces can contain session cookies, so they live under
   * the run's own `traces/` directory and nowhere else.
   */
  async traceDestination(pageId: string): Promise<string> {
    this.assertReady();
    await ensureDir(this.paths.tracesDir);
    return resolveWithinRoot(this.paths.tracesDir, `${sanitizeSegment(pageId, 'page')}.zip`);
  }

  /** Crawl frontier from a previous run, or `undefined` if there is none. */
  async readCrawlState(): Promise<CrawlState | undefined> {
    if (!existsSync(this.paths.crawlState)) return undefined;
    const text = await readFile(this.paths.crawlState, 'utf8');
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      return undefined;
    }
    const parsed = CrawlStateSchema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  }

  private assertReady(): void {
    if (!this.initialised) {
      throw new UiAtlasError('artifact.write-failed', 'RunWriter.init() was not awaited');
    }
  }

  private async writeManifest(): Promise<void> {
    await atomicWriteFile(this.paths.runManifest, `${JSON.stringify(this.manifest, null, 2)}\n`);
  }

  /**
   * The directory a capture belongs in: one folder per route, one per viewport
   * inside it. This is the organisation, and it is deliberately the same shape
   * for stills and recordings so that "everything from this page at this size"
   * is a single folder in each tree.
   */
  private captureDir(root: string, target: ScreenshotTarget): { absolute: string; relative: string } {
    const route = sanitizeSegment(target.routeKey, 'route');
    const viewport = sanitizeSegment(target.viewportLabel, 'viewport');
    return {
      absolute: resolveWithinRoot(root, route, viewport),
      relative: `${toRecordPath(this.paths.runDir, root)}/${route}/${viewport}`,
    };
  }

  /**
   * Reserve a filename stem in a directory, adding `-2`, `-3`… when the name is
   * taken. The suffix is the honest thing to do: these really are two different
   * captures that a human would give the same name, and the sidecar beside each
   * says which is which.
   */
  private claimStem(dirRelative: string, target: ScreenshotTarget): string {
    const desired = target.stem === undefined ? undefined : sanitizeFileStem(target.stem, '');
    const base =
      desired === undefined || desired.length === 0
        ? sanitizeSegment(target.captureId, 'capture')
        : desired;

    for (let attempt = 1; attempt <= 500; attempt += 1) {
      const stem = attempt === 1 ? base : `${base}-${String(attempt)}`;
      const key = `${dirRelative}/${stem}`;
      if (!this.claimedStems.has(key)) {
        this.claimedStems.add(key);
        return stem;
      }
    }
    // Beyond absurd, but a capture is never lost for want of a name: the
    // capture id is unique by construction.
    const stem = `${base}-${sanitizeSegment(target.captureId, 'capture')}`;
    this.claimedStems.add(`${dirRelative}/${stem}`);
    return stem;
  }

  /**
   * Absolute path a screenshot for `target` must be written to. Pure: it does
   * not reserve the name, so callers that need uniqueness go through
   * `writeScreenshot`.
   */
  screenshotPath(target: ScreenshotTarget): string {
    const dir = this.captureDir(this.paths.screenshotsDir, target);
    const stem =
      target.stem === undefined
        ? sanitizeSegment(target.captureId, 'capture')
        : sanitizeFileStem(target.stem, sanitizeSegment(target.captureId, 'capture'));
    return resolveWithinRoot(dir.absolute, `${stem}.png`);
  }

  /**
   * Persist PNG bytes atomically and return the image reference (relative path,
   * checksum, real pixel dimensions) for the capture record.
   */
  async writeScreenshot(
    target: ScreenshotTarget,
    bytes: Buffer,
  ): Promise<CaptureRecord['image'] & object> {
    this.assertReady();
    const dir = this.captureDir(this.paths.screenshotsDir, target);
    const stem = this.claimStem(dir.relative, target);
    const absolute = resolveWithinRoot(dir.absolute, `${stem}.png`);
    const { width, height } = pngDimensions(bytes);
    const written = await atomicWriteFile(absolute, bytes);
    return {
      relativePath: toRecordPath(this.paths.runDir, absolute),
      sha256: written.sha256,
      width,
      height,
      byteLength: written.byteLength,
    };
  }

  videoPath(target: ScreenshotTarget): string {
    const dir = this.captureDir(this.paths.animationsDir, target);
    const stem =
      target.stem === undefined
        ? sanitizeSegment(target.captureId, 'capture')
        : sanitizeFileStem(target.stem, sanitizeSegment(target.captureId, 'capture'));
    return resolveWithinRoot(dir.absolute, `${stem}.webm`);
  }

  /**
   * A scratch directory for the browser to record into, inside the run rather
   * than in the system temp directory: a recording that is never claimed is
   * then visible where the rest of the run's mess would be, and
   * `discardVideoWorkspace` removes it either way.
   */
  async videoWorkspace(captureId: string): Promise<string> {
    this.assertReady();
    const dir = resolveWithinRoot(
      this.paths.animationsDir,
      `.recording-${sanitizeSegment(captureId, 'capture')}`,
    );
    await ensureDir(dir);
    return dir;
  }

  async discardVideoWorkspace(dir: string): Promise<void> {
    // Guarded: only ever removes a directory inside this run's animations.
    if (!dir.startsWith(this.paths.animationsDir)) return;
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }

  /**
   * Persist a recording and describe it. `meta` carries what the file itself
   * cannot say — how long the window was, how far into the file it starts, and
   * what the recording does not promise.
   */
  async writeVideo(
    target: ScreenshotTarget,
    bytes: Buffer,
    meta: Omit<Screencast, 'relativePath' | 'sha256' | 'byteLength' | 'format'>,
  ): Promise<Screencast> {
    this.assertReady();
    const dir = this.captureDir(this.paths.animationsDir, target);
    const absolute = resolveWithinRoot(dir.absolute, `${this.claimStem(dir.relative, target)}.webm`);
    const written = await atomicWriteFile(absolute, bytes);
    return {
      ...meta,
      relativePath: toRecordPath(this.paths.runDir, absolute),
      sha256: written.sha256,
      byteLength: written.byteLength,
      format: 'webm',
    };
  }

  /**
   * Append a capture to `captures.jsonl` and drop a sidecar JSON next to the
   * image so a single screenshot is never separated from its metadata.
   */
  async addCapture(record: CaptureRecord): Promise<CaptureRecord> {
    this.assertReady();
    const parsed = CaptureRecordSchema.safeParse(record);
    if (!parsed.success) {
      throw new UiAtlasError('artifact.write-failed', 'invalid capture record', {
        detail: { captureId: record.id, issues: formatIssues(parsed.error) },
      });
    }
    const value = parsed.data;
    await appendJsonLine(this.paths.capturesJsonl, value);

    // A recording gets the same treatment as a screenshot: no artifact in this
    // tree is ever separated from the metadata that explains it.
    const artifact = value.image?.relativePath ?? value.video?.relativePath;
    if (artifact !== undefined) {
      const sidecar = resolveWithinRoot(this.paths.runDir, `${stripExtension(artifact)}.json`);
      await atomicWriteFile(sidecar, `${JSON.stringify(value, null, 2)}\n`);
    }

    if (value.status === 'captured') this.counts.captured += 1;
    else if (value.status === 'failed') this.counts.failed += 1;
    else this.counts.skipped += 1;

    return value;
  }

  async addPage(record: PageRecord): Promise<PageRecord> {
    this.assertReady();
    const parsed = PageRecordSchema.safeParse(record);
    if (!parsed.success) {
      throw new UiAtlasError('artifact.write-failed', 'invalid page record', {
        detail: { pageId: record.id, issues: formatIssues(parsed.error) },
      });
    }
    await appendJsonLine(this.paths.pagesJsonl, parsed.data);
    this.counts.pages += 1;
    return parsed.data;
  }

  /**
   * Append an inventoried control. These are observations, never instructions:
   * nothing in `interactions.jsonl` has been or will be clicked.
   */
  async addInteraction(record: InteractionCandidate): Promise<InteractionCandidate> {
    this.assertReady();
    const parsed = InteractionCandidateSchema.safeParse(record);
    if (!parsed.success) {
      throw new UiAtlasError('artifact.write-failed', 'invalid interaction candidate', {
        detail: { interactionId: record.id, issues: formatIssues(parsed.error) },
      });
    }
    await appendJsonLine(this.paths.interactionsJsonl, parsed.data);
    return parsed.data;
  }

  /**
   * Append a described animation. Observations, never instructions: nothing in
   * `animations.jsonl` has been paused, seeked or sampled.
   */
  async addAnimation(record: AnimationRecord): Promise<AnimationRecord> {
    this.assertReady();
    const parsed = AnimationRecordSchema.safeParse(record);
    if (!parsed.success) {
      throw new UiAtlasError('artifact.write-failed', 'invalid animation record', {
        detail: { animationId: record.id, issues: formatIssues(parsed.error) },
      });
    }
    await appendJsonLine(this.paths.animationsJsonl, parsed.data);
    return parsed.data;
  }

  /** The observed-value frequency table. Validated like every other record. */
  async writeTokens(report: DesignTokenReport): Promise<DesignTokenReport> {
    this.assertReady();
    const parsed = DesignTokenReportSchema.safeParse(report);
    if (!parsed.success) {
      throw new UiAtlasError('artifact.write-failed', 'invalid design token report', {
        detail: { issues: formatIssues(parsed.error) },
      });
    }
    await atomicWriteFile(this.paths.tokens, `${JSON.stringify(parsed.data, null, 2)}\n`);
    return parsed.data;
  }

  /**
   * Write `index.md` at the run root and one inside every route's screenshot
   * folder, listing what was captured and what each file is of.
   *
   * Re-read from `captures.jsonl` rather than accumulated in memory, so the
   * index describes what is actually recorded — including a run that was
   * resumed, whose earlier captures this process never saw.
   */
  async writeIndexes(): Promise<{ runIndex: string; routeIndexes: string[] }> {
    this.assertReady();
    const [captures, pages] = await Promise.all([
      readCaptures(this.paths.capturesJsonl),
      readPages(this.paths.pagesJsonl),
    ]);
    const routes = groupForIndex(captures.records, pages.records);

    const runIndex = resolveWithinRoot(this.paths.runDir, 'index.md');
    await atomicWriteFile(runIndex, renderRunIndex({ manifest: this.manifest, routes }));

    const routeIndexes: string[] = [];
    for (const route of routes) {
      if (route.entries.length === 0 && route.missing.length === 0) continue;
      const path = resolveWithinRoot(
        this.paths.screenshotsDir,
        sanitizeSegment(route.routeKey, 'route'),
        'index.md',
      );
      await atomicWriteFile(path, renderRouteIndex(route));
      routeIndexes.push(path);
    }
    return { runIndex, routeIndexes };
  }

  /** The reviewable recipe skeleton. Plain text, written whole. */
  async writeSuggestedRecipes(text: string): Promise<string> {
    this.assertReady();
    await atomicWriteFile(this.paths.suggestedRecipes, text.endsWith('\n') ? text : `${text}\n`);
    return this.paths.suggestedRecipes;
  }

  /**
   * Persist the crawl frontier. Written after every page and atomically, so a
   * crawl killed mid-write resumes from the previous complete state rather than
   * from a truncated one.
   */
  async writeCrawlState(state: CrawlState): Promise<CrawlState> {
    this.assertReady();
    const parsed = CrawlStateSchema.safeParse(state);
    if (!parsed.success) {
      throw new UiAtlasError('artifact.write-failed', 'invalid crawl state', {
        detail: { runId: state.runId, issues: formatIssues(parsed.error) },
      });
    }
    await atomicWriteFile(this.paths.crawlState, `${JSON.stringify(parsed.data, null, 2)}\n`);
    return parsed.data;
  }

  addWarning(warning: string): void {
    if (!this.manifest.warnings.includes(warning)) this.manifest.warnings.push(warning);
  }

  /** Rewrite run.json with final counts, and the indexes. Safe to call twice. */
  async finalize(extra: { finishedAt?: string; browserVersion?: string } = {}): Promise<RunManifest> {
    const finishedAt = extra.finishedAt ?? new Date().toISOString();
    this.manifest = {
      ...this.manifest,
      finishedAt,
      counts: { ...this.counts },
      browser: {
        ...this.manifest.browser,
        ...(extra.browserVersion === undefined ? {} : { version: extra.browserVersion }),
      },
    };

    // Written before the manifest, so a failure here still gets recorded in it.
    // An unwritable index is never worth failing a finished run over: the
    // captures and their sidecars are already on disk.
    try {
      await this.writeIndexes();
    } catch (error) {
      this.addWarning(
        `index.md could not be written: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const parsed = RunManifestSchema.parse(this.manifest);
    this.manifest = parsed;
    await this.writeManifest();
    return parsed;
  }

  snapshotCounts(): { captured: number; failed: number; skipped: number; pages: number } {
    return { ...this.counts };
  }
}

/**
 * Drop a known artifact extension. Used for both the sidecar path and the name
 * registry so the two cannot disagree about what a capture is called.
 */
function stripExtension(relativePath: string): string {
  return relativePath.replace(/\.(png|webm)$/i, '');
}

export function emptyManifest(input: {
  runId: string;
  project: string;
  command: string;
  toolVersion: string;
  browser: RunManifest['browser'];
  baseViewport: RunManifest['baseViewport'];
  startedAt?: string;
}): RunManifest {
  return {
    schemaVersion: SCHEMA_VERSION,
    runId: input.runId,
    project: input.project,
    command: input.command,
    startedAt: input.startedAt ?? new Date().toISOString(),
    toolVersion: input.toolVersion,
    browser: input.browser,
    baseViewport: input.baseViewport,
    warnings: [],
  };
}

/** Checksum helper re-exported for callers that hash before writing. */
export { sha256 };
