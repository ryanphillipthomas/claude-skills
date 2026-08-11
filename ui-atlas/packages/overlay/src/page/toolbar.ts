import type {
  ElementIdentity,
  OverlaySession,
  QueueJob,
  StateName,
} from '@ui-atlas/protocol';

export interface CaptureIntent {
  kind: 'element' | 'viewport' | 'full-page';
  states: StateName[];
  responsive: boolean;
  includeOverlay: boolean;
  label?: string;
}

export interface ToolbarCallbacks {
  onToggleInspect(): void;
  onCapture(intent: CaptureIntent): void;
  onSetViewport(width: number, height: number, presetName?: string): void;
  onClearSelection(): void;
  onToggleBoxModel(next: boolean): void;
}

export interface SelectionView {
  identity: ElementIdentity;
  resolution: { matches: number; usedCandidateIndex: number; fellBack: boolean };
  warnings: string[];
}

const CAPTURABLE_STATES: StateName[] = [
  'default',
  'hover',
  'focus',
  'focus-visible',
  'active',
  'checked',
  'selected',
  'expanded',
  'disabled',
];

/**
 * The inspector's chrome. Every control maps to one host operation; nothing in
 * here touches the page's own DOM.
 */
export class Toolbar {
  readonly element: HTMLDivElement;
  private readonly callbacks: ToolbarCallbacks;

  private session: OverlaySession | undefined;
  private selection: SelectionView | undefined;
  private selectedStates = new Set<StateName>(['default']);
  private inspectActive = false;
  private boxModel = false;

  private readonly runLabel: HTMLSpanElement;
  private readonly inspectButton: HTMLButtonElement;
  private readonly boxModelButton: HTMLButtonElement;
  private readonly detailsHost: HTMLDivElement;
  private readonly stateRow: HTMLDivElement;
  private readonly viewportRow: HTMLDivElement;
  private readonly captureRow: HTMLDivElement;
  private readonly jobList: HTMLUListElement;
  private readonly noticeHost: HTMLDivElement;
  private readonly helpHost: HTMLDivElement;
  private readonly widthInput: HTMLInputElement;
  private readonly heightInput: HTMLInputElement;

  constructor(root: ShadowRoot, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;

    this.element = div('ua-panel');
    const titlebar = div('ua-titlebar');
    const title = document.createElement('span');
    title.className = 'ua-title';
    title.textContent = 'UI Atlas';
    this.runLabel = document.createElement('span');
    this.runLabel.className = 'ua-run';
    this.runLabel.textContent = 'connecting…';
    titlebar.append(title, this.runLabel);
    makeDraggable(this.element, titlebar);

    const body = div('ua-body');

    // --- Mode -------------------------------------------------------------
    const modeSection = section('Mode');
    const modeRow = div('ua-row');
    this.inspectButton = button('Inspect', () => this.callbacks.onToggleInspect());
    this.inspectButton.setAttribute('aria-pressed', 'false');
    this.boxModelButton = button('Box model', () => {
      this.boxModel = !this.boxModel;
      this.boxModelButton.setAttribute('aria-pressed', String(this.boxModel));
      this.callbacks.onToggleBoxModel(this.boxModel);
    });
    this.boxModelButton.setAttribute('aria-pressed', 'false');
    const clearButton = button('Clear', () => this.callbacks.onClearSelection());
    modeRow.append(this.inspectButton, this.boxModelButton, clearButton);
    modeSection.append(modeRow);

    // --- Element ----------------------------------------------------------
    const elementSection = section('Element');
    this.detailsHost = div('ua-section');
    elementSection.append(this.detailsHost);

    // --- States -----------------------------------------------------------
    const stateSection = section('States');
    this.stateRow = div('ua-row');
    stateSection.append(this.stateRow);

    // --- Viewport ---------------------------------------------------------
    const viewportSection = section('Viewport');
    this.viewportRow = div('ua-row');
    const customRow = div('ua-row');
    this.widthInput = numberInput(1440);
    this.heightInput = numberInput(1000);
    const applyButton = button('Apply', () => {
      const width = Number(this.widthInput.value);
      const height = Number(this.heightInput.value);
      if (Number.isFinite(width) && Number.isFinite(height)) {
        this.callbacks.onSetViewport(Math.round(width), Math.round(height));
      }
    });
    customRow.append(this.widthInput, this.heightInput, applyButton);
    viewportSection.append(this.viewportRow, customRow);

    // --- Capture ----------------------------------------------------------
    const captureSection = section('Capture');
    this.captureRow = div('ua-row');
    captureSection.append(this.captureRow);
    this.renderCaptureButtons();

    // --- Queue ------------------------------------------------------------
    const queueSection = section('Queue');
    this.jobList = document.createElement('ul');
    this.jobList.className = 'ua-jobs';
    queueSection.append(this.jobList);

    this.noticeHost = div('ua-section');

    // --- Help -------------------------------------------------------------
    const helpSection = section('Shortcuts');
    this.helpHost = div('ua-help');
    helpSection.append(this.helpHost);

    body.append(
      this.noticeHost,
      modeSection,
      elementSection,
      stateSection,
      viewportSection,
      captureSection,
      queueSection,
      helpSection,
    );
    this.element.append(titlebar, body);
    root.append(this.element);

    this.renderStates();
    this.renderSelection();
    this.renderJobs([]);
  }

  setSession(session: OverlaySession): void {
    this.session = session;
    this.runLabel.textContent = session.outputLabel;
    this.renderViewportPresets();
    this.renderHelp();
    this.renderCaptureButtons();
  }

  setInspectActive(active: boolean): void {
    this.inspectActive = active;
    this.inspectButton.setAttribute('aria-pressed', String(active));
    this.inspectButton.textContent = active ? 'Inspecting' : 'Inspect';
  }

  setSelection(selection: SelectionView | undefined): void {
    this.selection = selection;
    this.renderSelection();
    this.renderCaptureButtons();
  }

  renderJobs(jobs: QueueJob[]): void {
    this.jobList.textContent = '';
    if (jobs.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ua-empty';
      empty.textContent = 'No captures yet.';
      this.jobList.append(empty);
      return;
    }
    for (const job of jobs.slice(-12).reverse()) {
      const item = document.createElement('li');
      item.className = `ua-job ua-job--${job.status}`;
      const label = document.createElement('span');
      label.className = 'ua-job__label';
      label.textContent = job.progress === undefined ? job.label : `${job.label} — ${job.progress}`;
      const status = document.createElement('span');
      status.className = 'ua-job__status';
      status.textContent = job.status;
      item.append(label, status);
      if (job.error !== undefined) item.title = `${job.error.code}: ${job.error.message}`;
      else if (job.warnings.length > 0) item.title = job.warnings.join('\n');
      this.jobList.append(item);
    }
  }

  notice(level: 'info' | 'warn' | 'error', message: string): void {
    this.noticeHost.textContent = '';
    const notice = div(`ua-notice ua-notice--${level}`);
    notice.textContent = message;
    this.noticeHost.append(notice);
  }

  clearNotice(): void {
    this.noticeHost.textContent = '';
  }

  get states(): StateName[] {
    const ordered = CAPTURABLE_STATES.filter((state) => this.selectedStates.has(state));
    return ordered.length > 0 ? ordered : ['default'];
  }

  private renderStates(): void {
    this.stateRow.textContent = '';
    for (const state of CAPTURABLE_STATES) {
      const control = button(state, () => {
        if (this.selectedStates.has(state)) this.selectedStates.delete(state);
        else this.selectedStates.add(state);
        if (this.selectedStates.size === 0) this.selectedStates.add('default');
        this.renderStates();
      });
      control.setAttribute('aria-pressed', String(this.selectedStates.has(state)));
      this.stateRow.append(control);
    }
  }

  private renderViewportPresets(): void {
    this.viewportRow.textContent = '';
    for (const preset of this.session?.viewportPresets ?? []) {
      const label = `${preset.name ?? 'preset'} ${String(preset.width)}×${String(preset.height)}`;
      const control = button(label, () => {
        this.widthInput.value = String(preset.width);
        this.heightInput.value = String(preset.height);
        this.callbacks.onSetViewport(preset.width, preset.height, preset.name);
      });
      this.viewportRow.append(control);
    }
  }

  private renderCaptureButtons(): void {
    this.captureRow.textContent = '';
    const hasSelection = this.selection !== undefined;

    const element = button('Element', () =>
      this.callbacks.onCapture({
        kind: 'element',
        states: ['default'],
        responsive: false,
        includeOverlay: false,
      }),
    );
    element.className = 'ua-btn ua-btn--primary';
    element.disabled = !hasSelection;

    const stateSet = button('State set', () =>
      this.callbacks.onCapture({
        kind: 'element',
        states: this.states,
        responsive: false,
        includeOverlay: false,
        label: `states: ${this.states.join(', ')}`,
      }),
    );
    stateSet.disabled = !hasSelection;

    const responsive = button('Responsive set', () =>
      this.callbacks.onCapture({
        kind: hasSelection ? 'element' : 'viewport',
        states: ['default'],
        responsive: true,
        includeOverlay: false,
        label: 'responsive set',
      }),
    );
    responsive.disabled = this.session?.capabilities.responsive !== true;

    const viewport = button('Viewport', () =>
      this.callbacks.onCapture({
        kind: 'viewport',
        states: ['default'],
        responsive: false,
        includeOverlay: false,
      }),
    );

    const fullPage = button('Full page', () =>
      this.callbacks.onCapture({
        kind: 'full-page',
        states: ['default'],
        responsive: false,
        includeOverlay: false,
      }),
    );
    fullPage.disabled = this.session?.capabilities.fullPage !== true;

    const animation = button('Animation', () =>
      this.callbacks.onCapture({
        kind: 'element',
        states: ['default'],
        responsive: false,
        includeOverlay: false,
        label: 'animation',
      }),
    );
    animation.disabled = this.session?.capabilities.animation !== true;
    animation.title = 'Animation capture lands in a later phase.';

    this.captureRow.append(element, stateSet, viewport, fullPage, responsive, animation);
  }

  private renderSelection(): void {
    this.detailsHost.textContent = '';
    if (this.selection === undefined) {
      const empty = div('ua-empty');
      empty.textContent = this.inspectActive
        ? 'Point at an element and click to select it.'
        : 'Turn on inspect mode to select an element.';
      this.detailsHost.append(empty);
      return;
    }

    const { identity, resolution, warnings } = this.selection;
    const list = document.createElement('dl');
    list.className = 'ua-kv';
    addPair(list, 'tag', identity.tagName);
    addPair(list, 'role', identity.role ?? '—');
    addPair(list, 'name', identity.accessibleName ?? '—');
    addPair(
      list,
      'size',
      `${String(Math.round(identity.boundingBox.width))} × ${String(Math.round(identity.boundingBox.height))}`,
    );
    addPair(list, 'matches', String(resolution.matches));
    this.detailsHost.append(list);

    const locator = div('ua-locator');
    const score = document.createElement('span');
    score.className = identity.chosenLocator.score >= 70 ? 'ua-score' : 'ua-score ua-score--low';
    score.textContent = `${identity.chosenLocator.type} · ${String(identity.chosenLocator.score)}`;
    const value = document.createElement('div');
    value.textContent = identity.chosenLocator.value;
    locator.append(score, value);
    locator.title = identity.chosenLocator.reasons.join('\n');
    this.detailsHost.append(locator);

    if (warnings.length > 0) {
      const warning = div('ua-notice ua-notice--warn');
      warning.textContent = warnings[0] ?? '';
      warning.title = warnings.join('\n');
      this.detailsHost.append(warning);
    }
  }

  private renderHelp(): void {
    this.helpHost.textContent = '';
    const shortcuts = this.session?.shortcuts ?? {};
    for (const [action, combo] of Object.entries(shortcuts)) {
      const key = document.createElement('kbd');
      key.textContent = combo;
      const label = document.createElement('span');
      label.textContent = humanise(action);
      this.helpHost.append(key, label);
    }
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }
}

function div(className: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = className;
  return element;
}

function section(title: string): HTMLDivElement {
  const element = div('ua-section');
  const heading = document.createElement('h3');
  heading.textContent = title;
  element.append(heading);
  return element;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.className = 'ua-btn';
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return element;
}

function numberInput(value: number): HTMLInputElement {
  const element = document.createElement('input');
  element.className = 'ua-input';
  element.type = 'number';
  element.value = String(value);
  element.min = '200';
  element.max = '10000';
  return element;
}

function addPair(list: HTMLDListElement, term: string, description: string): void {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = description;
  list.append(dt, dd);
}

function humanise(action: string): string {
  return action.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

/** Drag by the title bar. Position is clamped so the panel cannot be lost. */
function makeDraggable(panel: HTMLElement, handle: HTMLElement): void {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener('pointerdown', (event) => {
    dragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });

  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const maxX = Math.max(0, window.innerWidth - panel.offsetWidth);
    const maxY = Math.max(0, window.innerHeight - 40);
    const x = Math.min(Math.max(0, event.clientX - offsetX), maxX);
    const y = Math.min(Math.max(0, event.clientY - offsetY), maxY);
    panel.style.left = `${String(Math.round(x))}px`;
    panel.style.top = `${String(Math.round(y))}px`;
    panel.style.right = 'auto';
    event.stopPropagation();
  });

  const stop = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    handle.releasePointerCapture?.(event.pointerId);
  };
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
}
