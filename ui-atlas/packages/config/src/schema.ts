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
/* Animation sampling                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The fallback for motion with no keyframes to sample: an animation that
 * repeats forever, one whose duration is `auto`, or a canvas the Web Animations
 * API cannot see at all.
 *
 * Off by default. A recording is not a deterministic sample — re-recording
 * gives a different file — and it costs a second page load in a browser context
 * of its own, because Playwright records a context rather than a page.
 */
export const AnimationVideoConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Hard cap on the observation window. An infinite animation has no end. */
  maxDurationMs: z.number().int().min(250).max(60_000).default(5_000),
  /** A recording over the budget is discarded rather than kept. */
  maxBytes: z.number().int().min(1024).default(10_000_000),
  /** Loops of a repeating animation to try to include in the window. */
  iterations: z.number().int().min(1).max(20).default(3),
});
export type AnimationVideoConfig = z.infer<typeof AnimationVideoConfigSchema>;

export const AnimationSamplingConfigSchema = z.object({
  /**
   * Points within **one iteration** to photograph, 0..1. One iteration is the
   * meaningful unit for design reference: it is the keyframe progression, and
   * "50% of three iterations" is a moment nobody was asking about.
   */
  offsets: z
    .array(z.number().min(0).max(1))
    .min(1)
    .max(50)
    .default([0, 0.25, 0.5, 0.75, 1]),
  /** Cap on animations sampled in one go, so a busy page cannot run away. */
  maxAnimations: z.number().int().min(1).max(200).default(10),
  /** What to photograph for each frame. */
  kind: z.enum(['element', 'viewport']).default('element'),
  /** The fallback for motion no seek can reproduce. */
  video: AnimationVideoConfigSchema.prefault({}),
});
export type AnimationSamplingConfig = z.infer<typeof AnimationSamplingConfigSchema>;

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
  /** Where animation frames are sampled, when sampling is asked for. */
  animation: AnimationSamplingConfigSchema.prefault({}),
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

/**
 * Words that mark a control as likely to change something. Matched
 * case-insensitively against the accessible name and the visible text.
 *
 * The list is biased towards false positives on purpose: a wrongly flagged
 * "Save" costs a human ten seconds of review, while a missed "Delete account"
 * costs them an account.
 */
export const DEFAULT_MUTATION_WORDS = [
  'delete', 'remove', 'destroy', 'erase', 'discard', 'trash', 'archive', 'clear', 'reset',
  'buy', 'purchase', 'order', 'checkout', 'pay', 'subscribe', 'unsubscribe', 'donate',
  'send', 'submit', 'post', 'publish', 'deploy', 'share', 'invite', 'transfer', 'withdraw',
  'save', 'confirm', 'apply', 'approve', 'reject', 'merge', 'cancel',
  'block', 'ban', 'report', 'flag', 'mute',
  'sign out', 'signout', 'log out', 'logout', 'log off',
  'sign up', 'signup', 'register', 'create account', 'upgrade', 'downgrade',
];

export const InventoryConfigSchema = z.object({
  /** Off by default: it costs one extra page evaluation per page. */
  enabled: z.boolean().default(false),
  /** Added to {@link DEFAULT_MUTATION_WORDS} rather than replacing them. */
  mutationWords: z.array(z.string()).default([]),
  /** Cap per page, so one enormous page cannot dominate a run. */
  maxPerPage: z.number().int().min(1).max(2_000).default(200),
  /** Write `suggested-recipes.yml` alongside the inventory. */
  writeSuggestions: z.boolean().default(true),
});
export type InventoryConfig = z.infer<typeof InventoryConfigSchema>;

/**
 * Statuses worth trying again. A `404` will not improve, and neither will a
 * `403`; these are the ones that mean "not right now" rather than "no".
 */
export const DEFAULT_RETRY_STATUSES = [408, 425, 429, 500, 502, 503, 504];

/**
 * The subset that means *the host is asking us to slow down*, rather than *that
 * request went wrong*. These hold the whole origin back, not just this page.
 */
export const DEFAULT_BACKOFF_STATUSES = [429, 503];

export const RetryConfigSchema = z.object({
  /** Attempts per page, including the first. 1 disables retrying. */
  maxAttempts: z.number().int().min(1).max(10).default(3),
  /** First backoff step. Doubles each attempt, capped by `maxDelayMs`. */
  baseDelayMs: z.number().int().min(0).max(60_000).default(500),
  maxDelayMs: z.number().int().min(0).max(300_000).default(15_000),
  /**
   * Random fraction added to each backoff. Without it, workers that failed
   * together retry together, and the host sees the same burst again.
   */
  jitter: z.number().min(0).max(1).default(0.3),
  retryStatuses: z.array(z.number().int().min(100).max(599)).default(DEFAULT_RETRY_STATUSES),
  backoffStatuses: z.array(z.number().int().min(100).max(599)).default(DEFAULT_BACKOFF_STATUSES),
  /** Trust `Retry-After`, but not unboundedly: a hostile value is still a wait. */
  maxRetryAfterMs: z.number().int().min(0).max(600_000).default(120_000),
});
export type RetryConfig = z.infer<typeof RetryConfigSchema>;

export const TraceConfigSchema = z.object({
  /**
   * Off by default, and deliberately so. A Playwright trace records network
   * traffic including request headers, so a trace taken during an authenticated
   * crawl can contain session cookies. Turning it on is a decision about where
   * that material is allowed to land.
   */
  enabled: z.boolean().default(false),
  /** Bound on traces kept, so a badly broken site cannot fill the disk. */
  maxTraces: z.number().int().min(1).max(1_000).default(20),
  /** The filmstrip. Larger files, far more useful when reading one back. */
  screenshots: z.boolean().default(true),
  /** DOM snapshots, which is what makes a trace steppable. */
  snapshots: z.boolean().default(true),
});
export type TraceConfig = z.infer<typeof TraceConfigSchema>;

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

/* -------------------------------------------------------------------------- */
/* Recipes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * How a recipe names an element. Deliberately a small set of accessibility- and
 * test-attribute-based selectors rather than free-form JavaScript: a recipe can
 * click, so what it can point at is a safety boundary.
 *
 * Exactly one locator key must be set. `name` and `exact` refine `role`.
 */
export const RecipeTargetSchema = z
  .object({
    role: z.string().min(1).optional(),
    /** Accessible name, only meaningful alongside `role`. */
    name: z.string().optional(),
    testId: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    label: z.string().min(1).optional(),
    placeholder: z.string().min(1).optional(),
    css: z.string().min(1).optional(),
    exact: z.boolean().default(false),
    /** Which match to use when the locator is intentionally ambiguous. */
    nth: z.number().int().nonnegative().optional(),
  })
  .refine(
    (target) =>
      [target.role, target.testId, target.text, target.label, target.placeholder, target.css].filter(
        (value) => value !== undefined,
      ).length === 1,
    { message: 'a target needs exactly one of role, testId, text, label, placeholder or css' },
  )
  .refine((target) => target.name === undefined || target.role !== undefined, {
    message: '`name` only applies alongside `role`',
  });
export type RecipeTarget = z.infer<typeof RecipeTargetSchema>;

const CaptureStepSchema = z.strictObject({
  kind: z.enum(['element', 'viewport', 'full-page']).default('viewport'),
  state: StateNameSchema.default('default'),
  label: z.string().optional(),
});

/**
 * Photograph motion that only exists once something provokes it.
 *
 * The provocation is part of the step rather than a separate `hover` before it,
 * because knowing which animations an interaction *started* means holding the
 * list from before it — and because a 200ms transition provoked by one step and
 * sampled by the next has usually finished in between.
 *
 * `click` is deliberately not offered. A click is the one interaction that can
 * change the world, so it stays a step of its own that someone wrote on
 * purpose; this step can only ever hover or focus.
 */
const CaptureAnimationStepSchema = z
  .strictObject({
    hover: RecipeTargetSchema.optional(),
    focus: RecipeTargetSchema.optional(),
    /** `element` photographs the provoked element; `viewport` the whole frame. */
    kind: z.enum(['element', 'viewport']).default('element'),
    /** Points across the interaction's whole span, overriding the config. */
    offsets: z.array(z.number().min(0).max(1)).min(1).max(50).optional(),
    label: z.string().optional(),
  })
  .refine((step) => (step.hover === undefined) !== (step.focus === undefined), {
    message: 'captureAnimation needs exactly one of hover or focus',
  });

/**
 * One step. The single-key object form comes from the brief's example YAML:
 * `- hover: { role: button, name: Menu }`.
 *
 * Every variant is a strict object, so a misspelled step name or an unknown
 * option fails validation instead of being silently skipped. For a config that
 * can click things, "I did not understand that line" must never mean "I ignored
 * that line".
 */
export const RecipeStepConfigSchema = z.union([
  z.strictObject({ select: RecipeTargetSchema }),
  z.strictObject({ click: RecipeTargetSchema }),
  z.strictObject({ hover: RecipeTargetSchema }),
  z.strictObject({ focus: RecipeTargetSchema }),
  z.strictObject({ waitFor: RecipeTargetSchema }),
  z.strictObject({ waitForUrl: z.string().min(1) }),
  z.strictObject({
    press: z.strictObject({ key: z.string().min(1), target: RecipeTargetSchema.optional() }),
  }),
  z.strictObject({ scroll: z.enum(['top', 'bottom']) }),
  z.strictObject({ scrollTo: RecipeTargetSchema }),
  z.strictObject({ waitMs: z.number().int().min(0).max(30_000) }),
  z.strictObject({ capture: CaptureStepSchema.prefault({}) }),
  z.strictObject({ captureStates: z.array(StateNameSchema).min(1) }),
  z.strictObject({ captureAnimation: CaptureAnimationStepSchema }),
  z.strictObject({
    captureResponsive: z
      .strictObject({ kind: z.enum(['element', 'viewport', 'full-page']).default('viewport') })
      .prefault({}),
  }),
]);
export type RecipeStepConfig = z.infer<typeof RecipeStepConfigSchema>;

export const RecipeSchema = z.strictObject({
  name: z.string().min(1).max(120),
  /** Path globs, same dialect as `include`/`exclude`. */
  match: z
    .union([z.string(), z.array(z.string())])
    .default('/**')
    .transform((value) => (typeof value === 'string' ? [value] : value)),
  steps: z.array(RecipeStepConfigSchema).min(1).max(100),
  /** Hard deadline for the whole recipe on one page. */
  timeoutMs: z.number().int().min(500).max(300_000).default(20_000),
});
export type Recipe = z.infer<typeof RecipeSchema>;

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
  /**
   * Minimum gap between navigations *to one origin*, enforced across every
   * worker rather than per worker. Raising `concurrency` therefore never raises
   * the rate a single host sees.
   */
  perPageDelayMs: z.number().int().min(0).max(60_000).default(750),
  /**
   * Isolated workers, each with its own browser context. Scale comes from
   * separate workers, not from many tabs sharing one mutable session.
   *
   * Defaults to 1: concurrency is opt-in, because more workers on someone
   * else's site is a decision only the operator can make.
   */
  concurrency: z.number().int().min(1).max(32).default(1),
  /** Bounded retries for the failures that are worth trying again. */
  retry: RetryConfigSchema.prefault({}),
  /** Keep a Playwright trace for the pages that failed, and only those. */
  trace: TraceConfigSchema.prefault({}),
  /**
   * The only way the crawler is allowed to interact with a page. Without a
   * matching recipe it navigates, reads links and touches nothing.
   */
  recipes: z.array(RecipeSchema).default([]),
  /**
   * Inventory the interactive controls on each page and classify what they are
   * likely to do. Observation only: nothing here is ever clicked.
   */
  inventory: InventoryConfigSchema.prefault({}),
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

/* -------------------------------------------------------------------------- */
/* Design token candidates                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Reading every element's computed style and counting what turns up.
 *
 * Off by default, and a *first pass* on purpose: what comes out is a frequency
 * table of observations, not a design system. Naming a value is a judgement,
 * and this makes none.
 */
export const TokensConfigSchema = z.object({
  enabled: z.boolean().default(false),
  /** Elements past this are not read, and the artifact says how many. */
  maxElementsPerPage: z.number().int().min(1).max(100_000).default(3_000),
  maxExamplesPerValue: z.number().int().min(1).max(50).default(5),
  /** The long tail is truncated per category, and the artifact says so. */
  maxCandidatesPerCategory: z.number().int().min(1).max(1_000).default(100),
  /** Report values close enough that one may be a mistake. Never merges them. */
  nearDuplicates: z.boolean().default(true),
});
export type TokensConfig = z.infer<typeof TokensConfigSchema>;

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
  tokens: TokensConfigSchema.prefault({}),
  redact: RedactionConfigSchema.prefault({}),
});
export type UiAtlasConfig = z.infer<typeof UiAtlasConfigSchema>;

/** Config with every default filled in. */
export function defaultConfig(): UiAtlasConfig {
  return UiAtlasConfigSchema.parse({});
}
