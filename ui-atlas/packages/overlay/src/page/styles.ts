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
  --ua-focus-ring: rgba(10, 132, 255, 0.45);
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
    /* The light accent's own ring, not the dark one at a different opacity. */
    --ua-focus-ring: rgba(0, 122, 255, 0.4);
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

/*
 * The shutter, drawn over the element being photographed and clipped to its
 * box. It lives in the highlight layer, which is inside the overlay's shadow
 * host — the same host that is hidden before every capture, so the shutter can
 * never photograph itself.
 *
 * The keyframes are in highlight.ts rather than here: restarting a CSS
 * animation needs a forced reflow, and a forced reflow lays out the whole
 * document including the page under capture.
 */
.ua-shutter { overflow: hidden; }
.ua-shutter__scale,
.ua-shutter__band,
.ua-shutter__flash {
  position: absolute;
  inset: 0;
  pointer-events: none;
  will-change: transform, opacity;
}
.ua-shutter__band {
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0),
    rgba(255, 255, 255, 0.85),
    rgba(255, 255, 255, 0)
  );
  opacity: 0;
}
.ua-shutter__flash { background: #ffffff; opacity: 0; }

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

/* Help on the left, collapse on the right, name in the middle — design 3a. */
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
.ua-titlebar__centre {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  text-align: center;
}
.ua-title { font-size: 13px; font-weight: 590; letter-spacing: -0.01em; }
.ua-run {
  color: var(--ua-text-4);
  font-size: 10.5px;
  font-family: var(--ua-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* A 22pt square that is all target and no chrome, as the design draws it. */
button.ua-btn--glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: none;
  padding: 0;
  border-radius: 6px;
  background: transparent;
  box-shadow: none;
  color: var(--ua-text-3);
  font-size: 13px;
}
button.ua-btn--glyph:hover { background: var(--ua-raised); color: var(--ua-text); }

/*
 * How much of the run is done, directly under the header.
 *
 * Determinate, and measured across the whole run rather than per job: a bar
 * that restarted at every job would say "nearly there" six times. It scales on
 * the X axis rather than animating the width, so it never lays anything out.
 */
.ua-progress {
  position: relative;
  height: 2px;
  flex: 0 0 auto;
  background: var(--ua-raised-strong);
  overflow: hidden;
}
.ua-progress[hidden] { display: none; }
.ua-progress__fill {
  position: absolute;
  inset: 0;
  transform-origin: 0 50%;
  transform: scaleX(0);
  background: var(--ua-accent);
  transition: transform 240ms cubic-bezier(0.32, 0.72, 0, 1);
}
.ua-progress--error .ua-progress__fill { background: var(--ua-error); }

.ua-body {
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scrollbar-width: thin;
  scrollbar-color: var(--ua-raised-strong) transparent;
}
.ua-body::-webkit-scrollbar { width: 8px; }
.ua-body::-webkit-scrollbar-thumb { background: var(--ua-raised-strong); border-radius: 4px; }

.ua-hairline { height: 0.5px; background: var(--ua-hairline); flex: none; }

/*
 * A segmented control, used for every "which one of these" in the panel: the
 * step, the state filter, the viewport. One idiom rather than three.
 */
.ua-seg {
  display: flex;
  padding: 2px;
  gap: 2px;
  border-radius: 8px;
  background: var(--ua-raised-strong);
}
button.ua-seg__item {
  all: unset;
  box-sizing: border-box;
  flex: 1;
  text-align: center;
  padding: 4px 0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 11.5px;
  color: var(--ua-text-3);
  white-space: nowrap;
}
button.ua-seg__item:hover { color: var(--ua-text); }
button.ua-seg__item:focus-visible { outline: 2px solid var(--ua-accent); outline-offset: -2px; }
button.ua-seg__item--on {
  color: var(--ua-text);
  font-weight: 590;
  background: var(--ua-selected);
  box-shadow: 0 0.5px 2px rgba(0, 0, 0, 0.3);
}
/*
 * The step control stays put while the rest scrolls.
 *
 * Design 3a draws it directly under the header, which is only where it stays if
 * the panel is short enough not to scroll. Every block being on screen at once
 * is exactly what makes it scroll — so the one control whose whole job is to
 * say where you are is the one that must not scroll away.
 */
.ua-steps {
  position: sticky;
  top: 0;
  z-index: 1;
  flex: none;
  /* Opaque, or the cards would show through it as they pass underneath. */
  background: var(--ua-surface-opaque);
  box-shadow: 0 0 0 4px var(--ua-surface-opaque);
}

/* The inline variant that sits at the end of a block heading. */
.ua-seg--quiet { flex: none; margin-left: auto; border-radius: 7px; }
.ua-seg--quiet button.ua-seg__item { flex: none; padding: 2px 8px; border-radius: 5px; font-size: 10.5px; }

/*
 * What to do next, as one line under the step control.
 *
 * 3a has no room for a paragraph and the segmented control already says where
 * you are — but the sentence is the answer to the question a first-time user
 * actually has, so it stays as a caption rather than a tinted box.
 */
.ua-flow {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--ua-text-3);
}
.ua-flow__step {
  flex: none;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ua-text-5);
  font-weight: 590;
}
.ua-flow__text { min-width: 0; }
.ua-flow[data-step="working"] .ua-flow__text { color: var(--ua-text-2); }
.ua-flow[data-step="review"] .ua-flow__text,
.ua-flow[data-step="finish"] .ua-flow__text { color: var(--ua-ok); }

/* The instructions, behind the ? rather than occupying a quarter of the panel. */
.ua-help-sheet {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border-radius: 9px;
  background: var(--ua-raised);
  box-shadow: inset 0 0 0 0.5px var(--ua-ring);
}
.ua-help-sheet[hidden] { display: none; }
.ua-steps__list { margin: 0; padding-left: 18px; display: grid; gap: 4px; color: var(--ua-text-3); font-size: 11px; line-height: 1.45; }
.ua-steps__list li strong { color: var(--ua-text-2); font-weight: 590; }
.ua-steps__list li.ua-steps__item--current { color: var(--ua-text); }
.ua-steps__list li.ua-steps__item--current strong { color: var(--ua-accent); }
.ua-help { display: grid; grid-template-columns: 96px 1fr; gap: 2px 8px; color: var(--ua-text-3); font-size: 11px; }
.ua-help kbd {
  font-family: var(--ua-mono);
  background: var(--ua-raised-strong);
  border-radius: 4px;
  padding: 0 4px;
}

.ua-notices:empty { display: none; }

/* One stack of related controls: element, states, capture, captured. */
.ua-block { display: flex; flex-direction: column; gap: 10px; }
.ua-block__head { display: flex; align-items: center; gap: 8px; }
.ua-block__title { font-size: 11.5px; font-weight: 590; color: var(--ua-text-3); }
.ua-block__note { font-size: 11.5px; color: var(--ua-text-5); }

.ua-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.ua-row--capture { flex-wrap: nowrap; gap: 8px; }
.ua-row--quiet { gap: 4px; }

button.ua-btn {
  all: unset;
  box-sizing: border-box;
  padding: 4px 10px;
  border-radius: 6px;
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
  font-weight: 510;
}
button.ua-btn[disabled] { opacity: 0.45; cursor: not-allowed; }
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
  padding: 3px 6px;
  font-size: 11px;
}
button.ua-btn--quiet:hover { background: var(--ua-raised); color: var(--ua-text); }
button.ua-btn--quiet[aria-pressed="true"] { background: var(--ua-accent); color: var(--ua-on-accent); }
/* Reads as the link the design draws, not as another button in a row of them. */
button.ua-btn--link {
  margin-left: auto;
  background: transparent;
  box-shadow: none;
  color: var(--ua-accent);
  padding: 0;
  font-size: 11.5px;
}
button.ua-btn--link:hover { background: transparent; text-decoration: underline; }

/* Previous and next as one paired control, which is what fits at 340pt. */
.ua-pair { display: flex; margin-left: auto; }
button.ua-btn--pair { border-radius: 0; padding: 4px 8px; }
.ua-pair button.ua-btn--pair:first-child { border-radius: 6px 0 0 6px; }
.ua-pair button.ua-btn--pair:last-child { border-radius: 0 6px 6px 0; }

/* The element this run is pointed at. */
.ua-target {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ua-target__dot {
  position: relative;
  width: 8px;
  height: 8px;
  flex: none;
}
.ua-target__dot::before,
.ua-target__dot::after {
  content: '';
  position: absolute;
  border-radius: 3px;
  background: var(--ua-highlight);
}
.ua-target__dot::before { inset: 0; }
.ua-target__dot::after { inset: -3px; border-radius: 5px; opacity: 0; }
.ua-target--busy .ua-target__dot::after { animation: ua-pulse 1.4s ease-in-out infinite; }
.ua-target--empty .ua-target__dot::before { background: var(--ua-text-5); }
.ua-target__name {
  flex: 1;
  min-width: 0;
  font-family: var(--ua-mono);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ua-target--empty .ua-target__name { font-family: inherit; color: var(--ua-text-4); font-style: italic; }
.ua-target__state { flex: none; font-size: 11.5px; color: var(--ua-text-3); }

.ua-details { display: flex; flex-direction: column; gap: 6px; }
.ua-kv { display: grid; grid-template-columns: 84px 1fr; gap: 2px 8px; margin: 0; }
.ua-kv dt { color: var(--ua-text-3); }
.ua-kv dd { margin: 0; word-break: break-word; font-family: var(--ua-mono); }

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

/*
 * The states grid — design 3a.
 *
 * A card, not a chip: a state is a thing you are going to photograph, so it is
 * shown as the picture it will produce plus its name, rather than as a word
 * that happens to be highlighted.
 */
.ua-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
button.ua-card {
  all: unset;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  border-radius: 9px;
  cursor: pointer;
  background: var(--ua-raised);
  box-shadow: inset 0 0 0 0.5px var(--ua-hairline);
}
button.ua-card:hover { background: var(--ua-raised-strong); }
button.ua-card:focus-visible { outline: 2px solid var(--ua-accent); outline-offset: 1px; }
button.ua-card--on {
  background: var(--ua-accent-quiet);
  box-shadow: inset 0 0 0 1px var(--ua-accent);
}
.ua-card__preview {
  height: 46px;
  border-radius: 6px;
  background: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.ua-card__image { display: block; width: 100%; height: 100%; object-fit: contain; }
/* A diagram of the element until there is a real shot of it to show. */
.ua-card__chip {
  max-width: 90%;
  padding: 4px 9px;
  border-radius: 5px;
  background: #1d1d1f;
  color: #ffffff;
  font-size: 8.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ua-card__label { display: flex; align-items: center; gap: 6px; font-size: 11.5px; }
.ua-card__box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex: none;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px var(--ua-text-5);
  font-size: 9px;
}
.ua-card--on .ua-card__box {
  background: var(--ua-accent);
  color: var(--ua-on-accent);
  box-shadow: none;
}
.ua-card__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The state currently applied to the live page — the same red as the ring on
   the element itself, because they are saying the same thing. */
.ua-card__live { margin-left: auto; font-size: 10.5px; color: var(--ua-highlight); }

.ua-input {
  all: unset;
  box-sizing: border-box;
  width: 58px;
  padding: 3px 6px;
  border-radius: 6px;
  background: var(--ua-raised);
  box-shadow: inset 0 0 0 0.5px var(--ua-ring);
  color: var(--ua-text);
  font-family: var(--ua-mono);
  font-size: 11px;
}
.ua-input:focus-visible { outline: 2px solid var(--ua-accent); outline-offset: 1px; }

/*
 * The captured list — design 3a, animated by 5a.
 *
 * Newest first, so a finished capture lands at the top.
 */
.ua-shots {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  border-radius: 9px;
  background: var(--ua-raised);
  overflow: hidden;
}
.ua-shot {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 8px;
}
.ua-shot + .ua-shot { box-shadow: inset 0 0.5px 0 var(--ua-hairline); }
.ua-shot__thumb {
  flex: none;
  width: 44px;
  height: 28px;
  border-radius: 4px;
  background: var(--ua-raised-strong);
  box-shadow: inset 0 0 0 0.5px var(--ua-ring);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: var(--ua-text-4);
  overflow: hidden;
}
.ua-shot__image {
  display: block;
  width: 100%;
  height: 100%;
  /* The shot's own shape is information: letterbox it rather than crop it. */
  object-fit: contain;
  background: #ffffff;
}
.ua-shot__text { min-width: 0; display: flex; flex-direction: column; }
.ua-shot__name {
  font-family: var(--ua-mono);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ua-shot__meta {
  font-size: 10.5px;
  color: var(--ua-text-4);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ua-shot__ring { flex: none; margin-left: auto; }
.ua-shot__ring .ua-ring__track { stroke: var(--ua-ring); }
/* Filled over the real write: the job's own progress moves it, not a clock. */
.ua-shot__ring .ua-ring__fill {
  stroke: var(--ua-ok);
  transition: stroke-dashoffset 240ms cubic-bezier(0.32, 0.72, 0, 1);
}
.ua-shot__ring .ua-ring__tick {
  stroke: var(--ua-ok);
  animation: ua-tick 140ms cubic-bezier(0.32, 0.72, 0, 1) both;
}
.ua-shot__ring--failed .ua-ring__fill,
.ua-shot__ring--failed .ua-ring__tick { stroke: var(--ua-error); }
.ua-shot--activity { padding: 7px 8px; }
.ua-shot__pulse {
  width: 44px;
  flex: none;
  display: flex;
  justify-content: center;
}
.ua-shot__pulse::before {
  content: '';
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--ua-accent);
  animation: ua-pulse 1.4s ease-in-out infinite;
}

.ua-output { display: flex; flex-direction: column; gap: 6px; }
.ua-files { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
.ua-files li { background: var(--ua-raised); border-radius: 7px; padding: 6px 8px; }
.ua-file__name {
  display: block;
  font-family: var(--ua-mono);
  font-size: 11px;
  color: var(--ua-text-2);
  word-break: break-all;
}

.ua-empty { color: var(--ua-text-4); font-style: italic; padding: 6px 8px; }
.ua-hint { color: var(--ua-text-3); font-size: 11px; line-height: 1.4; }

.ua-notice { padding: 7px 9px; border-radius: 7px; font-size: 11px; }
.ua-notice--info { background: var(--ua-accent-quiet); color: var(--ua-text); }
.ua-notice--warn { background: var(--ua-warn-quiet); color: var(--ua-text); }
.ua-notice--error { background: var(--ua-error-quiet); color: var(--ua-text); }

.ua-anim-host { display: flex; flex-direction: column; gap: 6px; }
.ua-anims { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
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

/* Compact mode: the step line, the capture controls, and nothing else. */
.ua-compact:empty { display: none; }
.ua-panel--compact .ua-block,
.ua-panel--compact .ua-hairline,
.ua-panel--compact .ua-help-sheet,
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

/* ------------------------------------------------------------------------ *
 * Capture in progress — design 5a.
 *
 * Everything here is inside the panel, which is inside a fixed shadow host that
 * is hidden before every screenshot. The page under capture is never laid out
 * by any of it.
 * ------------------------------------------------------------------------ */

@keyframes ua-spin { to { transform: rotate(360deg); } }
@keyframes ua-sheen {
  from { transform: translateX(-140%); }
  to { transform: translateX(340%); }
}
@keyframes ua-pulse {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}
@keyframes ua-row-in {
  from { opacity: 0; max-height: 0; transform: translateY(10px); }
  to { opacity: 1; max-height: 44px; transform: translateY(0); }
}
@keyframes ua-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes ua-tick { to { stroke-dashoffset: 0; } }

/* The state being photographed right now: the selected treatment, plus a
   spinner where the tick would go. The spinner is the status; the tint only
   agrees with it. */
button.ua-card--capturing {
  position: relative;
  background: var(--ua-accent-quiet);
  box-shadow: inset 0 0 0 1px var(--ua-accent);
  overflow: hidden;
}
button.ua-card--capturing::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 36%;
  pointer-events: none;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0),
    var(--ua-raised-hover),
    rgba(255, 255, 255, 0)
  );
  animation: ua-sheen 1s linear infinite;
}
.ua-spinner { flex: none; animation: ua-spin 1s linear infinite; transform-origin: 50% 50%; }

/* A row that has just landed. The list reserves nothing before it exists:
   the row grows from zero, so nothing ever sits there empty waiting. */
.ua-shot--entering {
  overflow: hidden;
  animation: ua-row-in 320ms cubic-bezier(0.32, 0.72, 0, 1) both;
}
/* In place, no flight path and no scale — the row is where the file is. */
.ua-shot--entering .ua-shot__thumb { animation: ua-fade-in 320ms cubic-bezier(0.32, 0.72, 0, 1) both; }

/* The count, crossfading to its new value rather than snapping. */
.ua-count {
  position: relative;
  display: inline-block;
  min-width: 44px;
  font-size: 11.5px;
  color: var(--ua-text-5);
}
.ua-count__value { animation: ua-fade-in 320ms cubic-bezier(0.32, 0.72, 0, 1) both; }
.ua-count--changed .ua-count__value { color: var(--ua-ok); }

/*
 * The footer control: one component, six conditions.
 *
 * Ready and pressed and focused are the base button; capturing, complete and
 * error are tints of it; disabled is the same shape with nothing to do. They
 * are variants because they are the same control answering "what is happening
 * to my capture?" — seven separate designs would be seven things to keep true.
 */
button.ua-btn--primary:active { filter: brightness(0.82); }
button.ua-btn--primary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--ua-focus-ring);
}
button.ua-btn--capture {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px;
  border-radius: 9px;
  font-size: 13px;
  flex: 1;
  min-width: 0;
}
button.ua-btn--capture[data-phase='capturing'] {
  background: var(--ua-accent-quiet);
  box-shadow: inset 0 0 0 1px var(--ua-accent);
  color: var(--ua-text);
}
button.ua-btn--capture[data-phase='complete'] {
  background: var(--ua-ok-quiet);
  box-shadow: inset 0 0 0 1px var(--ua-ok);
  color: var(--ua-ok);
}
button.ua-btn--capture[data-phase='error'] {
  background: var(--ua-error-quiet);
  box-shadow: inset 0 0 0 1px var(--ua-error);
  color: var(--ua-error);
}
button.ua-btn--capture[disabled] {
  background: var(--ua-raised);
  box-shadow: none;
  color: var(--ua-text-5);
  opacity: 1;
}

/* Beside the busy control, and quiet: stopping is the rarer intention. */
button.ua-btn--stop {
  padding: 8px 12px;
  border-radius: 9px;
  background: var(--ua-raised-strong);
  box-shadow: inset 0 0 0 0.5px var(--ua-ring);
  color: var(--ua-text-3);
  font-size: 12px;
  flex: none;
}
button.ua-btn--stop:hover { background: var(--ua-raised-hover); color: var(--ua-text); }
button.ua-btn--stop[hidden] { display: none; }

/* Announced, never merely shown. */
.ua-live {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/*
 * Reduce Motion keeps every piece of information and drops only the travel.
 *
 * The sweep and the flash become one cross-fade (in highlight.ts, which reads
 * the same query); the sheen and the pulse go, because they say nothing a
 * glyph is not already saying; the ring and the hairline stop easing and jump
 * between values; and a new row fades in at full height instead of growing.
 */
@media (prefers-reduced-motion: reduce) {
  .ua-progress__fill { transition: none; }
  button.ua-card--capturing::after { animation: none; content: none; }
  .ua-spinner { animation: none; }
  .ua-target--busy .ua-target__dot::after { animation: none; opacity: 1; }
  .ua-shot__pulse::before { animation: none; opacity: 1; }
  .ua-shot--entering { animation: ua-fade-in 120ms linear both; }
  .ua-shot--entering .ua-shot__thumb { animation: none; }
  .ua-shot__ring .ua-ring__fill { transition: none; }
  .ua-shot__ring .ua-ring__tick { animation: none; }
  .ua-count__value { animation: none; }
}

.ua-toggle-pill {
  position: fixed;
  top: 16px;
  right: 16px;
  pointer-events: auto;
}
`;
