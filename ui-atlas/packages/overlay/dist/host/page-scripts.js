export function hideOverlayHosts(attribute) {
    const hosts = document.querySelectorAll(`[${attribute}]`);
    for (const host of Array.from(hosts))
        host.style.setProperty('display', 'none', 'important');
    return hosts.length;
}
export function showOverlayHosts(attribute) {
    const hosts = document.querySelectorAll(`[${attribute}]`);
    for (const host of Array.from(hosts))
        host.style.removeProperty('display');
    return hosts.length;
}
export function dispatchToOverlay(event) {
    const api = window.__uiAtlasOverlay;
    if (api === undefined)
        return false;
    api.dispatch(event);
    return true;
}
export function isOverlayMounted() {
    return window.__uiAtlasOverlay !== undefined;
}
export function probeWithInstalledProbe(element) {
    const probe = window.__uiAtlasProbe;
    if (probe === undefined)
        throw new Error('the ui-atlas element probe is not installed on this page');
    return probe(element);
}
//# sourceMappingURL=page-scripts.js.map