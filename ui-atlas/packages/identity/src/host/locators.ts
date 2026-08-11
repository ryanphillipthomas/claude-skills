import type { Frame, Locator, Page } from 'playwright';
import { UiAtlasError, type LocatorCandidate } from '@ui-atlas/protocol';
import { cssEscapeIdent, cssQuoteAttrValue } from '../core/css.js';

/** Roles Playwright's `getByRole` accepts. Anything else falls back to CSS. */
const ARIA_ROLES = new Set([
  'alert', 'alertdialog', 'application', 'article', 'banner', 'blockquote', 'button', 'caption',
  'cell', 'checkbox', 'code', 'columnheader', 'combobox', 'complementary', 'contentinfo',
  'definition', 'deletion', 'dialog', 'directory', 'document', 'emphasis', 'feed', 'figure',
  'form', 'generic', 'grid', 'gridcell', 'group', 'heading', 'img', 'insertion', 'link', 'list',
  'listbox', 'listitem', 'log', 'main', 'marquee', 'math', 'menu', 'menubar', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'meter', 'navigation', 'none', 'note', 'option',
  'paragraph', 'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup',
  'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider', 'spinbutton', 'status',
  'strong', 'subscript', 'superscript', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term',
  'textbox', 'time', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
]);

export type LocatorRoot = Page | Frame;

/**
 * Turn a stored candidate back into a live Playwright locator. Playwright's
 * built-in engines already pierce open shadow DOM, so no extra work is needed
 * for open shadow roots; closed roots are unsupported and documented as such.
 */
export function locatorForCandidate(root: LocatorRoot, candidate: LocatorCandidate): Locator {
  const exact = candidate.exact ?? true;
  switch (candidate.type) {
    case 'role-name': {
      const role = candidate.role;
      if (role !== undefined && ARIA_ROLES.has(role)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Playwright's AriaRole is a closed union; we validated membership above.
        return root.getByRole(role as any, { name: candidate.value, exact });
      }
      const roleSelector = role === undefined ? '' : `[role=${cssQuoteAttrValue(role)}]`;
      return root.locator(roleSelector.length > 0 ? roleSelector : '*', {
        hasText: candidate.value,
      });
    }
    case 'test-id': {
      const attribute = candidate.attribute ?? 'data-testid';
      return root.locator(`[${attribute}=${cssQuoteAttrValue(candidate.value)}]`);
    }
    case 'id':
      return root.locator(`#${cssEscapeIdent(candidate.value)}`);
    case 'label':
      return root.getByLabel(candidate.value, { exact });
    case 'placeholder':
      return root.getByPlaceholder(candidate.value, { exact });
    case 'alt':
      return root.getByAltText(candidate.value, { exact });
    case 'title':
      return root.getByTitle(candidate.value, { exact });
    case 'text':
      return root.getByText(candidate.value, { exact });
    case 'css-scoped':
    case 'css-path':
      return root.locator(candidate.value);
    default: {
      const exhaustive: never = candidate.type;
      throw new UiAtlasError('internal', `unhandled locator candidate type ${String(exhaustive)}`);
    }
  }
}

/** Human-readable form used in logs, warnings and the report. */
export function describeCandidate(candidate: LocatorCandidate): string {
  switch (candidate.type) {
    case 'role-name':
      return `role=${candidate.role ?? '?'}[name="${candidate.value}"]`;
    case 'test-id':
      return `${candidate.attribute ?? 'data-testid'}="${candidate.value}"`;
    case 'id':
      return `#${candidate.value}`;
    case 'css-scoped':
    case 'css-path':
      return candidate.value;
    default:
      return `${candidate.type}="${candidate.value}"`;
  }
}
