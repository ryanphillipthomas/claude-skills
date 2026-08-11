import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildElementIdentity, buildFramePath, resolveElement } from '@ui-atlas/identity';
import { probeSelector } from '@ui-atlas/overlay';
import { UiAtlasError, type ElementIdentity } from '@ui-atlas/protocol';
import { startHarness, type TestHarness } from '../support/harness.js';

let harness: TestHarness;

beforeEach(async () => {
  harness = await startHarness({ overlay: false });
});

afterEach(async () => {
  await harness.dispose();
});

async function identityFor(selector: string): Promise<ElementIdentity> {
  const probe = await probeSelector(harness.session.page, selector);
  return buildElementIdentity(probe, await buildFramePath(harness.session.page.mainFrame()));
}

describe('element identity', () => {
  beforeEach(async () => {
    await harness.session.navigate(harness.url('/identity.html'));
  });

  it('prefers a test attribute when one is authored', async () => {
    const identity = await identityFor('[data-testid="save-button"]');
    expect(identity.chosenLocator.type).toBe('test-id');
    expect(identity.chosenLocator.attribute).toBe('data-testid');
    expect(identity.chosenLocator.uniquenessCount).toBe(1);
    expect(identity.role).toBe('button');
    expect(identity.accessibleName).toBe('Save');
  });

  it('uses an authored id but never a generated one', async () => {
    const authored = await identityFor('#publish-button');
    expect(authored.locatorCandidates.some((candidate) => candidate.type === 'id')).toBe(true);

    const generated = await identityFor('[id=":r7a:"]');
    expect(generated.locatorCandidates.some((candidate) => candidate.type === 'id')).toBe(false);
    expect(generated.chosenLocator.type).toBe('role-name');

    const hashed = await identityFor('#c4f9a1e77b0d42');
    expect(hashed.locatorCandidates.some((candidate) => candidate.type === 'id')).toBe(false);
  });

  it('offers label, placeholder and alt candidates where they exist', async () => {
    const input = await identityFor('#account-email');
    const types = input.locatorCandidates.map((candidate) => candidate.type);
    expect(types).toContain('label');
    expect(types).toContain('placeholder');

    const image = await identityFor('img[alt="Company logo"]');
    expect(image.locatorCandidates.map((candidate) => candidate.type)).toContain('alt');
  });

  it('never chooses an ambiguous candidate over a unique one', async () => {
    const identity = await identityFor('[data-testid="ambiguous-region"] button');

    const roleCandidate = identity.locatorCandidates.find((candidate) => candidate.type === 'role-name');
    expect(roleCandidate?.uniquenessCount).toBe(3);
    expect(roleCandidate?.reasons.some((reason) => reason.includes('matched 3 elements'))).toBe(true);

    // Three identical buttons: only the positional path picks out one of them,
    // so it wins despite scoring lowest, and the ambiguous ones stay available
    // as fallbacks.
    expect(identity.chosenLocator.uniquenessCount).toBe(1);
    expect(identity.chosenLocator.type).toBe('css-path');
    expect(identity.locatorCandidates.map((candidate) => candidate.type)).toContain('role-name');
  });

  it('falls back to a scoped selector when nothing stable exists', async () => {
    const identity = await identityFor('.x1y2z3');
    expect(['css-scoped', 'css-path', 'text']).toContain(identity.chosenLocator.type);
    expect(identity.chosenLocator.score).toBeGreaterThan(0);
  });

  it('re-resolves a stored identity to exactly one element', async () => {
    const identity = await identityFor('[data-testid="save-button"]');
    const resolution = await resolveElement(harness.session.page, identity);
    expect(resolution.matches).toBe(1);
    expect(resolution.fellBack).toBe(false);
    expect(await resolution.locator.textContent()).toBe('Save');
  });

  it('falls through to the next candidate when the first one disappears', async () => {
    const identity = await identityFor('[data-testid="save-button"]');
    await harness.session.page.evaluate(() => {
      document.querySelector('[data-testid="save-button"]')?.removeAttribute('data-testid');
    });

    const resolution = await resolveElement(harness.session.page, identity);
    expect(resolution.fellBack).toBe(true);
    expect(resolution.matches).toBe(1);
    expect(resolution.warnings.some((warning) => warning.includes('matched no elements'))).toBe(true);
    expect(await resolution.locator.textContent()).toBe('Save');
  });

  it('records every candidate that failed before falling back to a positional path', async () => {
    const identity = await identityFor('[data-testid="save-button"]');
    await harness.session.page.evaluate(() => {
      document.querySelector('[data-testid="save-button"]')?.remove();
    });

    const resolution = await resolveElement(harness.session.page, identity, {
      expectedBox: identity.boundingBox,
    });

    // The element is gone. The positional path still matches — it now names the
    // next button, which has taken the same place in the layout. Geometry cannot
    // tell a same-position replacement apart, so the honest signal is the trail
    // of candidates that stopped matching.
    expect(resolution.candidate.type).toBe('css-path');
    expect(resolution.fellBack).toBe(true);
    expect(await resolution.locator.textContent()).not.toBe('Save');
    expect(resolution.warnings.length).toBeGreaterThanOrEqual(3);
    expect(
      resolution.warnings.every((warning) => warning.includes('matched no elements')),
    ).toBe(true);
  });

  it('warns when a positional fallback lands on a differently shaped element', async () => {
    const identity = await identityFor('#publish-button');
    await harness.session.page.evaluate(() => {
      document.querySelector('#publish-button')?.remove();
    });

    const resolution = await resolveElement(harness.session.page, identity, {
      expectedBox: identity.boundingBox,
    });
    expect(resolution.candidate.type).toBe('css-path');
    expect(
      resolution.warnings.some((warning) => warning.includes('different position')),
    ).toBe(true);
  });

  it('reports a structured error when nothing matches at all', async () => {
    const identity = await identityFor('[data-testid="save-button"]');
    await harness.session.page.evaluate(() => {
      document.querySelector('main')?.remove();
    });
    await expect(resolveElement(harness.session.page, identity)).rejects.toThrow(UiAtlasError);
    await expect(resolveElement(harness.session.page, identity)).rejects.toThrow(/matched anything/);
  });

  it('disambiguates by position when several elements share an identity', async () => {
    const page = harness.session.page;
    const second = page.locator('[data-testid="ambiguous-region"] button').nth(1);
    const probe = await second.evaluate((element: Element) =>
      (window as unknown as { __uiAtlasProbe(el: Element): unknown }).__uiAtlasProbe(element),
    );
    const identity = buildElementIdentity(
      probe as Parameters<typeof buildElementIdentity>[0],
      await buildFramePath(page.mainFrame()),
    );

    // Force the ambiguous role+name candidate to be tried first.
    const roleCandidate = identity.locatorCandidates.find((candidate) => candidate.type === 'role-name');
    expect(roleCandidate).toBeDefined();
    if (roleCandidate === undefined) return;

    const resolution = await resolveElement(
      page,
      { ...identity, chosenLocator: roleCandidate, locatorCandidates: [roleCandidate] },
      { expectedBox: identity.boundingBox },
    );
    expect(resolution.matches).toBe(3);
    expect(resolution.warnings.some((warning) => warning.includes('disambiguated'))).toBe(true);
    const box = await resolution.locator.boundingBox();
    expect(box?.x).toBeCloseTo(identity.boundingBox.x, 0);
  });

  it('fingerprints the same component identically across visits', async () => {
    const first = await identityFor('[data-testid="save-button"]');
    await harness.session.navigate(harness.url('/identity.html'));
    const second = await identityFor('[data-testid="save-button"]');
    expect(second.structuralFingerprint).toBe(first.structuralFingerprint);

    const other = await identityFor('#publish-button');
    expect(other.structuralFingerprint).not.toBe(first.structuralFingerprint);
  });
});
