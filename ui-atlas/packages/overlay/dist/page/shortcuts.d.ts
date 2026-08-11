/**
 * Shortcut matching that works when Alt/Option rewrites `event.key` (as it does
 * on macOS): letters are matched by physical `code`, named keys by `key`.
 */
export declare function matchesCombo(event: KeyboardEvent, combo: string): boolean;
/** True when the event came from a field the user is typing into. */
export declare function isTypingTarget(target: EventTarget | null): boolean;
//# sourceMappingURL=shortcuts.d.ts.map