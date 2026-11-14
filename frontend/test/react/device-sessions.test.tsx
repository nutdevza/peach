/* Logged-in devices: the local marker, per-device revoke, revoke other devices, and read-only when opened elsewhere.
 * Every revoke first passes a confirm layer: only sent on confirm, not sent on cancel. Appearance is measured by preview and e2e. */
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import * as legacyUi from '@peach/legacy/ui';

import { queryClient } from '../../src/react/query';
import { AccessSettings } from '../../src/react/settings/access-settings';
import { DeviceSessions, lastSeen, type DeviceSession, type DeviceSessionList } from '../../src/react/settings/device-sessions';
import { buttonNamed, click, mount, section, settle } from './render';

notifyManager.setScheduler(notify => notify());
afterEach(() => { queryClient.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear() });

const now = Math.floor(Date.now() / 1000);
const row = (fields: Partial<DeviceSession>): DeviceSession => ({
  id: '0000000000000000', device: 'Chrome · Windows', network: 'loopback', remote: false,
  created_at: now - 7200, last_seen: now - 10, expires: now + 86400, legacy: false, current: false, ...fields,
});
const desk = row({ id: 'aaaaaaaaaaaaaaaa', current: true });
const phone = row({ id: 'bbbbbbbbbbbbbbbb', device: 'Safari · iPhone', network: '198.51.100.0/24', last_seen: now - 300 });
const laptop = row({ id: 'cccccccccccccccc', device: '', network: '203.0.113.0/24', remote: true, last_seen: now - 3 * 86400, legacy: true });
const listing = (sessions: DeviceSession[], manageable = true): DeviceSessionList => ({ revision: 'one', sessions, manageable });

type Confirmation = Parameters<typeof legacyUi.confirmModal>[0];
function confirmWith(answer: boolean) {
  const seen: Confirmation[] = [];
  vi.spyOn(legacyUi, 'confirmModal').mockImplementation((async (options: Confirmation) => {
    seen.push(options);
    if (answer) await options.onConfirm?.();
    return { confirmed: answer };
  }) as typeof legacyUi.confirmModal);
  return seen;
}

/** Back to the list the first time, then back to `after` each time (the undo API's conversation). */
function serve(first: DeviceSessionList, after?: DeviceSessionList & { removed: number }) {
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => ({
    ok: true, status: 200, json: async () => (options?.method === 'POST' ? after : first),
  }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

const render = async (receipt = vi.fn()) => {
  const host = await mount(<QueryClientProvider client={queryClient}><DeviceSessions revision="one" receipt={receipt} /></QueryClientProvider>);
  await settle();
  return host;
};
const rows = (host: HTMLElement) => [...section(host, 'Signed-in devices')!.querySelectorAll('p.text-body-regular')].map(node => node.textContent);

it('List devices: this one first and labeled “This device”; the rest show last activity and source network segment', async () => {
  serve(listing([desk, phone, laptop]));
  const host = await render();
  expect(rows(host)).toEqual(['Chrome · Windows', 'Safari · iPhone', 'Unrecognized browser']);
  const card = section(host, 'Signed-in devices')!;
  expect(card.textContent).toContain('Signed-in devicesChrome · WindowsLast active Just now · The computer running PeachThis deviceSafari · iPhoneLast active 5 minutes ago · 198.51.100.0/24UndoUnrecognized browserLast active 3 days ago · Public entry · 203.0.113.0/24UndoChanging the access password signs out every device.Sign out other devices');
  expect(card.textContent).toContain('Last active Just now · The computer running Peach');
  expect(card.textContent).toContain('Last active 5 minutes ago · 198.51.100.0/24');
  expect(card.textContent).toContain('Signed-in devicesChrome · WindowsLast active Just now · The computer running PeachThis deviceSafari · iPhoneLast active 5 minutes ago · 198.51.100.0/24UndoUnrecognized browserLast active 3 days ago · Public entry · 203.0.113.0/24UndoChanging the access password signs out every device.Sign out other devices');
  expect(card.querySelector('button[aria-label="Sign out Chrome · Windows"]')).toBeNull();
  expect(card.querySelector('button[aria-label="Sign out Safari · iPhone"]')).not.toBeNull();
  expect(buttonNamed('Sign out other devices', card)).not.toBeNull();
});

it('Every row has a terminal icon; recognized browsers and systems each get a badge before the name', async () => {
  const tablet = row({ id: 'eeeeeeeeeeeeeeee', device: 'Chrome · Android 平板' });
  const linux = row({ id: 'ffffffffffffffff', device: 'Firefox · Linux' });
  serve(listing([desk, phone, tablet, laptop, linux]));
  const host = await render();
  const lines = [...section(host, 'Signed-in devices')!.querySelectorAll('p.text-body-regular')];
  expect(lines.map(line => line.textContent)).toEqual(['Chrome · Windows', 'Safari · iPhone', 'Chrome · Android 平板', 'Unrecognized browser', 'Firefox · Linux']);
  /* The leading icon and the label sit in the same flex container; the browser mark is an asset image, the platform mark is a glyph, both inside the label's p. */
  const terminals = lines.map(line => line.parentElement!.previousElementSibling?.tagName.toLowerCase());
  expect(terminals).toEqual(['svg', 'svg', 'svg', 'svg', 'svg']);
  expect(lines.map(line => line.querySelector('img')?.getAttribute('src'))).toEqual(
    ['/browser-icon/chrome', '/browser-icon/safari', '/browser-icon/chrome', undefined, '/browser-icon/firefox']);
  expect(lines.map(line => line.querySelectorAll('svg').length)).toEqual([1, 1, 1, 0, 0]);
  const shapes = lines.slice(0, 4).map(line => line.parentElement!.previousElementSibling!.innerHTML);
  /* Computer, phone, tablet, and unrecognized devices are each a distinct shape. */
  expect(new Set(shapes).size).toBe(4);
});

it('Platform logos take their color from the brand mark (color values are in the stylesheet); ChromeOS uses the Chrome colored logo', async () => {
  const chromebook = row({ id: '1111111111111111', device: 'Chrome · ChromeOS' });
  serve(listing([desk, phone, row({ id: '2222222222222222', device: 'Chrome · Android' }), chromebook]));
  const host = await render();
  const lines = [...section(host, 'Signed-in devices')!.querySelectorAll('p.text-body-regular')];
  expect(lines.map(line => line.querySelector('[data-platform-mark]')?.getAttribute('data-platform-mark')))
    .toEqual(['windows', 'apple', 'android', undefined]);
  expect([...lines[3]!.querySelectorAll('img')].map(img => img.getAttribute('src'))).toEqual(['/browser-icon/chrome', '/browser-icon/chrome']);
});

it('To revoke one, confirm first; after confirming, send a request by this row\'s id and replace with the list the server returns', async () => {
  const receipt = vi.fn();
  const fetcher = serve(listing([desk, phone, laptop]), { ...listing([desk, laptop]), removed: 1 });
  const seen = confirmWith(true);
  const host = await render(receipt);
  await click(host.querySelector('button[aria-label="Sign out Safari · iPhone"]'));
  await settle();
  expect(seen[0]).toMatchObject({ title: 'Sign out this device', confirmLabel: 'Sign out' });
  expect(seen[0]!.body).toContain('Safari · iPhone (Last active 5 minutes ago · 198.51.100.0/24)');
  const [url, options] = fetcher.mock.calls.at(-1)!;
  expect(url).toBe('/api/configuration/access/sessions/revoke');
  expect(JSON.parse(String(options?.body))).toEqual({ revision: 'one', id: 'bbbbbbbbbbbbbbbb' });
  expect(rows(host)).toEqual(['Chrome · Windows', 'Unrecognized browser']);
  expect(receipt).toHaveBeenCalledWith('Signed out');
});

it('Confirm cancel, no request sent', async () => {
  const fetcher = serve(listing([desk, phone]));
  confirmWith(false);
  const host = await render();
  await click(buttonNamed('Sign out other devices', host));
  await settle();
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
  expect(rows(host)).toEqual(['Chrome · Windows', 'Safari · iPhone']);
});

it('Sign out the other devices, keeping only this one; the receipt states how many were signed out', async () => {
  const receipt = vi.fn();
  const fetcher = serve(listing([desk, phone, laptop]), { ...listing([desk]), removed: 2 });
  const seen = confirmWith(true);
  const host = await render(receipt);
  await click(buttonNamed('Sign out other devices', host));
  await settle();
  expect(seen[0]!.body).toContain('2 devices other than this one');
  expect(JSON.parse(String(fetcher.mock.calls.at(-1)![1]?.body))).toEqual({ revision: 'one', scope: 'others' });
  expect(rows(host)).toEqual(['Chrome · Windows']);
  expect(buttonNamed('Sign out other devices', host)).toBeNull();
  expect(receipt).toHaveBeenCalledWith('Signed out 2 devices');
});

it('When not on the computer running Peach, only list; do not show a sign-out key', async () => {
  serve(listing([phone, row({ id: 'dddddddddddddddd', current: true, device: 'Safari · iPhone' })], false));
  const host = await render();
  const card = section(host, 'Signed-in devices')!;
  expect(card.querySelectorAll('button')).toHaveLength(0);
  expect(card.textContent).toContain('You must open this page on the computer running Peach to sign out.');
});

it('The access-password panel only shows the device list when a sign-in is needed', async () => {
  const devices = vi.fn(() => <p>Device list</p>);
  for (const mode of ['open', 'locked', 'password', 'legacy'] as const) {
    devices.mockClear();
    const host = await mount(<AccessSettings initial={{ mode, revision: 'one' }} receipt={vi.fn()} devices={devices} />);
    expect(host.textContent?.includes('Device list')).toBe(mode === 'password' || mode === 'legacy');
  }
  expect(devices).toHaveBeenLastCalledWith({ mode: 'legacy', revision: 'one' });
});

it('Last active is shown in minutes, hours, or days; over a month shows a date', () => {
  expect(lastSeen(now - 59, now)).toBe('Just now');
  expect(lastSeen(now - 61, now)).toBe('1 minutes ago');
  expect(lastSeen(now - 7200, now)).toBe('2 hours ago');
  expect(lastSeen(now - 86400 * 29, now)).toBe('29 days ago');
  expect(lastSeen(now - 86400 * 40, now)).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}/);
});
