/**
 * The extension popover.
 *
 * It connects to the launcher through the native messaging host when it opens
 * and disconnects when it closes — there is no background service worker,
 * because nothing here needs to outlive the popup. That removes the whole class
 * of MV3 worker-lifetime bugs, and it means the extension holds no state
 * between openings.
 *
 * Rendering only. Every decision is in `model.ts`.
 */

import type { BridgeResponse, BridgeStatus, CaptureMode } from '../bridge/protocol.js';
import { NATIVE_HOST_NAME } from '../bridge/constants.js';
import { CAPTURE_MODES, extensionModel, hostOfTab, type ExtensionModel } from './model.js';
import { STYLES } from '../renderer/styles.js';

declare const chrome: {
  runtime: {
    connectNative: (name: string) => {
      postMessage: (message: unknown) => void;
      onMessage: { addListener: (fn: (message: unknown) => void) => void };
      onDisconnect: { addListener: (fn: () => void) => void };
    };
  };
  tabs: { query: (info: { active: boolean; currentWindow: boolean }) => Promise<Array<{ url?: string }>> };
};

let status: BridgeStatus | undefined;
let selected: CaptureMode = 'element';
let pageHost: string | undefined;
let pageUrl: string | undefined;
let requestId = 0;

const style = document.createElement('style');
style.textContent = STYLES;
document.head.append(style);

const panel = document.createElement('div');
panel.id = 'panel';
document.body.append(panel);

const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
port.onMessage.addListener((message: unknown) => {
  const value = message as Partial<BridgeResponse> & { status?: BridgeStatus };
  if (value.status !== undefined) status = value.status;
  draw();
});
port.onDisconnect.addListener(() => {
  // No host manifest, or the launcher is not running. Both are the same thing
  // to the user, and both render as a Start button rather than an error.
  status = undefined;
  draw();
});

function send(message: Record<string, unknown>): void {
  requestId += 1;
  port.postMessage({ id: `p${String(requestId)}`, ...message });
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className !== undefined) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function draw(): void {
  const model = extensionModel({ status, selected, pageHost });
  panel.textContent = '';
  panel.append(header(model));
  panel.append(el('div', 'divider'));

  const section = el('div', 'section');
  if (model.modes !== undefined) section.append(modeGroup(model.modes.selected));
  section.append(primaryButton(model));
  section.append(el('div', 'caption', model.caption));
  panel.append(section);

  if (model.lastRun !== undefined) {
    panel.append(el('div', 'divider'), lastRunRow(model.lastRun));
  }
}

function header(model: ExtensionModel): HTMLElement {
  const node = el('div', 'header');
  const badge = el('div', `badge badge--${model.header.tone}`);
  badge.append(el('span', 'dot'));
  const heading = el('div', 'heading');
  heading.append(
    el('span', 'title', model.header.title),
    el('span', 'subtitle', model.header.subtitle),
  );
  node.append(badge, heading);
  return node;
}

function modeGroup(active: CaptureMode): HTMLElement {
  const group = el('div');
  group.style.display = 'flex';
  group.style.flexDirection = 'column';
  group.style.gap = '6px';
  group.append(el('span', 'label', 'Capture'));

  const segmented = el('div', 'segmented');
  for (const option of CAPTURE_MODES) {
    const button = el('button', option.mode === active ? 'segment segment--on' : 'segment', option.label);
    button.addEventListener('click', () => {
      selected = option.mode;
      draw();
    });
    segmented.append(button);
  }
  group.append(segmented);
  return group;
}

function primaryButton(model: ExtensionModel): HTMLElement {
  const button = el('button', 'primary', model.primary.label);
  if (!model.primary.enabled) {
    button.disabled = true;
    button.style.opacity = '0.5';
    return button;
  }
  button.addEventListener('click', () => {
    if (model.primary.action === 'start') {
      send({ method: 'start' });
      return;
    }
    if (pageUrl === undefined) return;
    send({ method: 'capture', url: pageUrl, mode: selected });
    // The capture happens in a window of its own; leaving the popup open would
    // only invite a second press.
    window.close();
  });
  return button;
}

function lastRunRow(lastRun: NonNullable<ExtensionModel['lastRun']>): HTMLElement {
  const section = el('div', 'section');
  const row = el('div');
  row.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:11.5px;';
  row.append(el('span', 'label', 'Last run'));
  const files = el('span', undefined, lastRun.files);
  files.style.cssText = 'margin-left:auto; color:var(--text-2);';
  row.append(files);
  if (lastRun.hasReport) {
    const report = el('button', 'link', 'Report');
    report.addEventListener('click', () => {
      send({ method: 'status' });
    });
    row.append(report);
  }
  section.append(row);
  return section;
}

async function readActiveTab(): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    pageUrl = tabs[0]?.url;
    pageHost = hostOfTab(pageUrl);
  } catch {
    // No tab permission on this page (a chrome:// URL, for instance).
  }
  draw();
}

draw();
void readActiveTab();
