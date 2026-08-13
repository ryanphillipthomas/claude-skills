/**
 * The wire between the browser extension and the running launcher.
 *
 * Newline-delimited JSON, validated on the way in. Every field is parsed before
 * it is used, because the far end of this socket is code running inside a
 * browser — the same reason the overlay's bridge validates everything a page
 * sends it (ADR 4).
 *
 * There is deliberately no method here that names a path, a profile directory
 * or a command to run. The extension can ask for the status, ask to start on a
 * URL it is looking at, and ask to stop. Everything else stays on this side.
 */

import { z } from 'zod';

/** Bumped when a field changes meaning; the launcher refuses a mismatch. */
export const BRIDGE_PROTOCOL_VERSION = 1;

/**
 * What the extension can capture, and the command each maps to. `element`
 * opens the inspector so you can pick one; the other two are one-shot.
 */
export const CaptureModeSchema = z.enum(['element', 'page', 'site']);
export type CaptureMode = z.infer<typeof CaptureModeSchema>;

const HttpUrlSchema = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'must be an http or https URL');

export const BridgeRequestSchema = z.discriminatedUnion('method', [
  z.object({ id: z.string().max(64), method: z.literal('status') }),
  z.object({
    id: z.string().max(64),
    method: z.literal('capture'),
    url: HttpUrlSchema,
    mode: CaptureModeSchema,
  }),
  z.object({ id: z.string().max(64), method: z.literal('start') }),
  z.object({ id: z.string().max(64), method: z.literal('stop') }),
]);
export type BridgeRequest = z.infer<typeof BridgeRequestSchema>;

/** The subset of launcher state the extension is allowed to see. */
export const BridgeStatusSchema = z.object({
  protocol: z.number().int(),
  /** `cold` | `starting` | `signin` | `running` | `failed`. */
  phase: z.string(),
  /** One line, already worded — the extension does not compose copy. */
  title: z.string(),
  subtitle: z.string(),
  /** Whether the loaded profile last read as signed in. */
  signedIn: z.boolean().optional(),
  profile: z.string().optional(),
  lastRun: z
    .object({ label: z.string(), files: z.number().int().nonnegative(), hasReport: z.boolean() })
    .optional(),
});
export type BridgeStatus = z.infer<typeof BridgeStatusSchema>;

export const BridgeResponseSchema = z.union([
  z.object({ id: z.string(), ok: z.literal(true), status: BridgeStatusSchema }),
  z.object({ id: z.string(), ok: z.literal(false), error: z.string() }),
  /** Pushed without a request when the launcher's state changes. */
  z.object({ event: z.literal('status'), status: BridgeStatusSchema }),
]);
export type BridgeResponse = z.infer<typeof BridgeResponseSchema>;

/**
 * Parse one line. Returns the error as a value rather than throwing, because
 * the caller is a socket handler that must answer every line it is given —
 * including a line that is not JSON at all.
 *
 * A rejection carries the request's `id` whenever the line had a usable one,
 * even though the rest of it failed validation. Without that, a client with
 * two requests in flight is told only that *something* was refused.
 */
export function readRequest(
  line: string,
): { ok: true; request: BridgeRequest } | { ok: false; error: string; id: string | undefined } {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { ok: false, error: 'not valid JSON', id: undefined };
  }
  const parsed = BridgeRequestSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((issue) => issue.message).join('; '),
      id: looseId(value),
    };
  }
  return { ok: true, request: parsed.data };
}

/** The `id` of an otherwise invalid message, when it has a plausible one. */
function looseId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 && id.length <= 64 ? id : undefined;
}

/** The CLI command each capture mode runs. Named here so the mapping is one fact. */
export function commandFor(mode: CaptureMode, url: string): string[] {
  switch (mode) {
    case 'element':
      return ['inspect', url, '--auto-inspect'];
    case 'page':
      return ['capture', url];
    case 'site':
      return ['crawl', url];
  }
}
