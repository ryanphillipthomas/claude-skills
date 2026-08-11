/**
 * CSS.escape, implemented locally so the same escaping is available in Node
 * (where `CSS` does not exist) and in the injected page bundle.
 * Follows https://drafts.csswg.org/cssom/#serialize-an-identifier
 */
export function cssEscapeIdent(value: string): string {
  const length = value.length;
  let result = '';
  const firstCode = value.charCodeAt(0);

  for (let index = 0; index < length; index += 1) {
    const code = value.charCodeAt(index);

    // NULL becomes U+FFFD REPLACEMENT CHARACTER.
    if (code === 0x0000) {
      result += '�';
      continue;
    }

    if (
      (code >= 0x0001 && code <= 0x001f) ||
      code === 0x007f ||
      (index === 0 && code >= 0x0030 && code <= 0x0039) ||
      (index === 1 && code >= 0x0030 && code <= 0x0039 && firstCode === 0x002d)
    ) {
      result += `\\${code.toString(16)} `;
      continue;
    }

    if (index === 0 && code === 0x002d && length === 1) {
      result += `\\${value.charAt(index)}`;
      continue;
    }

    if (
      code >= 0x0080 ||
      code === 0x002d ||
      code === 0x005f ||
      (code >= 0x0030 && code <= 0x0039) ||
      (code >= 0x0041 && code <= 0x005a) ||
      (code >= 0x0061 && code <= 0x007a)
    ) {
      result += value.charAt(index);
      continue;
    }

    result += `\\${value.charAt(index)}`;
  }
  return result;
}

/** Quote and escape a string for use inside an attribute selector. */
export function cssQuoteAttrValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
