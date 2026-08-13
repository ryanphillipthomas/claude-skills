/**
 * `index.html` at the root of a project: everything this project knows, on one
 * page, plus the prompt that turns it into a design system.
 *
 * The per-run report (ADR 12) answers "what happened in this run". This answers
 * a different question — "what do I have about this site" — and it has to
 * survive being the only thing someone opens weeks later. So it is static
 * markup rather than a rendered model: every section is in the file, readable
 * with JavaScript off, and the only script on the page is the copy buttons.
 *
 * Same threat model as the report: names and text on this page came from
 * arbitrary websites, so everything interpolated is escaped, and the prompt
 * blocks are plain `<pre>` content that the copy button reads with
 * `textContent`. Nothing on this page is ever assembled as HTML from site data.
 */

import { atomicWriteFile } from '@ui-atlas/artifacts';
import type { ExportPlanEntry } from '@ui-atlas/artifacts';
import { buildDesignPrompt, type BuiltPrompt } from './design-prompt.js';
import { escapeHtml } from './escape.js';
import { collectProjectFacts, type ProjectFacts, type TokenFact } from './project-facts.js';
import { PROJECT_STYLES } from './project-styles.js';
import { REPORT_STYLES } from './styles.js';

export interface GenerateProjectPageOptions {
  outputRoot: string;
  project: string;
  generatedAt?: string;
}

export interface GeneratedProjectPage {
  path: string;
  facts: ProjectFacts;
  prompt: BuiltPrompt;
  byteLength: number;
}

export async function generateProjectPage(
  options: GenerateProjectPageOptions,
): Promise<GeneratedProjectPage> {
  const facts = await collectProjectFacts({
    outputRoot: options.outputRoot,
    project: options.project,
    ...(options.generatedAt === undefined ? {} : { generatedAt: options.generatedAt }),
  });
  const prompt = buildDesignPrompt(facts);
  const html = renderProjectPage(facts, prompt);
  const written = await atomicWriteFile(facts.contents.paths.indexHtml, html);
  return { path: facts.contents.paths.indexHtml, facts, prompt, byteLength: written.byteLength };
}

const SECTIONS: Array<{ id: string; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'pages', label: 'Pages' },
  { id: 'components', label: 'Components' },
  { id: 'motion', label: 'Motion' },
  { id: 'values', label: 'Values' },
  { id: 'files', label: 'Files' },
  { id: 'prompt', label: 'Design prompt' },
];

export function renderProjectPage(facts: ProjectFacts, prompt: BuiltPrompt): string {
  const site = facts.manifest?.site;
  const title = site?.label ?? facts.project;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI Atlas · ${escapeHtml(title)}</title>
<style>${REPORT_STYLES}${PROJECT_STYLES}</style>
</head>
<body>
<header class="masthead">
  <div class="masthead__top">
    <h1 class="masthead__title">${escapeHtml(title)}</h1>
    ${site === undefined ? '' : `<span class="masthead__run"><a href="${escapeHtml(encodeURI(site.origin))}">${escapeHtml(site.origin)}</a></span>`}
    <div class="masthead__meta">
      <span><b>${String(facts.totals.sessions)}</b> ${facts.totals.sessions === 1 ? 'session' : 'sessions'}</span>
      <span><b>${String(facts.totals.captured)}</b> captured</span>
      <span><b>${String(facts.totals.routes)}</b> pages</span>
      <span><b>${String(facts.components.length)}</b> components</span>
      ${facts.totals.failed === 0 ? '' : `<span><b>${String(facts.totals.failed)}</b> failed</span>`}
    </div>
  </div>
  <nav class="pnav" aria-label="Sections">
    ${SECTIONS.map((section) => `<a href="#${section.id}">${escapeHtml(section.label)}</a>`).join('\n    ')}
  </nav>
</header>

<main class="pmain">
${overviewSection(facts)}
${sessionsSection(facts)}
${pagesSection(facts)}
${componentsSection(facts)}
${motionSection(facts)}
${valuesSection(facts)}
${filesSection(facts)}
${promptSection(facts, prompt)}
</main>

<footer class="footer">
  Generated ${escapeHtml(facts.generatedAt)} by UI Atlas · project <code>${escapeHtml(facts.project)}</code> ·
  rebuild with <code>ui-atlas project ${escapeHtml(facts.project)}</code>.
  This page is read-only and contains no authentication material.
</footer>

<script>${COPY_SCRIPT}</script>
</body>
</html>
`;
}

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

function overviewSection(facts: ProjectFacts): string {
  const site = facts.manifest?.site;
  const rows: Array<[string, string]> = [];
  if (site !== undefined) {
    rows.push(['Site', site.origin]);
    rows.push(['First opened at', site.entryUrl]);
  }
  if (facts.manifest?.lastUrl !== undefined) rows.push(['Last opened at', facts.manifest.lastUrl]);
  if (facts.manifest?.createdAt !== undefined) rows.push(['Project created', facts.manifest.createdAt]);
  rows.push(['Captures with a file', String(facts.totals.files)]);
  rows.push(['Skipped', String(facts.totals.skipped)]);
  rows.push([
    'Export',
    facts.exportPlan.entries.length === 0
      ? 'nothing to export yet'
      : `${String(facts.exportPlan.entries.length)} files — write them with \`ui-atlas export ${facts.project}\``,
  ]);
  if (facts.tokensFrom !== undefined) rows.push(['Style scan from session', facts.tokensFrom]);

  const notices = facts.warnings
    .map((warning) => `<p class="note note--warn">${escapeHtml(warning)}</p>`)
    .join('\n    ');

  const empty =
    facts.totals.sessions === 0
      ? '<p class="note note--info">No sessions have been recorded for this project yet.</p>'
      : '';

  return `<section id="overview" class="psection">
  <h2>Overview</h2>
  ${empty}
  ${notices}
  <table class="ptable">
    <tbody>
      ${rows.map(([label, value]) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('\n      ')}
    </tbody>
  </table>
</section>`;
}

function sessionsSection(facts: ProjectFacts): string {
  if (facts.sessions.length === 0) {
    return emptySection('sessions', 'Sessions', 'Nothing has been captured in this project yet.');
  }

  const rows = facts.sessions
    .map((session) => {
      const when = session.startedAt ?? '—';
      const status = session.open
        ? '<span class="pill pill--warn">open</span>'
        : '<span class="pill pill--ok">finished</span>';
      const links = [
        `<a href="${escapeHtml(encodeURI(session.id))}/">folder</a>`,
        session.hasReport
          ? `<a href="${escapeHtml(encodeURI(session.id))}/report/index.html">report</a>`
          : '<span class="muted">no report</span>',
      ].join(' · ');
      const routes =
        session.routes.length === 0 ? '<span class="muted">—</span>' : escapeHtml(session.routes.join(', '));

      return `<tr>
        <td><code>${escapeHtml(session.id)}</code><br>${status}</td>
        <td>${escapeHtml(when)}</td>
        <td><code>${escapeHtml(session.command)}</code></td>
        <td class="num">${String(session.captured)}</td>
        <td class="num">${session.failed === 0 ? '<span class="muted">0</span>' : String(session.failed)}</td>
        <td>${routes}</td>
        <td>${links}</td>
      </tr>`;
    })
    .join('\n      ');

  return `<section id="sessions" class="psection">
  <h2>Sessions</h2>
  <p class="lede">Each session is one sitting in front of this site. Resume one from the launcher, or with
  <code>ui-atlas inspect &lt;url&gt; --project ${escapeHtml(facts.project)} --resume &lt;session&gt;</code>.</p>
  <table class="ptable ptable--grid">
    <thead><tr><th>Session</th><th>Started</th><th>Command</th><th class="num">Captured</th><th class="num">Failed</th><th>Pages</th><th></th></tr></thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</section>`;
}

function pagesSection(facts: ProjectFacts): string {
  if (facts.routes.length === 0) {
    return emptySection('pages', 'Pages', 'No pages have been visited in this project yet.');
  }

  const rows = facts.routes
    .map(
      (route) => `<tr>
        <td><code>${escapeHtml(route.path)}</code></td>
        <td>${route.title === undefined ? '<span class="muted">—</span>' : escapeHtml(route.title)}</td>
        <td class="num">${String(route.captures)}</td>
        <td class="num">${String(route.sessionIds.length)}</td>
        <td><a href="${escapeHtml(encodeURI(route.url))}">${escapeHtml(route.url)}</a></td>
      </tr>`,
    )
    .join('\n      ');

  const viewports = facts.viewports
    .map(
      (viewport) =>
        `<li><b>${escapeHtml(viewport.label)}</b> — ${String(viewport.width)}×${String(viewport.height)}` +
        `${viewport.mobile ? ' <span class="pill">device emulation</span>' : ''} · ${String(viewport.captures)} captures</li>`,
    )
    .join('\n      ');

  return `<section id="pages" class="psection">
  <h2>Pages</h2>
  <table class="ptable ptable--grid">
    <thead><tr><th>Route</th><th>Title</th><th class="num">Captures</th><th class="num">Sessions</th><th>URL</th></tr></thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  ${facts.viewports.length === 0 ? '' : `<h3>Widths captured</h3>\n  <ul class="plist">\n      ${viewports}\n  </ul>`}
</section>`;
}

function componentsSection(facts: ProjectFacts): string {
  if (facts.components.length === 0) {
    return emptySection(
      'components',
      'Components',
      'No elements have been captured yet. Select one in the inspector and capture it with its states.',
    );
  }

  const cards = facts.components
    .map((component) => {
      const name =
        component.label === undefined
          ? escapeHtml(component.subject)
          : `${escapeHtml(component.subject)} <span class="muted">“${escapeHtml(component.label)}”</span>`;
      const thumb =
        component.sampleFile === undefined
          ? '<div class="pcard__thumb pcard__thumb--none">no image</div>'
          : `<a class="pcard__thumb" href="${escapeHtml(encodeURI(component.sampleFile))}">` +
            `<img src="${escapeHtml(encodeURI(component.sampleFile))}" alt="" loading="lazy"></a>`;
      const states = component.states
        .map((state) => `<span class="pill">${escapeHtml(state)}</span>`)
        .join(' ');

      return `<li class="pcard">
        ${thumb}
        <div class="pcard__body">
          <h3>${name}</h3>
          <div class="pcard__states">${states}</div>
          <p class="muted">${String(component.captures)} captures · ${escapeHtml(component.routes.join(', '))}</p>
        </div>
      </li>`;
    })
    .join('\n    ');

  return `<section id="components" class="psection">
  <h2>Components</h2>
  <p class="lede">Grouped by what the element is and what it is called. The states listed are the ones actually captured — a state that is missing here was never observed.</p>
  <ul class="pcards">
    ${cards}
  </ul>
</section>`;
}

function motionSection(facts: ProjectFacts): string {
  if (facts.motion.length === 0) {
    return emptySection('motion', 'Motion', 'Nothing moving has been captured in this project yet.');
  }

  const rows = facts.motion
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.name)}</td>
        <td><span class="pill">${escapeHtml(item.kind)}</span></td>
        <td><code>${escapeHtml(item.route)}</code></td>
        <td class="num">${String(item.frames)}</td>
        <td class="num">${item.durationMs === undefined ? '<span class="muted">—</span>' : `${String(Math.round(item.durationMs))}ms`}</td>
      </tr>`,
    )
    .join('\n      ');

  return `<section id="motion" class="psection">
  <h2>Motion</h2>
  <table class="ptable ptable--grid">
    <thead><tr><th>Animation</th><th>Kind</th><th>Route</th><th class="num">Files</th><th class="num">Duration</th></tr></thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</section>`;
}

const TOKEN_GROUP_LABELS: Array<[keyof ProjectFacts['tokens'], string]> = [
  ['color', 'Colour'],
  ['background', 'Background'],
  ['border', 'Border'],
  ['typography', 'Typography'],
  ['spacing', 'Spacing'],
  ['radius', 'Radius'],
  ['shadow', 'Shadow'],
];

function valuesSection(facts: ProjectFacts): string {
  const groups = TOKEN_GROUP_LABELS.filter(([key]) => (facts.tokens[key] ?? []).length > 0);
  if (groups.length === 0) {
    return emptySection(
      'values',
      'Observed values',
      'No style scan has been run for this project. `ui-atlas tokens <url> --project ' +
        facts.project +
        '` records the computed values, and they appear here and in the prompt afterwards.',
    );
  }

  const blocks = groups
    .map(([key, label]) => {
      const items = facts.tokens[key] ?? [];
      return `<div class="pvalues">
        <h3>${escapeHtml(label)}</h3>
        <ul class="pswatches">
          ${items.map((token) => swatch(key, token)).join('\n          ')}
        </ul>
      </div>`;
    })
    .join('\n    ');

  return `<section id="values" class="psection">
  <h2>Observed values</h2>
  <p class="lede">Counted from the live site's computed styles${facts.tokensFrom === undefined ? '' : ` in session <code>${escapeHtml(facts.tokensFrom)}</code>`}. Candidates, not tokens — the number is how many elements carried the value.</p>
  <div class="pvalue-grid">
    ${blocks}
  </div>
</section>`;
}

/** `#2563eb`, `rgb(37, 99, 235)`, `hsl(...)` — and nothing else. */
const COLOUR_VALUE = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([0-9a-z%.,\s/-]*\))$/i;

function swatch(category: string, token: TokenFact): string {
  const isColour = category === 'color' || category === 'background' || category === 'border';
  // The only site-derived value on this page that goes anywhere near a style
  // attribute. It is matched against a colour shape first rather than escaped
  // and trusted: a value that is not a colour paints nothing, which is the
  // right outcome for a swatch anyway.
  const chip =
    isColour && COLOUR_VALUE.test(token.value)
      ? `<span class="pswatch__chip" style="background:${escapeHtml(token.value)}"></span>`
      : '';
  return `<li class="pswatch">${chip}<code>${escapeHtml(token.value)}</code><span class="muted">${String(token.count)}</span></li>`;
}

function filesSection(facts: ProjectFacts): string {
  const entries = facts.exportPlan.entries;
  if (entries.length === 0 && facts.exportPlan.skipped.length === 0) {
    return emptySection('files', 'Files', 'Nothing has been written for this project yet.');
  }

  const rows = entries.map(fileRow).join('\n      ');

  const skipped =
    facts.exportPlan.skipped.length === 0
      ? ''
      : `<h3>Not captured</h3>
  <p class="lede">Attempted and produced no file. Listed so the gap is visible.</p>
  <ul class="plist">
    ${facts.exportPlan.skipped
      .map((item) => `<li>${escapeHtml(item.description)} — <span class="muted">${escapeHtml(item.reason)}</span></li>`)
      .join('\n    ')}
  </ul>`;

  return `<section id="files" class="psection">
  <h2>Files</h2>
  <p class="lede">Everything this project has written, with the name each file would be given on export.
  Exporting copies these into <code>exports/</code> under the export name; the originals are never renamed.</p>
  <table class="ptable ptable--grid ptable--files">
    <thead><tr><th class="num">#</th><th>Export name</th><th>What it is</th><th>Current file</th></tr></thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  ${skipped}
</section>`;
}

function fileRow(entry: ExportPlanEntry): string {
  return `<tr>
        <td class="num">${String(entry.index)}</td>
        <td><code>${escapeHtml(entry.name)}</code> <span class="pill">${escapeHtml(entry.group)}</span></td>
        <td>${escapeHtml(entry.description)}</td>
        <td><a href="${escapeHtml(encodeURI(entry.source))}"><code>${escapeHtml(entry.source)}</code></a></td>
      </tr>`;
}

/**
 * The half of the handover that is not text.
 *
 * This page is opened from `file://`. It cannot reach Finder, cannot build an
 * archive, and cannot run a command — so it offers what a static page actually
 * can, and names the command for the rest rather than drawing a button that
 * would do nothing.
 *
 * The folder leads because loose images are what a design tool can read; a zip
 * of PNGs is a file it has to be talked out of. The archive is for sending the
 * set somewhere, which is a different job and gets a different button.
 */
function attachmentsCard(facts: ProjectFacts): string {
  const { attachments } = facts;
  const command = `ui-atlas export ${facts.project} --open`;

  if (attachments.fileCount === 0) {
    return `<div class="pattach">
    <h3>Attachments</h3>
    <p class="muted">Nothing has been captured to attach yet.</p>
  </div>`;
  }

  if (!attachments.folderExists) {
    return `<div class="pattach">
    <h3>Attachments</h3>
    <p>${String(attachments.fileCount)} images · ${bytes(attachments.totalBytes)} — not written out yet.
    Run this to put them in one folder, named for reading in order, and reveal it:</p>
    <pre id="attach-command" class="pcommand">${escapeHtml(command)}</pre>
    <div class="pattach__actions">
      <button type="button" class="pcopy" data-copy="attach-command">Copy command</button>
    </div>
  </div>`;
  }

  const zip = attachments.zipExists
    ? `<a class="pbutton" href="${escapeHtml(encodeURI(attachments.zipHref))}" download>Download the zip` +
      `${attachments.zipBytes === undefined ? '' : ` <span class="pbutton__note">${bytes(attachments.zipBytes)}</span>`}</a>`
    : '';

  return `<div class="pattach">
    <h3>Attachments</h3>
    <p>${String(attachments.fileCount)} images · ${bytes(attachments.totalBytes)}, named to sort into reading order.
    Attach them alongside Stage 1.</p>
    <div class="pattach__actions">
      <a class="pbutton pbutton--primary" href="${escapeHtml(encodeURI(attachments.folderHref))}">Open the folder</a>
      ${zip}
    </div>
    <p class="muted">Drag the images out of the folder — a design tool can read a PNG and cannot read a zip.
    The zip is for sending the set somewhere. To reveal the folder in Finder:
    <code>${escapeHtml(command)}</code></p>
  </div>`;
}

function bytes(value: number): string {
  if (value === 0) return '0 kB';
  if (value < 1_000_000) return `${String(Math.max(1, Math.round(value / 1000)))} kB`;
  return `${(value / 1_000_000).toFixed(1)} MB`;
}

function promptSection(facts: ProjectFacts, prompt: BuiltPrompt): string {
  if (prompt.stages.length === 0) {
    return emptySection('prompt', 'Design prompt', 'There is nothing captured to build a prompt from yet.');
  }

  const stages = prompt.stages
    .map(
      (stage) => `<article class="pstage" id="prompt-${escapeHtml(stage.id)}">
      <div class="pstage__head">
        <div>
          <h3>${escapeHtml(stage.title)}</h3>
          <p class="muted">${escapeHtml(stage.intent)}</p>
        </div>
        <button type="button" class="pcopy" data-copy="stage-${escapeHtml(stage.id)}">Copy</button>
      </div>
      <pre id="stage-${escapeHtml(stage.id)}" class="pprompt">${escapeHtml(stage.text)}</pre>
    </article>`,
    )
    .join('\n    ');

  const omitted =
    prompt.omitted.length === 0
      ? ''
      : `<p class="note note--info">Not included: ${prompt.omitted
          .map((stage) => `${escapeHtml(stage.title)} (${escapeHtml(stage.reason)})`)
          .join('; ')}.</p>`;

  return `<section id="prompt" class="psection">
  <div class="pstage__head">
    <h2>Design prompt</h2>
    <button type="button" class="pcopy pcopy--all" data-copy="stage-all">Copy all stages</button>
  </div>
  <p class="lede">Built from what this project actually captured. Run the stages in order — each one assumes the previous one's output.</p>
  ${attachmentsCard(facts)}
  ${omitted}
  <div class="pstages">
    ${stages}
  </div>
  <pre id="stage-all" class="pprompt pprompt--hidden" aria-hidden="true">${escapeHtml(prompt.combined)}</pre>
</section>`;
}

function emptySection(id: string, title: string, message: string): string {
  return `<section id="${id}" class="psection">
  <h2>${escapeHtml(title)}</h2>
  <p class="note note--info">${escapeHtml(message)}</p>
</section>`;
}

/**
 * The only script on the page.
 *
 * It reads `textContent` from a `<pre>` and puts it on the clipboard. It never
 * writes markup, never touches the network, and does nothing at all if the
 * clipboard is unavailable — in which case the text is still selectable, which
 * is what it would have been without any script.
 */
const COPY_SCRIPT = `
document.addEventListener('click', function (event) {
  var button = event.target.closest('.pcopy');
  if (!button) return;
  var source = document.getElementById(button.getAttribute('data-copy'));
  if (!source) return;
  var text = source.textContent || '';
  var restore = function (label) {
    button.textContent = label;
    setTimeout(function () { button.textContent = button.dataset.label || 'Copy'; }, 1600);
  };
  button.dataset.label = button.dataset.label || button.textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { restore('Copied'); }, function () { restore('Press ⌘C'); });
    return;
  }
  var range = document.createRange();
  range.selectNodeContents(source);
  var selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  restore('Press ⌘C');
});
`;
