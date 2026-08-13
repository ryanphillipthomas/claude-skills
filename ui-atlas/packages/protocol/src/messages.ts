import { z } from 'zod';
import { PROTOCOL_VERSION } from './constants.js';
import { StructuredErrorSchema } from './errors.js';
import {
  AnimationSampleabilitySchema,
  BoxSchema,
  CaptureKindSchema,
  CaptureStatusSchema,
  ElementIdentitySchema,
  LocatorCandidateSchema,
  StateNameSchema,
  ViewportSchema,
} from './model.js';

/* -------------------------------------------------------------------------- */
/* Page -> host: element probe                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Normalised, DOM-free facts about an element that the host hashes into a
 * structural fingerprint. Deliberately excludes transient class hashes,
 * absolute page coordinates and user data.
 */
export const FingerprintInputSchema = z.object({
  tagName: z.string(),
  role: z.string().optional(),
  nameClass: z.string(),
  stableAttributes: z.record(z.string(), z.string()),
  ancestorRoles: z.array(z.string()),
  geometryBucket: z.string(),
});
export type FingerprintInput = z.infer<typeof FingerprintInputSchema>;

export const ElementProbeSchema = z.object({
  tagName: z.string(),
  role: z.string().optional(),
  accessibleName: z.string().optional(),
  textExcerpt: z.string().optional(),
  boundingBox: BoxSchema,
  visible: z.boolean(),
  candidates: z.array(LocatorCandidateSchema),
  fingerprintInput: FingerprintInputSchema,
  /** Open shadow-root host selectors, outermost first. */
  shadowHostPath: z.array(z.string()),
  /** True when any ancestor shadow root is closed and could not be traversed. */
  closedShadowEncountered: z.boolean(),
  attributes: z.record(z.string(), z.string()),
});
export type ElementProbe = z.infer<typeof ElementProbeSchema>;

/* -------------------------------------------------------------------------- */
/* Page -> host: capture queue                                                 */
/* -------------------------------------------------------------------------- */

export const CaptureRequestSchema = z.object({
  kind: CaptureKindSchema,
  /** States to capture, in order. Defaults to `['default']`. */
  states: z.array(StateNameSchema).min(1).default(['default']),
  /** When true, the overlay is left visible in the artifact. Off by default. */
  includeOverlay: z.boolean().default(false),
  /** Run the capture once per configured viewport preset. */
  responsive: z.boolean().default(false),
  label: z.string().max(120).optional(),
  probe: ElementProbeSchema.optional(),
  /**
   * Which animation an `animation-frame` or `animation-video` capture is of,
   * as named by `animation/inventory`. Absent on a recording means the page as
   * a whole, which is what motion no animation list can see needs.
   */
  animationId: z.string().max(120).optional(),
});
export type CaptureRequest = z.infer<typeof CaptureRequestSchema>;

export const QUEUE_JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const;
export const QueueJobStatusSchema = z.enum(QUEUE_JOB_STATUSES);
export type QueueJobStatus = z.infer<typeof QueueJobStatusSchema>;

/**
 * A preview of what a job captured, small enough to travel in the event.
 *
 * Constrained to an inline PNG rather than left as a free string: the panel
 * assigns it to an `img` inside the site being captured, so any other scheme
 * would turn a status update into a network request made from that site's
 * origin. The host is the only producer — this shape is what stops a
 * page-supplied value from ever being mistaken for one.
 */
export const ThumbnailSchema = z
  .string()
  .max(262_144)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u);

export const QueueJobSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  kind: CaptureKindSchema,
  states: z.array(StateNameSchema),
  label: z.string(),
  status: QueueJobStatusSchema,
  progress: z.string().optional(),
  captureIds: z.array(z.string()),
  warnings: z.array(z.string()),
  error: StructuredErrorSchema.optional(),
  /** The first shot this job wrote. Absent until it has written one. */
  thumbnail: ThumbnailSchema.optional(),
  /**
   * Names of the files written, in the order they were written.
   *
   * Names only, never paths: a file name is derived from the site's own
   * content, where an absolute path would hand the page the user's home
   * directory. This is what lets the captured list say
   * `save-changes--hover.png` rather than a capture id.
   */
  fileNames: z.array(z.string()).default([]),
});
export type QueueJob = z.infer<typeof QueueJobSchema>;

/* -------------------------------------------------------------------------- */
/* Host -> page: session description                                           */
/* -------------------------------------------------------------------------- */

export const OverlaySessionSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  runId: z.string(),
  project: z.string(),
  /** `<project>/<run-id>` — a label, never a filesystem path. */
  outputLabel: z.string(),
  viewportPresets: z.array(ViewportSchema),
  shortcuts: z.record(z.string(), z.string()),
  capabilities: z.object({
    fullPage: z.boolean(),
    responsive: z.boolean(),
    animation: z.boolean(),
    states: z.array(StateNameSchema),
  }),
});
export type OverlaySession = z.infer<typeof OverlaySessionSchema>;

/* -------------------------------------------------------------------------- */
/* Request envelope                                                            */
/* -------------------------------------------------------------------------- */

export const BridgeRequestSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  /** Per-session token handed to the overlay bootstrap; kept in a closure. */
  token: z.string().min(8),
  id: z.string().min(1).max(64),
  method: z.string().min(1).max(64),
  params: z.unknown(),
});
export type BridgeRequest = z.infer<typeof BridgeRequestSchema>;

export const BridgeResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), id: z.string(), result: z.unknown() }),
  z.object({ ok: z.literal(false), id: z.string(), error: StructuredErrorSchema }),
]);
export type BridgeResponse = z.infer<typeof BridgeResponseSchema>;

/* -------------------------------------------------------------------------- */
/* Methods                                                                     */
/* -------------------------------------------------------------------------- */

export const HelloParamsSchema = z.object({
  overlayVersion: z.string(),
  url: z.string(),
});
export const HelloResultSchema = z.object({ session: OverlaySessionSchema });

export const SelectParamsSchema = z.object({ probe: ElementProbeSchema });
export const SelectResultSchema = z.object({
  identity: ElementIdentitySchema,
  /** Result of immediately re-resolving the chosen locator from the host. */
  resolution: z.object({
    matches: z.number().int().nonnegative(),
    usedCandidateIndex: z.number().int().nonnegative(),
    fellBack: z.boolean(),
  }),
  warnings: z.array(z.string()),
});

export const ClearSelectionParamsSchema = z.object({});
export const CaptureResultSchema = z.object({ jobs: z.array(QueueJobSchema) });
export const QueueListParamsSchema = z.object({});
export const QueueListResultSchema = z.object({ jobs: z.array(QueueJobSchema) });

/**
 * Stop the captures that have not started.
 *
 * Deliberately not a kill switch for the running one: a capture in flight has
 * already applied a state to the live page and has to put it back, and tearing
 * it down half-way would leave the site holding a hover it never asked for.
 * `stopped` is how many were still queued, so the panel can say what it did
 * rather than claim it stopped everything.
 */
export const QueueCancelParamsSchema = z.object({});
export const QueueCancelResultSchema = z.object({
  stopped: z.number().int().nonnegative(),
  /** True while a job the cancel could not reach is still finishing. */
  stillRunning: z.boolean(),
});
export type QueueCancelResult = z.infer<typeof QueueCancelResultSchema>;

export const SetViewportParamsSchema = z.object({
  width: z.number().int().min(200).max(10_000),
  height: z.number().int().min(200).max(10_000),
  presetName: z.string().optional(),
});
export const SetViewportResultSchema = z.object({ viewport: ViewportSchema });

/**
 * Apply a state to the selected element and *hold* it, so the user can see it
 * on the live page. `null` releases whatever is held.
 */
export const StatePreviewParamsSchema = z.object({
  state: StateNameSchema.nullable(),
});
export const StatePreviewResultSchema = z.object({
  applied: StateNameSchema.nullable(),
  provenance: z.string().optional(),
  verified: z.boolean().optional(),
  verification: z.string().optional(),
  notice: z.string().optional(),
});

/* -------------------------------------------------------------------------- */
/* Animation panel                                                             */
/* -------------------------------------------------------------------------- */

/**
 * One animation as the toolbar shows it.
 *
 * The panel's whole purpose is to offer the action that will *work*. So each
 * entry carries the inventory's own reason and two flags derived from it, and
 * the toolbar never offers a sample that would produce a frame the site does
 * not show.
 */
export const AnimationSummarySchema = z.object({
  /** Names this animation back to the host in `capture/request`. */
  id: z.string(),
  label: z.string(),
  target: z.string().optional(),
  sampleability: AnimationSampleabilitySchema,
  /** Why, in the words the inventory already used. Shown when there is no action. */
  reason: z.string(),
  /** A seek would reproduce this frame every time. */
  canSample: z.boolean(),
  /** A recording would show what a seek cannot. */
  canRecord: z.boolean(),
  durationMs: z.number().nonnegative().optional(),
});
export type AnimationSummary = z.infer<typeof AnimationSummarySchema>;

export const AnimationInventoryParamsSchema = z.object({});
export const AnimationInventoryResultSchema = z.object({
  animations: z.array(AnimationSummarySchema),
  /** Elements whose motion `getAnimations` cannot describe at all. */
  unobservable: z.object({
    canvas2d: z.number().int().nonnegative(),
    webgl: z.number().int().nonnegative(),
    video: z.number().int().nonnegative(),
  }),
  warnings: z.array(z.string()),
});
export type AnimationInventoryResult = z.infer<typeof AnimationInventoryResultSchema>;

export const InspectModeParamsSchema = z.object({ active: z.boolean() });
export const InspectModeResultSchema = z.object({ active: z.boolean() });

/* -------------------------------------------------------------------------- */
/* Output: what has been written, and revealing it                             */
/* -------------------------------------------------------------------------- */

/**
 * One written artifact, as the panel lists it.
 *
 * The *file name* is here but the directory is not, and that is deliberate: see
 * `OverlaySession.outputLabel`. A file name is derived from the site's own
 * content and tells the page nothing it did not already know; an absolute path
 * would hand it the user's home directory.
 */
export const OutputEntrySchema = z.object({
  /** Basename only, e.g. `button--save-changes--hover.png`. */
  fileName: z.string(),
  /** Run-relative folder, e.g. `screenshots/localhost-4173-root/desktop`. */
  folder: z.string(),
  status: CaptureStatusSchema,
  state: z.string(),
  kind: CaptureKindSchema,
});
export type OutputEntry = z.infer<typeof OutputEntrySchema>;

export const OutputSummaryParamsSchema = z.object({
  /** How many of the most recent entries to return. */
  limit: z.number().int().min(1).max(50).optional(),
});
export const OutputSummaryResultSchema = z.object({
  /** `<project>/<run-id>` — a label, never a filesystem path. */
  outputLabel: z.string(),
  counts: z.object({
    captured: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  /** Most recent first. */
  recent: z.array(OutputEntrySchema),
});
export type OutputSummaryResult = z.infer<typeof OutputSummaryResultSchema>;

/**
 * What to open. A closed enum rather than a path, because this method reaches
 * the operating system: a page that could name the target could name anything.
 * The host resolves both of these from the run it owns.
 */
export const OUTPUT_TARGETS = ['folder', 'report'] as const;
export const OutputTargetSchema = z.enum(OUTPUT_TARGETS);
export type OutputTarget = z.infer<typeof OutputTargetSchema>;

export const OutputRevealParamsSchema = z.object({ target: OutputTargetSchema });
export const OutputRevealResultSchema = z.object({
  target: OutputTargetSchema,
  /** False when the platform has no opener; the host says where it is instead. */
  opened: z.boolean(),
  /** Shown in the panel. Never an absolute path. */
  notice: z.string(),
});
export type OutputRevealResult = z.infer<typeof OutputRevealResultSchema>;

export const LogParamsSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string().max(2000),
  detail: z.record(z.string(), z.unknown()).optional(),
});

export const BRIDGE_METHODS = {
  hello: { params: HelloParamsSchema, result: HelloResultSchema },
  'element/selected': { params: SelectParamsSchema, result: SelectResultSchema },
  'element/cleared': { params: ClearSelectionParamsSchema, result: z.object({}) },
  'capture/request': { params: CaptureRequestSchema, result: CaptureResultSchema },
  'queue/list': { params: QueueListParamsSchema, result: QueueListResultSchema },
  'queue/cancel': { params: QueueCancelParamsSchema, result: QueueCancelResultSchema },
  'viewport/set': { params: SetViewportParamsSchema, result: SetViewportResultSchema },
  'inspect/mode': { params: InspectModeParamsSchema, result: InspectModeResultSchema },
  'state/preview': { params: StatePreviewParamsSchema, result: StatePreviewResultSchema },
  'animation/inventory': {
    params: AnimationInventoryParamsSchema,
    result: AnimationInventoryResultSchema,
  },
  'output/summary': { params: OutputSummaryParamsSchema, result: OutputSummaryResultSchema },
  'output/reveal': { params: OutputRevealParamsSchema, result: OutputRevealResultSchema },
  log: { params: LogParamsSchema, result: z.object({}) },
} as const;

export type BridgeMethod = keyof typeof BRIDGE_METHODS;
export type BridgeParams<M extends BridgeMethod> = z.infer<(typeof BRIDGE_METHODS)[M]['params']>;
export type BridgeResult<M extends BridgeMethod> = z.infer<(typeof BRIDGE_METHODS)[M]['result']>;

export function isBridgeMethod(value: string): value is BridgeMethod {
  return Object.prototype.hasOwnProperty.call(BRIDGE_METHODS, value);
}

/* -------------------------------------------------------------------------- */
/* Host -> page events                                                         */
/* -------------------------------------------------------------------------- */

export const HostEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('queue/update'), job: QueueJobSchema }),
  z.object({ type: z.literal('session/update'), session: OverlaySessionSchema }),
  z.object({
    type: z.literal('notice'),
    level: z.enum(['info', 'warn', 'error']),
    message: z.string(),
  }),
  z.object({ type: z.literal('selection/invalidated'), reason: z.string() }),
  z.object({ type: z.literal('inspect/mode'), active: z.boolean() }),
]);
export type HostEvent = z.infer<typeof HostEventSchema>;

/** Bootstrap options handed to the injected overlay at document start. */
export const OverlayBootstrapSchema = z.object({
  token: z.string(),
  version: z.string(),
  /** Overlay starts in inspect mode when true. */
  autoInspect: z.boolean(),
  shortcuts: z.record(z.string(), z.string()),
});
export type OverlayBootstrap = z.infer<typeof OverlayBootstrapSchema>;
