import { relative } from 'node:path';
import { buildElementIdentity, buildFramePath } from '@ui-atlas/identity';
import { probeSelector } from '@ui-atlas/overlay';
import {
  UiAtlasError,
  type CaptureRecord,
  type ElementIdentity,
  type StateName,
  type StillCaptureKind,
  STATE_NAMES,
  STILL_CAPTURE_KINDS,
} from '@ui-atlas/protocol';
import { flagString, requireHttpUrl, type ParsedArgs } from '../args.js';
import { loadCliConfig, withProjectForUrl, TOOL_VERSION } from '../config.js';
import { navigationHint } from '../navigation-hint.js';
import type { Logger } from '../logger.js';
import { resolveResumeTarget } from '../project-session.js';
import { AtlasSession } from '../session.js';

export const CAPTURE_HELP = `
ui-atlas capture <url> [options]

  One-shot, non-interactive capture. Useful in CI and as a smoke test.

  --kind <kind>       viewport | full-page | element (default: viewport)
  --select <css>      CSS selector for --kind element
  --states <list>     comma separated, e.g. default,hover,focus (default: default)
  --responsive        replay the route once per configured viewport, each in a
                      fresh context with its own reload
  --resume <session>  append to an existing session in this project, or "last"
  --project <name>    artifact project directory (default: named after the site)
  --output <dir>      artifact root
  --width/--height    base viewport size
  --config <path>     explicit config file
  --json              print the capture records as JSON on stdout
`.trim();

function parseKind(value: string | undefined): StillCaptureKind {
  if (value === undefined) return 'viewport';
  if ((STILL_CAPTURE_KINDS as readonly string[]).includes(value)) return value as StillCaptureKind;
  throw new UiAtlasError(
    'config.invalid',
    `--kind must be one of ${STILL_CAPTURE_KINDS.join(', ')} (got "${value}")`,
  );
}

function parseStates(value: string | undefined): StateName[] {
  if (value === undefined) return ['default'];
  const parts = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  const states: StateName[] = [];
  for (const part of parts) {
    if (!(STATE_NAMES as readonly string[]).includes(part)) {
      throw new UiAtlasError('config.invalid', `unknown state "${part}"`);
    }
    states.push(part as StateName);
  }
  return states.length > 0 ? states : ['default'];
}

export async function runCapture(args: ParsedArgs, logger: Logger): Promise<number> {
  const target = args.positionals[1];
  if (target === undefined) {
    throw new UiAtlasError('config.invalid', 'capture needs a URL\n\n' + CAPTURE_HELP);
  }
  const url = requireHttpUrl(target);
  const kind = parseKind(flagString(args, 'kind'));
  const states = parseStates(flagString(args, 'states'));
  const selector = flagString(args, 'select');

  if (kind === 'element' && selector === undefined) {
    throw new UiAtlasError('config.invalid', '--kind element also needs --select <css>');
  }

  const responsive = args.flags.get('responsive') === true;
  const loaded = withProjectForUrl(
    await loadCliConfig(args, { browser: { headless: true } }),
    url,
  );

  const requestedResume = flagString(args, 'resume');
  const resumeSessionId =
    requestedResume === undefined
      ? undefined
      : await resolveResumeTarget({
          outputRoot: loaded.outputRoot,
          project: loaded.config.project,
          requested: requestedResume,
        });

  const session = await AtlasSession.start({
    config: loaded.config,
    outputRoot: loaded.outputRoot,
    command: `capture ${url}`,
    toolVersion: TOOL_VERSION,
    logger,
    overlay: false,
    siteUrl: url,
    resumeSessionId,
  });

  // Same line, same format, as `inspect`. Announcing the run at the start
  // rather than only in the closing `artifacts:` line means you can find it on
  // disk while it is still running — and it is what the launcher watches for.
  logger.info(
    `${resumeSessionId === undefined ? 'run' : 'resumed'} ${session.runId} → ` +
      relative(process.cwd(), session.writer.paths.runDir),
  );

  const records: CaptureRecord[] = [];
  try {
    const page = await session.navigate(url);
    if (page.error !== undefined) {
      logger.error(`navigation failed: ${page.error.message}`);
      const hint = navigationHint(page.error.message, url);
      if (hint !== undefined) logger.error(hint);
      return 1;
    }

    let identity: ElementIdentity | undefined;
    if (selector !== undefined) {
      const probe = await probeSelector(session.page, selector);
      identity = buildElementIdentity(probe, await buildFramePath(session.page.mainFrame()));
      logger.info(`selected ${identity.tagName} via ${identity.chosenLocator.type}`);
    }

    if (responsive) {
      const result = await session.runResponsive({
        kind,
        states,
        identity,
        url,
        onProgress: (message) => logger.info(`capturing ${message}`),
      });
      records.push(...result.records);
      for (const warning of result.warnings) logger.warn(warning);
      for (const record of result.records) {
        const viewport = record.set?.member ?? 'viewport';
        if (record.status === 'captured') {
          logger.info(`${viewport}: captured → ${record.image?.relativePath ?? ''}`);
        } else {
          logger.warn(`${viewport}: ${record.status} — ${record.error?.message ?? 'no detail'}`);
        }
      }
      return records.every((record) => record.status !== 'failed') ? 0 : 1;
    }

    const setId = states.length > 1 ? `set-${session.runId}` : undefined;
    for (const state of states) {
      const record = await session.captures.capture({
        kind,
        state,
        identity,
        sourceUrl: url,
        ...(setId === undefined ? {} : { set: { id: setId, kind: 'state' as const, member: state } }),
      });
      records.push(record);
      const summary = `${record.status} ${record.kind}/${record.state.name} (${record.state.provenance})`;
      if (record.status === 'captured') logger.info(`${summary} → ${record.image?.relativePath ?? ''}`);
      else logger.warn(`${summary}: ${record.error?.message ?? 'no detail'}`);
    }
  } finally {
    const manifest = await session.close();
    logger.info(`artifacts: ${session.writer.paths.runDir}`);
    if (args.flags.get('json') === true) {
      process.stdout.write(`${JSON.stringify({ manifest, captures: records }, null, 2)}\n`);
    }
  }

  return records.every((record) => record.status !== 'failed') ? 0 : 1;
}
