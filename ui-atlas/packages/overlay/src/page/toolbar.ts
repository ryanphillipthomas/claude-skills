import type {
  AnimationInventoryResult,
  ElementIdentity,
  OutputSummaryResult,
  OverlaySession,
  QueueJob,
  StateName,
} from '@ui-atlas/protocol';
import { FLOW_INSTRUCTIONS, nextStep, type FlowAdvice } from './flow.js';

export interface CaptureIntent {
  kind: 'element' | 'viewport' | 'full-page';
  states: StateName[];
  responsive: boolean;
  includeOverlay: boolean;
  label?: string;
}

export type SelectionMove = 'parent' | 'child' | 'previous' | 'next';

export type TabId = 'capture' | 'viewport' | 'animation' | 'output';

interface TabDefinition {
  id: TabId;
  label: string;
  sections: Section[];
}

export interface ToolbarCallbacks {
  onToggleInspect(): void;
  /** Walk the tree from the current selection. Arrow keys do the same thing. */
  onMoveSelection(direction: SelectionMove): void;
  /** Ask the host what is moving on this page. Reads; changes nothing. */
  onListAnimations(): void;
  /** Photograph one animation at the configured offsets. */
  onSampleAnimation(id: string, label: string): void;
  /** Record the page for a bounded window. No id means the page as a whole. */
  onRecordAnimation(id: string | undefined, label: string): void;
  onCapture(intent: CaptureIntent): void;
  onSetViewport(width: number, height: number, presetName?: string): void;
  onClearSelection(): void;
  onToggleBoxModel(next: boolean): void;
  /** Apply a state to the live page, or release it with `undefined`. */
  onPreviewState(state: StateName | undefined): void;
  /** Ask the host what this run has written. Reads; changes nothing. */
  onRefreshOutput(): void;
  /** Ask the host to open the run folder, or build and open the report. */
  onRevealOutput(target: 'folder' | 'report'): void;
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

  private capturedHere = 0;
  private pageLabel = '/';
  private workingJobs = 0;

  private readonly runLabel: HTMLSpanElement;
  private readonly flowHost: HTMLDivElement;
  private readonly instructionsHost: HTMLDivElement;
  private readonly inspectButton: HTMLButtonElement;
  private readonly boxModelButton: HTMLButtonElement;
  private readonly treeRow: HTMLDivElement;
  private readonly detailsHost: HTMLDivElement;
  private readonly stateRow: HTMLDivElement;
  private readonly stateNote: HTMLDivElement;
  private previewing: StateName | undefined;
  private readonly viewportRow: HTMLDivElement;
  private readonly captureRow: HTMLDivElement;
  private readonly animationHost: HTMLDivElement;
  private animations: AnimationInventoryResult | undefined;
  private animationsPending = false;
  private readonly animationSection: Section;
  private readonly captureSection: Section;
  private readonly outputSection: Section;
  private readonly tabs: TabDefinition[];
  private readonly tabStrip: HTMLDivElement;
  private readonly tabPanel: HTMLDivElement;
  private readonly tabButtons = new Map<TabId, HTMLButtonElement>();
  private activeTab: TabId = 'capture';
  private compact = false;
  private readonly compactToggle: HTMLButtonElement;
  private readonly compactHost: HTMLDivElement;
  private readonly outputHost: HTMLDivElement;
  private output: OutputSummaryResult | undefined;
  private outputPending = false;
  private reviewed = false;
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

    // The titlebar never scrolls away, so the one action you want at the end —
    // "where did my files go?" — is reachable no matter how tall the panel has
    // grown or how far down the window it has been dragged.
    const revealButton = button('📁 Folder', () => this.callbacks.onRevealOutput('folder'));
    revealButton.className = 'ua-btn ua-btn--titlebar';
    revealButton.title = 'Open this run\u2019s folder on your desktop.';
    // The titlebar is the drag handle; a press on a button in it must not also
    // start a drag.
    revealButton.addEventListener('pointerdown', (event) => event.stopPropagation());

    this.compactToggle = button('▴', () => this.setCompact(!this.compact));
    this.compactToggle.className = 'ua-btn ua-btn--titlebar';
    this.compactToggle.title = 'Shrink to the essentials';
    this.compactToggle.setAttribute('aria-pressed', 'false');
    this.compactToggle.addEventListener('pointerdown', (event) => event.stopPropagation());

    titlebar.append(title, this.runLabel, this.compactToggle, revealButton);
    makeDraggable(this.element, titlebar);

    const body = div('ua-body');

    // --- Flow, always visible ---------------------------------------------
    // The one line that says what to do now. Above the tabs because it is the
    // answer to the question a first-time user actually has, whichever tab
    // they are looking at.
    this.flowHost = div('ua-flow');
    this.noticeHost = div('ua-section');

    // Reference, not reading. It was 274px of the panel's 970 — more than a
    // quarter — shown expanded on every single run, when the flow line above
    // already says what to do next. The heading stays, so it is one click away.
    // One collapse mechanism, not two: the heading is the toggle. The inner
    // Hide/Show button that used to live here was a second way to do the same
    // thing, with its own state to keep in sync.
    const instructionsSection = section('How this works', false);
    this.instructionsHost = div('ua-steps');
    this.helpHost = div('ua-help');
    instructionsSection.body.append(this.instructionsHost, this.helpHost);

    // --- Inspect tab ------------------------------------------------------
    const modeSection = section('Mode', true);
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
    modeSection.body.append(modeRow);

    const elementSection = section('Element', true);
    // Walking the tree was arrow-keys-only, which meant it may as well not have
    // existed: the one operation you always want after clicking slightly the
    // wrong thing had no visible control at all.
    this.treeRow = div('ua-row');
    this.detailsHost = div('ua-section');
    elementSection.body.append(this.treeRow, this.detailsHost);

    // --- Capture tab ------------------------------------------------------
    const stateSection = section('States to capture', true);
    this.stateRow = div('ua-row');
    this.stateNote = div('ua-hint');
    stateSection.body.append(this.stateRow, this.stateNote);

    const captureSection = section('Capture', true);
    this.captureSection = captureSection;
    this.captureRow = div('ua-row');
    captureSection.body.append(this.captureRow);
    this.renderCaptureButtons();

    const viewportSection = section('Viewport', false);
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
    viewportSection.body.append(this.viewportRow, customRow);

    const animationSection = section('Animation', false);
    this.animationSection = animationSection;
    this.animationHost = div('ua-section');
    animationSection.body.append(this.animationHost);

    // --- Output tab -------------------------------------------------------
    const outputSection = section('Output', true);
    this.outputSection = outputSection;
    this.outputHost = div('ua-section');
    outputSection.body.append(this.outputHost);

    const queueSection = section('Queue', true);
    this.jobList = document.createElement('ul');
    this.jobList.className = 'ua-jobs';
    queueSection.body.append(this.jobList);

    // --- Tabs -------------------------------------------------------------
    // Eleven sections rendering at once was what filled the window. Only one
    // group renders now, so the panel is the size of what you are doing rather
    // than the size of everything it can do.
    // The whole main loop lives in one tab. An earlier split put Mode and
    // Element under "Inspect" and the states and shutter under "Capture",
    // which meant selecting an element and then photographing it — the one
    // sequence this tool exists for — crossed a tab boundary. Tabs that
    // interrupt the main path are worse than the scrolling they replaced.
    this.tabs = [
      {
        id: 'capture',
        label: 'Capture',
        sections: [modeSection, elementSection, stateSection, captureSection],
      },
      { id: 'viewport', label: 'Viewport', sections: [viewportSection] },
      { id: 'animation', label: 'Animation', sections: [animationSection] },
      { id: 'output', label: 'Output', sections: [outputSection, queueSection] },
    ];
    this.tabStrip = div('ua-tabs');
    this.tabPanel = div('ua-tabpanel');
    for (const tab of this.tabs) {
      const control = button(tab.label, () => this.setTab(tab.id));
      control.className = 'ua-tab';
      control.setAttribute('role', 'tab');
      this.tabButtons.set(tab.id, control);
      this.tabStrip.append(control);
    }
    this.tabStrip.setAttribute('role', 'tablist');

    // Empty unless compact mode is on, when the capture row moves into it.
    this.compactHost = div('ua-compact');

    body.append(
      this.flowHost,
      this.noticeHost,
      this.compactHost,
      instructionsSection.element,
      this.tabStrip,
      this.tabPanel,
    );
    this.renderTab();

    // A cap, plus a way past it. The panel is 620px by default rather than
    // whatever the window allows, and the handle is there for the times you
    // want more — resizing is the honest answer to "how tall should this be?",
    // because only the person looking at it knows.
    const resizeHandle = div('ua-resize');
    resizeHandle.title = 'Drag to resize';
    makeResizable(this.element, body, resizeHandle);

    this.element.append(titlebar, body, resizeHandle);
    root.append(this.element);

    this.renderInstructions();
    this.renderTree();
    this.renderStates();
    this.renderSelection();
    this.renderAnimations();
    this.renderOutput();
    this.renderJobs([]);
    this.renderFlow();
  }

  setOutputPending(pending: boolean): void {
    this.outputPending = pending;
    this.renderOutput();
  }

  setOutput(summary: OutputSummaryResult | undefined): void {
    this.output = summary;
    this.outputPending = false;
    // Seeing the list *is* step 4; the flow line moves on once it has happened.
    if (summary !== undefined) {
      this.reviewed = true;
      this.outputSection.setOpen(true);
      this.setTab('output');
    }
    this.renderOutput();
    this.renderFlow();
  }

  /**
   * Where the browser is now, and how much of this run came from here. The
   * count is of captures actually completed, not of jobs requested.
   */
  setProgress(input: { pageLabel: string; capturedHere: number }): void {
    this.pageLabel = input.pageLabel;
    this.capturedHere = input.capturedHere;
    this.renderFlow();
  }

  /**
   * Show one tab's sections. Nothing is destroyed — the section elements are
   * moved, so their collapsed state, their content and their scroll position
   * all survive switching away and back.
   */
  setTab(id: TabId): void {
    this.activeTab = id;
    this.renderTab();
  }

  get tab(): TabId {
    return this.activeTab;
  }

  private renderTab(): void {
    for (const [id, control] of this.tabButtons) {
      const active = id === this.activeTab;
      control.setAttribute('aria-selected', String(active));
      control.classList.toggle('ua-tab--active', active);
    }
    this.tabPanel.textContent = '';
    const tab = this.tabs.find((candidate) => candidate.id === this.activeTab);
    for (const part of tab?.sections ?? []) this.tabPanel.append(part.element);
  }

  /**
   * Shrink to the flow line and the capture buttons.
   *
   * The capture row is *moved* rather than copied — two rows of buttons that
   * both claim to capture would be two things to keep in sync, and one of them
   * would eventually lie.
   */
  setCompact(next: boolean): void {
    this.compact = next;
    this.element.classList.toggle('ua-panel--compact', next);
    this.compactToggle.setAttribute('aria-pressed', String(next));
    this.compactToggle.textContent = next ? '▾' : '▴';
    this.compactToggle.title = next ? 'Show the whole panel' : 'Shrink to the essentials';

    if (next) this.compactHost.append(this.captureRow);
    else this.captureSection.body.append(this.captureRow);
    this.renderCaptureButtons();
  }

  get isCompact(): boolean {
    return this.compact;
  }

  /** The current advice, exposed so a test can read it without scraping text. */
  get flow(): FlowAdvice {
    return nextStep({
      connected: this.session !== undefined,
      inspecting: this.inspectActive,
      hasSelection: this.selection !== undefined,
      states: this.states,
      capturedHere: this.capturedHere,
      workingJobs: this.workingJobs,
      pageLabel: this.pageLabel,
      runTotal: this.output?.counts.captured ?? this.capturedHere,
      reviewed: this.reviewed,
    });
  }

  private renderFlow(): void {
    const advice = this.flow;
    this.flowHost.textContent = '';
    this.flowHost.dataset['step'] = advice.step;

    if (advice.position > 0) {
      const badge = document.createElement('span');
      badge.className = 'ua-flow__step';
      badge.textContent = `Step ${String(advice.position)} of ${String(advice.total)}`;
      this.flowHost.append(badge);
    }
    const text = document.createElement('span');
    text.className = 'ua-flow__text';
    text.textContent = advice.text;
    this.flowHost.append(text);

    this.renderInstructions();
  }

  /** Numbered, and the step you are on is marked so the two agree. */
  private renderInstructions(): void {
    this.instructionsHost.textContent = '';
    const current = this.flow.position;
    const list = document.createElement('ol');
    list.className = 'ua-steps__list';
    for (const instruction of FLOW_INSTRUCTIONS) {
      const item = document.createElement('li');
      if (instruction.step === current) item.className = 'ua-steps__item--current';
      const title = document.createElement('strong');
      title.textContent = instruction.title;
      const detail = document.createElement('span');
      detail.textContent = ` — ${instruction.detail}`;
      item.append(title, detail);
      list.append(item);
    }
    this.instructionsHost.append(list);
  }

  private renderTree(): void {
    this.treeRow.textContent = '';
    const hasSelection = this.selection !== undefined;
    const moves: Array<[string, SelectionMove, string]> = [
      ['↑ Parent', 'parent', 'Select the element that contains this one.'],
      ['↓ Child', 'child', 'Select the first element inside this one.'],
      ['← Previous', 'previous', 'Select the previous sibling.'],
      ['→ Next', 'next', 'Select the next sibling.'],
    ];
    for (const [label, direction, title] of moves) {
      const control = button(label, () => this.callbacks.onMoveSelection(direction));
      control.disabled = !hasSelection;
      control.title = hasSelection ? title : 'Select an element first.';
      this.treeRow.append(control);
    }
  }

  /** The host is working on the list; say so rather than looking inert. */
  setAnimationsPending(pending: boolean): void {
    this.animationsPending = pending;
    if (pending) {
      this.animationSection.setOpen(true);
      this.setTab('animation');
    }
    this.renderAnimations();
  }

  setAnimations(result: AnimationInventoryResult | undefined): void {
    this.animations = result;
    this.animationsPending = false;
    // The list is the answer to a button press; a collapsed section would hide
    // it and read as "nothing happened".
    if (result !== undefined) {
      this.animationSection.setOpen(true);
      // Revealing a collapsed section is not enough once tabs exist: the
      // section has to be the one on screen, or the list is still invisible.
      this.setTab('animation');
    }
    this.renderAnimations();
  }

  setSession(session: OverlaySession): void {
    this.session = session;
    this.runLabel.textContent = session.outputLabel;
    this.renderViewportPresets();
    this.renderHelp();
    this.renderCaptureButtons();
    this.renderOutput();
    this.renderFlow();
  }

  setInspectActive(active: boolean): void {
    this.inspectActive = active;
    this.inspectButton.setAttribute('aria-pressed', String(active));
    this.inspectButton.textContent = active ? 'Inspecting' : 'Inspect';
    this.renderFlow();
  }

  setSelection(selection: SelectionView | undefined): void {
    this.selection = selection;
    this.previewing = undefined;
    this.renderSelection();
    this.renderTree();
    this.renderStates();
    this.renderCaptureButtons();
    this.renderFlow();
  }

  renderJobs(jobs: QueueJob[]): void {
    this.workingJobs = jobs.filter(
      (job) => job.status === 'queued' || job.status === 'running',
    ).length;
    this.renderFlow();
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

  /**
   * Each chip does two things at once: it adds the state to the capture set and
   * applies it to the live page so you can see it. Selecting a state that does
   * nothing visible is the single most confusing thing this panel could do.
   */
  private renderStates(): void {
    this.stateRow.textContent = '';
    for (const state of CAPTURABLE_STATES) {
      const selected = this.selectedStates.has(state);
      const control = button(state, () => {
        if (selected) {
          this.selectedStates.delete(state);
          if (this.selectedStates.size === 0) this.selectedStates.add('default');
          if (this.previewing === state) this.setPreviewing(undefined);
          this.callbacks.onPreviewState(undefined);
        } else {
          this.selectedStates.add(state);
          this.callbacks.onPreviewState(state === 'default' ? undefined : state);
        }
        this.renderStates();
        this.renderCaptureButtons();
        this.renderFlow();
      });
      control.setAttribute('aria-pressed', String(selected));
      if (this.previewing === state) control.classList.add('ua-btn--previewing');
      control.title = selected
        ? `Included in the capture. Click to remove.`
        : `Capture this state, and show it on the page now.`;
      this.stateRow.append(control);
    }
    this.renderStateNote();
  }

  private renderStateNote(): void {
    this.stateNote.textContent = '';
    if (this.selection === undefined) {
      this.stateNote.textContent = 'Select an element to preview its states.';
      return;
    }
    this.stateNote.textContent =
      this.previewing === undefined
        ? `Capturing: ${this.states.join(', ')}`
        : `Showing "${this.previewing}" on the page · capturing: ${this.states.join(', ')}`;
  }

  /** Reflect what the host actually managed to apply, not what we asked for. */
  setPreviewing(state: StateName | undefined): void {
    this.previewing = state;
    this.renderStates();
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

    // One element button, and it captures exactly what the chips say. The old
    // pair — an "Element" button that silently captured only `default` next to
    // a "State set" that honoured the chips — was a trap.
    const states = this.states;
    const elementLabel =
      states.length === 1 ? `Capture ${states[0] ?? 'default'}` : `Capture ${String(states.length)} states`;
    const element = button(elementLabel, () =>
      this.callbacks.onCapture({
        kind: 'element',
        states,
        responsive: false,
        includeOverlay: false,
        label: `element · ${states.join(', ')}`,
      }),
    );
    element.className = 'ua-btn ua-btn--primary';
    element.disabled = !hasSelection;
    element.title = hasSelection
      ? `Captures ${states.join(', ')} for the selected element.`
      : 'Select an element first.';

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

    // Animation capture is not one button, because an animation is not one
    // thing you can always photograph. It has its own panel, which lists what
    // moves and offers only the action that would work for each.
    const animation = button('Animation…', () => this.callbacks.onListAnimations());
    animation.disabled = this.session?.capabilities.animation !== true;
    animation.title =
      this.session?.capabilities.animation === true
        ? 'Lists what moves on this page, and what can be done with each.'
        : 'Animation capture is not enabled for this session.';

    this.captureRow.append(element, viewport, fullPage, responsive, animation);
  }

  /**
   * What is moving here, and the one action that will work for each.
   *
   * The rule this panel exists to keep: an animation that cannot be sampled
   * gets **the inventory's own reason** and no Sample button, rather than a
   * button that would produce a frame the site never shows. Where a recording
   * would show what a seek cannot, that button appears instead.
   */
  private renderAnimations(): void {
    this.animationHost.textContent = '';

    const listButton = button(
      this.animations === undefined ? 'What moves here?' : 'Refresh',
      () => this.callbacks.onListAnimations(),
    );
    listButton.disabled =
      this.animationsPending || this.session?.capabilities.animation !== true;
    listButton.title =
      this.session?.capabilities.animation === true
        ? 'Lists every animation on the page. Nothing is paused, seeked or captured.'
        : 'Animation capture is not enabled for this session.';
    const row = div('ua-row');
    row.append(listButton);
    this.animationHost.append(row);

    if (this.animationsPending) {
      const busy = div('ua-hint');
      busy.textContent = 'Reading the page…';
      this.animationHost.append(busy);
      return;
    }
    if (this.animations === undefined) return;

    const { animations, unobservable, warnings } = this.animations;
    if (animations.length === 0) {
      const empty = div('ua-empty');
      empty.textContent = 'Nothing was animating when the page settled.';
      this.animationHost.append(empty);
    }

    const list = document.createElement('ul');
    list.className = 'ua-anims';
    for (const animation of animations) {
      const item = document.createElement('li');

      const title = div('ua-anim__title');
      title.textContent = animation.target === undefined
        ? animation.label
        : `${animation.label} · ${animation.target}`;
      item.append(title);

      const reason = div('ua-hint');
      reason.textContent = animation.reason;
      item.append(reason);

      const actions = div('ua-row');
      if (animation.canSample) {
        const sample = button('Sample', () =>
          this.callbacks.onSampleAnimation(animation.id, animation.label),
        );
        sample.className = 'ua-btn ua-btn--primary';
        sample.title = 'Pauses it, photographs it at each offset, and puts it back.';
        actions.append(sample);
      }
      if (animation.canRecord) {
        const record = button('Record', () =>
          this.callbacks.onRecordAnimation(animation.id, animation.label),
        );
        record.title =
          'Records the page for a bounded window. A recording is not a sample: ' +
          'it shows one pass, and recording again gives a different file.';
        actions.append(record);
      }
      if (actions.childElementCount > 0) item.append(actions);
      list.append(item);
    }
    if (animations.length > 0) this.animationHost.append(list);

    // Motion no animation list can see. Naming it is the difference between
    // "nothing is animating" and "nothing I can describe is animating".
    const unseen = unobservable.canvas2d + unobservable.webgl + unobservable.video;
    if (unseen > 0) {
      const note = div('ua-hint');
      note.textContent =
        `${String(unseen)} canvas, WebGL or video element(s) are here too, and no ` +
        'animation list can describe their motion.';
      this.animationHost.append(note);

      const actions = div('ua-row');
      actions.append(
        button('Record the page', () =>
          this.callbacks.onRecordAnimation(undefined, 'page recording'),
        ),
      );
      this.animationHost.append(actions);
    }

    for (const warning of warnings) {
      const note = div('ua-hint');
      note.textContent = warning;
      this.animationHost.append(note);
    }
  }

  /**
   * Where the files went, and how to get to them.
   *
   * The panel could not answer "where is this saving?" at all before, which is
   * a strange gap in a tool whose entire output is files. It shows names rather
   * than a path on purpose: a file name is derived from the site's own content,
   * where an absolute path would hand the page the user's home directory.
   */
  private renderOutput(): void {
    this.outputHost.textContent = '';

    const row = div('ua-row');
    const refresh = button(this.output === undefined ? 'What have I captured?' : 'Refresh', () =>
      this.callbacks.onRefreshOutput(),
    );
    refresh.disabled = this.outputPending;
    refresh.className = this.output === undefined ? 'ua-btn ua-btn--primary' : 'ua-btn';
    refresh.title = 'Lists the files this run has written so far.';

    const folder = button('Open folder', () => this.callbacks.onRevealOutput('folder'));
    folder.title = 'Reveals the run directory on your desktop, and prints its path in the terminal.';

    const report = button('Open report', () => this.callbacks.onRevealOutput('report'));
    report.title = 'Builds the browsable report from what is captured so far, and opens it.';

    row.append(refresh, folder, report);
    this.outputHost.append(row);

    if (this.outputPending) {
      const busy = div('ua-hint');
      busy.textContent = 'Reading the run…';
      this.outputHost.append(busy);
      return;
    }
    if (this.output === undefined) {
      const hint = div('ua-hint');
      hint.textContent = `Everything is written under ${this.session?.outputLabel ?? 'this run'}.`;
      this.outputHost.append(hint);
      return;
    }

    const { counts, recent } = this.output;
    const summary = div('ua-hint');
    const parts = [`${String(counts.captured)} captured`];
    if (counts.failed > 0) parts.push(`${String(counts.failed)} failed`);
    if (counts.skipped > 0) parts.push(`${String(counts.skipped)} skipped`);
    summary.textContent = `${parts.join(' · ')} in ${this.output.outputLabel}`;
    this.outputHost.append(summary);

    if (recent.length === 0) {
      const empty = div('ua-empty');
      empty.textContent = 'No files yet.';
      this.outputHost.append(empty);
      return;
    }

    const list = document.createElement('ul');
    list.className = 'ua-files';
    for (const entry of recent) {
      const item = document.createElement('li');
      const name = document.createElement('code');
      name.className = 'ua-file__name';
      name.textContent = entry.fileName;
      const where = div('ua-hint');
      where.textContent = entry.folder;
      item.append(name, where);
      // The folder is the run-relative path, which is exactly what you would
      // type after `cd` into the run directory.
      item.title = `${entry.folder}/${entry.fileName}`;
      list.append(item);
    }
    this.outputHost.append(list);
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

interface Section {
  element: HTMLDivElement;
  /** Everything below the heading. Collapsing hides this, never the heading. */
  body: HTMLDivElement;
  /**
   * Open it from code. An action that produces content inside a collapsed
   * section must reveal it: pressing "Animation…" and getting a list you cannot
   * see is worse than the button not working, because it looks like nothing
   * happened.
   */
  setOpen(open: boolean): void;
}

/**
 * A collapsible section.
 *
 * The panel grew to eleven sections, which on a short window pushed the last of
 * them — Output, the one you press *last* — below the fold. Collapsing is the
 * fix that scales: the headings stay, so nothing becomes unfindable, and the
 * sections you are not using stop costing height.
 *
 * The ones that start closed are the ones you visit occasionally (viewport
 * presets, animations, the queue, the shortcut list). The ones on the main path
 * start open.
 */
function section(title: string, startOpen = true): Section {
  const element = div('ua-section');
  const heading = document.createElement('h3');
  heading.className = 'ua-section__heading';

  const caret = document.createElement('span');
  caret.className = 'ua-section__caret';
  const label = document.createElement('span');
  label.textContent = title;
  heading.append(caret, label);

  const body = div('ua-section__body');
  let open = startOpen;

  const apply = (): void => {
    body.hidden = !open;
    caret.textContent = open ? '▾' : '▸';
    heading.setAttribute('aria-expanded', String(open));
  };

  // A heading is a real button, so it is reachable by keyboard and announced as
  // expandable rather than being a div that happens to respond to clicks.
  heading.setAttribute('role', 'button');
  heading.tabIndex = 0;
  heading.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    open = !open;
    apply();
  });
  heading.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open = !open;
    apply();
  });

  apply();
  element.append(heading, body);
  return {
    element,
    body,
    setOpen: (next: boolean) => {
      open = next;
      apply();
    },
  };
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

/** Enough panel to be worth having on screen: title bar plus a few controls. */
const MIN_PANEL_HEIGHT = 220;

/**
 * Gap kept below the panel. The drag clamp and the height calculation must use
 * the *same* margin: when they disagreed, dragging to the very bottom left the
 * panel one pixel past the fold — which a test caught, and which is the same
 * class of bug at any size.
 */
const PANEL_MARGIN = 16;

/**
 * Keep the panel inside the window from wherever its top edge now is.
 *
 * The CSS `max-height: calc(100vh - 32px)` is only correct while the panel sits
 * at its starting `top: 16px`. Drag it down and the limit no longer matches the
 * space left below it, so the bottom of the panel — the Output section, the one
 * you press last — goes off screen with no way to scroll to it.
 */
function fitToViewport(panel: HTMLElement): void {
  const top = panel.getBoundingClientRect().top;
  const available = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - top - PANEL_MARGIN);
  panel.style.maxHeight = `${String(Math.round(available))}px`;
}

/**
 * Drag the bottom edge to resize.
 *
 * The height is set on the *body* rather than the panel, so the title bar and
 * the resize handle keep their own height and the scrolling region is what
 * grows and shrinks. Clamped to the window, so a drag downwards cannot push the
 * handle out of reach of the pointer that is dragging it.
 */
function makeResizable(panel: HTMLElement, body: HTMLElement, handle: HTMLElement): void {
  let resizing = false;
  let startY = 0;
  let startHeight = 0;

  handle.addEventListener('pointerdown', (event) => {
    resizing = true;
    startY = event.clientY;
    startHeight = body.getBoundingClientRect().height;
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });

  handle.addEventListener('pointermove', (event) => {
    if (!resizing) return;
    const panelTop = panel.getBoundingClientRect().top;
    const chrome = panel.getBoundingClientRect().height - body.getBoundingClientRect().height;
    const room = window.innerHeight - panelTop - PANEL_MARGIN - chrome;
    const wanted = startHeight + (event.clientY - startY);
    const height = Math.min(Math.max(80, wanted), Math.max(80, room));
    body.style.height = `${String(Math.round(height))}px`;
    // A height that was asked for beats the cap that was assumed.
    panel.style.maxHeight = 'none';
    event.stopPropagation();
  });

  const stop = (event: PointerEvent): void => {
    if (!resizing) return;
    resizing = false;
    handle.releasePointerCapture?.(event.pointerId);
  };
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
}

/** Drag by the title bar. Position is clamped so the panel cannot be lost. */
function makeDraggable(panel: HTMLElement, handle: HTMLElement): void {
  // A window that shrinks — a rotated phone, a split editor — must not strand
  // the bottom of the panel either.
  window.addEventListener('resize', () => fitToViewport(panel));
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
    // Leave room for a usable panel rather than for a title bar alone. Dragging
    // to `innerHeight - 40` left 40px of panel on screen and everything else
    // below the fold, with no way to scroll to it.
    const maxY = Math.max(0, window.innerHeight - MIN_PANEL_HEIGHT - PANEL_MARGIN);
    const x = Math.min(Math.max(0, event.clientX - offsetX), maxX);
    const y = Math.min(Math.max(0, event.clientY - offsetY), maxY);
    panel.style.left = `${String(Math.round(x))}px`;
    panel.style.top = `${String(Math.round(y))}px`;
    panel.style.right = 'auto';
    fitToViewport(panel);
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
