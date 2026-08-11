/**
 * Host-side functions Playwright serialises into the page. Real function
 * literals, never strings: Playwright evaluates a string as a plain expression
 * and would never call it.
 */
import type { ElementProbe, HostEvent } from '@ui-atlas/protocol';

interface OverlayApiShape {
  version: string;
  dispatch(event: HostEvent): void;
  hide(): void;
  show(): void;
}

type ProbeFunction = (element: Element) => ElementProbe;

type BridgedWindow = Window & {
  __uiAtlasOverlay?: OverlayApiShape;
  __uiAtlasProbe?: ProbeFunction;
};

export function hideOverlayHosts(attribute: string): number {
  const hosts = document.querySelectorAll<HTMLElement>(`[${attribute}]`);
  for (const host of Array.from(hosts)) host.style.setProperty('display', 'none', 'important');
  return hosts.length;
}

export function showOverlayHosts(attribute: string): number {
  const hosts = document.querySelectorAll<HTMLElement>(`[${attribute}]`);
  for (const host of Array.from(hosts)) host.style.removeProperty('display');
  return hosts.length;
}

export function dispatchToOverlay(event: HostEvent): boolean {
  const api = (window as BridgedWindow).__uiAtlasOverlay;
  if (api === undefined) return false;
  api.dispatch(event);
  return true;
}

export function isOverlayMounted(): boolean {
  return (window as BridgedWindow).__uiAtlasOverlay !== undefined;
}

export function probeWithInstalledProbe(element: Element): ElementProbe {
  const probe = (window as BridgedWindow).__uiAtlasProbe;
  if (probe === undefined) throw new Error('the ui-atlas element probe is not installed on this page');
  return probe(element);
}
