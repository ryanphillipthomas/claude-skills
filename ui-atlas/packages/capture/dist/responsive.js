import { settlePage } from '@ui-atlas/settle';
import { toStructuredError, } from '@ui-atlas/protocol';
import { CaptureService } from './service.js';
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
    options;
    constructor(options) {
        this.options = options;
    }
    async run(request) {
        const presets = request.presets ?? this.options.config.viewports;
        const records = [];
        const warnings = [];
        for (let index = 0; index < presets.length; index += 1) {
            const preset = presets[index];
            if (preset === undefined)
                continue;
            request.onProgress?.(`${preset.name} (${String(index + 1)}/${String(presets.length)})`);
            const outcome = await this.runOne(preset, request);
            records.push(...outcome.records);
            for (const warning of outcome.warnings) {
                if (!warnings.includes(warning))
                    warnings.push(warning);
            }
        }
        return { records, warnings };
    }
    async runOne(preset, request) {
        const { config, writer, runId, project } = this.options;
        let target;
        try {
            target = await this.options.createTarget(preset);
        }
        catch (error) {
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
            const records = [];
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
        }
        catch (error) {
            const structured = toStructuredError(error, 'capture.failed');
            return {
                records: [],
                warnings: [`viewport ${preset.name} failed: ${structured.message}`],
            };
        }
        finally {
            await target.close().catch(() => undefined);
        }
    }
}
//# sourceMappingURL=responsive.js.map