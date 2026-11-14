import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../src/react/settings/cloud-proxy-settings', () => ({ CloudProxySettings: () => null }));
import { CONFIGURATION_URL } from '../../src/configuration-endpoints';
import type { ConfigurationData, DownloadSettingsState } from '../../src/react/bundle';
import { queryClient } from '../../src/react/query';
import { CONFIGURATION_KEY, prefetchConfiguration } from '../../src/react/settings/configuration';
import { ConfigurationPage } from '../../src/react/settings/configuration-page';
import type { CredentialData } from '../../src/react/follow-manage/follow-manage';
import { buttonNamed, click, mount, section, settle, type } from './render';

afterEach(() => queryClient.clear());
notifyManager.setScheduler(notify => notify());
const data = (over: Partial<ConfigurationData> = {}): ConfigurationData => ({
  editable: true, notice: '', revision: 'rev-1', media_dirs: ['D:\\Media'], library_count: 1,
  port: 9123, facts: [], ...over,
});
const downloads: DownloadSettingsState = {
  media_sources: ['115', 'pikpak'],
  available: true, config: { clouddrive_address: '', targets: {}, pikpak_root: '', wait_hours: 168 },
  token_set: false, pikpak: { logged_in: false, username: '', remember: false, method: 'password' },
  pikpak_browser: { available: true, state: 'idle', message: '' }, pikpak_roots: [],
  providers: [{ key: '115', label: '115' }, { key: 'pikpak', label: 'PikPak' }], max_wait_hours: 1440,
};
const full = () => data({ downloads, startup: {
  available: true, enabled: false, silent: true, desktop: false, desktop_message: '', message: '',
}, peach_proxy: { mode: 'environment', proxy_saved: false, needs_selection: false },
  entry_links: { sites: [{ key: 'javdb', label: 'JavDB', host: '', default_host: 'javdb.com' }] },
});
const names = ['Library and imports', 'Sources and subscriptions', 'Download channels', 'Network & access', 'App and maintenance', 'System diagnostics'];
function serve(config: ConfigurationData, credentials: CredentialData = { root: '', providers: [] }) {
  const fetcher = vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => {
    if (url === CONFIGURATION_URL) return config;
    if (url === '/api/configuration/indexers') return { indexers: [], max_indexers: 4 };
    if (url === '/api/configuration/jav-browser') return { enabled: false, provider: '115', available: true,
      providers: [{ key: '115', label: '115', configured: true, target: '/115/Movies' }] };
    if (url === '/api/follow/credentials') return credentials;
    if (url === '/api/settings') return { followInitialDays: 30, metadataRefreshDays: 30 };
    if (url === '/api/follow/schedule') return { enabled: false, available: true, interval_minutes: 60 };
    return { mode: 'off', status: 'idle' };
  } }));
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
async function open(config = full(), selected?: string, credentials?: CredentialData) {
  serve(config, credentials);
  await prefetchConfiguration(new AbortController().signal);
  return mount(<QueryClientProvider client={queryClient}>
    <ConfigurationPage receipt={vi.fn()} reopenTutorial={vi.fn()} section={selected} />
  </QueryClientProvider>);
}
const tabs = (host: ParentNode) => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const chosen = (host: ParentNode) => tabs(host).find(tab => tab.getAttribute('aria-selected') === 'true')!;
const press = (target: Element, key: string) => act(async () => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
});

it('Peach configuration is grouped by purpose, with library and intake open by default and each group linked to its own panel', async () => {
  const host = await open();
  expect(tabs(host).map(tab => tab.textContent)).toEqual(names);
  expect(chosen(host).textContent).toBe(names[0]);
  for (const tab of tabs(host)) {
    const panel = host.querySelector(`#${tab.getAttribute('aria-controls')}`)!;
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
  }
  expect(host.querySelector('#configPort')?.closest('[role="tabpanel"]')?.getAttribute('aria-labelledby'))
    .toBe(tabs(host)[3]!.id);
  expect(host.querySelector('#entry-link-javdb')?.closest('[role="tabpanel"]')?.getAttribute('aria-labelledby'))
    .toBe(tabs(host)[1]!.id);
});
it('Arrow keys wrap at both ends; Home and End select the extremes and move focus in sync', async () => {
  const host = await open();
  chosen(host).focus();
  await press(chosen(host), 'ArrowUp');
  expect(chosen(host).textContent).toBe('System diagnostics');
  expect(document.activeElement).toBe(chosen(host));
  await press(chosen(host), 'ArrowDown');
  expect(chosen(host).textContent).toBe('Library and imports');
  await press(chosen(host), 'End');
  expect(chosen(host).textContent).toBe('System diagnostics');
  await press(chosen(host), 'Home');
  expect(chosen(host).textContent).toBe('Library and imports');
  expect(tabs(host).map(tab => tab.tabIndex)).toEqual([0, -1, -1, -1, -1, -1]);
});
it('Section deep links open sources and subscriptions, and switching categories keeps unsaved fields', async () => {
  const host = await open(full(), 'Sources and subscriptions');
  expect(chosen(host).textContent).toBe('Sources and subscriptions');
  await type(host.querySelector<HTMLInputElement>('#entry-link-javdb'), 'example.invalid');
  await click(tabs(host)[0]);
  await click(tabs(host)[1]);
  expect(host.querySelector<HTMLInputElement>('#entry-link-javdb')?.value).toBe('example.invalid');
  await act(async () => { queryClient.setQueryData(CONFIGURATION_KEY, { ...full(), revision: 'rev-2' }) });
  expect(chosen(host).textContent).toBe('Sources and subscriptions');
});
it.each([false, true])('Source credentials control writes based on the database read-only status %s', async (readOnly) => {
  const host = await open(data({ ledger_read_only: readOnly }), 'Sources and subscriptions', { root: '', providers: [{
    provider: 'test', provider_label: 'Test source', followable: true, requirement: 'required',
    needs: ['cookie'], fields: [], missing: ['cookie'],
  }] });
  await settle();
  expect(host.querySelector<HTMLInputElement>('input[type="password"]')?.disabled).toBe(readOnly);
  expect(buttonNamed('Save configuration', host.querySelector('[aria-label="Configurable credentials"]')!)?.disabled).toBe(readOnly);
});
it('Unknown sections fall back to the library, and missing download channels omit their category', async () => {
  const host = await open(data({ editable: false }), 'Does not exist');
  expect(tabs(host).map(tab => tab.textContent)).toEqual(['Library and imports', 'Sources and subscriptions', 'App and maintenance', 'System diagnostics']);
  expect(chosen(host).textContent).toBe('Library and imports');
});
it('Config load failure shows the server side reason', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ message: 'Database is migrating' }) })));
  const host = await mount(<QueryClientProvider client={queryClient}>
    <ConfigurationPage receipt={vi.fn()} reopenTutorial={vi.fn()} />
  </QueryClientProvider>);
  await settle();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Reading the configuration failedDatabase is migrating');
  expect(host.querySelector('[role="tablist"]')).toBeNull();
});
it('Mount state follows saved paths only, and editing folders withdraws the reading', async () => {
  const host = await open(data({ windows: true, media_sources: [{ location: '115', path: 'B:/', root: 'B:/', online: false }] }));
  const row = host.querySelector('[data-folder-row]')!;
  expect(row.querySelector('[data-mount="offline"]')?.textContent).toBe('Offline');
  await type(row.querySelector<HTMLInputElement>('input[aria-label^="Media folder "]'), 'B:/Movies');
  expect(row.querySelector('[data-mount]')).toBeNull();
});
it('Mounts whose cloud-drive check timed out (null in the snapshot) show as unchecked, not offline', async () => {
  const host = await open(data({ windows: true, media_sources: [{ location: '115', path: 'B:/', root: 'B:/', online: null }] }));
  const badge = host.querySelector('[data-folder-row] [data-mount]');
  expect([badge?.getAttribute('data-mount'), badge?.textContent]).toEqual(['unknown', 'Not checked']);
});
it('Non-Windows folders show only the media directory, and submitting keeps the existing path mappings', async () => {
  const host = await open(data({ windows: false,
    media_sources: [{ location: 'local', path: '/old', root: 'R:\\media', library: 'Movies', cost: 'free' }] }));
  const row = host.querySelector('[data-folder-row]')!;
  expect(row.querySelector('details')).toBeNull();
  expect(row.querySelector('input[placeholder="Auto-configured"]')).toBeNull();
  await type(row.querySelector<HTMLInputElement>('input[aria-label^="Media folder "]'), '/new');
  await click(buttonNamed('Save configuration', row.closest('form')!));
});
it('Read-only media config can refresh mount status and updates the shared config snapshot', async () => {
  const offline = { location: '115', path: 'B:/', root: 'B:/', online: false };
  const host = await open(data({ editable: false, notice: 'Editable on this machine only', media_sources: [offline] }));
  serve(data({ editable: false, notice: 'Editable on this machine only', media_sources: [{ ...offline, online: true }], revision: 'rev-2' }));
  await click(buttonNamed('Refresh mount state', host));
  await settle();
  expect(section(host, 'Mount state')?.textContent).toContain('Online');
  expect(queryClient.getQueryData<ConfigurationData>(CONFIGURATION_KEY)?.revision).toBe('rev-2');
});

it('Without download settings the sections and health form stay, with retry to recover', async () => {
  const partial = full();
  delete partial.downloads;
  partial.section_errors = { downloads: { title: 'Download settings not fetched', message: 'Please read again.', error_id: 'test-error-id' } };
  const host = await open(partial, 'Download channels');
  expect(tabs(host).map(tab => tab.textContent)).toEqual(names);
  expect(chosen(host).textContent).toBe('Download channels');
  expect(host.querySelector('.ui-board-group-active')?.textContent).toContain('Download settings not fetched');
  expect(host.querySelector('[data-folder-row]')).not.toBeNull();
  serve(full());
  await click(buttonNamed('Read again', host.querySelector('.ui-board-group-active')!));
  await settle();
  expect(host.textContent).not.toContain('Download settings not fetched');
  expect(section(host, 'Cloud download')).not.toBeNull();
});

it('Localized configuration errors appear in their section without replacing other unsaved input', async () => {
  const host = await open(full());
  const input = host.querySelector<HTMLInputElement>('input[aria-label^="Media folder "]')!;
  await type(input, 'D:\\Edited');
  await act(async () => {
    queryClient.setQueryData(CONFIGURATION_KEY, { ...full(), section_errors: {
      storage: { title: 'Storage space not fetched', message: 'Please read again.', error_id: 'storage-error' },
      tunnel: { title: 'Public entry point not fetched', message: 'Please read again.', error_id: 'tunnel-error' },
    } });
  });
  expect(input.value).toBe('D:\\Edited');
  expect(host.querySelector('.ui-board-group-active')?.textContent).not.toContain('Storage space not fetched');
  await click(tabs(host).find(tab => tab.textContent === 'App and maintenance'));
  expect(host.querySelector('.ui-board-group-active')?.textContent).toContain('Storage space not fetched');
  await click(tabs(host).find(tab => tab.textContent === 'Network & access'));
  expect(host.querySelector('.ui-board-group-active')?.textContent).toContain('Public entry point not fetched');
  expect(host.querySelector('#peachProxy')).not.toBeNull();
});

it('When the media source is not obtained, forms that would submit media configuration hide while other settings stay usable', async () => {
  const partial = full();
  partial.section_errors = { media_sources: { title: 'Media directories not fetched', message: 'Please read again.', error_id: 'media-error' } };
  const host = await open(partial);
  expect(host.querySelector('[data-folder-row]')).toBeNull();
  expect(host.querySelector('#configPort')).toBeNull();
  expect(host.querySelector('#peachProxy')).not.toBeNull();
  await click(tabs(host).find(tab => tab.textContent === 'Network & access'));
  expect(host.querySelector('.ui-board-group-active')?.textContent).toContain('Media directories not fetched');
});
