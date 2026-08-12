import type { Page } from 'playwright';
import {
  describeUnobservable,
  inventoryAnimations,
  type UnobservableMotion,
} from '@ui-atlas/animation';
import type { CrawlAnimationsConfig } from '@ui-atlas/config';
import { buildFramePath } from '@ui-atlas/identity';
import type { AnimationRecord, PageRecord } from '@ui-atlas/protocol';

export interface CrawlAnimationsOptions {
  config: CrawlAnimationsConfig;
  runId: string;
}

/**
 * Lists every page's animations during a crawl, so "what moves on this site" is
 * answerable from the artifacts.
 *
 * It **describes**. Nothing is paused, seeked, cancelled or captured — which is
 * exactly what makes it safe to run on every page. Photographing motion costs a
 * pause, a seek and a screenshot per frame, and a crawl should not spend that
 * on every page without being asked: that is a `captureAnimation` recipe step,
 * or the one-shot `animations` command.
 */
export class CrawlAnimationInventory {
  /** Motion `getAnimations` cannot describe, summed across the whole crawl. */
  private readonly unobservable: UnobservableMotion = { canvas2d: 0, webgl: 0, video: 0 };
  private readonly pagesWithUnobservable = new Set<string>();
  private total = 0;
  private capped = false;
  private counter = 0;

  constructor(private readonly options: CrawlAnimationsOptions) {}

  get enabled(): boolean {
    return this.options.config.enabled;
  }

  get recorded(): number {
    return this.total;
  }

  async collect(page: Page, record: PageRecord): Promise<{
    animations: AnimationRecord[];
    warnings: string[];
  }> {
    if (!this.enabled) return { animations: [], warnings: [] };

    const remaining = this.options.config.maxTotal - this.total;
    if (remaining <= 0) {
      // A run-level budget is a fact about the run, so it is raised by
      // `finish()` rather than attached to whichever page happened to trip it —
      // where it would be one line inside one page record, easily missed.
      this.capped = true;
      return { animations: [], warnings: [] };
    }

    const result = await inventoryAnimations(page, {
      runId: this.options.runId,
      routeKey: record.routeKey,
      describeFrame: (frame) => buildFramePath(frame),
      newId: () => `anim-${String((this.counter += 1))}`,
    });

    // The unobservable-motion notice is a fact about the page, and would repeat
    // on every page of a canvas-driven site. Counted here and raised once by
    // `finish()`. Matched against what the inventory would have said rather
    // than against a substring, so a reworded notice cannot slip past.
    const aggregated = new Set(describeUnobservable(result.unobservable));
    const warnings = result.warnings.filter((warning) => !aggregated.has(warning));
    this.unobservable.canvas2d += result.unobservable.canvas2d;
    this.unobservable.webgl += result.unobservable.webgl;
    this.unobservable.video += result.unobservable.video;
    if (
      result.unobservable.canvas2d + result.unobservable.webgl + result.unobservable.video >
      0
    ) {
      this.pagesWithUnobservable.add(record.routeKey);
    }

    let animations = result.animations;
    if (animations.length > this.options.config.maxPerPage) {
      warnings.push(
        `${record.routeKey} has ${String(animations.length)} animations; ` +
          `only the first ${String(this.options.config.maxPerPage)} were recorded`,
      );
      animations = animations.slice(0, this.options.config.maxPerPage);
    }
    if (animations.length > remaining) {
      animations = animations.slice(0, remaining);
    }

    this.total += animations.length;
    return { animations, warnings };
  }

  /**
   * The run-level notices, raised once at the end.
   *
   * "This page contains 2 canvas elements whose motion cannot be described" is
   * true of every page of a canvas-driven site, and saying it fifty times buries
   * everything else. Saying it once, with the number of routes, says more.
   */
  finish(): string[] {
    if (!this.enabled) return [];
    const notices: string[] = [];
    if (this.capped) {
      notices.push(
        `the animation inventory reached its ${String(this.options.config.maxTotal)} record ` +
          'budget; the pages after that were not inventoried',
      );
    }

    const parts: string[] = [];
    if (this.unobservable.canvas2d > 0) {
      parts.push(`${String(this.unobservable.canvas2d)} canvas element(s)`);
    }
    if (this.unobservable.webgl > 0) {
      parts.push(`${String(this.unobservable.webgl)} WebGL canvas element(s)`);
    }
    if (this.unobservable.video > 0) {
      parts.push(`${String(this.unobservable.video)} video element(s)`);
    }
    if (parts.length > 0) {
      notices.push(
        `${String(this.pagesWithUnobservable.size)} route(s) contain ${parts.join(', ')} ` +
          'in total, whose motion the Web Animations API cannot describe; anything they ' +
          'animate is absent from this inventory',
      );
    }
    return notices;
  }
}
