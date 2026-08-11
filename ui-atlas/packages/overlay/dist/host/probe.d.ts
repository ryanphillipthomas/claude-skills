import type { Frame, Page } from 'playwright';
import { type ElementProbe } from '@ui-atlas/protocol';
export declare const PROBE_GLOBAL = "__uiAtlasProbe";
export declare function probeBundlePath(): string;
export declare function loadProbeBundle(): Promise<string>;
/**
 * Describe the first element matching `selector`, using exactly the same probe
 * the inspector uses, so a selector-driven capture and a clicked capture
 * produce identical identity data.
 */
export declare function probeSelector(root: Page | Frame, selector: string, timeoutMs?: number): Promise<ElementProbe>;
//# sourceMappingURL=probe.d.ts.map