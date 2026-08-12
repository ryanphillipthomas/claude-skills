import { readFile } from 'node:fs/promises';
import {
  inventoryAnimations,
  planScreencast,
  recordScreencast,
  sampleAnimations,
  summariseAnimations,
} from '@ui-atlas/animation';
import { emptyManifest, newCaptureId, newRunId, routeKeyFromUrl, RunWriter } from '@ui-atlas/artifacts';
import { emulationOptions, launchSession, resolveViewport, viewportLabel } from '@ui-atlas/browser';
import { CaptureService } from '@ui-atlas/capture';
import { buildElementIdentity } from '@ui-atlas/identity';
import { loadProbeBundle, probeSelector } from '@ui-atlas/overlay';
import { buildFramePath } from '@ui-atlas/identity';
import { settlePage } from '@ui-atlas/settle';
import {
  UiAtlasError,
  type AnimationRecord,
  type CaptureRecord,
  type ReadinessResult,
  type Viewport,
} from '@ui-atlas/protocol';
import { flagNumber, flagString, requireHttpUrl, type ParsedArgs } from '../args.js';
import { loadCliConfig, TOOL_VERSION } from '../config.js';
import type { Logger } from '../logger.js';

export const ANIMATIONS_HELP = `
ui-atlas animations <url> [options]

  Lists every animation the Web Animations API can see on the page, and says of
  each whether it could be sampled at a chosen point and give the same frame
  every time.

  By default it describes and nothing else: no animation is paused, seeked or
  cancelled, and no screenshot is taken. Written to animations.jsonl.

  --sample additionally photographs each *sampleable* animation at chosen points
  in one iteration, pausing and seeking it and then putting it back exactly as
  it was found. Anything the inventory could not call sampleable is recorded as
  a skipped capture carrying the reason, never seeked anyway.

  Two honest gaps it will tell you about:

    - Motion driven by canvas, WebGL or video is not an Animation, so
      getAnimations cannot see it. Those elements are counted and named.
    - A transition that only exists on hover does not exist on a page at rest,
      so it will not appear. Reaching it needs an interaction, which is a
      recipe's job.

  --video records the motion that has no keyframes to sample — an animation that
  repeats forever, one whose duration is auto, and canvas, WebGL or video
  elements — for a bounded window, in a browser context of its own. A recording
  is not a deterministic sample and says so; sampleable and scroll-driven
  animations are deliberately left out of it, each with its reason.

  --sample            capture frames of the sampleable animations
  --offsets <list>    comma separated 0..1 points within one iteration
                      (default: 0,0.25,0.5,0.75,1)
  --video             record the motion no seek can reproduce
  --video-ms <n>      cap the recording window (default: 5000)
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
  const offsets = parseOffsets(flagString(args, 'offsets'));
  const videoMs = flagNumber(args, 'video-ms');
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

  const wantsSamples = args.flags.get('sample') === true;
  const wantsVideo = args.flags.get('video') === true || config.capture.animation.video.enabled;
  // The inventory reads the page's own animation state and needs nothing
  // injected. Sampling needs the probe, because an element capture must
  // describe its element exactly the way the inspector does.
  const browser = await launchSession({
    config: config.browser,
    viewport,
    ...(wantsSamples ? { initScripts: [{ content: await loadProbeBundle() }] } : {}),
  });
  for (const warning of browser.warnings) {
    logger.warn(warning);
    writer.addWarning(warning);
  }

  const records: AnimationRecord[] = [];
  const frames: CaptureRecord[] = [];
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

    const captures = new CaptureService({
      page,
      writer,
      config,
      runId,
      project: config.project,
      viewport,
      viewportLabel: viewportLabel(viewport),
    });

    if (wantsSamples) {
      const sampling = {
        ...config.capture.animation,
        ...(offsets === undefined ? {} : { offsets }),
      };

      const sampled = await sampleAnimations(
        page,
        records.slice(0, sampling.maxAnimations),
        {
          config: sampling,
          setId: (record) => `animation-${runId}-${record.id}`,
          onProgress: (message) => logger.info(`sampling ${message}`),
          capture: async ({ record, sample, label, setId }) => {
            // An element capture needs the element. Falling back to the
            // viewport is better than refusing: the frame is still the point.
            const identity = await identityFor(page, record, sampling.kind);
            return captures.capture({
              kind: 'animation-frame',
              // The animation position is forced; the *state* is genuinely
              // default, and `animation` carries the truth about the moment.
              state: 'default',
              stateLabel: label,
              animation: sample,
              set: { id: setId, kind: 'animation', member: label },
              ...(identity === undefined ? {} : { identity }),
            });
          },
        },
      );

      frames.push(...sampled.captures);
      for (const warning of sampled.warnings) {
        logger.warn(warning);
        writer.addWarning(warning);
      }
      for (const { record, reason } of sampled.skipped) {
        logger.info(
          `not sampled: ${record.animationName ?? record.animationId} — ${reason}`,
        );
      }
      logger.info(
        `${String(sampled.captures.length)} frame(s) captured, ` +
          `${String(sampled.skipped.length)} animation(s) not sampleable`,
      );
    }

    if (wantsVideo) {
      const videoConfig = {
        ...config.capture.animation.video,
        ...(videoMs === undefined ? {} : { maxDurationMs: videoMs }),
      };
      const plan = planScreencast(records, result.unobservable, videoConfig);
      for (const { subject, reason } of plan.excluded) {
        logger.debug(`not recorded: ${subject} — ${reason}`);
      }

      const parent = browser.browser;
      if (!plan.record) {
        logger.info(
          'nothing on this page needs a recording: every animation it has can be ' +
            'sampled exactly, or there is none',
        );
      } else if (parent === undefined) {
        // Same constraint concurrency hits: a persistent profile owns its only
        // context, and a recording needs one of its own.
        const message =
          'a recording needs a browser context of its own, which this browser mode ' +
          'cannot create; run with --mode clean or --mode storage-state';
        logger.warn(message);
        writer.addWarning(message);
      } else {
        frames.push(
          await recordOne(parent, {
            page,
            plan,
            config: videoConfig,
            captures,
            writer,
            logger,
            settle: (target) => settlePage(target, { config: config.settle }),
            viewport,
            contextOptions: {
              ...emulationOptions(viewport, browser.browserVersion),
              locale: config.browser.locale,
              colorScheme: config.browser.colorScheme,
              reducedMotion: config.browser.reducedMotion,
              ignoreHTTPSErrors: config.browser.ignoreHttpsErrors,
              ...(config.browser.timezoneId === undefined
                ? {}
                : { timezoneId: config.browser.timezoneId }),
              // So a recording of a signed-in page is of the page you are
              // signed in to, exactly as an extra crawl worker would be.
              ...(await browser.context
                .storageState()
                .then((storageState) => ({ storageState }))
                .catch(() => ({}))),
            },
            navigationTimeoutMs: config.browser.navigationTimeoutMs,
          }),
        );
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
    await writer.finalize({
      ...(browser.browserVersion === undefined ? {} : { browserVersion: browser.browserVersion }),
    });
  }

  logger.info(`artifacts: ${writer.paths.runDir}`);
  if (args.flags.get('json') === true) {
    process.stdout.write(
      `${JSON.stringify({ animations: records, frames }, null, 2)}\n`,
    );
  }
  return frames.every((frame) => frame.status !== 'failed') ? 0 : 1;
}

/**
 * Record once, keep the file if it is within budget, and write the record
 * either way — a recording that was taken and discarded is a fact about the
 * run, and a silent absence would look identical to never having tried.
 */
async function recordOne(
  parent: import('playwright').Browser,
  input: {
    page: import('playwright').Page;
    plan: ReturnType<typeof planScreencast>;
    config: { maxDurationMs: number; maxBytes: number; iterations: number; enabled: boolean };
    captures: CaptureService;
    writer: RunWriter;
    logger: Logger;
    settle: (page: import('playwright').Page) => Promise<ReadinessResult>;
    viewport: Viewport;
    contextOptions: import('playwright').BrowserContextOptions;
    navigationTimeoutMs: number;
  },
): Promise<CaptureRecord> {
  const { captures, logger, page, plan, writer } = input;
  const captureId = newCaptureId();
  const target = {
    routeKey: routeKeyFromUrl(page.url()),
    viewportLabel: viewportLabel(input.viewport),
    captureId,
  };
  const workspace = await writer.videoWorkspace(captureId);
  const startedAt = Date.now();

  try {
    const recording = await recordScreencast(parent, {
      url: page.url(),
      durationMs: plan.durationMs,
      maxBytes: input.config.maxBytes,
      viewport: { width: input.viewport.width, height: input.viewport.height },
      contextOptions: input.contextOptions,
      workspaceDir: workspace,
      settle: input.settle,
      navigationTimeoutMs: input.navigationTimeoutMs,
      onProgress: (message) => logger.info(message),
    });

    for (const warning of recording.warnings) {
      logger.warn(warning);
      writer.addWarning(warning);
    }

    if (recording.path === undefined) {
      return captures.captureVideo({
        captureId,
        warnings: recording.warnings,
        durationMs: Date.now() - startedAt,
        ...(recording.readiness === undefined ? {} : { readiness: recording.readiness }),
        error: {
          code: recording.byteLength > 0 ? 'capture.over-budget' : 'capture.failed',
          message: recording.warnings[0] ?? 'no recording was produced',
        },
      });
    }

    const screencast = await writer.writeVideo(target, await readFile(recording.path), {
      width: input.viewport.width,
      height: input.viewport.height,
      durationMs: recording.durationMs,
      leadInMs: recording.leadInMs,
      truncated: plan.truncated,
      subjects: plan.subjects,
      limitations: [
        ...plan.limitations,
        `the file starts with the page load this recording needed; the ${formatMs(
          recording.durationMs,
        )} you asked about begins about ${formatMs(recording.leadInMs)} in`,
      ],
    });

    logger.info(
      `recorded ${formatMs(screencast.durationMs)} of ${plan.subjects.length} subject(s) ` +
        `into ${screencast.relativePath}`,
    );
    return captures.captureVideo({
      captureId,
      screencast,
      stateLabel: 'recording',
      set: { id: `animation-video-${captureId}`, kind: 'animation', member: 'recording' },
      warnings: recording.warnings,
      durationMs: Date.now() - startedAt,
      ...(recording.readiness === undefined ? {} : { readiness: recording.readiness }),
    });
  } finally {
    await writer.discardVideoWorkspace(workspace);
  }
}

function formatMs(value: number): string {
  return value >= 1_000 ? `${String(Math.round(value / 100) / 10)}s` : `${String(Math.round(value))}ms`;
}

/** `0,0.5,1` — rejected rather than clamped, so a typo is visible. */
function parseOffsets(raw: string | undefined): number[] | undefined {
  if (raw === undefined) return undefined;
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const offsets = parts.map((part) => {
    const value = Number(part);
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new UiAtlasError('config.invalid', `--offsets takes numbers from 0 to 1, got "${part}"`);
    }
    return value;
  });
  if (offsets.length === 0) {
    throw new UiAtlasError('config.invalid', '--offsets needs at least one value');
  }
  return offsets;
}

/**
 * The animated element, described the way the inspector describes elements.
 * `undefined` falls the capture back to the viewport, which is still the frame
 * the caller asked for.
 */
async function identityFor(
  page: import('playwright').Page,
  record: AnimationRecord,
  kind: 'element' | 'viewport',
): Promise<ReturnType<typeof buildElementIdentity> | undefined> {
  if (kind !== 'element') return undefined;
  const selector = record.target?.selectorHint;
  if (selector === undefined) return undefined;
  try {
    const probe = await probeSelector(page, selector);
    return buildElementIdentity(probe, await buildFramePath(page.mainFrame()));
  } catch {
    return undefined;
  }
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
