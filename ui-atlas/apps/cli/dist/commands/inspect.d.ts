import { flagString, type ParsedArgs } from '../args.js';
import type { Logger } from '../logger.js';
export declare const INSPECT_HELP: string;
export declare function runInspect(args: ParsedArgs, logger: Logger): Promise<number>;
/** Present so `flagString` stays referenced when options grow. */
export { flagString };
//# sourceMappingURL=inspect.d.ts.map