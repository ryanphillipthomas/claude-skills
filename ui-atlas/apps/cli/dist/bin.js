#!/usr/bin/env node
import { run } from './index.js';
const code = await run({ argv: process.argv.slice(2) });
process.exitCode = code;
//# sourceMappingURL=bin.js.map