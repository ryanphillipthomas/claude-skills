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
/** Escape text destined for HTML markup the generator writes itself. */
export declare function escapeHtml(value: string): string;
/**
 * Serialise the model for embedding in a `<script type="application/json">`.
 *
 * `<` is escaped so no value can produce `</script>` and break out of the
 * block, and the two Unicode line terminators are escaped because they are
 * valid in JSON strings but terminate a line in JavaScript source.
 */
export declare function embedJson(value: unknown): string;
//# sourceMappingURL=escape.d.ts.map