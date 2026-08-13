import type { Page } from 'playwright';
import type { UiAtlasConfig, ViewportPreset } from '@ui-atlas/config';
import type { RunWriter } from '@ui-atlas/artifacts';
import { settlePage } from '@ui-atlas/settle';
import {
  toStructuredError,
  type CaptureKind,
  type CaptureRecord,
  type ElementIdentity,
  type StateName,
  type Viewport,
} from '@ui-atlas/protocol';
import { CaptureService } from './service.js';

/**
 * A page prepared for one viewport. The runner never reuses the session's own
 * page: responsive replay must not disturb whatever the user is looking at.
 */
export interface ViewportTarget {
  page: Page;
  viewport: Viewport;
  viewportLabel: string;
  /** Warnings about this target itself, e.g. emulation that was unavailable. */
  warnings: string[];
  close(): Promise<void>;
}

/**
 * Builds a target for one preset. Implementations create a fresh browser
 * context so that touch, user agent and device scale factor are really applied
 * — a resized desktop window is not a phone.
 */
export type ViewportTargetFactory = (preset: ViewportPreset) => Promise<ViewportTarget>;

export interface ResponsiveRunnerOptions {
  config: UiAtlasConfig;
  writer: RunWriter;
  runId: string;
  project: string;
  createTarget: ViewportTargetFactory;
}

export interface ResponsiveRunRequest {
  /** Route to reload in each fresh context. */
  url: string;
  kind: CaptureKind;
  states: StateName[];
  identity?: ElementIdentity | undefined;
  /** Presets to run. Defaults to every configured viewport. */
  presets?: ViewportPreset[] | undefined;
  setId: string;
  onProgress?: ((message: string) => void) | undefined;
  /**
   * Checked between viewports. A responsive set is the longest thing this tool
   * does — a fresh browser context per preset — so it is the one a user is most
   * likely to want to call off part way through.
   */
  shouldStop?: (() => boolean) | undefined;
}

export interface ResponsiveRunResult {
  records: CaptureRecord[];
  warnings: string[];
}

/**
 * Replays a route across viewports, one fresh context each.
 *
 * The reload is the point: responsive JavaScript that only runs at initial load
 * will not re-run on a resize, so a resized window shows a layout the site would
 * never actually produce at that width. Every viewport therefore gets its own
 * context, its own navigation, its own settle pass and its own re-resolution of
 * the element.
 *
 * A component that is absent, hidden or ambiguous at one viewport is recorded as
 * `skipped` with a reason. It never fails the rest of the set.
 */
export class ResponsiveRunner {
  constructor(private readonly options: ResponsiveRunnerOptions) {}

  async run(request: ResponsiveRunRequest): Promise<ResponsiveRunResult> {
    const presets = request.presets ?? this.options.config.viewports;
    const records: CaptureRecord[] = [];
    const warnings: string[] = [];

    for (let index = 0; index < presets.length; index += 1) {
      const preset = presets[index];
      if (preset === undefined) continue;

      // Between presets is the safe boundary: the previous viewport's context
      // has been closed and the next has not been opened, so stopping here
      // leaves no browser context behind and no state applied anywhere.
      if (request.shouldStop?.() === true) {
        warnings.push(
          `stopped after ${String(index)} of ${String(presets.length)} viewports`,
        );
        break;
      }
      request.onProgress?.(`${preset.name} (${String(index + 1)}/${String(presets.length)})`);

      const outcome = await this.runOne(preset, request);
      records.push(...outcome.records);
      for (const warning of outcome.warnings) {
        if (!warnings.includes(warning)) warnings.push(warning);
      }
    }

    return { records, warnings };
  }

  private async runOne(
    preset: ViewportPreset,
    request: ResponsiveRunRequest,
  ): Promise<ResponsiveRunResult> {
    const { config, writer, runId, project } = this.options;
    let target: ViewportTarget | undefined;

    try {
      target = await this.options.createTarget(preset);
    } catch (error) {
      // A context we could not even create is a real failure, but only of this
      // one viewport: the rest of the set still runs.
      const structured = toStructuredError(error, 'browser.launch-failed');
      return {
        records: [],
        warnings: [`viewport ${preset.name} was skipped: ${structured.message}`],
      };
    }

    try {
      await target.page.goto(request.url, {
        waitUntil: config.settle.loadState,
        timeout: config.browser.navigationTimeoutMs,
      });
      const readiness = await settlePage(target.page, { config: config.settle });

      const captures = new CaptureService({
        page: target.page,
        writer,
        config,
        runId,
        project,
        viewport: target.viewport,
        viewportLabel: target.viewportLabel,
      });

      const records: CaptureRecord[] = [];
      for (const state of request.states) {
        const record = await captures.capture({
          kind: request.kind,
          state,
          identity: request.identity,
          sourceUrl: request.url,
          elementAbsentOutcome: 'skip',
          set: { id: request.setId, kind: 'responsive', member: target.viewportLabel },
        });
        records.push(record);
      }

      return { records, warnings: [...target.warnings, ...readiness.warnings] };
    } catch (error) {
      const structured = toStructuredError(error, 'capture.failed');
      return {
        records: [],
        warnings: [`viewport ${preset.name} failed: ${structured.message}`],
      };
    } finally {
      await target.close().catch(() => undefined);
    }
  }
}
