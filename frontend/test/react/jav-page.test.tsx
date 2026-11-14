import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { queryClient } from '../../src/react/query';
import { JavPage } from '../../src/react/jav/jav-page';
import { JavHeader } from '../../src/react/jav/jav-header';
import { discoveryKey, prefetchJav } from '../../src/react/jav/jav';
import { WANTS_KEY } from '../../src/react/wants/wants';
import { actionOrder, buttonNamed, choose, click, mount, settle, type } from './render';

notifyManager.setScheduler(notify => notify());
afterEach(() => queryClient.clear());

/** The page header filter box is the roster page's IndexSearch: it waits 300 ms of idle before emitting text. */
async function search(host: ParentNode, text: string) {
  await type(host.querySelector('[data-index-search] input'), text);
  await act(() => new Promise(resolve => { setTimeout(resolve, 320) }));
}

it('Existing results present immediately, with stale recommendations refreshing in the background', async () => {
  const cached = { items: [{ id: 1, code: 'ABC-001' }], candidate_total: 1, limited: false };
  queryClient.setQueryData(discoveryKey('external'), cached, { updatedAt: Date.now() - 60_000 });
  let finish!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { finish = resolve })));
  const loaded = prefetchJav('discover', new AbortController().signal);
  const result = await Promise.race([loaded.then(() => 'ready'), new Promise(resolve => setTimeout(() => resolve('waiting'), 40))]);
  expect(result).toBe('ready');
  expect(queryClient.getQueryData(discoveryKey('external'))).toEqual(cached);
  finish({ ok: true, status: 200, json: async () => cached } as Response);
  await loaded;
});

it('An existing want list returns immediately, with stale data refreshing in the background', async () => {
  const cached = { items: [], counts: {}, scraping: false };
  queryClient.setQueryData(WANTS_KEY, cached, { updatedAt: Date.now() - 60_000 });
  let finish!: (response: Response) => void;
  const request = new Promise<Response>(resolve => { finish = resolve });
  const fetcher = vi.fn(() => request);
  vi.stubGlobal('fetch', fetcher);
  await prefetchJav('wants', new AbortController().signal);
  expect(queryClient.getQueryData(WANTS_KEY)).toEqual(cached);
  expect(fetcher).toHaveBeenCalledOnce();
  finish({ ok: true, status: 200, json: async () => cached } as Response);
  await settle();
  await prefetchJav('wants', new AbortController().signal);
  expect(fetcher).toHaveBeenCalledOnce();
});

it('The JAV section navigation shows Library, Wanted, New releases, Discovery in order; the library uses catalog search', async () => {
  const navigate = vi.fn(), find = vi.fn();
  const host = await mount(<JavHeader tab="library" navigate={navigate} find={find} />);
  const tabs = [...host.querySelectorAll('[role="tab"]')];
  expect(tabs.map(tab => tab.textContent?.trim())).toEqual(['Library', 'Want', 'New work', 'Discover']);
  expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
  expect(host.querySelector('input')).toBeNull();
  await click(tabs[1]);
  expect(navigate).toHaveBeenLastCalledWith('/jav?tab=wants');
  await click(tabs[2]);
  expect(navigate).toHaveBeenLastCalledWith('/jav?tab=releases');
  await click(tabs[3]);
  expect(navigate).toHaveBeenLastCalledWith('/jav?tab=discover');
  await click(buttonNamed('Find resources', host));
  expect(find).toHaveBeenCalledOnce();
});

it('Returning to the library from wants opens the JAV catalog', async () => {
  const navigate = vi.fn();
  const host = await mount(<JavHeader tab="wants" navigate={navigate} find={vi.fn()} />);
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent?.trim()).toBe('Want');
  await click(host.querySelector('[role="tab"]'));
  expect(navigate).toHaveBeenCalledWith('/?jav=1');
});

it('Discovery reads by scope, clearing text and tags restores the list, and cards open their details', async () => {
  const navigate = vi.fn();
  const common = { title: 'Example video', performers: 'Performers', studio: 'Labels', has_cover: false,
    release_date: '2010-01-01', wanted: false, reasons: ['Frequently watched label: Label'] };
  const fetcher = vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({
    items: url.includes('scope=library') ? [{ ...common, id: 22, asset_id: 22, code: 'ABC-022', tags: ['Foot fetish'] }]
      : [{ ...common, id: 1, code: 'ABC-001', score: 1, tags: ['Foot fetish'], link: 'https://example.test/work' },
        { ...common, id: 2, code: 'ABC-002', score: 2, tags: ['Drama'] }],
  }) }));
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<QueryClientProvider client={queryClient}><JavPage tab="discover" readOnly navigate={navigate} receipt={vi.fn()} /></QueryClientProvider>);
  await settle();
  expect(host.querySelectorAll('[data-jav-card]')).toHaveLength(2);
  expect(actionOrder(host.querySelector('[data-jav-card] [data-jav-actions]'))).toEqual(['Video sources', 'Want', 'Find resources']);
  expect(host.querySelector('[data-jav-card] h3')?.textContent).toContain('ABC-001');
  await click(host.querySelector('[data-jav-card] [data-media-tag]'));
  expect(host.querySelectorAll('[data-jav-card]')).toHaveLength(1);
  await click(buttonNamed('Clear filters', host));
  expect(host.querySelectorAll('[data-jav-card]')).toHaveLength(2);
  await search(host, 'ABC-001');
  expect(host.querySelectorAll('[data-jav-card]')).toHaveLength(1);
  await search(host, '');
  expect(host.querySelectorAll('[data-jav-card]')).toHaveLength(2);
  await click(host.querySelector('[data-jav-card] h3'));
  expect(navigate).toHaveBeenLastCalledWith('/works/ABC-001');
  await click(buttonNamed('Library explore', host));
  await settle();
  expect(fetcher.mock.calls.some(([url]) => url.includes('scope=library'))).toBe(true);
  await click(host.querySelector('[data-jav-card] h3'));
  expect(navigate).toHaveBeenLastCalledWith('/assets/22');
  expect(buttonNamed('In library', host)?.disabled).toBe(true);
});

it('In the New Releases section, actresses, labels, and tags list only the subscription-new filter options the API provides; clicking filters within this section and returns to page 1', async () => {
  const before = location.pathname + location.search;
  history.replaceState(null, '', '/jav?tab=releases&page=2');
  const facets = { performers: [{ name: 'Performer A', count: 2, id: 7, has_image: false }],
    studios: [{ name: 'Studio A', count: 1, has_logo: false }], tags: [{ name: 'Intercourse', count: 1 }] };
  const fetcher = vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({
    items: [{ id: 1, code: 'ABC-001', title: 'Example video', performers: 'Performer A', studio: 'Studio A', has_cover: false,
      release_date: '2026-11-10', wanted: false, tags: ['Intercourse'] }],
    total: 30, candidate_total: 30, page: Number(new URL(url, location.origin).searchParams.get('page')), size: 24, facets }) }));
  vi.stubGlobal('fetch', fetcher);
  const navigate = vi.fn();
  const host = await mount(<QueryClientProvider client={queryClient}><JavPage tab="releases" readOnly navigate={navigate} receipt={vi.fn()} /></QueryClientProvider>);
  await settle();
  const asked = () => new URL(String(fetcher.mock.calls.at(-1)?.[0]), location.origin).searchParams;
  expect(asked().get('page')).toBe('2');
  expect([...host.querySelectorAll('[data-tier-performer]')].map(node => node.textContent)).toEqual(['PPerformer A']);
  expect([...host.querySelectorAll('[data-tier-studio]')].map(node => node.textContent)).toEqual(['StStudio A1']);
  expect([...host.querySelectorAll('[data-catalog-tag]')].map(node => node.textContent)).toEqual(['Intercourse1']);
  expect(host.querySelector('nav[aria-label="New releases pagination"] [aria-current="page"]')?.textContent).toBe('2');
  await click(host.querySelector('[data-tier-performer]'));
  await settle();
  expect([asked().get('performer'), asked().get('page')]).toEqual(['Performer A', '1']);
  expect(new URLSearchParams(location.search).get('performer')).toBe('Performer A');
  expect(host.querySelector('[data-tier-performer]')?.getAttribute('aria-pressed')).toBe('true');
  await click(host.querySelector('[data-jav-card] h3'));
  expect(navigate).toHaveBeenLastCalledWith('/works/ABC-001');
  history.replaceState(null, '', before);
});

it('New-releases pagination fetches by the per-page size in the address; switching size returns to the first screen and keeps filters', async () => {
  const before = location.pathname + location.search;
  history.replaceState(null, '', '/jav?tab=releases&page=2&size=10&tag=剧情');
  const items = Array.from({ length: 55 }, (_, index) => ({ id: index + 1, code: `ABC-${index + 1}`,
    title: 'Example video', performers: '', studio: '', has_cover: false, release_date: '2026-11-10', wanted: false }));
  const fetcher = vi.fn(async (url: string) => {
    const params = new URL(url, location.origin).searchParams;
    const page = Number(params.get('page')), size = Number(params.get('size'));
    return { ok: true, status: 200, json: async () => ({ items: items.slice((page - 1) * size, page * size),
      total: items.length, candidate_total: items.length, page, size,
      facets: { performers: [], studios: [], tags: [] } }) };
  });
  vi.stubGlobal('fetch', fetcher);
  try {
    const host = await mount(<QueryClientProvider client={queryClient}><JavPage tab="releases" readOnly navigate={vi.fn()} receipt={vi.fn()} /></QueryClientProvider>);
    host.querySelector<HTMLElement>('section[aria-label="Subscribe to new releases"]')!.scrollIntoView = vi.fn();
    await settle();
    expect(host.querySelectorAll('[data-jav-card]')).toHaveLength(10);
    expect(host.querySelector('[data-table-pagination]')?.textContent).toContain('11–20 / 55 videos');
    await choose(host.querySelector('button[aria-label="Rows per page"]'), '50 videos per page');
    await settle();
    expect(host.querySelectorAll('[data-jav-card]')).toHaveLength(50);
    const asked = new URL(String(fetcher.mock.calls.at(-1)?.[0]), location.origin).searchParams;
    expect([asked.get('page'), asked.get('size'), asked.get('tag')]).toEqual(['1', '50', '剧情']);
    expect(new URLSearchParams(location.search).get('size')).toBe('50');
    expect(new URLSearchParams(location.search).has('page')).toBe(false);
  } finally { history.replaceState(null, '', before) }
});

it('An empty new-releases list keeps the per-page size control; an out-of-range page returns to the first page automatically', async () => {
  const before = location.pathname + location.search;
  history.replaceState(null, '', '/jav?tab=releases&page=99');
  const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => ({
    items: [], total: 0, candidate_total: 0, page: 1, size: 24, facets: { performers: [], studios: [], tags: [] },
  }) }));
  vi.stubGlobal('fetch', fetcher);
  try {
    const host = await mount(<QueryClientProvider client={queryClient}><JavPage tab="releases" readOnly navigate={vi.fn()} receipt={vi.fn()} /></QueryClientProvider>);
    host.querySelector<HTMLElement>('section[aria-label="Subscribe to new releases"]')!.scrollIntoView = vi.fn();
    await settle();
    expect(host.textContent).toContain('No new works not yet indexed');
    expect(host.querySelector('[data-table-pagination]')?.textContent).toContain('0–0 / 0 videos');
    expect(new URLSearchParams(location.search).has('page')).toBe(false);
    await choose(host.querySelector('button[aria-label="Rows per page"]'), '20 videos per page');
    await settle();
    const asked = new URL(String(fetcher.mock.calls.at(-1)?.[0]), location.origin).searchParams;
    expect([asked.get('page'), asked.get('size')]).toEqual(['1', '20']);
  } finally { history.replaceState(null, '', before) }
});

it('Switching the New Releases section to list view: Works, Artists, and Labels each occupy a column; clicking the header sorts by duration', async () => {
  const before = location.pathname + location.search;
  history.replaceState(null, '', '/jav?tab=releases');
  localStorage.setItem('peach.catalog-view.v1', 'list');
  const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => ({
    items: [{ id: 1, code: 'ABC-001', title: 'Example video', performers: 'Performer A', studio: 'Studio A', has_cover: false, release_date: '2026-11-10',
      wanted: false, tags: ['Intercourse'], duration: 7200, source_score: 4.5, performer_refs: [{ id: 7, name: 'Performer A', has_image: false }] }],
    total: 1, candidate_total: 1, page: 1, size: 24,
    facets: { performers: [], studios: [{ name: 'Studio A', count: 1, has_logo: false }], tags: [] } }) }));
  vi.stubGlobal('fetch', fetcher);
  try {
    const navigate = vi.fn();
    const host = await mount(<QueryClientProvider client={queryClient}><JavPage tab="releases" readOnly navigate={navigate} receipt={vi.fn()} /></QueryClientProvider>);
    await settle();
    expect(host.querySelector('[data-jav-card]')).toBeNull();
    const row = host.querySelector('[data-release-row]')!;
    expect(row.querySelector('[data-list-identity] [data-media-avatar]')).toBeNull();
    expect(row.querySelector('[data-list-people] [data-media-avatar]')).not.toBeNull();
    expect(row.querySelector('[data-list-people]')?.textContent).toContain('Performer A');
    expect(row.querySelector('[data-list-library]')?.textContent).toBe('SStudio A');
    await click(host.querySelector('[role="columnheader"][data-key="dur"]'));
    await settle();
    const asked = new URL(String(fetcher.mock.calls.at(-1)?.[0]), location.origin).searchParams;
    expect(asked.get('sort')).toBe('duration');
    await click(row.querySelector('[data-list-name]'));
    expect(navigate).toHaveBeenLastCalledWith('/works/ABC-001');
  } finally {
    localStorage.removeItem('peach.catalog-view.v1');
    history.replaceState(null, '', before);
    vi.unstubAllGlobals();
  }
});

it('The New Releases section defaults to descending by release time; clicking a sort key flips its direction, and New batch reshuffles with a new seed without pressing a sort key', async () => {
  const before = location.pathname + location.search;
  history.replaceState(null, '', '/jav?tab=releases');
  const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => ({ items: [], total: 0, candidate_total: 0, page: 1, size: 24,
    facets: { performers: [], studios: [], tags: [] } }) }));
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<QueryClientProvider client={queryClient}><JavPage tab="releases" readOnly navigate={vi.fn()} receipt={vi.fn()} /></QueryClientProvider>);
  await settle();
  const asked = () => new URL(String(fetcher.mock.calls.at(-1)?.[0]), location.origin).searchParams;
  expect([...host.querySelectorAll('[data-entity-sort]')].map(node => node.textContent)).toEqual(['Release date', 'Source rating', 'Duration', 'Code', 'Taste']);
  expect([asked().get('sort'), asked().get('direction')]).toEqual(['release_date', 'desc']);
  await click(host.querySelector('[data-entity-sort="source_score"]'));
  await settle();
  expect([asked().get('sort'), asked().get('direction')]).toEqual(['source_score', 'desc']);
  await click(host.querySelector('[data-entity-sort="source_score"]'));
  await settle();
  expect([asked().get('sort'), asked().get('direction')]).toEqual(['source_score', 'asc']);
  await click(host.querySelector('[data-entity-batch]'));
  await settle();
  expect(asked().get('sort')).toBe('random');
  expect(asked().get('seed')).toBeTruthy();
  expect(host.querySelector('[data-entity-sort][aria-pressed="true"]')).toBeNull();
  history.replaceState(null, '', before);
});

it('Without recommendations the empty state\'s view-taste sits left and the main entry right', async () => {
  const before = location.pathname + location.search;
  history.replaceState(null, '', '/jav?tab=discover');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) })));
  const host = await mount(<QueryClientProvider client={queryClient}><JavPage tab="discover" readOnly navigate={vi.fn()} receipt={vi.fn()} /></QueryClientProvider>);
  await settle();
  expect(actionOrder(host.querySelector('[data-empty-state]'))).toEqual(['View taste', 'Find videos']);
  const main = [...host.querySelectorAll('[data-empty-state] a, [data-empty-state] button')].find((node) => node.textContent === 'Find videos');
  expect(main?.className).toContain('bg-button-primary');
  history.replaceState(null, '', before);
});

it('The new-releases list is read-only: entries never profiled are read once via POST, progress polls separately, and the list refetches only after reading finishes', async () => {
  const before = location.pathname + location.search;
  history.replaceState(null, '', '/jav?tab=releases&performer=女优甲');
  const job = (status: string, completed: number) => ({ metadata_job: { job_id: 'm', status, completed, total: 2,
    failed: 0, requests: 0, bytes: 0 }, poll_after_ms: 1000 });
  let polls = 0;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url, location.origin).pathname;
    const body = path === '/api/jav/releases/metadata' ? job('running', 0)
      : path === '/api/jav/discoveries/metadata' ? (polls += 1, polls > 1 ? job('complete', 2) : job('running', 1))
        : { items: [], total: 0, candidate_total: 0, page: 1, size: 24, metadata_unread: 2,
          facets: { performers: [], studios: [], tags: [] } };
    void init;
    return { ok: true, status: 200, json: async () => body } as Response;
  });
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<QueryClientProvider client={queryClient}><JavPage tab="releases" readOnly navigate={vi.fn()} receipt={vi.fn()} /></QueryClientProvider>);
  await settle();
  const calls = (path: string) => fetcher.mock.calls.filter(([url]) => new URL(url, location.origin).pathname === path);
  const started = calls('/api/jav/releases/metadata');
  expect(started).toHaveLength(1);
  expect(JSON.parse(String(started[0]?.[1]?.body))).toMatchObject({ action: 'start', performer: '女优甲', sort: 'release_date' });
  expect(host.querySelector('[data-jav-metadata] [role="progressbar"]')).not.toBeNull();
  await act(() => new Promise(resolve => { setTimeout(resolve, 2300) }));
  await settle();
  expect(calls('/api/jav/discoveries/metadata').length).toBeGreaterThanOrEqual(2);
  const listed = calls('/api/jav/releases');
  expect(listed).toHaveLength(2);
  expect(listed.every(([url]) => !String(url).includes('metadata_job_id'))).toBe(true);
  expect(calls('/api/jav/releases/metadata')).toHaveLength(1);
  history.replaceState(null, '', before);
}, 10_000);

it('The discover page keeps work-detail loading progress in its own box', async () => {
  history.replaceState(null, '', '/jav?tab=discover');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [], candidate_total: 0, limited: false,
    metadata_job: { job_id: 'm', status: 'running', completed: 37, total: 100, failed: 0, requests: 0, bytes: 0 } }) })));
  const host = await mount(<QueryClientProvider client={queryClient}><JavPage tab="discover" readOnly navigate={vi.fn()} receipt={vi.fn()} /></QueryClientProvider>);
  await settle();
  const progress = host.querySelector('[data-task-progress]');
  expect(progress?.getAttribute('data-task-progress')).toBe('framed');
  expect(progress?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('37');
});
