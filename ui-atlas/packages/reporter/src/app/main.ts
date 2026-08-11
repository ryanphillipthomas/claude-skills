import type { ComponentGroup, ReportCapture, ReportModel } from '../model.js';
import { groupComponents, groupDuplicates } from '../model.js';
import { badge, clear, copyText, el, formatBytes, formatTime, pair } from './dom.js';

/* -------------------------------------------------------------------------- */
/* State                                                                       */
/* -------------------------------------------------------------------------- */

type TabId = 'components' | 'gallery' | 'duplicates' | 'issues' | 'pages';

interface Filters {
  routeKeys: Set<string>;
  viewports: Set<string>;
  states: Set<string>;
  provenances: Set<string>;
  statuses: Set<string>;
  roles: Set<string>;
  warningsOnly: boolean;
  search: string;
}

const model = readModel();
const filters: Filters = {
  routeKeys: new Set(),
  viewports: new Set(),
  states: new Set(),
  provenances: new Set(),
  statuses: new Set(),
  roles: new Set(),
  warningsOnly: false,
  search: '',
};
let tab: TabId = 'components';
let selectedId: string | undefined;

function readModel(): ReportModel {
  const holder = document.getElementById('ui-atlas-data');
  if (holder === null) throw new Error('report data block is missing');
  return JSON.parse(holder.textContent ?? '{}') as ReportModel;
}

/* -------------------------------------------------------------------------- */
/* Filtering                                                                   */
/* -------------------------------------------------------------------------- */

function matchesFilters(capture: ReportCapture): boolean {
  if (filters.routeKeys.size > 0 && !filters.routeKeys.has(capture.routeKey)) return false;
  if (filters.viewports.size > 0 && !filters.viewports.has(capture.viewportLabel)) return false;
  if (filters.states.size > 0 && !filters.states.has(capture.stateName)) return false;
  if (filters.provenances.size > 0 && !filters.provenances.has(capture.provenance)) return false;
  if (filters.statuses.size > 0 && !filters.statuses.has(capture.status)) return false;
  if (filters.roles.size > 0) {
    const role = capture.element?.role;
    if (role === undefined || !filters.roles.has(role)) return false;
  }
  if (filters.warningsOnly && capture.warnings.length === 0 && capture.error === undefined) return false;

  if (filters.search.length > 0) {
    const needle = filters.search.toLowerCase();
    const haystack = [
      capture.element?.accessibleName,
      capture.element?.textExcerpt,
      capture.element?.tagName,
      capture.element?.role,
      capture.element?.chosen.value,
      capture.routeKey,
      capture.finalUrl,
      capture.stateName,
      capture.viewportLabel,
      capture.error?.message,
    ]
      .filter((value): value is string => value !== undefined)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function filteredCaptures(): ReportCapture[] {
  return model.captures.filter(matchesFilters);
}

function captureById(id: string): ReportCapture | undefined {
  return model.captures.find((capture) => capture.id === id);
}

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

function statusBadges(capture: ReportCapture): HTMLElement[] {
  const out = [badge(capture.status, capture.status)];
  out.push(
    badge(
      capture.provenance,
      capture.provenance,
      capture.provenance === 'forced'
        ? 'Synthesised by the tool. This state was not observed on the site.'
        : (capture.verification ?? ''),
    ),
  );
  if (!capture.verified && capture.status === 'captured') {
    out.push(badge('unverified', 'warn', 'The state was applied but could not be confirmed.'));
  }
  if (capture.warnings.length > 0) {
    out.push(badge(`${String(capture.warnings.length)} ⚠`, 'warn', capture.warnings.join('\n')));
  }
  return out;
}

/** A thumbnail, or an honest explanation of why there is no image. */
function shot(capture: ReportCapture, className: string, playable = false): HTMLElement {
  if (capture.image !== undefined) {
    const image = el('img', {
      attrs: {
        src: capture.image.src,
        alt: `${capture.stateName} at ${capture.viewportLabel}`,
        loading: 'lazy',
        decoding: 'async',
      },
    });
    return el('div', { className, children: [image] });
  }

  // A recording has no still to show, and is not a failure for lacking one.
  if (capture.video !== undefined) {
    const video = el('video', {
      attrs: {
        src: capture.video.src,
        muted: '',
        loop: '',
        // A card and a matrix cell are both buttons that open the detail panel.
        // Player controls inside one would swallow that click, so they only
        // appear where the video is the thing you came to look at.
        ...(playable ? { controls: '', preload: 'metadata' } : { preload: 'metadata' }),
      },
    });
    return el('div', { className, children: [video] });
  }

  const reason = capture.error?.code ?? 'no image';
  const explanation =
    capture.error?.code === 'locator.hidden'
      ? 'hidden at this viewport'
      : capture.error?.code === 'locator.not-found'
        ? 'not present at this viewport'
        : capture.error?.code === 'locator.ambiguous'
          ? 'locator matched several elements'
          : (capture.error?.message ?? 'nothing was captured');

  return el('div', {
    className: `${className} shot--empty`,
    children: [el('div', { text: explanation }), el('code', { text: reason })],
  });
}

function captureCard(capture: ReportCapture): HTMLElement {
  const title =
    capture.element?.accessibleName ??
    capture.element?.textExcerpt ??
    (capture.element === undefined ? `${capture.kind} · ${capture.routeKey}` : `<${capture.element.tagName}>`);

  const card = el('button', {
    className: 'card',
    attrs: { type: 'button', 'data-capture': capture.id },
    children: [
      shot(capture, 'shot'),
      el('div', {
        className: 'card__body',
        children: [
          el('div', { className: 'card__title', text: title, title }),
          el('div', {
            className: 'card__sub',
            text: `${capture.stateName} · ${capture.viewportLabel} · ${capture.routeKey}`,
          }),
          el('div', { className: 'card__badges', children: statusBadges(capture) }),
        ],
      }),
    ],
  });
  if (selectedId === capture.id) card.setAttribute('aria-current', 'true');
  card.addEventListener('click', () => select(capture.id));
  return card;
}

/* -------------------------------------------------------------------------- */
/* Views                                                                       */
/* -------------------------------------------------------------------------- */

function renderComponents(host: HTMLElement, captures: ReportCapture[]): void {
  const groups = groupComponents(captures);
  if (groups.length === 0) {
    host.append(emptyState('No captures match these filters.'));
    return;
  }
  for (const group of groups) host.append(componentSection(group));
}

function componentSection(group: ComponentGroup): HTMLElement {
  const counts: HTMLElement[] = [];
  if (group.capturedCount > 0) counts.push(badge(`${String(group.capturedCount)} captured`, 'captured'));
  if (group.skippedCount > 0) counts.push(badge(`${String(group.skippedCount)} skipped`, 'skipped'));
  if (group.failedCount > 0) counts.push(badge(`${String(group.failedCount)} failed`, 'failed'));

  const head = el('div', {
    className: 'component__head',
    children: [
      el('div', { className: 'component__label', text: group.label }),
      el('div', { className: 'component__sub', text: group.sublabel }),
      el('div', { className: 'component__counts', children: counts }),
    ],
  });

  // Whichever dimension has more members becomes the columns, so the thing you
  // are comparing always ends up side by side: five viewports of one state read
  // across, and five states at one viewport read across too.
  const byViewport = group.viewports.length >= group.states.length;
  const columns = byViewport ? group.viewports : group.states;
  const rows = byViewport ? group.states : group.viewports;

  const cellFor = (row: string, column: string): ReportCapture | undefined => {
    const viewport = byViewport ? column : row;
    const state = byViewport ? row : column;
    return group.cells.find((cell) => cell.viewport === viewport && cell.state === state)?.capture;
  };

  const headRow = el('tr', {
    children: [el('th', { text: byViewport ? 'state' : 'viewport' })],
  });
  for (const column of columns) {
    const sample = byViewport
      ? group.cells.find((cell) => cell.viewport === column)?.capture
      : undefined;
    headRow.append(
      el('th', {
        children: [
          document.createTextNode(column),
          sample === undefined
            ? undefined
            : el('small', {
                text:
                  `${String(sample.viewportWidth)}x${String(sample.viewportHeight)}` +
                  (sample.deviceScaleFactor === 1 ? '' : ` @${String(sample.deviceScaleFactor)}x`) +
                  (sample.emulatedMobile ? ' mobile' : ''),
              }),
        ],
      }),
    );
  }

  const body = el('tbody');
  for (const row of rows) {
    const tableRow = el('tr', {
      children: [el('th', { attrs: { scope: 'row' }, text: row })],
    });
    for (const column of columns) tableRow.append(matrixCell(cellFor(row, column)));
    body.append(tableRow);
  }

  const table = el('table', {
    className: 'matrix',
    children: [el('thead', { children: [headRow] }), body],
  });

  return el('section', {
    className: 'component',
    children: [head, el('div', { className: 'matrix-scroll', children: [table] })],
  });
}

function matrixCell(capture: ReportCapture | undefined): HTMLElement {
  if (capture === undefined) {
    return el('td', {
      className: 'cell',
      children: [el('div', { className: 'cell--empty', text: 'not attempted' })],
    });
  }

  const button = el('button', {
    className: 'cell__button',
    attrs: { type: 'button', 'data-capture': capture.id },
    children: [
      shot(capture, 'shot cell__shot'),
      el('div', { className: 'cell__foot', children: statusBadges(capture) }),
    ],
  });
  if (selectedId === capture.id) button.setAttribute('aria-current', 'true');
  button.addEventListener('click', () => select(capture.id));
  return el('td', { className: 'cell', children: [button] });
}

function renderGallery(host: HTMLElement, captures: ReportCapture[]): void {
  if (captures.length === 0) {
    host.append(emptyState('No captures match these filters.'));
    return;
  }
  const grid = el('div', { className: 'grid' });
  for (const capture of captures) grid.append(captureCard(capture));
  host.append(grid);
}

function renderDuplicates(host: HTMLElement, captures: ReportCapture[]): void {
  const groups = groupDuplicates(captures);
  if (groups.length === 0) {
    host.append(
      emptyState(
        'No two captures in this selection share an image. Identical images usually mean a state that did not change anything.',
      ),
    );
    return;
  }
  for (const group of groups) {
    const members = group.captureIds
      .map((id) => captures.find((capture) => capture.id === id))
      .filter((capture): capture is ReportCapture => capture !== undefined);

    const grid = el('div', { className: 'grid' });
    for (const capture of members) grid.append(captureCard(capture));

    host.append(
      el('section', {
        className: 'component',
        children: [
          el('div', {
            className: 'component__head',
            children: [
              el('div', {
                className: 'component__label',
                text: `${String(members.length)} identical images`,
              }),
              el('div', { className: 'component__sub', text: group.sha256.slice(0, 16) }),
            ],
          }),
          el('div', { className: 'main', children: [grid] }),
        ],
      }),
    );
  }
}

function renderIssues(host: HTMLElement, captures: ReportCapture[]): void {
  const rows = captures.filter((capture) => capture.status !== 'captured' || capture.warnings.length > 0);
  if (rows.length === 0) {
    host.append(emptyState('Nothing failed, nothing was skipped, and nothing raised a warning.'));
    return;
  }

  const body = el('tbody');
  for (const capture of rows) {
    const label =
      capture.element?.accessibleName ?? capture.element?.tagName ?? `${capture.kind} · ${capture.routeKey}`;
    const open = el('button', { className: 'linkish', attrs: { type: 'button' }, text: label });
    open.addEventListener('click', () => select(capture.id));

    body.append(
      el('tr', {
        children: [
          el('td', { children: [badge(capture.status, capture.status)] }),
          el('td', { children: [open] }),
          el('td', { text: capture.stateName }),
          el('td', { text: capture.viewportLabel }),
          el('td', { className: 'mono', text: capture.error?.code ?? '—' }),
          el('td', {
            text: capture.error?.message ?? capture.warnings[0] ?? '',
            title: capture.warnings.join('\n'),
          }),
        ],
      }),
    );
  }

  const head = el('thead', {
    children: [
      el('tr', {
        children: ['status', 'component', 'state', 'viewport', 'code', 'detail'].map((text) =>
          el('th', { text }),
        ),
      }),
    ],
  });
  host.append(el('table', { className: 'table', children: [head, body] }));
}

function renderPages(host: HTMLElement): void {
  if (model.pages.length === 0) {
    host.append(emptyState('No page visits were recorded in this run.'));
    return;
  }
  const body = el('tbody');
  for (const page of model.pages) {
    body.append(
      el('tr', {
        children: [
          el('td', { text: page.title ?? '—' }),
          el('td', { className: 'mono', text: page.finalUrl }),
          el('td', { text: page.httpStatus === undefined ? '—' : String(page.httpStatus) }),
          el('td', { text: formatTime(page.visitedAt) }),
          el('td', {
            text: page.error?.message ?? (page.warnings.length > 0 ? page.warnings[0] : '') ?? '',
            title: page.warnings.join('\n'),
          }),
        ],
      }),
    );
  }
  const head = el('thead', {
    children: [
      el('tr', {
        children: ['title', 'url', 'status', 'visited', 'notes'].map((text) => el('th', { text })),
      }),
    ],
  });
  host.append(el('table', { className: 'table', children: [head, body] }));
}

function emptyState(message: string): HTMLElement {
  return el('div', {
    className: 'empty-state',
    children: [el('h2', { text: 'Nothing to show' }), el('p', { text: message })],
  });
}

/* -------------------------------------------------------------------------- */
/* Detail panel                                                                */
/* -------------------------------------------------------------------------- */

function section(title: string, ...children: Array<Node | undefined>): HTMLElement {
  return el('div', {
    className: 'section',
    children: [el('h3', { text: title }), ...children],
  });
}

function isColour(value: string): boolean {
  return /^(#|rgba?\(|hsla?\()/i.test(value.trim());
}

function colourCell(value: string): HTMLElement {
  const cell = el('td', { className: 'mono' });
  if (isColour(value)) {
    const swatch = el('span', { className: 'swatch' });
    swatch.style.background = value;
    cell.append(swatch);
  }
  cell.append(document.createTextNode(value));
  return cell;
}

function renderDetail(capture: ReportCapture): HTMLElement {
  const panel = el('aside', { className: 'detail', attrs: { 'aria-label': 'Capture detail' } });

  const close = el('button', {
    className: 'detail__close',
    text: '×',
    attrs: { type: 'button', 'aria-label': 'Close detail' },
  });
  close.addEventListener('click', () => select(undefined));

  const title =
    capture.element?.accessibleName ??
    capture.element?.textExcerpt ??
    (capture.element === undefined ? capture.kind : `<${capture.element.tagName}>`);

  panel.append(
    el('div', {
      className: 'detail__head',
      children: [
        el('div', {
          children: [
            el('h2', { className: 'detail__title', text: title }),
            el('div', { className: 'card__badges', children: statusBadges(capture) }),
          ],
        }),
        close,
      ],
    }),
  );

  const image = shot(capture, 'shot detail__shot', true);
  const img = image.querySelector('img');
  if (img !== null) {
    img.addEventListener('click', () => {
      image.classList.toggle('detail__shot--actual');
    });
    img.title = 'Click to toggle actual pixel size';
  }
  panel.append(image);

  /* --- overview ---------------------------------------------------------- */
  const overview = el('dl', { className: 'kv' });
  overview.append(pair('state', `${capture.stateName} (${capture.provenance})`));
  if (capture.verification !== undefined) overview.append(pair('evidence', capture.verification));
  overview.append(pair('kind', capture.kind));
  overview.append(
    pair(
      'viewport',
      `${capture.viewportLabel} · ${String(capture.viewportWidth)}×${String(capture.viewportHeight)}` +
        ` @${String(capture.deviceScaleFactor)}x · ${capture.emulatedMobile ? 'mobile emulation' : 'desktop'}`,
    ),
  );
  overview.append(pair('route', capture.routeKey, true));
  overview.append(pair('url', capture.finalUrl, true));
  overview.append(pair('captured', formatTime(capture.capturedAt)));
  overview.append(pair('took', `${String(Math.round(capture.durationMs))} ms`));
  if (capture.setKind !== undefined) {
    overview.append(pair('set', `${capture.setKind} · ${capture.setMember ?? ''}`));
  }
  if (capture.image !== undefined) {
    overview.append(
      pair(
        'image',
        `${String(capture.image.width)}×${String(capture.image.height)} · ${formatBytes(capture.image.byteLength)}`,
      ),
    );
    overview.append(pair('sha256', capture.image.sha256, true));
  }
  if (capture.video !== undefined) {
    overview.append(
      pair(
        'recording',
        `${String(Math.round(capture.video.durationMs))} ms · ` +
          `${formatBytes(capture.video.byteLength)}` +
          (capture.video.truncated ? ' · cut short by the budget' : ''),
      ),
    );
    // The file holds the page load the recording needed, so the moment the
    // motion starts is not the start of the file.
    overview.append(pair('starts at', `${String(Math.round(capture.video.leadInMs))} ms in`));
    overview.append(pair('of', capture.video.subjects.join('; '), true));
  }
  panel.append(section('Overview', overview));

  if (capture.video !== undefined && capture.video.limitations.length > 0) {
    panel.append(
      section(
        'What this recording does not promise',
        el('ul', {
          className: 'notelist',
          children: capture.video.limitations.map((text) => el('li', { text })),
        }),
      ),
    );
  }

  /* --- error / warnings -------------------------------------------------- */
  if (capture.error !== undefined) {
    panel.append(
      section(
        capture.status === 'skipped' ? 'Why this was skipped' : 'Why this failed',
        el('div', {
          className: capture.status === 'skipped' ? 'note note--warn' : 'note note--bad',
          text: `${capture.error.code} — ${capture.error.message}`,
        }),
      ),
    );
  }
  if (capture.warnings.length > 0) {
    const list = el('ul', { className: 'notelist' });
    for (const warning of capture.warnings) list.append(el('li', { text: warning }));
    panel.append(section('Warnings', list));
  }

  /* --- element ----------------------------------------------------------- */
  if (capture.element !== undefined) {
    const element = capture.element;
    const details = el('dl', { className: 'kv' });
    details.append(pair('tag', element.tagName, true));
    details.append(pair('role', element.role ?? '—'));
    details.append(pair('name', element.accessibleName ?? '—'));
    if (element.textExcerpt !== undefined) details.append(pair('text', element.textExcerpt));
    details.append(pair('fingerprint', element.fingerprint.slice(0, 24), true));
    if (element.frameDepth > 0) {
      details.append(
        pair('frame', `depth ${String(element.frameDepth)}${element.crossOriginFrame ? ' · cross-origin' : ''}`),
      );
    }
    if (element.shadowHostPath !== undefined && element.shadowHostPath.length > 0) {
      details.append(pair('shadow host', element.shadowHostPath.join(' → '), true));
    }
    panel.append(section('Element', details));

    const body = el('tbody');
    for (const candidate of element.candidates) {
      const chosen =
        candidate.type === element.chosen.type && candidate.value === element.chosen.value;
      const scoreClass =
        candidate.score === 0 ? 'score score--zero' : candidate.score >= 70 ? 'score score--high' : 'score score--low';

      const valueCell = el('td', { className: 'mono', text: candidate.value });
      if (chosen) {
        const copy = el('button', { className: 'copy', text: 'copy', attrs: { type: 'button' } });
        copy.addEventListener('click', () => {
          copy.textContent = copyText(candidate.value) ? 'copied' : 'select it';
          setTimeout(() => {
            copy.textContent = 'copy';
          }, 1200);
        });
        valueCell.append(copy);
      }

      body.append(
        el('tr', {
          attrs: chosen ? { 'data-chosen': 'true' } : {},
          children: [
            el('td', { text: candidate.type }),
            valueCell,
            el('td', { className: scoreClass, text: String(candidate.score) }),
            el('td', { text: String(candidate.uniquenessCount) }),
          ],
          title: candidate.reasons.join('\n'),
        }),
      );
    }
    const head = el('thead', {
      children: [
        el('tr', {
          children: ['locator', 'value', 'score', 'matches'].map((text) => el('th', { text })),
        }),
      ],
    });
    panel.append(
      section(
        'Locator candidates',
        el('table', { className: 'table', children: [head, body] }),
        el('p', {
          className: 'notelist',
          text: 'Hover a row to see why it scored the way it did. The highlighted row is the one used.',
        }),
      ),
    );
  }

  /* --- style delta ------------------------------------------------------- */
  const changed = Object.entries(capture.styleDelta?.changed ?? {});
  if (changed.length > 0) {
    const body = el('tbody');
    for (const [property, change] of changed) {
      body.append(
        el('tr', {
          children: [el('td', { text: property }), colourCell(change.from), colourCell(change.to)],
        }),
      );
    }
    const head = el('thead', {
      children: [
        el('tr', { children: ['property', 'before', 'after'].map((text) => el('th', { text })) }),
      ],
    });
    const extras: string[] = [];
    if (capture.styleDelta?.descendantVisibilityChanged === true) extras.push('descendant visibility changed');
    if (capture.styleDelta?.boundsChanged === true) extras.push('bounds changed');
    panel.append(
      section(
        'Computed style delta',
        el('table', { className: 'table', children: [head, body] }),
        extras.length === 0 ? undefined : el('p', { className: 'notelist', text: extras.join(' · ') }),
      ),
    );
  } else if (capture.stateName !== 'default' && capture.status === 'captured') {
    panel.append(
      section(
        'Computed style delta',
        el('div', {
          className: 'note note--warn',
          text: 'Nothing in the watched properties changed for this state.',
        }),
      ),
    );
  }

  /* --- readiness and recipe ---------------------------------------------- */
  if (capture.readiness.checks.length > 0) {
    const body = el('tbody');
    for (const check of capture.readiness.checks) {
      body.append(
        el('tr', {
          children: [
            el('td', { text: check.name }),
            el('td', {
              children: [badge(check.status, check.status === 'passed' ? 'captured' : 'warn')],
            }),
            el('td', { text: `${String(Math.round(check.durationMs))} ms` }),
            el('td', { text: check.detail ?? '' }),
          ],
        }),
      );
    }
    panel.append(
      section(
        'Readiness',
        el('table', { className: 'table', children: [body] }),
        capture.readiness.deadlineExceeded
          ? el('div', {
              className: 'note note--warn',
              text: `The settle deadline of ${String(capture.readiness.deadlineMs)} ms fired; this was captured anyway.`,
            })
          : undefined,
      ),
    );
  }

  if (capture.recipe !== undefined && capture.recipe.length > 0) {
    const list = el('ol', { className: 'notelist' });
    for (const step of capture.recipe) {
      list.append(el('li', { text: step.target === undefined ? step.action : `${step.action} → ${step.target}` }));
    }
    panel.append(section('What the tool did', list));
  }

  return panel;
}

/* -------------------------------------------------------------------------- */
/* Shell                                                                       */
/* -------------------------------------------------------------------------- */

function chipGroup(
  title: string,
  values: string[],
  selected: Set<string>,
  onToggle: () => void,
): HTMLElement | undefined {
  if (values.length === 0) return undefined;
  const list = el('div', { className: 'chiplist' });
  for (const value of values) {
    const chip = el('button', {
      className: 'chip',
      text: value,
      attrs: { type: 'button', 'aria-pressed': String(selected.has(value)) },
    });
    chip.addEventListener('click', () => {
      if (selected.has(value)) selected.delete(value);
      else selected.add(value);
      onToggle();
    });
    list.append(chip);
  }
  return el('div', { className: 'filters__group', children: [el('h3', { text: title }), list] });
}

function renderFilters(host: HTMLElement): void {
  clear(host);
  const rerender = (): void => {
    render();
  };

  const search = el('input', {
    className: 'search',
    attrs: { type: 'search', placeholder: 'Search…  (/)', 'aria-label': 'Search captures' },
  }) as HTMLInputElement;
  search.value = filters.search;
  search.addEventListener('input', () => {
    filters.search = search.value.trim();
    renderMain();
    updateResultBar();
  });
  host.append(el('div', { className: 'filters__group', children: [search] }));

  const appendMaybe = (node: HTMLElement | undefined): void => {
    if (node !== undefined) host.append(node);
  };
  appendMaybe(chipGroup('status', model.facets.statuses, filters.statuses, rerender));
  appendMaybe(chipGroup('state', model.facets.states, filters.states, rerender));
  appendMaybe(chipGroup('provenance', model.facets.provenances, filters.provenances, rerender));
  appendMaybe(chipGroup('viewport', model.facets.viewports, filters.viewports, rerender));
  appendMaybe(chipGroup('route', model.facets.routeKeys, filters.routeKeys, rerender));
  appendMaybe(chipGroup('role', model.facets.roles, filters.roles, rerender));

  const warn = el('button', {
    className: 'chip',
    text: 'has warnings or errors',
    attrs: { type: 'button', 'aria-pressed': String(filters.warningsOnly) },
  });
  warn.addEventListener('click', () => {
    filters.warningsOnly = !filters.warningsOnly;
    rerender();
  });
  host.append(el('div', { className: 'filters__group', children: [warn] }));

  const reset = el('button', { className: 'linkish', text: 'Reset filters', attrs: { type: 'button' } });
  reset.addEventListener('click', () => {
    filters.routeKeys.clear();
    filters.viewports.clear();
    filters.states.clear();
    filters.provenances.clear();
    filters.statuses.clear();
    filters.roles.clear();
    filters.warningsOnly = false;
    filters.search = '';
    rerender();
  });
  host.append(reset);

  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
      event.preventDefault();
      search.focus();
    }
  });
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'components', label: 'Components' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'duplicates', label: 'Duplicates' },
  { id: 'issues', label: 'Issues' },
  { id: 'pages', label: 'Pages' },
];

function renderTabs(host: HTMLElement): void {
  clear(host);
  const captures = filteredCaptures();
  const counts: Record<TabId, number> = {
    components: groupComponents(captures).length,
    gallery: captures.length,
    duplicates: groupDuplicates(captures).length,
    issues: captures.filter((capture) => capture.status !== 'captured' || capture.warnings.length > 0).length,
    pages: model.pages.length,
  };

  for (const entry of TABS) {
    const button = el('button', {
      className: 'tab',
      attrs: { type: 'button', role: 'tab', 'aria-selected': String(tab === entry.id) },
      children: [
        document.createTextNode(entry.label),
        el('span', { className: 'tab__count', text: String(counts[entry.id]) }),
      ],
    });
    button.addEventListener('click', () => {
      tab = entry.id;
      render();
    });
    host.append(button);
  }
}

function updateResultBar(): void {
  const bar = document.getElementById('resultbar');
  if (bar === null) return;
  const shown = filteredCaptures().length;
  bar.textContent =
    shown === model.captures.length
      ? `${String(shown)} captures`
      : `${String(shown)} of ${String(model.captures.length)} captures`;
}

function renderMain(): void {
  const host = document.getElementById('view');
  if (host === null) return;
  clear(host);
  const captures = filteredCaptures();

  if (tab === 'components') renderComponents(host, captures);
  else if (tab === 'gallery') renderGallery(host, captures);
  else if (tab === 'duplicates') renderDuplicates(host, captures);
  else if (tab === 'issues') renderIssues(host, captures);
  else renderPages(host);
}

function select(id: string | undefined): void {
  selectedId = id;
  const existing = document.querySelector('.detail');
  if (existing !== null) existing.remove();

  for (const node of Array.from(document.querySelectorAll('[data-capture]'))) {
    if (node.getAttribute('data-capture') === id) node.setAttribute('aria-current', 'true');
    else node.removeAttribute('aria-current');
  }

  if (id === undefined) return;
  const capture = captureById(id);
  if (capture === undefined) return;
  document.body.append(renderDetail(capture));
}

function render(): void {
  const tabHost = document.getElementById('tabs');
  const filterHost = document.getElementById('filters');
  if (tabHost !== null) renderTabs(tabHost);
  if (filterHost !== null) renderFilters(filterHost);
  renderMain();
  updateResultBar();
  if (selectedId !== undefined) select(selectedId);
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && selectedId !== undefined) select(undefined);
  if (selectedId === undefined) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (document.activeElement?.tagName === 'INPUT') return;

  const captures = filteredCaptures();
  const index = captures.findIndex((capture) => capture.id === selectedId);
  if (index < 0) return;
  const next = captures[index + (event.key === 'ArrowRight' ? 1 : -1)];
  if (next !== undefined) {
    event.preventDefault();
    select(next.id);
  }
});

render();
