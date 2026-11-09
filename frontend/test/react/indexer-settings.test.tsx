import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { queryClient } from '../../src/react/query';
import { IndexerSettings } from '../../src/react/settings/indexer-settings';
import { buttonNamed, click, mount, pending, settle, submit, type } from './render';

notifyManager.setScheduler(notify => notify());
it('The plain HTTP random source supports adding, editing, removing, and saving indexers', async () => {
  vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => ({
    ok: true, status: 200,
    json: async () => options?.body ? JSON.parse(String(options.body)) : { indexers: [], max_indexers: 4 },
  }));
  vi.stubGlobal('fetch', fetch);
  const host = await mount(<QueryClientProvider client={queryClient}><IndexerSettings receipt={vi.fn()} /></QueryClientProvider>);
  await settle();
  await click(buttonNamed('Add indexer', host));
  await click(buttonNamed('Add indexer', host));
  const names = host.querySelectorAll<HTMLInputElement>('input[type="text"]');
  await type(names[0], 'First');
  await type(names[1], 'Second');
  await type(host.querySelectorAll<HTMLInputElement>('input[type="url"]')[1], 'https://indexer.example/api');
  await click(host.querySelector('button[aria-label="Remove indexer 1"]'));
  await submit(host.querySelector('form'));
  const sent = JSON.parse(String(fetch.mock.calls.at(-1)?.[1]?.body));
  expect(sent.indexers).toHaveLength(1);
  expect(sent.indexers[0]).toMatchObject({ name: 'Second', url: 'https://indexer.example/api', enabled: true });
  expect(sent.indexers[0].key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
afterEach(() => queryClient.clear());
it('Entering resource search settings reads current values first, then creates the form draft', async () => {
  const row = { key: 'one', name: 'The cache\'s name', url: 'https://example.com/api', enabled: true, api_key_set: false };
  queryClient.setQueryData(['indexers'], { indexers: [row], max_indexers: 4 });
  const hold = pending<unknown>();
  vi.stubGlobal('fetch', vi.fn(() => hold.answer));
  const host = await mount(<QueryClientProvider client={queryClient}><IndexerSettings receipt={vi.fn()} /></QueryClientProvider>);
  expect(host.querySelector('form')).toBeNull();
  // While waiting, the section title still renders and the body is a skeleton; the status name goes only to assistive tech.
  expect(host.querySelector('section')?.getAttribute('aria-label')).toBe('Resource search');
  expect(host.querySelector('[data-skeleton][aria-busy="true"]')?.getAttribute('aria-label')).toBe('Reading resource search settings');
  await hold.release({ ok: true, status: 200, json: async () => ({ indexers: [{ ...row, name: 'The current name' }], max_indexers: 4 }) });
  await settle();
  expect(host.querySelector<HTMLInputElement>('input')?.value).toBe('The current name');
  expect(host.querySelector('[data-skeleton]')).toBeNull();
});

it('The skeleton draws the footer\'s two disabled keys per the terminal state, with indexer rows and expansion following the last read-back structure', async () => {
  const rows = [
    { key: 'one', name: 'Alpha', url: 'https://example.com/a', enabled: true, api_key_set: true },
    { key: 'two', name: '', url: '', enabled: true, api_key_set: false },
  ];
  const state = { indexers: rows, max_indexers: 4 };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => state })));
  const first = await mount(<QueryClientProvider client={queryClient}><IndexerSettings receipt={vi.fn()} /></QueryClientProvider>);
  await settle();
  expect(first.querySelector('form[aria-label="Resource search"]')).not.toBeNull();

  const hold = pending<unknown>();
  vi.stubGlobal('fetch', vi.fn(() => hold.answer));
  const host = await mount(<QueryClientProvider client={queryClient}><IndexerSettings receipt={vi.fn()} /></QueryClientProvider>);
  const skeleton = host.querySelector('[data-skeleton] section[aria-label="Resource search"]')!;
  const keys = [...skeleton.querySelectorAll<HTMLButtonElement>('button')];
  expect(keys.map((key) => [key.textContent, key.disabled])).toEqual([['Remove', true], ['Add indexer', true], ['Save configuration', true]]);
  // Two indexers, two rows; only the one still missing an address expands into the three-column input.
  expect(skeleton.querySelectorAll('.border-t.pt-2')).toHaveLength(2);
  expect([...skeleton.querySelectorAll('span.text-body-medium')].map((node) => node.textContent)).toEqual(['Name', 'Torznab address', 'API key']);
  await hold.release({ ok: true, status: 200, json: async () => state });
  await settle();
  expect(host.querySelector('[data-skeleton]')).toBeNull();
  localStorage.clear();
});
