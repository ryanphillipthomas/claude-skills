import type { Page } from 'playwright';

/* -------------------------------------------------------------------------- */
/* What the site keeps, and what a storage state can carry                     */
/* -------------------------------------------------------------------------- */

export interface StorageProbe {
  origin: string;
  localStorageKeys: number;
  sessionStorageKeys: number;
  indexedDbNames: string[];
  serviceWorkers: number;
}

/**
 * Ask the page what it is actually storing.
 *
 * `context.storageState()` carries **cookies and localStorage, and nothing
 * else**. Plenty of modern sign-ins keep their token in IndexedDB or
 * sessionStorage, which is why a saved state can look healthy — hundreds of
 * cookies — and still be signed out on first use.
 */
export async function probeStorage(page: Page): Promise<StorageProbe> {
  return page.evaluate(async (): Promise<StorageProbe> => {
    const count = (storage: Storage | null): number => {
      try {
        return storage === null ? 0 : storage.length;
      } catch {
        // A partitioned or blocked context throws on access.
        return 0;
      }
    };

    let indexedDbNames: string[] = [];
    try {
      const factory = indexedDB as IDBFactory & {
        databases?: () => Promise<Array<{ name?: string }>>;
      };
      if (typeof factory.databases === 'function') {
        const found = await factory.databases();
        indexedDbNames = found
          .map((database) => database.name ?? '')
          .filter((name) => name.length > 0);
      }
    } catch {
      indexedDbNames = [];
    }

    let serviceWorkers = 0;
    try {
      serviceWorkers = (await navigator.serviceWorker.getRegistrations()).length;
    } catch {
      serviceWorkers = 0;
    }

    return {
      origin: location.origin,
      localStorageKeys: count(localStorage),
      sessionStorageKeys: count(sessionStorage),
      indexedDbNames,
      serviceWorkers,
    };
  });
}

export interface StorageAssessment {
  /** What a saved storage state will carry from this origin. */
  carried: string[];
  /** What it will silently leave behind. */
  dropped: string[];
  /** True when the dropped material is likely to be where the session lives. */
  recommendPersistent: boolean;
  summary: string;
}

/**
 * Decide whether a storage state is the right thing to save for this site.
 *
 * Pure, so the judgement can be tested without a browser, and so there is one
 * place that knows what `storageState()` does and does not include.
 */
export function assessStorage(probe: StorageProbe, cookieCount: number): StorageAssessment {
  const carried: string[] = [];
  const dropped: string[] = [];

  if (cookieCount > 0) carried.push(`${String(cookieCount)} cookies`);
  if (probe.localStorageKeys > 0) {
    carried.push(`${String(probe.localStorageKeys)} localStorage keys`);
  }

  if (probe.indexedDbNames.length > 0) {
    dropped.push(
      `${String(probe.indexedDbNames.length)} IndexedDB database(s): ${probe.indexedDbNames.join(', ')}`,
    );
  }
  if (probe.sessionStorageKeys > 0) {
    dropped.push(`${String(probe.sessionStorageKeys)} sessionStorage keys`);
  }
  if (probe.serviceWorkers > 0) {
    dropped.push(`${String(probe.serviceWorkers)} service worker registration(s)`);
  }

  // IndexedDB and sessionStorage are where a token lives when it is not in a
  // cookie. A service worker alone is weaker evidence — it is often just an
  // offline cache — so it is reported without driving the recommendation.
  const recommendPersistent = probe.indexedDbNames.length > 0 || probe.sessionStorageKeys > 0;

  const summary = recommendPersistent
    ? `${probe.origin} keeps sign-in material a storage state cannot carry`
    : `${probe.origin} keeps its sign-in material where a storage state can carry it`;

  return { carried, dropped, recommendPersistent, summary };
}

/* -------------------------------------------------------------------------- */
/* Whether you are still signed in                                             */
/* -------------------------------------------------------------------------- */

export interface SignInSignals {
  requestedUrl: string;
  finalUrl: string;
  looksLikeLoginUrl: boolean;
  visiblePasswordFields: number;
  signInControls: string[];
  signOutControls: string[];
}

export type SignInVerdict = 'signed-in' | 'signed-out' | 'unclear';

export interface SignInReading {
  verdict: SignInVerdict;
  /** Why, in the words the CLI prints. Never empty. */
  evidence: string[];
}

/** `/login`, `/sign-in`, `/oauth/authorize` and the rest of the usual set. */
export function looksLikeLoginUrl(rawUrl: string): boolean {
  let path: string;
  try {
    path = new URL(rawUrl).pathname.toLowerCase();
  } catch {
    return false;
  }
  return /(^|\/)(login|log-in|log_in|signin|sign-in|sign_in|auth|authorize|authenticate|oauth|sso)(\/|$)/.test(
    path,
  );
}

/** What the page shows about who you are. Reads only; clicks nothing. */
export async function probeSignIn(page: Page, requestedUrl: string): Promise<SignInSignals> {
  const collected = await page.evaluate((): Omit<SignInSignals, 'requestedUrl' | 'looksLikeLoginUrl'> => {
    const visible = (element: Element): boolean => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = getComputedStyle(element);
      return style.visibility !== 'hidden' && style.display !== 'none';
    };

    const label = (element: Element): string => {
      const text = (element.getAttribute('aria-label') ?? element.textContent ?? '')
        .replace(/\s+/g, ' ')
        .trim();
      return text.slice(0, 60);
    };

    const passwords = Array.from(document.querySelectorAll('input[type="password"]')).filter(visible);

    const controls = Array.from(
      document.querySelectorAll('button, a[href], [role="button"], input[type="submit"]'),
    ).filter(visible);

    const signIn: string[] = [];
    const signOut: string[] = [];
    for (const control of controls) {
      const text = label(control);
      if (text.length === 0) continue;
      if (/\b(sign\s?out|log\s?out|logout|signout)\b/i.test(text)) {
        if (!signOut.includes(text)) signOut.push(text);
      } else if (/\b(sign\s?in|log\s?in|login|signin)\b/i.test(text)) {
        if (!signIn.includes(text)) signIn.push(text);
      }
    }

    return {
      finalUrl: location.href,
      visiblePasswordFields: passwords.length,
      signInControls: signIn.slice(0, 5),
      signOutControls: signOut.slice(0, 5),
    };
  });

  return {
    requestedUrl,
    ...collected,
    looksLikeLoginUrl: looksLikeLoginUrl(collected.finalUrl),
  };
}

/**
 * Read the signals into a verdict.
 *
 * Deliberately three-valued. "Unclear" is a real answer for a page that shows
 * neither a way in nor a way out, and reporting it as signed-in would be the
 * quiet dishonesty that made this worth building.
 */
export function judgeSignIn(signals: SignInSignals): SignInReading {
  const evidence: string[] = [];
  const redirected = stripHash(signals.finalUrl) !== stripHash(signals.requestedUrl);
  if (redirected) evidence.push(`redirected to ${signals.finalUrl}`);

  // A way out is the strongest evidence there is of being in, and it beats a
  // stray "Log in" link in a footer.
  if (signals.signOutControls.length > 0) {
    evidence.push(`a sign-out control is on the page ("${signals.signOutControls[0] ?? ''}")`);
    return { verdict: 'signed-in', evidence };
  }

  if (signals.visiblePasswordFields > 0) {
    evidence.push(
      `${String(signals.visiblePasswordFields)} visible password field(s) — this is a sign-in page`,
    );
    return { verdict: 'signed-out', evidence };
  }
  if (signals.looksLikeLoginUrl) {
    evidence.push('the final URL is a sign-in path');
    return { verdict: 'signed-out', evidence };
  }
  if (signals.signInControls.length > 0) {
    evidence.push(`a sign-in control is on the page ("${signals.signInControls[0] ?? ''}")`);
    return { verdict: 'signed-out', evidence };
  }

  evidence.push('no sign-in or sign-out control was visible, and the URL is not a sign-in path');
  return { verdict: 'unclear', evidence };
}

function stripHash(rawUrl: string): string {
  const index = rawUrl.indexOf('#');
  return index === -1 ? rawUrl : rawUrl.slice(0, index);
}
