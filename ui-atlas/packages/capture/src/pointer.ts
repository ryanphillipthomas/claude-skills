import type { Page } from 'playwright';

/**
 * Playwright does not expose the virtual mouse position, so we track it. Every
 * state that moves the pointer restores it afterwards, which stops a hover
 * capture from leaving the page hovering something else.
 */
export class PointerTracker {
  private x = 0;
  private y = 0;
  private buttonDown = false;

  position(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  async moveTo(page: Page, x: number, y: number): Promise<void> {
    await page.mouse.move(x, y);
    this.x = x;
    this.y = y;
  }

  async down(page: Page): Promise<void> {
    await page.mouse.down();
    this.buttonDown = true;
  }

  /** Safe to call unconditionally; used from `finally` blocks. */
  async releaseButtons(page: Page): Promise<void> {
    if (!this.buttonDown) return;
    this.buttonDown = false;
    await page.mouse.up().catch(() => undefined);
  }

  async restore(page: Page): Promise<void> {
    await page.mouse.move(this.x, this.y).catch(() => undefined);
  }

  /** Record a position set by something other than `moveTo` (e.g. hover()). */
  note(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }
}

/** Release any modifier keys we may have pressed. Idempotent. */
export async function releaseModifiers(page: Page): Promise<void> {
  for (const key of ['Shift', 'Control', 'Alt', 'Meta']) {
    await page.keyboard.up(key).catch(() => undefined);
  }
}
