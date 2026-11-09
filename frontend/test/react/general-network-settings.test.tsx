import { expect, it, vi } from 'vitest';

import { StartupSettings } from '../../src/react/settings/general-settings';
import { PeachProxy } from '../../src/react/settings/network-settings';
import { buttonNamed, choose, click, fetchMock, mount, sentBody, settle, submit, switches, type } from './render';

const startup = { available: true, enabled: false, silent: true, message: '', desktop: false, desktop_message: '' };

it('Launch at login: silent start unlocks together with launch at login, and saving sends the actual values of all three toggles', async () => {
  const fetcher = fetchMock(200, {});
  vi.stubGlobal('fetch', fetcher);
  const receipt = vi.fn();
  const host = await mount(<StartupSettings startup={startup} receipt={receipt} />);
  expect(switches(host).map((input) => input.getAttribute('aria-label')))
    .toEqual(['Start Peach after sign-in', 'Start the tray only, without opening the web app', 'Create desktop shortcut']);
  expect(switches(host).map((input) => input.disabled)).toEqual([false, true, false]);
  expect(buttonNamed('Save configuration', host)).not.toBeNull();
  await click(switches(host)[0]);
  expect(switches(host)[1]!.disabled).toBe(false);
  expect(fetcher).not.toHaveBeenCalled();
  await submit(host.querySelector('form'));
  await settle();
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/configuration/startup');
  expect(sentBody(fetcher)).toEqual({ enabled: true, silent: true, desktop: false });
  expect(receipt).toHaveBeenCalledWith('Configuration saved');
});

it('When another install holds the desktop shortcut only that one locks, with the reason stated', async () => {
  // Having another Peach's icon on the desktop should not block toggling launch at startup; that cell is fine on its own.
  const host = await mount(<StartupSettings
    startup={{ ...startup, enabled: true, desktop_message: 'The desktop shortcut belongs to another Peach install' }} receipt={vi.fn()} />);
  expect(switches(host).map((input) => input.disabled)).toEqual([false, false, true]);
  expect(buttonNamed('Save configuration', host)?.disabled).toBe(false);
  expect(host.textContent).toContain('The desktop shortcut belongs to another Peach install');
});

it('Peach proxy: the address box appears only with custom selected, saving clears the box and remembers the saved state', async () => {
  const fetcher = fetchMock(200, { mode: 'proxy', proxy_saved: true, needs_selection: false });
  vi.stubGlobal('fetch', fetcher);
  const receipt = vi.fn();
  const host = await mount(<PeachProxy initial={{ mode: 'direct', proxy_saved: false, needs_selection: true }} receipt={receipt} />);
  expect(host.querySelector('[role="note"]')?.textContent).toContain('A connection method must be chosen.Existing sources use different proxy addresses; choose the shared connection method.');
  expect(host.querySelector('#peachProxyAddress')).toBeNull();
  await choose(host.querySelector('[aria-haspopup="listbox"]'), 'Custom');
  const address = host.querySelector<HTMLInputElement>('#peachProxyAddress');
  expect(address?.placeholder).toBe('http://127.0.0.1:7890');
  await type(address, 'http://127.0.0.1:7890');
  await submit(host.querySelector('form'));
  await settle();
  expect(sentBody(fetcher)).toEqual({ mode: 'proxy', proxy: 'http://127.0.0.1:7890' });
  expect(receipt).toHaveBeenCalledWith('Configuration saved');
  const saved = host.querySelector<HTMLInputElement>('#peachProxyAddress');
  expect(saved?.value).toBe('');
  expect(saved?.placeholder).toBe('Saved; leave empty to keep');
  expect(host.querySelector('[role="note"]')).toBeNull();
});
