import {
  CaptureRecordSchema,
  CrawlStateSchema,
  InteractionCandidateSchema,
  PageRecordSchema,
  RunManifestSchema,
  SCHEMA_VERSION,
  UiAtlasError,
  type CaptureRecord,
  type CrawlState,
  type InteractionCandidate,
  type PageRecord,
  type RunManifest,
} from '@ui-atlas/protocol';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { appendJsonLine, atomicWriteFile, ensureDir, sha256 } from './atomic.js';
import { pngDimensions } from './png.js';
import { resolveWithinRoot, sanitizeSegment, toRecordPath } from './paths.js';
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
  };
}

export interface ScreenshotTarget {
  routeKey: string;
  viewportLabel: string;
  captureId: string;
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

  /** Absolute path a screenshot for `target` must be written to. */
  screenshotPath(target: ScreenshotTarget): string {
    return resolveWithinRoot(
      this.paths.screenshotsDir,
      sanitizeSegment(target.routeKey, 'route'),
      sanitizeSegment(target.viewportLabel, 'viewport'),
      `${sanitizeSegment(target.captureId, 'capture')}.png`,
    );
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
    const absolute = this.screenshotPath(target);
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

    if (value.image !== undefined) {
      const sidecar = resolveWithinRoot(
        this.paths.runDir,
        `${value.image.relativePath.replace(/\.png$/i, '')}.json`,
      );
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

  /** Rewrite run.json with final counts. Safe to call more than once. */
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
    const parsed = RunManifestSchema.parse(this.manifest);
    this.manifest = parsed;
    await this.writeManifest();
    return parsed;
  }

  snapshotCounts(): { captured: number; failed: number; skipped: number; pages: number } {
    return { ...this.counts };
  }
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
