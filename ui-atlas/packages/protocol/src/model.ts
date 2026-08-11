import { z } from 'zod';
import { StructuredErrorSchema } from './errors.js';

/**
 * Every persisted record carries this version. Bump it (and write a migration
 * note in docs/adr) whenever a field changes meaning or is removed.
 */
export const SCHEMA_VERSION = 1;
export const SchemaVersionSchema = z.literal(SCHEMA_VERSION);

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
export const IsoDateTimeSchema = z.string().regex(ISO_DATE_TIME, 'expected an ISO-8601 timestamp');

/* -------------------------------------------------------------------------- */
/* Geometry                                                                    */
/* -------------------------------------------------------------------------- */

export const BoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type Box = z.infer<typeof BoxSchema>;

/* -------------------------------------------------------------------------- */
/* Capture / state vocabulary                                                  */
/* -------------------------------------------------------------------------- */

export const CAPTURE_KINDS = [
  'element',
  'viewport',
  'full-page',
  'animation-frame',
  'animation-video',
] as const;
export const CaptureKindSchema = z.enum(CAPTURE_KINDS);
export type CaptureKind = z.infer<typeof CaptureKindSchema>;

export const STILL_CAPTURE_KINDS = ['element', 'viewport', 'full-page'] as const;
export const StillCaptureKindSchema = z.enum(STILL_CAPTURE_KINDS);
/** The kinds that produce a single image. Animation kinds land in phase 4. */
export type StillCaptureKind = z.infer<typeof StillCaptureKindSchema>;

export const STATE_NAMES = [
  'default',
  'hover',
  'focus',
  'focus-visible',
  'active',
  'checked',
  'selected',
  'expanded',
  'disabled',
  'custom',
] as const;
export const StateNameSchema = z.enum(STATE_NAMES);
export type StateName = z.infer<typeof StateNameSchema>;

/**
 * How a captured state came to be.
 * - `observed`   the page was already in this state; nothing was done to it.
 * - `interacted` a real user-equivalent interaction produced it (hover, focus,
 *                mouse-down, keyboard navigation).
 * - `forced`     the state was synthesised (CDP forced pseudo state, injected
 *                attribute). Never present these as naturally observed.
 */
export const STATE_PROVENANCES = ['observed', 'interacted', 'forced'] as const;
export const StateProvenanceSchema = z.enum(STATE_PROVENANCES);
export type StateProvenance = z.infer<typeof StateProvenanceSchema>;

export const CaptureStateSchema = z.object({
  name: StateNameSchema,
  /** Free-text label for `custom`, and a human label for the report otherwise. */
  label: z.string().optional(),
  provenance: StateProvenanceSchema,
  /** True when the host positively confirmed the state took effect. */
  verified: z.boolean(),
  verification: z.string().optional(),
});
export type CaptureState = z.infer<typeof CaptureStateSchema>;

/* -------------------------------------------------------------------------- */
/* Viewport                                                                    */
/* -------------------------------------------------------------------------- */

export const ViewportSchema = z.object({
  name: z.string().optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().positive(),
  mobile: z.boolean(),
  hasTouch: z.boolean(),
  userAgentClass: z.enum(['desktop', 'mobile']),
});
export type Viewport = z.infer<typeof ViewportSchema>;

/* -------------------------------------------------------------------------- */
/* Element identity                                                            */
/* -------------------------------------------------------------------------- */

export const FrameIdentitySchema = z.object({
  /** 0 is the main frame. */
  depth: z.number().int().nonnegative(),
  url: z.string(),
  name: z.string().optional(),
  /** CSS selector for the owning <iframe> element inside its parent document. */
  selectorInParent: z.string().optional(),
  /** True when the frame's origin differs from the main frame's origin. */
  crossOrigin: z.boolean(),
});
export type FrameIdentity = z.infer<typeof FrameIdentitySchema>;

export const LOCATOR_CANDIDATE_TYPES = [
  'role-name',
  'test-id',
  'id',
  'label',
  'placeholder',
  'alt',
  'title',
  'text',
  'css-scoped',
  'css-path',
] as const;
export const LocatorCandidateTypeSchema = z.enum(LOCATOR_CANDIDATE_TYPES);
export type LocatorCandidateType = z.infer<typeof LocatorCandidateTypeSchema>;

export const LocatorCandidateSchema = z.object({
  type: LocatorCandidateTypeSchema,
  /** Primary value: the accessible name, test id, selector text, and so on. */
  value: z.string(),
  /** Present for `role-name`. */
  role: z.string().optional(),
  /** Present for `test-id`: which attribute carried the value. */
  attribute: z.string().optional(),
  /** Whether text/name matching should be exact when re-resolving. */
  exact: z.boolean().optional(),
  /** CSS selector for a stable ancestor that scopes `value`. */
  scope: z.string().optional(),
  /** Matches found within the owning frame when the candidate was generated. */
  uniquenessCount: z.number().int().nonnegative(),
  /** 0..100. Higher is more trustworthy across page changes. */
  score: z.number().min(0).max(100),
  reasons: z.array(z.string()),
});
export type LocatorCandidate = z.infer<typeof LocatorCandidateSchema>;

export const ElementIdentitySchema = z.object({
  framePath: z.array(FrameIdentitySchema),
  locatorCandidates: z.array(LocatorCandidateSchema),
  chosenLocator: LocatorCandidateSchema,
  structuralFingerprint: z.string(),
  tagName: z.string(),
  role: z.string().optional(),
  accessibleName: z.string().optional(),
  textExcerpt: z.string().optional(),
  boundingBox: BoxSchema,
  /** Open shadow-root host chain (outermost first), when the element is inside one. */
  shadowHostPath: z.array(z.string()).optional(),
});
export type ElementIdentity = z.infer<typeof ElementIdentitySchema>;

/* -------------------------------------------------------------------------- */
/* Readiness                                                                   */
/* -------------------------------------------------------------------------- */

export const READINESS_CHECKS = [
  'load-state',
  'fonts-ready',
  'images-decoded',
  'element-stable',
  'mutation-quiet',
  'animation-frames',
] as const;
export const ReadinessCheckNameSchema = z.enum(READINESS_CHECKS);
export type ReadinessCheckName = z.infer<typeof ReadinessCheckNameSchema>;

export const ReadinessCheckSchema = z.object({
  name: ReadinessCheckNameSchema,
  status: z.enum(['passed', 'timed-out', 'skipped', 'failed']),
  durationMs: z.number().nonnegative(),
  detail: z.string().optional(),
});
export type ReadinessCheck = z.infer<typeof ReadinessCheckSchema>;

export const ReadinessResultSchema = z.object({
  startedAt: IsoDateTimeSchema,
  durationMs: z.number().nonnegative(),
  deadlineMs: z.number().nonnegative(),
  /** True when the hard deadline fired and we captured anyway. */
  deadlineExceeded: z.boolean(),
  checks: z.array(ReadinessCheckSchema),
  warnings: z.array(z.string()),
});
export type ReadinessResult = z.infer<typeof ReadinessResultSchema>;

/* -------------------------------------------------------------------------- */
/* Computed style delta                                                        */
/* -------------------------------------------------------------------------- */

export const StyleSnapshotSchema = z.record(z.string(), z.string());
export type StyleSnapshot = z.infer<typeof StyleSnapshotSchema>;

export const StyleDeltaSchema = z.object({
  changed: z.record(z.string(), z.object({ from: z.string(), to: z.string() })),
  /** Descendant visibility/count changes are strong evidence a state applied. */
  descendantVisibilityChanged: z.boolean().optional(),
  boundsChanged: z.boolean().optional(),
});
export type StyleDelta = z.infer<typeof StyleDeltaSchema>;

/* -------------------------------------------------------------------------- */
/* Interaction audit trail                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A record of what the host actually did to reach a state. Phase 3 recipes will
 * extend this vocabulary; every entry here is already produced today.
 */
export const RECIPE_ACTIONS = [
  'navigate',
  'select',
  'hover',
  'focus',
  'keyboard-focus',
  'press',
  'mouse-down',
  'mouse-up',
  'scroll',
  'set-viewport',
  'force-pseudo-state',
  'capture',
] as const;
export const RecipeActionSchema = z.enum(RECIPE_ACTIONS);
export type RecipeAction = z.infer<typeof RecipeActionSchema>;

export const RecipeStepSchema = z.object({
  action: RecipeActionSchema,
  target: z.string().optional(),
  detail: z.record(z.string(), z.unknown()).optional(),
  atMs: z.number().nonnegative().optional(),
});
export type RecipeStep = z.infer<typeof RecipeStepSchema>;

/* -------------------------------------------------------------------------- */
/* Animation (inventory only in phases 0-1; sampling lands in phase 4)         */
/* -------------------------------------------------------------------------- */

export const AnimationSampleSchema = z.object({
  animationId: z.string(),
  /** Fraction of the active duration this frame represents, 0..1. */
  progress: z.number().min(0).max(1),
  currentTimeMs: z.number().nonnegative(),
  durationMs: z.number().nonnegative().optional(),
  easing: z.string().optional(),
  playState: z.string().optional(),
  method: z.enum(['web-animations', 'cdp', 'screencast']),
  limitations: z.array(z.string()),
});
export type AnimationSample = z.infer<typeof AnimationSampleSchema>;

/* -------------------------------------------------------------------------- */
/* Capture record                                                              */
/* -------------------------------------------------------------------------- */

export const ImageRefSchema = z.object({
  relativePath: z.string(),
  sha256: z.string().length(64),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteLength: z.number().int().nonnegative(),
});
export type ImageRef = z.infer<typeof ImageRefSchema>;

export const CAPTURE_STATUSES = ['captured', 'failed', 'skipped'] as const;
export const CaptureStatusSchema = z.enum(CAPTURE_STATUSES);
export type CaptureStatus = z.infer<typeof CaptureStatusSchema>;

export const CaptureSetSchema = z.object({
  id: z.string(),
  kind: z.enum(['state', 'responsive', 'animation']),
  member: z.string(),
});
export type CaptureSet = z.infer<typeof CaptureSetSchema>;

export const CaptureRecordSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  id: z.string(),
  runId: z.string(),
  project: z.string(),
  sourceUrl: z.string(),
  finalUrl: z.string(),
  routeKey: z.string(),
  capturedAt: IsoDateTimeSchema,
  kind: CaptureKindSchema,
  /**
   * `failed` and `skipped` records are first-class: they are written to the run
   * exactly like successful ones so the report can show honest outcomes.
   */
  status: CaptureStatusSchema,
  state: CaptureStateSchema,
  viewport: ViewportSchema,
  element: ElementIdentitySchema.optional(),
  interactionRecipe: z.array(RecipeStepSchema).optional(),
  readiness: ReadinessResultSchema,
  styleDelta: StyleDeltaSchema.optional(),
  animation: AnimationSampleSchema.optional(),
  set: CaptureSetSchema.optional(),
  /** Absent for `failed`/`skipped` records. */
  image: ImageRefSchema.optional(),
  durationMs: z.number().nonnegative(),
  warnings: z.array(z.string()),
  error: StructuredErrorSchema.optional(),
});
export type CaptureRecord = z.infer<typeof CaptureRecordSchema>;

/* -------------------------------------------------------------------------- */
/* Page + run records                                                          */
/* -------------------------------------------------------------------------- */

export const PageRecordSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  id: z.string(),
  runId: z.string(),
  requestedUrl: z.string(),
  finalUrl: z.string(),
  routeKey: z.string(),
  title: z.string().optional(),
  visitedAt: IsoDateTimeSchema,
  httpStatus: z.number().int().optional(),
  readiness: ReadinessResultSchema.optional(),
  warnings: z.array(z.string()),
  error: StructuredErrorSchema.optional(),
});
export type PageRecord = z.infer<typeof PageRecordSchema>;

export const BROWSER_MODES = ['clean', 'profile', 'storage-state', 'attach'] as const;
export const BrowserModeSchema = z.enum(BROWSER_MODES);
export type BrowserMode = z.infer<typeof BrowserModeSchema>;

export const RunManifestSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  runId: z.string(),
  project: z.string(),
  command: z.string(),
  startedAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema.optional(),
  toolVersion: z.string(),
  browser: z.object({
    engine: z.literal('chromium'),
    version: z.string().optional(),
    mode: BrowserModeSchema,
    headless: z.boolean(),
    /** Profile *name*, never a path to auth material. */
    profileName: z.string().optional(),
  }),
  baseViewport: ViewportSchema,
  counts: z
    .object({
      captured: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      skipped: z.number().int().nonnegative(),
      pages: z.number().int().nonnegative(),
    })
    .optional(),
  warnings: z.array(z.string()),
});
export type RunManifest = z.infer<typeof RunManifestSchema>;
