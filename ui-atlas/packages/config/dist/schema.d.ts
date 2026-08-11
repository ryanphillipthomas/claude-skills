import { z } from 'zod';
export declare const ViewportPresetSchema: z.ZodObject<{
    name: z.ZodString;
    width: z.ZodNumber;
    height: z.ZodNumber;
    mode: z.ZodDefault<z.ZodEnum<{
        desktop: "desktop";
        mobile: "mobile";
    }>>;
    deviceScaleFactor: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type ViewportPreset = z.infer<typeof ViewportPresetSchema>;
export declare const DEFAULT_VIEWPORT_PRESETS: ViewportPreset[];
export declare const SettleConfigSchema: z.ZodObject<{
    totalTimeoutMs: z.ZodDefault<z.ZodNumber>;
    mutationQuietMs: z.ZodDefault<z.ZodNumber>;
    geometryQuietMs: z.ZodDefault<z.ZodNumber>;
    fontTimeoutMs: z.ZodDefault<z.ZodNumber>;
    imageTimeoutMs: z.ZodDefault<z.ZodNumber>;
    perImageTimeoutMs: z.ZodDefault<z.ZodNumber>;
    loadState: z.ZodDefault<z.ZodEnum<{
        domcontentloaded: "domcontentloaded";
        load: "load";
    }>>;
    animationFrames: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type SettleConfig = z.infer<typeof SettleConfigSchema>;
export declare const CaptureConfigSchema: z.ZodObject<{
    disableAnimations: z.ZodDefault<z.ZodBoolean>;
    fullPageMaxHeightPx: z.ZodDefault<z.ZodNumber>;
    masks: z.ZodDefault<z.ZodArray<z.ZodString>>;
    maskColor: z.ZodDefault<z.ZodString>;
    elementPaddingPx: z.ZodDefault<z.ZodNumber>;
    screenshotTimeoutMs: z.ZodDefault<z.ZodNumber>;
    states: z.ZodDefault<z.ZodArray<z.ZodEnum<{
        default: "default";
        hover: "hover";
        focus: "focus";
        "focus-visible": "focus-visible";
        active: "active";
        checked: "checked";
        selected: "selected";
        expanded: "expanded";
        disabled: "disabled";
        custom: "custom";
    }>>>;
    keyboardFocusMaxTabs: z.ZodDefault<z.ZodNumber>;
    allowForcedStates: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type CaptureConfig = z.infer<typeof CaptureConfigSchema>;
export declare const BrowserConfigSchema: z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<{
        clean: "clean";
        profile: "profile";
        "storage-state": "storage-state";
        attach: "attach";
    }>>;
    headless: z.ZodDefault<z.ZodBoolean>;
    profile: z.ZodOptional<z.ZodString>;
    cdpEndpoint: z.ZodOptional<z.ZodString>;
    slowMoMs: z.ZodDefault<z.ZodNumber>;
    locale: z.ZodDefault<z.ZodString>;
    timezoneId: z.ZodOptional<z.ZodString>;
    colorScheme: z.ZodDefault<z.ZodEnum<{
        light: "light";
        dark: "dark";
        "no-preference": "no-preference";
    }>>;
    reducedMotion: z.ZodDefault<z.ZodEnum<{
        "no-preference": "no-preference";
        reduce: "reduce";
    }>>;
    ignoreHttpsErrors: z.ZodDefault<z.ZodBoolean>;
    navigationTimeoutMs: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;
export declare const OverlayConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    autoInspect: z.ZodDefault<z.ZodBoolean>;
    shortcuts: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    showBoxModel: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type OverlayConfig = z.infer<typeof OverlayConfigSchema>;
export declare const RedactionConfigSchema: z.ZodObject<{
    headers: z.ZodDefault<z.ZodArray<z.ZodString>>;
    fields: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type RedactionConfig = z.infer<typeof RedactionConfigSchema>;
export declare const UiAtlasConfigSchema: z.ZodObject<{
    project: z.ZodDefault<z.ZodString>;
    outputRoot: z.ZodDefault<z.ZodString>;
    viewport: z.ZodPrefault<z.ZodObject<{
        width: z.ZodDefault<z.ZodNumber>;
        height: z.ZodDefault<z.ZodNumber>;
        deviceScaleFactor: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    viewports: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        width: z.ZodNumber;
        height: z.ZodNumber;
        mode: z.ZodDefault<z.ZodEnum<{
            desktop: "desktop";
            mobile: "mobile";
        }>>;
        deviceScaleFactor: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>>;
    settle: z.ZodPrefault<z.ZodObject<{
        totalTimeoutMs: z.ZodDefault<z.ZodNumber>;
        mutationQuietMs: z.ZodDefault<z.ZodNumber>;
        geometryQuietMs: z.ZodDefault<z.ZodNumber>;
        fontTimeoutMs: z.ZodDefault<z.ZodNumber>;
        imageTimeoutMs: z.ZodDefault<z.ZodNumber>;
        perImageTimeoutMs: z.ZodDefault<z.ZodNumber>;
        loadState: z.ZodDefault<z.ZodEnum<{
            domcontentloaded: "domcontentloaded";
            load: "load";
        }>>;
        animationFrames: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    capture: z.ZodPrefault<z.ZodObject<{
        disableAnimations: z.ZodDefault<z.ZodBoolean>;
        fullPageMaxHeightPx: z.ZodDefault<z.ZodNumber>;
        masks: z.ZodDefault<z.ZodArray<z.ZodString>>;
        maskColor: z.ZodDefault<z.ZodString>;
        elementPaddingPx: z.ZodDefault<z.ZodNumber>;
        screenshotTimeoutMs: z.ZodDefault<z.ZodNumber>;
        states: z.ZodDefault<z.ZodArray<z.ZodEnum<{
            default: "default";
            hover: "hover";
            focus: "focus";
            "focus-visible": "focus-visible";
            active: "active";
            checked: "checked";
            selected: "selected";
            expanded: "expanded";
            disabled: "disabled";
            custom: "custom";
        }>>>;
        keyboardFocusMaxTabs: z.ZodDefault<z.ZodNumber>;
        allowForcedStates: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    browser: z.ZodPrefault<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<{
            clean: "clean";
            profile: "profile";
            "storage-state": "storage-state";
            attach: "attach";
        }>>;
        headless: z.ZodDefault<z.ZodBoolean>;
        profile: z.ZodOptional<z.ZodString>;
        cdpEndpoint: z.ZodOptional<z.ZodString>;
        slowMoMs: z.ZodDefault<z.ZodNumber>;
        locale: z.ZodDefault<z.ZodString>;
        timezoneId: z.ZodOptional<z.ZodString>;
        colorScheme: z.ZodDefault<z.ZodEnum<{
            light: "light";
            dark: "dark";
            "no-preference": "no-preference";
        }>>;
        reducedMotion: z.ZodDefault<z.ZodEnum<{
            "no-preference": "no-preference";
            reduce: "reduce";
        }>>;
        ignoreHttpsErrors: z.ZodDefault<z.ZodBoolean>;
        navigationTimeoutMs: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    overlay: z.ZodPrefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        autoInspect: z.ZodDefault<z.ZodBoolean>;
        shortcuts: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        showBoxModel: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    redact: z.ZodPrefault<z.ZodObject<{
        headers: z.ZodDefault<z.ZodArray<z.ZodString>>;
        fields: z.ZodDefault<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type UiAtlasConfig = z.infer<typeof UiAtlasConfigSchema>;
/** Config with every default filled in. */
export declare function defaultConfig(): UiAtlasConfig;
//# sourceMappingURL=schema.d.ts.map