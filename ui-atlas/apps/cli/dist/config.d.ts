import { type UiAtlasConfig } from '@ui-atlas/config';
import { type ParsedArgs } from './args.js';
export declare const TOOL_VERSION: string;
export interface CliConfig {
    config: UiAtlasConfig;
    outputRoot: string;
    sourcePath: string | undefined;
}
/**
 * Config precedence: explicit CLI flags beat the config file, which beats the
 * built-in defaults. Nothing here reads environment variables for secrets.
 */
export declare function loadCliConfig(args: ParsedArgs, extraOverrides?: Record<string, unknown>): Promise<CliConfig>;
//# sourceMappingURL=config.d.ts.map