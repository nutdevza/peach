/* The library card grid: how a screen of cards is arranged (fetch query string, collapsing, Mix placement, portrait strip targets), and what a card
 *  draws plus what clicking where does. */
import { act, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MediaCard, cardRatio, type MediaCardVariant } from '../../src/react/components/media-card';
import { CatalogGridPage, LoadMore } from '../../src/react/catalog-grid/catalog-grid-page';
import type { CatalogGridProps } from '../../src/react/catalog-grid/types';
import {
  MIX_SLOT, SHORTS_BATCH, arrangeTiles, catalogParams, catalogSummary, collapseGroups, fetchCatalogPage, latestCatalogPages, mixSeed, nextOffset, visibleCatalogBatch,
  shortsBoundaries, shortsParams, replaceCatalogItem, type GridPage,
} from '../../src/react/catalog-grid/catalog-grid';
import type { MediaCardActions, MediaCardHelpers, MediaCardLayout, MediaItem } from '../../src/react/catalog-grid/types';

import { buttonNamed, click, fetchMock, mount, sentBody, settle } from './render';
import { missingArtwork } from '../../src/react/components/artwork-gap';
import { queryClient } from '../../src/react/query';
import { peachHistory } from '../../src/history';
import { PLAYBACK_PROGRESS_EVENT } from '../../src/player/telemetry';

vi.mock('@peach/legacy/ui', async (original) => ({
  ...await original<typeof import('@peach/legacy/ui')>(),
  confirmModal: (await import('../../src/ui-kit/modal')).confirmModal,
}));

const SMALL: MediaCardLayout = { active: false, size: 'small', portrait: false, javImage: 'cover' };

const item = (id: number, extra: Partial<MediaItem> = {}): MediaItem => ({ id, name: `Video ${id}`, has_thumb: true, ...extra });
const page = (items: MediaItem[], offset = 0, extra: Partial<GridPage> = {}): GridPage => ({ items, offset, ...extra });

describe('Catalog fetching', () => {
  it('Details edits sync to card pagination and the table page, while other videos on the page keep their values', () => {
    const cardKey = ['catalog-grid', 'catalog', 'cache-test', 0];
    const tableKey = ['catalog-grid', 'table', 'cache-test', 0];
    queryClient.setQueryData(cardKey, { pages: [page([item(100), item(101)], 0)], pageParams: [0] });
    queryClient.setQueryData(tableKey, { items: [item(100), item(101)], total: 2 });
    replaceCatalogItem(100, { feedback: 'seen', watch_later: true });
    const cards = queryClient.getQueryData<{ pages: GridPage[] }>(cardKey)!.pages[0]!.items;
    const rows = queryClient.getQueryData<{ items: MediaItem[] }>(tableKey)!.items;
    for (const items of [cards, rows]) {
      expect(items[0]).toMatchObject({ id: 100, feedback: 'seen', watch_later: true });
      expect(items[1]!.feedback).toBeUndefined();
    }
    queryClient.removeQueries({ queryKey: cardKey });
    queryClient.removeQueries({ queryKey: tableKey });
  });
  it('A refresh epoch claims the full pagination of one set, never shared across different filters', () => {
    const old = { pages: [page([item(801)]), page([item(802)], 60)], pageParams: [0,60] };
    queryClient.setQueryData(['catalog-grid','catalog','q=wall-retain',1], old);
    const retained = latestCatalogPages(['catalog-grid','catalog','q=wall-retain',2]);
    expect(retained).toBe(old);
    expect(retained?.pages).toHaveLength(2);
    expect(latestCatalogPages(['catalog-grid','catalog','q=another-wall',2])).toBeUndefined();
    queryClient.removeQueries({ queryKey: ['catalog-grid','catalog','q=wall-retain'] });
  });
  it('The query string carries only filters with values, and the portrait exclusion joins only when the shell says to exclude', () => {
    expect(catalogParams({ sort: 'seed', q: '', tag: 'Slender' }, false)).toBe('sort=seed&tag=Slender');
    expect(new URLSearchParams(catalogParams({ sort: 'seed' }, true)).get('exclude_vertical')).toBe('1');
    expect(new URLSearchParams(catalogParams({ q: 'Portrait' }, false)).has('exclude_vertical')).toBe(false);
  });

  it('A page takes exactly the batch size; later pages do not count the total', async () => {
    const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => ({ items: [item(1)], has_more: true }) }));
    vi.stubGlobal('fetch', fetcher);
    await fetchCatalogPage('sort=seed', 0, 48, false, new AbortController().signal);
    await fetchCatalogPage('sort=seed', 48, 48, false, new AbortController().signal);
    const first = new URL(fetcher.mock.calls[0]![0], 'http://peach.test').searchParams;
    const second = new URL(fetcher.mock.calls[1]![0], 'http://peach.test').searchParams;
    expect([first.get('limit'), first.get('offset'), first.has('count')]).toEqual(['48', '0', false]);
    expect([second.get('limit'), second.get('offset'), second.get('count')]).toEqual(['48', '48', '0']);
  });

  it('When page one is empty it asks once whether the whole library is empty; trash never asks', async () => {
    const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => ({ items: [], total: 0 }) }));
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchCatalogPage('tag=x', 0, 60, false, new AbortController().signal);
    expect(fetcher.mock.calls[1]![0]).toBe('/api/items?limit=1&thumb=0');
    expect(result.libraryEmpty).toBe(true);

    fetcher.mockClear();
    await fetchCatalogPage('state=trash', 0, 60, true, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('After the first batch is trimmed to the viewport the next page continues right after the actual count, skipping no works in between', () => {
    expect(visibleCatalogBatch(6, 450, 200, 16, 60)).toBe(18);
    expect(nextOffset(60)({ ...page([item(1)], 0, { has_more: true }), batch: 18 })).toBe(18);
  });

  it('Aggregate statistics keep the main list filters; the independent read requests no cards', async () => {
    const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200,
      json: async () => ({ total: 12, bytes: 240, work_total: 10 }) }));
    vi.stubGlobal('fetch', fetcher);
    expect(await catalogSummary('loc=115&tag=example', new AbortController().signal)).toEqual({ total: 12, bytes: 240, work_total: 10 });
    const query = new URL(String(fetcher.mock.calls[0]![0]), 'http://peach.test').searchParams;
    expect(Object.fromEntries(query)).toEqual({ loc: '115', tag: 'example', summary_only: '1' });
  });

  it('Where the next page comes from: the first page trusts the total, later ones trust has_more', () => {
    const next = nextOffset(60);
    expect(next(page([item(1)], 0, { total: 100 }))).toBe(60);
    expect(next(page([item(1)], 0, { total: 1 }))).toBeUndefined();
    expect(next(page([item(1)], 60, { has_more: true }))).toBe(120);
    expect(next(page([item(1)], 60, { has_more: false }))).toBeUndefined();
  });

  it('The portrait strip follows the main list\'s filters, fetching a batch of portraits per item', () => {
    const params = new URLSearchParams(shortsParams({ sort: 'seed', tag: '' }, 36));
    expect(Object.fromEntries(params)).toEqual({ sort: 'seed', orient: 'Portrait', limit: String(SHORTS_BATCH), offset: '36' });
  });
});

/** The test environment has no intersection observation: each observer and the elements it watches are recorded, and the test case decides whether the sentinel is near the viewport at any moment. */
class FakeObserver {
  static all: FakeObserver[] = [];
  readonly watched = new Set<Element>();
  observations = 0;
  constructor(private readonly callback: IntersectionObserverCallback) { FakeObserver.all.push(this) }
  observe(target: Element) { this.watched.add(target); this.observations += 1 }
  unobserve(target: Element) { this.watched.delete(target) }
  disconnect() { this.watched.clear() }
  takeRecords() { return [] }
  /** The sentinel sits near the viewport: like a real observer, it reports one intersection per element currently being watched. */
  near() {
    const entries = [...this.watched].map((target) => ({ target, isIntersecting: true }) as unknown as IntersectionObserverEntry);
    return act(async () => { this.callback(entries, this as unknown as IntersectionObserver) });
  }
  static latest() { return FakeObserver.all[FakeObserver.all.length - 1]! }
}

describe('Continuation', () => {
  type Reply = { ok: boolean; status: number; json(): Promise<unknown> };
  const reply = (body: unknown): Reply => ({ ok: true, status: 200, json: async () => body });

  /** A catalog of 9 items at 3 per page; with `hold` open, the first-page query stays in flight, simulating a whole-list refetch triggered by a result version change. */
  function catalogServer() {
    const held: Array<() => void> = [];
    let hold = false;
    const fetcher = vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(String(input), 'http://peach.test');
      const offset = Number(url.searchParams.get('offset') || 0);
      const body = { items: [1, 2, 3].map((n) => item(offset + n)), total: 9, has_more: offset + 3 < 9 };
      if (!hold || offset !== 0) return Promise.resolve(reply(body));
      return new Promise<Reply>((resolve, reject) => {
        held.push(() => resolve(reply(body)));
        init?.signal?.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')) });
      });
    });
    vi.stubGlobal('fetch', fetcher);
    const offsets = () => fetcher.mock.calls.map(([input]) => new URL(String(input), 'http://peach.test').searchParams.get('offset'));
    return { offsets, holdFirstPage: () => { hold = true }, release: () => { for (const settle of held.splice(0)) settle() } };
  }

  const props = (filters: Record<string, string>): CatalogGridProps => ({
    mode: 'catalog', layout: SMALL, selectMode: false, selected: new Set(), seekSeconds: 10, revision: 0,
    helpers: { badgeHtml: () => '', titleHtml: (_it, raw) => raw, displayName: (_it, raw) => raw, tagLabel: (tag) => tag },
    actions: {
      open: vi.fn(), openResource: vi.fn(), openShort: vi.fn(), openShorts: vi.fn(), openMix: vi.fn(),
      openEntity: vi.fn(), openUnowned: vi.fn(), toggleTag: vi.fn(), toggleSelection: vi.fn(),
      watchLater: vi.fn(async () => {}), rate: vi.fn(async () => {}), resourceOperation: vi.fn(async () => {}),
      mixRelated: vi.fn(async () => []), canFlip: () => true,
    },
    skeletonHtml: () => '', wireDrag: vi.fn(), settled: vi.fn(), filters, batchSize: 3, groupCollapse: true,
    excludeVertical: false, mix: false, shorts: false, onCount: vi.fn(), emptyHtml: () => '', canLoadMore: () => true,
  });
  const cards = (host: ParentNode) => host.querySelectorAll('[data-media-grid] > [data-media-card]').length;
  /** The request chain has fetch, json, query cache and repaint segments: released one beat at a time until the condition holds. */
  async function until(ok: () => boolean, what: string) {
    for (let step = 0; step < 200; step += 1) {
      if (ok()) return;
      await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });
    }
    throw new Error(`Timed out waiting for: ${what}`);
  }

  it('Scrolling to the bottom while a full-column refetch from a result version change is still in flight: pagination cancels the refetch first and fetches the next page immediately', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const server = catalogServer();
    const filters = { sort: 'seed', q: 'Continuation overrode the reread' };
    const host = await mount(<QueryClientProvider client={queryClient}><CatalogGridPage {...props(filters)} /></QueryClientProvider>);
    await until(() => cards(host) === 3, 'First page');
    expect(host.querySelector('[data-load-more]')?.textContent, 'The three dots already animate and the text carries no ellipsis').toBe('Loading');
    await FakeObserver.latest().near();
    await until(() => cards(host) === 6, 'Second page');

    server.holdFirstPage();
    await act(async () => { void queryClient.invalidateQueries({ queryKey: ['catalog-grid'] }, { cancelRefetch: false }) });
    await until(() => server.offsets().at(-1) === '0', 'A whole-column reread starts from page one, stopping mid-way');
    await FakeObserver.latest().near();
    await until(() => cards(host) === 9, 'Continuation never waits for the whole column to re-read, attaching page three on the spot');
    expect(server.offsets().filter((offset) => offset === '6')).toHaveLength(1);
    server.release();
    await settle();
    queryClient.removeQueries({ queryKey: ['catalog-grid'] });
  });

  it('With details over the grid, a changed result version does not refetch; only closing details fetches the invalidated entry once', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const server = catalogServer();
    const filters = { sort: 'seed', q: 'The details overlay covers unfollow' };
    const host = await mount(<QueryClientProvider client={queryClient}><CatalogGridPage {...props(filters)} /></QueryClientProvider>);
    await until(() => cards(host) === 3, 'First page');
    const reads = () => server.offsets().filter((offset) => offset === '0').length;
    expect(reads()).toBe(1);
    await act(async () => { peachHistory.push('/assets/1') });
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['catalog-grid'] }, { cancelRefetch: false }) });
    await settle();
    expect(reads(), 'The grid covered by details does not refetch behind it').toBe(1);
    await act(async () => { peachHistory.push('/') });
    await until(() => reads() === 2, 'After revealing, refetch the invalidated entry once');
    await settle();
    expect(reads()).toBe(2);
    await act(async () => { peachHistory.push('/assets/1') });
    await act(async () => { peachHistory.push('/') });
    await settle();
    expect(reads(), 'Without invalidation in between it does not refetch').toBe(2);
    queryClient.removeQueries({ queryKey: ['catalog-grid'] });
  });

  it('The watch-progress heartbeat receipt rewrites that card in the cache', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    catalogServer();
    const host = await mount(<QueryClientProvider client={queryClient}><CatalogGridPage {...props({ sort: 'seed', q: 'The progress broadcast' })} /></QueryClientProvider>);
    await until(() => cards(host) === 3, 'First page');
    await act(async () => {
      document.dispatchEvent(new CustomEvent(PLAYBACK_PROGRESS_EVENT, { detail: { id: 2, play_seconds: 30, leave_ratio: 0.5 } }));
    });
    const cached = queryClient.getQueriesData<{ pages: GridPage[] }>({ queryKey: ['catalog-grid'] })
      .flatMap(([, data]) => data?.pages?.flatMap((one) => one.items) || []);
    expect(cached.find((one) => one.id === 2)).toMatchObject({ play_seconds: 30, leave_ratio: 0.5 });
    expect(cached.find((one) => one.id === 1)?.play_seconds).toBeUndefined();
    queryClient.removeQueries({ queryKey: ['catalog-grid'] });
  });

  it('The completion status strip counts portrait-strip cards missing images too: portrait cells judge by video frames, so code works with a cover but no frames also count as missing images', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const strip = [
      item(51, { location: 'local', has_thumb: false }),
      item(52, { location: 'pikpak', cost: 'metered', has_thumb: false }),
      item(53, { location: 'local', is_jav: true, code: 'ABC-053', has_cover: true, cover_key: 'ABC-053', has_thumb: false }),
    ];
    const posts: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn((input: string, init?: RequestInit) => {
      if (init?.method === 'POST') posts.push(JSON.parse(String(init.body)));
      const url = new URL(String(input), 'http://peach.test');
      const body = url.pathname === '/api/library-processing' ? { status: 'idle' }
        : url.searchParams.get('orient') === 'Portrait' ? { items: strip, total: strip.length, has_more: false }
          : { items: [1, 2, 3].map((n) => item(n)), total: 3, has_more: false };
      return Promise.resolve(reply(body));
    }));
    const host = await mount(<QueryClientProvider client={queryClient}>
      <CatalogGridPage {...props({ sort: 'seed', q: 'Portrait strip missing images' })} shorts />
    </QueryClientProvider>);
    await until(() => !!host.querySelector('[data-library-completion]'), 'The status strip appears');
    expect(host.querySelector('[data-library-completion]')?.textContent).toContain('3 of these videos have no preview yet, 1 of them in traffic-protected folders; profiles and images can be completed. View processing detailsComplete previews for the 1 traffic-protected videosSync these videos');
    await click(buttonNamed('Sync these videos', host));
    await until(() => posts.length > 0, 'Submit completion');
    expect(posts[0]).toEqual({ stage: 'collect', asset_ids: [51, 53] });
    queryClient.removeQueries({ queryKey: ['catalog-grid'] });
  });

  it('The portrait strip shares the main grid "Merge volumes and editions" setting: when on, a volume group renders one combined card; when off, each volume gets its own card without volume numbers', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const group = { key: 'FC2-PPV-3189161', seed_id: 41, count: 2, title: 'FC2-PPV-3189161', total_duration: 1200 };
    const strip = [item(41, { part_group: group, duration: 600 }), item(43), item(42, { part_group: group, duration: 600 })];
    vi.stubGlobal('fetch', vi.fn((input: string) => {
      const url = new URL(String(input), 'http://peach.test');
      const body = url.searchParams.get('orient') === 'Portrait'
        ? { items: strip, total: strip.length, has_more: false }
        : { items: [1, 2, 3].map((n) => item(n)), total: 3, has_more: false };
      return Promise.resolve(reply(body));
    }));
    const shorts = (host: ParentNode) => [...host.querySelectorAll<HTMLElement>('[data-shorts-row] [data-media-card]')];
    for (const collapse of [true, false]) {
      const host = await mount(<QueryClientProvider client={queryClient}>
        <CatalogGridPage {...props({ sort: 'seed', q: `Portrait strip collapsed ${collapse}` })} shorts groupCollapse={collapse} />
      </QueryClientProvider>);
      await until(() => shorts(host).length > 0, 'Portrait strip inserted into the grid');
      const cardsInStrip = shorts(host);
      const badges = cardsInStrip.map((card) => card.querySelector('[data-media-group]')?.textContent || '');
      if (collapse) {
        expect(cardsInStrip.map((card) => card.dataset.id)).toEqual(['41', '43']);
        expect(badges).toEqual(['2 volumes', '']);
      } else {
        expect(cardsInStrip.map((card) => card.dataset.id)).toEqual(['41', '43', '42']);
        expect(badges.every((text) => !text), 'Each volume is its own card without the group\'s volume count').toBe(true);
        expect(cardsInStrip[0]!.querySelector('[data-media-duration]')?.textContent, 'Duration is this volume\'s own').toBe('10:00');
      }
    }
    queryClient.removeQueries({ queryKey: ['catalog-grid'] });
  });

  /* The `orient=portrait` API shape (`attach_multipart_groups` narrowed by aspect): of FC2-PPV-3189161's five volumes only the last two are portrait, and the group
     writes 2 volumes and their combined total; of FC2-PPV-9's three volumes only one is portrait, and the group is just that volume. */
  const mixedGroup = { key: 'FC2-PPV-3189161', seed_id: 1, count: 2, title: 'FC2-PPV-3189161', total_duration: 1500, total_size: 2500 };
  const loneGroup = { key: 'FC2-PPV-9', seed_id: 7, count: 1, title: 'FC2-PPV-9', total_duration: 300, total_size: 700 };
  const portraitParts = [
    item(4, { part_group: mixedGroup, duration: 600, size: 1000 }), item(43),
    item(5, { part_group: mixedGroup, duration: 900, size: 1500 }),
    item(9, { name: 'FC2-PPV-9 part3', part_group: loneGroup, duration: 300, size: 700 }),
  ];
  const groupBadges = (cards: HTMLElement[]) => cards.map((card) => [
    card.dataset.id, card.querySelector('[data-media-group]')?.textContent || '',
    card.querySelector('[data-media-duration]')?.textContent || '', card.hasAttribute('data-stacked'),
  ]);

  it('The portrait strip\'s card group counts volumes and duration as portrait volumes per the API; a group down to a single portrait volume becomes an ordinary single-volume card', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('fetch', vi.fn((input: string) => {
      const url = new URL(String(input), 'http://peach.test');
      const body = url.searchParams.get('orient') === 'Portrait'
        ? { items: portraitParts, total: portraitParts.length, has_more: false }
        : { items: [1, 2, 3].map((n) => item(n)), total: 3, has_more: false };
      return Promise.resolve(reply(body));
    }));
    const shorts = (host: ParentNode) => [...host.querySelectorAll<HTMLElement>('[data-shorts-row] [data-media-card]')];
    for (const collapse of [true, false]) {
      const host = await mount(<QueryClientProvider client={queryClient}>
        <CatalogGridPage {...props({ sort: 'seed', q: `The portrait strip counts only portrait volumes ${collapse}` })} shorts groupCollapse={collapse} />
      </QueryClientProvider>);
      await until(() => shorts(host).length > 0, 'Portrait strip inserted into the grid');
      if (collapse) {
        expect(groupBadges(shorts(host))).toEqual([
          ['4', '2 volumes', '25:00', true], ['43', '', '', false], ['9', '', '5:00', false],
        ]);
      } else {
        expect(groupBadges(shorts(host)), 'With merging off each portrait volume is its own card').toEqual([
          ['4', '', '10:00', false], ['43', '', '', false], ['5', '', '15:00', false], ['9', '', '5:00', false],
        ]);
      }
    }
    queryClient.removeQueries({ queryKey: ['catalog-grid'] });
  });

  it('When a continuation page does not land, the sentinel re-evaluates at its current position and keeps fetching while it stays near the viewport', async () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const load = vi.fn(async () => {});
    await mount(<LoadMore entity={false} load={load} enabled={() => true} />);
    const observer = FakeObserver.latest();
    expect(observer.observations).toBe(1);
    await observer.near();
    await settle();
    expect(load).toHaveBeenCalledTimes(1);
    expect(observer.observations, 'After fetching, observe once more; a real observer will report one more intersection from that').toBe(2);
    await observer.near();
    await settle();
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('One-screen card layout', () => {
  const parts = (key: string, seed: number) => ({ key, seed_id: seed, count: 2 });
  const editions = (key: string, seed: number) => ({ key, seed_id: seed, count: 2, editions: ['Original', 'Uncensored'] });

  it('Volumes and editions collapse separately, and across pages only the first occurrence collapses; with the toggle off nothing collapses', () => {
    const seen = { parts: new Set<string>(), editions: new Set<string>() };
    const first = [item(1, { part_group: parts('P', 1) }), item(2, { part_group: parts('P', 1) }), item(3, { edition_group: editions('E', 3) })];
    expect(collapseGroups(first, seen, true).map((x) => x.id)).toEqual([1, 3]);
    expect(collapseGroups([item(4, { edition_group: editions('E', 3) }), item(5)], seen, true).map((x) => x.id)).toEqual([5]);
    expect(collapseGroups(first, { parts: new Set(), editions: new Set() }, false).map((x) => x.id)).toEqual([1, 2, 3]);
  });

  it('Every page with 8 or more items inserts a Mix at position 8; entries repeated across pages render only once', () => {
    const named = (id: number) => item(id, { creator: `Author ${id}` });
    const first = Array.from({ length: 20 }, (_, index) => named(index + 1));
    const second = [named(20), ...Array.from({ length: 9 }, (_, index) => named(index + 21))];
    const { tiles, pageStarts } = arrangeTiles([page(first), page(second, 20)], { collapse: true, mix: true, javImage: 'cover' });
    expect(tiles[MIX_SLOT]?.kind).toBe('mix');
    expect(pageStarts).toEqual([0, 21]);
    const ids = tiles.flatMap((tile) => (tile.kind === 'card' ? [tile.item.id] : []));
    expect(ids.filter((id) => id === 20)).toHaveLength(1);
    expect(tiles[pageStarts[1]! + MIX_SLOT]?.kind).toBe('mix');
    expect(arrangeTiles([page(first)], { collapse: true, mix: false, javImage: 'cover' }).tiles.some((tile) => tile.kind === 'mix')).toBe(false);
  });

  it('The Mix seed does not take its adjacent card: from the Mix slot, look one screen down for one with an image and a credit, and if none is credited take the last one', () => {
    const visible = Array.from({ length: 20 }, (_, index) => item(index + 1, { creator: `Author ${index + 1}` }));
    expect(mixSeed(visible, 'cover')?.id).toBe(MIX_SLOT + 9);
    const anonymous = Array.from({ length: 20 }, (_, index) => item(index + 1, { has_thumb: false }));
    expect(mixSeed(anonymous, 'cover')?.id).toBe(20);
  });

  it('The portrait strip lands on this page\'s new rows\' boundaries, keeping at least one row clear on each end', () => {
    expect(shortsBoundaries(20, 0, 4)).toEqual([4, 8, 12, 16]);
    expect(shortsBoundaries(20, 10, 4)).toEqual([12, 16]);
    expect(shortsBoundaries(4, 0, 4)).toEqual([]);
  });
});

describe('Ratio', () => {
  const jav = item(1, { is_jav: true, code: 'ABC-001', has_cover: true });
  const ratio = (target: MediaItem, variant: MediaCardVariant, layout: Partial<MediaCardLayout>) =>
    cardRatio(target, variant, { ...SMALL, ...layout });

  it('Cards in one list share the same height: the ratio is decided by context alone, not by the dimensions of individual videos', () => {
    expect(ratio(item(2, { width: 1080, height: 1920 }), 'grid', {})).toBeCloseTo(16 / 9);
    expect(ratio(item(2), 'short', {})).toBeCloseTo(9 / 16);
    expect(ratio(item(2), 'grid', { portrait: true })).toBeCloseTo(9 / 16);
  });

  it('Large images unify every video\'s frame, and disabled views use the landscape frame', () => {
    expect(ratio(jav, 'grid', { active: true, size: 'big' })).toBe(0.75);
    expect(ratio(item(2), 'grid', { active: true, size: 'big' })).toBe(0.75);
    expect(ratio(jav, 'grid', { active: false, size: 'big' })).toBeCloseTo(16 / 9);
    expect(ratio(jav, 'grid', { active: true, size: 'small' })).toBeCloseTo(16 / 9);
  });
});

describe('Video card', () => {
  /* 缺图卡上的「补全预览」挂载时会查一次处理任务状态；没单独设请求的用例给一份空闲的。 */
  beforeEach(() => { vi.stubGlobal('fetch', fetchMock(200, { status: 'idle' })) });
  const helpers: MediaCardHelpers = {
    badgeHtml: (location) => `<span>${location}</span>`,
    titleHtml: (_it, raw) => raw,
    displayName: (_it, raw) => raw,
    tagLabel: (tag) => `#${tag}`,
  };
  const actionsFor = (): MediaCardActions => ({
    open: vi.fn(), openResource: vi.fn(), openShort: vi.fn(), openShorts: vi.fn(), openMix: vi.fn(),
    openEntity: vi.fn(), openUnowned: vi.fn(), toggleTag: vi.fn(), toggleSelection: vi.fn(),
    watchLater: vi.fn(async (_it: MediaItem, onChange: (on: boolean) => void) => onChange(true)),
    rate: vi.fn(async () => {}),
    resourceOperation: vi.fn(async () => {}), mixRelated: vi.fn(async () => []), canFlip: () => true,
  });
  const render = async (target: MediaItem, options: { variant?: MediaCardVariant; selectMode?: boolean; layout?: MediaCardLayout } = {}) => {
    const actions = actionsFor();
    const onOpen = vi.fn();
    const host = await mount(
      <MediaCard item={target} variant={options.variant || 'grid'} layout={options.layout || SMALL} selected={false}
        selectMode={!!options.selectMode} seekSeconds={10} helpers={helpers} actions={actions} onOpen={onOpen} />,
    );
    return { host, actions, onOpen, card: host.querySelector<HTMLElement>('[data-media-card]')! };
  };

  it.each([
    [{ duration: null }, null],
    [{ duration: -1 }, null],
    [{ duration: 0 }, null],
    [{ duration: null, is_strm: true }, null],
    [{ duration: 60 }, '1:00'],
  ] as [Partial<MediaItem>, string | null][])('The duration badge shows only fetched durations %j', async (fields, expected) => {
    const { host } = await render(item(7, fields));
    expect(host.querySelector('[data-media-duration]')?.textContent ?? null).toBe(expected);
  });

  it('Click the title to open, the byline for the profile, "Unattributed" for that batch, and a tag filters this screen by it', async () => {
    const credited = await render(item(7, { creator: 'So-and-so', tags: ['Slender'] }));
    await click(credited.host.querySelector('[data-media-title]'));
    expect(credited.onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), credited.card);
    await click(credited.host.querySelector('[data-media-who]'));
    expect(credited.actions.openEntity).toHaveBeenCalledWith('creator', 'So-and-so');
    await click(credited.host.querySelector('[data-media-tag]'));
    expect(credited.actions.toggleTag).toHaveBeenCalledWith('Slender');
    expect(credited.onOpen).toHaveBeenCalledTimes(1);

    const unowned = await render(item(8));
    await click(unowned.host.querySelector('[data-open-unowned]'));
    expect(unowned.actions.openUnowned).toHaveBeenCalledTimes(1);
    expect(unowned.onOpen).not.toHaveBeenCalled();
  });

  it('In multi-select mode or with a modifier key held, every click toggles selection; Shift is range select', async () => {
    const plain = await render(item(9));
    const title = plain.card.querySelector<HTMLElement>('[data-media-title]')!;
    await act(async () => { title.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })) });
    expect(plain.actions.toggleSelection).toHaveBeenCalledWith(9, true);
    const selecting = await render(item(10), { selectMode: true });
    expect(selecting.card.querySelector('[data-media-later]')).toBeNull();
    expect(selecting.card.querySelector('[data-media-seek]')).toBeNull();
    expect(selecting.card.querySelector('[data-media-check]')).not.toBeNull();
    expect(plain.card.querySelector('[data-media-later]')).not.toBeNull();
    await click(selecting.host.querySelector('[data-media-title]'));
    expect(selecting.actions.toggleSelection).toHaveBeenCalledWith(10, false);
    expect([plain.onOpen, selecting.onOpen].every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it('With an empty title the title and accessible name read "Untitled video"', async () => {
    const { host } = await render(item(12, { name: '' }));
    expect(host.querySelector('[data-media-title]')?.textContent).toBe('Untitled video');
    expect(host.querySelector('[data-media-open]')?.getAttribute('aria-label')).toBe('Open Untitled video details');
  });

  it('Unknown size and video tags display separately, and watch counts never occupy the card body', async () => {
    const { host } = await render(item(11, { size: 0, play_count: 3, performers: ['Alpha'], tags: ['a', 'b', 'c', 'd'] }));
    expect(host.querySelector('[data-media-size]')?.textContent).toBe('Unknown size');
    expect(host.querySelector('[data-media-watch-count]')).toBeNull();
    expect([...host.querySelectorAll('[data-media-tag]')].map((tag) => tag.textContent)).toEqual(['#a', '#b', '#c']);
  });

  it('Each hover control uses a glyph that means only itself: rewind and fast forward are direction arrows, open details is the expand glyph', async () => {
    const { host } = await render(item(13));
    const glyphs = [...host.querySelectorAll('[data-media-seek] button')]
      .map((button) => [button.getAttribute('aria-label'), button.querySelector('use')?.getAttribute('href')]);
    expect(glyphs).toEqual([
      [expect.stringContaining('Back'), '#i-rotate-ccw'],
      [expect.stringContaining('Forward'), '#i-rotate-cw'],
      ['Open details', '#i-expand'],
    ]);
  });

  it('Saved follow-source entries use the source\'s thumbnail and tags, and the tags are not clickable', async () => {
    const { host } = await render(item(12, { follow_thumb_url: 'https://example.test/t.jpg', follow_item_id: 5, tags: ['Local'], follow_tags: ['Source'] }));
    expect(host.querySelector('[data-media-art] img')?.getAttribute('src')).toBe('https://example.test/t.jpg');
    const tag = host.querySelector('[data-media-tag]');
    expect([tag?.textContent, tag?.tagName, tag?.hasAttribute('data-tag')]).toEqual(['#Source', 'SPAN', false]);
  });

  it('Half-watched videos draw one progress bar and volume groups draw none; the ratio writes into the cover cell', async () => {
    const { host } = await render(item(13, { duration: 600, play_seconds: 150 }));
    const bar = host.querySelector('[data-media-progress]');
    expect([bar?.getAttribute('role'), bar?.getAttribute('aria-label'), bar?.getAttribute('aria-valuenow')]).toEqual(['progressbar', 'Watch progress', '25']);
    expect(host.querySelector<HTMLElement>('[data-media-pic]')!.style.getPropertyValue('--card-ratio')).toBe(String(16 / 9));

    const group = await render(item(14, { duration: 600, play_seconds: 150, part_group: { key: 'P', seed_id: 14, count: 2 } }));
    expect(group.host.querySelector('[data-media-progress]')).toBeNull();
    expect(group.card.dataset.partSeed).toBe('14');
    expect(group.card.hasAttribute('data-stacked')).toBe(true);
    expect(group.host.querySelector('[data-media-group]')?.textContent).toBe('2 volumes');
    const versions = await render(item(16, {
      part_group: { key: 'P', seed_id: 14, count: 2 },
      edition_group: { key: 'E', seed_id: 13, count: 2, editions: ['1080p', '4K repair'] },
    }));
    expect([...versions.host.querySelectorAll('[data-media-group]')].map((node) => node.textContent)).toEqual(['2 editions']);
    expect(versions.host.querySelector('[data-media-open]')?.getAttribute('aria-label')).toMatch(/editions$/);

    /* When filtering by aspect, an edition group keeps only the edition matching that aspect: render by its volume groups, without an edition count. */
    const oneVersion = await render(item(17, {
      part_group: { key: 'P', seed_id: 14, count: 2 },
      edition_group: { key: 'E', seed_id: 13, count: 1, editions: ['4K repair'] },
    }));
    expect([...oneVersion.host.querySelectorAll('[data-media-group]')].map((node) => node.textContent)).toEqual(['2 volumes']);
  });

  it('Portrait cells for code videos use video frame images only, never the code cover: no frame image means "No preview"; landscape cells still render from the cover setting', async () => {
    const cover = { is_jav: true, code: 'FC2-PPV-3189161', has_cover: true, has_thumb: false };
    const pictureOf = (host: ParentNode) => {
      const img = host.querySelector('[data-media-art] img');
      return img ? img.getAttribute('src') : host.querySelector('[data-media-nopic]')?.textContent;
    };
    const portraitGrid = { ...SMALL, portrait: true };
    expect(pictureOf((await render(item(20, cover), { variant: 'short' })).host)).toBe('No preview');
    expect(pictureOf((await render(item(21, cover), { layout: portraitGrid })).host), 'A grid filtering portrait explicitly is also portrait shaped').toBe('No preview');
    expect(pictureOf((await render(item(23, { ...cover, has_thumb: true }), { variant: 'short' })).host),
      'Even with covers set to official, portrait cells still use frame images').toBe('/poster?id=23&c=4');
    expect(pictureOf((await render(item(22, cover))).host)).toMatch(/^\/cover\?code=FC2-PPV-3189161/);
  });

  it.each([
    [{ is_jav: true, code: 'ABC-001' }, false, 'No cover', 'The official cover has not been fetched yet', 'cover'],
    [{ is_jav: true, code: 'ABC-001', location: 'local' }, true, 'No preview', 'No frames extracted yet', 'previews'],
    [{ location: 'local', duration: -1 }, false, 'No preview', 'Probe failed; no frames extracted', 'previews'],
    [{ location: '115' }, false, 'No preview', 'No frames extracted yet', 'previews'],
    [{ location: 'pikpak', cost: 'metered' }, false, 'No preview', 'Traffic protection · no frame extraction during sync', 'previews'],
    [{ location: 'online' }, false, 'No preview', 'Online sources do not extract frames', ''],
    [{ location: 'local', name: 'a.strm' }, false, 'No preview', 'STRM does not extract frames', ''],
    [{ location: 'local', name: 'a.ISO' }, false, 'No preview', 'ISO does not extract frames', ''],
  ] as [Partial<MediaItem>, boolean, string, string, string][])('With no image it writes per entry what is missing, why, and whether it can be completed %j', (fields, frameOnly, title, reason, fix) => {
    expect(missingArtwork({ name: 'a.mp4', ...fields } as MediaItem, frameOnly)).toMatchObject({ title, reason, fix });
  });

  it('Code works without a cover fetch it on the spot: the button does not open details, and the card takes the cover once fetched', async () => {
    const fetcher = fetchMock(200, { has_cover: true, cover_version: 'v2', message: '' });
    vi.stubGlobal('fetch', fetcher);
    const target = item(30, { is_jav: true, code: 'ABC-001', has_cover: false, has_thumb: false });
    const key = ['catalog-grid', 'catalog', 'gap-test', 0];
    queryClient.setQueryData(key, { pages: [page([target])], pageParams: [0] });
    const { host, onOpen } = await render(target);
    expect(host.querySelector('[data-media-nopic]')?.textContent).toBe('No cover');
    expect(host.querySelector('[data-artwork-gap]')?.textContent).toContain('The official cover has not been fetched yet');
    await click(buttonNamed('Fetch cover', host));
    await settle();
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/jav/cover');
    expect(sentBody(fetcher)).toEqual({ code: 'ABC-001' });
    expect(onOpen).not.toHaveBeenCalled();
    const cached = queryClient.getQueryData<{ pages: GridPage[] }>(key)!.pages[0]!.items[0]!;
    expect(cached).toMatchObject({ has_cover: true, cover_version: 'v2' });
    queryClient.removeQueries({ queryKey: key });
  });

  it('When an image exists but fetching failed it keeps no broken image: ask the server where it stalled; local videos missing stills get "Complete preview"', async () => {
    vi.stubGlobal('fetch', fetchMock(404, { error: 'unavailable', reason: 'snapshot unavailable' }));
    const { host } = await render(item(31, { location: 'local', has_thumb: true }));
    const img = host.querySelector('[data-media-art] img')!;
    await act(async () => { img.dispatchEvent(new Event('error')) });
    await settle();
    expect(host.querySelector('[data-media-art] img')).toBeNull();
    expect(host.querySelector('[data-media-nopic]')?.textContent).toBe('Preview not obtained');
    expect(host.querySelector('[data-artwork-gap]')?.textContent).toContain('Preview frame file missing');
    expect(buttonNamed('Complete preview', host)).not.toBeNull();
  });

  it('After a fetch failure "Retry" fetches the image again from another address', async () => {
    vi.stubGlobal('fetch', fetchMock(404, { error: 'unavailable', reason: 'ffmpeg generation failed' }));
    const { host } = await render(item(32, { location: '115', has_thumb: true }));
    await act(async () => { host.querySelector('[data-media-art] img')!.dispatchEvent(new Event('error')) });
    await settle();
    expect(host.querySelector('[data-artwork-gap]')?.textContent).toContain('Generating the preview failed');
    await click(buttonNamed('Retry', host));
    expect(host.querySelector('[data-media-art] img')?.getAttribute('src')).toBe('/poster?id=32&c=4&r=1');
  });

  it('Completing previews for traffic-protected videos confirms first: cancel sends nothing, confirm extracts frames for this one with authorization', async () => {
    queryClient.removeQueries({ queryKey: ['library-processing'] });
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, status: 200,
      json: async () => init?.method === 'POST' ? { job_id: 'new', status: 'running' } : { job_id: 'old', status: 'complete' } }));
    vi.stubGlobal('fetch', fetcher);
    const { host } = await render(item(33, { location: 'pikpak', cost: 'metered', has_thumb: false }));
    await settle();
    expect(host.querySelector('[data-artwork-gap]')?.textContent).toContain('Traffic protection');
    const posts = () => fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');

    await click(buttonNamed('Complete preview', host));
    await vi.waitFor(() => expect(document.querySelector('dialog')?.open).toBe(true));
    await click(document.querySelector('dialog [data-modal-cancel]'));
    expect(posts()).toEqual([]);

    await click(buttonNamed('Complete preview', host));
    await vi.waitFor(() => expect(document.querySelector('dialog')?.open).toBe(true));
    await click(document.querySelector('dialog [data-modal-confirm]'));
    await vi.waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(String(posts()[0]![1]!.body))).toEqual({ stage: 'previews', asset_ids: [33], allow_metered: true });
    queryClient.removeQueries({ queryKey: ['library-processing'] });
  });

  it('Without merging volumes, each volume gets its own card: name and duration are its own, with no stacked paper edges and no volume numbers, and opening hands over the entry as is', async () => {
    const actions = actionsFor();
    const onOpen = vi.fn();
    const part = item(18, { name: 'FC2-PPV-1 part2', duration: 600, part_group: { key: 'P', seed_id: 17, count: 3, title: 'FC2-PPV-1', total_duration: 1800 } });
    const host = await mount(<MediaCard item={part} variant="grid" layout={SMALL} selected={false} selectMode={false}
      seekSeconds={10} helpers={helpers} actions={actions} onOpen={onOpen} grouped={false} />);
    const card = host.querySelector<HTMLElement>('[data-media-card]')!;
    expect(host.querySelector('[data-media-group]')).toBeNull();
    expect([card.hasAttribute('data-stacked'), card.dataset.partSeed]).toEqual([false, undefined]);
    expect(host.querySelector('[data-media-title]')?.textContent).toBe('FC2-PPV-1 part2');
    expect(host.querySelector('[data-media-duration]')?.textContent).toBe('10:00');
    await click(host.querySelector('[data-media-title]'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 18, part_group: expect.objectContaining({ seed_id: 17 }) }), card);
  });

  it('Pending-deletion videos stay in place, marked for trash', async () => {
    const { card, host } = await render(item(15, { disposal: 'trash' }));
    expect(card.hasAttribute('data-pending-delete')).toBe(true);
    expect(host.querySelector('[data-media-trash-mark]')?.textContent).toBe('Trash');
  });

  it('Watch later only writes this one entry and does not open details; after writing, the button shows pressed', async () => {
    const { host, actions, onOpen } = await render(item(16));
    await click(host.querySelector('[data-later]'));
    expect(actions.watchLater).toHaveBeenCalledWith(expect.objectContaining({ id: 16 }), expect.any(Function));
    expect(onOpen).not.toHaveBeenCalled();
    expect(host.querySelector('[data-later]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('Trash resources are named by type; the button on the card restores this entry instead of opening it', async () => {
    const archive = await render(item(17, { medium: 'archive', name: 'details.zip', disposal: 'trash' }), { variant: 'resource' });
    expect(archive.host.querySelector('[data-media-who]')?.textContent).toBe('Archives');
    await click(archive.host.querySelector('[data-media-resource-action]'));
    expect(archive.actions.resourceOperation).toHaveBeenCalledWith(expect.objectContaining({ id: 17 }), 'restore');
    expect(archive.onOpen).not.toHaveBeenCalled();

    const shortcut = await render(item(18, { medium: 'other', name: 'shortcut.URL' }), { variant: 'resource' });
    expect(shortcut.host.querySelector('[data-media-who]')?.textContent).toBe('URL shortcut');
    expect(shortcut.host.querySelector('[data-media-resource-action]')?.getAttribute('title')).toBe('Move to trash');
  });

  it('Switching large or small cover keeps the original cover artwork and swaps framing in place; the image changes only when the video changes', async () => {
    const BIG: MediaCardLayout = { active: true, size: 'big', portrait: false, javImage: 'cover' };
    let show!: (next: { layout: MediaCardLayout; code: string }) => void;
    function Harness() {
      const [state, set] = useState({ layout: BIG, code: 'ABC-001' });
      show = set;
      return <MediaCard item={item(19, { is_jav: true, code: state.code, has_cover: true })} variant="grid"
        layout={state.layout} selected={false} selectMode={false} seekSeconds={10} helpers={helpers}
        actions={actionsFor()} onOpen={vi.fn()} />;
    }
    const host = await mount(<Harness />);
    const cover = host.querySelector<HTMLImageElement>('[data-media-art] img')!;
    const firstSrc = cover.getAttribute('src');
    expect([cover.classList.contains('front'), cover.dataset.javImageLayout]).toEqual([true, 'big']);

    await act(async () => show({ layout: { ...BIG, size: 'small' }, code: 'ABC-001' }));
    expect(host.querySelector('[data-media-art] img')).toBe(cover);
    expect([cover.classList.contains('whole'), cover.classList.contains('front'), cover.dataset.javImageLayout]).toEqual([true, false, 'small']);
    expect(cover.getAttribute('src')).toBe(firstSrc);
    expect(host.querySelector<HTMLElement>('[data-media-pic]')!.style.getPropertyValue('--card-ratio')).toBe(String(16 / 9));

    await act(async () => show({ layout: { ...BIG, size: 'small' }, code: 'ABC-002' }));
    expect(host.querySelector('[data-media-art] img')).not.toBe(cover);
    expect(host.querySelector('[data-media-art] img')?.getAttribute('src')).toContain('ABC-002');
  });
});
