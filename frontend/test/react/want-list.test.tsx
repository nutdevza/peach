/* The "Wants" tab of follows management: how the four sections split, add-by-code, what remove and re-search send, and disabled while read-only.
 *
 * Reconciliation, search counts, and release-date judgment live on the server (`tests/test_wants.py`, `tests/test_wants_web.py`); here we only watch
 * how the tab paints from responses and how writes are sent. */
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { queryClient } from '../../src/react/query';
import { WANT_PAGE_SIZE, WantList } from '../../src/react/wants/want-list';
import type { Want, WantsData } from '../../src/react/wants/wants';
import { actionOrder, buttonNamed, choose, click, mount, settle, type } from './render';

afterEach(() => { queryClient.clear(); localStorage.clear() });
notifyManager.setScheduler((notify) => notify());

const want = (id: number, extra: Partial<Want> = {}): Want => ({
  id, code: `ABC-${id}`, origin: 'code', title: null, link: null, release_date: '2025-01-01', studio: null,
  performers: null, phase: 'searching', fresh: false, search_count: 0, last_search_at: null,
  last_search_outcome: null, given_up_at: null, acquired_asset_id: null, acquired_at: null, follow_item_id: null,
  follow_provider: null, cover: null, remote_cover: false, scraped: true, scrape_error: null,
  created_at: '2026-09-30 10:00:00', ...extra,
});

const listed = (items: Want[]): WantsData => ({
  items, scraping: false,
  counts: { searching: 0, unreleased: 0, given_up: 0, acquired: 0 },
});

/** Fake server: the manifest returns the given copies per round; write endpoints always succeed. */
function serve(...rounds: WantsData[]) {
  let round = 0;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/downloads')) return { ok: true, status: 200,
      json: async () => ({ available: true, providers: [], tasks: [] }) };
    if (url.startsWith('/api/wants/magnets')) return { ok: true, status: 200,
      json: async () => ({ state: 'ready', items: [], error: '', checked_at: null }) };
    if (init?.method === 'POST') {
      return { ok: true, status: 200, json: async () => ({ created: true, want: want(99, { code: 'SSIS-950' }) }) };
    }
    const body = rounds[Math.min(round, rounds.length - 1)];
    round += 1;
    return { ok: true, status: 200, json: async () => structuredClone(body) };
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
const posts = (fetcher: ReturnType<typeof serve>) => fetcher.mock.calls
  .filter(([, init]) => init?.method === 'POST').map(([url, init]) => [url, JSON.parse(String(init!.body))]);
const reads = (fetcher: ReturnType<typeof serve>) => fetcher.mock.calls.filter(([url, init]) => url === '/api/wants' && init?.method !== 'POST');

async function open(readOnly = false) {
  const toast = vi.fn();
  const host = await mount(
    <QueryClientProvider client={queryClient}>
      <WantList readOnly={readOnly} toast={toast} />
    </QueryClientProvider>);
  await settle();
  return { host, toast };
}

it('Segmented by To find, Not yet released, Paused, and Added to library with counts in segment names; only the Paused one can be searched again', async () => {
  serve(listed([
    want(1, { phase: 'acquired', acquired_at: '2026-09-30 12:00:00' }),
    want(2), want(3, { phase: 'given_up', search_count: 3 }),
    want(4, { phase: 'unreleased', release_date: '2026-12-01' }), want(5, { fresh: true }),
  ]));
  const { host } = await open();
  const sections = [...host.querySelectorAll<HTMLElement>('section[data-want-phase]')];
  expect(sections.map((one) => [one.dataset.wantPhase, one.querySelector('h3')?.textContent]))
    .toEqual([['searching', 'To find 2'], ['unreleased', 'Unreleased 1'], ['given_up', 'Give up for now 1'], ['acquired', 'In library 1']]);
  const note = (id: number) => host.querySelector(`[data-want-id="${id}"] [data-want-note]`)?.textContent;
  expect([note(2), note(5), note(4), note(3), note(1)]).toEqual([
    undefined, undefined, 'Released 2026-12-01', undefined, 'Added 2026-09-30',
  ]);
  expect(buttonNamed('Search again', host.querySelector('[data-want-id="3"]')!)).not.toBeNull();
  expect(buttonNamed('Search again', host.querySelector('[data-want-id="2"]')!)).toBeNull();
  expect(actionOrder(buttonNamed('Search again', host.querySelector('[data-want-id="3"]')!)!.parentElement))
    .toEqual(['Source page', 'Remove', 'Search again', 'Find resources']);
});

it('The To find and Paused sections have a find resources action on every row, opening the cloud download popover in place with the code and title; Not released and In library do not', async () => {
  serve(listed([
    want(2, { title: '雨の日' }), want(3, { phase: 'given_up', search_count: 3 }),
    want(4, { phase: 'unreleased', release_date: '2026-12-01' }), want(1, { phase: 'acquired' }),
    want(6, { code: null, origin: 'follow', title: 'One entry among follows', follow_item_id: 9 }),
  ]));
  const { host } = await open();
  const key = (id: number) => buttonNamed('Find resources', host.querySelector(`[data-want-id="${id}"]`)!);
  expect([2, 3, 4, 1, 6].map((id) => !!key(id))).toEqual([true, true, false, false, true]);
  expect(key(2)!.className).toContain('bg-background-primary-default');
  await click(key(2));
  await settle();
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('ABC-2 · 雨の日');
});

it('With none at all it is an empty state with no empty segments painted', async () => {
  serve(listed([]));
  const { host } = await open();
  expect(host.textContent).toContain('No wanted videos yet');
  expect(host.querySelector('section[data-want-phase]')).toBeNull();
});

it('Wanted items toggle by existing magnet link status; toggling sends no query and resets pagination', async () => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  const fetcher = serve(listed(Array.from({ length: WANT_PAGE_SIZE + 3 }, (_, index) =>
    want(index + 1, { has_magnets: index < 2 }))));
  const { host } = await open();
  const calls = fetcher.mock.calls.length;
  await click(buttonNamed('Next page', host));
  await click(host.querySelector('input[value="available"]'));
  await settle();
  expect([...host.querySelectorAll('[data-want-id]')].map(node => node.getAttribute('data-want-id'))).toEqual(['1', '2']);
  await click(host.querySelector('input[value="missing"]'));
  await settle();
  expect(host.querySelector('[data-want-id]')?.getAttribute('data-want-id')).toBe('3');
  expect(host.querySelectorAll('[data-want-id]').length).toBe(WANT_PAGE_SIZE);
  expect(fetcher.mock.calls.length).toBe(calls);
});

it('The add key is a blue primary button: disabled-primary while the input is empty, clickable once a code is entered', async () => {
  serve(listed([]));
  const { host } = await open();
  const addKey = () => buttonNamed('Add', host)!;
  expect([addKey().classList.contains('bg-button-primary'), addKey().disabled]).toEqual([true, true]);
  await type(host.querySelector<HTMLInputElement>('input[aria-label="code"]'), 'SSIS-950');
  await settle();
  expect([addKey().classList.contains('bg-button-primary'), addKey().disabled]).toEqual([true, false]);
});

it('Add by code: Enter sends, the receipt names the code, the input clears, and the list refetches', async () => {
  const fetcher = serve(listed([]), listed([want(99, { code: 'SSIS-950' })]));
  const { host, toast } = await open();
  const input = host.querySelector<HTMLInputElement>('input[aria-label="code"]')!;
  await type(input, ' ssis-950 ');
  await settle();
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await vi.waitFor(async () => {
    await settle();
    expect(host.querySelector('[data-want-id="99"]')).not.toBeNull();
  });
  expect(posts(fetcher)).toEqual([['/api/wants', { action: 'add', code: 'ssis-950' }]]);
  expect(toast).toHaveBeenCalledWith('Added to wants: SSIS-950');
  expect(input.value).toBe('');
  expect(reads(fetcher)).toHaveLength(2);
});

it('Remove and re-lookup send by this entry\'s id', async () => {
  const fetcher = serve(listed([want(3, { phase: 'given_up', search_count: 3 })]));
  const { host, toast } = await open();
  const row = () => host.querySelector('[data-want-id="3"]')!;
  await click(buttonNamed('Search again', row()));
  await settle();
  await click(buttonNamed('Remove', row()));
  await settle();
  expect(posts(fetcher)).toEqual([
    ['/api/wants', { action: 'reset', ids: [3] }], ['/api/wants', { action: 'remove', ids: [3] }],
  ]);
  expect(toast.mock.calls.map(([message]) => message)).toEqual(['ABC-3 back to pending search', 'Removed: ABC-3']);
});

it('Read-only machine: inputs, add, and per-row keys all disable', async () => {
  serve(listed([want(2)]));
  const { host } = await open(true);
  expect(host.querySelector<HTMLInputElement>('input[aria-label="code"]')!.disabled).toBe(true);
  expect(buttonNamed('Add', host)!.disabled).toBe(true);
  expect(buttonNamed('Remove', host)!.disabled).toBe(true);
  expect(buttonNamed('Find resources', host)!.disabled).toBe(false);
});

it(`Sections longer than ${WANT_PAGE_SIZE} items paginate, each tracking its own page; errors show only one line`, async () => {
  const many = Array.from({ length: 45 }, (_, index) => want(index + 1, {
    phase: index < 42 ? 'unreleased' : 'acquired', scrape_error: index === 0 ? 'Line one\nline two' : null,
  }));
  serve(listed(many));
  const { host } = await open();
  const unreleased = host.querySelector('[data-want-phase="unreleased"]')!;
  expect(unreleased.querySelector('h3')?.textContent).toBe('Unreleased42');
  expect(unreleased.querySelectorAll('li[data-want-id]')).toHaveLength(WANT_PAGE_SIZE);
  expect(unreleased.querySelector('[data-want-pager]')?.textContent).toContain('1–20 / 42 items');
  expect(unreleased.querySelector('[data-error-line]')?.textContent).toBe('Details unfetched: Line one');
  await click(unreleased.querySelector('button[aria-label="Page 3"]'));
  expect([...unreleased.querySelectorAll<HTMLElement>('li[data-want-id]')].map((row) => row.dataset.wantId)).toEqual(['41', '42']);
  const acquired = host.querySelector('[data-want-phase="acquired"]')!;
  expect(acquired.querySelectorAll('li[data-want-id]')).toHaveLength(3);
  expect(acquired.querySelector('[data-want-pager]')?.textContent).toContain('1–3 / 3 entries');
  await choose(unreleased.querySelector('button[aria-label="Rows per page"]'), '10 items per page');
  expect(unreleased.querySelectorAll('li[data-want-id]')).toHaveLength(10);
  expect(unreleased.querySelector('li[data-want-id]')?.getAttribute('data-want-id')).toBe('1');
  expect(acquired.querySelector('button[aria-label="Rows per page"]')?.textContent).toContain('20 per page');
});

it('With an empty Wanted filter the per-page size can still be chosen; after clearing the filter the chosen size applies', async () => {
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
  serve(listed(Array.from({ length: 25 }, (_, index) => want(index + 1, { has_magnets: false }))));
  const { host } = await open();
  await click(host.querySelector('input[value="available"]'));
  await settle();
  expect(host.querySelectorAll('[data-want-id]')).toHaveLength(0);
  expect(host.querySelector('[data-want-pager]')?.textContent).toContain('0–0 / 0 items20 items per page 10 items per page20 items per page50 items per page100 items per page');
  await choose(host.querySelector('button[aria-label="Rows per page"]'), '10 items per page');
  await click(buttonNamed('View all', host));
  await settle();
  expect(host.querySelectorAll('[data-want-id]')).toHaveLength(10);
});
