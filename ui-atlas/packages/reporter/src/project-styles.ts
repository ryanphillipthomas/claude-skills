/**
 * Styles for the project page, appended to the report's stylesheet so the two
 * pages share one set of colour tokens and one type ramp — they sit in the same
 * directory tree and are opened one after the other, and looking like two
 * different tools would be a small lie about how related they are.
 */
export const PROJECT_STYLES = `
.pnav {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-top: 12px;
}
.pnav a {
  padding: 6px 12px;
  border-radius: 999px;
  color: var(--fg-muted);
  text-decoration: none;
  font-weight: 500;
}
.pnav a:hover { background: var(--surface-2); color: var(--fg); }

.pmain { max-width: 1180px; margin: 0 auto; padding: 24px 20px 64px; }

.psection {
  margin: 0 0 40px;
  padding: 20px 22px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: var(--shadow);
  /* The masthead is sticky; an anchor jump must not land under it. */
  scroll-margin-top: 96px;
}
.psection h2 { font-size: 18px; margin-bottom: 4px; }
.psection h3 { font-size: 14px; margin: 20px 0 8px; }

.lede { color: var(--fg-muted); margin: 4px 0 16px; max-width: 78ch; }
.muted { color: var(--fg-faint); }

.ptable { width: 100%; border-collapse: collapse; font-size: 13px; }
.ptable th, .ptable td { text-align: left; padding: 8px 10px; vertical-align: top; }
.ptable th[scope="row"] { color: var(--fg-muted); font-weight: 500; width: 200px; }
.ptable--grid thead th {
  border-bottom: 1px solid var(--border);
  color: var(--fg-muted);
  font-weight: 600;
  white-space: nowrap;
}
.ptable--grid tbody tr + tr td { border-top: 1px solid var(--border); }
.ptable .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ptable--files td:nth-child(3) { max-width: 34ch; }

.plist { margin: 0; padding-left: 18px; color: var(--fg-muted); }
.plist li { margin: 4px 0; }

.pill {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  color: var(--fg-muted);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.pill--ok { background: var(--ok-bg); color: var(--ok); }
.pill--warn { background: var(--warn-bg); color: var(--warn); }

.pcards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}
.pcard {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
}
.pcard__thumb {
  display: block;
  padding: 12px;
  background: var(--surface);
  min-height: 84px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pcard__thumb img { max-width: 100%; max-height: 160px; border-radius: 4px; }
.pcard__thumb--none { color: var(--fg-faint); font-size: 12px; }
.pcard__body { padding: 10px 12px 12px; }
.pcard__body h3 { margin: 0 0 6px; font-size: 13px; }
.pcard__states { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.pcard__body p { margin: 0; font-size: 11px; }

.pvalue-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px;
}
.pvalues h3 { margin-top: 0; }
.pswatches { list-style: none; margin: 0; padding: 0; }
.pswatch {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
}
.pswatch code { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pswatch__chip {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid var(--border);
  flex: none;
}

.pstage__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.pstage__head h3 { margin: 0; }
.pstage__head p { margin: 2px 0 0; font-size: 12px; }

.pstages { display: flex; flex-direction: column; gap: 18px; }
.pstage {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  background: var(--surface-2);
}

.pprompt {
  margin: 12px 0 0;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  font: 12px/1.55 var(--mono);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 460px;
  overflow: auto;
}
/* Present for the copy button to read, and out of the way otherwise. */
.pprompt--hidden { position: absolute; left: -9999px; height: 1px; overflow: hidden; }

.pcopy {
  flex: none;
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--fg);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.pcopy:hover { background: var(--surface-2); }
.pcopy--all { background: var(--accent); border-color: var(--accent); color: #fff; }
.pcopy--all:hover { filter: brightness(1.05); background: var(--accent); }
`;
