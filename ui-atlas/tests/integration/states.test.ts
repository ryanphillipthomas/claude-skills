import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildElementIdentity, buildFramePath } from '@ui-atlas/identity';
import { probeSelector } from '@ui-atlas/overlay';
import type { CaptureRecord, ElementIdentity, StateName } from '@ui-atlas/protocol';
import { startHarness, type TestHarness } from '../support/harness.js';

let harness: TestHarness;

beforeEach(async () => {
  harness = await startHarness({ overlay: false });
  await harness.session.navigate(harness.url('/states.html'));
});

afterEach(async () => {
  await harness.dispose();
});

async function identityFor(selector: string): Promise<ElementIdentity> {
  const probe = await probeSelector(harness.session.page, selector);
  return buildElementIdentity(probe, await buildFramePath(harness.session.page.mainFrame()));
}

async function captureState(selector: string, state: StateName): Promise<CaptureRecord> {
  return harness.session.captures.capture({
    kind: 'element',
    state,
    identity: await identityFor(selector),
  });
}

describe('state capture', () => {
  it('captures a hover-only menu and proves the hover took effect', async () => {
    const record = await captureState('[data-testid="menu-trigger"]', 'hover');
    expect(record.status).toBe('captured');
    expect(record.state).toMatchObject({ provenance: 'interacted', verified: true });

    // The fixture only reveals the panel on :hover, so descendant visibility is
    // the evidence that the state really applied.
    const parent = await captureState('.menu', 'hover');
    expect(parent.styleDelta?.descendantVisibilityChanged).toBe(true);
  });

  it('captures focus and confirms the element became activeElement', async () => {
    const record = await captureState('[data-testid="focus-demo"]', 'focus');
    expect(record.status).toBe('captured');
    expect(record.state.provenance).toBe('interacted');
    expect(record.state.verified).toBe(true);
    expect(record.state.verification).toContain('activeElement');
    expect(record.styleDelta?.changed['background-color']).toBeDefined();
  });

  it('reaches a real focus ring for focus-visible, or says it could not', async () => {
    const record = await captureState('[data-testid="focus-demo"]', 'focus-visible');
    if (record.status === 'captured') {
      expect(record.state.verified).toBe(true);
      expect(record.state.provenance).toBe('interacted');
      // The fixture paints a red outline only for :focus-visible.
      expect(record.styleDelta?.changed['outline-color']).toBeDefined();
    } else {
      expect(record.status).toBe('skipped');
      expect(record.error?.code).toBe('state.unsupported');
      expect(record.state.verified).toBe(false);
    }
  });

  it('captures the pressed state while the mouse is held down', async () => {
    const record = await captureState('[data-testid="press-target"]', 'active');
    expect(record.status).toBe('captured');
    expect(record.state.provenance).toBe('interacted');
    expect(record.state.verified).toBe(true);
    expect(record.styleDelta?.changed['background-color']?.to).toBe('rgb(124, 58, 237)');

    // The button must be released again, whatever happened during the capture.
    const stillActive = await harness.session.page.evaluate(
      () => document.querySelector('[data-testid="press-target"]')?.matches(':active') ?? false,
    );
    expect(stillActive).toBe(false);
  });

  it('captures an already-checked control as observed', async () => {
    const record = await captureState('[data-testid="checkbox-checked"]', 'checked');
    expect(record.status).toBe('captured');
    expect(record.state.provenance).toBe('observed');
    expect(record.state.verification).toContain('already checked');
  });

  it('labels a synthesised checked state as forced and undoes it', async () => {
    const record = await captureState('[data-testid="checkbox-unchecked"]', 'checked');
    expect(record.status).toBe('captured');
    expect(record.state.provenance).toBe('forced');
    expect(record.state.verification).toContain('not observed on the site');
    expect(record.interactionRecipe?.some((step) => step.action === 'force-pseudo-state')).toBe(true);

    const checkedAfterwards = await harness.session.page
      .locator('[data-testid="checkbox-unchecked"]')
      .isChecked();
    expect(checkedAfterwards).toBe(false);
  });

  it('skips a state it cannot reach honestly when forcing is disabled', async () => {
    const strict = await startHarness({
      overlay: false,
      config: { capture: { allowForcedStates: false, screenshotTimeoutMs: 12_000 } },
    });
    try {
      await strict.session.navigate(strict.url('/states.html'));
      const probe = await probeSelector(strict.session.page, '[data-testid="checkbox-unchecked"]');
      const identity = buildElementIdentity(probe, await buildFramePath(strict.session.page.mainFrame()));
      const record = await strict.session.captures.capture({
        kind: 'element',
        state: 'checked',
        identity,
      });
      expect(record.status).toBe('skipped');
      expect(record.image).toBeUndefined();
      expect(record.error?.message).toContain('forced states are disabled');
    } finally {
      await strict.dispose();
    }
  });

  it('captures a natively disabled control as observed', async () => {
    const record = await captureState('[data-testid="disabled-button"]', 'disabled');
    expect(record.status).toBe('captured');
    expect(record.state.provenance).toBe('observed');
  });

  it('captures an already-selected tab as observed and the other as forced', async () => {
    const selected = await captureState('[data-testid="tab-one"]', 'selected');
    expect(selected.state.provenance).toBe('observed');

    const forced = await captureState('[data-testid="tab-two"]', 'selected');
    expect(forced.state.provenance).toBe('forced');
    const restored = await harness.session.page
      .locator('[data-testid="tab-two"]')
      .getAttribute('aria-selected');
    expect(restored).toBe('false');
  });

  it('warns when a state produced no visible change', async () => {
    // A plain paragraph has no hover styling; claiming a hover state without
    // evidence would be dishonest, so the record carries a warning.
    const record = await captureState('[data-testid="selectable-text"]', 'hover');
    expect(record.status).toBe('captured');
    expect(record.warnings.some((warning) => warning.includes('no computed-style change'))).toBe(true);
  });

  it('leaves no pointer, focus or attribute residue after a full state set', async () => {
    const states: StateName[] = ['default', 'hover', 'focus', 'active', 'checked', 'disabled'];
    for (const state of states) {
      await captureState('[data-testid="checkbox-unchecked"]', state);
    }

    const residue = await harness.session.page.evaluate(() => {
      const input = document.querySelector('[data-testid="checkbox-unchecked"]') as HTMLInputElement | null;
      return {
        checked: input?.checked ?? null,
        disabled: input?.disabled ?? null,
        ariaChecked: input?.getAttribute('aria-checked'),
        ariaDisabled: input?.getAttribute('aria-disabled'),
        focused: document.activeElement === input,
        active: input?.matches(':active') ?? null,
      };
    });
    expect(residue).toEqual({
      checked: false,
      disabled: false,
      ariaChecked: null,
      ariaDisabled: null,
      focused: false,
      active: false,
    });
  });
});
