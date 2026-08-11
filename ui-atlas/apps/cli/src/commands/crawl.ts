import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { emptyManifest, newRunId, readRunManifest, RunWriter } from '@ui-atlas/artifacts';
import { launchSession, resolveViewport } from '@ui-atlas/browser';
import { Crawler, type CrawlResult } from '@ui-atlas/crawler';
import { UiAtlasError, type CrawlState } from '@ui-atlas/protocol';
import { flagNumber, flagString, type ParsedArgs } from '../args.js';
import { loadCliConfig, TOOL_VERSION } from '../config.js';
import type { Logger } from '../logger.js';

export const CRAWL_HELP = `
ui-atlas crawl <site-config.yml | url> [options]

  Visits same-origin pages and records what it finds. It follows <a href>
  links and nothing else: no clicking, no form submission, no interaction of
  any kind. Screenshots come from recipes, which are still to build.

  A site config is an ordinary UI Atlas config with a crawl: block:

    project: example-audit
    crawl:
      seeds: [https://example.com]
      include: ['/**']
      exclude: ['/checkout/**']
      budgets: { maxPages: 100, maxDepth: 4, maxRunMinutes: 30 }

  Passing a URL instead crawls it with the default budgets.

  --seed <url>        add a seed (repeatable via config); overrides crawl.seeds
  --max-pages <n>     hard cap on pages visited
  --max-depth <n>     seeds are depth 0
  --max-minutes <n>   hard deadline for the whole crawl
  --resume <run-dir>  continue an interrupted crawl in its own run directory
  --project <name>    artifact project directory
  --output <dir>      artifact root
  --config <path>     explicit config file
  --json              print the result as JSON on stdout
`.trim();

/**
 * A run directory is `<outputRoot>/<project>/<runId>`, so the artifact root is
 * its grandparent. The project and run id come from the manifest rather than
 * from the path, because both are sanitised on the way to disk and the manifest
 * holds the originals.
 */
async function resolveResumeTarget(
  runDirArg: string,
): Promise<{ outputRoot: string; project: string; runId: string }> {
  const runDir = resolve(runDirArg);
  if (!existsSync(resolve(runDir, 'run.json'))) {
    throw new UiAtlasError(
      'config.invalid',
      `--resume: ${runDir} is not a run directory (no run.json)`,
    );
  }
  const manifest = await readRunManifest(resolve(runDir, 'run.json'));
  return { outputRoot: dirname(dirname(runDir)), project: manifest.project, runId: manifest.runId };
}

export async function runCrawl(args: ParsedArgs, logger: Logger): Promise<number> {
  const target = args.positionals[1];
  const resumeDir = flagString(args, 'resume');

  if (target === undefined && resumeDir === undefined) {
    throw new UiAtlasError(
      'config.invalid',
      'crawl needs a site config, a URL, or --resume\n\n' + CRAWL_HELP,
    );
  }

  // A bare URL argument is a seed; anything else is a config file path.
  const targetIsUrl = target !== undefined && /^https?:\/\//i.test(target);
  const configPathArg = targetIsUrl ? undefined : target;

  const crawlOverrides: Record<string, unknown> = {};
  const budgetOverrides: Record<string, unknown> = {};
  const maxPages = flagNumber(args, 'max-pages');
  if (maxPages !== undefined) budgetOverrides['maxPages'] = maxPages;
  const maxDepth = flagNumber(args, 'max-depth');
  if (maxDepth !== undefined) budgetOverrides['maxDepth'] = maxDepth;
  const maxMinutes = flagNumber(args, 'max-minutes');
  if (maxMinutes !== undefined) budgetOverrides['maxRunMinutes'] = maxMinutes;
  if (Object.keys(budgetOverrides).length > 0) crawlOverrides['budgets'] = budgetOverrides;

  const seedFlag = flagString(args, 'seed');
  const seeds: string[] = [];
  if (targetIsUrl && target !== undefined) seeds.push(target);
  if (seedFlag !== undefined) seeds.push(seedFlag);
  if (seeds.length > 0) crawlOverrides['seeds'] = seeds;

  const overrides: Record<string, unknown> = { browser: { headless: true } };
  if (Object.keys(crawlOverrides).length > 0) overrides['crawl'] = crawlOverrides;

  const loaded = await loadCliConfig(
    { ...args, flags: withConfigPath(args.flags, configPathArg) },
    overrides,
  );
  const { config } = loaded;

  const resumed = resumeDir === undefined ? undefined : await resolveResumeTarget(resumeDir);
  const outputRoot = resumed?.outputRoot ?? loaded.outputRoot;
  const runId = resumed?.runId ?? newRunId();
  const project = resumed?.project ?? config.project;

  const viewport = resolveViewport({
    name: 'base',
    width: config.viewport.width,
    height: config.viewport.height,
    mode: 'desktop',
    deviceScaleFactor: config.viewport.deviceScaleFactor,
  });

  // Seeds define the origins the crawl may touch, so a resumed run reuses the
  // ones the interrupted run was started with unless it is told otherwise.
  // That also means `crawl --resume <run-dir>` needs no other argument.
  let writer: RunWriter;
  let resumeState: CrawlState | undefined;
  if (resumed === undefined) {
    if (config.crawl.seeds.length === 0) {
      throw new UiAtlasError(
        'config.invalid',
        'no seeds: set crawl.seeds in the site config or pass a URL\n\n' + CRAWL_HELP,
      );
    }
    writer = new RunWriter(
      outputRoot,
      emptyManifest({
        runId,
        project,
        command: `crawl ${config.crawl.seeds.join(' ')}`,
        toolVersion: TOOL_VERSION,
        baseViewport: viewport,
        browser: {
          engine: 'chromium',
          mode: config.browser.mode,
          headless: config.browser.headless,
          ...(config.browser.profile === undefined ? {} : { profileName: config.browser.profile }),
        },
      }),
    );
    await writer.init();
  } else {
    writer = await RunWriter.resume(outputRoot, project, runId);
    resumeState = await writer.readCrawlState();
    if (resumeState === undefined) {
      logger.warn(`no crawl-state.json in ${writer.paths.runDir}; starting from the seeds`);
    } else {
      logger.info(
        `resuming ${runId}: ${String(resumeState.visited.length)} pages already visited, ` +
          `${String(resumeState.pending.length)} queued`,
      );
    }
  }

  // Nothing is injected into crawled pages: no overlay, no probe bundle. The
  // crawler only navigates and reads the DOM, and a page it visits should look
  // exactly like a page a browser visited.
  const browser = await launchSession({ config: config.browser, viewport });
  for (const warning of browser.warnings) {
    logger.warn(warning);
    writer.addWarning(warning);
  }

  const page = browser.context.pages()[0] ?? (await browser.context.newPage());
  page.setDefaultTimeout(config.browser.navigationTimeoutMs);

  const seedsForRun = config.crawl.seeds.length > 0 ? config.crawl.seeds : (resumeState?.seeds ?? []);
  if (seedsForRun.length === 0) {
    await browser.close().catch(() => undefined);
    throw new UiAtlasError(
      'config.invalid',
      'no seeds: the resumed run recorded none, so pass a URL or set crawl.seeds',
    );
  }

  let result: CrawlResult;
  try {
    const crawler = new Crawler({
      page,
      writer,
      runId,
      config,
      seeds: seedsForRun,
      ...(resumeState === undefined ? {} : { resume: resumeState }),
      onProgress: (message) => logger.info(`visiting ${message}`),
    });
    logger.info(`origins in scope: ${[...crawler.origins].join(', ')}`);
    result = await crawler.run();
  } finally {
    await browser.close().catch(() => undefined);
  }

  const manifest = await writer.finalize({
    ...(browser.browserVersion === undefined ? {} : { browserVersion: browser.browserVersion }),
  });

  report(result, logger);
  logger.info(`artifacts: ${writer.paths.runDir}`);
  if (args.flags.get('json') === true) {
    process.stdout.write(`${JSON.stringify({ manifest, crawl: summarise(result) }, null, 2)}\n`);
  }

  // A crawl that stopped on a budget did what it was told; that is not an error.
  return result.pages.some((record) => record.error !== undefined) ? 1 : 0;
}

function withConfigPath(
  flags: ParsedArgs['flags'],
  configPath: string | undefined,
): ParsedArgs['flags'] {
  if (configPath === undefined) return flags;
  const next = new Map(flags);
  // An explicit `--config` still wins over the positional site config.
  if (!next.has('config')) next.set('config', configPath);
  return next;
}

function summarise(result: CrawlResult): Record<string, unknown> {
  return {
    stopped: result.stopped,
    visited: result.visited.length,
    pendingAtStop: result.pendingAtStop,
    skipCounts: Object.fromEntries(
      Object.entries(result.skipCounts).filter(([, count]) => count > 0),
    ),
    skipSamples: result.skipSamples,
    warnings: result.warnings,
    urls: result.visited,
  };
}

const STOP_TEXT: Record<CrawlResult['stopped'], string> = {
  'frontier-empty': 'crawled every reachable page',
  'max-pages': 'stopped at the page budget',
  'run-timeout': 'stopped at the run deadline',
};

function report(result: CrawlResult, logger: Logger): void {
  logger.info(`${STOP_TEXT[result.stopped]}: ${String(result.visited.length)} pages visited`);
  if (result.pendingAtStop > 0) {
    logger.info(`${String(result.pendingAtStop)} URLs were still queued`);
  }

  const skipped = Object.entries(result.skipCounts).filter(([, count]) => count > 0);
  if (skipped.length > 0) {
    const parts = skipped.map(([reason, count]) => `${reason} ${String(count)}`);
    logger.info(`links not followed: ${parts.join(', ')}`);
  }
  for (const sample of result.skipSamples.slice(0, 10)) {
    logger.debug(`skipped ${sample.url}`, { reason: sample.reason, rule: sample.detail });
  }

  for (const warning of result.warnings) logger.warn(warning);
  for (const record of result.pages) {
    if (record.error !== undefined) {
      logger.warn(`${record.requestedUrl}: ${record.error.code} — ${record.error.message}`);
    }
  }
}
