import type {
  AnimationSample,
  CaptureKind,
  CaptureState,
  ElementIdentity,
} from '@ui-atlas/protocol';

/**
 * How long the descriptive part of a filename may be. Long enough for
 * "continue-to-payment-details", short enough that the whole stem stays
 * readable in a file listing.
 */
const MAX_LABEL_LENGTH = 48;

/** Text that is technically a name but says nothing about what the thing is. */
const USELESS_LABELS = new Set(['', '-', 'div', 'span', 'undefined', 'null']);

/**
 * Reduce arbitrary text to one lower-case hyphenated word run. Unlike
 * `sanitizeSegment` this is not a path-safety function — it is the readability
 * function, and it deliberately collapses everything that is not a letter or a
 * digit so that `Save changes →` and `Save  Changes!` become the same slug.
 */
export function slugPart(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Trim a slug to `maxLength` on a word boundary, so a truncated name reads as
 * a shorter name rather than as a cut-off one: `continue-to-payment` beats
 * `continue-to-paym`.
 */
export function trimSlug(slug: string, maxLength = MAX_LABEL_LENGTH): string {
  if (slug.length <= maxLength) return slug;
  const words = slug.split('-');
  const kept: string[] = [];
  let length = 0;
  for (const word of words) {
    const next = length === 0 ? word.length : length + 1 + word.length;
    if (next > maxLength) break;
    kept.push(word);
    length = next;
  }
  // A single word longer than the budget still has to be cut somewhere.
  return kept.length > 0 ? kept.join('-') : slug.slice(0, maxLength);
}

export interface CaptureNameInput {
  kind: CaptureKind;
  state: CaptureState;
  element?: ElementIdentity | undefined;
  animation?: AnimationSample | undefined;
}

/**
 * The filename a capture would like to have, as `<subject>--<label>--<state>`.
 *
 * Everything here is already in the capture record — the role, the accessible
 * name, the state and its label are read off the element the inspector already
 * described. Nothing is guessed and nothing is asked of a model: a name this
 * function cannot derive is simply shorter, never invented.
 *
 * The result is not guaranteed unique; `RunWriter` is what makes it unique
 * within a directory, because only the writer knows what it has already
 * written.
 */
export function captureSlug(input: CaptureNameInput): string {
  const parts = [subjectOf(input), labelOf(input.element), stateOf(input)];
  const frame = frameOf(input);
  if (frame !== undefined) parts.push(frame);
  return parts.filter((part): part is string => part !== undefined && part.length > 0).join('--');
}

/**
 * The stem for a page recording. A recording has no element and nothing was
 * applied to the page, so there is nothing to name it after but what it is.
 */
export function recordingSlug(): string {
  return captureSlug({
    kind: 'animation-video',
    state: { name: 'default', provenance: 'observed', verified: true },
  });
}

function subjectOf(input: CaptureNameInput): string {
  switch (input.kind) {
    case 'viewport':
      return 'viewport';
    case 'full-page':
      return 'full-page';
    case 'animation-video':
      return 'recording';
    case 'element':
    case 'animation-frame':
      break;
  }

  const element = input.element;
  if (element === undefined) {
    // An animation frame with no resolvable element is a viewport shot; saying
    // so in the filename is more useful than pretending it photographed a
    // component.
    return 'viewport';
  }
  // The ARIA role is the better subject when there is one: `button` and
  // `checkbox` describe the component, where `div` and `span` describe the
  // markup that happens to implement it.
  const role = slugPart(element.role ?? '');
  if (role.length > 0) return trimSlug(role, 24);
  return trimSlug(slugPart(element.tagName), 24) || 'element';
}

function labelOf(element: ElementIdentity | undefined): string | undefined {
  if (element === undefined) return undefined;
  // Accessible name first: it is what the component is *called*, and it is
  // stable in a way that the first line of its text content is not.
  for (const source of [element.accessibleName, element.textExcerpt]) {
    if (source === undefined) continue;
    const slug = trimSlug(slugPart(source));
    if (!USELESS_LABELS.has(slug)) return slug;
  }
  return undefined;
}

function stateOf(input: CaptureNameInput): string | undefined {
  // A recording has no state worth naming: nothing was applied to the page.
  if (input.kind === 'animation-video') return undefined;

  const { name, label } = input.state;
  if (name !== 'custom') return name;
  const detail = label === undefined ? '' : trimSlug(slugPart(label), 24);
  return detail.length > 0 ? `custom-${detail}` : 'custom';
}

/**
 * `frame-000` … `frame-100`, zero-padded so that a directory listing sorts the
 * frames of one animation in the order they occur rather than as 0, 10, 100.
 */
function frameOf(input: CaptureNameInput): string | undefined {
  if (input.kind !== 'animation-frame') return undefined;
  const progress = input.animation?.progress;
  if (progress === undefined || !Number.isFinite(progress)) return undefined;
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return `frame-${String(percent).padStart(3, '0')}`;
}
