import type { TokenCategory, TokenValueKind } from '@ui-atlas/protocol';

/**
 * Computed properties worth reading, and which design question each answers.
 *
 * Colours are split by *use* rather than gathered by type: "what colour is the
 * text" and "what colour is behind it" are different questions with different
 * answers, and a single `color` bucket holding both would answer neither.
 */
export const TOKEN_PROPERTIES: ReadonlyArray<{ property: string; category: TokenCategory }> = [
  { property: 'color', category: 'color' },
  { property: 'text-decoration-color', category: 'color' },

  { property: 'background-color', category: 'background' },

  { property: 'border-top-color', category: 'border' },
  { property: 'border-right-color', category: 'border' },
  { property: 'border-bottom-color', category: 'border' },
  { property: 'border-left-color', category: 'border' },
  { property: 'border-top-width', category: 'border' },
  { property: 'border-right-width', category: 'border' },
  { property: 'border-bottom-width', category: 'border' },
  { property: 'border-left-width', category: 'border' },
  { property: 'outline-color', category: 'border' },
  { property: 'outline-width', category: 'border' },

  { property: 'border-top-left-radius', category: 'radius' },
  { property: 'border-top-right-radius', category: 'radius' },
  { property: 'border-bottom-left-radius', category: 'radius' },
  { property: 'border-bottom-right-radius', category: 'radius' },

  { property: 'padding-top', category: 'spacing' },
  { property: 'padding-right', category: 'spacing' },
  { property: 'padding-bottom', category: 'spacing' },
  { property: 'padding-left', category: 'spacing' },
  { property: 'margin-top', category: 'spacing' },
  { property: 'margin-right', category: 'spacing' },
  { property: 'margin-bottom', category: 'spacing' },
  { property: 'margin-left', category: 'spacing' },
  { property: 'gap', category: 'spacing' },

  { property: 'font-family', category: 'typography' },
  { property: 'font-size', category: 'typography' },
  { property: 'font-weight', category: 'typography' },
  { property: 'line-height', category: 'typography' },
  { property: 'letter-spacing', category: 'typography' },

  { property: 'box-shadow', category: 'shadow' },
];

const CATEGORY_OF = new Map(TOKEN_PROPERTIES.map((entry) => [entry.property, entry.category]));

export function categoryOf(property: string): TokenCategory | undefined {
  return CATEGORY_OF.get(property);
}

export interface NormalisedValue {
  value: string;
  kind: TokenValueKind;
  /** Present for `length`, so near-neighbours can be compared numerically. */
  px?: number;
  /** Present for `color`, as 0-255 channels plus alpha. */
  rgba?: [number, number, number, number];
}

/**
 * Put a computed value into the one form it will always be compared in.
 *
 * Chromium reports colours as `rgb()`/`rgba()` whatever the stylesheet said, so
 * `#2563EB`, `rgb(37 99 235)` and `rgb(37, 99, 235)` all arrive the same. The
 * work here is mostly the other direction: back to hex, which is how a person
 * reads a colour, and only while the colour is fully opaque — an `rgba()` with
 * alpha is a different value and must not be flattened into one that is not.
 */
export function normaliseValue(property: string, raw: string): NormalisedValue | undefined {
  const value = raw.trim();
  if (value.length === 0) return undefined;

  if (isColourProperty(property)) {
    const rgba = parseColour(value);
    if (rgba === undefined) {
      // A colour space this does not understand — `color(display-p3 …)`,
      // `color-mix(…)` — is passed through rather than guessed at. It still
      // counts; it just cannot be compared channel by channel.
      return { value: collapseSpaces(value), kind: 'color' };
    }
    // A fully transparent colour is not a colour anybody chose; the page-side
    // filter drops these, and this is the belt to that pair of braces.
    if (rgba[3] === 0) return undefined;
    return { value: formatColour(rgba), kind: 'color', rgba };
  }

  if (property === 'font-family') {
    return { value: normaliseFontStack(value), kind: 'text' };
  }

  if (property === 'font-weight') {
    // `400` and `normal` are the same weight, and the computed value is always
    // the number — but say so as a number so 400 and 500 sort sensibly.
    const weight = Number(value);
    return Number.isFinite(weight)
      ? { value: String(weight), kind: 'number' }
      : { value, kind: 'text' };
  }

  if (property === 'box-shadow') {
    return { value: collapseSpaces(value), kind: 'text' };
  }

  const px = parsePx(value);
  if (px !== undefined) {
    // Sub-pixel values come from percentage widths and zoom, not from a design
    // decision. Rounding to one decimal keeps `12px` and `12.0001px` together
    // without pretending `12.5px` is `12px`.
    const rounded = Math.round(px * 10) / 10;
    return { value: `${String(rounded)}px`, kind: 'length', px: rounded };
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) return { value: String(numeric), kind: 'number' };

  return { value: collapseSpaces(value), kind: 'text' };
}

function isColourProperty(property: string): boolean {
  return property.endsWith('color');
}

/**
 * Any colour form worth comparing, as channels.
 *
 * Chromium's `getComputedStyle` always answers in `rgb()`/`rgba()`, so hex only
 * turns up when a value reaches this from somewhere else. Handling it anyway
 * means the function is right about its input rather than right about its
 * current caller — and it keeps `#2563EB` and `#2563eb` from being two values.
 */
export function parseColour(value: string): [number, number, number, number] | undefined {
  return parseHex(value) ?? parseRgb(value);
}

/** `#abc`, `#aabbcc`, `#aabbccdd`. */
export function parseHex(value: string): [number, number, number, number] | undefined {
  const match = /^#([0-9a-f]{3,8})$/i.exec(value.trim());
  if (match === null) return undefined;
  const digits = match[1] ?? '';
  const expand = (short: string): string =>
    short
      .split('')
      .map((digit) => `${digit}${digit}`)
      .join('');

  const full =
    digits.length === 3 || digits.length === 4 ? expand(digits) : digits;
  if (full.length !== 6 && full.length !== 8) return undefined;

  const channel = (at: number): number => Number.parseInt(full.slice(at, at + 2), 16);
  const alpha = full.length === 8 ? Math.round((channel(6) / 255) * 1000) / 1000 : 1;
  return [channel(0), channel(2), channel(4), alpha];
}

/** `rgb(37, 99, 235)` / `rgba(37, 99, 235, 0.5)` / `rgb(37 99 235 / 50%)`. */
export function parseRgb(value: string): [number, number, number, number] | undefined {
  const match = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (match === null) return undefined;
  const body = match[1] ?? '';
  const parts = body
    .split(/[,/]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .flatMap((part) => (part.includes(' ') ? part.split(/\s+/) : [part]));
  if (parts.length < 3) return undefined;

  const channel = (part: string | undefined): number | undefined => {
    if (part === undefined) return undefined;
    const numeric = part.endsWith('%')
      ? (Number(part.slice(0, -1)) / 100) * 255
      : Number(part);
    return Number.isFinite(numeric) ? Math.round(numeric) : undefined;
  };

  const red = channel(parts[0]);
  const green = channel(parts[1]);
  const blue = channel(parts[2]);
  if (red === undefined || green === undefined || blue === undefined) return undefined;

  let alpha = 1;
  const rawAlpha = parts[3];
  if (rawAlpha !== undefined) {
    const parsed = rawAlpha.endsWith('%') ? Number(rawAlpha.slice(0, -1)) / 100 : Number(rawAlpha);
    if (!Number.isFinite(parsed)) return undefined;
    alpha = Math.round(parsed * 1000) / 1000;
  }
  return [red, green, blue, alpha];
}

function formatColour(rgba: [number, number, number, number]): string {
  const [red, green, blue, alpha] = rgba;
  if (alpha >= 1) {
    const hex = (channel: number): string =>
      Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0');
    return `#${hex(red)}${hex(green)}${hex(blue)}`;
  }
  return `rgba(${String(red)}, ${String(green)}, ${String(blue)}, ${String(alpha)})`;
}

/** `"Inter",  system-ui , sans-serif` → `Inter, system-ui, sans-serif`. */
export function normaliseFontStack(value: string): string {
  return value
    .split(',')
    .map((family) => family.trim().replace(/^["']|["']$/g, ''))
    .filter((family) => family.length > 0)
    .join(', ');
}

function parsePx(value: string): number | undefined {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  if (match === null) return undefined;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
