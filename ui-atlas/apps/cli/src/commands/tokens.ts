import { emptyManifest, newRunId, routeKeyFromUrl, RunWriter } from '@ui-atlas/artifacts';
import { launchSession, resolveViewport } from '@ui-atlas/browser';
import { settlePage } from '@ui-atlas/settle';
import { TokenScanner } from '@ui-atlas/tokens';
import { UiAtlasError, type DesignTokenReport, type TokenCategory } from '@ui-atlas/protocol';
import { requireHttpUrl, type ParsedArgs } from '../args.js';
import { loadCliConfig, withProjectForUrl, TOOL_VERSION } from '../config.js';
import type { Logger } from '../logger.js';
import { refreshProjectPage } from '../project-session.js';

export const TOKENS_HELP = `
ui-atlas tokens <url> [more urls...] [options]

  Reads every element's computed style and counts what turns up: colours,
  backgrounds, borders, radii, spacing, typography and shadows.

  What comes out is a frequency table of observations, NOT a design system.
  "#2563eb appears on 34 elements" is a fact; "this is your primary colour" is a
  judgement, and this makes none — nothing here has a name, because naming is
  yours to do.

  It reads and only reads: nothing is clicked, hovered, focused or scrolled, so
  the counts describe the page as served.

  Values that mean nobody decided anything — a transparent background, a zero
  margin, \`font-style: normal\` — are left out. Without that the list is mostly
  browser defaults.

  Values close enough that one may be a mistake are reported as near duplicates
  and never merged: deciding which of two almost-identical blues is the real one
  is exactly the judgement this refuses to make.

  Written to tokens.json. Pass several URLs to describe a site rather than a
  page, or use \`crawl --tokens\` to scan everything a crawl visits.

  --project <name>    artifact project directory
  --output <dir>      artifact root
  --width/--height    viewport size
  --config <path>     explicit config file
  --json              print the report as JSON on stdout
`.trim();

export async function runTokens(args: ParsedArgs, logger: Logger): Promise<number> {
  const targets = args.positionals.slice(1);
  if (targets.length === 0) {
    throw new UiAtlasError('config.invalid', 'tokens needs at least one URL\n\n' + TOKENS_HELP);
  }
  const urls = targets.map((target) => requireHttpUrl(target));
  // The first URL names the project, the same way it does for every other
  // command — a token scan of a site belongs in that site's project, which is
  // where the project page and the design prompt go looking for it.
  const loaded = withProjectForUrl(
    await loadCliConfig(args, { browser: { headless: true } }),
    urls[0] ?? '',
  );
  const { config } = loaded;
  const runId = newRunId();

  const viewport = resolveViewport({
    name: 'base',
    width: config.viewport.width,
    height: config.viewport.height,
    mode: 'desktop',
    deviceScaleFactor: config.viewport.deviceScaleFactor,
  });

  const writer = new RunWriter(
    loaded.outputRoot,
    emptyManifest({
      runId,
      project: config.project,
      command: `tokens ${urls.join(' ')}`,
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

  // The command is the reason to scan, so the config flag is not also required.
  const scanner = new TokenScanner({
    runId,
    config: { ...config.tokens, enabled: true },
  });

  const browser = await launchSession({ config: config.browser, viewport });
  for (const warning of browser.warnings) {
    logger.warn(warning);
    writer.addWarning(warning);
  }

  let report: DesignTokenReport;
  try {
    const page = browser.context.pages()[0] ?? (await browser.context.newPage());
    page.setDefaultTimeout(config.browser.navigationTimeoutMs);

    for (const url of urls) {
      try {
        await page.goto(url, {
          waitUntil: config.settle.loadState,
          timeout: config.browser.navigationTimeoutMs,
        });
        const readiness = await settlePage(page, { config: config.settle });
        for (const warning of readiness.warnings) logger.debug(warning);
        await scanner.scan(page, routeKeyFromUrl(page.url()));
        logger.info(`scanned ${page.url()}`);
      } catch (error) {
        // One unreachable page is not a reason to lose the others.
        const message = `could not scan ${url}: ${describe(error)}`;
        logger.warn(message);
        writer.addWarning(message);
      }
    }

    report = await writer.writeTokens(scanner.summarise());
  } finally {
    await browser.close().catch(() => undefined);
    await writer.finalize({
      ...(browser.browserVersion === undefined ? {} : { browserVersion: browser.browserVersion }),
    });
  }

  for (const warning of report.warnings) logger.warn(warning);
  reportTokens(report, logger);
  logger.info(`artifacts: ${writer.paths.runDir}`);
  // The scan is the one thing that fills the project page's Observed values
  // section and the prompt's, so rebuilding here is what makes them appear.
  await refreshProjectPage({ outputRoot: loaded.outputRoot, project: config.project, logger });

  if (args.flags.get('json') === true) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
  return report.pagesScanned > 0 ? 0 : 1;
}

/** The top few of each category, which is what a person reads first. */
export function reportTokens(report: DesignTokenReport, logger: Logger): void {
  if (report.candidates.length === 0) {
    logger.info('no design values were observed on the pages scanned');
    return;
  }

  logger.info(
    `${String(report.candidates.length)} distinct value(s) across ` +
      `${String(report.elementsScanned)} element(s) on ${String(report.pagesScanned)} page(s)`,
  );

  const categories = [...new Set(report.candidates.map((candidate) => candidate.category))];
  for (const category of categories as TokenCategory[]) {
    const inCategory = report.candidates.filter((candidate) => candidate.category === category);
    logger.info(`  ${category} (${String(inCategory.length)}):`);
    for (const candidate of inCategory.slice(0, 5)) {
      logger.info(
        `    ${candidate.value} — ${String(candidate.count)}× as ${candidate.properties.join(', ')}`,
      );
    }
  }

  for (const pair of report.nearDuplicates) {
    logger.info(`  near duplicate: ${pair.a} and ${pair.b} — ${pair.reason}`);
  }
  logger.info(report.note);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
