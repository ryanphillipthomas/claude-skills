/**
 * A resized desktop viewport is not the same thing as a phone: emulation also
 * changes the user agent, touch capability and device scale factor. Both are
 * recorded on every capture so the report never conflates them.
 */
export function resolveViewport(preset) {
    const mobile = preset.mode === 'mobile';
    return {
        name: preset.name,
        width: preset.width,
        height: preset.height,
        deviceScaleFactor: preset.deviceScaleFactor ?? (mobile ? 3 : 1),
        mobile,
        hasTouch: mobile,
        userAgentClass: mobile ? 'mobile' : 'desktop',
    };
}
export function mobileUserAgent(browserVersion) {
    const major = browserVersion?.split('.')[0] ?? '141';
    return `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36`;
}
/** Playwright context options for a resolved viewport. */
export function emulationOptions(viewport, browserVersion) {
    const options = {
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: viewport.mobile,
        hasTouch: viewport.hasTouch,
    };
    if (viewport.userAgentClass === 'mobile')
        options.userAgent = mobileUserAgent(browserVersion);
    return options;
}
export function viewportLabel(viewport) {
    return viewport.name ?? `${viewport.width}x${viewport.height}`;
}
//# sourceMappingURL=viewport.js.map