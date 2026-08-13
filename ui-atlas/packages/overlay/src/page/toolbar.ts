import type {
  AnimationInventoryResult,
  ElementIdentity,
  OutputSummaryResult,
  OverlaySession,
  QueueJob,
  StateName,
} from '@ui-atlas/protocol';
import {
  COMPLETE_HOLD_MS,
  parseJobProgress,
  type CaptureProgressChange,
  type CaptureProgressView,
} from './capture-progress.js';
import { FLOW_INSTRUCTIONS, nextStep, type FlowAdvice } from './flow.js';

export interface CaptureIntent {
  kind: 'element' | 'viewport' | 'full-page';
  states: StateName[];
  responsive: boolean;
  includeOverlay: boolean;
  label?: string;
}

export type SelectionMove = 'parent' | 'child' | 'previous' | 'next';

/**
 * The four beats of the one sequence this tool has, as design 3a draws them:
 * a segmented control at the top rather than a rail down the side.
 *
 * They are *not* tabs. Every block is on screen at once — the control says
 * where you are, and pressing one takes you to that block. A capture that
 * finishes while you are looking at the states grid still lands visibly in the
 * captured list, which is the whole reason 5a's row animation exists.
 */
export type StepId = 'pick' | 'states' | 'capture' | 'review';

/** Which states each filter offers. `all` is every state the host allows. */
export type StateFilter = 'interactive' | 'form' | 'all';

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
  /**
   * The completion hold is over. The panel asks to be put back to Ready rather
   * than doing it itself, so one place owns the run's state.
   */
  onCaptureSettled(): void;
  /** Drop the captures that have not started yet. */
  onStopCapture(): void;
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
 * Nine cards at 340pt is four rows of scrolling before you reach the button.
 * The filter is what keeps the grid the size of what you are doing — the same
 * argument the tabs used to make, applied to the one list that is actually long.
 */
const STATE_FILTERS: Record<StateFilter, StateName[]> = {
  interactive: ['default', 'hover', 'focus', 'focus-visible', 'active'],
  form: ['default', 'checked', 'selected', 'expanded', 'disabled'],
  all: CAPTURABLE_STATES,
};

/**
 * The inspector's chrome, as design 3a: a 340pt panel with one segmented
 * control for the step, a grid of state cards, and the captured list under it.
 * Every control maps to one host operation; nothing in here touches the page's
 * own DOM.
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
  private jobs: QueueJob[] = [];

  private readonly runLabel: HTMLSpanElement;
  private readonly stepStrip: HTMLDivElement;
  private readonly stepButtons = new Map<StepId, HTMLButtonElement>();
  private readonly flowHost: HTMLDivElement;
  private readonly helpSheet: HTMLDivElement;
  private readonly helpButton: HTMLButtonElement;
  private readonly instructionsHost: HTMLDivElement;
  private readonly shortcutHost: HTMLDivElement;
  private readonly inspectButton: HTMLButtonElement;
  private readonly boxModelButton: HTMLButtonElement;
  private readonly targetHost: HTMLDivElement;
  private readonly treeRow: HTMLDivElement;
  private readonly detailsHost: HTMLDivElement;

  private readonly stateBlock: HTMLDivElement;
  private readonly stateCount: HTMLSpanElement;
  private readonly stateFilterStrip: HTMLDivElement;
  private stateFilter: StateFilter = 'interactive';
  private readonly stateGrid: HTMLDivElement;
  private previewing: StateName | undefined;

  private readonly captureBlock: HTMLDivElement;
  private readonly viewportStrip: HTMLDivElement;
  private readonly captureRow: HTMLDivElement;
  private readonly secondaryRow: HTMLDivElement;
  private readonly widthInput: HTMLInputElement;
  private readonly heightInput: HTMLInputElement;

  private readonly reviewBlock: HTMLDivElement;
  private readonly shotList: HTMLUListElement;
  private readonly animationHost: HTMLDivElement;
  private animations: AnimationInventoryResult | undefined;
  private animationsPending = false;
  private readonly outputHost: HTMLDivElement;
  private output: OutputSummaryResult | undefined;
  private outputPending = false;
  private reviewed = false;

  private compact = false;
  private readonly compactToggle: HTMLButtonElement;
  private readonly compactHost: HTMLDivElement;
  private readonly noticeHost: HTMLDivElement;

  /* --- Capture progress, design 5a ---------------------------------------- */
  private readonly progressBar: HTMLDivElement;
  private readonly progressFill: HTMLDivElement;
  /** Every state change is spoken here too; nothing is conveyed by motion alone. */
  private readonly liveRegion: HTMLDivElement;
  private readonly capturedCount: HTMLSpanElement;
  /**
   * The footer control is created once and kept.
   *
   * Rebuilding it on every render would throw away keyboard focus mid-run and
   * restart its transitions, which is exactly when someone is watching it.
   */
  private readonly captureButton: HTMLButtonElement;
  private readonly stopButton: HTMLButtonElement;
  private progress: CaptureProgressView = {
    phase: 'idle',
    progress: 0,
    position: 0,
    total: 0,
    captured: 0,
    failed: 0,
    active: [],
    announcement: '',
  };
  /** Rows already on screen, so a redraw does not re-animate an old row. */
  private readonly seenJobs = new Set<string>();
  private readonly enteringJobs = new Set<string>();
  private completeTimer: ReturnType<typeof setTimeout> | undefined;
  private lastCount = 0;
  /** The last shot of each state in this run, so a card can show what it got. */
  private readonly stateShots = new Map<string, string>();

  constructor(root: ShadowRoot, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;

    this.element = div('ua-panel');

    /* --- Title bar ------------------------------------------------------- */
    const titlebar = div('ua-titlebar');
    // Help on the left, collapse on the right, name in the middle: the layout
    // 3a draws, and the reason "How this works" no longer costs a quarter of
    // the panel — it is a sheet behind a button rather than a section.
    this.helpButton = button('?', () => this.setHelpOpen(this.helpSheet.hidden));
    this.helpButton.className = 'ua-btn ua-btn--glyph';
    this.helpButton.title = 'How this works';
    // A glyph is not a name. Screen reader users get the same words the
    // tooltip gives everyone else.
    this.helpButton.setAttribute('aria-label', 'How this works');
    this.helpButton.setAttribute('aria-expanded', 'false');
    this.helpButton.addEventListener('pointerdown', (event) => event.stopPropagation());

    const centre = div('ua-titlebar__centre');
    const title = document.createElement('span');
    title.className = 'ua-title';
    title.textContent = 'UI Atlas';
    this.runLabel = document.createElement('span');
    this.runLabel.className = 'ua-run';
    this.runLabel.textContent = 'connecting…';
    centre.append(title, this.runLabel);

    this.compactToggle = button('⌄', () => this.setCompact(!this.compact));
    this.compactToggle.className = 'ua-btn ua-btn--glyph';
    this.compactToggle.title = 'Shrink to the essentials';
    this.compactToggle.setAttribute('aria-label', 'Shrink to the essentials');
    this.compactToggle.setAttribute('aria-pressed', 'false');
    this.compactToggle.addEventListener('pointerdown', (event) => event.stopPropagation());

    titlebar.append(this.helpButton, centre, this.compactToggle);
    makeDraggable(this.element, titlebar);

    /* --- Progress hairline, design 5a ------------------------------------ */
    this.progressBar = div('ua-progress');
    this.progressFill = div('ua-progress__fill');
    this.progressBar.append(this.progressFill);
    this.progressBar.hidden = true;
    this.progressBar.setAttribute('role', 'progressbar');
    this.progressBar.setAttribute('aria-valuemin', '0');
    this.progressBar.setAttribute('aria-valuemax', '100');

    this.liveRegion = div('ua-live');
    this.liveRegion.setAttribute('aria-live', 'polite');
    this.liveRegion.setAttribute('aria-atomic', 'true');

    const body = div('ua-body');

    /* --- Step control ---------------------------------------------------- */
    this.stepStrip = div('ua-steps');
    for (const [id, label] of STEP_LABELS) {
      const control = button(label, () => this.goToStep(id));
      control.className = 'ua-seg__item';
      this.stepButtons.set(id, control);
      this.stepStrip.append(control);
    }
    this.stepStrip.className = 'ua-seg ua-steps';

    // One line of guidance under the control. The design has no room for a
    // paragraph, and after 3a the segmented control carries most of it — but
    // "what do I do now" is the question a first-time user actually has, so it
    // stays as a caption rather than disappearing.
    this.flowHost = div('ua-flow');

    this.helpSheet = div('ua-help-sheet');
    this.helpSheet.hidden = true;
    this.instructionsHost = div('ua-steps-list');
    this.shortcutHost = div('ua-help');
    this.helpSheet.append(this.instructionsHost, this.shortcutHost);

    this.noticeHost = div('ua-notices');
    this.compactHost = div('ua-compact');

    /* --- Pick ------------------------------------------------------------ */
    const pickBlock = div('ua-block');
    this.targetHost = div('ua-target');
    this.treeRow = div('ua-row');
    this.detailsHost = div('ua-details');
    pickBlock.append(this.targetHost, this.treeRow, this.detailsHost);

    this.inspectButton = button('Inspect', () => this.callbacks.onToggleInspect());
    this.inspectButton.setAttribute('aria-pressed', 'false');
    this.boxModelButton = button('Box', () => {
      this.boxModel = !this.boxModel;
      this.boxModelButton.setAttribute('aria-pressed', String(this.boxModel));
      this.callbacks.onToggleBoxModel(this.boxModel);
    });
    this.boxModelButton.setAttribute('aria-pressed', 'false');
    this.boxModelButton.title = 'Show the box model on the highlighted element.';

    /* --- States ---------------------------------------------------------- */
    this.stateBlock = div('ua-block');
    const stateHead = div('ua-block__head');
    const stateTitle = document.createElement('span');
    stateTitle.className = 'ua-block__title';
    stateTitle.textContent = 'States';
    this.stateCount = document.createElement('span');
    this.stateCount.className = 'ua-block__note';
    this.stateFilterStrip = div('ua-seg ua-seg--quiet');
    stateHead.append(stateTitle, this.stateCount, this.stateFilterStrip);
    this.stateGrid = div('ua-cards');
    this.stateBlock.append(stateHead, this.stateGrid);

    /* --- Capture --------------------------------------------------------- */
    this.captureBlock = div('ua-block');
    const captureHead = div('ua-block__head');
    const captureTitle = document.createElement('span');
    captureTitle.className = 'ua-block__title';
    captureTitle.textContent = 'Viewport';
    this.viewportStrip = div('ua-seg ua-seg--quiet');
    captureHead.append(captureTitle, this.viewportStrip);

    const customRow = div('ua-row ua-row--quiet');
    this.widthInput = numberInput(1440);
    this.heightInput = numberInput(1000);
    const applyButton = button('Apply', () => {
      const width = Number(this.widthInput.value);
      const height = Number(this.heightInput.value);
      if (Number.isFinite(width) && Number.isFinite(height)) {
        this.callbacks.onSetViewport(Math.round(width), Math.round(height));
      }
    });
    applyButton.className = 'ua-btn ua-btn--quiet';
    customRow.append(this.widthInput, this.heightInput, applyButton);

    this.captureButton = button('Capture', () => this.pressCapture());
    this.captureButton.className = 'ua-btn ua-btn--primary ua-btn--capture';

    // Stop is its own control, beside the one that is busy, because it does
    // something different: the capturing variant reports, this one acts.
    this.stopButton = button('Stop', () => this.callbacks.onStopCapture());
    this.stopButton.className = 'ua-btn ua-btn--stop';
    this.stopButton.title =
      'Drops the shots that have not been taken. The one in flight finishes, ' +
      'so the state it applied is put back.';
    this.stopButton.hidden = true;

    this.captureRow = div('ua-row ua-row--capture');
    this.secondaryRow = div('ua-row ua-row--quiet');
    this.captureBlock.append(captureHead, customRow, this.captureRow, this.secondaryRow);

    /* --- Review ---------------------------------------------------------- */
    this.reviewBlock = div('ua-block');
    // Sticky: "Show in Finder" and the file count belong to the list, so they
    // stay with it however far down it you have scrolled.
    const reviewHead = div('ua-block__head ua-block__head--sticky');
    const reviewTitle = document.createElement('span');
    reviewTitle.className = 'ua-block__title';
    reviewTitle.textContent = 'Captured';
    this.capturedCount = document.createElement('span');
    this.capturedCount.className = 'ua-count';
    const finder = button('Show in Finder', () => this.callbacks.onRevealOutput('folder'));
    finder.className = 'ua-btn ua-btn--link';
    finder.title = 'Reveals the run directory on your desktop.';
    reviewHead.append(reviewTitle, this.capturedCount, finder);

    this.shotList = document.createElement('ul');
    this.shotList.className = 'ua-shots';
    this.animationHost = div('ua-anim-host');
    this.outputHost = div('ua-output');
    this.reviewBlock.append(reviewHead, this.shotList, this.animationHost, this.outputHost);

    body.append(
      this.stepStrip,
      this.flowHost,
      this.helpSheet,
      this.noticeHost,
      this.compactHost,
      pickBlock,
      hairline(),
      this.stateBlock,
      hairline(),
      this.captureBlock,
      hairline(),
      this.reviewBlock,
    );

    // A cap, plus a way past it. The panel is 620px by default rather than
    // whatever the window allows, and the handle is there for the times you
    // want more — resizing is the honest answer to "how tall should this be?",
    // because only the person looking at it knows.
    const resizeHandle = div('ua-resize');
    resizeHandle.title = 'Drag to resize';
    makeResizable(this.element, body, resizeHandle);

    this.element.append(titlebar, this.progressBar, body, this.liveRegion, resizeHandle);
    root.append(this.element);

    this.renderStateFilters();
    this.renderInstructions();
    this.renderTree();
    this.renderStates();
    this.renderSelection();
    this.renderAnimations();
    this.renderOutput();
    this.renderJobs([]);
    this.renderFlow();
    this.renderCaptureButtons();
  }

  /* ------------------------------------------------------------------------ */
  /* Host-driven updates                                                       */
  /* ------------------------------------------------------------------------ */

  setOutputPending(pending: boolean): void {
    this.outputPending = pending;
    this.renderOutput();
  }

  setOutput(summary: OutputSummaryResult | undefined): void {
    this.output = summary;
    this.outputPending = false;
    // Seeing the list *is* step 4; the flow line moves on once it has happened.
    if (summary !== undefined) this.reviewed = true;
    this.renderOutput();
    this.renderFlow();
  }

  /**
   * Take one step of the capture animation.
   *
   * Called for every `queue/update`, and for nothing else — each beat below is
   * a thing the host actually reported, not a stage in a script the panel is
   * playing to itself.
   */
  setCaptureProgress(change: CaptureProgressChange): void {
    this.progress = change.view;

    // Rows animate in only the first time they appear.
    for (const job of change.completedJobs) {
      if (!this.seenJobs.has(job.id)) this.enteringJobs.add(job.id);
      // A card can show the shot it produced once the run has produced one.
      if (job.thumbnail !== undefined) {
        for (const state of job.states) this.stateShots.set(state, job.thumbnail);
      }
    }

    if (change.runFinished) this.holdThenReset();
    else if (this.completeTimer !== undefined) {
      clearTimeout(this.completeTimer);
      this.completeTimer = undefined;
    }

    this.renderProgressBar();
    this.renderCaptureButtons();
    this.renderStates();
    this.renderSelection();
    this.announce(change.view.announcement);
  }

  /**
   * The finished control holds its result, then goes back to Ready.
   *
   * The only duration in the whole sequence the panel chooses for itself, and
   * it exists so a result can be read — not so the control can rest there.
   */
  private holdThenReset(): void {
    if (this.completeTimer !== undefined) clearTimeout(this.completeTimer);
    this.completeTimer = setTimeout(() => {
      this.completeTimer = undefined;
      this.callbacks.onCaptureSettled();
    }, COMPLETE_HOLD_MS);
  }

  /** Say it, whatever else the motion is doing. */
  private announce(message: string): void {
    if (message.length === 0 || this.liveRegion.textContent === message) return;
    this.liveRegion.textContent = message;
  }

  private renderProgressBar(): void {
    const { phase, progress, position, total } = this.progress;
    const running = phase !== 'idle';
    this.progressBar.hidden = !running;
    this.progressBar.classList.toggle('ua-progress--error', phase === 'error');
    this.progressFill.style.transform = `scaleX(${String(running ? progress : 0)})`;
    this.progressBar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    this.progressBar.setAttribute(
      'aria-label',
      total > 0 && phase === 'capturing'
        ? `Capturing ${String(position)} of ${String(total)}`
        : 'Capture progress',
    );
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

  setAnimationsPending(pending: boolean): void {
    this.animationsPending = pending;
    this.renderAnimations();
  }

  setAnimations(result: AnimationInventoryResult | undefined): void {
    this.animations = result;
    this.animationsPending = false;
    if (result !== undefined) this.goToStep('review');
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
    this.jobs = jobs;
    this.workingJobs = jobs.filter(
      (job) => job.status === 'queued' || job.status === 'running',
    ).length;
    this.renderFlow();
    this.renderShots();
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

  /** Reflect what the host actually managed to apply, not what we asked for. */
  setPreviewing(state: StateName | undefined): void {
    this.previewing = state;
    this.renderStates();
  }

  setVisible(visible: boolean): void {
    this.element.hidden = !visible;
  }

  get states(): StateName[] {
    const ordered = CAPTURABLE_STATES.filter((state) => this.selectedStates.has(state));
    return ordered.length > 0 ? ordered : ['default'];
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

  /* ------------------------------------------------------------------------ */
  /* Step control                                                              */
  /* ------------------------------------------------------------------------ */

  /** Which block the flow is pointing at right now. */
  get step(): StepId {
    switch (this.flow.step) {
      case 'connect':
      case 'inspect':
      case 'select':
        return 'pick';
      case 'capture':
        return this.selectedStates.size > 1 ? 'capture' : 'states';
      case 'working':
        return 'capture';
      default:
        return 'review';
    }
  }

  /**
   * Bring a block into view.
   *
   * Not a tab switch: everything stays on screen, because a capture landing in
   * a list you cannot see is the bug 5a's row animation exists to avoid.
   */
  goToStep(id: StepId): void {
    const block = this.blockFor(id);
    block.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    this.renderSteps(id);
  }

  private blockFor(id: StepId): HTMLElement {
    if (id === 'states') return this.stateBlock;
    if (id === 'capture') return this.captureBlock;
    if (id === 'review') return this.reviewBlock;
    return this.targetHost;
  }

  private renderSteps(active = this.step): void {
    for (const [id, control] of this.stepButtons) {
      const current = id === active;
      control.classList.toggle('ua-seg__item--on', current);
      if (current) control.setAttribute('aria-current', 'step');
      else control.removeAttribute('aria-current');
    }
  }

  private setHelpOpen(open: boolean): void {
    this.helpSheet.hidden = !open;
    this.helpButton.setAttribute('aria-expanded', String(open));
  }

  /* ------------------------------------------------------------------------ */
  /* Rendering                                                                 */
  /* ------------------------------------------------------------------------ */

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

    this.renderSteps();
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

    // Inspect, then the two moves that widen or narrow the selection, then the
    // siblings as one paired control — 3a's row, which fits at 340pt where six
    // separate buttons did not.
    this.treeRow.append(this.inspectButton);

    for (const [label, direction, title] of [
      ['Parent', 'parent', 'Select the element that contains this one.'],
      ['Child', 'child', 'Select the first element inside this one.'],
    ] as Array<[string, SelectionMove, string]>) {
      const control = button(label, () => this.callbacks.onMoveSelection(direction));
      control.disabled = !hasSelection;
      control.title = hasSelection ? title : 'Select an element first.';
      this.treeRow.append(control);
    }

    const siblings = div('ua-pair');
    for (const [label, direction, title] of [
      ['◀', 'previous', 'Select the previous sibling.'],
      ['▶', 'next', 'Select the next sibling.'],
    ] as Array<[string, SelectionMove, string]>) {
      const control = button(label, () => this.callbacks.onMoveSelection(direction));
      control.className = 'ua-btn ua-btn--pair';
      control.disabled = !hasSelection;
      control.title = hasSelection ? title : 'Select an element first.';
      control.setAttribute('aria-label', direction === 'previous' ? 'Previous sibling' : 'Next sibling');
      siblings.append(control);
    }
    this.treeRow.append(siblings, this.boxModelButton);
  }

  /**
   * The element this run is pointed at.
   *
   * The dot is the same red as the ring drawn on the element itself, and it
   * pulses for as long as anything is capturing — the panel's end of the line
   * that starts on the page.
   */
  private renderSelection(): void {
    this.targetHost.textContent = '';
    this.targetHost.classList.toggle('ua-target--busy', this.progress.phase === 'capturing');
    this.detailsHost.textContent = '';

    const dot = document.createElement('span');
    dot.className = 'ua-target__dot';
    const name = document.createElement('span');
    name.className = 'ua-target__name';

    if (this.selection === undefined) {
      this.targetHost.classList.add('ua-target--empty');
      name.textContent = this.inspectActive
        ? 'Point at an element and click'
        : 'Nothing selected';
      this.targetHost.append(dot, name);
      return;
    }

    this.targetHost.classList.remove('ua-target--empty');
    const { identity, resolution, warnings } = this.selection;
    name.textContent = describeIdentity(identity);
    name.title = identity.chosenLocator.value;

    const meta = document.createElement('span');
    meta.className = 'ua-target__state';
    meta.textContent =
      this.progress.active[0] ??
      (resolution.matches === 1 ? '1 match' : `${String(resolution.matches)} matches`);

    const clear = button('✕', () => this.callbacks.onClearSelection());
    clear.className = 'ua-btn ua-btn--glyph';
    clear.title = 'Clear the selection.';
    clear.setAttribute('aria-label', 'Clear selection');
    this.targetHost.append(dot, name, meta, clear);

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

  private renderStateFilters(): void {
    this.stateFilterStrip.textContent = '';
    for (const [id, label] of FILTER_LABELS) {
      const control = button(label, () => {
        this.stateFilter = id;
        this.renderStateFilters();
        this.renderStates();
      });
      control.className = 'ua-seg__item';
      control.classList.toggle('ua-seg__item--on', this.stateFilter === id);
      control.setAttribute('aria-pressed', String(this.stateFilter === id));
      this.stateFilterStrip.append(control);
    }
  }

  /**
   * The states grid.
   *
   * Each card does two things at once: it adds the state to the capture set and
   * applies it to the live page so you can see it. Selecting a state that does
   * nothing visible is the single most confusing thing this panel could do.
   *
   * The card is one button whose accessible name is the state, so it reads as
   * "hover, pressed" rather than as a checkbox next to an unrelated picture.
   */
  private renderStates(): void {
    this.stateGrid.textContent = '';
    const allowed = this.session?.capabilities.states;
    const offered = STATE_FILTERS[this.stateFilter].filter(
      (state) => allowed === undefined || allowed.includes(state),
    );

    for (const state of offered) {
      const selected = this.selectedStates.has(state);
      const capturing = this.progress.active.includes(state);

      // The card is one button whose name is the state and nothing else: the
      // preview and the tick are pictures of what the word already says, so
      // letting them into the accessible name would only make it longer.
      const card = button('', () => this.toggleState(state));
      card.className = 'ua-card';
      card.setAttribute('aria-label', state);
      card.setAttribute('aria-pressed', String(selected));
      card.classList.toggle('ua-card--on', selected);
      card.title = selected
        ? 'Included in the capture. Click to remove.'
        : 'Capture this state, and show it on the page now.';

      const preview = div('ua-card__preview');
      const shot = this.stateShots.get(state);
      if (shot !== undefined) {
        // Once this run has photographed the state, the card shows what it got
        // rather than a diagram of what it might get.
        const image = document.createElement('img');
        image.className = 'ua-card__image';
        image.src = shot;
        image.alt = '';
        preview.append(image);
      } else {
        const chip = document.createElement('span');
        chip.className = 'ua-card__chip';
        chip.textContent = this.selection === undefined
          ? '—'
          : shortLabel(this.selection.identity);
        preview.append(chip);
      }

      const label = div('ua-card__label');
      if (capturing) {
        card.classList.add('ua-card--capturing');
        label.append(spinner(14));
      } else {
        const box = document.createElement('span');
        box.className = 'ua-card__box';
        box.textContent = selected ? '✓' : '';
        label.append(box);
      }
      const text = document.createElement('span');
      text.className = 'ua-card__name';
      text.textContent = state;
      label.append(text);

      if (this.previewing === state) {
        const live = document.createElement('span');
        live.className = 'ua-card__live';
        live.textContent = 'live';
        label.append(live);
      }

      card.append(preview, label);
      this.stateGrid.append(card);
    }

    const count = this.states.length;
    this.stateCount.textContent = `${String(count)} selected`;
  }

  private toggleState(state: StateName): void {
    if (this.selectedStates.has(state)) {
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
  }

  private renderViewportPresets(): void {
    this.viewportStrip.textContent = '';
    for (const preset of this.session?.viewportPresets ?? []) {
      const control = button(String(preset.width), () => {
        this.widthInput.value = String(preset.width);
        this.heightInput.value = String(preset.height);
        this.callbacks.onSetViewport(preset.width, preset.height, preset.name);
        this.renderViewportPresets();
      });
      control.className = 'ua-seg__item';
      control.title = `${preset.name ?? 'preset'} · ${String(preset.width)}×${String(preset.height)}`;
      control.setAttribute('aria-label', `${String(preset.width)} wide`);
      this.viewportStrip.append(control);
    }
  }

  /** The footer control's one action, whichever variant it is wearing. */
  private pressCapture(): void {
    const states = this.states;
    this.callbacks.onCapture({
      kind: 'element',
      states,
      responsive: false,
      includeOverlay: false,
      label: `element · ${states.join(', ')}`,
    });
  }

  /**
   * The footer control, as one component with six conditions.
   *
   * Ready, pressed and keyboard focus are the base button and its own CSS
   * states; capturing, complete, error and disabled are `data-phase` variants
   * of the same element. Each carries a glyph as well as a tint, so the status
   * survives being unable to tell the tints apart.
   */
  private renderFooterControl(): void {
    const hasSelection = this.selection !== undefined;
    const states = this.states;
    const { phase, position, total, captured, failed } = this.progress;
    const control = this.captureButton;

    control.textContent = '';
    control.dataset['phase'] = phase;
    control.disabled = phase === 'capturing' || !hasSelection;
    // Only offered while there is something it could stop.
    this.stopButton.hidden = phase !== 'capturing';

    if (phase === 'capturing') {
      control.append(spinner(15), label(`Capturing… ${String(position)} of ${String(total)}`));
      control.title = 'The host is photographing the states you picked.';
      return;
    }
    if (phase === 'complete') {
      control.append(tickGlyph(15), label(shots(captured, 'captured')));
      control.title = 'Finished. This returns to Ready in a moment.';
      return;
    }
    if (phase === 'error') {
      control.append(warningGlyph(15), label(shots(failed, 'failed')));
      control.title = 'Something did not come out. Press to try again.';
      return;
    }
    if (!hasSelection) {
      control.append(label('Select an element'));
      control.title = 'Select an element first.';
      return;
    }
    control.append(
      label(
        states.length === 1
          ? `Capture ${states[0] ?? 'default'}`
          : `Capture ${String(states.length)} states`,
      ),
    );
    control.title = `Captures ${states.join(', ')} for the selected element.`;
  }

  private renderCaptureButtons(): void {
    this.renderFooterControl();
    this.captureRow.textContent = '';
    this.secondaryRow.textContent = '';
    const hasSelection = this.selection !== undefined;

    const animation = button('Animation…', () => this.callbacks.onListAnimations());
    animation.disabled = this.session?.capabilities.animation !== true;
    animation.title =
      this.session?.capabilities.animation === true
        ? 'Lists what moves on this page, and what can be done with each.'
        : 'Animation capture is not enabled for this session.';

    this.captureRow.append(this.captureButton, this.stopButton, animation);

    // The other capture kinds. 3a shows only the primary and Animation; these
    // are real capabilities, so they keep a row rather than disappearing.
    const viewport = button('Viewport', () =>
      this.callbacks.onCapture({
        kind: 'viewport',
        states: ['default'],
        responsive: false,
        includeOverlay: false,
      }),
    );
    viewport.className = 'ua-btn ua-btn--quiet';

    const fullPage = button('Full page', () =>
      this.callbacks.onCapture({
        kind: 'full-page',
        states: ['default'],
        responsive: false,
        includeOverlay: false,
      }),
    );
    fullPage.className = 'ua-btn ua-btn--quiet';
    fullPage.disabled = this.session?.capabilities.fullPage !== true;

    const responsive = button('Responsive set', () =>
      this.callbacks.onCapture({
        kind: hasSelection ? 'element' : 'viewport',
        states: ['default'],
        responsive: true,
        includeOverlay: false,
        label: 'responsive set',
      }),
    );
    responsive.className = 'ua-btn ua-btn--quiet';
    responsive.disabled = this.session?.capabilities.responsive !== true;

    this.secondaryRow.append(viewport, fullPage, responsive);
  }

  /**
   * The captured list: what this run has written, newest first.
   *
   * A row is inserted when a job finishes and never before — the list reserves
   * no blank slot, because a slot that is waiting for a file is a promise the
   * panel cannot keep if the capture fails.
   */
  private renderShots(): void {
    this.shotList.textContent = '';
    const jobs = this.jobs;

    if (jobs.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ua-empty';
      empty.textContent = 'No captures yet.';
      this.shotList.append(empty);
      this.renderCapturedCount(jobs);
      return;
    }

    for (const job of jobs.slice(-12).reverse()) {
      const item = document.createElement('li');
      item.className = `ua-shot ua-shot--${job.status}`;

      // Only a row that has never been drawn animates in.
      if (this.enteringJobs.has(job.id)) {
        item.classList.add('ua-shot--entering');
        this.enteringJobs.delete(job.id);
      }
      this.seenJobs.add(job.id);

      const thumb = div('ua-shot__thumb');
      thumb.setAttribute('aria-hidden', 'true');
      if (job.thumbnail !== undefined && isInlinePng(job.thumbnail)) {
        // Checked again here, not only in the schema: this element lives in the
        // site's own document, where anything but a `data:` URI would be a
        // request made from the site's origin.
        const image = document.createElement('img');
        image.className = 'ua-shot__image';
        image.src = job.thumbnail;
        image.alt = '';
        thumb.append(image);
      } else {
        // No preview is a real answer — a recording has no still, and a page
        // too large to decode cheaply has none either.
        thumb.textContent = job.kind === 'element' ? 'el' : job.kind === 'viewport' ? 'vp' : '⤢';
      }

      const text = div('ua-shot__text');
      const name = document.createElement('span');
      name.className = 'ua-shot__name';
      name.textContent = job.fileNames[0] ?? job.label;
      const meta = document.createElement('span');
      meta.className = 'ua-shot__meta';
      meta.textContent =
        job.progress ??
        `${job.states.join(', ')} · ${this.pageLabel}`;
      text.append(name, meta);

      item.append(thumb, text, progressRing(job));
      if (job.error !== undefined) item.title = `${job.error.code}: ${job.error.message}`;
      else if (job.warnings.length > 0) item.title = job.warnings.join('\n');
      this.shotList.append(item);
    }

    // The live row 3a draws at the foot of the list, so "something is happening"
    // has a home that is not the button.
    if (this.workingJobs > 0) {
      const activity = document.createElement('li');
      activity.className = 'ua-shot ua-shot--activity';
      const dot = div('ua-shot__pulse');
      const text = document.createElement('span');
      text.className = 'ua-shot__meta';
      text.textContent =
        this.workingJobs === 1
          ? 'Capturing active'
          : `Capturing active · ${String(this.workingJobs - 1)} queued`;
      activity.append(dot, text);
      this.shotList.append(activity);
    }

    this.renderCapturedCount(jobs);
  }

  /** The file count, crossfading to each new number rather than snapping. */
  private renderCapturedCount(jobs: QueueJob[]): void {
    let files = 0;
    for (const job of jobs) files += job.captureIds.length;

    const changed = files !== this.lastCount;
    this.lastCount = files;
    this.capturedCount.textContent = '';
    const value = document.createElement('span');
    value.className = 'ua-count__value';
    value.textContent = `${String(files)} ${files === 1 ? 'file' : 'files'}`;
    this.capturedCount.classList.toggle('ua-count--changed', changed && files > 0);
    this.capturedCount.append(value);
  }

  /**
   * What is moving here, and the one action that will work for each.
   *
   * The rule this panel exists to keep: an animation that cannot be sampled
   * gets **the inventory's own reason** and no Sample button, rather than a
   * button that would produce a frame the site never shows.
   */
  private renderAnimations(): void {
    this.animationHost.textContent = '';
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
      title.textContent =
        animation.target === undefined
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
      const note = div('ua-section ua-hint');
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
   * Every file in the run, not only the ones this panel started.
   *
   * The captured list above shows this session's jobs; a run can also contain
   * captures from a crawl or an earlier page. It shows names rather than a path
   * on purpose: a file name is derived from the site's own content, where an
   * absolute path would hand the page the user's home directory.
   */
  private renderOutput(): void {
    this.outputHost.textContent = '';

    const row = div('ua-row ua-row--quiet');
    const refresh = button(this.output === undefined ? 'All files in this run' : 'Refresh', () =>
      this.callbacks.onRefreshOutput(),
    );
    refresh.className = 'ua-btn ua-btn--quiet';
    refresh.disabled = this.outputPending;
    refresh.title = 'Lists every file this run has written so far.';

    const report = button('Open report', () => this.callbacks.onRevealOutput('report'));
    report.className = 'ua-btn ua-btn--quiet';
    report.title = 'Builds the browsable report from what is captured so far, and opens it.';

    row.append(refresh, report);
    this.outputHost.append(row);

    if (this.outputPending) {
      const busy = div('ua-hint');
      busy.textContent = 'Reading the run…';
      this.outputHost.append(busy);
      return;
    }
    if (this.output === undefined) return;

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

  private renderHelp(): void {
    this.shortcutHost.textContent = '';
    const shortcuts = this.session?.shortcuts ?? {};
    for (const [action, combo] of Object.entries(shortcuts)) {
      const key = document.createElement('kbd');
      key.textContent = combo;
      const label = document.createElement('span');
      label.textContent = humanise(action);
      this.shortcutHost.append(key, label);
    }
  }

  /**
   * Shrink to the step line and the capture controls.
   *
   * The capture row is *moved* rather than copied — two rows of buttons that
   * both claim to capture would be two things to keep in sync, and one of them
   * would eventually lie.
   */
  setCompact(next: boolean): void {
    this.compact = next;
    this.element.classList.toggle('ua-panel--compact', next);
    this.compactToggle.setAttribute('aria-pressed', String(next));
    this.compactToggle.textContent = next ? '⌃' : '⌄';
    const label = next ? 'Show the whole panel' : 'Shrink to the essentials';
    this.compactToggle.title = label;
    this.compactToggle.setAttribute('aria-label', label);

    if (next) this.compactHost.append(this.captureRow);
    else this.captureBlock.append(this.captureRow);
    this.renderCaptureButtons();
  }
}

const STEP_LABELS: Array<[StepId, string]> = [
  ['pick', 'Pick'],
  ['states', 'States'],
  ['capture', 'Capture'],
  ['review', 'Review'],
];

const FILTER_LABELS: Array<[StateFilter, string]> = [
  ['interactive', 'Interactive'],
  ['form', 'Form'],
  ['all', 'All'],
];

function div(className: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = className;
  return element;
}

function hairline(): HTMLDivElement {
  return div('ua-hairline');
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.className = 'ua-btn';
  element.type = 'button';
  element.textContent = text;
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

/** `button.save`-style, from what the element already told us about itself. */
function describeIdentity(identity: ElementIdentity): string {
  const tag = identity.tagName.toLowerCase();
  const name = identity.accessibleName;
  return name === undefined || name.length === 0 ? tag : `${tag} · ${name}`;
}

/** The miniature the state cards draw before there is a real shot to show. */
function shortLabel(identity: ElementIdentity): string {
  const name = identity.accessibleName;
  if (name !== undefined && name.length > 0) return name.slice(0, 18);
  return identity.tagName.toLowerCase();
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(size: number, className: string): SVGSVGElement {
  const element = document.createElementNS(SVG_NS, 'svg');
  element.setAttribute('width', String(size));
  element.setAttribute('height', String(size));
  element.setAttribute('viewBox', '0 0 15 15');
  element.setAttribute('class', className);
  // The glyph repeats what the label already says; announcing it twice is noise.
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function shape(tag: 'circle' | 'path', attributes: Record<string, string>): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

function label(text: string): HTMLSpanElement {
  const element = document.createElement('span');
  element.textContent = text;
  return element;
}

/** Turning while the host works; still and legible under Reduce Motion. */
function spinner(size: number): SVGSVGElement {
  const element = svg(size, 'ua-spinner');
  element.append(
    shape('circle', {
      cx: '7.5',
      cy: '7.5',
      r: '6',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-opacity': '0.25',
      'stroke-width': '2',
    }),
    shape('path', {
      d: 'M7.5 1.5 A6 6 0 0 1 13.5 7.5',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
    }),
  );
  return element;
}

function tickGlyph(size: number): SVGSVGElement {
  const element = svg(size, 'ua-glyph');
  element.append(
    shape('circle', {
      cx: '7.5',
      cy: '7.5',
      r: '6.6',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-opacity': '0.4',
      'stroke-width': '1.4',
    }),
    shape('path', {
      d: 'M4.4 7.8 L6.5 9.9 L10.7 5.3',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.7',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }),
  );
  return element;
}

function warningGlyph(size: number): SVGSVGElement {
  const element = svg(size, 'ua-glyph');
  element.append(
    shape('circle', {
      cx: '7.5',
      cy: '7.5',
      r: '6.6',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-opacity': '0.4',
      'stroke-width': '1.4',
    }),
    shape('path', {
      d: 'M7.5 4 V8.4',
      stroke: 'currentColor',
      'stroke-width': '1.7',
      'stroke-linecap': 'round',
    }),
    shape('circle', { cx: '7.5', cy: '10.8', r: '0.9', fill: 'currentColor' }),
  );
  return element;
}

/** Circumference of the r=6 ring the fill is drawn on. */
const RING_LENGTH = 37.7;
/** Length of the checkmark path, so it can be drawn rather than revealed. */
const TICK_LENGTH = 17;

/**
 * The ring on the right of a row: how much of this job is written.
 *
 * The offset comes from the job's own per-state progress, so it advances when
 * a file lands rather than on a schedule. When the job finishes, the ring is
 * closed and the checkmark draws itself over 140ms.
 */
function progressRing(job: QueueJob): SVGSVGElement {
  const element = svg(15, `ua-shot__ring${job.status === 'failed' ? ' ua-shot__ring--failed' : ''}`);
  element.append(
    shape('circle', {
      class: 'ua-ring__track',
      cx: '7.5',
      cy: '7.5',
      r: '7',
      fill: 'none',
      'stroke-width': '1.4',
    }),
  );

  const reported = parseJobProgress(job.progress);
  const finished = job.status === 'done';
  const fraction = finished
    ? 1
    : reported === undefined
      ? 0
      : Math.max(0, reported.index - 1) / Math.max(1, reported.total);

  element.append(
    shape('circle', {
      class: 'ua-ring__fill',
      cx: '7.5',
      cy: '7.5',
      r: '6',
      fill: 'none',
      'stroke-width': '1.6',
      'stroke-linecap': 'round',
      'stroke-dasharray': String(RING_LENGTH),
      'stroke-dashoffset': String(RING_LENGTH * (1 - fraction)),
      transform: 'rotate(-90 7.5 7.5)',
    }),
  );

  if (finished) {
    element.append(
      shape('path', {
        class: 'ua-ring__tick',
        d: 'M4.4 7.8 L6.5 9.9 L10.7 5.3',
        fill: 'none',
        'stroke-width': '1.6',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-dasharray': String(TICK_LENGTH),
        'stroke-dashoffset': String(TICK_LENGTH),
      }),
    );
  }
  return element;
}

function shots(count: number, verb: 'captured' | 'failed'): string {
  return `${String(count)} ${count === 1 ? 'shot' : 'shots'} ${verb}`;
}

/** The host is the only producer of these, and this is what says so. */
function isInlinePng(value: string): boolean {
  return /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u.test(value);
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
 * space left below it, so the bottom of the panel — the captured list, the one
 * you look at last — goes off screen with no way to scroll to it.
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
