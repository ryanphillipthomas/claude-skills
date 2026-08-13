/**
 * The sign-in step, which is the old silent failure given a face.
 *
 * Before this, a stale profile produced a run that succeeded at everything
 * except the one thing that mattered: every screenshot was of a login wall, and
 * you found out twenty minutes later. `auth check` already knew — it just had
 * nowhere to say it. This turns that verdict into a card with three answers.
 *
 * Pure, and deliberately so: the wording of a refusal is the part most likely
 * to be wrong, and it should be assertable without a browser.
 */

export interface SignInPrompt {
  /** Host only. The path of a signed-out URL is not worth repeating. */
  host: string;
  profile: string | undefined;
  verdict: 'signed-out' | 'unclear' | 'challenged';
  /** What the probe actually saw, so the card can be specific. */
  evidence: readonly string[];
}

export type SignInAnswer = 'sign-in' | 'capture-anyway' | 'choose-profile';

export interface SignInCardButton {
  label: string;
  answer: SignInAnswer;
}

export interface SignInCard {
  title: string;
  /** One short paragraph. The only place the launcher explains itself at length. */
  body: string;
  /** What the probe saw, verbatim, under a disclosure. Never re-worded. */
  evidence: readonly string[];
  primary: SignInCardButton | undefined;
  secondary: SignInCardButton[];
}

/**
 * A challenge and a signed-out session need opposite responses, so they get
 * opposite cards. Signing in again is the fix for one and the single worst
 * move against the other — see ADR 0030. The challenge card therefore offers
 * neither `Sign in…` nor `Capture anyway`: there is no honest button here, and
 * inventing one would be the tool lying about what it can do.
 */
/**
 * The one place a sign-in problem is named, so the popover's header and its
 * card cannot disagree. They did: the header said "Page is signed out" for
 * every verdict, including a challenge — the exact confusion ADR 0030 exists
 * to prevent.
 */
export function signInTitle(prompt: SignInPrompt | undefined): string {
  if (prompt === undefined) return 'Sign-in needed';
  switch (prompt.verdict) {
    case 'challenged':
      return `${prompt.host} is refusing the browser`;
    case 'unclear':
      return 'Cannot tell if this page is signed in';
    case 'signed-out':
      return 'Page is signed out';
  }
}

export function signInCard(prompt: SignInPrompt): SignInCard {
  const profile = prompt.profile === undefined ? 'The saved session' : `The saved session "${prompt.profile}"`;

  if (prompt.verdict === 'challenged') {
    return {
      title: signInTitle(prompt),
      body:
        `${prompt.host} is serving a challenge page instead of the site. This is not a sign-in ` +
        'problem and signing in again will not fix it — repeated attempts are what turn a soft ' +
        'challenge into a hard block. UI Atlas has no evasion and will not be given any.',
      evidence: prompt.evidence,
      primary: undefined,
      secondary: [{ label: 'Stop', answer: 'choose-profile' }],
    };
  }

  if (prompt.verdict === 'unclear') {
    return {
      title: signInTitle(prompt),
      body:
        `${profile} for ${prompt.host} shows neither a way in nor a way out, so UI Atlas cannot ` +
        'say whether captures would be of the real site. Signing in opens a real window and ' +
        'settles it; capturing anyway is fine if you already know.',
      evidence: prompt.evidence,
      primary: { label: 'Sign in…', answer: 'sign-in' },
      secondary: [
        { label: 'Capture anyway', answer: 'capture-anyway' },
        { label: 'Choose profile', answer: 'choose-profile' },
      ],
    };
  }

  return {
    title: signInTitle(prompt),
    body:
      `${profile} for ${prompt.host} no longer works, so captures would show the login screen. ` +
      'Signing in opens a real window; UI Atlas waits for you and saves the session when you land.',
    evidence: prompt.evidence,
    primary: { label: 'Sign in…', answer: 'sign-in' },
    secondary: [
      { label: 'Capture anyway', answer: 'capture-anyway' },
      { label: 'Choose profile', answer: 'choose-profile' },
    ],
  };
}

/** Host only, and never the path — a signed-out URL often carries a return-to. */
export function hostOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return rawUrl;
  }
}
