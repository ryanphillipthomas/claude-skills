/**
 * Draws `PopoverModel` and decides nothing.
 *
 * Every conditional worth arguing about lives in `popover.ts`, where it can be
 * asserted without a window. What is left here is element creation, which is
 * why this file is long and boring — the good outcome for a view.
 */

import type { LauncherRequest, LauncherSnapshot } from '../ipc.js';
import type {
  FooterItem,
  PopoverBody,
  PopoverModel,
  RunRow,
  StaleBuildNotice,
} from '../popover.js';
import type { LauncherButton, LauncherTone, StageRow } from '../startup.js';

export type Dispatch = (request: LauncherRequest) => void;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Parses a **literal** SVG string. Never called with anything derived from a
 * run, a URL or a log line — the argument is always a constant in this file.
 */
function icon(markup: string): SVGSVGElement {
  const holder = document.createElement('div');
  holder.innerHTML = markup;
  const svg = holder.firstElementChild;
  return svg as SVGSVGElement;
}

const TICK = `<svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true"><circle cx="7.5" cy="7.5" r="6.6" fill="none" stroke="rgba(48,209,88,.45)" stroke-width="1.3"/><path d="M4.4 7.8 L6.5 9.9 L10.7 5.3" fill="none" stroke="#30d158" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SPINNER = `<svg class="spin" width="15" height="15" viewBox="0 0 15 15" aria-hidden="true"><circle cx="7.5" cy="7.5" r="6" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="1.6"/><path d="M7.5 1.5 A6 6 0 0 1 13.5 7.5" fill="none" stroke="#0a84ff" stroke-width="1.6" stroke-linecap="round"/></svg>`;
const CROSS = `<svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true"><circle cx="7.5" cy="7.5" r="6.6" fill="none" stroke="rgba(255,69,58,.45)" stroke-width="1.3"/><path d="M7.5 4 V8.4" stroke="#ff453a" stroke-width="1.7" stroke-linecap="round"/><circle cx="7.5" cy="10.8" r="0.9" fill="#ff453a"/></svg>`;
const SKIPPED = `<svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true"><circle cx="7.5" cy="7.5" r="6.6" fill="none" stroke="rgba(235,235,245,.22)" stroke-width="1.3"/><path d="M4.6 7.5 H10.4" stroke="rgba(235,235,245,.45)" stroke-width="1.5" stroke-linecap="round"/></svg>`;
const GLOBE = `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" style="flex:none"><circle cx="6" cy="6" r="4.6" fill="none" stroke="rgba(235,235,245,.5)" stroke-width="1.1"/><path d="M1.6 6h8.8M6 1.4c2.2 2.6 2.2 6.6 0 9.2M6 1.4c-2.2 2.6-2.2 6.6 0 9.2" fill="none" stroke="rgba(235,235,245,.5)" stroke-width="1.1"/></svg>`;
const WARN = `<svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true"><path d="M7.5 3.2 V8.2" stroke="#ff9f0a" stroke-width="1.7" stroke-linecap="round"/><circle cx="7.5" cy="11" r="1" fill="#ff9f0a"/></svg>`;

function stageMark(status: StageRow['status']): Element {
  switch (status) {
    case 'done':
      return icon(TICK);
    case 'running':
      return icon(SPINNER);
    case 'failed':
      return icon(CROSS);
    case 'skipped':
      return icon(SKIPPED);
    case 'pending':
      return el('span', 'mark mark--pending');
  }
}

function pressable(node: HTMLElement, dispatch: Dispatch, request: LauncherRequest): HTMLElement {
  node.addEventListener('click', () => {
    dispatch(request);
  });
  return node;
}

/**
 * The footer's own actions, plus the shared ones `requestFor` already handles.
 * A switch rather than a chain of ternaries: the default branch narrows to a
 * `LauncherAction`, so adding a footer item that is not one fails to compile
 * rather than falling through to a request that does not exist.
 */
function footerRequest(item: FooterItem): LauncherRequest {
  switch (item.action) {
    case 'reveal-captures':
      return { kind: 'reveal-captures' };
    case 'open-project-page':
      return { kind: 'open-project-page' };
    case 'export-attachments':
      return { kind: 'export-attachments' };
    case 'settings':
      return { kind: 'settings' };
    case 'quit':
      return { kind: 'quit' };
    default:
      return requestFor({ label: item.label, action: item.action });
  }
}

function requestFor(button: LauncherButton): LauncherRequest {
  switch (button.action) {
    case 'start':
      return { kind: 'start' };
    case 'cancel':
      return { kind: 'cancel' };
    case 'stop':
      return { kind: 'stop' };
    case 'retry':
      return { kind: 'retry' };
    case 'sign-in':
      return { kind: 'sign-in' };
    case 'capture-anyway':
      return { kind: 'capture-anyway' };
    case 'choose-profile':
      return { kind: 'choose-profile' };
    case 'show-log':
      return { kind: 'toggle-log' };
  }
}

export function render(root: HTMLElement, snapshot: LauncherSnapshot, dispatch: Dispatch): void {
  const model = snapshot.model;
  root.textContent = '';
  root.append(header(model, dispatch));

  if (model.progress !== undefined) root.append(progress(model.progress));
  // Directly under the header, above the card: everything below it was drawn
  // by the build this is warning about.
  if (model.staleBuild !== undefined) root.append(staleBuild(model.staleBuild, dispatch));
  root.append(el('div', 'divider'));
  root.append(...bodyOf(model.body, snapshot, dispatch));

  if (snapshot.notice !== undefined) root.append(el('div', 'notice', snapshot.notice));

  root.append(el('div', 'divider'));
  root.append(footer(model, dispatch));
}

function staleBuild(notice: StaleBuildNotice, dispatch: Dispatch): HTMLElement {
  const row = el('div', 'stale');
  const stack = el('div', 'stack');
  stack.append(el('span', 'top', notice.title), el('span', 'bottom', notice.detail));
  row.append(icon(WARN), stack);

  if (notice.restartAction !== undefined) {
    row.append(pressable(el('button', 'link', 'Restart'), dispatch, { kind: 'restart-launcher' }));
  }
  return row;
}

function header(model: PopoverModel, dispatch: Dispatch): HTMLElement {
  const node = el('div', 'header');
  node.append(badge(model.header.tone));

  const heading = el('div', 'heading');
  heading.append(el('span', 'title', model.header.title), el('span', 'subtitle', model.header.subtitle));
  node.append(heading);

  const action = model.header.action;
  if (action !== undefined) {
    node.append(pressable(el('button', 'chip', action.label), dispatch, requestFor(action)));
  }
  return node;
}

function badge(tone: LauncherTone): HTMLElement {
  const node = el('div', `badge badge--${tone}`);
  if (tone === 'busy') node.append(icon(SPINNER));
  else if (tone === 'warn') node.append(icon(WARN));
  else if (tone === 'error') node.append(icon(CROSS));
  else node.append(el('span', 'dot'));
  return node;
}

function progress(fraction: number): HTMLElement {
  const track = el('div', 'progress');
  const fill = el('div', 'fill');
  fill.style.width = `${String(Math.round(Math.min(1, Math.max(0, fraction)) * 100))}%`;
  track.append(fill);
  return track;
}

function bodyOf(body: PopoverBody, snapshot: LauncherSnapshot, dispatch: Dispatch): HTMLElement[] {
  switch (body.kind) {
    case 'stages':
      return [stagesSection(body, snapshot, dispatch)];
    case 'signin':
      return [signInSection(body, snapshot, dispatch)];
    case 'ready':
      return readySections(body, dispatch);
  }
}

function stageList(rows: readonly StageRow[]): HTMLElement {
  const list = el('div', 'stages');
  for (const row of rows) {
    const line = el('div', `stage stage--${row.status}`);
    line.append(stageMark(row.status), el('span', undefined, row.title));
    if (row.note !== undefined) line.append(el('span', 'note', row.note));
    list.append(line);
  }
  return list;
}

function stagesSection(
  body: Extract<PopoverBody, { kind: 'stages' }>,
  snapshot: LauncherSnapshot,
  dispatch: Dispatch,
): HTMLElement {
  const section = el('div', 'section');

  // Above the rows, because it is what the rows are about to act on.
  const field = body.urlField === undefined ? undefined : urlField(body.urlField, dispatch);
  if (field !== undefined) section.append(field.group);

  section.append(stageList(body.stages));

  if (body.primary !== undefined) {
    section.append(primaryButton(body.primary, field?.input, dispatch));
  }
  if (body.footnote !== undefined) section.append(el('div', 'caption', body.footnote));
  if (body.showLog) section.append(...logDisclosure(snapshot, dispatch));
  return section;
}

/**
 * The URL field, shared by the cold card and the running one.
 *
 * `change` fires on blur, which happens on the way to clicking the button
 * beside it — so the value is also read at click time. Without that, the first
 * press after an edit could act on the previous URL.
 */
function urlField(
  spec: { value: string; options: readonly string[] },
  dispatch: Dispatch,
): { group: HTMLElement; input: HTMLInputElement } {
  const group = el('div');
  group.style.display = 'flex';
  group.style.flexDirection = 'column';
  group.style.gap = '6px';
  group.append(el('span', 'label', 'Inspect a page'));

  const field = el('div', 'field');
  const input = el('input');
  input.type = 'text';
  input.value = spec.value;
  input.spellcheck = false;
  input.setAttribute('aria-label', 'URL to inspect');
  input.addEventListener('change', () => {
    dispatch({ kind: 'set-url', url: input.value });
  });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    dispatch({ kind: 'set-url', url: input.value });
    dispatch({ kind: 'start' });
  });
  field.append(icon(GLOBE), input);
  if (spec.options.length > 0) field.append(el('span', 'caret', '⌄'));
  group.append(field);
  return { group, input };
}

/**
 * A primary button that commits the URL beside it before acting, so what you
 * typed is what gets opened even if the field never fired `change`.
 */
function primaryButton(
  button: LauncherButton,
  input: HTMLInputElement | undefined,
  dispatch: Dispatch,
): HTMLElement {
  const node = el('button', 'primary', button.label);
  node.addEventListener('click', () => {
    if (input !== undefined && button.action === 'start') {
      dispatch({ kind: 'set-url', url: input.value });
    }
    dispatch(requestFor(button));
  });
  return node;
}

function logDisclosure(snapshot: LauncherSnapshot, dispatch: Dispatch): HTMLElement[] {
  const toggle = el('button', 'disclosure');
  toggle.append(
    el('span', 'caret', snapshot.logOpen ? '⌄' : '›'),
    el('span', undefined, snapshot.logOpen ? 'Hide log' : 'Show log'),
  );
  const nodes: HTMLElement[] = [pressable(toggle, dispatch, { kind: 'toggle-log' })];

  if (snapshot.logOpen) {
    const log = el('div', 'log');
    for (const line of snapshot.log) log.append(el('div', undefined, line));
    nodes.push(log);
    // Newest output is the interesting output, so the pane starts at the end.
    queueMicrotask(() => {
      log.scrollTop = log.scrollHeight;
    });
  }
  return nodes;
}

function signInSection(
  body: Extract<PopoverBody, { kind: 'signin' }>,
  snapshot: LauncherSnapshot,
  dispatch: Dispatch,
): HTMLElement {
  // No title here: the header above already carries it, from the same source.
  const section = el('div', 'section');
  section.append(el('div', 'body-text', body.card.body));

  if (body.card.evidence.length > 0) {
    const list = el('ul', 'evidence');
    list.style.margin = '0';
    list.style.padding = '0';
    for (const line of body.card.evidence) list.append(el('li', undefined, line));
    section.append(list);
  }

  const primary = body.card.primary;
  if (primary !== undefined) {
    section.append(
      pressable(el('button', 'primary', primary.label), dispatch, { kind: primary.answer }),
    );
  }

  if (body.card.secondary.length > 0) {
    const row = el('div', 'buttons');
    for (const button of body.card.secondary) {
      row.append(pressable(el('button', 'secondary', button.label), dispatch, { kind: button.answer }));
    }
    section.append(row);
  }

  section.append(stageList(body.stages), ...logDisclosure(snapshot, dispatch));
  return section;
}

function readySections(body: Extract<PopoverBody, { kind: 'ready' }>, dispatch: Dispatch): HTMLElement[] {
  const section = el('div', 'section');

  const field = urlField(body.urlField, dispatch);
  section.append(field.group);

  section.append(authRow(body, dispatch));
  section.append(primaryButton(body.primary, field.input, dispatch));
  section.append(el('div', 'caption', body.caption));

  const sections: HTMLElement[] = [section];
  if (body.runs.length > 0) {
    sections.push(el('div', 'divider'), runsList(body.runs, dispatch));
  }
  return sections;
}

function authRow(body: Extract<PopoverBody, { kind: 'ready' }>, dispatch: Dispatch): HTMLElement {
  const row = el('div', 'row');
  const mark =
    body.auth.tone === 'ok' ? icon(TICK) : body.auth.tone === 'warn' ? icon(WARN) : el('span', 'mark mark--pending');
  const stack = el('div', 'stack');
  stack.append(el('span', 'top', body.auth.title), el('span', 'bottom', body.auth.detail));
  row.append(mark, stack);

  const action = body.auth.action;
  if (action !== undefined) {
    row.append(pressable(el('button', 'link', action.label), dispatch, requestFor(action)));
  }
  return row;
}

function runsList(runs: readonly RunRow[], dispatch: Dispatch): HTMLElement {
  const list = el('div', 'runs');
  for (const run of runs) {
    const row = el('button', 'run');
    row.title = run.runDir;
    const stack = el('div', 'stack');
    stack.append(el('span', 'top', run.title), el('span', 'bottom', run.detail));
    row.append(el('div', 'thumb'), stack);
    pressable(row, dispatch, { kind: 'reveal-run', runId: run.runId });

    // The row reveals the folder; each link does its own thing. Without
    // stopping propagation a link's click would also trigger the row it sits
    // on, and reveal a folder nobody asked for.
    const link = (label: string, request: LauncherRequest): HTMLElement => {
      const node = pressable(el('button', 'link', label), dispatch, request);
      node.addEventListener('click', (event) => {
        event.stopPropagation();
      });
      return node;
    };

    // Resume comes first: going back into a session is the reason this list
    // exists, and the report is what you read when you are done.
    if (run.resumeAction !== undefined) {
      row.append(link('Resume', { kind: 'resume-session', runId: run.runId }));
    }
    if (run.reportAction !== undefined) {
      row.append(link('Report', { kind: 'open-report', runId: run.runId }));
    }
    list.append(row);
  }
  return list;
}

function footer(model: PopoverModel, dispatch: Dispatch): HTMLElement {
  const menu = el('div', 'menu');
  for (const item of model.footer) {
    const button = el('button', undefined);
    button.append(el('span', undefined, item.label));
    if (item.shortcut !== undefined) button.append(el('span', 'shortcut', item.shortcut));

    menu.append(pressable(button, dispatch, footerRequest(item)));
  }
  return menu;
}
