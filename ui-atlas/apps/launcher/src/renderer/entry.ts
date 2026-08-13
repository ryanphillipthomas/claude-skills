/**
 * Renderer entry. Installs the stylesheet, subscribes, and redraws.
 *
 * The window is sized to the panel from here rather than from the main
 * process: only the renderer knows how tall the content became, and a popover
 * that is the wrong height is the first thing anyone notices.
 */

import type { LauncherBridge, LauncherSnapshot } from '../ipc.js';
import { PANEL_WIDTH, STYLES } from './styles.js';
import { render } from './view.js';

declare global {
  interface Window {
    launcher: LauncherBridge;
  }
}

const style = document.createElement('style');
style.textContent = STYLES;
document.head.append(style);

const panel = document.createElement('div');
panel.id = 'panel';
document.body.append(panel);

function reportHeight(): void {
  const height = Math.ceil(panel.getBoundingClientRect().height);
  if (height > 0) window.launcher.send({ kind: 'measured', height });
}

window.launcher.subscribe((snapshot: LauncherSnapshot) => {
  render(panel, snapshot, (request) => {
    window.launcher.send(request);
  });
  // After layout, so the measurement is of what was just drawn.
  requestAnimationFrame(reportHeight);
});

export { PANEL_WIDTH };
