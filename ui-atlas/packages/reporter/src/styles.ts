/** The report's stylesheet, inlined so the file works offline from `file://`. */
export const REPORT_STYLES = `
:root {
  --bg: #f7f8fa;
  --surface: #ffffff;
  --surface-2: #f1f3f7;
  --border: #dfe3ea;
  --fg: #14181f;
  --fg-muted: #5c6675;
  --fg-faint: #8b95a5;
  --accent: #2563eb;
  --ok: #067647;
  --ok-bg: #e7f6ee;
  --warn: #9a5b00;
  --warn-bg: #fdf2dd;
  --bad: #b42318;
  --bad-bg: #fde9e7;
  --forced: #7c3aed;
  --forced-bg: #f1e9fe;
  --shadow: 0 1px 2px rgba(16, 24, 40, 0.06), 0 8px 24px rgba(16, 24, 40, 0.08);
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1218;
    --surface: #161b23;
    --surface-2: #1d232d;
    --border: #2a313c;
    --fg: #e8ebf0;
    --fg-muted: #a2acbb;
    --fg-faint: #78828f;
    --accent: #7aa2ff;
    --ok: #6ee7a8;
    --ok-bg: #10331f;
    --warn: #fbd38b;
    --warn-bg: #3a2c10;
    --bad: #fca5a5;
    --bad-bg: #3b1113;
    --forced: #c9b0ff;
    --forced-bg: #2b1f45;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.45);
    color-scheme: dark;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 { margin: 0; font-weight: 600; }
a { color: var(--accent); }

/* ---------------------------------------------------------------- header -- */

.masthead {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 12px 20px;
}
.masthead__top { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.masthead__title { font-size: 16px; letter-spacing: -0.01em; }
.masthead__run { font-family: var(--mono); font-size: 12px; color: var(--fg-muted); }
.masthead__meta { margin-left: auto; display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--fg-muted); }
.masthead__meta b { color: var(--fg); font-weight: 600; }

.tabs { display: flex; gap: 4px; margin-top: 10px; }
.tab {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--fg-muted);
  font: inherit;
  font-size: 13px;
  padding: 5px 11px;
  border-radius: 7px;
  cursor: pointer;
}
.tab:hover { background: var(--surface-2); color: var(--fg); }
.tab[aria-selected="true"] { background: var(--surface-2); border-color: var(--border); color: var(--fg); font-weight: 600; }
.tab__count { color: var(--fg-faint); font-weight: 400; margin-left: 5px; font-variant-numeric: tabular-nums; }

/* ---------------------------------------------------------------- layout -- */

.shell { display: grid; grid-template-columns: 232px 1fr; align-items: start; }
@media (max-width: 900px) { .shell { grid-template-columns: 1fr; } }

.filters {
  position: sticky;
  top: 97px;
  max-height: calc(100vh - 97px);
  overflow: auto;
  padding: 16px 12px 40px 20px;
}
.filters__group { margin-bottom: 16px; }
.filters__group > h3 {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--fg-faint);
  margin-bottom: 6px;
}
.chiplist { display: flex; flex-wrap: wrap; gap: 4px; }
.chip {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--fg-muted);
  font: inherit;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
}
.chip:hover { border-color: var(--accent); color: var(--fg); }
.chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }

.search {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--fg);
  font: inherit;
  font-size: 13px;
}
.search:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

.linkish {
  appearance: none;
  background: none;
  border: 0;
  color: var(--accent);
  font: inherit;
  font-size: 12px;
  padding: 0;
  cursor: pointer;
}

.main { padding: 16px 20px 80px; min-width: 0; }
.resultbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-size: 12px; color: var(--fg-muted); }

/* ----------------------------------------------------------------- cards -- */

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(228px, 1fr));
  gap: 14px;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  padding: 0;
  font: inherit;
  color: inherit;
  box-shadow: var(--shadow);
}
.card:hover { border-color: var(--accent); }
.card:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.card[aria-current="true"] { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }

.shot {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 150px;
  overflow: hidden;
  /* Checkerboard so transparent captures are readable. */
  background-color: var(--surface-2);
  background-image:
    linear-gradient(45deg, rgba(128, 128, 128, 0.12) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(128, 128, 128, 0.12) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(128, 128, 128, 0.12) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(128, 128, 128, 0.12) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}
.shot img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
/* Inert inside a card or a cell, which are buttons: a click there opens the
   detail panel, and only the detail panel's player takes clicks of its own. */
.shot video { max-width: 100%; max-height: 100%; display: block; background: #000; pointer-events: none; }
.detail__shot video { pointer-events: auto; }
.shot--empty { flex-direction: column; gap: 6px; color: var(--fg-faint); font-size: 12px; text-align: center; padding: 10px; }
.shot--empty code { font-family: var(--mono); font-size: 11px; }

.card__body { padding: 8px 10px 10px; display: flex; flex-direction: column; gap: 5px; }
.card__title { font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card__sub { font-size: 11px; color: var(--fg-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card__badges { display: flex; gap: 4px; flex-wrap: wrap; }

.badge {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 2px 6px;
  border-radius: 5px;
  background: var(--surface-2);
  color: var(--fg-muted);
  white-space: nowrap;
}
.badge--captured { background: var(--ok-bg); color: var(--ok); }
.badge--skipped { background: var(--warn-bg); color: var(--warn); }
.badge--failed { background: var(--bad-bg); color: var(--bad); }
.badge--observed { background: var(--surface-2); color: var(--fg-muted); }
.badge--interacted { background: var(--ok-bg); color: var(--ok); }
/* A synthesised state must never read like an observed one. */
.badge--forced { background: var(--forced-bg); color: var(--forced); }
.badge--warn { background: var(--warn-bg); color: var(--warn); }

/* -------------------------------------------------------------- matrices -- */

.component {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 16px;
  overflow: hidden;
}
.component__head { padding: 12px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.component__label { font-size: 14px; font-weight: 600; }
.component__sub { font-size: 12px; color: var(--fg-muted); font-family: var(--mono); }
.component__counts { margin-left: auto; display: flex; gap: 6px; }

.matrix-scroll { overflow-x: auto; }
.matrix { border-collapse: collapse; width: max-content; }
.matrix th, .matrix td { border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); padding: 8px; vertical-align: top; }
.matrix th:last-child, .matrix td:last-child { border-right: 0; }
.matrix tr:last-child td { border-bottom: 0; }
.matrix thead th {
  position: sticky;
  top: 0;
  background: var(--surface-2);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fg-muted);
  text-align: left;
  white-space: nowrap;
}
.matrix thead th small {
  display: block;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--fg-faint);
  font-variant-numeric: tabular-nums;
}
.matrix tbody th {
  width: 108px;
  min-width: 108px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  background: var(--surface);
  position: sticky;
  left: 0;
  z-index: 1;
  border-right: 1px solid var(--border);
}

.cell { width: 190px; }
.cell__button {
  display: block;
  width: 100%;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  cursor: pointer;
  overflow: hidden;
  font: inherit;
  color: inherit;
}
.cell__button:hover { border-color: var(--accent); }
.cell__button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.cell__shot { height: 108px; }
.cell__foot { padding: 5px 7px; display: flex; gap: 4px; flex-wrap: wrap; }
.cell--empty { color: var(--fg-faint); font-size: 12px; font-style: italic; padding: 12px 8px; }

/* ---------------------------------------------------------------- detail -- */

.detail {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(560px, 100vw);
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow);
  overflow: auto;
  z-index: 30;
  padding: 16px 18px 60px;
}
.detail[hidden] { display: none; }
.detail__head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
.detail__title { font-size: 15px; }
.detail__close {
  margin-left: auto;
  appearance: none;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--fg);
  border-radius: 7px;
  width: 28px;
  height: 28px;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  flex: none;
}
.detail__shot { border: 1px solid var(--border); border-radius: 8px; height: auto; max-height: 380px; }
.detail__shot img { cursor: zoom-in; }
.detail__shot--actual { max-height: none; overflow: auto; justify-content: flex-start; }
.detail__shot--actual img { max-width: none; max-height: none; cursor: zoom-out; }

.section { margin-top: 16px; }
.section > h3 {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--fg-faint);
  margin-bottom: 6px;
}
.kv { display: grid; grid-template-columns: 128px 1fr; gap: 3px 10px; font-size: 12.5px; }
.kv dt { color: var(--fg-muted); }
.kv dd { margin: 0; word-break: break-word; }
.kv dd.mono { font-family: var(--mono); font-size: 12px; }

.table { width: 100%; border-collapse: collapse; font-size: 12px; }
.table th, .table td { text-align: left; padding: 5px 7px; border-bottom: 1px solid var(--border); vertical-align: top; }
.table th { color: var(--fg-muted); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
.table td.mono { font-family: var(--mono); word-break: break-all; }
.table tr[data-chosen="true"] { background: var(--surface-2); }
.score { font-variant-numeric: tabular-nums; font-weight: 600; }
.score--high { color: var(--ok); }
.score--low { color: var(--warn); }
.score--zero { color: var(--bad); }

.notelist { margin: 0; padding-left: 16px; font-size: 12.5px; color: var(--fg-muted); }
.notelist li { margin-bottom: 3px; }

.muted { font-size: 12.5px; color: var(--fg-muted); margin: 0 0 10px; }
.tokens__group { margin-bottom: 22px; }
.tokens__heading { font-size: 14px; font-weight: 600; margin: 0 0 6px; text-transform: capitalize; }
.swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: 6px;
  border-radius: 3px;
  border: 1px solid var(--border);
  vertical-align: -2px;
  /* Checkerboard behind it, so a translucent value reads as translucent. */
  background-image:
    linear-gradient(45deg, #d0d0d0 25%, transparent 25%),
    linear-gradient(-45deg, #d0d0d0 25%, transparent 25%);
  background-size: 6px 6px;
}
.note { padding: 8px 10px; border-radius: 8px; font-size: 12.5px; }
.note--warn { background: var(--warn-bg); color: var(--warn); }
.note--bad { background: var(--bad-bg); color: var(--bad); }
.note--info { background: var(--surface-2); color: var(--fg-muted); }

.copy {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--fg);
  font: inherit;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 6px;
  cursor: pointer;
  margin-left: 6px;
}

.swatch { display: inline-block; width: 10px; height: 10px; border-radius: 3px; border: 1px solid var(--border); vertical-align: -1px; margin-right: 4px; }

.empty-state { padding: 48px 20px; text-align: center; color: var(--fg-muted); }
.empty-state h2 { font-size: 15px; margin-bottom: 4px; color: var(--fg); }

.footer { padding: 20px; color: var(--fg-faint); font-size: 11.5px; border-top: 1px solid var(--border); }
`;
