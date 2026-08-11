import { inventoryAnimations, summariseAnimations } from '@ui-atlas/animation';
import { emptyManifest, newRunId, routeKeyFromUrl, RunWriter } from '@ui-atlas/artifacts';
import { launchSession, resolveViewport } from '@ui-atlas/browser';
import { buildFramePath } from '@ui-atlas/identity';
import { settlePage } from '@ui-atlas/settle';
import { UiAtlasError, type AnimationRecord } from '@ui-atlas/protocol';
import { requireHttpUrl, type ParsedArgs } from '../args.js';
import { loadCliConfig, TOOL_VERSION } from '../config.js';
import type { Logger } from '../logger.js';

export const ANIMATIONS_HELP = `
ui-atlas animations <url> [options]

  Lists every animation the Web Animations API can see on the page, and says of
  each whether it could be sampled at a chosen point and give the same frame
  every time.

  It describes and nothing else. No animation is paused, seeked or cancelled,
  and no screenshot is taken — an inventory that perturbed what it was measuring
  would describe a page that no longer exists. Frame sampling is a later slice.

  Written to animations.jsonl in the run directory.

  Two honest gaps it will tell you about:

    - Motion driven by canvas, WebGL or video is not an Animation, so
      getAnimations cannot see it. Those elements are counted and named.
    - A transition that only exists on hover does not exist on a page at rest,
      so it will not appear. Reaching it needs an interaction, which is a
      recipe's job.

  --project <name>    artifact project directory
  --output <dir>      artifact root
  --width/--height    viewport size
  --config <path>     explicit config file
  --json              print the records as JSON on stdout
`.trim();

export async function runAnimations(args: ParsedArgs, logger: Logger): Promise<number> {
  const target = args.positionals[1];
  if (target === undefined) {
    throw new UiAtlasError('config.invalid', 'animations needs a URL\n\n' + ANIMATIONS_HELP);
  }
  const url = requireHttpUrl(target);
  const loaded = await loadCliConfig(args, { browser: { headless: true } });
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
      command: `animations ${url}`,
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

  // Nothing is injected: the inventory reads the page's own animation state,
  // and an overlay or probe would only be more script for it to describe.
  const browser = await launchSession({ config: config.browser, viewport });
  for (const warning of browser.warnings) {
    logger.warn(warning);
    writer.addWarning(warning);
  }

  const records: AnimationRecord[] = [];
  try {
    const page = browser.context.pages()[0] ?? (await browser.context.newPage());
    page.setDefaultTimeout(config.browser.navigationTimeoutMs);

    await page.goto(url, {
      waitUntil: config.settle.loadState,
      timeout: config.browser.navigationTimeoutMs,
    });
    // Settling matters more here than usual: an animation that starts on load
    // does not exist until it has started.
    const readiness = await settlePage(page, { config: config.settle });
    for (const warning of readiness.warnings) logger.debug(warning);

    const result = await inventoryAnimations(page, {
      runId,
      routeKey: routeKeyFromUrl(page.url()),
      describeFrame: (frame) => buildFramePath(frame),
    });

    for (const record of result.animations) {
      records.push(await writer.addAnimation(record));
    }
    for (const warning of result.warnings) {
      logger.warn(warning);
      writer.addWarning(warning);
    }

    report(records, logger);
  } finally {
    await browser.close().catch(() => undefined);
    await writer.finalize({
      ...(browser.browserVersion === undefined ? {} : { browserVersion: browser.browserVersion }),
    });
  }

  logger.info(`artifacts: ${writer.paths.runDir}`);
  if (args.flags.get('json') === true) {
    process.stdout.write(`${JSON.stringify({ animations: records }, null, 2)}\n`);
  }
  return 0;
}

function report(records: AnimationRecord[], logger: Logger): void {
  const summary = summariseAnimations(records);
  if (summary.total === 0) {
    logger.info('no animations were running when the page settled');
    return;
  }

  logger.info(
    `${String(summary.total)} animation(s): ` +
      `${String(summary.byKind['css-animation'])} CSS animation, ` +
      `${String(summary.byKind['css-transition'])} CSS transition, ` +
      `${String(summary.byKind['web-animation'])} Web Animations API ` +
      `(${String(summary.running)} running)`,
  );

  const { bySampleability } = summary;
  logger.info(
    `${String(bySampleability.sampleable)} could be sampled deterministically; ` +
      `${String(bySampleability.infinite)} infinite, ` +
      `${String(bySampleability['scroll-driven'])} scroll-driven, ` +
      `${String(bySampleability.indeterminate)} indeterminate, ` +
      `${String(bySampleability.instant)} instant`,
  );

  for (const record of records) {
    const where = record.target?.selectorHint ?? '(no target)';
    const name = record.animationName ?? record.transitionProperty ?? record.animationId;
    logger.info(`  [${record.sampleability}] ${name} on ${where} — ${record.reasons[0] ?? ''}`);
  }
}
