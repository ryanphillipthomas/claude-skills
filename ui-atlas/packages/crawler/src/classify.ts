import { DEFAULT_MUTATION_WORDS } from '@ui-atlas/config';
import type { InteractionClass } from '@ui-atlas/protocol';
import { firstMatchingGlob } from './glob.js';
import type { InteractionFacts } from './inventory-page.js';

export interface ClassifyOptions {
  /** Added to the defaults, never replacing them. */
  extraMutationWords?: readonly string[] | undefined;
  /** The crawl's deny globs, so a sign-out control is called what it is. */
  denyPaths?: readonly string[] | undefined;
  /** Origins in scope, so an off-site link can be said to leave. */
  origins?: ReadonlySet<string> | undefined;
}

export interface Classification {
  classification: InteractionClass;
  reasons: string[];
}

function normalise(value: string | undefined): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The mutation word that matched, so the reason can name it. */
function matchedMutationWord(haystack: string, words: readonly string[]): string | undefined {
  for (const word of words) {
    if (haystack.includes(word)) return word;
  }
  return undefined;
}

function pathnameOf(href: string | undefined): string | undefined {
  if (href === undefined) return undefined;
  try {
    return new URL(href).pathname;
  } catch {
    return undefined;
  }
}

/**
 * Decide what a control is likely to *do*.
 *
 * Nothing here decides whether the tool may touch it, because the tool never
 * touches it: the inventory is read-only, and clicking still requires a human
 * to write a recipe. This exists so that human can tell "opens a menu" from
 * "deletes the account" without reading the markup themselves.
 *
 * Mutation rules run first and win. The classifier is deliberately biased
 * towards calling something a mutation: a wrongly flagged control costs ten
 * seconds of review, a missed one can cost real damage.
 */
export function classifyInteraction(
  facts: InteractionFacts,
  options: ClassifyOptions = {},
): Classification {
  const reasons: string[] = [];
  const words = [...DEFAULT_MUTATION_WORDS, ...(options.extraMutationWords ?? [])];
  const label = normalise(`${facts.probe.accessibleName ?? ''} ${facts.probe.textExcerpt ?? ''}`);
  const role = facts.probe.role;

  /* ---- Mutation ------------------------------------------------------- */

  const pathname = pathnameOf(facts.href);
  if (pathname !== undefined && options.denyPaths !== undefined) {
    const denied = firstMatchingGlob(pathname, [...options.denyPaths]);
    if (denied !== undefined) {
      reasons.push(`href matches the deny rule "${denied}"`);
      return { classification: 'mutation', reasons };
    }
  }

  if (facts.type === 'submit' || facts.type === 'reset') {
    reasons.push(`type="${facts.type}"`);
    return { classification: 'mutation', reasons };
  }

  // A <button> inside a form with no type attribute defaults to submit. This is
  // the most common way a control turns out to submit something unexpectedly.
  if (facts.tagName === 'button' && facts.inForm && facts.type === undefined) {
    reasons.push('a <button> in a form with no type defaults to submit');
    return { classification: 'mutation', reasons };
  }

  if (facts.inForm && facts.formMethod === 'post' && facts.tagName === 'button') {
    reasons.push('button inside a form with method="post"');
    return { classification: 'mutation', reasons };
  }

  const word = matchedMutationWord(label, words);
  if (word !== undefined) {
    reasons.push(`its name contains "${word}"`);
    return { classification: 'mutation', reasons };
  }

  /* ---- Navigation ------------------------------------------------------ */

  if (facts.href !== undefined && (facts.tagName === 'a' || role === 'link')) {
    const origin = originOfHref(facts.href);
    if (origin !== undefined && options.origins !== undefined && !options.origins.has(origin)) {
      reasons.push(`links off-site to ${origin}`);
    } else {
      reasons.push('an anchor with an href');
    }
    return { classification: 'navigation', reasons };
  }

  /* ---- Inert (changes presentation only) -------------------------------- */

  if (facts.isSummary) {
    reasons.push('a <summary>, which opens its own <details>');
    return { classification: 'inert', reasons };
  }
  if (facts.ariaExpanded !== undefined) {
    reasons.push(`aria-expanded="${facts.ariaExpanded}", so it toggles something on the page`);
    return { classification: 'inert', reasons };
  }
  if (facts.ariaHasPopup !== undefined) {
    reasons.push(`aria-haspopup="${facts.ariaHasPopup}"`);
    return { classification: 'inert', reasons };
  }
  if (role === 'tab') {
    reasons.push('role="tab", which switches a panel');
    return { classification: 'inert', reasons };
  }
  if (facts.hasAriaControls && !facts.inForm) {
    reasons.push('aria-controls outside a form, so it drives another element');
    return { classification: 'inert', reasons };
  }

  /* ---- Nothing said either way ----------------------------------------- */

  reasons.push('nothing about it says what it does; treat it as unsafe until reviewed');
  return { classification: 'unknown', reasons };
}

function originOfHref(href: string): string | undefined {
  try {
    return new URL(href).origin;
  } catch {
    return undefined;
  }
}

/** Classes a generated recipe skeleton is allowed to mention. */
export const REVIEWABLE_CLASSES: readonly InteractionClass[] = ['navigation', 'inert'];
