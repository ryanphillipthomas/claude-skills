import { type Logger } from './logger.js';
export declare const TOP_LEVEL_HELP: string;
export interface RunOptions {
    argv: string[];
    logger?: Logger;
}
/** Returns a process exit code; never calls `process.exit` itself. */
export declare function run(options: RunOptions): Promise<number>;
//# sourceMappingURL=index.d.ts.map