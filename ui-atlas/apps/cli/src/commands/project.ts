import { relative } from 'node:path';
import { listProjects, readProjectSessions } from '@ui-atlas/artifacts';
import { UiAtlasError } from '@ui-atlas/protocol';
import { buildDesignPrompt, collectProjectFacts, generateProjectPage } from '@ui-atlas/reporter';
import type { ParsedArgs } from '../args.js';
import { loadCliConfig } from '../config.js';
import type { Logger } from '../logger.js';
import { platformOpener } from '../reveal.js';

export const PROJECT_HELP = `
ui-atlas project [name] [options]

  A project is a website, and everything captured about it lives in one
  directory. With no name this lists the projects; with one it rebuilds that
  project's index.html — every session, page, component, observed value and
  file, plus the staged prompt to hand to Claude Design.

  The page is rebuilt automatically whenever a session ends, so this is for
  looking at it directly, or for rebuilding after editing the prompt templates.

  --open              open the page afterwards
  --prompt [stage]    print the design prompt to stdout instead of the path
  --sessions          list the project's sessions instead of rebuilding
  --output <dir>      artifact root (default: ./ui-atlas-output)
  --config <path>     explicit config file
  --json              print machine-readable output
`.trim();

export async function runProject(args: ParsedArgs, logger: Logger): Promise<number> {
  const loaded = await loadCliConfig(args);
  const name = args.positionals[1];
  const asJson = args.flags.get('json') === true;

  if (name === undefined) return listAll(loaded.outputRoot, asJson, logger);

  if (args.flags.get('sessions') === true) {
    return listSessions(loaded.outputRoot, name, asJson, logger);
  }

  // `--prompt` deliberately does not rebuild the page: printing a prompt is a
  // read, and a read should not write.
  const promptFlag = args.flags.get('prompt');
  if (promptFlag !== undefined) {
    return printPrompt(loaded.outputRoot, name, promptFlag === true ? undefined : String(promptFlag));
  }

  const page = await generateProjectPage({ outputRoot: loaded.outputRoot, project: name });
  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        {
          project: name,
          path: page.path,
          sessions: page.facts.totals.sessions,
          captured: page.facts.totals.captured,
          exportable: page.facts.exportPlan.entries.length,
          stages: page.prompt.stages.map((stage) => stage.id),
        },
        null,
        2,
      )}\n`,
    );
  } else {
    process.stdout.write(`${page.path}\n`);
    logger.info(
      `${String(page.facts.totals.sessions)} sessions · ` +
        `${String(page.facts.totals.captured)} captures · ` +
        `${String(page.facts.components.length)} components · ` +
        `${String(page.prompt.stages.length)} prompt stages`,
    );
  }

  if (args.flags.get('open') === true) {
    const opener = platformOpener();
    if (opener === undefined) logger.warn('this platform has no opener; the path is above');
    else await opener(page.path);
  }

  return 0;
}

async function listAll(outputRoot: string, asJson: boolean, logger: Logger): Promise<number> {
  const projects = await listProjects(outputRoot);

  if (asJson) {
    process.stdout.write(
      `${JSON.stringify(
        projects.map((project) => ({
          project: project.project,
          site: project.manifest?.site.origin,
          sessions: project.sessionCount,
          lastUrl: project.manifest?.lastUrl,
          directory: project.paths.projectDir,
        })),
        null,
        2,
      )}\n`,
    );
    return 0;
  }

  if (projects.length === 0) {
    logger.info(`no projects yet under ${outputRoot}`);
    logger.info('`ui-atlas inspect <url>` creates one, named after the site');
    return 0;
  }

  for (const project of projects) {
    const site = project.manifest?.site.origin ?? 'site not recorded';
    const sessions = project.sessionCount === 1 ? '1 session' : `${String(project.sessionCount)} sessions`;
    process.stdout.write(`${project.project.padEnd(28)} ${sessions.padEnd(14)} ${site}\n`);
  }
  return 0;
}

async function listSessions(
  outputRoot: string,
  project: string,
  asJson: boolean,
  logger: Logger,
): Promise<number> {
  const sessions = await readProjectSessions(outputRoot, project);

  if (asJson) {
    process.stdout.write(`${JSON.stringify(sessions, null, 2)}\n`);
    return 0;
  }

  if (sessions.length === 0) {
    logger.info(`no sessions in project "${project}"`);
    return 0;
  }

  for (const session of sessions) {
    const counts = session.counts ?? { captured: 0, failed: 0, skipped: 0, pages: 0 };
    const status = session.open ? 'open' : 'finished';
    process.stdout.write(
      `${session.id}  ${status.padEnd(9)} ${String(counts.captured).padStart(4)} captured  ` +
        `${relative(process.cwd(), session.runDir)}\n`,
    );
  }
  logger.info(`resume one with \`ui-atlas inspect <url> --project ${project} --resume <session>\``);
  return 0;
}

async function printPrompt(
  outputRoot: string,
  project: string,
  stageId: string | undefined,
): Promise<number> {
  const facts = await collectProjectFacts({ outputRoot, project });
  const prompt = buildDesignPrompt(facts);

  if (stageId === undefined) {
    process.stdout.write(`${prompt.combined}\n`);
    return 0;
  }

  const stage = prompt.stages.find((candidate) => candidate.id === stageId);
  if (stage === undefined) {
    throw new UiAtlasError(
      'config.invalid',
      `no prompt stage "${stageId}"; this project has ${prompt.stages.map((item) => item.id).join(', ')}`,
    );
  }
  process.stdout.write(`${stage.text}\n`);
  return 0;
}
