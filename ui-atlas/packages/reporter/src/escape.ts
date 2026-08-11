/**
 * Escaping for the generated report.
 *
 * The data in a run comes from arbitrary websites: accessible names, visible
 * text and URLs are all attacker-influenced. The report is opened locally from
 * `file://`, where script would run with access to the user's disk through
 * relative paths. So: the model is embedded as JSON inside a
 * `<script type="application/json">` block rather than as executable JS, and
 * the viewer renders every string with `textContent`, never `innerHTML`.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape text destined for HTML markup the generator writes itself. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

/**
 * Serialise the model for embedding in a `<script type="application/json">`.
 *
 * `<` is escaped so no value can produce `</script>` and break out of the
 * block, and the two Unicode line terminators are escaped because they are
 * valid in JSON strings but terminate a line in JavaScript source.
 */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
