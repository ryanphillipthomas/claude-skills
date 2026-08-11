import { type Browser, type BrowserContext, type Page } from 'playwright';
import type { BrowserConfig } from '@ui-atlas/config';
import { type BrowserMode, type Viewport } from '@ui-atlas/protocol';
export interface LaunchOptions {
    config: BrowserConfig;
    viewport: Viewport;
    /** Scripts injected into every new document before any page script runs. */
    initScripts?: Array<{
        content: string;
    }>;
    /** Bindings exposed to every frame, e.g. the overlay bridge. */
    bindings?: Array<{
        name: string;
        handler: (source: {
            page: Page;
            frame: import('playwright').Frame;
        }, ...args: unknown[]) => unknown;
    }>;
}
export interface BrowserSession {
    mode: BrowserMode;
    browser: Browser | undefined;
    context: BrowserContext;
    browserVersion: string | undefined;
    warnings: string[];
    headless: boolean;
    close(): Promise<void>;
}
/**
 * Launch a browser in one of the four supported modes. `clean` is the default
 * and never touches the user's own Chrome data directory.
 */
export declare function launchSession(options: LaunchOptions): Promise<BrowserSession>;
//# sourceMappingURL=launch.d.ts.map