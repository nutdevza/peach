import { act } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { ResourceSearch } from '../../src/react/activity/resource-search';
import { IndexerSettings } from '../../src/react/settings/indexer-settings';
import { SourceLink } from '../../src/react/follow-manage/source-view';
import { queryClient } from '../../src/react/query';
import { buttonNamed, click, mount, section, settle, submit, type } from './render';

afterEach(() => queryClient.clear());

it('Source name links to that source', async () => {
  const host = await mount(<SourceLink source={{ id: 1, provider: 'kemono', provider_label: 'Kemono',
    ref: 'fanbox/1', label: 'Demo author', url: 'https://example.com/author', enabled: true }} />);
  expect(host.textContent).toContain('Demo author');
  expect(host.querySelector('a')?.href).toBe('https://example.com/author');
});
const field = (host: HTMLElement, label: string) => [...host.querySelectorAll('label')]
  .find((node) => node.textContent?.trim() === label)?.closest('[data-input-size]')?.querySelector('input');
/** When an indexer expands, its fields are labeled just 'Name' and 'API key'; the screen-reader names carry which indexer it is. */
const named = (host: HTMLElement, label: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);

it('Enter queries by code, and picking a candidate only fills the form', async () => {
  const choose = vi.fn();
  const fetch = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ state: 'ready', warnings: ['One source did not respond'],
    error: '', items: [{ id: 'a', uri: 'magnet:?xt=urn:btih:' + 'a'.repeat(40), name: 'ABC-123 4K',
      size: 1024 ** 3, seeders: 2, origins: ['Test source'], resolution: 2160, codec: 'HEVC' }] }) }));
  vi.stubGlobal('fetch', fetch);
  const host = await mount(<ResourceSearch initialCode="ABC-123" choose={choose} />);
  await act(async () => field(host, 'Find resources by code')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await settle();
  expect(fetch.mock.calls[0]?.[0]).toContain('/api/resources/search?code=ABC-123&goal=quality');
  expect(host.textContent).toContain('One source did not respond');
  expect(host.textContent).toContain('Test source');
  await click(buttonNamed('Use this resource', host));
  expect(choose).toHaveBeenCalledWith('magnet:?xt=urn:btih:' + 'a'.repeat(40), 'ABC-123');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('Magnet link filled');
});

it('Details queries accept only matching codes; other videos\' fields never enter the resources popover', async () => {
  const onWork = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.startsWith('/api/items')
    ? { items: [{ id: 2, code: 'ABC-1234', name: 'Another video', duration: 600 }] }
    : { state: 'ready', warnings: [], error: '', items: [] } })));
  const host = await mount(<ResourceSearch initialCode="ABC-123" choose={vi.fn()} onWork={onWork} />);
  await act(async () => field(host, 'Find resources by code')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await settle();
  expect(onWork).toHaveBeenCalledWith(null);
});

it('Profiles with the same code keep the real cast, release date, and duration', async () => {
  const onWork = vi.fn();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.startsWith('/api/items')
    ? { items: [{ id: 3, code: 'ABC-123', catalog_title: 'Video title', performers: ['Alpha'], release_date: '2026-09-01', duration: 600, has_cover: true }] }
    : { state: 'ready', warnings: [], error: '', items: [] } })));
  const host = await mount(<ResourceSearch initialCode="ABC-123" choose={vi.fn()} onWork={onWork} />);
  await act(async () => field(host, 'Find resources by code')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await settle();
  expect(onWork).toHaveBeenCalledWith(expect.objectContaining({ code: 'ABC-123', title: 'Video title', performers: 'Alpha', release_date: '2026-09-01', duration: 600, cover: '/cover?code=ABC-123&thumb=1' }));
});

it('While a query waits the input keeps focus and repeat Enters are blocked; editing resumes on completion', async () => {
  let finish!: (value: unknown) => void;
  const fetch = vi.fn(() => new Promise((resolve) => { finish = resolve }));
  vi.stubGlobal('fetch', fetch);
  const host = await mount(<ResourceSearch initialCode="ABC-123" choose={vi.fn()} />);
  const input = field(host, 'Find resources by code')!;
  input.focus();
  const enter = () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await act(async () => { enter() });
  expect(input.disabled).toBe(false);
  expect(input.readOnly).toBe(true);
  expect(document.activeElement).toBe(input);
  expect(section(host, 'Find resources')?.getAttribute('aria-busy')).toBe('true');
  expect(host.textContent).toContain('Searching resources');
  await act(async () => { enter() });
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => finish({ ok: true, json: async () => ({ state: 'ready', items: [], warnings: [], error: '' }) }));
  await settle();
  expect(input.readOnly).toBe(false);
  expect(section(host, 'Find resources')?.getAttribute('aria-busy')).toBe('false');
  expect(host.textContent).not.toContain('Searching resources');
});

it.each([['Chinese subs', 'chinese'], ['Uncensored', 'uncensored'], ['No uncensored needed; only hunting full versions', 'quality']])(
  'Target %s original text visible, sorted by %s, waiting for Enter before querying', async (reason, goal) => {
    const fetch = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ state: 'ready',
      warnings: [], error: '', items: [] }) }));
    vi.stubGlobal('fetch', fetch);
    const host = await mount(<ResourceSearch initialCode="ABC-123" reason={reason} choose={vi.fn()} />);
    expect(host.textContent).toContain(`Edition target: ${reason}`);
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => field(host, 'Find resources by code')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await settle();
    expect(fetch.mock.calls[0]?.[0]).toContain(`goal=${goal}`);
  });

it('Saving settings clears the API key, and removal takes effect only after saving again', async () => {
  const initial = { max_indexers: 4, indexers: [{ key: 'one', name: 'Test source', url: 'http://indexer.test/api',
    enabled: true, api_key_set: true }] };
  const posts: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push(JSON.parse(String(init.body)));
    return { ok: true, json: async () => initial };
  }));
  const host = await mount(<QueryClientProvider client={queryClient}><IndexerSettings receipt={vi.fn()} /></QueryClientProvider>);
  // While waiting, the skeleton carries the same section title; what it waits for is the form itself.
  await vi.waitFor(async () => { await settle(); expect(host.querySelector('form[aria-label="Resource search"]')).not.toBeNull() });
  expect(host.textContent).toContain('Clear the saved API key');
  await type(named(host, 'Indexer 1 API key'), 'private-test-key');
  await submit(section(host, 'Resource search'));
  await settle();
  expect(posts).toHaveLength(1);
  expect(named(host, 'Indexer 1 API key')?.value).toBe('');
  await click(host.querySelector('button[aria-label="Remove indexer 1"]'));
  expect(posts).toHaveLength(1);
  await submit(section(host, 'Resource search'));
  expect(posts[1]).toEqual({ indexers: [] });
  // A newly added row is enabled by default: filling in the address is enough to search, no need to remember to check it.
  await click(buttonNamed('Add indexer', host));
  await submit(section(host, 'Resource search'));
  expect((posts[2] as { indexers: { enabled: boolean }[] }).indexers[0]?.enabled).toBe(true);
});
