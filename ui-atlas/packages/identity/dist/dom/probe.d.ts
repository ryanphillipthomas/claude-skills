import type { ElementProbe, FingerprintInput } from '@ui-atlas/protocol';
import { type CandidateDraft } from '../core/index.js';
/** Test attributes checked in priority order. `data-testid` is the default. */
export declare const TEST_ID_ATTRIBUTES: readonly ["data-testid", "data-test-id", "data-test", "data-qa", "data-cy", "data-automation-id"];
/** Text contributed directly by an element, ignoring descendant elements. */
export declare function directText(element: Element): string;
/**
 * A positional CSS path. Last resort: it breaks on any structural edit, which
 * is exactly why it scores lowest.
 */
export declare function cssPathFor(element: Element): string;
export declare function buildCandidates(element: Element): CandidateDraft[];
export declare function buildFingerprintInput(element: Element): FingerprintInput;
export declare function probeElement(element: Element): ElementProbe;
//# sourceMappingURL=probe.d.ts.map