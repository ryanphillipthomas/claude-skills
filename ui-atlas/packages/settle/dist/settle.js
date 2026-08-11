import { Deadline, TIMED_OUT, sleep, withTimeout } from './deadline.js';
import { decodeVisibleImages, disconnectMutationObserver, installMutationObserver, readMutationQuiet, waitAnimationFramesInPage, waitForFonts, } from './page-scripts.js';
class CheckRecorder {
    checks = [];
    warnings = [];
    record(name, status, startedAt, detail) {
        const check = { name, status, durationMs: Math.max(0, Date.now() - startedAt) };
        if (detail !== undefined)
            check.detail = detail;
        this.checks.push(check);
        if (status === 'timed-out')
            this.warn(`${name} timed out${detail === undefined ? '' : `: ${detail}`}`);
        if (status === 'failed')
            this.warn(`${name} failed${detail === undefined ? '' : `: ${detail}`}`);
    }
    warn(message) {
        if (!this.warnings.includes(message))
            this.warnings.push(message);
    }
    snapshot() {
        return { checks: [...this.checks], warnings: [...this.warnings] };
    }
}
function describeError(value) {
    return value instanceof Error ? value.message.split('\n')[0] ?? value.message : String(value);
}
/**
 * Bounded readiness. Every check has its own budget inside one hard deadline;
 * when the deadline fires we capture anyway and record what was still pending.
 * `networkidle` is deliberately never used — analytics, streaming and long
 * polling can keep a page busy forever.
 */
export async function settlePage(page, options) {
    const { config } = options;
    const totalMs = options.totalTimeoutMs ?? config.totalTimeoutMs;
    const deadline = new Deadline(totalMs);
    const startedAtIso = new Date().toISOString();
    const recorder = new CheckRecorder();
    await runLoadState(page, config, deadline, recorder);
    await runFonts(page, config, deadline, recorder);
    await runImages(page, config, deadline, recorder);
    if (options.target !== undefined)
        await runElementStable(options.target, config, deadline, recorder);
    if (options.skipMutationQuiet !== true)
        await runMutationQuiet(page, config, deadline, recorder);
    await runAnimationFrames(page, config, deadline, recorder);
    const { checks, warnings } = recorder.snapshot();
    const deadlineExceeded = deadline.expired();
    if (deadlineExceeded)
        warnings.push(`settle hit its ${totalMs}ms deadline; captured anyway`);
    return {
        startedAt: startedAtIso,
        durationMs: deadline.elapsedMs(),
        deadlineMs: totalMs,
        deadlineExceeded,
        checks,
        warnings,
    };
}
async function runLoadState(page, config, deadline, recorder) {
    const startedAt = Date.now();
    const budget = deadline.budgetFor(deadline.remainingMs());
    if (budget <= 0) {
        recorder.record('load-state', 'timed-out', startedAt, 'no budget left');
        return;
    }
    try {
        await page.waitForLoadState(config.loadState, { timeout: budget });
        recorder.record('load-state', 'passed', startedAt, config.loadState);
    }
    catch (error) {
        recorder.record('load-state', 'timed-out', startedAt, describeError(error));
    }
}
async function runFonts(page, config, deadline, recorder) {
    const startedAt = Date.now();
    const budget = deadline.budgetFor(config.fontTimeoutMs);
    if (budget <= 0) {
        recorder.record('fonts-ready', 'skipped', startedAt, 'no budget left');
        return;
    }
    try {
        const outcome = await withTimeout(page.evaluate(waitForFonts), budget);
        if (outcome === TIMED_OUT)
            recorder.record('fonts-ready', 'timed-out', startedAt);
        else
            recorder.record('fonts-ready', 'passed', startedAt, outcome);
    }
    catch (error) {
        recorder.record('fonts-ready', 'failed', startedAt, describeError(error));
    }
}
async function runImages(page, config, deadline, recorder) {
    const startedAt = Date.now();
    const budget = deadline.budgetFor(config.imageTimeoutMs);
    if (budget <= 0) {
        recorder.record('images-decoded', 'skipped', startedAt, 'no budget left');
        return;
    }
    try {
        const outcome = await withTimeout(page.evaluate(decodeVisibleImages, config.perImageTimeoutMs), budget);
        if (outcome === TIMED_OUT) {
            recorder.record('images-decoded', 'timed-out', startedAt);
            return;
        }
        const detail = `${outcome.complete + outcome.decoded}/${outcome.considered} ready`;
        if (outcome.failed > 0 || outcome.timedOut > 0) {
            recorder.record('images-decoded', 'passed', startedAt, `${detail}; ${outcome.failed} failed, ${outcome.timedOut} slow`);
            recorder.warn(`${outcome.failed + outcome.timedOut} image(s) did not decode before capture`);
        }
        else {
            recorder.record('images-decoded', 'passed', startedAt, detail);
        }
    }
    catch (error) {
        recorder.record('images-decoded', 'failed', startedAt, describeError(error));
    }
}
function boxesEqual(a, b) {
    return (Math.abs(a.x - b.x) < 0.5 &&
        Math.abs(a.y - b.y) < 0.5 &&
        Math.abs(a.width - b.width) < 0.5 &&
        Math.abs(a.height - b.height) < 0.5);
}
async function runElementStable(target, config, deadline, recorder) {
    const startedAt = Date.now();
    const budget = deadline.budgetFor(deadline.remainingMs());
    if (budget <= 0) {
        recorder.record('element-stable', 'timed-out', startedAt, 'no budget left');
        return;
    }
    try {
        await target.waitFor({ state: 'visible', timeout: Math.min(budget, 5_000) });
    }
    catch (error) {
        recorder.record('element-stable', 'failed', startedAt, describeError(error));
        return;
    }
    const pollMs = 50;
    let stableSince;
    let previous;
    while (!deadline.expired()) {
        let box;
        try {
            box = await target.boundingBox({ timeout: 1_000 });
        }
        catch (error) {
            recorder.record('element-stable', 'failed', startedAt, describeError(error));
            return;
        }
        if (box === null) {
            recorder.record('element-stable', 'failed', startedAt, 'element has no box (detached or hidden)');
            return;
        }
        if (previous !== undefined && boxesEqual(previous, box)) {
            stableSince ??= Date.now();
            if (Date.now() - stableSince >= config.geometryQuietMs) {
                recorder.record('element-stable', 'passed', startedAt, `stable for ${config.geometryQuietMs}ms`);
                return;
            }
        }
        else {
            stableSince = undefined;
        }
        previous = box;
        await sleep(pollMs);
    }
    recorder.record('element-stable', 'timed-out', startedAt, 'element geometry never settled');
}
async function runMutationQuiet(page, config, deadline, recorder) {
    const startedAt = Date.now();
    if (config.mutationQuietMs <= 0) {
        recorder.record('mutation-quiet', 'skipped', startedAt, 'disabled by config');
        return;
    }
    if (deadline.expired()) {
        recorder.record('mutation-quiet', 'timed-out', startedAt, 'no budget left');
        return;
    }
    try {
        await page.evaluate(installMutationObserver);
    }
    catch (error) {
        recorder.record('mutation-quiet', 'failed', startedAt, describeError(error));
        return;
    }
    while (!deadline.expired()) {
        let state;
        try {
            state = await page.evaluate(readMutationQuiet);
        }
        catch (error) {
            recorder.record('mutation-quiet', 'failed', startedAt, describeError(error));
            return;
        }
        if (state.quietForMs >= config.mutationQuietMs) {
            recorder.record('mutation-quiet', 'passed', startedAt, `${config.mutationQuietMs}ms quiet after ${state.mutationCount} mutations`);
            return;
        }
        await sleep(Math.min(50, config.mutationQuietMs));
    }
    recorder.record('mutation-quiet', 'timed-out', startedAt, 'page never went quiet');
}
async function runAnimationFrames(page, config, deadline, recorder) {
    const startedAt = Date.now();
    if (config.animationFrames <= 0) {
        recorder.record('animation-frames', 'skipped', startedAt, 'disabled by config');
        return;
    }
    // Always give the frames a small budget even at the deadline: they are what
    // make the paint match the DOM we just verified.
    const budget = Math.max(200, deadline.budgetFor(1_000));
    try {
        const outcome = await withTimeout(page.evaluate(waitAnimationFramesInPage, config.animationFrames), budget);
        if (outcome === TIMED_OUT)
            recorder.record('animation-frames', 'timed-out', startedAt);
        else
            recorder.record('animation-frames', 'passed', startedAt, `${config.animationFrames} frames`);
    }
    catch (error) {
        recorder.record('animation-frames', 'failed', startedAt, describeError(error));
    }
}
/** Detach the settle observer. Safe to call on a closed or navigated page. */
export async function disposeSettle(page) {
    try {
        await page.evaluate(disconnectMutationObserver);
    }
    catch {
        // Page already gone; nothing to clean up.
    }
}
/** Wait for `count` animation frames without running a full settle pass. */
export async function waitAnimationFrames(page, count = 2) {
    try {
        await withTimeout(page.evaluate(waitAnimationFramesInPage, count), 2_000);
    }
    catch {
        // A navigation during the wait is not fatal for the caller.
    }
}
//# sourceMappingURL=settle.js.map