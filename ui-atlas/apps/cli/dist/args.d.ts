export interface ParsedArgs {
    command: string[];
    positionals: string[];
    flags: Map<string, string | boolean>;
}
/**
 * Small hand-rolled parser. The CLI surface is deliberately narrow, so a
 * dependency for `--flag value` parsing would not earn its place.
 */
export declare function parseArgs(argv: string[]): ParsedArgs;
export declare function flagString(args: ParsedArgs, name: string): string | undefined;
export declare function flagBoolean(args: ParsedArgs, name: string): boolean | undefined;
export declare function flagNumber(args: ParsedArgs, name: string): number | undefined;
/** Reject anything that is not an http(s) URL before we hand it to a browser. */
export declare function requireHttpUrl(value: string, label?: string): string;
//# sourceMappingURL=args.d.ts.map