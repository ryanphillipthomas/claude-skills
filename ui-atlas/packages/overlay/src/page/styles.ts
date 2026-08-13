/**
 * All inspector styling. It lives inside a Shadow DOM and starts from
 * `all: initial`, so a site with hostile global CSS (or a `* { }` rule, or a
 * `z-index: 999999` header) cannot corrupt or cover the toolbar.
 *
 * Every colour is a token on `:host`, and the light theme redefines the tokens
 * rather than filtering or inverting the dark one. That is the whole point of
 * design 3b — "designed, not inverted": Apple's light and dark palettes are not
 * reflections of each other. The accent is `#0a84ff` in the dark and `#007aff`
 * in the light; success is `#30d158` against `#248a3d`; the selection ring is
 * `#ff375f` against `#ff2d55`. An inversion would produce none of those, and
 * would turn a translucent dark scrim into a muddy translucent white one.
 *
 * The panel follows the *operator's* system appearance, not the captured page's.
 * It is hidden before every capture, so its theme can never reach an artifact.
 */
export const OVERLAY_STYLES = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  pointer-events: none;
  color-scheme: light dark;
  font-family: -apple-system, "SF Pro Text", ui-sans-serif, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;

  /* Dark — design 3a. */
  --ua-accent: #0a84ff;
  --ua-accent-quiet: rgba(10, 132, 255, 0.18);
  --ua-on-accent: #ffffff;
  --ua-surface: rgba(30, 30, 32, 0.78);
  --ua-surface-opaque: #1e1e20;
  --ua-raised: rgba(255, 255, 255, 0.05);
  --ua-raised-strong: rgba(255, 255, 255, 0.09);
  --ua-raised-hover: rgba(255, 255, 255, 0.14);
  --ua-selected: rgba(120, 120, 128, 0.44);
  --ua-hairline: rgba(255, 255, 255, 0.1);
  --ua-ring: rgba(255, 255, 255, 0.14);
  --ua-text: #ffffff;
  --ua-text-2: rgba(235, 235, 245, 0.85);
  --ua-text-3: rgba(235, 235, 245, 0.6);
  --ua-text-4: rgba(235, 235, 245, 0.45);
  --ua-text-5: rgba(235, 235, 245, 0.35);
  --ua-ok: #30d158;
  --ua-warn: #ff9f0a;
  --ua-error: #ff453a;
  --ua-highlight: #ff375f;
  --ua-shadow: 0 24px 60px -18px rgba(0, 0, 0, 0.65);
  --ua-blur: blur(40px) saturate(180%);
  --ua-ok-quiet: rgba(48, 209, 88, 0.16);
  --ua-warn-quiet: rgba(255, 159, 10, 0.16);
  --ua-error-quiet: rgba(255, 69, 58, 0.16);
  --ua-mono: "SF Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
}

/*
 * Light — design 3b. Its own values, chosen the way Apple's light semantics
 * are: a near-white panel rather than a lightened dark one, darker semantic
 * colours so they hold contrast against it, and a neutral fill that reads as
 * material rather than as a grey rectangle.
 */
@media (prefers-color-scheme: light) {
  :host {
    --ua-accent: #007aff;
    --ua-accent-quiet: rgba(0, 122, 255, 0.1);
    --ua-on-accent: #ffffff;
    --ua-surface: rgba(250, 250, 252, 0.9);
    --ua-surface-opaque: #fafafc;
    --ua-raised: #ffffff;
    --ua-raised-strong: rgba(120, 120, 128, 0.12);
    --ua-raised-hover: rgba(120, 120, 128, 0.2);
    --ua-selected: rgba(120, 120, 128, 0.16);
    --ua-hairline: rgba(0, 0, 0, 0.08);
    --ua-ring: rgba(0, 0, 0, 0.1);
    --ua-text: #1d1d1f;
    --ua-text-2: rgba(60, 60, 67, 0.85);
    --ua-text-3: rgba(60, 60, 67, 0.6);
    --ua-text-4: rgba(60, 60, 67, 0.5);
    --ua-text-5: rgba(60, 60, 67, 0.35);
    --ua-ok: #248a3d;
    --ua-warn: #b25000;
    --ua-error: #d70015;
    --ua-highlight: #ff2d55;
    --ua-shadow: 0 24px 60px -20px rgba(0, 0, 0, 0.35);
    --ua-ok-quiet: rgba(36, 138, 61, 0.12);
    --ua-warn-quiet: rgba(178, 80, 0, 0.12);
    --ua-error-quiet: rgba(215, 0, 21, 0.1);
  }
}

.ua-highlight-layer { position: fixed; inset: 0; pointer-events: none; }

.ua-box {
  position: fixed;
  top: 0;
  left: 0;
  pointer-events: none;
  box-sizing: border-box;
}
.ua-box--hover { outline: 1px solid var(--ua-accent); background: var(--ua-accent-quiet); }
.ua-box--selected { outline: 2px solid var(--ua-highlight); background: rgba(255, 55, 95, 0.10); }
.ua-box--margin { background: rgba(255, 159, 10, 0.18); }
.ua-box--padding { background: rgba(48, 209, 88, 0.18); }

.ua-box-label {
  /* Inherited properties cross the shadow boundary, and the page can style our
     host element directly (its rules beat :host). Every inheritable property we
     care about is therefore declared here rather than inherited. */
  font-family: var(--ua-mono);
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
  border-radius: 5px;
  /* Opaque: this sits over the page, where a translucent chip would be unreadable. */
  background: var(--ua-highlight);
  color: #ffffff;
  line-height: 16px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}

.ua-panel {
  /* Same reasoning as .ua-box-label: never inherit typography from the page. */
  font-family: -apple-system, "SF Pro Text", ui-sans-serif, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
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
  /* 340pt, as designed. */
  width: 340px;
  /* A starting point, not the whole window. It used to be
     calc(100vh - 32px), which on a 1000px display made the panel 970px — 97%
     of the screen, for a tool you are meant to be looking *past* at the site
     you are capturing. The resize handle is how you ask for more. */
  max-height: min(620px, calc(100vh - 32px));
  display: flex;
  flex-direction: column;
  pointer-events: auto;
  background: var(--ua-surface);
  -webkit-backdrop-filter: var(--ua-blur);
  backdrop-filter: var(--ua-blur);
  color: var(--ua-text);
  border-radius: 12px;
  box-shadow: 0 0 0 0.5px var(--ua-ring), var(--ua-shadow);
  font-size: 12px;
  line-height: 1.45;
  overflow: hidden;
}
.ua-panel[hidden] { display: none; }

.ua-titlebar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 10px;
  cursor: grab;
  user-select: none;
  border-bottom: 0.5px solid var(--ua-hairline);
}
.ua-title { font-size: 13px; font-weight: 590; letter-spacing: -0.01em; }
.ua-run {
  color: var(--ua-text-4);
  font-size: 10.5px;
  font-family: var(--ua-mono);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Always on screen, however tall the panel gets or wherever it is dragged. */
button.ua-btn--titlebar { padding: 3px 8px; font-size: 10.5px; cursor: pointer; }

.ua-body {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--ua-raised-strong) transparent;
}
.ua-body::-webkit-scrollbar { width: 8px; }
.ua-body::-webkit-scrollbar-thumb { background: var(--ua-raised-strong); border-radius: 4px; }

.ua-section { display: flex; flex-direction: column; gap: 6px; }
.ua-section > h3 {
  margin: 0;
  font-size: 11.5px;
  letter-spacing: normal;
  text-transform: none;
  color: var(--ua-text-3);
  font-weight: 590;
}
/* A collapsible heading is a control, so it looks and focuses like one. */
h3.ua-section__heading {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  user-select: none;
  border-radius: 5px;
  padding: 1px 2px;
  margin: 0 -2px;
}
h3.ua-section__heading:hover { color: var(--ua-text); background: var(--ua-raised); }
h3.ua-section__heading:focus-visible { outline: 2px solid var(--ua-accent); outline-offset: 1px; }
.ua-section__caret { font-size: 8px; opacity: 0.7; width: 8px; }
.ua-section__body { display: flex; flex-direction: column; gap: 6px; }
.ua-section__body[hidden] { display: none; }

.ua-row { display: flex; flex-wrap: wrap; gap: 6px; }

button.ua-btn {
  all: unset;
  box-sizing: border-box;
  padding: 5px 10px;
  border-radius: 7px;
  background: var(--ua-raised-strong);
  color: var(--ua-text);
  box-shadow: inset 0 0 0 0.5px var(--ua-ring);
  cursor: pointer;
  font-size: 11.5px;
  white-space: nowrap;
}
button.ua-btn:hover { background: var(--ua-raised-hover); }
button.ua-btn:focus-visible { outline: 2px solid var(--ua-accent); outline-offset: 1px; }
button.ua-btn[aria-pressed="true"] {
  background: var(--ua-accent);
  color: var(--ua-on-accent);
  box-shadow: none;
  font-weight: 590;
}
button.ua-btn[disabled] { opacity: 0.45; cursor: not-allowed; }
/* The state currently applied to the live page — the same red as the selection
   ring on the element itself, because they are saying the same thing. */
button.ua-btn--previewing {
  background: var(--ua-highlight);
  color: #ffffff;
  box-shadow: none;
  font-weight: 590;
}
button.ua-btn--primary {
  background: var(--ua-accent);
  color: var(--ua-on-accent);
  box-shadow: none;
  font-weight: 590;
}
button.ua-btn--primary:hover { background: var(--ua-accent); filter: brightness(1.08); }
button.ua-btn--quiet {
  background: transparent;
  box-shadow: none;
  color: var(--ua-text-3);
  padding: 2px 4px;
}
button.ua-btn--quiet:hover { background: var(--ua-raised); color: var(--ua-text); }

/* What to do next. Deliberately the loudest thing in the panel. */
.ua-flow {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 9px 10px;
  border-radius: 9px;
  background: var(--ua-accent-quiet);
  box-shadow: inset 0 0 0 1px var(--ua-accent);
  color: var(--ua-text);
  font-size: 12px;
  line-height: 1.45;
}
.ua-flow[data-step="review"],
.ua-flow[data-step="finish"] {
  background: var(--ua-ok-quiet);
  box-shadow: inset 0 0 0 1px var(--ua-ok);
}
.ua-flow[data-step="working"] {
  background: var(--ua-warn-quiet);
  box-shadow: inset 0 0 0 1px var(--ua-warn);
}
.ua-flow[data-step="connect"] {
  background: var(--ua-raised);
  box-shadow: inset 0 0 0 1px var(--ua-hairline);
  color: var(--ua-text-3);
}
.ua-flow__step {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ua-text-4);
  font-weight: 590;
}

.ua-steps__list { margin: 0; padding-left: 18px; display: grid; gap: 4px; color: var(--ua-text-3); font-size: 11px; line-height: 1.45; }
.ua-steps__list li strong { color: var(--ua-text-2); font-weight: 590; }
.ua-steps__list li.ua-steps__item--current { color: var(--ua-text); }
.ua-steps__list li.ua-steps__item--current strong { color: var(--ua-accent); }

/* Tabs: only one group of sections renders at a time. */
.ua-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 0.5px solid var(--ua-hairline);
  padding-bottom: 0;
}
button.ua-tab {
  all: unset;
  box-sizing: border-box;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 11.5px;
  color: var(--ua-text-3);
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
button.ua-tab:hover { color: var(--ua-text); }
button.ua-tab:focus-visible { outline: 2px solid var(--ua-accent); outline-offset: -2px; }
button.ua-tab--active { color: var(--ua-text); border-bottom-color: var(--ua-accent); font-weight: 590; }
.ua-tabpanel { display: flex; flex-direction: column; gap: 12px; }

/* Compact mode: the flow line, the capture buttons, and nothing else. */
.ua-compact:empty { display: none; }
.ua-panel--compact .ua-tabs,
.ua-panel--compact .ua-tabpanel,
.ua-panel--compact .ua-section:has(.ua-section__heading),
.ua-panel--compact .ua-resize { display: none; }
.ua-panel--compact { max-height: none; }

/* The bottom edge, draggable. */
.ua-resize {
  height: 10px;
  flex: 0 0 auto;
  cursor: ns-resize;
  background: transparent;
  border-top: 0.5px solid var(--ua-hairline);
  position: relative;
}
.ua-resize::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 4px;
  width: 28px;
  height: 2px;
  margin-left: -14px;
  border-radius: 1px;
  background: var(--ua-text-5);
}
.ua-resize:hover::after { background: var(--ua-text-3); }

.ua-files { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 5px; }
.ua-files li { background: var(--ua-raised); border-radius: 7px; padding: 6px 8px; }
.ua-file__name {
  display: block;
  font-family: var(--ua-mono);
  font-size: 11px;
  color: var(--ua-text-2);
  word-break: break-all;
}

.ua-kv { display: grid; grid-template-columns: 84px 1fr; gap: 2px 8px; }
.ua-kv dt { color: var(--ua-text-3); }
.ua-kv dd { margin: 0; word-break: break-word; font-family: var(--ua-mono); }

.ua-empty { color: var(--ua-text-4); font-style: italic; }
.ua-hint { color: var(--ua-text-3); font-size: 11px; line-height: 1.4; }

.ua-locator {
  background: var(--ua-raised);
  box-shadow: inset 0 0 0 0.5px var(--ua-ring);
  border-radius: 7px;
  padding: 7px;
  font-family: var(--ua-mono);
  word-break: break-all;
}
.ua-score { color: var(--ua-ok); }
.ua-score--low { color: var(--ua-warn); }

.ua-jobs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ua-job {
  display: flex;
  gap: 6px;
  align-items: baseline;
  background: var(--ua-raised);
  border-radius: 7px;
  padding: 5px 7px;
}
.ua-job__label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ua-job__status { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
.ua-job--done .ua-job__status { color: var(--ua-ok); }
.ua-job--failed .ua-job__status { color: var(--ua-error); }
.ua-job--running .ua-job__status { color: var(--ua-accent); }
.ua-job--queued .ua-job__status { color: var(--ua-text-4); }
.ua-job--cancelled .ua-job__status { color: var(--ua-text-4); }

.ua-notice { padding: 7px 9px; border-radius: 7px; font-size: 11px; }
.ua-notice--info { background: var(--ua-accent-quiet); color: var(--ua-text); }
.ua-notice--warn { background: var(--ua-warn-quiet); color: var(--ua-text); }
.ua-notice--error { background: var(--ua-error-quiet); color: var(--ua-text); }

.ua-input {
  all: unset;
  box-sizing: border-box;
  width: 64px;
  padding: 5px 7px;
  border-radius: 7px;
  background: var(--ua-raised);
  box-shadow: inset 0 0 0 0.5px var(--ua-ring);
  color: var(--ua-text);
  font-family: var(--ua-mono);
}
.ua-input:focus-visible { outline: 2px solid var(--ua-accent); outline-offset: 1px; }

.ua-help { display: grid; grid-template-columns: 96px 1fr; gap: 2px 8px; color: var(--ua-text-3); font-size: 11px; }
.ua-help kbd {
  font-family: var(--ua-mono);
  background: var(--ua-raised-strong);
  border-radius: 4px;
  padding: 0 4px;
}

.ua-anims { list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.ua-anims li {
  padding: 7px 9px;
  border-radius: 7px;
  background: var(--ua-raised);
  box-shadow: inset 0 0 0 0.5px var(--ua-ring);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ua-anim__title { font-size: 11.5px; font-weight: 590; word-break: break-all; }

.ua-toggle-pill {
  position: fixed;
  top: 16px;
  right: 16px;
  pointer-events: auto;
}
`;
