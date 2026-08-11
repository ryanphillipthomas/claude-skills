import { UiAtlasError } from '@ui-atlas/protocol';
export const CRAWL_HELP = `
ui-atlas crawl <site-config.yml>

  Not implemented yet. The bounded crawler, declarative recipes and the
  suggested-interaction inventory are phase 3 deliverables.

  Until then use:
    ui-atlas inspect <url>   guided capture with the injected inspector
    ui-atlas capture <url>   one-shot non-interactive capture
`.trim();
export function runCrawl(_args, logger) {
    logger.error('crawl is not implemented yet (phase 3)');
    process.stdout.write(`${CRAWL_HELP}\n`);
    throw new UiAtlasError('config.invalid', 'crawl is a phase 3 command');
}
//# sourceMappingURL=crawl.js.map