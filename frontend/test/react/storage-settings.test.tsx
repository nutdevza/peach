/* "Storage space": check several categories to clean together or clean all, stating the reason for what cannot be cleaned; progress is reported by the last file count during statistics;
 * container deployments give the migration steps on the host machine. */
import { expect, it, vi } from 'vitest';
import * as legacyUi from '@peach/legacy/ui';

import type { StorageCategory, StorageState } from '../../src/react/bundle';
import { StorageSettings } from '../../src/react/settings/storage-settings';
import { buttonNamed, click, fetchMock, mount, sentBody, settle, submit, type } from './render';

const category = (key: string, label: string, bytes: number, reclaimable: number, cleanable: boolean,
                  note: string): StorageCategory =>
  ({ key, label, description: `What is ${label}`, note, cleanable, bytes, files: 1, reclaimable });

const measured: StorageState = {
  data_root: 'C:\\peach-data', free_bytes: 100 * 2 ** 30, total_bytes: 1000 * 2 ** 30, system_drive: true,
  usage: {
    measured_at: 1_790_000_000, total_bytes: 6 * 2 ** 30, total_files: 300,
    categories: [
      category('database', 'Database', 2 ** 30, 0, false, 'All of Peach\'s data lives here'),
      category('backups', 'Database backup', 2 ** 30, 2 ** 29, true, 'Older ones can never be restored'),
      category('playback', 'Playback cache', 2 ** 30, 2 ** 30, true, 'Re-transcode when played again'),
      category('previews', 'Preview image', 2 ** 30, 0, false, 'Rebuilding would re-read the whole video'),
      category('logs', 'Logs', 2 ** 20, 0, true, 'Only clean archived logs'),
    ],
  },
  job: { state: 'idle', message: '' },
  relocation: { available: true, message: '', last: null },
};

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

const box = (host: HTMLElement, key: string) =>
  host.querySelector<HTMLInputElement>(`[data-category="${key}"] input[type="checkbox"]`)!;

it('Opening the maintenance page the first time measures automatically; with results already present it reuses them', async () => {
  const fetcher = fetchMock(200, measured);
  vi.stubGlobal('fetch', fetcher);
  await mount(<StorageSettings initial={{ ...measured, usage: null }} receipt={vi.fn()} />);
  await settle();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/configuration/storage/measure');
  await mount(<StorageSettings initial={measured} receipt={vi.fn()} />);
  await settle();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('The read-only tutorial passing through the maintenance page starts no usage measurement; normal visits still measure', async () => {
  const fetcher = fetchMock(200, measured);
  vi.stubGlobal('fetch', fetcher);
  document.body.classList.add('peach-guiding');
  try {
    await mount(<StorageSettings initial={{ ...measured, usage: null }} receipt={vi.fn()} />);
    await settle();
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    document.body.classList.remove('peach-guiding');
  }
  await mount(<StorageSettings initial={{ ...measured, usage: null }} receipt={vi.fn()} />);
  await settle();
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/configuration/storage/measure');
});

it('Uncleanable checkboxes are disabled with the reason stated; checking clears those categories together, and clear all sends only the cleanable ones', async () => {
  const seen = confirmWith(true);
  const fetcher = fetchMock(200, { ...measured, job: { state: 'cleaning', category: 'playback', message: '' } });
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<StorageSettings initial={measured} receipt={vi.fn()} />);

  expect(box(host, 'database').disabled).toBe(true);
  expect(host.querySelector('[data-category="previews"]')!.textContent).toContain('Preview imageWhat is Preview imageCannot clean: Rebuilding would re-read the whole video1.0 GB');
  expect(box(host, 'logs').disabled).toBe(true);
  expect(host.querySelector('[data-category="logs"]')!.textContent).toContain('No files to clean up');
  expect(host.querySelector('[data-category="playback"]')!.textContent).toContain('Playback cacheWhat is Playback cacheAfter cleanup, Re-transcode when played again1.0 GBReleasable 1.0 GB');
  expect(buttonNamed('Clean selected', host)!.disabled).toBe(true);

  await click(box(host, 'playback'));
  expect(host.textContent).toContain('1 category selected, 1.0 GB reclaimable');
  await click(buttonNamed('Clean selected', host));
  await settle();
  expect(seen[0]!.danger).toBe(false);
  expect(sentBody(fetcher)).toEqual({ categories: ['playback'] });

  vi.stubGlobal('fetch', fetchMock(200, measured));
  const again = await mount(<StorageSettings initial={measured} receipt={vi.fn()} />);
  const all = fetchMock(200, measured);
  vi.stubGlobal('fetch', all);
  await click(buttonNamed('Clean all', again));
  await settle();
  // When a backup is inside, the confirm dialog uses the danger style; the body spells out per category what cleanup does.
  expect(seen[1]!.danger).toBe(true);
  expect(String(seen[1]!.body)).toContain('Database backup 512 MB (Older ones can never be restored after cleanup)');
  expect(sentBody(all)).toEqual({ categories: ['backups', 'playback'] });
});

it('Stats draw progress from the last file count, and readings show files and bytes covered', async () => {
  vi.stubGlobal('fetch', fetchMock(200, measured));
  const measuring: StorageState = {
    ...measured, job: { state: 'measuring', message: '', files: 120, bytes: 2 ** 30, expected_files: 300 },
  };
  const host = await mount(<StorageSettings initial={measuring} receipt={vi.fn()} />);
  const bar = host.querySelector('[role="progressbar"]')!;
  expect([bar.getAttribute('aria-valuenow'), bar.getAttribute('aria-valuemax')]).toEqual(['120', '300']);
  expect(host.textContent).toContain('Measured 120 files · 1.0 GB, last time 300 items');
  expect(buttonNamed('Clean all', host)!.disabled).toBe(true);
});

it('Container deployments offer no location change; list the steps to migrate on the host machine', async () => {
  vi.stubGlobal('fetch', fetchMock(200, measured));
  const docker: StorageState = {
    ...measured,
    relocation: {
      available: false, message: 'The container\'s data directory is a volume on the host', last: null,
      steps: [{ text: 'Stop Peach', command: 'docker compose down' }, { text: 'Restart', command: 'docker compose up -d' }],
    },
  };
  const host = await mount(<StorageSettings initial={docker} receipt={vi.fn()} />);
  expect(buttonNamed('Change location', host)!.disabled).toBe(true);
  const steps = host.querySelector('ol[aria-label="Migrate on the host machine"]')!;
  expect([...steps.querySelectorAll('code')].map((node) => node.textContent))
    .toEqual(['docker compose down', 'docker compose up -d']);
});

it('Capacity fields carry the GiB unit, saves integer limits and leaves-empty means no limit, and keeps the share and category cleanup', async () => {
  const policy = { enabled: true, minimum_free_gib: 0, data_max_gib: 0, cache_max_gib: 0, auto_clean: true,
    external_cache_path: '/cache', external_cache_max_gib: 0 };
  const storage = { ...measured, budget: { policy, last_check: null, error: '' } };
  const fetcher = fetchMock(200, storage);
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<StorageSettings initial={storage} receipt={vi.fn()} />);
  const field = host.querySelector<HTMLInputElement>('input[aria-label="Peach data limit (GiB)"]');
  expect(field?.value).toBe('');
  expect([...host.querySelectorAll('[aria-hidden="true"]')].filter(node => node.textContent === 'GiB')).toHaveLength(4);
  expect(host.querySelector('[data-storage-result]')).not.toBeNull();
  expect(buttonNamed('Clean selected', host)).not.toBeNull();
  await type(field, '80');
  await submit(host.querySelector('#storageBudgetSettings'));
  await settle();
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/configuration/storage/policy');
  expect(sentBody(fetcher)).toEqual({ ...policy, data_max_gib: 80 });
});

it('Turning capacity protection off hides the limits and saves the switch; turning it on again keeps the original settings', async () => {
  const policy = { enabled: true, minimum_free_gib: 8, data_max_gib: 80, cache_max_gib: 20,
    auto_clean: true, external_cache_path: '/cache', external_cache_max_gib: 100 };
  const storage = { ...measured, budget: { policy, last_check: null, error: '' } };
  const fetcher = fetchMock(200, storage);
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<StorageSettings initial={storage} receipt={vi.fn()} />);
  await click(host.querySelector('[aria-label="Enable capacity protection"]'));
  expect(host.querySelector('input[aria-label="Peach data limit (GiB)"]')).toBeNull();
  await submit(host.querySelector('#storageBudgetSettings'));
  await settle();
  expect(sentBody(fetcher)).toEqual({ ...policy, enabled: false });
  await click(host.querySelector('[aria-label="Enable capacity protection"]'));
  expect(host.querySelector<HTMLInputElement>('input[aria-label="Peach data limit (GiB)"]')?.value).toBe('80');
});

it('An empty directory reads CloudDrive automatically; filling the form and saving writes the setting', async () => {
  const policy = { enabled: true, minimum_free_gib: 0, data_max_gib: 0, cache_max_gib: 0,
    auto_clean: true, external_cache_path: '', external_cache_max_gib: 0 };
  const storage = { ...measured, budget: { policy, last_check: null, error: '' } };
  const fetcher = vi.fn(async (path: string, _options?: RequestInit) => ({ ok: true, json: async () =>
    path.endsWith('/external-cache') ? { path: '/detected-cache' } : storage }));
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<StorageSettings initial={storage} receipt={vi.fn()} />);
  await settle();
  const directory = [...host.querySelectorAll('input')].find(input =>
    [...(input.labels ?? [])].some(label => label.textContent === 'External cache directory'));
  expect(directory?.value).toBe('/detected-cache');
  expect(fetcher).toHaveBeenCalledTimes(1);
  await submit(host.querySelector('#storageBudgetSettings'));
  await settle();
  expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({ ...policy, external_cache_path: '/detected-cache' });
});
