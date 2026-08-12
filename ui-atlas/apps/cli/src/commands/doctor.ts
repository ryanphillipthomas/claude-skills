import {
  judgeSignIn,
  launchSession,
  probeSignIn,
  probeStorage,
  resolveViewport,
  settleDiagnosis,
  summarise,
  watchPage,
  type PageDiagnosis,
} from '@ui-atlas/browser';
import { settlePage } from '@ui-atlas/settle';
import { UiAtlasError } from '@ui-atlas/protocol';
import { requireHttpUrl, type ParsedArgs } from '../args.js';
import { loadCliConfig } from '../config.js';
import type { Logger } from '../logger.js';

export const DOCTOR_HELP = `
ui-atlas doctor <url>

  Loads <url> and says what actually happened, rather than what the page's own
  error message said. It reports:

    - requests that were refused, failed, or answered with an HTML document
      when the page asked for data (this is what produces the site's
      "Unexpected token '<', \\"<!DOCTYPE \\"" error)
    - whether that HTML was a bot challenge or a sign-in page, which look
      identical from inside the page and mean completely different things
    - errors the page's own scripts threw, verbatim
    - whether the session this run is using is signed in

  It captures nothing and writes no run. It is a read.

  --mode <mode>      clean | profile | storage-state | attach
  --profile <name>   the auth profile saved by \`ui-atlas auth save\`
  --headless         run without a visible window
  --json             print the diagnosis as JSON on stdout
`.trim();

export async function runDoctor(args: ParsedArgs, logger: Logger): Promise<number> {
  const target = args.positionals[1];
  if (target === undefined) {
    throw new UiAtlasError('config.invalid', `doctor needs a URL\n\n${DOCTOR_HELP}`);
  }
  const url = requireHttpUrl(target);
  const loaded = await loadCliConfig(args);
  const { config } = loaded;

  const viewport = resolveViewport({
    name: 'doctor',
    width: config.viewport.width,
    height: config.viewport.height,
    mode: 'desktop',
  });
  const session = await launchSession({ config: config.browser, viewport });
  for (const warning of session.warnings) logger.warn(warning);

  try {
    const page = session.context.pages()[0] ?? (await session.context.newPage());
    page.setDefaultTimeout(config.browser.navigationTimeoutMs);

    const watch = watchPage(page, url);
    let status: number | undefined;
    try {
      const response = await page.goto(url, { waitUntil: config.settle.loadState });
      status = response?.status();
    } catch (error) {
      logger.error(`the page could not be loaded: ${describe(error)}`);
    }
    // Let the page's own start-up requests run: the failing fetch is almost
    // never the document itself.
    await settlePage(page, { config: config.settle }).catch(() => undefined);
    await settleDiagnosis();
    const diagnosis: PageDiagnosis = { ...watch.stop(), status };

    const reading = judgeSignIn(await probeSignIn(page, url).catch(() => emptySignals(url)));
    report(diagnosis, logger, reading.verdict === 'signed-out');

    logger.info('');
    logger.info(`sign-in: ${reading.verdict}`);
    for (const line of reading.evidence) logger.info(`  ${line}`);

    if (config.browser.mode === 'clean') {
      logger.info('  (this run used a clean browser, so being signed out is expected)');
    }

    // Only worth saying when a storage state is what is actually in use. Told
    // to someone already running `--mode profile`, it is advice to do what they
    // are doing — which is worse than silence, because it looks like a finding.
    const storage = await probeStorage(page).catch(() => undefined);
    const droppable =
      storage !== undefined && (storage.indexedDbNames.length > 0 || storage.sessionStorageKeys > 0);
    if (droppable && storage !== undefined && config.browser.mode !== 'profile') {
      logger.info('');
      logger.info('this origin keeps state a storage state cannot carry:');
      if (storage.indexedDbNames.length > 0) {
        logger.info(`  IndexedDB: ${storage.indexedDbNames.join(', ')}`);
      }
      if (storage.sessionStorageKeys > 0) {
        logger.info(`  sessionStorage: ${String(storage.sessionStorageKeys)} key(s)`);
      }
      logger.info('  save the profile with --persistent and use --mode profile');
    }

    if (args.flags.get('json') === true) {
      process.stdout.write(`${JSON.stringify({ diagnosis, signIn: reading }, null, 2)}\n`);
    }

    // A diagnosis is not a verdict on the run: exit 1 only when something was
    // actually wrong, so this can gate a script.
    return diagnosis.findings.length > 0 || diagnosis.pageErrors.length > 0 ? 1 : 0;
  } finally {
    await session.close();
  }
}

function report(diagnosis: PageDiagnosis, logger: Logger, signedOut: boolean): void {
  logger.info(`requested ${diagnosis.requestedUrl}`);
  if (diagnosis.finalUrl !== diagnosis.requestedUrl) logger.info(`landed on ${diagnosis.finalUrl}`);
  if (diagnosis.status !== undefined) logger.info(`document status ${String(diagnosis.status)}`);

  const conclusions = summarise(diagnosis, signedOut);
  if (conclusions.length > 0) {
    logger.info('');
    for (const line of conclusions) logger.warn(line);
  }

  // Cancellations are listed separately and briefly. A page's telemetry
  // beacons abort by the handful on every navigation, and printing them at full
  // weight buries the one finding that explains the failure.
  const significant = diagnosis.findings.filter((finding) => finding.kind !== 'cancelled');
  const cancelled = diagnosis.findings.filter((finding) => finding.kind === 'cancelled');

  if (significant.length === 0) {
    logger.info('');
    logger.info('no request was refused, failed, or answered with HTML where data was expected');
  } else {
    logger.info('');
    logger.info(`${String(significant.length)} request(s) worth looking at:`);
    for (const finding of significant) {
      const status = finding.status === undefined ? 'no response' : String(finding.status);
      logger.info(`  [${finding.kind}] ${status} ${finding.resourceType} ${finding.url}`);
      logger.info(`      ${finding.reason}`);
      if (finding.preview !== undefined && finding.preview.length > 0) {
        logger.info(`      body: "${finding.preview}"`);
      }
    }
  }

  if (cancelled.length > 0) {
    logger.info('');
    logger.info(
      `${String(cancelled.length)} request(s) were cancelled before finishing ` +
        '(beacons, analytics, or a content blocker). Rarely the problem:',
    );
    for (const finding of cancelled) logger.info(`  ${finding.resourceType} ${finding.url}`);
  }

  if (diagnosis.pageErrors.length > 0) {
    logger.info('');
    logger.info("the page's own scripts threw:");
    for (const message of diagnosis.pageErrors) logger.info(`  ${message}`);
  }
  if (diagnosis.consoleErrors.length > 0) {
    logger.info('');
    logger.info('console errors:');
    for (const message of diagnosis.consoleErrors) logger.info(`  ${message}`);
  }
}

function emptySignals(url: string): Parameters<typeof judgeSignIn>[0] {
  return {
    requestedUrl: url,
    finalUrl: url,
    looksLikeLoginUrl: false,
    visiblePasswordFields: 0,
    signInControls: [],
    signOutControls: [],
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
