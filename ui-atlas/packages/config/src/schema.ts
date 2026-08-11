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
export type ViewportPreset = z.infer<typeof ViewportPresetSchema>;

export const DEFAULT_VIEWPORT_PRESETS: ViewportPreset[] = [
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
export type SettleConfig = z.infer<typeof SettleConfigSchema>;

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
export type CaptureConfig = z.infer<typeof CaptureConfigSchema>;

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
export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;

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
export type OverlayConfig = z.infer<typeof OverlayConfigSchema>;

/* -------------------------------------------------------------------------- */
/* Crawl                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Query parameters dropped before two URLs are compared. All of these identify
 * *how someone arrived*, never *what page they arrived at*, so keeping them
 * would crawl one page many times.
 */
export const DEFAULT_DROP_QUERY_PARAMS = [
  'utm_*',
  'gclid',
  'gbraid',
  'wbraid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  '_hsenc',
  '_hsmi',
];

/**
 * Never followed, on any site, unless the operator removes them. Following a
 * sign-out link ends the session the rest of the crawl depends on.
 */
export const DEFAULT_DENY_PATHS = [
  '**/logout',
  '**/logout/**',
  '**/log-out',
  '**/logoff',
  '**/signout',
  '**/signout/**',
  '**/sign-out',
  '**/sign_out',
];

/** Extensions that download a file rather than render a page. */
export const DEFAULT_DOWNLOAD_EXTENSIONS = [
  '.pdf', '.zip', '.gz', '.tgz', '.bz2', '.7z', '.rar', '.tar',
  '.dmg', '.pkg', '.exe', '.msi', '.deb', '.rpm', '.apk',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.rtf',
  '.csv', '.tsv', '.mp3', '.mp4', '.m4a', '.mov', '.avi', '.mkv', '.wav',
  '.iso', '.jar', '.bin', '.epub',
];

export const QueryRulesSchema = z.object({
  /** Parameter names to remove. A trailing `*` matches by prefix (`utm_*`). */
  drop: z.array(z.string()).default(DEFAULT_DROP_QUERY_PARAMS),
  /** When non-empty this becomes an allowlist and every other parameter goes. */
  keep: z.array(z.string()).default([]),
  /** Sort what survives, so `?b=2&a=1` and `?a=1&b=2` are one URL. */
  sort: z.boolean().default(true),
  /** Drop the query string wholesale. Blunt, but right for some sites. */
  dropAll: z.boolean().default(false),
});
export type QueryRules = z.infer<typeof QueryRulesSchema>;

export const CrawlBudgetsSchema = z.object({
  /** Hard cap on pages *visited*. Reaching it ends the crawl. */
  maxPages: z.number().int().min(1).max(100_000).default(50),
  /** Seeds are depth 0. Links found on a depth-N page are depth N+1. */
  maxDepth: z.number().int().min(0).max(50).default(3),
  /** Hard deadline for one page: navigation, settle and link discovery. */
  perPageTimeoutMs: z.number().int().min(1_000).max(600_000).default(30_000),
  /** Hard deadline for the whole crawl, checked before every page. */
  maxRunMinutes: z.number().positive().max(1_440).default(30),
  /**
   * Memory bound on the pending queue. A crawl of a big site with a small
   * `maxPages` can still discover a very large number of links.
   */
  maxQueued: z.number().int().min(1).max(1_000_000).default(10_000),
});
export type CrawlBudgets = z.infer<typeof CrawlBudgetsSchema>;

export const CrawlConfigSchema = z.object({
  /** Where the crawl starts. Every seed's origin is in scope automatically. */
  seeds: z.array(z.string().url()).default([]),
  /** Extra in-scope origins, e.g. a separate docs host. */
  allowOrigins: z.array(z.string().url()).default([]),
  /** Path globs. `**` crosses `/`, `*` does not; a trailing `/**` also matches the parent. */
  include: z.array(z.string()).default(['/**']),
  exclude: z.array(z.string()).default([]),
  /** Checked before `exclude`, and reported separately so a near miss is obvious. */
  denyPaths: z.array(z.string()).default(DEFAULT_DENY_PATHS),
  downloadExtensions: z.array(z.string()).default(DEFAULT_DOWNLOAD_EXTENSIONS),
  /** `strip` makes `/docs` and `/docs/` one page. The root `/` is never stripped. */
  trailingSlash: z.enum(['strip', 'keep']).default('strip'),
  query: QueryRulesSchema.prefault({}),
  budgets: CrawlBudgetsSchema.prefault({}),
  /** Skip `<a rel="nofollow">`. On by default: it is what the attribute asks for. */
  respectNofollow: z.boolean().default(true),
  /** Politeness pause between navigations. */
  perPageDelayMs: z.number().int().min(0).max(60_000).default(0),
});
export type CrawlConfig = z.infer<typeof CrawlConfigSchema>;

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
export type RedactionConfig = z.infer<typeof RedactionConfigSchema>;

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
  /**
   * A crawl "site config" is just a UiAtlasConfig with this block filled in, so
   * `ui-atlas crawl site.yml` reuses the same loader, deep merge, CLI overrides
   * and validation as every other command. Recipes will slot in here too.
   */
  crawl: CrawlConfigSchema.prefault({}),
  redact: RedactionConfigSchema.prefault({}),
});
export type UiAtlasConfig = z.infer<typeof UiAtlasConfigSchema>;

/** Config with every default filled in. */
export function defaultConfig(): UiAtlasConfig {
  return UiAtlasConfigSchema.parse({});
}
