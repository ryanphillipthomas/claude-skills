import type { Locator } from 'playwright';
import type { StyleDelta } from '@ui-atlas/protocol';
import { type StyleProbe } from './page-scripts.js';
/**
 * Computed properties that matter to a design system. Keeping the list short
 * makes state deltas readable: a hover that only changes `background-color`
 * should say exactly that.
 */
export declare const STYLE_WHITELIST: readonly string[];
/** Read the whitelisted computed styles plus cheap "did anything happen" signals. */
export declare function probeStyles(locator: Locator, timeoutMs?: number): Promise<StyleProbe>;
/** Diff two probes into the delta stored on a state capture. */
export declare function diffStyles(before: StyleProbe, after: StyleProbe): StyleDelta;
/** True when a delta contains evidence that a state actually took effect. */
export declare function deltaHasEvidence(delta: StyleDelta): boolean;
export type { StyleProbe };
//# sourceMappingURL=style-diff.d.ts.map