import { act } from 'react';
import { expect, it, vi } from 'vitest';

import { DownloadSettings } from '../../src/react/settings/download-settings';
import type { DownloadCheckReport, DownloadSettingsState } from '../../src/react/bundle';
import { actionOrder, buttonNamed, click, fetchMock, mount, pending, section, sentBody, settle, submit, type } from './render';

vi.mock('../../src/react/settings/jav-browser-settings', () => ({ JavBrowserSettings: () => null }));

const state = (patch: Partial<DownloadSettingsState> = {}): DownloadSettingsState => ({
  available: true,
  media_sources: ['115', 'pikpak'],
  config: { clouddrive_address: 'http://127.0.0.1:19798', targets: { '115': '/115/cloud-download' },
    pikpak_root: '', wait_hours: 168 },
  token_set: false,
  pikpak: { logged_in: false, username: '', remember: false, method: 'password' },
  pikpak_browser: { available: true, state: 'idle', message: '' },
  pikpak_roots: ['P:\\'],
  providers: [{ key: '115', label: '115' }, { key: 'pikpak', label: 'PikPak' }],
  max_wait_hours: 1440,
  ...patch,
});

const report = (patch: Partial<DownloadCheckReport> = {}): DownloadCheckReport => ({
  ok: true, address: 'http://127.0.0.1:19798', permissions: [], missing: [], root: '/', folder: null,
  quota: null, suggested_target: null, suggested_pikpak_root: '', problems: [], ...patch,
});

it('Invalid saved addresses stay in the form, and fixing and saving clears the configuration note', async () => {
  vi.stubGlobal('fetch', fetchMock(200, state({ problems: [] })));
  const host = await mount(<DownloadSettings initial={state({
    config: { ...state().config, clouddrive_address: 'http://localhost:bad-port' },
    problems: ['The CloudDrive2 address port must be an integer'],
  })} receipt={vi.fn()} />);
  expect(field(host, 'CloudDrive2 address')?.value).toBe('http://localhost:bad-port');
  expect(host.textContent).toContain('Cloud download configuration needs checking');
  await type(field(host, 'CloudDrive2 address'), 'http://127.0.0.1:19798');
  await submit(section(host, 'Cloud download')!);
  await settle();
  expect(host.textContent).not.toContain('Cloud download configuration needs checking');
});

const unfilled = () => state({
  config: { clouddrive_address: 'http://127.0.0.1:19798', targets: {}, pikpak_root: '', wait_hours: 168 },
  pikpak_roots: ['A:\\'],
});

const field = (host: HTMLElement, label: string) =>
  [...host.querySelectorAll('label')].find((node) => node.textContent?.trim() === label)
    ?.closest('[data-input-size]')?.querySelector('input') ?? null;

it('Empty check reports keep no divider section, showing the reason directly when errors exist', async () => {
  const fetcher = fetchMock(200, report());
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<DownloadSettings initial={state({ media_sources: ['guangya'] })} receipt={vi.fn()} />);
  const form = section(host, 'Cloud download')!;
  await click(buttonNamed('Check connection', host));
  await settle();
  expect(form.querySelectorAll('dl')).toHaveLength(0);
  expect(form.querySelectorAll('.border-t')).toHaveLength(1);
  fetcher.mockImplementation(async () => ({ ok: true, status: 200, json: async () => report({ problems: ['Could not connect to CloudDrive2'] }) }));
  await click(buttonNamed('Check connection', host));
  await settle();
  expect(form.querySelector('[role="alert"]')?.textContent).toBe('Could not connect to CloudDrive2');
  expect(form.querySelectorAll('dl')).toHaveLength(0);
});

it('Without PikPak added, the account and its specific fields hide while existing configuration is kept', async () => {
  const fetcher = fetchMock(200, state({ media_sources: ['115'] }));
  vi.stubGlobal('fetch', fetcher);
  const initial = state({ media_sources: ['115'], pikpak: {
    logged_in: true, username: 'test-only-account', remember: true, method: 'browser',
  } });
  const host = await mount(<DownloadSettings initial={initial} receipt={vi.fn()} />);
  expect(section(host, 'PikPak')).toBeNull();
  expect(field(host, 'Account')).toBeNull();
  expect(field(host, '115 target folder')).not.toBeNull();
  expect(initial.pikpak.logged_in).toBe(true);
  await submit(section(host, 'Cloud download'));
  await settle();
  expect(sentBody(fetcher)).toMatchObject({ pikpak_account: false });
});

it('The Duck library does not show 115 and PikPak specific fields; the local library does not show cloud download settings', async () => {
  vi.stubGlobal('fetch', fetchMock(200, state({ media_sources: ['guangya'] })));
  const cloud = await mount(<DownloadSettings initial={state({ media_sources: ['guangya'] })} receipt={vi.fn()} />);
  expect(field(cloud, 'CloudDrive2 address')).not.toBeNull();
  expect(field(cloud, '115 target folder')).toBeNull();
  expect(field(cloud, 'Account')).toBeNull();
  const local = await mount(<DownloadSettings initial={state({ media_sources: ['local'] })} receipt={vi.fn()} />);
  expect(field(local, 'CloudDrive2 address')).toBeNull();
  expect(local.textContent).not.toContain('PikPak');
});

it('On save the token goes to the server with the form, clears on return, and the note becomes saved', async () => {
  const fetcher = fetchMock(200, state({ token_set: true }));
  vi.stubGlobal('fetch', fetcher);
  const receipt = vi.fn();
  const host = await mount(<DownloadSettings initial={state()} receipt={receipt} />);
  const token = field(host, 'CloudDrive2 API token');
  expect(token?.type).toBe('password');
  await type(token, 'cd2-token');
  await submit(section(host, 'Cloud download'));
  await settle();
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/configuration/downloads');
  expect(sentBody(fetcher)).toMatchObject({
    clouddrive_address: 'http://127.0.0.1:19798', token: 'cd2-token', targets: { '115': '/115/cloud-download' },
  });
  expect(receipt).toHaveBeenCalledWith('Configuration saved');
  expect(field(host, 'CloudDrive2 API token')?.value).toBe('');
  expect(field(host, 'CloudDrive2 API token')?.placeholder).toBe('Saved; leave empty to keep');
});

it('The check reports the missing permission, target folder, and remaining quota; save and sign-in-with-password use the primary button', async () => {
  vi.stubGlobal('fetch', fetchMock(200, {
    ok: true, address: 'http://127.0.0.1:19798', permissions: [{ name: 'a', label: 'Submit the offline task', granted: true },
      { name: 'b', label: 'Cancel the offline task', granted: false }],
    missing: ['Cancel the offline task'], root: '/', folder: { path: '/115/cloud-download', can_offline: true, cloud: '115open' },
    quota: { total: 1500, used: 3, left: 1497 }, problems: [],
  }));
  const host = await mount(<DownloadSettings initial={state()} receipt={vi.fn()} />);
  for (const name of ['Save configuration', 'Log in']) {
    expect(buttonNamed(name, host)?.className, name).toContain('bg-button-primary');
  }
  expect(buttonNamed('Sign in with the browser', host)?.className).not.toContain('bg-button-primary');
  expect(buttonNamed('Check connection', host)?.className).not.toContain('bg-button-primary');
  await click(buttonNamed('Check connection', host));
  await settle();
  expect(host.textContent).toContain('Missing cancel-offline-task');
  expect(host.textContent).toContain('/115/cloud-download supports offline download');
  expect(host.textContent).toContain('1497 of 1500 left this month');
  expect(host.textContent).not.toContain('Detected');
});

it('With the address blank, checking fills the detected local address back into the form; it is only sent when the configuration is saved', async () => {
  const blank = state({ config: { clouddrive_address: '', targets: { '115': '/115/cloud-download' },
    pikpak_root: '', wait_hours: 168 } });
  const fetcher = fetchMock(200, {
    ok: true, address: 'http://127.0.0.1:29798', permissions: [], missing: [], root: '/',
    folder: null, quota: null, problems: [],
  });
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<DownloadSettings initial={blank} receipt={vi.fn()} />);
  expect(field(host, 'CloudDrive2 address')?.placeholder).toBe('Leave empty to look up automatically');
  await click(buttonNamed('Check connection', host));
  await settle();
  expect(sentBody(fetcher)).toMatchObject({ clouddrive_address: '' });
  expect(field(host, 'CloudDrive2 address')?.value).toBe('http://127.0.0.1:29798');
  expect(host.textContent).toContain('Detected http://127.0.0.1:29798; it takes effect once the configuration is saved');
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockImplementation(async () => ({ ok: true, status: 200, json: async () => blank }));
  await submit(section(host, 'Cloud download'));
  await settle();
  expect(fetcher.mock.calls[1]?.[0]).toBe('/api/configuration/downloads');
  expect(sentBody(fetcher, 1)).toMatchObject({ clouddrive_address: 'http://127.0.0.1:29798' });
});

it('When the target directory and PikPak root are left empty, the check fills them back from what the push discovered; they are only sent when saving the configuration', async () => {
  const fetcher = fetchMock(200, report({
    suggested_target: { path: '/115open/cloud-download', exists: true }, suggested_pikpak_root: 'A:\\',
    folder: { path: '/115open/cloud-download', can_offline: true, cloud: '115open' },
  }));
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<DownloadSettings initial={unfilled()} receipt={vi.fn()} />);
  expect(field(host, '115 target folder')?.placeholder).toBe('Left empty, filled automatically from the library folder');
  await click(buttonNamed('Check connection', host));
  await settle();
  expect(sentBody(fetcher)).toMatchObject({ target: '', pikpak_root: '', pikpak_account: false });
  expect(field(host, '115 target folder')?.value).toBe('/115open/cloud-download');
  expect(host.textContent).toContain('"Cloud downloadCloudDrive2 addressCloudDrive2 API tokenOffline task permission required.115 target folderShould sit inside the auto-intake cloud path prefix.PikPak target folderThe folder must already exist.Media folder matching the PikPak rootA:\\ A:\\Wait cap (hours)Timeouts are marked stalled; enter 1–1440 hours.115 target folderFilled from the library folder as /115open/cloud-download; it takes effect once the configuration is savedPikPak rootFilled from the library folder as A:\\; it takes effect once the configuration is savedTarget folder/115open/cloud-download supports offline downloadCheck connectionSave configurationPikPak accountLogin pendingAccountPasswordSave the password and re-sign in automatically when the session expiresSign in with browserSign in"');
  expect(host.textContent).toContain('Fill in A:\\ based on the media library directory; takes effect after saving the configuration');
  expect(fetcher).toHaveBeenCalledTimes(1);
  fetcher.mockImplementation(async () => ({ ok: true, status: 200, json: async () => unfilled() }));
  await submit(section(host, 'Cloud download'));
  await settle();
  expect(fetcher.mock.calls[1]?.[0]).toBe('/api/configuration/downloads');
  expect(sentBody(fetcher, 1)).toMatchObject({ targets: { '115': '/115open/cloud-download' }, pikpak_root: 'A:\\' });
});

it('A user-entered target folder is never overwritten by suggested values', async () => {
  vi.stubGlobal('fetch', fetchMock(200, report({ suggested_target: { path: '/115open/cloud-download', exists: true } })));
  const host = await mount(<DownloadSettings initial={state()} receipt={vi.fn()} />);
  await click(buttonNamed('Check connection', host));
  await settle();
  expect(field(host, '115 target folder')?.value).toBe('/115/cloud-download');
  expect(host.textContent).not.toContain('Filled in from the library directory');
});

it('The check only asks for the PikPak root when a PikPak account is filled in or already signed in', async () => {
  const fetcher = fetchMock(200, report());
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<DownloadSettings initial={unfilled()} receipt={vi.fn()} />);
  await type(field(host, 'Account'), 'me@example.com');
  await click(buttonNamed('Check connection', host));
  await settle();
  expect(sentBody(fetcher)).toMatchObject({ pikpak_account: true });
  const signedIn = await mount(<DownloadSettings receipt={vi.fn()}
    initial={state({ pikpak: { logged_in: true, username: 'me@example.com', remember: false, method: 'password' } })} />);
  await click(buttonNamed('Check connection', signedIn));
  await settle();
  expect(sentBody(fetcher, 1)).toMatchObject({ pikpak_account: true });
});

it('A proposed folder that does not exist is marked invalid; only clicking "Create this folder" makes it, which clears the flag', async () => {
  const fetcher = fetchMock(200, report({ suggested_target: { path: '/115open/cloud-download', exists: false } }));
  vi.stubGlobal('fetch', fetcher);
  const receipt = vi.fn();
  const host = await mount(<DownloadSettings initial={unfilled()} receipt={receipt} />);
  await click(buttonNamed('Check connection', host));
  await settle();
  const input = field(host, '115 target folder');
  expect(input?.value).toBe('/115open/cloud-download');
  expect(input?.getAttribute('aria-invalid')).toBe('true');
  expect(host.textContent).toContain('"Cloud downloadCloudDrive2 addressCloudDrive2 API tokenOffline task permission required.115 target folderThis folder does not exist.PikPak target folderThe folder must already exist.Media folder matching the PikPak rootChecking picks folders based on the library directories A:\\Wait cap (hours)Timeouts are marked stalled; enter 1–1440 hours.115 target folder/115open/cloud-download does not existCreate this folderCheck connectionSave configurationPikPak accountLogin pendingAccountPasswordSave the password and re-sign in automatically when the session expiresSign in with browserSign in"');
  expect(host.textContent).toContain('/115open/cloud-download does not exist');
  await submit(section(host, 'Cloud download'));
  await settle();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('Create this folder first, or fill in an existing one');

  const hold = pending<unknown>();
  fetcher.mockImplementation(() => hold.answer);
  await click(buttonNamed('Create this folder', host));
  expect(fetcher.mock.calls[1]?.[0]).toBe('/api/configuration/downloads/folder');
  expect(sentBody(fetcher, 1)).toMatchObject({ path: '/115open/cloud-download', clouddrive_address: 'http://127.0.0.1:19798' });
  expect(buttonNamed('Create this folder', host)?.getAttribute('aria-busy')).toBe('true');
  expect(receipt).not.toHaveBeenCalled();
  await hold.release({ ok: true, status: 200, json: async () => report({
    folder: { path: '/115open/cloud-download', can_offline: true, cloud: '115open' } }) });
  await settle();
  expect(receipt).toHaveBeenCalledWith('Catalog created');
  expect(buttonNamed('Create this folder', host)).toBeNull();
  expect(field(host, '115 target folder')?.getAttribute('aria-invalid')).not.toBe('true');
  expect(host.textContent).toContain('/115open/cloud-download supports offline download');
  expect(host.textContent).toContain('Filled from the media library catalog as /115open/cloud-download; takes effect after saving the configuration');
});

it('With both address and token saved, it checks against the saved configuration on open and the check button never spins', async () => {
  const hold = pending<unknown>();
  const fetcher = vi.fn<(...call: [string, RequestInit | undefined]) => Promise<unknown>>(() => hold.answer);
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<DownloadSettings initial={state({ token_set: true })} receipt={vi.fn()} />);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/configuration/downloads/check');
  expect(fetcher.mock.calls[0]?.[1]?.method).toBeUndefined();
  expect(fetcher.mock.calls[0]?.[1]?.body).toBeUndefined();
  expect(host.textContent).toContain('Checking CloudDrive2');
  expect(buttonNamed('Check connection', host)?.getAttribute('aria-busy')).not.toBe('true');
  await hold.release({ ok: true, status: 200, json: async () => report({
    permissions: [{ name: 'a', label: 'Submit the offline task', granted: true }],
    folder: { path: '/115/cloud-download', can_offline: true, cloud: '115open' },
    quota: { total: 1500, used: 3, left: 1497 } }) });
  await settle();
  expect(host.textContent).not.toContain('Checking CloudDrive2');
  expect(host.textContent).toContain('/115/cloud-download supports offline download');
  expect(host.textContent).toContain('1497 of 1500 left this month');
});

it('Without a saved token or address, opening never checks', async () => {
  const fetcher = fetchMock(200, report());
  vi.stubGlobal('fetch', fetcher);
  await mount(<DownloadSettings initial={state()} receipt={vi.fn()} />);
  await mount(<DownloadSettings receipt={vi.fn()} initial={state({ token_set: true,
    config: { clouddrive_address: '', targets: {}, pikpak_root: '', wait_hours: 168 } })} />);
  await settle();
  expect(fetcher).not.toHaveBeenCalled();
});

it('With the target directory left empty, saving renders the check report from the response directly; a server-filled directory no longer says it takes effect after save', async () => {
  const saved = state({ token_set: true,
    config: { clouddrive_address: 'http://127.0.0.1:19798', targets: { '115': '/115open/cloud-download' },
      pikpak_root: '', wait_hours: 168 } });
  const fetcher = fetchMock(200, { ...saved, report: report({
    suggested_target: { path: '/115open/cloud-download', exists: true },
    folder: { path: '/115open/cloud-download', can_offline: true, cloud: '115open' },
    quota: { total: 1500, used: 3, left: 1497 } }) });
  vi.stubGlobal('fetch', fetcher);
  const receipt = vi.fn();
  const host = await mount(<DownloadSettings initial={unfilled()} receipt={receipt} />);
  await type(field(host, 'CloudDrive2 API token'), 'cd2-token');
  await submit(section(host, 'Cloud download'));
  await settle();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/configuration/downloads');
  expect(sentBody(fetcher)).toMatchObject({ targets: {}, token: 'cd2-token', pikpak_account: false });
  expect(receipt).toHaveBeenCalledWith('Configuration saved');
  expect(field(host, '115 target folder')?.value).toBe('/115open/cloud-download');
  expect(field(host, '115 target folder')?.getAttribute('aria-invalid')).not.toBe('true');
  expect(host.textContent).toContain('Filled from the library folder as /115open/cloud-download');
  expect(host.textContent).not.toContain('/115open/cloud-download; it takes effect once the configuration is saved');
  expect(host.textContent).toContain('/115open/cloud-download supports offline download');
  expect(host.textContent).toContain('1497 of 1500 left this month');
});

it('If the pushed directory does not exist on save, other fields save as usual; the directory is written back to the form marked invalid with a create button offered', async () => {
  const fetcher = fetchMock(200, { ...unfilled(), token_set: true,
    report: report({ suggested_target: { path: '/115open/cloud-download', exists: false } }) });
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<DownloadSettings initial={unfilled()} receipt={vi.fn()} />);
  await type(field(host, 'Account'), 'me@example.com');
  await submit(section(host, 'Cloud download'));
  await settle();
  expect(sentBody(fetcher)).toMatchObject({ pikpak_account: true });
  const input = field(host, '115 target folder');
  expect(input?.value).toBe('/115open/cloud-download');
  expect(input?.getAttribute('aria-invalid')).toBe('true');
  expect(host.textContent).toContain('/115open/cloud-download does not exist');
  expect(buttonNamed('Create this folder', host)).not.toBeNull();
  await submit(section(host, 'Cloud download'));
  await settle();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('Create this folder first, or fill in an existing one');
});

it('When the saved response carries no check report, the previous report collapses', async () => {
  const fetcher = fetchMock(200, report({ folder: { path: '/115/cloud-download', can_offline: true, cloud: '115open' } }));
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<DownloadSettings initial={state()} receipt={vi.fn()} />);
  await click(buttonNamed('Check connection', host));
  await settle();
  expect(host.textContent).toContain('/115/cloud-download supports offline download');
  fetcher.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ ...state(), report: null }) }));
  await submit(section(host, 'Cloud download'));
  await settle();
  expect(host.textContent).not.toContain('Supports offline download');
});

it('When neither local port answers, it reports the server-listed addresses verbatim and leaves the form blank', async () => {
  const blank = state({ config: { clouddrive_address: '', targets: {}, pikpak_root: '', wait_hours: 168 } });
  const problem = 'No CloudDrive2 address was filled in, and neither http://127.0.0.1:19798 nor http://127.0.0.1:29798 on this machine responded.';
  vi.stubGlobal('fetch', fetchMock(200, {
    ok: false, address: '', permissions: [], missing: [], root: '', folder: null, quota: null,
    problems: [problem],
  }));
  const host = await mount(<DownloadSettings initial={blank} receipt={vi.fn()} />);
  await click(buttonNamed('Check connection', host));
  await settle();
  expect(host.textContent).toContain(problem);
  expect(field(host, 'CloudDrive2 address')?.value).toBe('');
});

it('When PikPak demands a human check it shows the verification page and signs in after completion', async () => {
  vi.stubGlobal('fetch', fetchMock(200, {
    ok: false, captcha_url: 'https://user.mypikpak.com/captcha?x=1', settings: state(),
  }));
  const host = await mount(<DownloadSettings initial={state()} receipt={vi.fn()} />);
  await type(field(host, 'Account'), 'me@example.com');
  await type(field(host, 'Password'), 'pw');
  await submit(section(host, 'PikPak account'));
  await settle();
  const link = host.querySelector<HTMLAnchorElement>('a[href^="https://user.mypikpak.com/captcha"]');
  expect(link?.target).toBe('_blank');
  expect(host.textContent).toContain('Come back here and click "Sign in" again');
});

it('After login only the account and whether the password is saved are shown, plus logout', async () => {
  const fetcher = fetchMock(200, state());
  vi.stubGlobal('fetch', fetcher);
  const receipt = vi.fn();
  const host = await mount(<DownloadSettings receipt={receipt}
    initial={state({ pikpak: { logged_in: true, username: 'me@example.com', remember: false, method: 'password' } })} />);
  expect(host.textContent).toContain('me@example.com');
  expect(field(host, 'Password')).toBeNull();
  await click(buttonNamed('Sign out', host));
  await settle();
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/configuration/downloads/pikpak/logout');
  expect(receipt).toHaveBeenCalledWith('Signed out of PikPak');
  expect(buttonNamed('Log in', host)).not.toBeNull();
});

const BROWSER_URL = '/api/configuration/downloads/pikpak/browser-login';
const browserAt = (stage: DownloadSettingsState['pikpak_browser']['state'], message = '') =>
  state({ pikpak_browser: { available: true, state: stage, message } });
const browserDone = () => state({
  pikpak: { logged_in: true, username: '', remember: false, method: 'browser' },
  pikpak_browser: { available: true, state: 'done', message: 'Signed in to PikPak via the browser' },
});
/** Returns these settings blocks in order, and keeps returning the last one afterward. */
const replies = (...bodies: unknown[]) => {
  const fetcher = fetchMock(200, bodies.at(-1));
  for (const body of bodies) {
    fetcher.mockImplementationOnce(async () => ({ ok: true, status: 200, json: async () => body }));
  }
  return fetcher;
};
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) });

it('The account and password form shows directly; both login methods share the bottom bar', async () => {
  const host = await mount(<DownloadSettings initial={state()} receipt={vi.fn()} />);
  expect(field(host, 'Account')?.closest('details')).toBeNull();
  expect(field(host, 'Account')).not.toBeNull();
  expect(buttonNamed('Log in', host)?.parentElement).toBe(buttonNamed('Sign in with the browser', host)?.parentElement);
  expect(buttonNamed('Sign in with the browser', host)?.type).toBe(undefined);
  expect(actionOrder(buttonNamed('Log in', host)?.parentElement)).toEqual(['Sign in with the browser', 'Log in']);
});

it('Without a browser on this machine only account sign-in remains, expanded by default', async () => {
  const host = await mount(<DownloadSettings receipt={vi.fn()}
    initial={state({ pikpak_browser: { available: false, state: 'idle', message: '' } })} />);
  expect(buttonNamed('Sign in with the browser', host)).toBeNull();
  expect(field(host, 'Account')?.closest('details')).toBeNull();
  expect(field(host, 'Account')).not.toBeNull();
  expect(buttonNamed('Log in', host)?.className).toContain('bg-button-primary');
});

it('Browser sign-in opens the window then polls, showing the signed-in method and stopping once complete', async () => {
  vi.useFakeTimers();
  const fetcher = replies(browserAt('waiting', 'A browser window is open; log in to PikPak there'),
    browserAt('waiting', 'A browser window is open; log in to PikPak there'), browserDone());
  vi.stubGlobal('fetch', fetcher);
  const receipt = vi.fn();
  const host = await mount(<DownloadSettings initial={state()} receipt={receipt} />);
  await click(buttonNamed('Sign in with the browser', host));
  await settle();
  expect(fetcher.mock.calls[0]?.[0]).toBe(BROWSER_URL);
  expect(fetcher.mock.calls[0]?.[1]?.method).toBe('POST');
  expect(host.querySelector('[role="status"]')?.textContent).toContain('A browser window is open; log in to PikPak there');
  expect(buttonNamed('Sign in with the browser', host)).toBeNull();
  expect(buttonNamed('Log in', host)?.disabled).toBe(true);
  await tick(2000);
  await settle();
  expect(fetcher.mock.calls[1]?.[0]).toBe(BROWSER_URL);
  expect(fetcher.mock.calls[1]?.[1]?.method).toBeUndefined();
  expect(receipt).not.toHaveBeenCalled();
  await tick(2000);
  await settle();
  expect(receipt).toHaveBeenCalledWith('Signed in to PikPak');
  expect(host.textContent).toContain('Browser sign-in, renewed by Peach');
  expect(host.textContent).not.toContain('After the session expires you must return here to sign in again');
  expect(buttonNamed('Sign out', host)).not.toBeNull();
  await tick(6000);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('If the sign-in window is still open on page refresh, polling continues; canceling returns to a state where it can be raised again', async () => {
  vi.useFakeTimers();
  const fetcher = replies(browserAt('cancelled', 'Browser sign-in canceled'));
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<DownloadSettings initial={browserAt('waiting')} receipt={vi.fn()} />);
  expect(host.querySelector('[role="status"]')?.textContent).toContain('Waiting for you to sign in to PikPak in the browser window');
  expect(actionOrder(buttonNamed('Cancel', host)?.parentElement)).toEqual(['Cancel', 'Log in']);
  await click(buttonNamed('Cancel', host));
  await settle();
  expect(fetcher.mock.calls[0]?.[0]).toBe(`${BROWSER_URL}/cancel`);
  expect(host.textContent).toContain('Browser sign-in canceled');
  expect(buttonNamed('Sign in with the browser', host)).not.toBeNull();
  await tick(6000);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('When sign-in takes too long the reason is reported, and a result left on the server from last time is not treated as a new message', async () => {
  vi.useFakeTimers();
  const message = 'Sign-in did not finish within 10 minutes and the window closed. You can click "Sign in with browser" again';
  vi.stubGlobal('fetch', replies(browserAt('timeout', message)));
  const stale = await mount(<DownloadSettings initial={browserAt('timeout', message)} receipt={vi.fn()} />);
  expect(stale.textContent).not.toContain(message);
  const host = await mount(<DownloadSettings initial={browserAt('waiting')} receipt={vi.fn()} />);
  await tick(2000);
  await settle();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(message);
});

it('Read-only ends are entirely inert, with the reason stated', async () => {
  const host = await mount(<DownloadSettings initial={state({ available: false })} receipt={vi.fn()} />);
  expect(buttonNamed('Save configuration', host)?.disabled).toBe(true);
  expect(host.textContent).toContain('Cloud download is only available on devices allowed to modify the database');
});
