import { toStructuredError, UiAtlasError } from '@ui-atlas/protocol';
import { flagBoolean, parseArgs } from './args.js';
import { TOOL_VERSION } from './config.js';
import { createLogger, type Logger } from './logger.js';
import { AUTH_HELP, runAuth } from './commands/auth.js';
import { CAPTURE_HELP, runCapture } from './commands/capture.js';
import { CRAWL_HELP, runCrawl } from './commands/crawl.js';
import { INSPECT_HELP, runInspect } from './commands/inspect.js';
import { REPORT_HELP, runReport } from './commands/report.js';

export const TOP_LEVEL_HELP = `
ui-atlas — collect website UI reference material for design-system work

Commands
  inspect <url>                 open a clean browser with the inspector overlay
  capture <url>                 one-shot non-interactive capture
  report  <run-directory>       summarise a run
  auth save <profile> <url>     sign in by hand and store the session
  auth clear <profile>          delete a stored session and profile
  crawl <site-config.yml|url>   visit same-origin pages and record them

Global options
  --help          show help for a command
  --version       print the version
  --quiet         only print warnings and errors
  --verbose       print debug detail

Run \`ui-atlas <command> --help\` for command options.
`.trim();

const COMMAND_HELP: Record<string, string> = {
  inspect: INSPECT_HELP,
  capture: CAPTURE_HELP,
  report: REPORT_HELP,
  auth: AUTH_HELP,
  crawl: CRAWL_HELP,
};

export interface RunOptions {
  argv: string[];
  logger?: Logger;
}

/** Returns a process exit code; never calls `process.exit` itself. */
export async function run(options: RunOptions): Promise<number> {
  const args = parseArgs(options.argv);
  const command = args.positionals[0];

  if (args.flags.get('version') === true) {
    process.stdout.write(`${TOOL_VERSION}\n`);
    return 0;
  }

  if (command === undefined || command === 'help') {
    const topic = args.positionals[1];
    process.stdout.write(`${(topic !== undefined && COMMAND_HELP[topic]) || TOP_LEVEL_HELP}\n`);
    return command === undefined ? 1 : 0;
  }

  if (args.flags.get('help') === true) {
    process.stdout.write(`${COMMAND_HELP[command] ?? TOP_LEVEL_HELP}\n`);
    return 0;
  }

  const logger =
    options.logger ??
    createLogger({
      level: flagBoolean(args, 'verbose') === true ? 'debug' : args.flags.get('quiet') === true ? 'warn' : 'info',
    });

  try {
    switch (command) {
      case 'inspect':
        return await runInspect(args, logger);
      case 'capture':
        return await runCapture(args, logger);
      case 'report':
        return await runReport(args, logger);
      case 'auth':
        return await runAuth(args, logger);
      case 'crawl':
        return await runCrawl(args, logger);
      default:
        logger.error(`unknown command "${command}"`);
        process.stdout.write(`${TOP_LEVEL_HELP}\n`);
        return 1;
    }
  } catch (error) {
    const structured = toStructuredError(error);
    logger.error(`${structured.code}: ${structured.message}`);
    if (structured.detail !== undefined) logger.debug('detail', structured.detail);
    if (!(error instanceof UiAtlasError)) logger.debug('stack', { stack: (error as Error).stack });
    return 1;
  }
}
