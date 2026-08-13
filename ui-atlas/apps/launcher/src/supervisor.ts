/**
 * The part that actually removes the two terminal windows.
 *
 * It runs the same commands they ran — a build, then `ui-atlas inspect` — as
 * child processes, and turns their output into the events the popover renders.
 * The capture engine is untouched: nothing here is a daemon, a port, or a new
 * protocol. That was the condition the design set for this stage, and it is
 * also what makes the launcher droppable if it turns out to be the wrong idea.
 *
 * Node comes from `process.execPath` with `ELECTRON_RUN_AS_NODE`, so the only
 * runtime requirement is the Electron binary itself. A GUI process launched
 * from Finder inherits almost no PATH, and "works from a terminal, fails from
 * the Dock" is precisely the class of bug this whole feature exists to end.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { BUILD_OUTPUTS, BUILD_STEPS, buildNote, decideBuild, type BuildDecision } from './build-plan.js';
import { createLineSplitter, readProgress, type ProgressSignal } from './progress.js';
import { hostOf } from './signin.js';
import type { LauncherEvent, RunMode, SignInPrompt } from './startup.js';

export interface InspectTarget {
  url: string;
  profile: string | undefined;
  /** `clean` when no profile is chosen; the CLI's own default otherwise. */
  mode: 'clean' | 'profile' | 'storage-state' | undefined;
  persistent: boolean;
}

export interface SupervisorOptions {
  workspaceRoot: string;
  onEvent: (event: LauncherEvent) => void;
  /** Every line from every child, in order, for the `Show log` disclosure. */
  onLog: (line: string) => void;
  /** A one-shot run finished; there is no window left open to say so. */
  onFinished?: (result: { ok: boolean; runDir: string | undefined }) => void;
  now?: () => number;
}

/** Enough to diagnose a failed launch, bounded so a long run cannot grow forever. */
const LOG_LIMIT = 500;

/** What `tsc -b` and the two bundle scripts actually consume. */
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mjs', '.json', '.html'] as const;

export class Supervisor {
  private readonly options: SupervisorOptions;
  private readonly now: () => number;
  private child: ChildProcess | undefined;
  private readonly lines: string[] = [];
  /** Set once the panel is up, so a child exiting is a stop and not a failure. */
  private ready = false;
  /** Guards against a second `start` while one is in flight. */
  private busy = false;
  /** True for `capture` and `crawl`, which end by themselves. */
  private oneShot = false;
  private lastRunDir: string | undefined;
  /** Target details the sign-in card needs, remembered from the last `start`. */
  private host = '';
  private profile: string | undefined;

  constructor(options: SupervisorOptions) {
    this.options = options;
    this.now = options.now ?? Date.now;
  }

  get log(): readonly string[] {
    return this.lines;
  }

  /** The run directory of the session in flight, for `Show captures in Finder`. */
  get runDir(): string | undefined {
    return this.lastRunDir;
  }

  get running(): boolean {
    return this.child !== undefined;
  }

  /**
   * Look at the build without launching anything, so the cold card can say
   * what this particular Start is going to cost. Cheap: four `stat` calls and
   * four more on the source directories.
   */
  async checkBuild(): Promise<void> {
    if (this.busy || this.child !== undefined) return;
    const decision = await this.decideBuild();
    this.emit({ kind: 'build-checked', buildNeeded: decision.needed });
  }

  /**
   * `command` overrides what the engine runs — the extension's Page and
   * Whole-site modes send `capture` and `crawl` instead of `inspect`. Those are
   * one-shot: they end by themselves, so the run *completing* is success rather
   * than the process having died before a panel appeared.
   */
  async start(target: InspectTarget, command?: readonly string[]): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    // Pressing Open inspector while a session is already up used to spawn a
    // second one and lose track of the first: its browser stayed open with
    // nothing owning it. One launcher, one run.
    if (this.child !== undefined) this.kill();
    this.ready = false;
    this.lastRunDir = undefined;
    this.lines.length = 0;
    this.setTarget(target);

    const argv = command ?? ['inspect', target.url, '--auto-inspect'];
    const verb = argv[0];
    this.oneShot = verb !== 'inspect';
    const mode: RunMode = verb === 'crawl' ? 'crawl' : verb === 'capture' ? 'capture' : 'inspect';

    try {
      const decision = await this.decideBuild();
      this.emit({ kind: 'start', at: this.now(), buildNeeded: decision.needed, mode });

      if (decision.needed) {
        this.emit({ kind: 'stage-began', at: this.now(), stage: 'build' });
        for (const step of BUILD_STEPS) {
          this.emit({ kind: 'stage-note', stage: 'build', note: step.label });
          const code = await this.runToCompletion(step.args);
          if (code !== 0) {
            this.emit({
              kind: 'failed',
              at: this.now(),
              stage: 'build',
              message: `${step.label} exited with code ${String(code)}`,
            });
            return;
          }
        }
        this.emit({ kind: 'stage-done', at: this.now(), stage: 'build' });
      } else {
        this.emit({ kind: 'stage-skipped', at: this.now(), stage: 'build' });
        this.emit({ kind: 'stage-note', stage: 'build', note: buildNote(decision) });
      }

      this.emit({ kind: 'stage-began', at: this.now(), stage: 'engine' });
      this.spawnEngine(target, argv);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Open a real window and wait for the sign-in to land. The engine is stopped
   * first: two Chromium windows against the same profile is how a half-written
   * session gets saved.
   */
  async signIn(target: InspectTarget): Promise<number> {
    if (target.profile === undefined) return 1;
    this.kill();
    const args = ['apps/cli/dist/bin.js', 'auth', 'save', target.profile, target.url, '--wait-for-signin'];
    if (target.persistent) args.push('--persistent');
    return this.runToCompletion(args);
  }

  cancel(): void {
    this.kill();
    this.emit({ kind: 'cancelled', at: this.now() });
  }

  stop(): void {
    this.kill();
    this.emit({ kind: 'stopped', at: this.now() });
  }

  private kill(): void {
    const child = this.child;
    this.child = undefined;
    this.ready = false;
    if (child === undefined) return;
    child.kill('SIGTERM');
    // Chromium occasionally ignores a TERM while it is starting up.
    const timer = setTimeout(() => child.kill('SIGKILL'), 4_000);
    timer.unref?.();
  }

  private emit(event: LauncherEvent): void {
    this.options.onEvent(event);
  }

  private record(line: string): void {
    if (line.trim().length === 0) return;
    this.lines.push(line);
    if (this.lines.length > LOG_LIMIT) this.lines.splice(0, this.lines.length - LOG_LIMIT);
    this.options.onLog(line);
  }

  private async decideBuild(): Promise<BuildDecision> {
    const outputs = await Promise.all(
      BUILD_OUTPUTS.map(async (relative) => {
        try {
          return (await stat(join(this.options.workspaceRoot, relative))).mtimeMs;
        } catch {
          return undefined;
        }
      }),
    );
    return decideBuild({ outputs, newestSource: await this.newestSourceTime() });
  }

  /**
   * Newest mtime across the sources a build consumes.
   *
   * This walks the tree. An earlier version stat'd `packages` and `apps`
   * themselves, on the theory that writing a file updates its directory's
   * mtime — which is true only of the file's *immediate* directory. Editing
   * `packages/overlay/src/page/toolbar.ts` never touches `packages`, so every
   * ordinary edit looked current and the build was skipped when it mattered
   * most.
   */
  private async newestSourceTime(): Promise<number | undefined> {
    let newest: number | undefined;
    const consider = (time: number): void => {
      if (newest === undefined || time > newest) newest = time;
    };

    for (const file of ['package.json', 'tsconfig.json', 'tsconfig.base.json']) {
      try {
        consider((await stat(join(this.options.workspaceRoot, file))).mtimeMs);
      } catch {
        // Missing is not newer than anything.
      }
    }

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 8) return;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        // Build output and dependencies are not sources; walking them would
        // make every build look stale immediately after the last one.
        if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
          continue;
        }
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(path, depth + 1);
          continue;
        }
        if (!SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) continue;
        try {
          consider((await stat(path)).mtimeMs);
        } catch {
          // Vanished mid-walk.
        }
      }
    };

    for (const root of ['packages', 'apps']) {
      await walk(join(this.options.workspaceRoot, root), 0);
    }
    return newest;
  }

  /** Spawn a Node script under the Electron binary and resolve with its exit code. */
  private runToCompletion(args: readonly string[]): Promise<number> {
    return new Promise((resolve) => {
      const child = this.spawnNode(args);
      this.child = child;
      child.on('error', (error) => {
        this.record(`✖ could not start ${args[0] ?? 'process'}: ${error.message}`);
        resolve(1);
      });
      child.on('close', (code) => {
        if (this.child === child) this.child = undefined;
        resolve(code ?? 1);
      });
    });
  }

  private spawnEngine(target: InspectTarget, argv: readonly string[]): void {
    const args = ['apps/cli/dist/bin.js', ...argv];
    if (target.mode !== undefined) args.push('--mode', target.mode);
    if (target.profile !== undefined) args.push('--profile', target.profile);

    const child = this.spawnNode(args);
    this.child = child;

    child.on('error', (error) => {
      this.record(`✖ could not start the capture engine: ${error.message}`);
      this.emit({ kind: 'failed', at: this.now(), stage: 'engine', message: error.message });
    });

    child.on('close', (code) => {
      if (this.child !== child) return;
      this.child = undefined;

      if (this.oneShot) {
        // A one-shot run ending *is* the success case, so exiting is only a
        // failure when the exit code says so.
        if (code === 0) {
          this.emit({ kind: 'stage-done', at: this.now(), stage: 'browser' });
          this.options.onFinished?.({ ok: true, runDir: this.lastRunDir });
          this.emit({ kind: 'stopped', at: this.now() });
          return;
        }
        this.emit({
          kind: 'failed',
          at: this.now(),
          stage: 'browser',
          message: `the run exited with code ${String(code ?? 1)}`,
        });
        return;
      }

      if (this.ready) {
        // Closing the browser window is how a session ends. Not a failure.
        this.emit({ kind: 'stopped', at: this.now() });
        return;
      }
      this.emit({
        kind: 'failed',
        at: this.now(),
        stage: 'browser',
        message: `the capture engine exited with code ${String(code ?? 1)}`,
      });
    });
  }

  private spawnNode(args: readonly string[]): ChildProcess {
    const child = spawn(process.execPath, [...args], {
      cwd: this.options.workspaceRoot,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // The CLI logs to stderr and prints results to stdout; both are read, so
    // the log pane shows what a terminal would have shown.
    const handle = (chunk: string): void => {
      this.record(chunk);
      const signal = readProgress(chunk);
      if (signal !== undefined) this.onSignal(signal);
    };
    const toStderr = createLineSplitter(handle);
    const toStdout = createLineSplitter(handle);
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => toStderr(chunk));
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => toStdout(chunk));
    return child;
  }

  private onSignal(signal: ProgressSignal): void {
    switch (signal.kind) {
      case 'run-started':
        this.lastRunDir = join(this.options.workspaceRoot, signal.runDir);
        this.emit({ kind: 'stage-note', stage: 'engine', note: shortRun(signal.runId) });
        this.emit({ kind: 'stage-done', at: this.now(), stage: 'engine' });
        return;

      case 'opening':
        this.emit({ kind: 'stage-began', at: this.now(), stage: 'browser' });
        this.emit({ kind: 'stage-note', stage: 'browser', note: hostOf(signal.url) });
        return;

      case 'panel-ready':
        this.ready = true;
        this.emit({ kind: 'stage-done', at: this.now(), stage: 'browser' });
        this.emit({ kind: 'ready', at: this.now() });
        return;

      case 'panel-missing':
        // The window is open and usable; only the overlay is missing. Reporting
        // this as a failed launch would be wrong, and would hide the window.
        this.ready = true;
        this.emit({ kind: 'stage-note', stage: 'browser', note: 'no panel' });
        this.emit({ kind: 'stage-done', at: this.now(), stage: 'browser' });
        this.emit({ kind: 'ready', at: this.now() });
        return;

      case 'signed-in':
        return;

      case 'signed-out':
        this.emit({ kind: 'sign-in-required', prompt: this.prompt('signed-out', [signal.evidence]) });
        return;

      case 'sign-in-unclear':
        this.emit({ kind: 'sign-in-required', prompt: this.prompt('unclear', [signal.evidence]) });
        return;

      case 'challenged':
        this.emit({
          kind: 'sign-in-required',
          prompt: { host: signal.host, profile: this.profile, verdict: 'challenged', evidence: [signal.evidence] },
        });
        return;

      case 'navigation-failed':
        this.emit({ kind: 'failed', at: this.now(), stage: 'browser', message: signal.message });
        return;

      case 'fatal':
        this.emit({
          kind: 'failed',
          at: this.now(),
          stage: this.ready ? 'browser' : 'engine',
          message: signal.message,
        });
        return;
    }
  }

  setTarget(target: InspectTarget): void {
    this.host = hostOf(target.url);
    this.profile = target.profile;
  }

  private prompt(
    verdict: SignInPrompt['verdict'],
    evidence: readonly string[],
  ): SignInPrompt {
    return { host: this.host, profile: this.profile, verdict, evidence };
  }
}

function shortRun(runId: string): string {
  const suffix = runId.slice(runId.lastIndexOf('-') + 1);
  return `run ${suffix.length > 0 ? suffix : runId}`;
}
