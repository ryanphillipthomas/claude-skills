import { z } from 'zod';
import { BrowserModeSchema, DEFAULT_SHORTCUTS, StateNameSchema } from '@ui-atlas/protocol';
/* -------------------------------------------------------------------------- */
/* Viewports                                                                   */
/* -------------------------------------------------------------------------- */
export const ViewportPresetSchema = z.object({
    name: z.string().min(1),
    width: z.number().int().min(200).max(10_000),
    height: z.number().int().min(200).max(10_000),
    /**
     * `mobile` switches on true device emulation: touch, mobile user agent and a
     * higher device scale factor. `desktop` only resizes the viewport. The
     * distinction is recorded on every capture so the two are never confused.
     */
    mode: z.enum(['desktop', 'mobile']).default('desktop'),
    deviceScaleFactor: z.number().positive().max(5).optional(),
});
export const DEFAULT_VIEWPORT_PRESETS = [
    { name: 'mobile-sm', width: 375, height: 812, mode: 'mobile' },
    { name: 'mobile-lg', width: 430, height: 932, mode: 'mobile' },
    { name: 'tablet', width: 768, height: 1024, mode: 'desktop' },
    { name: 'laptop', width: 1280, height: 800, mode: 'desktop' },
    { name: 'desktop', width: 1440, height: 1000, mode: 'desktop' },
];
/* -------------------------------------------------------------------------- */
/* Settle                                                                      */
/* -------------------------------------------------------------------------- */
export const SettleConfigSchema = z.object({
    /** Hard deadline. We capture at this point regardless of pending checks. */
    totalTimeoutMs: z.number().int().min(100).max(300_000).default(12_000),
    /** Quiet window with no meaningful DOM mutations. */
    mutationQuietMs: z.number().int().min(0).max(30_000).default(500),
    /** Quiet window with no change to the target element's box. */
    geometryQuietMs: z.number().int().min(0).max(30_000).default(250),
    fontTimeoutMs: z.number().int().min(0).max(60_000).default(3_000),
    imageTimeoutMs: z.number().int().min(0).max(60_000).default(3_000),
    /** Per-image decode budget inside the total image budget. */
    perImageTimeoutMs: z.number().int().min(0).max(60_000).default(1_500),
    /**
     * Never `networkidle`: analytics, streaming and long-polling can keep a page
     * busy forever.
     */
    loadState: z.enum(['domcontentloaded', 'load']).default('domcontentloaded'),
    animationFrames: z.number().int().min(0).max(10).default(2),
});
/* -------------------------------------------------------------------------- */
/* Capture                                                                     */
/* -------------------------------------------------------------------------- */
export const CaptureConfigSchema = z.object({
    /** Still captures freeze CSS animations/transitions. Motion capture re-enables them. */
    disableAnimations: z.boolean().default(true),
    /** Cap on full-page height so an endless-scroll page cannot exhaust memory. */
    fullPageMaxHeightPx: z.number().int().min(1_000).max(200_000).default(20_000),
    /** CSS selectors painted over before capture: clocks, ads, carousels, user data. */
    masks: z.array(z.string()).default([]),
    maskColor: z.string().default('#FF00FF'),
    /** Padding in CSS pixels added around element captures. */
    elementPaddingPx: z.number().int().min(0).max(200).default(0),
    /** Hard deadline for a single screenshot call. */
    screenshotTimeoutMs: z.number().int().min(1_000).max(120_000).default(20_000),
    /** Extra scale for element captures; 1 keeps CSS pixels. */
    states: z.array(StateNameSchema).default(['default', 'hover', 'focus']),
    /** Bounded number of Tab presses used to reach a real keyboard focus ring. */
    keyboardFocusMaxTabs: z.number().int().min(0).max(200).default(60),
    /** Allow synthesising states the page cannot reach naturally (labelled `forced`). */
    allowForcedStates: z.boolean().default(true),
});
/* -------------------------------------------------------------------------- */
/* Browser                                                                     */
/* -------------------------------------------------------------------------- */
export const BrowserConfigSchema = z.object({
    mode: BrowserModeSchema.default('clean'),
    headless: z.boolean().default(false),
    /** Named UI Atlas profile for `profile` / `storage-state` modes. */
    profile: z.string().min(1).max(64).optional(),
    /** CDP endpoint for the experimental `attach` mode. */
    cdpEndpoint: z.string().url().optional(),
    slowMoMs: z.number().int().min(0).max(5_000).default(0),
    locale: z.string().default('en-US'),
    timezoneId: z.string().optional(),
    colorScheme: z.enum(['light', 'dark', 'no-preference']).default('light'),
    reducedMotion: z.enum(['reduce', 'no-preference']).default('no-preference'),
    ignoreHttpsErrors: z.boolean().default(false),
    navigationTimeoutMs: z.number().int().min(1_000).max(300_000).default(30_000),
});
/* -------------------------------------------------------------------------- */
/* Overlay                                                                     */
/* -------------------------------------------------------------------------- */
export const OverlayConfigSchema = z.object({
    enabled: z.boolean().default(true),
    autoInspect: z.boolean().default(false),
    shortcuts: z.record(z.string(), z.string()).default(DEFAULT_SHORTCUTS),
    /** Show margin/padding/bounds by default. Off keeps the default view calm. */
    showBoxModel: z.boolean().default(false),
});
/* -------------------------------------------------------------------------- */
/* Redaction                                                                   */
/* -------------------------------------------------------------------------- */
export const RedactionConfigSchema = z.object({
    headers: z
        .array(z.string())
        .default(['authorization', 'cookie', 'set-cookie', 'proxy-authorization', 'x-api-key']),
    fields: z
        .array(z.string())
        .default(['password', 'token', 'secret', 'apiKey', 'accessToken', 'refreshToken']),
});
/* -------------------------------------------------------------------------- */
/* Root                                                                        */
/* -------------------------------------------------------------------------- */
export const UiAtlasConfigSchema = z.object({
    project: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'project must be a safe directory name')
        .default('default'),
    outputRoot: z.string().default('./ui-atlas-output'),
    viewport: z
        .object({
        width: z.number().int().min(200).max(10_000).default(1440),
        height: z.number().int().min(200).max(10_000).default(1000),
        deviceScaleFactor: z.number().positive().max(5).default(1),
    })
        .prefault({}),
    viewports: z.array(ViewportPresetSchema).min(1).default(DEFAULT_VIEWPORT_PRESETS),
    settle: SettleConfigSchema.prefault({}),
    capture: CaptureConfigSchema.prefault({}),
    browser: BrowserConfigSchema.prefault({}),
    overlay: OverlayConfigSchema.prefault({}),
    redact: RedactionConfigSchema.prefault({}),
});
/** Config with every default filled in. */
export function defaultConfig() {
    return UiAtlasConfigSchema.parse({});
}
//# sourceMappingURL=schema.js.map