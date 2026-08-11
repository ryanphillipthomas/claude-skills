import type { Page, Request } from 'playwright';
import { emptyManifest, newRunId, RunWriter } from '@ui-atlas/artifacts';
import { launchSession, resolveViewport, viewportLabel, type BrowserSession } from '@ui-atlas/browser';
import { CaptureService } from '@ui-atlas/capture';
import {
  describeTarget,
  locatorFor,
  RecipeRunner,
  type CrawlWorker,
} from '@ui-atlas/crawler';
import { loadProbeBundle, probeLocator } from '@ui-atlas/overlay';
import type { UiAtlasConfig } from '@ui-atlas/config';
import { makeOutputDir, startFixtureServer, testConfig, type FixtureServer } from './harness.js';

export interface CrawlRequestLog {
  method: string;
  url: string;
  /** Playwright's classification: `document`, `stylesheet`, `image`, … */
  resourceType: string;
  /**
   * False for a subresource *and* for an iframe's own document, so a top-level
   * navigation can be told apart from `frames.html` loading its child.
   */
  mainFrame: boolean;
  at: number;
}

export const CRAWL_VIEWPORT = resolveViewport({
  name: 'base',
  width: 1024,
  height: 768,
  mode: 'desktop',
});

/**
 * The crawler needs a page and a writer, not the whole inspector session: it
 * injects nothing into the pages it visits unless recipes are in play. This
 * builds exactly that much.
 */
export interface CrawlHarness {
  server: FixtureServer;
  outputRoot: string;
  browser: BrowserSession;
  page: Page;
  writer: RunWriter;
  runId: string;
  /** Every request the browser made, so "it never clicked" can be proved. */
  requests: CrawlRequestLog[];
  /**
   * A worker factory backed by fresh browser contexts, wired the way the CLI
   * wires it. Records which worker index handled which page.
   */
  workerFactory(options?: { probe?: boolean }): {
    create: (index: number) => Promise<CrawlWorker>;
    /** Worker index that fetched each URL, by the page that fetched it. */
    ownerOf(page: Page): number;
  };
  url(path: string): string;
  /** A runner wired the same way the CLI wires it. */
  recipeRunner(config: UiAtlasConfig): RecipeRunner;
  dispose(): Promise<void>;
}

export interface CrawlHarnessOptions {
  server?: FixtureServer | undefined;
  outputRoot?: string | undefined;
  /** Reopen an existing run instead of creating one, for resume tests. */
  runId?: string | undefined;
  /** Inject the element probe, which recipe element captures need. */
  probe?: boolean | undefined;
}

export async function startCrawlHarness(options: CrawlHarnessOptions = {}): Promise<CrawlHarness> {
  const server = options.server ?? (await startFixtureServer());
  const outputRoot = options.outputRoot ?? (await makeOutputDir('crawl'));
  const runId = options.runId ?? newRunId();
  const config = testConfig({ browser: { headless: true } });

  const writer =
    options.runId === undefined
      ? new RunWriter(
          outputRoot,
          emptyManifest({
            runId,
            project: config.project,
            command: 'test crawl',
            toolVersion: '0.0.0-test',
            baseViewport: CRAWL_VIEWPORT,
            browser: { engine: 'chromium', mode: 'clean', headless: true },
          }),
        )
      : await RunWriter.resume(outputRoot, config.project, runId);
  if (options.runId === undefined) await writer.init();

  const browser = await launchSession({
    config: config.browser,
    viewport: CRAWL_VIEWPORT,
    ...(options.probe === true ? { initScripts: [{ content: await loadProbeBundle() }] } : {}),
  });
  const page = browser.context.pages()[0] ?? (await browser.context.newPage());

  const requests: CrawlRequestLog[] = [];
  const watch = (target: Page): void => {
    target.on('request', (request: Request) => {
      requests.push({
        method: request.method(),
        url: request.url(),
        resourceType: request.resourceType(),
        mainFrame: request.frame() === target.mainFrame(),
        at: Date.now(),
      });
    });
  };
  watch(page);

  const owners = new Map<Page, number>([[page, 0]]);
  const extraContexts: Array<() => Promise<void>> = [];

  return {
    server,
    outputRoot,
    browser,
    page,
    writer,
    runId,
    requests,
    url: (path: string) => server.url(path),
    recipeRunner: (runnerConfig: UiAtlasConfig) =>
      new RecipeRunner({
        config: runnerConfig,
        captures: new CaptureService({
          page,
          writer,
          config: runnerConfig,
          runId,
          project: runnerConfig.project,
          viewport: CRAWL_VIEWPORT,
          viewportLabel: viewportLabel(CRAWL_VIEWPORT),
        }),
        probe: (target, spec) => probeLocator(locatorFor(target, spec), describeTarget(spec)),
      }),
    workerFactory: (factoryOptions = {}) => ({
      create: async (index: number): Promise<CrawlWorker> => {
        const parent = browser.browser;
        if (parent === undefined) throw new Error('this browser mode cannot create contexts');
        const context = await parent.newContext({
          viewport: { width: CRAWL_VIEWPORT.width, height: CRAWL_VIEWPORT.height },
        });
        if (factoryOptions.probe === true) {
          await context.addInitScript({ content: await loadProbeBundle() });
        }
        const workerPage = await context.newPage();
        watch(workerPage);
        owners.set(workerPage, index);
        extraContexts.push(async () => {
          await context.close().catch(() => undefined);
        });
        return {
          page: workerPage,
          close: async () => {
            await context.close().catch(() => undefined);
          },
        };
      },
      ownerOf: (target: Page) => owners.get(target) ?? -1,
    }),
    dispose: async () => {
      for (const close of extraContexts.splice(0)) await close();
      await browser.close().catch(() => undefined);
      if (options.server === undefined) await server.close();
    },
  };
}
