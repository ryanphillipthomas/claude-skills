import { relative } from 'node:path';
import { UiAtlasError } from '@ui-atlas/protocol';
import { flagBoolean, flagNumber, flagString, requireHttpUrl, type ParsedArgs } from '../args.js';
import type { Logger } from '../logger.js';
import { AtlasSession } from '../session.js';
import { loadCliConfig, TOOL_VERSION } from '../config.js';
import { navigationHint } from '../navigation-hint.js';

export const INSPECT_HELP = `
ui-atlas inspect <url> [options]

  Opens a clean Chromium window, injects the inspector overlay, and captures
  whatever you select. Runs until you close the browser.

  --project <name>      artifact project directory (default: from config)
  --profile <name>      named UI Atlas auth profile
  --mode <mode>         clean | profile | storage-state | attach (default: clean)
  --cdp-endpoint <url>  CDP endpoint for --mode attach
  --config <path>       explicit config file
  --output <dir>        artifact root (default: ./ui-atlas-output)
  --width <px>          base viewport width
  --height <px>         base viewport height
  --headless            run without a visible window (useful in CI)
  --auto-inspect        start with inspect mode already on
  --open-timeout <ms>   stop automatically after this long (default: no limit)
`.trim();

export async function runInspect(args: ParsedArgs, logger: Logger): Promise<number> {
  const target = args.positionals[1];
  if (target === undefined) {
    throw new UiAtlasError('config.invalid', 'inspect needs a URL\n\n' + INSPECT_HELP);
  }
  const url = requireHttpUrl(target);
  const loaded = await loadCliConfig(args, { overlay: { autoInspect: flagBoolean(args, 'auto-inspect') ?? true } });

  const session = await AtlasSession.start({
    config: loaded.config,
    outputRoot: loaded.outputRoot,
    command: `inspect ${url}`,
    toolVersion: TOOL_VERSION,
    logger,
    overlay: true,
  });

  logger.info(`run ${session.runId} → ${relative(process.cwd(), session.writer.paths.runDir)}`);
  logger.info(`opening ${url}`);

  const timeoutMs = flagNumber(args, 'open-timeout');
  let timer: NodeJS.Timeout | undefined;

  try {
    const page = await session.navigate(url);
    if (page.error !== undefined) {
      logger.error(`navigation failed: ${page.error.message}`);
      const hint = navigationHint(page.error.message, url);
      if (hint !== undefined) logger.error(hint);
      return 1;
    }
    const mounted = await session.overlay.waitForMount();
    if (!mounted) {
      logger.warn('the inspector overlay did not report in; the page may block script injection');
    } else {
      logger.info('inspector ready — Alt+I toggles inspect mode, Alt+C captures the selection');
    }

    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        logger.info(`--open-timeout reached after ${String(timeoutMs)}ms; closing`);
        void session.browser.close();
      }, timeoutMs);
      timer.unref?.();
    }

    await session.waitForClose();
    return 0;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    const manifest = await session.close();
    const counts = manifest.counts ?? { captured: 0, failed: 0, skipped: 0, pages: 0 };
    logger.info(
      `run ${manifest.runId} finished: ${String(counts.captured)} captured, ` +
        `${String(counts.failed)} failed, ${String(counts.skipped)} skipped`,
    );
    logger.info(`artifacts: ${session.writer.paths.runDir}`);
  }
}

/** Present so `flagString` stays referenced when options grow. */
export { flagString };
