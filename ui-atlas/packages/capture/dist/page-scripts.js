export function readStyles(element, properties) {
    const view = element.ownerDocument.defaultView;
    if (view === null)
        throw new Error('element has no window');
    const computed = view.getComputedStyle(element);
    const styles = {};
    for (const property of properties)
        styles[property] = computed.getPropertyValue(property);
    // Descendant visibility is cheap evidence that a state (a hover menu, an
    // expanded disclosure) actually did something.
    let visibleDescendants = 0;
    const descendants = element.querySelectorAll('*');
    const limit = Math.min(descendants.length, 500);
    for (let index = 0; index < limit; index += 1) {
        const child = descendants[index];
        if (child === undefined)
            continue;
        const childStyle = view.getComputedStyle(child);
        if (childStyle.display === 'none' || childStyle.visibility === 'hidden')
            continue;
        const childRect = child.getBoundingClientRect();
        if (childRect.width > 0 && childRect.height > 0)
            visibleDescendants += 1;
    }
    const rect = element.getBoundingClientRect();
    return {
        styles,
        visibleDescendants,
        box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
}
export function readStateFlags(element) {
    const anyElement = element;
    const isTrue = (name) => element.getAttribute(name) === 'true';
    const matches = (selector) => {
        try {
            return element.matches(selector);
        }
        catch {
            return false;
        }
    };
    const root = element.getRootNode();
    return {
        checked: anyElement.checked === true || isTrue('aria-checked'),
        selected: anyElement.selected === true || isTrue('aria-selected'),
        expanded: isTrue('aria-expanded') || anyElement.open === true,
        disabled: anyElement.disabled === true || isTrue('aria-disabled'),
        focusVisible: matches(':focus-visible'),
        focused: root.activeElement === element || document.activeElement === element,
        active: matches(':active'),
        supportsChecked: element.tagName === 'INPUT' && (anyElement.type === 'checkbox' || anyElement.type === 'radio'),
        supportsDisabled: 'disabled' in element,
        tagName: element.tagName.toLowerCase(),
    };
}
/** Apply a forced attribute/property and describe exactly how to undo it. */
export function forceStateFlag(element, request) {
    const target = element;
    if (request.property !== null && request.property in target) {
        const previous = target[request.property];
        target[request.property] = request.propertyValue;
        return {
            attribute: null,
            hadAttribute: false,
            previousAttribute: null,
            property: request.property,
            previousProperty: previous === true,
        };
    }
    const hadAttribute = element.hasAttribute(request.attribute);
    const previousAttribute = element.getAttribute(request.attribute);
    element.setAttribute(request.attribute, request.attributeValue);
    return {
        attribute: request.attribute,
        hadAttribute,
        previousAttribute,
        property: null,
        previousProperty: null,
    };
}
export function undoStateFlag(element, undo) {
    const target = element;
    if (undo.property !== null) {
        target[undo.property] = undo.previousProperty === true;
        return true;
    }
    if (undo.attribute === null)
        return true;
    if (undo.hadAttribute && undo.previousAttribute !== null) {
        element.setAttribute(undo.attribute, undo.previousAttribute);
    }
    else {
        element.removeAttribute(undo.attribute);
    }
    return true;
}
export function blurElement(element) {
    const target = element;
    if (typeof target.blur === 'function')
        target.blur();
}
export function blurActiveElement() {
    const active = document.activeElement;
    if (active instanceof HTMLElement)
        active.blur();
}
export function documentMetrics() {
    const body = document.body;
    return {
        width: Math.max(document.documentElement.scrollWidth, body?.scrollWidth ?? 0),
        height: Math.max(document.documentElement.scrollHeight, body?.scrollHeight ?? 0),
    };
}
export function snapshotBodyWithoutOverlay() {
    const body = document.body;
    if (body === null)
        return '';
    const clone = body.cloneNode(true);
    for (const host of Array.from(clone.querySelectorAll('[data-ui-atlas-overlay]')))
        host.remove();
    return clone.innerHTML;
}
/**
 * Remember which elements already carried an inline `style` attribute.
 *
 * Taking a screenshot makes Chromium materialise an empty `style=""` attribute
 * on some form controls. It changes nothing visually, but it is still a change
 * to the user's page, and the inspector promises to leave the page as it found
 * it — so we record the prior state and undo the difference afterwards.
 */
export function markInlineStyleOwners() {
    const scope = window;
    const owners = new WeakSet();
    const styled = document.querySelectorAll('[style]');
    for (const element of Array.from(styled))
        owners.add(element);
    scope.__uiAtlasStyleOwners = owners;
    return styled.length;
}
/** Drop `style=""` attributes that were not there before the screenshot. */
export function removeIntroducedEmptyStyleAttributes() {
    const owners = window.__uiAtlasStyleOwners;
    let removed = 0;
    for (const element of Array.from(document.querySelectorAll('[style]'))) {
        if (element.getAttribute('style') !== '')
            continue;
        if (owners?.has(element) === true)
            continue;
        element.removeAttribute('style');
        removed += 1;
    }
    return removed;
}
//# sourceMappingURL=page-scripts.js.map