import type { Page } from 'playwright';
import { judgeSignIn, probeSignIn, type SignInVerdict } from '@ui-atlas/browser';
import type { BrowserMode } from '@ui-atlas/protocol';
import type { Logger } from './logger.js';

export interface SignInCheckInput {
  page: Page;
  /** The URL that was asked for, so a redirect to a login page is visible. */
  url: string;
  mode: BrowserMode;
  profile: string | undefined;
  logger: Logger;
  /** Records the warning in the run, so the report and manifest carry it too. */
  addWarning?: ((message: string) => void) | undefined;
}

/**
 * Say, on the first page of a run, that the saved sign-in is not working.
 *
 * The failure this exists for looks nothing like a sign-in failure from the
 * outside: a crawl runs to completion, every page succeeds, and twenty minutes
 * later you have fifty screenshots of a login wall — or the site's own code
 * throws `Unexpected token '<'` because a fetch expecting JSON got an HTML
 * challenge page. Neither says "you are signed out".
 *
 * Only runs when the run is *using* saved auth. A `clean`-mode run is expected
 * to be signed out, and warning about it would be noise.
 */
export async function checkSignIn(input: SignInCheckInput): Promise<SignInVerdict | undefined> {
  if (input.mode !== 'profile' && input.mode !== 'storage-state') return undefined;

  let reading;
  try {
    reading = judgeSignIn(await probeSignIn(input.page, input.url));
  } catch {
    // A page that blocks evaluation is not a reason to fail a run; it is just
    // a page this check cannot read.
    return undefined;
  }

  const label = input.profile === undefined ? input.mode : `"${input.profile}" (${input.mode})`;
  if (reading.verdict === 'signed-out') {
    const message = `the saved sign-in ${label} looks signed out: ${reading.evidence.join('; ')}`;
    input.logger.warn(message);
    input.logger.warn(
      'everything captured from here will be of the signed-out site. ' +
        `Re-save with: ui-atlas auth save ${input.profile ?? '<profile>'} ${input.url}` +
        (input.mode === 'profile' ? ' --persistent' : ''),
    );
    input.addWarning?.(message);
    return reading.verdict;
  }

  if (reading.verdict === 'unclear') {
    input.logger.info(`sign-in check for ${label}: unclear — ${reading.evidence.join('; ')}`);
  } else {
    input.logger.info(`sign-in check for ${label}: signed in`);
  }
  return reading.verdict;
}
