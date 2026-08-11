import type { Locator, Page } from 'playwright';
import type { RecipeTarget } from '@ui-atlas/config';

/**
 * Turn a recipe target into a Playwright locator.
 *
 * The schema guarantees exactly one locator key is set, so this is a lookup
 * rather than a precedence contest. Everything here goes through Playwright's
 * own engines, which pierce open shadow DOM; there is no path from a recipe to
 * arbitrary page JavaScript.
 */
export function locatorFor(page: Page, target: RecipeTarget): Locator {
  const base = buildBase(page, target);
  return target.nth === undefined ? base : base.nth(target.nth);
}

function buildBase(page: Page, target: RecipeTarget): Locator {
  if (target.css !== undefined) return page.locator(target.css);
  if (target.testId !== undefined) return page.getByTestId(target.testId);
  if (target.role !== undefined) {
    // `getByRole` types its role argument as a closed union; a config string
    // cannot be proved to be one at compile time, and Playwright already
    // rejects an unknown role at call time with a clear message.
    const role = target.role as Parameters<Page['getByRole']>[0];
    return target.name === undefined
      ? page.getByRole(role)
      : page.getByRole(role, { name: target.name, exact: target.exact });
  }
  if (target.label !== undefined) return page.getByLabel(target.label, { exact: target.exact });
  if (target.placeholder !== undefined) {
    return page.getByPlaceholder(target.placeholder, { exact: target.exact });
  }
  if (target.text !== undefined) return page.getByText(target.text, { exact: target.exact });
  // Unreachable: the schema requires one of the above.
  return page.locator(':root');
}

/** Short human-readable form for logs, warnings and dry-run output. */
export function describeTarget(target: RecipeTarget): string {
  const parts: string[] = [];
  if (target.css !== undefined) parts.push(`css=${target.css}`);
  if (target.testId !== undefined) parts.push(`testId=${target.testId}`);
  if (target.role !== undefined) {
    parts.push(target.name === undefined ? `role=${target.role}` : `role=${target.role} name=${target.name}`);
  }
  if (target.label !== undefined) parts.push(`label=${target.label}`);
  if (target.placeholder !== undefined) parts.push(`placeholder=${target.placeholder}`);
  if (target.text !== undefined) parts.push(`text=${target.text}`);
  if (target.nth !== undefined) parts.push(`nth=${String(target.nth)}`);
  return parts.join(' ');
}
