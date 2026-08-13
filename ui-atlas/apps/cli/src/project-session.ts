/**
 * The two things every command does around a project, in one place.
 *
 * A session opening stamps itself on the project so the project knows which
 * site it is about and where to reopen; a session closing rebuilds the project
 * page so it is current the moment the browser shuts. Neither is worth failing
 * a run over — the captures are already on disk by then, and a project page
 * that could not be written is a smaller problem than a run that reported
 * failure because of it.
 */

import { readProjectSessions, recordProjectSession } from '@ui-atlas/artifacts';
import { UiAtlasError } from '@ui-atlas/protocol';
import { generateProjectPage } from '@ui-atlas/reporter';
import type { Logger } from './logger.js';

export interface ProjectSessionInput {
  outputRoot: string;
  project: string;
  logger: Logger;
}

/** Create the project on first sight, and record which session is newest. */
export async function noteProjectSession(
  input: ProjectSessionInput & { url: string; sessionId: string },
): Promise<void> {
  try {
    await recordProjectSession({
      outputRoot: input.outputRoot,
      project: input.project,
      url: input.url,
      sessionId: input.sessionId,
    });
  } catch (error) {
    input.logger.warn(
      `project.json could not be written: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Turn what someone typed after `--resume` into a session that exists.
 *
 * `last` is the common case and the only alias: after a week away nobody
 * remembers a run id, and the thing they mean is almost always the one they
 * closed last. An id that does not exist is an error rather than a silent new
 * session — quietly starting a fresh one would look identical from the outside
 * and lose the connection to the work being resumed.
 */
export async function resolveResumeTarget(input: {
  outputRoot: string;
  project: string;
  requested: string;
}): Promise<string> {
  const sessions = await readProjectSessions(input.outputRoot, input.project, {
    withRoutes: false,
    ...(input.requested === 'last' ? { limit: 1 } : {}),
  });

  if (input.requested === 'last') {
    const newest = sessions[0];
    if (newest === undefined) {
      throw new UiAtlasError(
        'config.invalid',
        `there are no sessions in project "${input.project}" to resume`,
      );
    }
    return newest.id;
  }

  const found = sessions.find((session) => session.id === input.requested);
  if (found === undefined) {
    const known = sessions.slice(0, 3).map((session) => session.id);
    throw new UiAtlasError(
      'config.invalid',
      `no session "${input.requested}" in project "${input.project}"` +
        (known.length === 0 ? '' : `; the most recent are ${known.join(', ')}`),
    );
  }
  return found.id;
}

/** Rebuild `<project>/index.html`. Returns the path when it was written. */
export async function refreshProjectPage(
  input: ProjectSessionInput,
): Promise<string | undefined> {
  try {
    const page = await generateProjectPage({
      outputRoot: input.outputRoot,
      project: input.project,
    });
    input.logger.info(`project: ${page.path}`);
    return page.path;
  } catch (error) {
    input.logger.warn(
      `the project page could not be written: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}
