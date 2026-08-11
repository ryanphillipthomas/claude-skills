/**
 * Shortcut matching that works when Alt/Option rewrites `event.key` (as it does
 * on macOS): letters are matched by physical `code`, named keys by `key`.
 */
export function matchesCombo(event, combo) {
    const parts = combo.split('+').map((part) => part.trim()).filter((part) => part.length > 0);
    const key = parts.pop();
    if (key === undefined)
        return false;
    const wanted = {
        alt: false,
        shift: false,
        ctrl: false,
        meta: false,
    };
    for (const modifier of parts) {
        const name = modifier.toLowerCase();
        if (name === 'alt' || name === 'option')
            wanted.alt = true;
        else if (name === 'shift')
            wanted.shift = true;
        else if (name === 'ctrl' || name === 'control')
            wanted.ctrl = true;
        else if (name === 'meta' || name === 'cmd' || name === 'command')
            wanted.meta = true;
        else
            return false;
    }
    if (event.altKey !== wanted.alt)
        return false;
    if (event.shiftKey !== wanted.shift)
        return false;
    if (event.ctrlKey !== wanted.ctrl)
        return false;
    if (event.metaKey !== wanted.meta)
        return false;
    if (key.length === 1 && /[a-z0-9]/i.test(key)) {
        const code = /[0-9]/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`;
        return event.code === code || event.key.toLowerCase() === key.toLowerCase();
    }
    return event.key === key;
}
/** True when the event came from a field the user is typing into. */
export function isTypingTarget(target) {
    if (!(target instanceof Element))
        return false;
    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select')
        return true;
    return target instanceof HTMLElement && target.isContentEditable;
}
//# sourceMappingURL=shortcuts.js.map