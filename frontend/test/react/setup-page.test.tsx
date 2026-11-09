import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PICK_FOLDER_URL } from '../../src/configuration-endpoints';
import { SetupPage } from '../../src/react/pages/setup/setup-page';
import { SETUP_QUESTIONS_URL, SETUP_URL, type SetupDone, type SetupQuestions } from '../../src/react/pages/setup/setup-api';
import { RESTART_REDIRECT_MS } from '../../src/react/restart-redirect';
import { MEDIA_SOURCE_OPTIONS } from '../../src/core/media-sources';
import { FIRST_ACCESS_DENIED } from '../../src/react/pages/first-access';
import { buttonNamed, choose, click, mount, settle, switches, type } from './render';
import '../../src/copy-editor-core.js';

const questions = (over: Partial<SetupQuestions> = {}): SetupQuestions => ({
  windows: false,
  standalone: false,
  questions: [
    { key: 'data_root', label: 'Data directory', help: ['Peach\'s database, caches, and settings files all live here.'], default: 'C:\\peach-data',
      required: true, advanced: false, input: 'folder', prefix: '', suffix: '' },
    { key: 'media_dir', label: 'Media catalog', help: ['Choose existing folders to store videos and images.'], default: 'D:\\Videos',
      required: true, advanced: false, input: 'folders', prefix: '', suffix: '' },
    { key: 'host', label: 'Who can access', help: [], default: '2', required: false, advanced: false, input: 'choice',
      prefix: '', suffix: '', options: [{ value: '2', label: 'Devices on the same LAN' }, { value: '1', label: 'This computer only' }] },
    { key: 'port', label: 'Port', help: ['The number after the colon in the browser address rarely needs changing.'], default: '8900',
      required: true, advanced: true, input: 'number', prefix: 'localhost:', suffix: '' },
    { key: 'mdns_name', label: 'LAN access address', help: [], default: 'peach', required: true, advanced: true,
      input: 'text', prefix: 'https://', suffix: '.local', visible_when: { host: '2' } },
  ],
  media_sources: MEDIA_SOURCE_OPTIONS.map(([value, label]) => ({ value, label })),
  media_source_default: 'local',
  media_root: null,
  cloud: { help: 'Sign in to the drive in CloudDrive and finish mounting first.', link: { url: 'https://www.clouddrive2.com/help.html', label: 'Mount help' },
    dependencies: [{ name: 'WinFsp', message: 'WinFsp was not detected.', download_url: 'https://winfsp.dev/rel/',
      download_label: 'Download WinFsp' }] },
  access_enabled: true,
  scan_now: true,
  history_guide: false,
  peach_proxy: { mode: 'environment', proxy_saved: false, needs_selection: false },
  docker: false,
  ...over,
});

const done = (over: Partial<SetupDone> = {}): SetupDone => ({
  url: 'http://127.0.0.1:8900/?onboarding=1', scan_requested: true, history_guide: false, standalone: false,
  redirect: null, facts: [{ term: 'Editions', value: '0.9.0' }, { term: 'Data directory', value: 'C:\\peach-data' }], ...over,
});

type Reply = { status: number; body: unknown };
/** A fake fetch that answers by address: the same address can queue several replies, and the last one repeats forever. */
function server(routes: Record<string, Reply | Reply[]>) {
  const queues = new Map(Object.entries(routes).map(([url, reply]) => [url, Array.isArray(reply) ? [...reply] : [reply]]));
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
    const queue = queues.get(url);
    if (!queue?.length) throw new Error(`No reply was prepared for ${url}`);
    const reply = queue.length > 1 ? queue.shift()! : queue[0]!;
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
  });
  vi.stubGlobal('fetch', fetcher);
  const sent = (url: string, index = 0) =>
    JSON.parse(String(fetcher.mock.calls.filter(([called]) => called === url)[index]?.[1]?.body));
  return { fetcher, sent };
}

async function open(over: Partial<SetupQuestions> = {}, routes: Record<string, Reply | Reply[]> = {}) {
  const api = server({ [SETUP_QUESTIONS_URL]: { status: 200, body: questions(over) }, ...routes });
  const host = await mount(<SetupPage />);
  await settle();
  return { host, ...api };
}

const rows = (root: ParentNode) => [...root.querySelectorAll('[data-folder-row]')];
const paths = (root: ParentNode) => [...root.querySelectorAll<HTMLInputElement>('input[aria-label^="Media folder "]')];
const field = (root: ParentNode, key: string) => root.querySelector<HTMLInputElement>(`#f-${key}`);
const radio = (root: ParentNode, label: string) =>
  [...root.querySelectorAll('label')].find((node) => node.textContent?.trim() === label);
const advanced = (root: ParentNode) => [...root.querySelectorAll('summary')].find((node) => node.textContent === 'Advanced settings');
const submitForm = async (root: ParentNode) => {
  for (let count = 0; count < 3 && !buttonNamed('Finish setup', root); count++) {
    await click(buttonNamed('Start setup', root) || buttonNamed('Continue', root));
    await settle();
  }
  await click(buttonNamed('Finish setup', root)); await settle();
};
const chooseProcessing = async (root: ParentNode, option: string) => {
  const field = root.querySelector('[aria-label="My library handling"]');
  await click(field?.matches('[aria-haspopup]') ? field : field?.querySelector('[aria-haspopup="listbox"]'));
  await click([...document.querySelectorAll('[role="option"]')].find(node => node.textContent?.startsWith(option)));
};
const alertsWith = (root: ParentNode, message: string) =>
  [...root.querySelectorAll('[role="alert"]')].filter((node) => node.textContent?.includes(message));
const occurrences = (root: HTMLElement, message: string) => (root.textContent ?? '').split(message).length - 1;

it('Returning in stepped setup keeps the folder, and nothing submits before confirming', async () => {
  const { host, fetcher } = await open();
  await click(buttonNamed('Start setup', host));
  await type(paths(host)[0], 'F:\\Library');
  await click(buttonNamed('Continue', host));
  expect(host.querySelector('h1')?.textContent).toBe('Where will you use Peach?');
  await click(buttonNamed('Back', host));
  expect(paths(host)[0]?.value).toBe('F:\\Library');
  expect(fetcher.mock.calls.filter(([url]) => url === SETUP_URL)).toHaveLength(0);
});

it('The edit draft matches the scene title, description, and action text per step', async () => {
  const { host } = await open();
  const core = (globalThis as unknown as { PeachCopyEditorCore: {
    applyDrafts(root: Node, edits: Record<string, string>, originals: WeakMap<Node, string>): void;
  } }).PeachCopyEditorCore;
  const originals = new WeakMap<Node, string>();
  const edits = {
    '你的私人媒体空间。': 'Private library.',
    '把喜欢的内容，整理成自己的收藏。': 'Organize your favorites.',
    '开始设置': 'Start organizing', '继续': 'Next step', '完成设置': 'Save settings',
  };
  const apply = () => core.applyDrafts(host, edits, originals);
  const caption = () => [...host.querySelectorAll('[data-setup-scene-caption] p')].map(node => node.textContent);
  apply();
  expect(caption()).toEqual(['Private library.', 'Organize your favorites.']);
  await click(buttonNamed('Start organizing', host));
  apply();
  expect(caption()).toEqual(['Turn files into a library.', 'Organize by library, with files staying where they are.']);
  await click(buttonNamed('Next step', host));
  apply();
  expect(caption()).toEqual(['From the desk to your hand.', 'Computers and phones, connected to one Peach.']);
  await click(buttonNamed('Next step', host));
  apply();
  expect(caption()).toEqual(['Everything is ready.', 'Confirm to save; scanning starts per your choices.']);
  expect(buttonNamed('Save settings', host)).not.toBeNull();
  for (let count = 0; count < 3; count++) { await click(buttonNamed('Back', host)); apply(); }
  expect(caption()).toEqual(['Private library.', 'Organize your favorites.']);
  expect(buttonNamed('Start organizing', host)).not.toBeNull();
});

it('First-run version statistics and error diagnostics start checked, and unchecking turns both off together', async () => {
  const reporting = { usage: true, errors: true, available: false,
    fields: { usage: 'Version and system', errors: 'Exception chain and error codes' }, notice: 'Do not send media info' };
  const { host, sent } = await open({ remote_reporting: reporting, access_enabled: false },
    { [SETUP_URL]: { status: 200, body: done() } });
  const reportingSwitches = host.querySelectorAll<HTMLInputElement>('input[aria-label="Send version statistics and error diagnostics (recommended)"]');
  expect(reportingSwitches).toHaveLength(1);
  expect(reportingSwitches[0]!.checked).toBe(true);
  await click(reportingSwitches[0]!);
  await submitForm(host);
  expect(sent(SETUP_URL).remote_reporting).toEqual({ usage: false, errors: false });
});

/** This error exists once on the page, inside a `role="alert"`, pointed to by the field's `aria-describedby`. */
function expectAnnounced(root: HTMLElement, input: Element | null | undefined, message: string) {
  const alerts = alertsWith(root, message);
  expect(alerts).toHaveLength(1);
  expect(occurrences(root, message)).toBe(1);
  const described = (input?.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  expect(described.some((id) => document.getElementById(id)?.contains(alerts[0]!))).toBe(true);
  return alerts[0]!;
}

it('Folder and access range show directly, with port and LAN name expanding on demand', async () => {
  const { host } = await open();
  expect(host.querySelector('h1')?.textContent).toBe('Welcome to Peach');
  expect(paths(host).map((input) => input.value)).toEqual(['']);
  expect(advanced(host)?.getAttribute('aria-expanded')).toBe('false');
  expect(field(host, 'port')?.value).toBe('8900');
  expect(host.textContent).toContain('localhost:');
  expect(host.textContent).toContain('Scan media folders after finishing setup');
  // "Who can access" is a two-option radio group, LAN on the left and selected by default.
  const group = host.querySelector('[role="radiogroup"]')!;
  expect(group.closest('details')).toBeNull();
  expect([...group.querySelectorAll('input[type="radio"]')].map((input) => [
    (input as HTMLInputElement).value, (input as HTMLInputElement).checked])).toEqual([['2', true], ['1', false]]);
});

it('The read strategy shows directly; new folders inherit their media library\'s', async () => {
  const { host, sent } = await open({}, { [SETUP_URL]: { status: 200, body: done() } });
  expect(host.querySelector('[data-media-read-policy]')?.closest('details')).toBeNull();
  expect(host.querySelector('[data-library-head]')?.closest('details')).toBeNull();
  await click(buttonNamed('Add folder', host));
  await type(paths(host)[1], 'E:\\More');
  await submitForm(host);
  const body = sent(SETUP_URL);
  expect(body.media_dir[0].library_id).toBe(body.media_dir[1].library_id);
  expect(body.media_dir.map((row: { library: string }) => row.library)).toEqual(['My library', 'My library']);
});

it('Initial handling choices save to the library, with summary and submission sharing the same choice', async () => {
  const { host, sent } = await open({}, { [SETUP_URL]: { status: 200, body: done() } });
  await chooseProcessing(host, 'Use local profiles only');
  const summary = host.querySelector('[aria-labelledby="setup-summary-title"]');
  expect(summary?.textContent).toContain('Use local profiles only');
  await submitForm(host);
  expect(sent(SETUP_URL).media_dir[0].library_policy).toBe('local');
});

it('A new library carries its own name and handling', async () => {
  const { host, sent } = await open({}, { [SETUP_URL]: { status: 200, body: done() } });
  await chooseProcessing(host, 'Use local profiles only');
  await click(buttonNamed('Add library', host));
  await type(host.querySelector<HTMLInputElement>('input[aria-label="Library 2 name"]'), 'Movies');
  await type(paths(host)[1], 'E:\\Films');
  await submitForm(host);
  const libraries = sent(SETUP_URL).media_dir;
  expect(libraries[0]).toMatchObject({ library: 'My library', library_policy: 'local' });
  expect(libraries[1]).toMatchObject({ library: 'Movies', library_policy: 'auto' });
  expect(libraries[0].library_id).not.toBe(libraries[1].library_id);
});

it('Custom handling steps submit with every folder of that library', async () => {
  const { host, sent } = await open({}, { [SETUP_URL]: { status: 200, body: done() } });
  await click(buttonNamed('Add folder', host));
  await type(paths(host)[1], 'E:\\More');
  await chooseProcessing(host, 'Custom');
  await click(radio(host, 'Fetch profiles online'));
  await submitForm(host);
  for (const row of sent(SETUP_URL).media_dir) {
    expect(row.library_policy).toBe('custom');
    expect(row.library_stages.split(',')).toEqual(['probe', 'cover', 'people', 'preview']);
  }
});

it('First-time setup offers no browsing-history option and keeps any explicit choice the API already has', async () => {
  const { host, sent } = await open({ history_guide: true }, { [SETUP_URL]: { status: 200, body: done() } });
  expect(host.textContent).not.toContain('Next, import browser history');
  await submitForm(host);
  expect(sent(SETUP_URL).history_guide).toBe(true);
});

it('Choosing "This computer only" removes the LAN address row entirely and it is never sent with the submission', async () => {
  const { host, sent } = await open({}, { [SETUP_URL]: { status: 200, body: done() } });
  expect(field(host, 'mdns_name')).not.toBeNull();
  await click(radio(host, 'This computer only'));
  expect(field(host, 'mdns_name')).toBeNull();
  await submitForm(host);
  const body = sent(SETUP_URL);
  expect(body.host).toBe('1');
  expect('mdns_name' in body).toBe(false);
  expect(body.port).toBe('8900');
});

describe('Access password', () => {
  it('Switching access range keeps the filled password, and the access address follows the form values', async () => {
    const { host, sent } = await open({}, { [SETUP_URL]: { status: 200, body: done() } });
    await type(host.querySelector<HTMLInputElement>('#access-password'), 'secret-password');
    await type(host.querySelector<HTMLInputElement>('#access-confirm'), 'secret-password');
    await click(radio(host, 'This computer only'));
    expect(host.textContent).toContain('http://127.0.0.1:8900/');
    await click(radio(host, 'Devices on the same LAN'));
    expect(host.textContent).toContain('https://peach.local/');
    await submitForm(host);
    expect(sent(SETUP_URL)).toMatchObject({ access_password: 'secret-password', access_confirm: 'secret-password' });
  });
  it('The switch initializes from the read API; turning it off collapses both boxes and submits without a password', async () => {
    const { host, sent } = await open({}, { [SETUP_URL]: { status: 200, body: done() } });
    expect(host.querySelector('#access-password')).not.toBeNull();
    await type(host.querySelector<HTMLInputElement>('#access-password'), 'secret-password');
    await click(switches(host)[0]);
    expect(host.querySelector('#access-password')).toBeNull();
    await submitForm(host);
    const body = sent(SETUP_URL);
    expect(body.access_enabled).toBe(false);
    expect('access_password' in body || 'access_confirm' in body).toBe(false);
  });

  it('With local-only access the switch starts off, and enabling submits both inputs', async () => {
    const { host, sent } = await open({ access_enabled: false }, { [SETUP_URL]: { status: 200, body: done() } });
    expect(host.querySelector('#access-password')).toBeNull();
    await click(switches(host)[0]);
    await type(host.querySelector<HTMLInputElement>('#access-password'), 'correct-password');
    await type(host.querySelector<HTMLInputElement>('#access-confirm'), 'correct-password');
    await submitForm(host);
    expect(sent(SETUP_URL)).toMatchObject({
      access_enabled: true, access_password: 'correct-password', access_confirm: 'correct-password' });
  });
});

describe('Peach proxy', () => {
  const proxyMode = (host: ParentNode) => host.querySelector('[aria-labelledby="setup-proxy-title"] [aria-haspopup="listbox"]');

  it('The environment provides the initial value, a custom URL submits with settings, and direct connection never carries the hidden address', async () => {
    const { host, sent } = await open({}, { [SETUP_URL]: { status: 400, body: { error: 'Retry later' } } });
    expect(proxyMode(host)?.textContent).toContain('Follow the environment');
    expect(host.querySelector('#setupProxyAddress')).toBeNull();
    await submitForm(host);
    expect(sent(SETUP_URL).peach_proxy).toEqual({ mode: 'environment', proxy: '' });
    await choose(proxyMode(host), 'Custom');
    const address = host.querySelector<HTMLInputElement>('#setupProxyAddress');
    expect(address?.type).toBe('password');
    await type(address, 'socks5h://user:private@127.0.0.1:7890');
    await submitForm(host);
    expect(sent(SETUP_URL, 1).peach_proxy).toEqual({ mode: 'proxy', proxy: 'socks5h://user:private@127.0.0.1:7890' });
    await choose(proxyMode(host), 'Direct');
    expect(host.querySelector('#setupProxyAddress')).toBeNull();
    await submitForm(host);
    expect(sent(SETUP_URL, 2).peach_proxy).toEqual({ mode: 'direct', proxy: '' });
  });

  it('Proxy address validation errors in place and keeps the input', async () => {
    const message = 'Enter an HTTP or SOCKS proxy address with a port';
    const { host } = await open({ peach_proxy: { mode: 'proxy', proxy_saved: true, needs_selection: false } },
      { [SETUP_URL]: { status: 400, body: { error: 'A few items need changes', errors: { peach_proxy: message } } } });
    const address = host.querySelector<HTMLInputElement>('#setupProxyAddress');
    expect(address?.placeholder).toBe('Saved; leave empty to keep');
    await type(address, 'http://proxy.invalid');
    await submitForm(host);
    expect(address?.value).toBe('http://proxy.invalid');
    expectAnnounced(host, address, message);
    expect(document.activeElement).toBe(address);
  });

  it.each([true, false])('The Docker loopback hint applies only to custom loopback addresses inside a container: %s', async (docker) => {
    const { host } = await open({ docker });
    await choose(proxyMode(host), 'Custom');
    const address = host.querySelector<HTMLInputElement>('#setupProxyAddress');
    await type(address, 'http://127.0.0.1:7890');
    expect(host.textContent?.includes('Loopback address points to the container itself')).toBe(docker);
    await type(address, 'http://host.docker.internal:7890');
    expect(host.textContent).not.toContain('Loopback address points to the container itself');
    await choose(proxyMode(host), 'Follow the environment');
    expect(host.textContent).not.toContain('Loopback address points to the container itself');
  });
});

describe('Media library', () => {
  it('Adding the library later collapses the folder step and skips scanning; unchecking keeps the filled path', async () => {
    const { host, sent } = await open({ access_enabled: false }, { [SETUP_URL]: {
      status: 200, body: done({ skip_media: true, scan_requested: false }),
    } });
    await type(paths(host)[0], 'E:\\Films');
    await click(radio(host, 'Add the library later'));
    expect(paths(host)).toHaveLength(0);
    expect(host.textContent).not.toContain('Scan after setup is complete');
    expect(host.querySelector('[aria-labelledby="setup-summary-title"]')?.textContent).toContain('Add later');
    await click(radio(host, 'Add the library later'));
    expect(paths(host)[0]?.value).toBe('E:\\Films');
    await click(radio(host, 'Add the library later'));
    await submitForm(host);
    expect(sent(SETUP_URL)).toMatchObject({ media_dir: [], skip_media: true, scan_now: false });
    expect(host.textContent).toContain('Add media directories under "Media Library & Ingest" to start scanning.');
  });

  it('Library icon and source color save with every folder of that library', async () => {
    const { host, sent } = await open({}, { [SETUP_URL]: { status: 200, body: done() } });
    await type(paths(host)[0], 'D:\\Videos');
    await click(host.querySelector('[aria-label="My library icon"]'));
    await click(document.querySelector('[aria-label="Movies"]'));
    await click(buttonNamed('App', document));
    await click(host.querySelector('[aria-label="My library source color: no color"]'));
    await click(document.querySelector('[data-library-colors] [aria-label="Emerald"]'));
    await click(buttonNamed('Add folder', host));
    await type(paths(host)[1], 'E:\\More');
    await submitForm(host);
    expect(sent(SETUP_URL).media_dir).toMatchObject([
      { library_icon: 'film', library_color: 'emerald' }, { library_icon: 'film', library_color: 'emerald' },
    ]);
  });

  it('First-time drive setup requires explicitly choosing a read policy', async () => {
    const { host, sent } = await open({}, { [SETUP_URL]: { status: 200, body: done() } });
    await type(paths(host)[0], 'D:\\Videos');
    await choose(rows(host)[0]!.querySelector('[aria-haspopup="listbox"]'), 'OneDrive');
    const policy = rows(host)[0]!.querySelector('[data-media-read-policy] [aria-haspopup="listbox"]');
    expect(policy?.textContent).toContain('Choose the read policy');
    await submitForm(host);
    expect(host.textContent).toContain('Select a media reading strategy');
    await choose(policy, 'Normal read');
    await submitForm(host);
    expect(sent(SETUP_URL).media_dir).toMatchObject([
      { path: 'D:\\Videos', location: 'onedrive', root: '', cost: 'free' },
    ]);
  });

  it('Rows add and remove, the scan note follows the row count, and submitting carries each row\'s source', async () => {
    const { host, sent } = await open({}, { [SETUP_URL]: { status: 200, body: done() } });
    await type(paths(host)[0], 'D:\\Videos');
    await click(buttonNamed('Add folder', host));
    expect(rows(host)).toHaveLength(2);
    expect(document.activeElement).toBe(paths(host)[1]);
    await type(paths(host)[1], 'E:\\More');
    expect(host.textContent).toContain('Scan 2 folders after finishing setup');
    await click(rows(host)[0]!.querySelector('button[aria-label="Remove this folder"]'));
    expect(paths(host).map((input) => input.value)).toEqual(['E:\\More']);
    expect(rows(host)[0]!.querySelector('button[aria-label="Remove this folder"]')).toBeNull();
    await submitForm(host);
    expect(sent(SETUP_URL).media_dir).toMatchObject([{ path: 'E:\\More', location: 'local', root: '', cost: 'free' }]);
  });

  it('Choose folder opens this computer\'s dialog, and the picked path fills back into the row', async () => {
    const { host, sent } = await open({}, { [PICK_FOLDER_URL]: { status: 200, body: { path: 'F:\\Picked' } } });
    await click(rows(host)[0]!.querySelector('button[aria-label="Choose folder"]'));
    await settle();
    expect(sent(PICK_FOLDER_URL)).toEqual({ initial: '' });
    expect(paths(host)[0]!.value).toBe('F:\\Picked');
  });

  it('Mount notes and missing software appear only once a row picks a cloud drive', async () => {
    const { host } = await open();
    expect(host.textContent).not.toContain('Mount help');
    await choose(rows(host)[0]!.querySelector('[aria-haspopup="listbox"]'), 'CloudDrive · 115');
    expect(host.textContent).toContain('Sign in to the drive in CloudDrive and finish mounting first.');
    expect(host.querySelector('a[href="https://winfsp.dev/rel/"]')?.textContent).toContain('Download WinFsp');
    await choose(rows(host)[0]!.querySelector('[aria-haspopup="listbox"]'), 'Local disk');
    expect(host.textContent).not.toContain('Mount help');
  });

  it('Non-Windows first-run can submit with just the media folder filled', async () => {
    const { host, sent } = await open({ windows: false,
      media_root: { label: 'Path prefix in the database', placeholder: 'Auto configure' } },
    { [SETUP_URL]: { status: 200, body: done() } });
    expect(rows(host)[0]!.querySelector('input[placeholder="Auto-configured"]')).toBeNull();
    await type(paths(host)[0], '/media/movies');
    await submitForm(host);
    expect(sent(SETUP_URL).media_dir[0]).toMatchObject({ path: '/media/movies', root: '' });
  });
});

describe('Invalid input flagged in place', () => {
  it('The catalog is laid out in rows, errors in advanced settings expand their collapse, everything filled stays, and focus lands on the first error', async () => {
    const { host } = await open({}, { [SETUP_URL]: { status: 400, body: {
      error: 'A few items need changes', errors: { media_dir: ['Folder does not exist: D:\\Nope'], port: 'The port must be an integer between 1 and 65535' } } } });
    await type(paths(host)[0], 'D:\\Nope');
    await type(field(host, 'port'), '70000');
    await submitForm(host);
    await act(() => new Promise((done) => requestAnimationFrame(() => done(null))));
    expect(rows(host)[0]!.textContent).toContain('Folder does not exist: D:\\Nope');
    expect(paths(host)[0]!.getAttribute('aria-invalid')).toBe('true');
    expect(advanced(host)?.getAttribute('aria-expanded')).toBe('true');
    expect(field(host, 'port')?.value).toBe('70000');
    expect(field(host, 'port')?.getAttribute('aria-invalid')).toBe('true');
    expectAnnounced(host, paths(host)[0], 'Folder does not exist: D:\\Nope');
    expectAnnounced(host, field(host, 'port'), 'The port must be an integer between 1 and 65535');
    expect(document.activeElement).toBe(paths(host)[0]);
  });

  it('The whole-table failing assertion is written above the catalog area, not attached to a single row', async () => {
    const { host } = await open({}, { [SETUP_URL]: { status: 400, body: {
      error: 'A few items need changes', errors: { media_dir: ['Add 1 to 100 media folders'] } } } });
    await click(buttonNamed('Add folder', host));
    await submitForm(host);
    const [alert, ...more] = alertsWith(host, 'Add 1 to 100 media folders');
    expect(alert).toBeDefined();
    expect(more).toHaveLength(0);
    expect(occurrences(host, 'Add 1 to 100 media folders')).toBe(1);
    expect(rows(host).some((row) => row.contains(alert!))).toBe(false);
    expect(alert!.compareDocumentPosition(rows(host)[0]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(advanced(host)?.getAttribute('aria-expanded')).toBe('false');
  });

  it('Password errors hang under the password box with the switch left on', async () => {
    const { host } = await open({}, { [SETUP_URL]: { status: 400, body: {
      error: 'A few items need changes', errors: { access_password: 'The two access passwords do not match' } } } });
    await type(host.querySelector<HTMLInputElement>('#access-password'), 'first-password');
    await submitForm(host);
    expect(switches(host)[0]!.checked).toBe(true);
    expect(host.querySelector('#access-password')?.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector<HTMLInputElement>('#access-password')?.value).toBe('first-password');
    const first = expectAnnounced(host, host.querySelector('#access-password'), 'The two access passwords do not match');
    // Submitting the same error again: the notice swaps to a new node so screen readers announce it again, while the page still holds only one.
    await submitForm(host);
    const second = expectAnnounced(host, host.querySelector('#access-password'), 'The two access passwords do not match');
    expect(second).not.toBe(first);
  });
});

describe('Completed state', () => {
  it('On success the same page switches to a done state: scan instructions, entry links, and run info collapse by default', async () => {
    const { host } = await open({}, { [SETUP_URL]: { status: 200, body: done() } });
    await submitForm(host);
    expect(host.querySelector('h1')?.textContent).toBe('You are all set');
    expect(host.textContent).toContain('Your library is ready to open.');
    expect(host.textContent).toContain('The first scan is queued and will organize the library in the background; Peach stays usable meanwhile.');
    const entry = [...host.querySelectorAll('a')].find((link) => link.textContent === 'Enter Peach');
    expect(entry?.getAttribute('href')).toBe('http://127.0.0.1:8900/?onboarding=1');
    expect(document.activeElement).toBe(entry);
    const facts = [...host.querySelectorAll('summary')].find((node) => node.textContent === 'Runtime info');
    expect(facts?.getAttribute('aria-expanded')).toBe('false');
    expect(document.title).toBe('Peach · Setup complete');
  });

  it('When importing browser history is selected without scanning, the entry becomes import history', async () => {
    const { host } = await open({}, { [SETUP_URL]: { status: 200, body: done({
      url: 'http://127.0.0.1:8900/taste?onboarding=1', scan_requested: false, history_guide: true }) } });
    await submitForm(host);
    expect(host.textContent).toContain('Start scanning the library later from the configuration page.');
    const entry = [...host.querySelectorAll('a')].find((link) => link.textContent === 'Import browser history');
    expect(entry?.getAttribute('href')).toBe('http://127.0.0.1:8900/taste?onboarding=1');
  });

  it('The standalone build provides a redirect address: wait as long as the config page before jumping', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const { host } = await open({}, { [SETUP_URL]: { status: 200, body: done({
      standalone: true, redirect: 'http://127.0.0.1:8900/?onboarding=1' }) } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await submitForm(host);
    await act(async () => { vi.advanceTimersByTime(RESTART_REDIRECT_MS - 1) });
    expect(assign).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1) });
    expect(assign).toHaveBeenCalledWith('http://127.0.0.1:8900/?onboarding=1');
  });

  it('Source deployments expose no jump address, and the page never navigates itself', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const { host } = await open({}, { [SETUP_URL]: { status: 200, body: done() } });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await submitForm(host);
    await act(async () => { vi.advanceTimersByTime(RESTART_REDIRECT_MS * 2) });
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('Docker', () => {
  const docker = (over: Partial<SetupQuestions> = {}) => ({
    windows: false, docker: true, data_root: '/data', access_preset: false,
    media_root: { label: 'Path prefix in the database', placeholder: 'Auto configure' },
    questions: [{ key: 'media_dir', label: 'Media catalog', help: [], default: '/media', required: true, advanced: false,
      input: 'folders' as const, prefix: '', suffix: '' }],
    ...over,
  });

  it('No data directory, access scope, or advanced settings; the media directory prefills /media, and there is no way to reattach existing data', async () => {
    const { host, sent } = await open(docker(), { [SETUP_URL]: { status: 200, body: done({ url: '/?onboarding=1' }) } });
    expect(buttonNamed('Use existing data', host)).toBeNull();
    expect(host.querySelector('[aria-label^="First-time setup"]')?.getAttribute('aria-label')).toBe('First-time setup, step 1 of 4');
    await click(buttonNamed('Start setup', host)); await settle();
    expect(paths(host)[0]?.value).toBe(undefined);
    expect(host.querySelector('#f-data_root')).toBeNull();
    await click(buttonNamed('Continue', host)); await settle();
    expect(host.querySelector('h1')?.textContent).toBe('Access and network');
    expect(radio(host, 'This computer only')).toBeUndefined();
    expect(advanced(host)).toBeUndefined();
    expect(host.textContent).not.toContain('Access address: ');
    expect(host.querySelector('#access-password')).not.toBeNull();
    await type(host.querySelector<HTMLInputElement>('#access-password'), 'correct-password');
    await type(host.querySelector<HTMLInputElement>('#access-confirm'), 'correct-password');
    await click(buttonNamed('Continue', host)); await settle();
    expect(host.textContent).toContain('/data');
    expect(host.textContent).toContain('By Compose port mapping · Using the access password');
    await click(buttonNamed('Finish setup', host)); await settle();
    const body = sent(SETUP_URL);
    expect(body.media_dir[0]).toMatchObject({ path: '/media' });
    expect(body).toMatchObject({ access_enabled: true, access_password: 'correct-password' });
    expect(['data_root', 'host', 'port', 'mdns_name'].filter((key) => key in body)).toEqual([]);
  });

  it('When the access password is already set from PEACH_ACCESS_PASSWORD, only mark it as set and submit without a password', async () => {
    const { host, sent } = await open(docker({ access_preset: true }), { [SETUP_URL]: { status: 200, body: done() } });
    await click(buttonNamed('Start setup', host)); await settle();
    await click(buttonNamed('Continue', host)); await settle();
    expect(switches(host)).toHaveLength(0);
    expect(host.querySelector('#access-password')).toBeNull();
    expect(host.textContent).toContain('Access password set from PEACH_ACCESS_PASSWORD');
    await submitForm(host);
    const body = sent(SETUP_URL);
    expect(body.access_enabled).toBe(false);
    expect('access_password' in body).toBe(false);
  });

  it('When the source is not the host machine or the LAN it says where to open Peach, or uses PEACH_ACCESS_PASSWORD', async () => {
    server({ [SETUP_QUESTIONS_URL]: { status: 403, body: { error: FIRST_ACCESS_DENIED, docker: true } } });
    const host = await mount(<SetupPage />);
    await settle();
    expect(host.querySelector('form')).toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(FIRST_ACCESS_DENIED);
  });
});

it('When opened on another device the challenge endpoint returns 403, saying only where to open it and never rendering a form', async () => {
  server({ [SETUP_QUESTIONS_URL]: { status: 403, body: { error: 'setup is loopback-only' } } });
  const host = await mount(<SetupPage />);
  await settle();
  expect(host.querySelector('form')).toBeNull();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('Please open Settings on the computer running Peach.');
});

it('A failed read gives the reason and a retry', async () => {
  const { fetcher } = server({ [SETUP_QUESTIONS_URL]: [
    { status: 500, body: { error: 'Service error' } }, { status: 200, body: questions() }] });
  const host = await mount(<SetupPage />);
  await settle();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Service error');
  await click(buttonNamed('Retry now', host));
  await settle();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(paths(host)).toHaveLength(1);
});
