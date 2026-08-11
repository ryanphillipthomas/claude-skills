import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { emptyManifest, newRunId, readRunManifest, RunWriter } from '@ui-atlas/artifacts';
import type { Page } from 'playwright';
import { emulationOptions, launchSession, resolveViewport, viewportLabel } from '@ui-atlas/browser';
import { CaptureService } from '@ui-atlas/capture';
import {
  Crawler,
  CrawlPolicy,
  describeTarget,
  formatPlan,
  InteractionInventory,
  locatorFor,
  planCrawl,
  planProblems,
  RecipeRunner,
  suggestRecipes,
  summariseInventory,
  type CrawlResult,
} from '@ui-atlas/crawler';
import { loadProbeBundle, probeLocator } from '@ui-atlas/overlay';
import { UiAtlasError, type CrawlState, type PageRecord } from '@ui-atlas/protocol';
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

  Recipes are the only way anything on a crawled page is interacted with. A
  control is clicked because a recipe names it, and for no other reason.

    crawl:
      recipes:
        - name: open-primary-navigation
          match: '/**'
          steps:
            - click: { role: button, name: Menu }
            - waitFor: { role: navigation }
            - capture: { kind: viewport, label: nav-open }

  --dry-run           validate the config and print what would run, then exit.
                      Launches no browser and visits nothing.
  --inventory         list each page's interactive controls and what each is
                      likely to do, into interactions.jsonl, and write a
                      reviewable suggested-recipes.yml. Nothing is clicked.
  --seed <url>        add a seed (repeatable via config); overrides crawl.seeds
  --max-pages <n>     hard cap on pages visited
  --max-depth <n>     seeds are depth 0
  --max-minutes <n>   hard deadline for the whole crawl
  --concurrency <n>   isolated workers, each with its own browser context.
                      Politeness is enforced per origin across all of them, so
                      more workers never means more requests per second to one
                      host. Defaults to 1.
  --delay-ms <n>      minimum gap between navigations to one origin
  --max-attempts <n>  attempts per page, including the first. Timeouts and 5xx
                      are retried with backoff and jitter; a 429 or 503 slows
                      the whole origin down, honouring Retry-After.
  --trace-on-failure  keep a Playwright trace for pages that could not be
                      reached, and for pages a recipe failed on. A trace records
                      network traffic including request headers, so it can
                      contain session cookies: treat the run directory as
                      sensitive. Nothing is written for a page that worked.
  --resume <run-dir>  continue an interrupted crawl in its own run directory
  --mode <mode>       clean | profile | storage-state | attach
  --profile <name>    the auth profile saved by \`ui-atlas auth save\`
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

  if (args.flags.get('inventory') === true) crawlOverrides['inventory'] = { enabled: true };
  const concurrency = flagNumber(args, 'concurrency');
  if (concurrency !== undefined) crawlOverrides['concurrency'] = concurrency;
  const delayMs = flagNumber(args, 'delay-ms');
  if (delayMs !== undefined) crawlOverrides['perPageDelayMs'] = delayMs;
  const maxAttempts = flagNumber(args, 'max-attempts');
  if (maxAttempts !== undefined) crawlOverrides['retry'] = { maxAttempts };
  if (args.flags.get('trace-on-failure') === true) crawlOverrides['trace'] = { enabled: true };

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

  // Everything the dry run needs is already validated by the schema, so it can
  // answer before any browser exists.
  if (args.flags.get('dry-run') === true) {
    const origins = [...new CrawlPolicy(config.crawl, config.crawl.seeds).origins];
    const plan = planCrawl(config.crawl, origins);
    if (args.flags.get('json') === true) {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatPlan(plan)}\n`);
    }
    const problems = planProblems(plan);
    for (const problem of problems) logger.warn(problem);
    return problems.length > 0 ? 1 : 0;
  }

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

  // A plain crawl injects nothing into the pages it visits: no overlay, no
  // probe. Recipes and the inventory both need the probe, because both must
  // describe an element exactly the way the inspector does.
  const needsProbe = config.crawl.recipes.length > 0 || config.crawl.inventory.enabled;
  const browser = await launchSession({
    config: config.browser,
    viewport,
    ...(needsProbe ? { initScripts: [{ content: await loadProbeBundle() }] } : {}),
  });
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

  /**
   * A recipe runner is bound to one page, so every worker needs its own — along
   * with its own capture service, which writes to the shared run.
   */
  const recipesForPage = (target: Page): RecipeRunner =>
    new RecipeRunner({
      config,
      runId,
      captures: new CaptureService({
        page: target,
        writer,
        config,
        runId,
        project,
        viewport,
        viewportLabel: viewportLabel(viewport),
      }),
      probe: (probeTarget, spec) =>
        probeLocator(locatorFor(probeTarget, spec), describeTarget(spec)),
      onAnimation: async (record) => {
        await writer.addAnimation(record);
      },
      onProgress: (message) => logger.info(message),
    });

  /**
   * An extra worker gets a fresh context, seeded from the live one's storage
   * state so a signed-in crawl stays signed in on every worker — the same
   * approach responsive replay uses (ADR 11).
   *
   * A persistent profile owns its only context and cannot create siblings, so
   * there is nothing to hand back; the crawler warns and stays single-worker.
   */
  const parentBrowser = browser.browser;
  const createWorker =
    parentBrowser === undefined
      ? undefined
      : async (index: number) => {
          const storageState = await browser.context.storageState().catch(() => undefined);
          const context = await parentBrowser.newContext({
            ...emulationOptions(viewport, browser.browserVersion),
            locale: config.browser.locale,
            colorScheme: config.browser.colorScheme,
            reducedMotion: config.browser.reducedMotion,
            ignoreHTTPSErrors: config.browser.ignoreHttpsErrors,
            ...(config.browser.timezoneId === undefined
              ? {}
              : { timezoneId: config.browser.timezoneId }),
            ...(storageState === undefined ? {} : { storageState }),
          });
          context.setDefaultNavigationTimeout(config.browser.navigationTimeoutMs);
          if (needsProbe) await context.addInitScript({ content: await loadProbeBundle() });
          const workerPage = await context.newPage();
          workerPage.setDefaultTimeout(config.browser.navigationTimeoutMs);
          logger.debug(`worker ${String(index)} ready`);
          return {
            page: workerPage,
            recipes: recipesForPage(workerPage),
            close: async () => {
              await context.close().catch(() => undefined);
            },
          };
        };

  if (createWorker === undefined && config.crawl.concurrency > 1) {
    const warning =
      `browser.mode "${config.browser.mode}" owns a single persistent context, so ` +
      'extra crawl workers cannot be created; running with one';
    logger.warn(warning);
    writer.addWarning(warning);
  }

  const policy = new CrawlPolicy(config.crawl, seedsForRun);
  const inventory = new InteractionInventory({
    config: config.crawl.inventory,
    runId,
    extraMutationWords: config.crawl.inventory.mutationWords,
    denyPaths: config.crawl.denyPaths,
    origins: policy.origins,
  });

  let result: CrawlResult;
  try {
    const crawler = new Crawler({
      page,
      writer,
      runId,
      config,
      seeds: seedsForRun,
      recipes: recipesForPage(page),
      inventory,
      ...(createWorker === undefined ? {} : { createWorker }),
      ...(resumeState === undefined ? {} : { resume: resumeState }),
      onProgress: (message) => logger.info(`visiting ${message}`),
    });
    logger.info(`origins in scope: ${[...crawler.origins].join(', ')}`);
    result = await crawler.run();
  } finally {
    await browser.close().catch(() => undefined);
  }

  if (config.crawl.inventory.enabled && config.crawl.inventory.writeSuggestions) {
    const path = await writer.writeSuggestedRecipes(suggestRecipes(result.interactions));
    logger.info(`suggested recipes: ${path}`);
  }

  const manifest = await writer.finalize({
    ...(browser.browserVersion === undefined ? {} : { browserVersion: browser.browserVersion }),
  });

  report(result, logger);
  logger.info(`artifacts: ${writer.paths.runDir}`);
  if (args.flags.get('json') === true) {
    process.stdout.write(`${JSON.stringify({ manifest, crawl: summarise(result) }, null, 2)}\n`);
  }

  // A crawl that stopped on a budget did what it was told; that is not an
  // error. Neither is a page that answered 404 — the crawl worked, the site has
  // a broken link, and that belongs in the report rather than in the exit code.
  // A page that could not be reached at all is a different matter.
  return unreachable(result).length > 0 ? 1 : 0;
}

/** Pages no HTTP response ever came back for, after every retry. */
function unreachable(result: CrawlResult): PageRecord[] {
  return result.pages.filter(
    (record) => record.error !== undefined && record.httpStatus === undefined,
  );
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
    clicks: result.clicks,
    retries: result.retries,
    backedOffOrigins: result.backedOffOrigins,
    traces: result.traces,
    unreachable: unreachable(result).map((record) => record.requestedUrl),
    recipes: result.recipes,
    inventory: summariseInventory(result.interactions),
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

  if (result.interactions.length > 0) {
    const summary = summariseInventory(result.interactions);
    logger.info(
      `inventory: ${String(summary.total)} control(s) across ${String(summary.routes)} route(s) — ` +
        `${String(summary.byClass.navigation)} navigation, ${String(summary.byClass.inert)} inert, ` +
        `${String(summary.byClass.mutation)} may change something, ` +
        `${String(summary.byClass.unknown)} unclear (none were clicked)`,
    );
  }

  if (result.recipes.length > 0) {
    const captures = result.recipes.reduce((total, one) => total + one.captureIds.length, 0);
    const failed = result.recipes.filter((one) => one.status === 'failed').length;
    logger.info(
      `${String(result.recipes.length)} recipe run(s): ${String(captures)} captures, ` +
        `${String(result.clicks)} control(s) clicked` +
        (failed > 0 ? `, ${String(failed)} failed` : ''),
    );
  }

  const skipped = Object.entries(result.skipCounts).filter(([, count]) => count > 0);
  if (skipped.length > 0) {
    const parts = skipped.map(([reason, count]) => `${reason} ${String(count)}`);
    logger.info(`links not followed: ${parts.join(', ')}`);
  }
  for (const sample of result.skipSamples.slice(0, 10)) {
    logger.debug(`skipped ${sample.url}`, { reason: sample.reason, rule: sample.detail });
  }

  if (result.retries > 0) {
    logger.info(`${String(result.retries)} retry attempt(s) across the run`);
  }
  if (result.traces.length > 0) {
    logger.info(`${String(result.traces.length)} failure trace(s) kept:`);
    for (const trace of result.traces.slice(0, 10)) logger.info(`  ${trace}`);
  }
  for (const origin of result.backedOffOrigins) {
    logger.warn(`${origin} asked for a slower rate; the crawl backed off`);
  }

  for (const warning of result.warnings) logger.warn(warning);

  // A page that answered with an error status is a finding about the site; a
  // page that never answered is a finding about the run. Say which is which.
  const httpErrors = result.pages.filter((record) => record.httpStatus !== undefined && record.error !== undefined);
  if (httpErrors.length > 0) {
    logger.info(`${String(httpErrors.length)} page(s) answered with an error status:`);
    for (const record of httpErrors.slice(0, 20)) {
      logger.info(`  ${String(record.httpStatus)} ${record.requestedUrl}`);
    }
  }
  for (const record of unreachable(result)) {
    logger.warn(`unreachable: ${record.requestedUrl} — ${record.error?.message ?? 'no detail'}`);
  }
}
