import { z } from 'zod';
import { PROTOCOL_VERSION } from './constants.js';
import { StructuredErrorSchema } from './errors.js';
import {
  BoxSchema,
  CaptureKindSchema,
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
});
export type CaptureRequest = z.infer<typeof CaptureRequestSchema>;

export const QUEUE_JOB_STATUSES = ['queued', 'running', 'done', 'failed', 'cancelled'] as const;
export const QueueJobStatusSchema = z.enum(QUEUE_JOB_STATUSES);
export type QueueJobStatus = z.infer<typeof QueueJobStatusSchema>;

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

export const InspectModeParamsSchema = z.object({ active: z.boolean() });
export const InspectModeResultSchema = z.object({ active: z.boolean() });

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
  'viewport/set': { params: SetViewportParamsSchema, result: SetViewportResultSchema },
  'inspect/mode': { params: InspectModeParamsSchema, result: InspectModeResultSchema },
  'state/preview': { params: StatePreviewParamsSchema, result: StatePreviewResultSchema },
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
