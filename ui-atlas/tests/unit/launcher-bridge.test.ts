import { describe, expect, it } from 'vitest';
import {
  BRIDGE_PROTOCOL_VERSION,
  commandFor,
  readRequest,
} from '../../apps/launcher/src/bridge/protocol.js';
import {
  extensionOrigin,
  nativeHostManifest,
  unpackedExtensionId,
} from '../../apps/launcher/src/bridge/extension-id.js';
import { wrapperScript } from '../../apps/launcher/src/bridge/install.js';
import {
  extensionModel,
  hostOfTab,
  type ExtensionInput,
} from '../../apps/launcher/src/extension/model.js';
import type { BridgeStatus } from '../../apps/launcher/src/bridge/protocol.js';

function status(overrides: Partial<BridgeStatus> = {}): BridgeStatus {
  return {
    protocol: BRIDGE_PROTOCOL_VERSION,
    phase: 'running',
    title: 'Engine running',
    subtitle: 'Chromium 141 · 4 runs today',
    ...overrides,
  };
}

function model(overrides: Partial<ExtensionInput> = {}): ReturnType<typeof extensionModel> {
  return extensionModel({
    status: status(),
    selected: 'element',
    pageHost: 'acme.com',
    ...overrides,
  });
}

describe('what the extension is allowed to send', () => {
  it('accepts the four methods and nothing else', () => {
    expect(readRequest('{"id":"1","method":"status"}').ok).toBe(true);
    expect(readRequest('{"id":"1","method":"start"}').ok).toBe(true);
    expect(readRequest('{"id":"1","method":"stop"}').ok).toBe(true);
    expect(readRequest('{"id":"1","method":"capture","url":"https://a.com","mode":"page"}').ok).toBe(true);
    expect(readRequest('{"id":"1","method":"exec","argv":["rm","-rf","/"]}').ok).toBe(false);
  });

  it('refuses a URL that is not http or https', () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x', 'not a url']) {
      const parsed = readRequest(`{"id":"1","method":"capture","url":${JSON.stringify(url)},"mode":"page"}`);
      expect(parsed.ok, url).toBe(false);
    }
  });

  it('refuses an unknown capture mode', () => {
    expect(readRequest('{"id":"1","method":"capture","url":"https://a.com","mode":"everything"}').ok).toBe(
      false,
    );
  });

  it('answers a line that is not JSON rather than throwing', () => {
    const parsed = readRequest('not json at all');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toBe('not valid JSON');
    expect(parsed.id).toBeUndefined();
  });

  it('keeps the id on a rejection, so a client can tell which request failed', () => {
    const parsed = readRequest('{"id":"c","method":"capture","url":"file:///etc/passwd","mode":"page"}');
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.id).toBe('c');
  });

  it('does not echo back an id that is not a short string', () => {
    for (const id of ['{"id":42,"method":"nope"}', `{"id":"${'x'.repeat(200)}","method":"nope"}`]) {
      const parsed = readRequest(id);
      expect(parsed.ok).toBe(false);
      if (parsed.ok) continue;
      expect(parsed.id).toBeUndefined();
    }
  });

  it('maps each mode to a command, and never to a shell string', () => {
    expect(commandFor('element', 'https://a.com')).toEqual(['inspect', 'https://a.com', '--auto-inspect']);
    expect(commandFor('page', 'https://a.com')).toEqual(['capture', 'https://a.com']);
    expect(commandFor('site', 'https://a.com')).toEqual(['crawl', 'https://a.com']);
    // The URL is one argv element. A host with a quote or a space in it stays
    // one argument rather than becoming two.
    expect(commandFor('page', 'https://a.com/a b')[1]).toBe('https://a.com/a b');
  });
});

describe('the extension id', () => {
  it('is derived from the load path the way Chrome derives it', () => {
    // Chrome: sha256 of the absolute path, first 16 bytes, nibbles mapped a–p.
    const id = unpackedExtensionId('/Users/x/ui-atlas/apps/launcher/dist/chrome-extension');
    expect(id).toMatch(/^[a-p]{32}$/);
    expect(id).toBe(unpackedExtensionId('/Users/x/ui-atlas/apps/launcher/dist/chrome-extension'));
  });

  it('changes when the checkout moves, which is why installing is re-runnable', () => {
    expect(unpackedExtensionId('/a/extension')).not.toBe(unpackedExtensionId('/b/extension'));
  });

  it('allows exactly one origin into the host manifest', () => {
    const id = unpackedExtensionId('/a/extension');
    const manifest = nativeHostManifest('/a/native-host.mjs', id);
    expect(manifest.allowed_origins).toEqual([extensionOrigin(id)]);
    expect(manifest.type).toBe('stdio');
    expect(manifest.path).toBe('/a/native-host.mjs');
  });
});

describe('the extension popover', () => {
  it('stays calm rather than showing an error when the launcher is not running', () => {
    // The design says a stopped *engine* shows a Start button rather than an
    // error, and it does — see the cold case below. An unreachable launcher is
    // a different thing, and offering Start for it would be a button that
    // cannot work: an extension cannot start an app it has no connection to.
    const stopped = model({ status: undefined });
    expect(stopped.header.title).toBe('UI Atlas is not running');
    expect(stopped.header.tone).toBe('idle');
    expect(stopped.primary.enabled).toBe(false);
    expect(stopped.modes).toBeUndefined();
  });

  it('treats an unreachable native host the same as a stopped launcher', () => {
    const unavailable = model({ status: status({ phase: 'unavailable', protocol: 0 }) });
    expect(unavailable.primary.enabled).toBe(false);
    expect(unavailable.header.title).toBe('UI Atlas is not running');
  });

  it('names the page it is looking at, and whether that profile is signed in', () => {
    expect(model({ status: status({ profile: 'acme', signedIn: true }) }).header.subtitle).toBe(
      'acme.com · signed in',
    );
    expect(model({ status: status({ profile: 'acme', signedIn: false }) }).header.subtitle).toBe(
      'acme.com · signed out',
    );
  });

  it('says nothing about sign-in when no profile is loaded', () => {
    // A clean run is expected to be signed out; reporting it would read as a
    // fault rather than the default.
    expect(model().header.subtitle).toBe('acme.com');
  });

  it('changes the button, not the layout, with the capture mode', () => {
    expect(model({ selected: 'element' }).primary.label).toBe('Pick an element…');
    expect(model({ selected: 'page' }).primary.label).toBe('Capture this page');
    expect(model({ selected: 'site' }).primary.label).toBe('Crawl this site');
    expect(model().caption).toBe('This tab reopens in a clean window so captures are deterministic');
    expect(model().modes?.options.map((option) => option.label)).toEqual(['Element', 'Page', 'Whole site']);
  });

  it('sends you to the menu bar for a question only the launcher can answer', () => {
    const signin = model({ status: status({ phase: 'signin', title: 'Page is signed out' }) });
    expect(signin.modes).toBeUndefined();
    expect(signin.caption).toBe('Answer the sign-in question in the menu bar first');
    expect(signin.header.tone).toBe('warn');
    // An enabled Start beside that caption would be contradictory advice.
    expect(signin.primary.enabled).toBe(false);
  });

  it('offers Start again after a failure, which is the one place retrying helps', () => {
    const failed = model({ status: status({ phase: 'failed', title: 'Build packages failed' }) });
    expect(failed.primary.enabled).toBe(true);
    expect(failed.header.tone).toBe('error');
  });

  it('does not offer a second Start while one is already starting', () => {
    const starting = model({ status: status({ phase: 'starting', title: 'Starting engine…' }) });
    expect(starting.primary).toEqual({ label: 'Starting…', action: 'start', enabled: false });
  });

  it('reports the last run when there is one', () => {
    const withRun = model({
      status: status({ lastRun: { label: '/pricing', files: 8, hasReport: true } }),
    });
    expect(withRun.lastRun).toEqual({ label: '/pricing', files: '8 files', hasReport: true });
    expect(model().lastRun).toBeUndefined();
  });
});

describe('hostOfTab', () => {
  it('reads the host of an ordinary page', () => {
    expect(hostOfTab('https://acme.com/pricing?x=1')).toBe('acme.com');
  });

  it('refuses a page the extension could not capture anyway', () => {
    expect(hostOfTab('chrome://extensions')).toBeUndefined();
    expect(hostOfTab('file:///tmp/x.html')).toBeUndefined();
    expect(hostOfTab(undefined)).toBeUndefined();
  });
});

describe('the native messaging host wrapper', () => {
  it('bakes in an absolute interpreter, because Chrome has no useful PATH', () => {
    // The relay's shebang is `#!/usr/bin/env node`, and a browser launched
    // from the Dock inherits /usr/bin:/bin:/usr/sbin:/sbin — where a Homebrew
    // or nvm Node is not. The host then never starts and the extension shows
    // "UI Atlas is not running" forever, with no way to find out why.
    const script = wrapperScript('/opt/homebrew/bin/node', '/repo/dist/native-host.mjs');
    expect(script).toContain("'/opt/homebrew/bin/node'");
    expect(script).toContain("'/repo/dist/native-host.mjs'");
    expect(script).not.toContain('env node');
    expect(script.startsWith('#!/bin/sh\n')).toBe(true);
  });

  it('can run the relay under Electron, which is present whenever the launcher is', () => {
    const script = wrapperScript('/apps/Electron', '/repo/host.mjs', { ELECTRON_RUN_AS_NODE: '1' });
    expect(script).toContain("env ELECTRON_RUN_AS_NODE='1' '/apps/Electron' '/repo/host.mjs'");
  });

  it('quotes a path containing a space or a quote', () => {
    const script = wrapperScript("/Users/a b/node", "/Users/a b/o'brien/host.mjs");
    expect(script).toContain(`'/Users/a b/node'`);
    expect(script).toContain(`'/Users/a b/o'\\''brien/host.mjs'`);
  });

  it('forwards Chrome\u2019s own arguments through to the relay', () => {
    expect(wrapperScript('/n', '/h').trimEnd().endsWith('"$@"')).toBe(true);
  });
});

describe('the extension when the launcher is absent', () => {
  it('does not offer a Start button it provably cannot honour', () => {
    // A stopped *engine* shows Start, per the design. An unreachable launcher
    // is different and was wrongly folded into it: an extension cannot start a
    // macOS app it has no connection to.
    const gone = extensionModel({ status: undefined, selected: 'element', pageHost: 'acme.com' });
    expect(gone.primary.enabled).toBe(false);
    expect(gone.header.subtitle).toBe('Open it from the menu bar');
    expect(gone.caption).toContain('npm run launcher');
  });

  it('still offers Start when the launcher is there and only the engine is cold', () => {
    const cold = extensionModel({
      status: status({ phase: 'cold', title: 'Engine stopped', subtitle: 'Nothing is running' }),
      selected: 'element',
      pageHost: 'acme.com',
    });
    expect(cold.primary).toEqual({ label: 'Start', action: 'start', enabled: true });
  });
});
