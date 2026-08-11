import { describe, expect, it } from 'vitest';
import { DEFAULT_DENY_PATHS } from '@ui-atlas/config';
import { SCHEMA_VERSION, type InteractionCandidate, type LocatorCandidate } from '@ui-atlas/protocol';
import {
  classifyInteraction,
  suggestRecipes,
  summariseInventory,
  targetFor,
  type InteractionFacts,
} from '@ui-atlas/crawler';

const ORIGIN = 'https://site.test';

/**
 * `name` and `role` are lifted out because they live on the probe, which is the
 * inspector's description of the element; everything else is a fact the probe
 * does not carry.
 */
type FactOverrides = Partial<Omit<InteractionFacts, 'probe'>> & {
  name?: string | undefined;
  role?: string | undefined;
  text?: string | undefined;
};

function facts(overrides: FactOverrides = {}): InteractionFacts {
  const { name, role, text, ...rest } = overrides;
  return {
    probe: {
      tagName: rest.tagName ?? 'button',
      ...(name === undefined ? {} : { accessibleName: name }),
      ...(role === undefined ? {} : { role }),
      ...(text === undefined ? {} : { textExcerpt: text }),
      boundingBox: { x: 0, y: 0, width: 100, height: 30 },
      visible: true,
      candidates: [],
      fingerprintInput: {
        tagName: rest.tagName ?? 'button',
        nameClass: 'short-text',
        ancestorRoles: [],
        stableAttributes: {},
        geometryBucket: 'sm',
      },
      shadowHostPath: [],
      closedShadowEncountered: false,
      attributes: {},
    },
    tagName: 'button',
    type: undefined,
    href: undefined,
    disabled: false,
    inForm: false,
    formMethod: undefined,
    ariaExpanded: undefined,
    ariaHasPopup: undefined,
    hasAriaControls: false,
    isSummary: false,
    ...rest,
  };
}

function classify(overrides: FactOverrides = {}) {
  return classifyInteraction(facts(overrides), {
    denyPaths: DEFAULT_DENY_PATHS,
    origins: new Set([ORIGIN]),
  });
}

describe('classifying an interactive control', () => {
  it('calls destructive wording a mutation, whatever the element is', () => {
    for (const name of [
      'Delete account',
      'Place order',
      'Send message',
      'Buy now',
      'Unsubscribe',
      'Sign out',
      'Reset everything',
      'Save changes',
    ]) {
      expect(classify({ name }).classification).toBe('mutation');
    }
  });

  it('calls a submit or reset control a mutation', () => {
    expect(classify({ type: 'submit', name: 'Go' }).classification).toBe('mutation');
    expect(classify({ type: 'reset', name: 'Go' }).classification).toBe('mutation');
  });

  it('catches the <button> in a form with no type, which defaults to submit', () => {
    const result = classify({ tagName: 'button', inForm: true, formMethod: 'get', name: 'Go' });
    expect(result.classification).toBe('mutation');
    expect(result.reasons[0]).toContain('defaults to submit');

    // An explicit type="button" in a form does not submit.
    expect(
      classify({ tagName: 'button', type: 'button', inForm: true, name: 'Go' }).classification,
    ).not.toBe('mutation');
  });

  it('calls a sign-out link a mutation rather than navigation', () => {
    const result = classify({ tagName: 'a', href: `${ORIGIN}/account/logout`, name: 'Account' });
    expect(result.classification).toBe('mutation');
    expect(result.reasons[0]).toContain('deny rule');
  });

  it('calls an ordinary anchor navigation, and says when it leaves the site', () => {
    const local = classify({ tagName: 'a', href: `${ORIGIN}/docs`, name: 'Docs' });
    expect(local.classification).toBe('navigation');
    expect(local.reasons[0]).toBe('an anchor with an href');

    const away = classify({ tagName: 'a', href: 'https://elsewhere.test/x', name: 'Partner' });
    expect(away.classification).toBe('navigation');
    expect(away.reasons[0]).toContain('off-site');
  });

  it('calls presentation-only controls inert', () => {
    expect(classify({ isSummary: true, tagName: 'summary', name: 'More' }).classification).toBe(
      'inert',
    );
    expect(classify({ ariaExpanded: 'false', name: 'Menu' }).classification).toBe('inert');
    expect(classify({ ariaHasPopup: 'menu', name: 'Options' }).classification).toBe('inert');
    expect(classify({ role: 'tab', name: 'Details' }).classification).toBe('inert');
    expect(classify({ hasAriaControls: true, name: 'Toggle' }).classification).toBe('inert');
  });

  it('falls back to unknown, and says to treat it as unsafe', () => {
    const result = classify({ tagName: 'button', type: 'button', name: 'Go' });
    expect(result.classification).toBe('unknown');
    expect(result.reasons[0]).toContain('unsafe');
  });

  it('lets mutation wording beat an otherwise inert signal', () => {
    // A disclosure that says "Delete" is still a delete as far as we know.
    expect(classify({ ariaExpanded: 'false', name: 'Delete options' }).classification).toBe(
      'mutation',
    );
  });

  it('records disabled rather than reclassifying on it', () => {
    // Disabled today, enabled tomorrow: what it *does* has not changed.
    expect(classify({ disabled: true, name: 'Delete account' }).classification).toBe('mutation');
  });

  it('accepts extra mutation words from configuration', () => {
    const base = facts({ name: 'Yeet the records' });
    expect(classifyInteraction(base, {}).classification).toBe('unknown');
    expect(classifyInteraction(base, { extraMutationWords: ['yeet'] }).classification).toBe(
      'mutation',
    );
  });
});

/* -------------------------------------------------------------------------- */

function locator(overrides: Partial<LocatorCandidate> = {}): LocatorCandidate {
  return {
    type: 'test-id',
    value: 'save',
    uniquenessCount: 1,
    score: 90,
    reasons: [],
    ...overrides,
  };
}

function candidate(overrides: Partial<InteractionCandidate> = {}): InteractionCandidate {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'int-1',
    runId: 'run-1',
    pageId: 'page-1',
    url: `${ORIGIN}/components`,
    routeKey: 'site.test-components',
    foundAt: new Date(0).toISOString(),
    tagName: 'button',
    classification: 'inert',
    reasons: ['aria-expanded'],
    boundingBox: { x: 0, y: 0, width: 10, height: 10 },
    disabled: false,
    locator: locator(),
    ...overrides,
  };
}

describe('recipe targets from locator candidates', () => {
  it('maps each candidate type it can express', () => {
    expect(targetFor(locator({ type: 'test-id', value: 'save' }))).toBe("{ testId: 'save' }");
    expect(targetFor(locator({ type: 'role-name', value: 'Save', role: 'button' }))).toBe(
      "{ role: 'button', name: 'Save' }",
    );
    expect(targetFor(locator({ type: 'label', value: 'Email' }))).toBe("{ label: 'Email' }");
    expect(targetFor(locator({ type: 'css-path', value: 'main > button' }))).toBe(
      "{ css: 'main > button' }",
    );
    expect(targetFor(locator({ type: 'id', value: 'save-btn' }))).toBe("{ css: '#save-btn' }");
    expect(targetFor(locator({ type: 'id', value: '1weird:id' }))).toBe(
      `{ css: '[id="1weird:id"]' }`,
    );
  });

  it('declines the types the recipe vocabulary cannot express', () => {
    expect(targetFor(locator({ type: 'alt', value: 'Logo' }))).toBeUndefined();
    expect(targetFor(locator({ type: 'title', value: 'Hint' }))).toBeUndefined();
    // `role-name` without a role cannot be rebuilt.
    expect(targetFor(locator({ type: 'role-name', value: 'Save' }))).toBeUndefined();
    expect(targetFor(undefined)).toBeUndefined();
  });

  it('escapes a quote rather than emitting broken YAML', () => {
    expect(targetFor(locator({ type: 'text', value: "It's here" }))).toBe("{ text: 'It''s here' }");
  });
});

describe('suggested recipes', () => {
  it('never turns a mutation candidate into a step', () => {
    const text = suggestRecipes([
      candidate({ id: 'a', classification: 'mutation', accessibleName: 'Delete account' }),
      candidate({ id: 'b', classification: 'unknown', accessibleName: 'Mystery button' }),
    ]);

    // Both appear, as comments, so the user knows they exist.
    expect(text).toContain('Delete account');
    expect(text).toContain('Mystery button');
    // But neither becomes a step.
    expect(text).not.toMatch(/^\s*- select:/m);
    expect(text).toContain('Nothing here looked safe enough to suggest.');
  });

  it('emits no click step, ever, even for a safe-looking control', () => {
    const text = suggestRecipes([
      candidate({ id: 'a', classification: 'inert', accessibleName: 'Show details' }),
      candidate({ id: 'b', classification: 'navigation', accessibleName: 'Docs' }),
    ]);

    expect(text).toMatch(/^\s*- select: \{ testId: 'save' \}$/m);
    expect(text).toContain('captureStates: [default, hover, focus-visible]');
    // The generated file suggests clicking in prose; it never writes the step.
    expect(text).not.toMatch(/^\s*- click:/m);
    expect(text).toContain('This file will not add one for you.');
  });

  it('groups by route and names the recipe after it', () => {
    const text = suggestRecipes([
      candidate({ id: 'a', url: `${ORIGIN}/components` }),
      candidate({ id: 'b', url: `${ORIGIN}/about` }),
    ]);
    expect(text).toContain('- name: components-controls');
    expect(text).toContain('- name: about-controls');
    expect(text).toContain("match: '/components'");
  });

  it('skips a candidate with no expressible locator', () => {
    const text = suggestRecipes([
      candidate({ id: 'a', locator: locator({ type: 'alt', value: 'Logo' }) }),
    ]);
    expect(text).not.toMatch(/^\s*- select:/m);
  });

  it('says so plainly when the inventory is empty', () => {
    const text = suggestRecipes([]);
    expect(text).toContain('found no interactive controls');
    expect(text).toContain('recipes: []');
  });

  it('summarises counts by class', () => {
    const summary = summariseInventory([
      candidate({ id: 'a', classification: 'mutation' }),
      candidate({ id: 'b', classification: 'mutation' }),
      candidate({ id: 'c', classification: 'inert' }),
      candidate({ id: 'd', classification: 'navigation', url: `${ORIGIN}/other`, routeKey: 'other' }),
    ]);
    expect(summary).toEqual({
      total: 4,
      routes: 2,
      byClass: { mutation: 2, inert: 1, navigation: 1, unknown: 0 },
    });
  });
});
