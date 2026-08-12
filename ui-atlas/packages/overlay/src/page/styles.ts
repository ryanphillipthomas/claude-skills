/**
 * All inspector styling. It lives inside a Shadow DOM and starts from
 * `all: initial`, so a site with hostile global CSS (or a `* { }` rule, or a
 * `z-index: 999999` header) cannot corrupt or cover the toolbar.
 */
export const OVERLAY_STYLES = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  color-scheme: dark;
  font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

.ua-highlight-layer { position: fixed; inset: 0; pointer-events: none; }

.ua-box {
  position: fixed;
  top: 0;
  left: 0;
  pointer-events: none;
  box-sizing: border-box;
}
.ua-box--hover { outline: 1px solid #38bdf8; background: rgba(56, 189, 248, 0.14); }
.ua-box--selected { outline: 2px solid #f472b6; background: rgba(244, 114, 182, 0.10); }
.ua-box--margin { background: rgba(251, 191, 36, 0.18); }
.ua-box--padding { background: rgba(74, 222, 128, 0.18); }

.ua-box-label {
  /* Inherited properties cross the shadow boundary, and the page can style our
     host element directly (its rules beat :host). Every inheritable property we
     care about is therefore declared here rather than inherited. */
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 400;
  font-style: normal;
  letter-spacing: normal;
  word-spacing: normal;
  text-align: left;
  text-transform: none;
  text-indent: 0;
  direction: ltr;
  position: fixed;
  top: 0;
  left: 0;
  padding: 2px 6px;
  border-radius: 4px;
  background: #0f172a;
  color: #e2e8f0;
  line-height: 16px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.ua-panel {
  /* Same reasoning as .ua-box-label: never inherit typography from the page. */
  font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-weight: 400;
  font-style: normal;
  letter-spacing: normal;
  word-spacing: normal;
  text-align: left;
  text-transform: none;
  text-indent: 0;
  direction: ltr;
  white-space: normal;
  position: fixed;
  top: 16px;
  right: 16px;
  width: 320px;
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  background: #0f172a;
  color: #e2e8f0;
  border: 1px solid #1e293b;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  font-size: 12px;
  line-height: 1.45;
  overflow: hidden;
}
.ua-panel[hidden] { display: none; }

.ua-titlebar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #111c33;
  cursor: grab;
  user-select: none;
  border-bottom: 1px solid #1e293b;
}
.ua-title { font-weight: 600; letter-spacing: 0.02em; flex: 1; }
.ua-run { color: #94a3b8; font-size: 11px; font-family: ui-monospace, Menlo, monospace; }

.ua-body { overflow: auto; padding: 10px; display: flex; flex-direction: column; gap: 10px; }

.ua-section { display: flex; flex-direction: column; gap: 6px; }
.ua-section > h3 {
  margin: 0;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #7c8aa5;
  font-weight: 600;
}

.ua-row { display: flex; flex-wrap: wrap; gap: 6px; }

button.ua-btn {
  all: unset;
  box-sizing: border-box;
  padding: 5px 9px;
  border-radius: 6px;
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #2b3a52;
  cursor: pointer;
  font-size: 11px;
  white-space: nowrap;
}
button.ua-btn:hover { background: #27364f; }
button.ua-btn:focus-visible { outline: 2px solid #38bdf8; outline-offset: 1px; }
button.ua-btn[aria-pressed="true"] { background: #2563eb; border-color: #3b82f6; }
button.ua-btn[disabled] { opacity: 0.45; cursor: not-allowed; }
/* The state currently applied to the live page. */
button.ua-btn--previewing { background: #db2777; border-color: #ec4899; color: #ffffff; }
button.ua-btn--primary { background: #db2777; border-color: #ec4899; }
button.ua-btn--primary:hover { background: #be185d; }
button.ua-btn--quiet { background: transparent; border-color: transparent; color: #7c8aa5; padding: 2px 4px; }
button.ua-btn--quiet:hover { background: #1e293b; color: #e2e8f0; }

/* What to do next. Deliberately the loudest thing in the panel. */
.ua-flow {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 9px;
  border-radius: 8px;
  background: #10233f;
  border: 1px solid #1d4ed8;
  color: #dbeafe;
  font-size: 12px;
  line-height: 1.45;
}
.ua-flow[data-step="continue"] { background: #0d2a1e; border-color: #15803d; color: #bbf7d0; }
.ua-flow[data-step="working"] { background: #2a2410; border-color: #a16207; color: #fef08a; }
.ua-flow[data-step="connect"] { background: #1a1f2b; border-color: #334155; color: #94a3b8; }
.ua-flow__step {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.75;
  font-weight: 600;
}

.ua-steps__list { margin: 0; padding-left: 18px; display: grid; gap: 4px; color: #94a3b8; font-size: 11px; line-height: 1.45; }
.ua-steps__list li strong { color: #cbd5f5; }
.ua-steps__list li.ua-steps__item--current { color: #dbeafe; }
.ua-steps__list li.ua-steps__item--current strong { color: #93c5fd; }

.ua-kv { display: grid; grid-template-columns: 84px 1fr; gap: 2px 8px; }
.ua-kv dt { color: #7c8aa5; }
.ua-kv dd { margin: 0; word-break: break-word; font-family: ui-monospace, Menlo, monospace; }

.ua-empty { color: #7c8aa5; font-style: italic; }
.ua-hint { color: #94a3b8; font-size: 11px; line-height: 1.4; }

.ua-locator {
  background: #111c33;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 6px;
  font-family: ui-monospace, Menlo, monospace;
  word-break: break-all;
}
.ua-score { color: #4ade80; }
.ua-score--low { color: #fbbf24; }

.ua-jobs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ua-job {
  display: flex;
  gap: 6px;
  align-items: baseline;
  background: #111c33;
  border-radius: 6px;
  padding: 4px 6px;
}
.ua-job__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ua-job__status { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
.ua-job--done .ua-job__status { color: #4ade80; }
.ua-job--failed .ua-job__status { color: #f87171; }
.ua-job--running .ua-job__status { color: #38bdf8; }
.ua-job--queued .ua-job__status { color: #94a3b8; }
.ua-job--cancelled .ua-job__status { color: #94a3b8; }

.ua-notice { padding: 6px 8px; border-radius: 6px; font-size: 11px; }
.ua-notice--info { background: #14263f; color: #bae6fd; }
.ua-notice--warn { background: #3a2c10; color: #fde68a; }
.ua-notice--error { background: #3b1113; color: #fecaca; }

.ua-input {
  all: unset;
  box-sizing: border-box;
  width: 64px;
  padding: 4px 6px;
  border-radius: 6px;
  background: #111c33;
  border: 1px solid #2b3a52;
  color: #e2e8f0;
  font-family: ui-monospace, Menlo, monospace;
}
.ua-input:focus-visible { outline: 2px solid #38bdf8; outline-offset: 1px; }

.ua-help { display: grid; grid-template-columns: 96px 1fr; gap: 2px 8px; color: #94a3b8; font-size: 11px; }
.ua-help kbd {
  font-family: ui-monospace, Menlo, monospace;
  background: #1e293b;
  border-radius: 4px;
  padding: 0 4px;
}

.ua-anims { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ua-anims li {
  padding: 6px 8px;
  border-radius: 6px;
  background: #111c33;
  border: 1px solid #22314a;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ua-anim__title { font-size: 11.5px; font-weight: 600; word-break: break-all; }

.ua-toggle-pill {
  position: fixed;
  top: 16px;
  right: 16px;
  pointer-events: auto;
}
`;
