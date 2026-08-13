/**
 * The popover's stylesheet, as one string.
 *
 * Values come straight from the design document rather than being re-derived:
 * a 308px panel, 12px corners, the 0.5px hairline that a Retina display can
 * actually draw, and Apple's system accent (#0a84ff) and semantic greens, ambers
 * and reds. The window itself is vibrant, so the panel paints a translucent
 * scrim over it instead of a solid fill.
 */

export const PANEL_WIDTH = 308;

export const STYLES = `
:root {
  --accent: #0a84ff;
  --ok: #30d158;
  --warn: #ff9f0a;
  --error: #ff453a;
  --text: #ffffff;
  --text-2: rgba(235, 235, 245, 0.85);
  --text-3: rgba(235, 235, 245, 0.6);
  --text-4: rgba(235, 235, 245, 0.45);
  --text-5: rgba(235, 235, 245, 0.35);
  --fill-1: rgba(255, 255, 255, 0.05);
  --fill-2: rgba(255, 255, 255, 0.07);
  --fill-3: rgba(255, 255, 255, 0.09);
  --hairline: rgba(255, 255, 255, 0.1);
  --ring: inset 0 0 0 0.5px rgba(255, 255, 255, 0.1);
  --mono: 'SF Mono', ui-monospace, monospace;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  background: transparent;
  /* The popover is not a document; dragging or selecting inside it is noise. */
  user-select: none;
  cursor: default;
  overflow: hidden;
}

body {
  font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif;
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

#panel {
  width: ${String(PANEL_WIDTH)}px;
  display: flex;
  flex-direction: column;
  background: rgba(30, 30, 32, 0.72);
  border-radius: 12px;
  box-shadow: 0 0 0 0.5px rgba(255, 255, 255, 0.14), 0 24px 60px -18px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}

.divider { height: 0.5px; background: var(--hairline); flex: none; }

/* --- Header --------------------------------------------------------------- */

.header { display: flex; align-items: center; gap: 9px; padding: 12px 12px 10px; }

.badge {
  width: 26px; height: 26px; border-radius: 7px; flex: none;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.12);
}
.badge .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-5); }
.badge--ok { background: rgba(48, 209, 88, 0.18); box-shadow: inset 0 0 0 0.5px rgba(48, 209, 88, 0.4); }
.badge--ok .dot { background: var(--ok); }
.badge--busy { background: rgba(10, 132, 255, 0.18); box-shadow: inset 0 0 0 0.5px rgba(10, 132, 255, 0.4); }
.badge--warn { background: rgba(255, 159, 10, 0.18); box-shadow: inset 0 0 0 0.5px rgba(255, 159, 10, 0.4); }
.badge--error { background: rgba(255, 69, 58, 0.18); box-shadow: inset 0 0 0 0.5px rgba(255, 69, 58, 0.4); }

.heading { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.heading .title { font-size: 13px; font-weight: 590; letter-spacing: -0.01em; }
.heading .subtitle { font-size: 10.5px; color: var(--text-4); }

/* --- Controls ------------------------------------------------------------- */

button {
  font: inherit; color: inherit; border: 0; margin: 0;
  background: none; cursor: default; text-align: left;
}
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 6px; }

.chip {
  margin-left: auto; flex: none;
  padding: 4px 10px; border-radius: 6px;
  background: var(--fill-3); box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.08);
  font-size: 11.5px; color: var(--text-3);
}
.chip:hover { background: rgba(255, 255, 255, 0.14); }

.primary {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%; padding: 9px; border-radius: 9px;
  background: var(--accent); color: #fff; font-size: 13px; font-weight: 590;
}
.primary:hover { filter: brightness(1.08); }
.primary:active { filter: brightness(0.86); }

.secondary {
  flex: 1; text-align: center; padding: 8px; border-radius: 8px;
  background: var(--fill-3); box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.08);
  font-size: 12px;
}
.secondary:hover { background: rgba(255, 255, 255, 0.14); }

.link { margin-left: auto; flex: none; font-size: 11.5px; color: var(--accent); }
.link:hover { text-decoration: underline; }

.caption { font-size: 11px; color: var(--text-4); text-align: center; }

/* --- Progress hairline ----------------------------------------------------- */

.progress { position: relative; height: 2px; background: rgba(255, 255, 255, 0.08); overflow: hidden; flex: none; }
.progress .fill { position: absolute; inset: 0 auto 0 0; background: var(--accent); transition: width 240ms cubic-bezier(0.32, 0.72, 0, 1); }

/* --- Sections -------------------------------------------------------------- */

.section { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.label { font-size: 11.5px; font-weight: 590; color: var(--text-3); }

.field {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 9px; border-radius: 8px;
  background: var(--fill-2); box-shadow: var(--ring);
}
.field input {
  flex: 1; min-width: 0; border: 0; background: none; color: inherit; outline: none;
  font-family: var(--mono); font-size: 11.5px; user-select: text; cursor: text;
}
.field .caret { font-size: 11px; color: var(--text-5); }

/* --- Stage rows ------------------------------------------------------------ */

.stages { display: flex; flex-direction: column; gap: 7px; }
.stage { display: flex; align-items: center; gap: 9px; font-size: 12px; color: var(--text-3); }
.stage--running, .stage--done { color: var(--text); }
.stage--failed { color: var(--error); }
.stage .note { margin-left: auto; font-size: 10.5px; color: var(--text-5); }
.stage--running .note { font-family: var(--mono); color: var(--text-4); }

.mark { width: 15px; height: 15px; flex: none; }
.mark--pending { border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(235, 235, 245, 0.22); }

/* --- Rows: auth, runs, menu ------------------------------------------------- */

.row {
  display: flex; align-items: center; gap: 9px;
  padding: 7px 9px; border-radius: 8px; background: var(--fill-1);
  width: 100%;
}
.row .stack { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.row .stack .top { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .stack .bottom { font-size: 10.5px; color: var(--text-4); }

.runs { display: flex; flex-direction: column; gap: 2px; padding: 8px 6px; }
.run { display: flex; align-items: center; gap: 8px; padding: 5px 6px; border-radius: 6px; width: 100%; }
.run:hover { background: rgba(120, 120, 128, 0.34); }
.run .thumb { width: 32px; height: 21px; border-radius: 3px; background: #f0f0f3; flex: none; }
.run .stack { display: flex; flex-direction: column; min-width: 0; }
.run .top { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.run .bottom { font-size: 10.5px; color: var(--text-4); }

.menu { display: flex; flex-direction: column; padding: 6px; }
.menu button {
  display: flex; align-items: center; width: 100%;
  padding: 5px 8px; border-radius: 6px; font-size: 12px; color: var(--text-2);
}
.menu button:hover { background: rgba(120, 120, 128, 0.34); color: #fff; }
.menu .shortcut { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--text-5); }

/* --- Sign-in card ----------------------------------------------------------- */

.body-text { font-size: 12px; line-height: 1.5; color: var(--text-2); }
.body-text code { font-family: var(--mono); font-size: 11.5px; }
.evidence { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--text-4); }
.evidence li { list-style: none; }
.buttons { display: flex; gap: 8px; }

.disclosure { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-3); }
.disclosure .caret { color: var(--text-5); }

.log {
  max-height: 132px; overflow-y: auto;
  padding: 8px; border-radius: 8px; background: rgba(0, 0, 0, 0.28);
  font-family: var(--mono); font-size: 10.5px; line-height: 1.45; color: var(--text-3);
  user-select: text; cursor: text;
  white-space: pre-wrap; word-break: break-word;
}
.log div + div { margin-top: 2px; }

.notice { padding: 0 12px 10px; font-size: 11px; color: var(--warn); }

/* --- Motion ----------------------------------------------------------------- */

@keyframes ua-spin { to { transform: rotate(360deg); } }
.spin { animation: ua-spin 1s linear infinite; transform-origin: 50% 50%; }

/*
 * Reduce Motion loses the travel and keeps the information: the spinner stops
 * turning and the progress bar stops easing, but both still say what they said.
 */
@media (prefers-reduced-motion: reduce) {
  .spin { animation: none; }
  .progress .fill { transition: none; }
}
`;
