import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CONFIGURATION_URL, PICK_FOLDER_URL } from '../../src/configuration-endpoints';
import type { ConfigurationData } from '../../src/react/bundle';
import { CloudDriveGuide } from '../../src/react/settings/clouddrive-guide';
import { MEDIA_SOURCE_ICONS } from '../../src/ui-kit/media-source-icons';
import { MediaSettings } from '../../src/react/settings/media-settings';
import { buttonNamed, choose, click, fetchMock, mount, section, sentBody, settle, submit, type } from './render';

vi.mock('../../src/react/settings/service-preferences', () => ({ VideoThumbnailRow: () => null }));
vi.mock('../../src/react/settings/cloud-proxy-settings', () => ({ CloudProxySettings: () => null }));
vi.mock('@peach/legacy/ui', async (original) => ({
  ...await original<Record<string, unknown>>(),
  MEDIA_SOURCE_ICONS: (await import('../../src/ui-kit/media-source-icons')).MEDIA_SOURCE_ICONS,
  confirmModal: (await import('../../src/ui-kit/modal')).confirmModal,
}));
/* Before saving, read the scan and collection status once. Catch it separately, so each test case's fetch stub only counts config requests. */
const processing = vi.hoisted(() => ({ read: vi.fn(async (): Promise<{ status: string; trigger?: string }> => ({ status: 'idle' })) }));
vi.mock('../../src/react/library-processing/library-processing', async (original) => ({
  ...await original<Record<string, unknown>>(),
  fetchLibraryProcessing: () => processing.read(),
}));
afterEach(() => { processing.read.mockReset(); processing.read.mockResolvedValue({ status: 'idle' }) });

const data = (over: Partial<ConfigurationData> = {}): ConfigurationData => ({
  editable: true, notice: '', revision: 'rev-1', media_dirs: ['D:\\Media'], library_count: 1, port: 9123, facts: [], ...over,
});

const open = (over: Partial<ConfigurationData> = {}, receipt = vi.fn()) =>
  mount(<MediaSettings data={data(over)} receipt={receipt} />);
const rows = (root: ParentNode) => [...root.querySelectorAll('[data-folder-row]')];
const paths = (root: ParentNode) => [...root.querySelectorAll<HTMLInputElement>('input[aria-label^="Media folder "]')];

it('The media form keeps the restart notice; the access port is managed by the network section', async () => {
  const host = await open({ port_editable: false });
  expect(host.querySelector('#configPort')).toBeNull();
  expect(host.textContent).toContain('Peach will restart after saving');
  expect(host.querySelector('form')).not.toBeNull();
});

it('Drive sources missing dependencies get a new-window download link, and installed ones stay quiet', async () => {
  const host = await open({
    media_sources: [{ location: '115', root: 'B:\\', path: 'B:\\' }],
    mount_dependencies: [
      { name: 'CloudDrive', available: false, download_url: 'https://www.clouddrive2.com/download.html' },
      { name: 'WinFsp', available: true, download_url: 'https://winfsp.dev/rel/' },
    ],
  });
  const link = host.querySelector('a[href="https://www.clouddrive2.com/download.html"]');
  expect(link?.getAttribute('target')).toBe('_blank');
  expect(link?.querySelector('svg')).not.toBeNull();
  expect(host.textContent).not.toContain('Download WinFsp');
});

it('On LAN HTTP pages without randomUUID, legacy catalogs get a library identity filled in and still open normally', async () => {
  const real = globalThis.crypto;
  vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
  const fetcher = fetchMock(200, { saved: true, url: '/', revision: 'rev-2' });
  vi.stubGlobal('fetch', fetcher);
  try {
    const host = await open({ media_sources: [{ location: 'local', root: '/media', path: '/media', cost: 'free' }] });
    expect(host.querySelector('form')).not.toBeNull();
    await submit(host.querySelector('form'));
    expect(sentBody(fetcher).media_sources[0].library_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('When editing is unavailable it states the reason without painting a form', async () => {
  const host = await open({ editable: false, notice: 'Open the configuration on the computer running Peach' });
  expect(host.querySelector('form')).toBeNull();
  expect(host.querySelector('[role="note"]')?.textContent).toContain('Open the configuration on the computer running Peach');
});

describe('Media catalog', () => {
  it('Choosing an SMB share as the source shows connection fields; switching back to a local disk hides them', async () => {
    const host = await open({ media_sources: [{ location: 'local', root: 'D:\\Media', path: 'D:\\Media' }] });
    const source = () => host.querySelector('[aria-label="Media source 1"]');
    expect(host.querySelector('[aria-label="SMB account 1"]')).toBeNull();
    await choose(source(), 'SMB share');
    expect(source()?.textContent).toContain('SMB share');
    expect(paths(host)[0]?.value).toBe('smb://');
    expect(host.querySelector('input[aria-label="SMB password 1"]')?.getAttribute('type')).toBe('password');
    await type(paths(host)[0], '');
    expect(source()?.textContent).toContain('SMB share');
    expect(host.querySelector('[aria-label="SMB account 1"]')).not.toBeNull();
    await choose(source(), 'Local disk');
    expect(host.querySelector('[aria-label="SMB account 1"]')).toBeNull();
  });

  it('Saving an SMB source keeps folder identities, and the password input stays empty', async () => {
    const fetcher = fetchMock(200, { saved: true, url: '/', revision: 'rev-2' });
    vi.stubGlobal('fetch', fetcher);
    const host = await open({ media_sources: [{ location: 'local', root: 'P:\\NAS', path: 'smb://nas/Movies',
      root_id: 'nas-root', library_id: 'nas-library', transport: 'smb', smb_username: 'reader', smb_password_saved: true }] });
    expect(host.querySelector('[aria-label="Media source 1"]')?.textContent).toContain('SMB share');
    expect(host.querySelector<HTMLInputElement>('[aria-label="SMB password 1"]')?.value).toBe('');
    await submit(host.querySelector('form'));
    expect(sentBody(fetcher).media_sources[0]).toMatchObject({ root_id: 'nas-root', library_id: 'nas-library',
      transport: 'smb', path: 'smb://nas/Movies', smb_username: 'reader', smb_password: '' });
  });

  it('Folders of the same library are grouped into one card; the name is entered once, written to all directories on save, and the root directory identity is kept', async () => {
    const fetcher = fetchMock(200, { saved: true, url: '/', revision: 'rev-2' });
    vi.stubGlobal('fetch', fetcher);
    const host = await open({ windows: true, media_sources: [
      { location: 'local', root: 'D:\\JAV', path: 'D:\\JAV', root_id: 'root-one', library_id: 'library-one', library: 'JAV', cost: 'free' },
      { location: 'local', root: 'E:\\JAV', path: 'E:\\JAV', root_id: 'root-two', library_id: 'library-one', library: 'JAV', cost: 'free' },
    ] });
    const blocks = [...host.querySelectorAll('[data-library-block]')];
    expect(blocks).toHaveLength(1);
    expect(rows(blocks[0]!)).toHaveLength(2);
    await type(host.querySelector<HTMLInputElement>('[aria-label="JAV name"]'), 'Private library');
    expect(host.querySelectorAll('input[aria-label$=" name"]')).toHaveLength(1);
    await submit(host.querySelector('form'));
    expect(sentBody(fetcher).media_sources).toMatchObject([
      { root_id: 'root-one', library_id: 'library-one', library: 'Private library' },
      { root_id: 'root-two', library_id: 'library-one', library: 'Private library' },
    ]);
  });

  it('Source color and handling belong to the library and submit with each of its folders on save', async () => {
    const fetcher = fetchMock(200, { saved: true, url: '/', revision: 'rev-2' });
    vi.stubGlobal('fetch', fetcher);
    const host = await open({ windows: true, media_sources: [
      { location: 'local', root: 'D:\\JAV', path: 'D:\\JAV', root_id: 'root-one', library_id: 'library-one', library: 'JAV',
        cost: 'free', library_color: 'sky', library_policy: 'auto' },
      { location: 'local', root: 'E:\\JAV', path: 'E:\\JAV', root_id: 'root-two', library_id: 'library-one', library: 'JAV',
        cost: 'free', library_color: 'sky', library_policy: 'auto' },
    ] });
    expect(host.querySelector('[data-library-color-trigger]')?.getAttribute('aria-label')).toBe('Source color of JAV: Sky blue');
    await click(host.querySelector('[data-library-color-trigger]'));
    await click(document.querySelector('[data-library-colors] [aria-label="Amber"]'));
    const policy = host.querySelector('[aria-label="JAV handling"]');
    await click(policy?.matches('[aria-haspopup]') ? policy : policy?.querySelector('[aria-haspopup="listbox"]'));
    await click([...document.querySelectorAll('[role="option"]')].find(node => node.textContent?.startsWith('Custom')));
    const steps = host.querySelector('[aria-label="JAV handling steps"]');
    expect(steps?.querySelectorAll('input:checked')).toHaveLength(5);
    await click([...steps!.querySelectorAll('label')].find(node => node.textContent?.includes('Generate 3x3 grid preview')));
    await submit(host.querySelector('form'));
    const expected = { library_id: 'library-one', library_color: 'amber', library_policy: 'custom',
      library_stages: 'probe,metadata,cover,people' };
    expect(sentBody(fetcher).media_sources).toMatchObject([expected, expected]);
  });

  it('Catalog relocation keeps the ledger prefix, and adding another folder leaves identity generation to the server', async () => {
    const fetcher = fetchMock(200, { saved: true, url: '/', revision: 'rev-2' });
    vi.stubGlobal('fetch', fetcher);
    const host = await open({ windows: true, media_sources: [
      { location: 'local', root: 'D:\\JAV', path: 'D:\\JAV', root_id: 'root-one', library_id: 'library-one', library: 'JAV', cost: 'free' },
    ] });
    await type(paths(host)[0], 'F:\\JAV');
    await choose(host.querySelector('[aria-label="Folder change method 1"]'), 'Relocate this folder and keep the file records');
    await submit(host.querySelector('form'));
    expect(sentBody(fetcher).media_sources[0]).toMatchObject({
      root_id: 'root-one', root: 'D:\\JAV', path: 'F:\\JAV', change_mode: 'relocate',
    });
  });
  it.each([['guangya', 'Guangya cloud drive'], ['onedrive', 'OneDrive'], ['mounted', 'Other mounted cloud drives']])(
    '%s source backfills name, mount help, and the existing mark, and saving carries the source', async (location, label) => {
    const fetcher = fetchMock(200, { saved: true, url: '/', revision: 'rev-2' });
    vi.stubGlobal('fetch', fetcher);
    const host = await open({ windows: true, media_sources: [
      { location, root: 'G:\\Movies', path: 'G:\\Movies', online: true },
    ] });
    expect(paths(host)[0]?.value).toBe('G:\\Movies');
    expect(host.textContent).toContain(label);
    expect(host.textContent).not.toContain('(read-only)');
    if (location === 'mounted') expect(host.querySelector('use[href="#i-database"]')).not.toBeNull();
    else expect(host.querySelector('img')?.getAttribute('src')).toBe(MEDIA_SOURCE_ICONS[location]);
    expect(host.textContent).toContain('CloudDrive2 v1.1.0');
    await submit(host.querySelector('form'));
    expect(sentBody(fetcher).media_sources).toMatchObject([
      { location, root: 'G:\\Movies', path: 'G:\\Movies', library: '', library_icon: '',
        cost: location === 'guangya' ? 'free' : 'metered' },
    ]);
  });

  it('On Windows only local paths are filled, and CloudDrive help appears only when a cloud drive is selected', async () => {
    const host = await open({ windows: true, media_sources: [{ location: 'local', root: 'D:/', path: 'D:/' }] });
    expect(host.textContent).not.toContain('The matching path on Windows');
    expect(host.textContent).not.toContain('Mount help');
    await choose(rows(host)[0]?.querySelector('[aria-haspopup="listbox"]'), 'CloudDrive · 115');
    expect(host.textContent).toContain('Mount help');
  });

  it('Other systems show only the media directory and its own access status per row', async () => {
    const host = await open({ windows: false, media_sources: [
      { location: '115', root: 'B:/', path: '/Volumes/115', online: true },
      { location: 'pikpak', root: 'A:/', path: '/Volumes/PikPak', online: false },
      { location: 'local', root: 'D:/', path: '/Volumes/Media' },
    ] });
    expect(rows(host)).toHaveLength(3);
    expect(rows(host).some((row) => row.textContent?.includes('Advanced path settings'))).toBe(false);
    const internalPaths = [...host.querySelectorAll('input[placeholder="Auto-configured"]')];
    expect(internalPaths).toHaveLength(0);
    expect(rows(host).map((row) => [row.querySelector('[data-mount]')?.getAttribute('data-mount'), row.querySelector('[data-mount]')?.textContent]))
      .toEqual([['online', 'Online'], ['offline', 'Offline'], ['unknown', 'Not checked']]);
    expect(section(host, 'Mount state')).toBeNull();
  });

  /* The read-only single-column "mount status" and its refresh key live in `configuration.test.tsx`: a refresh swaps in the page-level
     `queryKey`, and mounting only this section cannot show who actually read the new data. */

  it('Backfills all mount points per source, with submissions carrying drive mappings and libraries', async () => {
    const fetcher = fetchMock(200, { saved: true, url: '/', revision: 'rev-2' });
    vi.stubGlobal('fetch', fetcher);
    const host = await open({ windows: false, media_sources: [
      { location: '115', root: 'B:\\', path: '/Volumes/115', online: false, library: 'Favorites', library_icon: 'heart' },
      { location: 'pikpak', root: 'A:\\', path: '/Volumes/PikPak', online: true },
    ] });
    expect(paths(host).map((input) => input.value)).toEqual(['/Volumes/115', '/Volumes/PikPak']);
    await submit(host.querySelector('form'));
    await settle();
    expect(sentBody(fetcher).media_sources).toMatchObject([
      { location: '115', root: 'B:\\', path: '/Volumes/115', library: 'Favorites', library_icon: 'heart', cost: 'free' },
      { location: 'pikpak', root: 'A:\\', path: '/Volumes/PikPak', library: '', library_icon: '', cost: 'metered' },
    ]);
  });

  it('Saved directories backfill proxy protection; the user can switch to normal reading', async () => {
    const fetcher = fetchMock(200, { saved: true, url: '/', revision: 'rev-2' });
    vi.stubGlobal('fetch', fetcher);
    const host = await open({ windows: true, media_sources: [
      { location: 'onedrive', root: 'O:\\Movies', path: 'O:\\Movies', cost: 'metered' },
    ] });
    const policy = rows(host)[0]?.querySelector('[data-media-read-policy] [aria-haspopup="listbox"]');
    expect(policy?.textContent).toContain('Proxy protection');
    await choose(policy, 'Normal read');
    await submit(host.querySelector('form'));
    expect(sentBody(fetcher).media_sources).toMatchObject([
      { location: 'onedrive', root: 'O:\\Movies', path: 'O:\\Movies', library: '', library_icon: '', cost: 'free' },
    ]);
  });

  it('After switching to a cloud drive source, a read strategy must be chosen explicitly before saving', async () => {
    const fetcher = fetchMock(200, { saved: true, url: '/', revision: 'rev-2' });
    vi.stubGlobal('fetch', fetcher);
    const host = await open({ windows: true, media_sources: [
      { location: 'local', root: 'O:\\Movies', path: 'O:\\Movies', cost: 'free' },
    ] });
    await choose(rows(host)[0]?.querySelector('[aria-haspopup="listbox"]'), 'CloudDrive · PikPak');
    const policy = rows(host)[0]?.querySelector('[data-media-read-policy] [aria-haspopup="listbox"]');
    expect(policy?.textContent).toContain('Choose the read policy');
    await submit(host.querySelector('form'));
    expect(fetcher).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Select a media reading strategy');
    await choose(policy, 'Normal read');
    await submit(host.querySelector('form'));
    expect(sentBody(fetcher).media_sources[0]).toMatchObject({ location: 'pikpak', cost: 'free' });
  });

  it('One folder per row, and a single row has no remove key', async () => {
    const host = await open();
    expect(paths(host).map((input) => input.value)).toEqual(['D:\\Media']);
    expect(host.querySelector('[aria-label="Remove this folder"]')).toBeNull();
  });

  it('The newly added row takes focus, and every row can then be removed', async () => {
    const host = await open();
    await click(buttonNamed('Add folder', host));
    expect(paths(host)).toHaveLength(2);
    expect(document.activeElement).toBe(paths(host)[1]);
    const removes = host.querySelectorAll('[aria-label="Remove this folder"]');
    expect(removes).toHaveLength(2);
    await click(removes[0]);
    expect(paths(host).map((input) => input.value)).toEqual(['']);
  });
});

describe('Select folder', () => {
  it('Make this computer open the system dialog and fill the chosen path back into this field', async () => {
    const fetcher = fetchMock(200, { path: 'E:\\Movies' });
    vi.stubGlobal('fetch', fetcher);
    const host = await open();
    const pick = host.querySelector('[aria-label="Choose folder"]')!;
    await click(pick);
    await settle();
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(PICK_FOLDER_URL);
    expect(init?.method).toBe('POST');
    expect(sentBody(fetcher)).toEqual({ initial: 'D:\\Media' });
    expect(paths(host)[0]?.value).toBe('E:\\Movies');
    expect(pick.getAttribute('aria-busy'), 'Busy state must clear when the dialog closes').toBeNull();
  });

  it('Cancel changes nothing; if the dialog cannot open, the reason is written on this line', async () => {
    vi.stubGlobal('fetch', fetchMock(200, { path: null }));
    const host = await open();
    await click(host.querySelector('[aria-label="Choose folder"]'));
    await settle();
    expect(paths(host)[0]?.value).toBe('D:\\Media');
    expect(paths(host)[0]?.getAttribute('aria-invalid')).toBeNull();
    vi.stubGlobal('fetch', fetchMock(501, { error: 'No folder dialog is available on this system' }));
    await click(host.querySelector('[aria-label="Choose folder"]'));
    await settle();
    expect(rows(host)[0]?.textContent).toContain('No folder dialog is available');
    expect(paths(host)[0]?.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('Save', () => {
  it('If scanning and collection are running, confirm the impact of the restart first; cancel doesn\'t save; if the task state can\'t be read, save as usual', async () => {
    const fetcher = fetchMock(200, { saved: true, url: '/', revision: 'rev-2' });
    vi.stubGlobal('fetch', fetcher);
    try {
      processing.read.mockResolvedValue({ status: 'running', trigger: 'cli' });
      const host = await open();
      await submit(host.querySelector('form'));
      await settle();
      const dialog = document.querySelector('dialog');
      expect(dialog?.textContent).toContain('Started from the command line or tray, running in a separate process, unaffected by restart');
      await click(dialog!.querySelector('[data-modal-cancel]'));
      await settle();
      expect(fetcher).not.toHaveBeenCalled();
      processing.read.mockRejectedValue(new Error('Connection dropped'));
      await submit(host.querySelector('form'));
      await settle();
      expect(fetcher.mock.calls[0]?.[0]).toBe(CONFIGURATION_URL);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('Submitting carries the fingerprint, all folders, port, and whether to scan; success shows a receipt and keeps the new address', async () => {
    const fetcher = fetchMock(200, { saved: true, url: 'http://127.0.0.1:9124/', revision: 'rev-2' });
    vi.stubGlobal('fetch', fetcher);
    const receipt = vi.fn();
    const host = await open({}, receipt);
    expect(host.querySelector('#configPort')).toBeNull();
    await submit(host.querySelector('form'));
    await settle();
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe(CONFIGURATION_URL);
    expect(init?.method).toBe('POST');
    expect(sentBody(fetcher)).toEqual({ revision: 'rev-1', media_dirs: ['D:\\Media'], port: '9123', scan_now: false });
    expect(receipt).toHaveBeenCalledWith('Configuration saved');
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Configuration savedPeach is restarting. It will redirect shortly, or clickEnter the library。');
    expect(host.querySelector('a[href="http://127.0.0.1:9124/"]')?.textContent).toBe('Enter the library');
    expect(host.querySelector('form'), 'After saving the form leaves the page').toBeNull();
  });

  it('Server per-field rejection reasons write back in place without a receipt', async () => {
    vi.stubGlobal('fetch', fetchMock(400, {
      error: 'A few items need changes',
      errors: { media_dirs: ['', 'Duplicates the folder above'] },
    }));
    const receipt = vi.fn();
    const host = await open({ media_dirs: ['D:\\Media', 'D:\\Media'] }, receipt);
    await submit(host.querySelector('form'));
    await settle();
    expect(paths(host).map((input) => input.getAttribute('aria-invalid'))).toEqual([null, 'true']);
    expect(rows(host)[1]?.textContent).toContain('Duplicates the folder above');
    expect(host.querySelector('#configPort')).toBeNull();
    expect(receipt).not.toHaveBeenCalled();
    expect(host.textContent, 'Field-level reasons no longer stack a general note on top').not.toContain('Not saved');
  });

  it('Other failures stay in the form for retry', async () => {
    vi.stubGlobal('fetch', fetchMock(409, { error: 'The config changed, refresh before saving' }));
    const host = await open();
    await submit(host.querySelector('form'));
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Not savedThe current state does not allow this action; refresh and try again.');
    expect(host.querySelector('form')).not.toBeNull();
    expect(buttonNamed('Save configuration', host)?.getAttribute('aria-busy'), 'The busy state must clear after failure').toBeNull();
  });
});

it('CloudDrive recommends three tiers by disk; the page keeps only how to fill it in, with the rationale linked to the repository docs', async () => {
  const host = await mount(<CloudDriveGuide />);
  const tiers = host.querySelectorAll('[aria-label="Tier by drive holding the cache"] > li');
  expect(tiers).toHaveLength(3);
  expect([...tiers[0]!.querySelectorAll('dt')].map((dt) => dt.textContent))
    .toEqual(['Cache cap', 'Read length (default / min)', 'Process videos too']);
  expect(host.textContent).toContain('256 / 128 KB');
  expect(host.textContent).toContain('Do not set the limit to 0');
  expect(host.querySelector('details')?.open).toBe(false);
  expect([...host.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
    'https://www.clouddrive2.com/help.html',
    'https://github.com/peach-mitao/peach/blob/master/docs/CLOUDDRIVE.md',
  ]);
});

it('Collapse uses the shared Collapse: expanding grows to content height, collapsing returns the height to 0 and locks the body', async () => {
  vi.useFakeTimers();
  const host = await mount(<CloudDriveGuide />);
  const details = host.querySelector('details')!;
  const summary = details.querySelector('summary')!;
  const body = document.getElementById(summary.getAttribute('aria-controls')!)!;
  expect(body.parentElement).toBe(details);
  expect(body.inert).toBe(true);
  await click(summary);
  expect(details.open).toBe(true);
  expect(summary.getAttribute('aria-expanded')).toBe('true');
  expect(body.classList.contains('ui-fcollapse')).toBe(true);
  expect(body.inert).toBe(false);
  await act(async () => { vi.advanceTimersByTime(260); });
  expect(body.style.height).toBe('auto');
  await click(summary);
  expect(summary.getAttribute('aria-expanded')).toBe('false');
  expect(body.style.height).toBe('0px');
  expect(body.inert).toBe(true);
});
