import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWriteFile, readCaptures, readPages, readRunManifest } from '@ui-atlas/artifacts';
import { UiAtlasError } from '@ui-atlas/protocol';
import { embedJson, escapeHtml } from './escape.js';
import { buildReportModel } from './model.js';
import { REPORT_STYLES } from './styles.js';
/**
 * The browser-side viewer, bundled by `packages/reporter/build.mjs`. Both the
 * compiled module (`dist/generate.js`) and the source (`src/generate.ts`) sit
 * one directory below the package root, so one relative path serves both.
 */
export function viewerBundlePath() {
    return fileURLToPath(new URL('../dist/app-bundle.js', import.meta.url));
}
async function loadViewerBundle() {
    const path = viewerBundlePath();
    if (!existsSync(path)) {
        throw new UiAtlasError('internal', 'the report viewer bundle is missing; run `npm run build`', {
            detail: { expectedPath: path },
        });
    }
    return readFile(path, 'utf8');
}
/**
 * Render a run into a single self-contained `report/index.html`.
 *
 * Self-contained means no network: the stylesheet and the viewer are inlined,
 * and the data is embedded as JSON. Images are referenced by relative path
 * because base64-inlining hundreds of screenshots would produce a file no
 * browser wants to open — the run directory is the unit you share, not the HTML
 * on its own.
 */
export async function generateReport(options) {
    const runDir = resolve(options.runDir);
    const manifestPath = resolve(runDir, 'run.json');
    if (!existsSync(manifestPath)) {
        throw new UiAtlasError('config.invalid', `no run.json in ${runDir}`, { detail: { runDir } });
    }
    const manifest = await readRunManifest(manifestPath);
    const captures = await readCaptures(resolve(runDir, 'captures.jsonl'));
    const pages = await readPages(resolve(runDir, 'pages.jsonl'));
    const model = buildReportModel({
        manifest,
        captures: captures.records,
        pages: pages.records,
        unreadableRecords: captures.invalidLines.length + pages.invalidLines.length,
        generatedAt: options.generatedAt ?? new Date().toISOString(),
    });
    const html = renderDocument(model, await loadViewerBundle());
    const target = resolve(runDir, 'report', 'index.html');
    const written = await atomicWriteFile(target, html);
    return { path: target, model, byteLength: written.byteLength };
}
function renderDocument(model, viewer) {
    const { run } = model;
    const counts = run.counts;
    // The masthead is static markup so the run is still legible with JavaScript
    // disabled. Everything interactive is rendered by the viewer.
    const meta = [
        `<span><b>${String(counts.captured)}</b> captured</span>`,
        `<span><b>${String(counts.failed)}</b> failed</span>`,
        `<span><b>${String(counts.skipped)}</b> skipped</span>`,
        `<span><b>${String(counts.pages)}</b> pages</span>`,
        `<span>${escapeHtml(run.browserEngine)} ${escapeHtml(run.browserVersion ?? '')} · ${escapeHtml(run.browserMode)}${run.headless ? ' · headless' : ''}</span>`,
    ].join('\n        ');
    const notices = [];
    if (model.unreadableRecords > 0) {
        notices.push(`<p class="note note--warn">${String(model.unreadableRecords)} record(s) in this run could not be read and are not shown.</p>`);
    }
    for (const warning of run.warnings) {
        notices.push(`<p class="note note--info">${escapeHtml(warning)}</p>`);
    }
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI Atlas · ${escapeHtml(run.project)} · ${escapeHtml(run.runId)}</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
<header class="masthead">
  <div class="masthead__top">
    <h1 class="masthead__title">${escapeHtml(run.project)}</h1>
    <span class="masthead__run">${escapeHtml(run.runId)}</span>
    <div class="masthead__meta">
        ${meta}
    </div>
  </div>
  <div class="tabs" id="tabs" role="tablist"></div>
</header>

<noscript>
  <div class="empty-state">
    <h2>This report needs JavaScript</h2>
    <p>The screenshots are in the <code>screenshots/</code> folder next to this file, and every
    capture's metadata sits beside its image as a <code>.json</code> file.</p>
  </div>
</noscript>

<div class="shell">
  <aside class="filters" id="filters" aria-label="Filters"></aside>
  <main class="main">
    <div class="resultbar"><span id="resultbar"></span></div>
    ${notices.join('\n    ')}
    <div id="view"></div>
  </main>
</div>

<footer class="footer">
  Generated ${escapeHtml(model.generatedAt)} by UI Atlas ${escapeHtml(run.toolVersion)} ·
  command <code>${escapeHtml(run.command)}</code> ·
  started ${escapeHtml(run.startedAt)}${run.finishedAt === undefined ? '' : ` · finished ${escapeHtml(run.finishedAt)}`}.
  This report is read-only and contains no authentication material.
</footer>

<script id="ui-atlas-data" type="application/json">${embedJson(model)}</script>
<script>${viewer}</script>
</body>
</html>
`;
}
//# sourceMappingURL=generate.js.map