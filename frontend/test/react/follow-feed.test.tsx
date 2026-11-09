/* Follows page island: how request addresses are built, how the two rows sample, what a stack says, what gets swapped in the cache after a write, and what clicks hand to the shell.
 *
 * Skeleton only over the list area, Shift multi-select, photo wall size tiers, and entering details and returning need a real browser and are
 * measured in `frontend/e2e/follow-feed.test.ts`. */
import { notifyManager, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FOLLOW_AUTO_LOAD_LIMIT, backfillState, dropCondition, followConditions, followPageUrl, followStack, groupMediaKinds, itemForMedia,
  nextSort, prefetchFollowFeed, randomOrder, sortAriaLabel, withStatus,
  type FollowFeedActions, type FollowFeedHelpers, type FollowFeedProps, type FollowGroup, type FollowItem,
  type FollowPage, type FollowSource, type FollowStackInfo, type FollowView,
} from '../../src/react/follow-feed/follow-feed';
import { FollowFeedPage } from '../../src/react/follow-feed/follow-feed-page';
import { FollowCard } from '../../src/react/follow-feed/follow-card';
import { learnFollowDims } from '../../src/react/follow-feed/follow-marks';
import { queryClient } from '../../src/react/query';
import { click, mount, mountRoot, settle } from './render';

/* The write-back dimensions batch is measured by `follow-marks.test.ts`; this only watches when the card reports. */
vi.mock(import('../../src/react/follow-feed/follow-marks'), async (importOriginal) => ({
  ...(await importOriginal()), learnFollowDims: vi.fn(),
}));

afterEach(() => { queryClient.clear() });
notifyManager.setScheduler((notify) => notify());

const VIEW: FollowView = {
  status: '', media: 'videos', author: '', provider: '', work: '', tags: [], durMin: 0, durMax: 0, sort: 'new', dir: 'desc', seed: 7,
};
const view = (patch: Partial<FollowView> = {}): FollowView => ({ ...VIEW, ...patch });

const item = (id: number, extra: Partial<FollowItem> = {}): FollowItem => ({
  id, title: `Update ${id}`, status: 'new', provider: 'kemono', provider_label: 'Kemono', source_id: 1,
  published_at: `2026-09-${String(10 + (id % 10)).padStart(2, '0')}T08:00:00Z`, media_kind: 'video', playable: true,
  thumb_url: `/thumb/${id}`, tags: [], ...extra,
});
const group = (primary: FollowItem, extra: Partial<FollowGroup> = {}): FollowGroup =>
  ({ primary, variants: [], duplicates: [], stack: null, ...extra });
const source = (id: number, author: string, extra: Partial<FollowSource> = {}): FollowSource => ({
  id, provider: 'kemono', provider_label: 'Kemono', author_key: `name:${author}`, last_status: 'ok', ...extra,
});

it('Failed covers retry on data refresh; working images keep the same node', async () => {
  const common = { group: group(item(1)), authorSources: [], media: 'videos' as const,
    context: { sources: [], aliases: [], credentials: new Set<string>() }, selected: false, selectMode: false,
    busy: '', failure: '', actions: { openDetail: vi.fn(), openAuthor: vi.fn(), canFlip: () => false } };
  const root = await mountRoot(<FollowCard {...common} retryKey={1} />);
  const first = root.host.querySelector('[data-media-pic] > img')!;
  await act(async () => first.dispatchEvent(new Event('error')));
  expect(root.host.querySelector('[data-follow-nothumb]')).not.toBeNull();
  await root.rerender(<FollowCard {...common} retryKey={1} />);
  expect(root.host.querySelector('[data-media-pic] > img')).toBeNull();
  await root.rerender(<FollowCard {...common} retryKey={2} />);
  const recovered = root.host.querySelector('[data-media-pic] > img');
  expect(recovered).not.toBeNull();
  await root.rerender(<FollowCard {...common} retryKey={3} />);
  expect(root.host.querySelector('[data-media-pic] > img')).toBe(recovered);
});

describe('Request address', () => {
  it('The default tier is never written in, tags join with commas, and the seed rides only random sorting', () => {
    expect(followPageUrl(VIEW, 0)).toBe('/api/follow?limit=100&offset=0');
    const url = new URL(followPageUrl(view({
      status: 'saved', author: 'name:kou', provider: 'kemono', tags: ['3d', 'loop'], work: 'zelda', sort: 'hot', dir: 'asc',
    }), 100), 'http://peach.test');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '100', offset: '100', status: 'saved', author: 'name:kou', provider: 'kemono', tag: '3d,loop', work: 'zelda',
      sort: 'hot', dir: 'asc',
    });
    expect(new URL(followPageUrl(view({ sort: 'rand', seed: 42 }), 0), 'http://peach.test').searchParams.get('seed')).toBe('42');
  });

  it('Duration ends hand to the server in seconds, with the 0 end omitted', () => {
    const params = (patch: Partial<FollowView>) =>
      Object.fromEntries(new URL(followPageUrl(view(patch), 0), 'http://peach.test').searchParams);
    expect(params({ durMin: 600, durMax: 1800 })).toMatchObject({ dur_min: '600', dur_max: '1800' });
    expect(params({ durMin: 600 })).not.toHaveProperty('dur_max');
    expect(params({ durMax: 1800 })).not.toHaveProperty('dur_min');
  });
});

describe('Back to follows', () => {
  /* Returning from another page, the shell hands back the same filter and generation: the list continues rendering from the pre-leave state without refetching; credentials refetch every time.
     Only on fresh entry, when the shell pushes a new generation and changes the key, does the list refetch. */
  it('While the same key stays cached it is reused as-is; only a new epoch refetches the list', async () => {
    const fetched = vi.fn(async (input: string) => ({
      ok: true, status: 200,
      json: async () => (String(input).startsWith('/api/follow/credentials')
        ? { providers: [] } : { groups: [], counts: {}, has_more: false, offset: 0 }),
    }));
    vi.stubGlobal('fetch', fetched);
    const paths = () => fetched.mock.calls.map(([input]) => new URL(String(input), 'http://peach.test').pathname);
    const signal = new AbortController().signal;
    await prefetchFollowFeed({ view: VIEW, revision: 3 }, signal);
    await prefetchFollowFeed({ view: VIEW, revision: 3 }, signal);
    expect(paths().sort()).toEqual(['/api/follow', '/api/follow/credentials', '/api/follow/credentials']);
    await prefetchFollowFeed({ view: VIEW, revision: 4 }, signal);
    expect(paths().filter((path) => path === '/api/follow')).toHaveLength(2);
  });
});

describe('Sampling', () => {
  it('The same seed keeps the same order; a new seed brings a new batch', () => {
    const keys = Array.from({ length: 30 }, (_, index) => `k${index}`);
    const once = randomOrder(keys, (key) => key, 11);
    expect(randomOrder(keys, (key) => key, 11)).toEqual(once);
    expect(randomOrder(keys, (key) => key, 12)).not.toEqual(once);
    expect([...once].sort()).toEqual([...keys].sort());
  });

});

describe('Media and a stack', () => {
  /* The follow card's `stack` takes the shape `/api/follow` hands down (`follow_faces.annotate_group`): entries with equal numbering in `faces` are
     the same picture, deduplicated by the server already. */
  const stackOf = (media: number, copies: number, kind: string, faces: [string, number, string][]): FollowStackInfo =>
    ({ media, copies, kind, faces: faces.map(([thumb_url, face, media_kind]) => ({ thumb_url, face, media_kind })) });

  it('Flip only between distinct frames', () => {
    // 2026-09-24 production sample: a paheal group of 9 posts (1 image, 8 videos), all with different artwork, flipped as-is.
    const burst = stackOf(9, 9, 'mixed', [
      ...Array.from({ length: 8 }, (_, index): [string, number, string] => [`/follow-cover?id=${index}`, index, 'video']),
      ['/img/8', 8, 'image'],
    ]);
    // The primary entry gains two alts whose dressed versions match, and the server judges the three images as one scene: one image remains, no flipping.
    const oneFace = stackOf(3, 3, 'video', [['/follow-cover?id=1', 0, 'video']]);
    expect(followStack({ cover: '/follow-cover?id=0', coverFace: 0, stack: burst }).faces)
      .toEqual([...Array.from({ length: 8 }, (_, index) => `/follow-cover?id=${index}`), '/img/8']);
    const still = [
      followStack({ cover: '/follow-cover?id=1', coverFace: 0, stack: oneFace }),
      // The cover ends up on the alt text and the addresses differ while the picture is the same: match by number, not by address.
      followStack({ cover: '/follow-cover?id=2', coverFace: 0, stack: oneFace }),
    ];
    expect(still.map((stack) => stack.faces)).toEqual([[], []]);
    // The unflipped side is still a stack: paper edges and corner badges all remain.
    expect(still.map((stack) => stack.isMix)).toEqual([true, true]);
    expect(followStack({ cover: '/follow-cover?id=0', coverFace: 0, stack: burst, limit: 3 }).faces).toHaveLength(3);
    // The image view flips through images only.
    expect(followStack({ cover: '/img/8', coverFace: 8, stack: burst, imageView: true }).faces).toEqual([]);
  });

  it('Badges count distinct media only, with units following the media type and the glyph saying what opens', () => {
    const video: [string, number, string][] = [['/v', 0, 'video']];
    const said = [
      // The same video exists once on each of two sites: one media, two sources.
      followStack({ stack: stackOf(1, 2, 'video', video) }),
      // Three distinct videos, one of which also has a cross-site copy: report only the count of distinct videos.
      followStack({ stack: stackOf(3, 4, 'video', video) }),
      followStack({ stack: stackOf(11, 11, 'image', [['/img', 0, 'image']]), imageView: true }),
      // Images and videos mixed in one group: the unit is the neutral 'media item', with the glyph following the current view.
      followStack({ stack: stackOf(9, 9, 'mixed', video) }),
      followStack({ stack: stackOf(9, 9, 'mixed', video), imageView: true }),
      // Only one was merged, or there is no stack: not a pile, no badge.
      followStack({ stack: null }),
      followStack({ cover: '/img/0' }),
    ].map((stack) => [stack.isMix, stack.label, stack.glyph]);
    expect(said).toEqual([
      [true, '2 sources', 'play'], [true, '3 videos', 'play'], [true, '11 images', 'pics'], [true, '9 media items', 'play'],
      [true, '9 media items', 'pics'], [false, '', 'play'], [false, '', 'play'],
    ]);
  });

  it('The external-files page does not count as video; the card face takes the group\'s newest entry containing the current media', () => {
    const external = group(item(1, { media_kind: 'external' }));
    expect([...groupMediaKinds(external)]).toEqual([]);
    const mixed = group(item(1, { published_at: '2026-09-01T00:00:00Z' }), {
      variants: [
        item(2, { media_kind: 'image', published_at: '2026-09-05T00:00:00Z' }),
        item(3, { media_kind: 'image', published_at: '2026-09-03T00:00:00Z' }),
      ],
    });
    expect(itemForMedia(mixed, 'images').id).toBe(2);
    expect(itemForMedia(mixed, 'videos').id).toBe(1);
  });
});

describe('Bottom bar and sorting', () => {
  it('Which page the backfill reached: the page number starts at 0 while the human-readable one starts at 1', () => {
    expect(backfillState([source(1, 'a', { can_backfill: false })])).toBe('');
    expect(backfillState([source(1, 'a', { can_backfill: true, backfill_page: 0 })])).toBe('Every source fetched only page 1');
    expect(backfillState([source(1, 'a', { can_backfill: true, backfill_page: 2 })])).toBe('Every source was fetched through page 3');
    expect(backfillState([
      source(1, 'a', { can_backfill: true, backfill_page: 0 }), source(2, 'b', { can_backfill: true, backfill_page: 2 }),
    ])).toBe('Fetched pages 1–3');
  });

  it('Clicking another column starts from the default direction, clicking the active column flips it; the accessible name says what pressing will do', () => {
    expect(nextSort('hot', 'new', 'desc')).toEqual({ sort: 'hot', dir: 'desc' });
    expect(nextSort('new', 'new', 'desc')).toEqual({ sort: 'new', dir: 'asc' });
    expect(sortAriaLabel('new', 'Updated', 'new', 'desc')).toBe('Sort by UpdatedOldest first');
    expect(sortAriaLabel('dur', 'Duration', 'new', 'desc')).toBe('Sort by DurationLongest first');
  });

  it('The combination bar removes conditions per dimension, and the same string counts separately in two dimensions', () => {
    const current = view({ author: 'loop', tags: ['loop', 'solo'] });
    const rows = followConditions(current, { authors: new Map([['loop', 'Loop themself']]), providers: new Map(), works: new Map() });
    expect(rows.map((row) => `${row.kind}:${row.label}`)).toEqual(['Creator: Loop themself', 'Tag:loop', 'Tag:solo']);
    expect(dropCondition(current, rows[1]!)).toEqual({ ...current, tags: ['solo'] });
    expect(dropCondition(current, rows[0]!)).toEqual({ ...current, author: '' });
  });
});

describe('Swap in the cached partial after writing', () => {
  const data = (): InfiniteData<FollowPage> => ({
    pageParams: [0],
    pages: [{
      groups: [group(item(1)), group(item(2), { variants: [item(3)] })], counts: { new: 3, seen: 0 }, sources: [],
      facets: {}, offset: 0, has_more: false,
    }],
  });

  it('Switching states moves counts; while "Unwatched" filters, marking watched removes that whole group', () => {
    const all = withStatus(data(), VIEW, 1, 'seen');
    expect(all.pages[0]!.groups.map((row) => [row.primary.id, row.primary.status])).toEqual([[1, 'seen'], [2, 'new']]);
    expect(all.pages[0]!.counts).toEqual({ new: 2, seen: 1 });
    const unseen = withStatus(data(), view({ status: 'new' }), 1, 'seen');
    expect(unseen.pages[0]!.groups.map((row) => row.primary.id)).toEqual([2]);
    // Alt-switching state does not move the whole group: the card face is still the primary entry's image.
    const variant = withStatus(data(), view({ status: 'new' }), 3, 'ignored');
    expect(variant.pages[0]!.groups.map((row) => row.primary.id)).toEqual([1, 2]);
    expect(variant.pages[0]!.groups[1]!.variants[0]!.status).toBe('ignored');
  });
});

/* ── Page ── */

function helpers(): FollowFeedHelpers {
  return {
    workMark: (row) => row[1].slice(0, 2), tagLabel: (tag) => tag, wireDrag: vi.fn(), wireScroller: vi.fn(),
    listSkeletonHtml: () => '<div data-test-skeleton>skeleton</div>', jobProgress: vi.fn(),
  };
}

function actions(): FollowFeedActions {
  return {
    route: vi.fn(), shuffle: vi.fn(), loaded: vi.fn(), openDetail: vi.fn(), openAuthor: vi.fn(), toggleSelection: vi.fn(),
    setImagesOnly: vi.fn(), setPhotoLayout: vi.fn(), canFlip: () => false, toast: vi.fn(), failure: vi.fn(), checkReport: vi.fn(),
  };
}

const AUTHORS = ['kou', 'mira', 'opal', 'remi', 'nanase', 'lazy'];
const SOURCES = AUTHORS.map((author, index) => source(index + 1, author));

function feed(groups: FollowGroup[], extra: Partial<FollowPage> = {}): FollowPage {
  return {
    groups, counts: { new: groups.length, saved: 0, ignored: 0 }, sources: SOURCES, author_aliases: [], offset: 0, has_more: false,
    facets: {
      authors: AUTHORS.map((author) => `name:${author}`), providers: ['kemono'],
      tags: [['3d', 9], ['loop', 5], ['solo', 2]], works: [['zelda', 'The Legend of Zelda', 3, 1]],
    },
    ...extra,
  };
}

/** Fake server: `/api/follow` returns the given page, and successful write states are recorded into that page so re-reads see them. */
function serve(page: FollowPage, writes: { status?: number; body?: unknown } = {}) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/follow/credentials')) return { ok: true, status: 200, json: async () => ({ providers: [] }) };
    if (url.startsWith('/api/follow?')) return { ok: true, status: 200, json: async () => structuredClone(page) };
    if (init?.method === 'POST') {
      const status = writes.status ?? 200;
      if (status < 400 && (url === '/api/follow/status' || url === '/api/follow/save')) {
        const sent = JSON.parse(String(init.body)) as { item: number; to?: string };
        page.groups.forEach((row) => { if (row.primary.id === sent.item) row.primary.status = sent.to || 'saved' });
      }
      return { ok: status < 400, status, json: async () => writes.body ?? { ok: true } };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}

function props(patch: Partial<FollowFeedProps> = {}): FollowFeedProps {
  return {
    view: VIEW, seed: 5, revision: 1, selectMode: false, selected: new Set(), photoSize: 'small', photoLayout: 'masonry',
    imagesOnly: false, helpers: helpers(), actions: actions(), ...patch,
  };
}

let push: (patch: Partial<FollowFeedProps>) => void = () => {};
/** The patch the shell pushes through `updateManagedRoute`, replaced here by a layer of state. */
function Shell(given: FollowFeedProps) {
  const [current, set] = useState(given);
  push = (patch) => set((value) => ({ ...value, ...patch }));
  return <FollowFeedPage {...current} />;
}
async function open(given: FollowFeedProps) {
  const host = await mount(<QueryClientProvider client={queryClient}><Shell {...given} /></QueryClientProvider>);
  await settle();
  return host;
}
const authorOrder = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('button[data-follow-author]')].map((button) => button.dataset.followAuthor);
const cardIds = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('[data-follow-list] > [data-follow-item]')].map((card) => card.dataset.followItem);

describe('Page', () => {
  it('The creator row samples by seed; a new view pushed back by a filter change does not reshuffle, only a new seed does', async () => {
    serve(feed([group(item(1))]));
    const given = props();
    const host = await open(given);
    const first = authorOrder(host);
    expect(first).toHaveLength(AUTHORS.length);
    expect(first).toEqual(randomOrder(AUTHORS.map((author) => `name:${author}`), (key) => key, 5));
    await act(async () => push({ view: view({ status: 'new' }) }));
    await settle();
    expect(authorOrder(host)).toEqual(first);
    await act(async () => push({ seed: 99 }));
    expect(authorOrder(host)).not.toEqual(first);
  });

  it('Clicking creator, tag, status, sort, or media all hand the shell just one new view', async () => {
    serve(feed([group(item(1)), group(item(2, { media_kind: 'image' }))]));
    const given = props({ view: view({ tags: ['loop'] }) });
    const host = await open(given);
    const route = given.actions.route as ReturnType<typeof vi.fn>;
    await click(host.querySelector('button[data-follow-author="name:mira"]'));
    expect(route).toHaveBeenLastCalledWith({ ...given.view, author: 'name:mira' });
    await click(host.querySelector('button[data-follow-tag="3d"]'));
    expect(route).toHaveBeenLastCalledWith({ ...given.view, tags: ['loop', '3d'] });
    await click(host.querySelector('button[data-follow-tag="loop"]'));
    expect(route).toHaveBeenLastCalledWith({ ...given.view, tags: [] });
    await click(host.querySelector('[data-follow-filter="saved"]'));
    expect(route).toHaveBeenLastCalledWith({ ...given.view, status: 'saved' });
    await click(host.querySelector('[data-follow-sort="new"]'));
    expect(route).toHaveBeenLastCalledWith({ ...given.view, dir: 'asc' });
    await click(host.querySelector('[data-media-view="images"]'));
    expect(route).toHaveBeenLastCalledWith({ ...given.view, media: 'images' });
    // The combined bar lists the active tags; removing one hands back the view after the removal.
    await click(host.querySelector('[data-follow-drop="loop"]'));
    expect(route).toHaveBeenLastCalledWith({ ...given.view, tags: [] });
    expect(route).toHaveBeenCalledTimes(7);
  });

  it('Videos and images each place groups containing that media, while readings count by whole-library convention', async () => {
    serve(feed([group(item(1)), group(item(2, { media_kind: 'image' })), group(item(3, { media_kind: 'external' }))],
      { counts: { new: 40, saved: 2, ignored: 1 } }));
    const given = props();
    const host = await open(given);
    expect(cardIds(host)).toEqual(['1']);
    expect(host.querySelector('[data-follow-readout]')?.textContent).toBe('43 updates · showing 1');
    await act(async () => push({ view: view({ media: 'images' }) }));
    await settle();
    expect(cardIds(host)).toEqual(['2']);
    expect(host.querySelector('[data-follow-list]')?.hasAttribute('data-follow-wall')).toBe(true);
    // Hand each fetched version to the shell: details read from it.
    expect(given.actions.loaded).toHaveBeenCalled();
  });

  it('When the list cannot load the header still renders: title and "Manage follows" both present, with a retry under the failure reason', async () => {
    const fetcher = vi.fn(async (url: string) => (url.startsWith('/api/follow?')
      ? { ok: false, status: 500, json: async () => ({ error: 'Server error' }) }
      : { ok: true, status: 200, json: async () => ({ providers: [] }) }));
    vi.stubGlobal('fetch', fetcher);
    const given = props();
    const host = await open(given);
    expect(host.querySelector('[data-follow-title]')?.textContent).toBe('Follows');
    const manage = host.querySelector('[data-follow-manage]');
    expect(manage?.tagName).toBe('A');
    expect(manage?.getAttribute('href')).toBe('/subscriptions');
    expect(host.querySelector('[data-media-error] [data-note-action]')?.textContent).toBe('Retry now');
  });

  it('Sources exist but no updates yet: without filters it says there are no updates, and only with filters does it suggest changing them', async () => {
    serve(feed([]));
    const bare = await open(props());
    expect(bare.querySelector('[data-follow-empty]')?.textContent).toContain('No updates yet');
    expect(bare.querySelector('[data-follow-empty]')?.textContent).not.toContain('Filters');
    queryClient.clear();
    serve(feed([]));
    const given = props({ view: view({ status: 'saved' }), revision: 2 });
    const filtered = await open(given);
    const empty = filtered.querySelector('[data-follow-empty]');
    expect(empty?.querySelector('h3')?.textContent).toBe('No updates under the current filter');
    expect(empty?.querySelector('button')?.textContent).toBe('Clear filters');
    await click(empty?.querySelector('button') ?? null);
    expect(given.actions.route).toHaveBeenLastCalledWith(view());
  });

  it('Every creator is reachable from the same horizontal row', async () => {
    const many = Array.from({ length: 30 }, (_, index) => `a${index}`);
    const sources = many.map((author, index) => source(index + 1, author, { author_name: author === 'a29' ? 'Zed Lastone' : author }));
    serve(feed([group(item(1))], { sources, facets: { authors: many.map((author) => `name:${author}`), providers: ['kemono'] } }));
    const host = await open(props());
    expect(authorOrder(host)).toHaveLength(many.length);
    expect(authorOrder(host)).toContain('name:a29');
    expect(host.querySelector('input[type="search"]')).toBeNull();
  });

  it(`After ${FOLLOW_AUTO_LOAD_LIMIT} groups fill the page, Load more requires a click to bring in the next page`, async () => {
    const groups = Array.from({ length: FOLLOW_AUTO_LOAD_LIMIT }, (_, index) => group(item(index + 1)));
    const page = feed(groups, { has_more: true });
    const fetcher = serve(page);
    const host = await open(props());
    const more = host.querySelector('[data-follow-pagination] button[data-entity-more]');
    expect(more?.textContent).toBe('Load more');
    const before = fetcher.mock.calls.filter(([url]) => String(url).startsWith('/api/follow?')).length;
    page.groups = [group(item(FOLLOW_AUTO_LOAD_LIMIT + 1))];
    page.has_more = false;
    await click(more);
    await settle();
    const pages = fetcher.mock.calls.filter(([url]) => String(url).startsWith('/api/follow?'));
    expect(pages).toHaveLength(before + 1);
    expect(new URL(String(pages.at(-1)![0]), 'http://peach.test').searchParams.get('offset')).toBe('100');
    expect(host.querySelector(`[data-follow-item="${FOLLOW_AUTO_LOAD_LIMIT + 1}"]`)).not.toBeNull();
  });

  it('With no follow sources it points to Add follows', async () => {
    serve(feed([], { sources: [], facets: {} }));
    const host = await open(props());
    expect(host.textContent).toContain('Not following any sources yet');
    expect(host.querySelector('a[href="/subscriptions?tab=add"]')).not.toBeNull();
  });

  it('Mark watched: the request body carries only the items and the target state; the card flips state immediately, and the receipt comes with undo', async () => {
    const fetcher = serve(feed([group(item(1)), group(item(2))]));
    const given = props();
    const host = await open(given);
    await click(host.querySelector('[data-follow-status="1"][data-to="seen"]'));
    await settle();
    const write = fetcher.mock.calls.find(([url]) => url === '/api/follow/status');
    expect(JSON.parse(String(write?.[1]?.body))).toEqual({ item: 1, to: 'seen' });
    expect(host.querySelector<HTMLElement>('[data-follow-item="1"]')?.dataset.status).toBe('seen');
    const toast = given.actions.toast as ReturnType<typeof vi.fn>;
    expect(toast.mock.calls[0]![0]).toBe('Marked as watched');
    await act(async () => { await toast.mock.calls[0]![1].undo() });
    const undo = fetcher.mock.calls.filter(([url]) => url === '/api/follow/status').at(-1);
    expect(JSON.parse(String(undo?.[1]?.body))).toEqual({ item: 1, to: 'new' });
  });

  it('Saving to the database offers no undo; when the read-only side rejects a write with 409 the reason stays on the card', async () => {
    serve(feed([group(item(1))]), { status: 409, body: { error: 'Read-only replicas never write' } });
    const given = props();
    const host = await open(given);
    await click(host.querySelector('[data-follow-save="1"]'));
    await settle();
    expect(host.querySelector('[data-follow-item="1"] [data-follow-state]')?.textContent).toBe('The current state does not allow this action; refresh and try again.');
    expect(given.actions.failure).toHaveBeenCalledWith('Save to the database', expect.anything());

    serve(feed([group(item(1))]));
    await click(host.querySelector('[data-follow-save="1"]'));
    await settle();
    const toast = given.actions.toast as ReturnType<typeof vi.fn>;
    expect(toast).toHaveBeenLastCalledWith('Saved to the database');
    expect(host.querySelector('[data-follow-item="1"] [data-follow-state]')?.textContent).toBe('');
  });

  it('Clicking a card in multi-select asks the shell to toggle selection, Shift extends a range, and selection state is pushed back by the shell', async () => {
    serve(feed([group(item(1)), group(item(2))]));
    const given = props({ selectMode: true });
    const host = await open(given);
    const card = host.querySelector<HTMLElement>('[data-follow-item="2"]')!;
    expect(card.querySelector('[data-follow-actions]')).toBeNull();
    expect(card.querySelector('[data-media-check]')).not.toBeNull();
    await act(async () => { card.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })) });
    expect(given.actions.toggleSelection).toHaveBeenCalledWith(2, true);
    expect(given.actions.openDetail).not.toHaveBeenCalled();
    await act(async () => push({ selected: new Set([2]) }));
    expect(card.hasAttribute('data-selected')).toBe(true);
    expect(host.querySelector('[data-follow-feed]')?.hasAttribute('data-select-mode')).toBe(true);
    await act(async () => push({ selectMode: false }));
    expect(card.querySelector('[data-follow-actions]')).not.toBeNull();
    await click(host.querySelector('[data-follow-item="1"]'));
    expect(given.actions.openDetail).toHaveBeenCalledWith(1);
  });

  it('The update check is initiated by the island, the job id is stored in sessionStorage, and on completion it hands back the report and refetches', async () => {
    const fetcher = serve(feed([group(item(1))]), { body: { job_id: 'job-9', status: 'running' } });
    const given = props();
    const host = await open(given);
    const progress = given.helpers.jobProgress as ReturnType<typeof vi.fn>;
    expect(progress).toHaveBeenCalled();
    await click(host.querySelector('[data-follow-recheck]'));
    await settle();
    const start = fetcher.mock.calls.find(([url, init]) => url === '/api/follow/check' && init?.method === 'POST');
    expect(JSON.parse(String(start?.[1]?.body))).toEqual({ background: true });
    expect(sessionStorage.getItem('peach-follow-job')).toBe('job-9');
    const options = progress.mock.calls.at(-1)![0];
    await act(async () => options.busy(true));
    expect(host.querySelector('[data-follow-recheck]')?.getAttribute('aria-busy')).toBe('true');
    const reads = fetcher.mock.calls.filter(([url]) => String(url).startsWith('/api/follow?')).length;
    await act(async () => options.complete({ status: 'done', results: [{ ok: true, added: 2 }] }));
    await settle();
    expect(given.actions.checkReport).toHaveBeenCalledWith({ status: 'done', results: [{ ok: true, added: 2 }] });
    expect(host.textContent).toContain('Check results');
    expect(host.textContent).toContain('Check resultsChecked 1 sources: 2 new itemsFollowsManage followsCheck for updates??????ThThe Legend of ZeldaAllUnwatchedSavedIgnoredloop53d9solo21 updates · showing 1UpdatedPopularityDuration?Update 1Creator unfetched09-11skeleton');
    expect(fetcher.mock.calls.filter(([url]) => String(url).startsWith('/api/follow?')).length).toBeGreaterThan(reads);
  });

  it('Fetching an earlier page sends older, and the button keeps reading "Fetching" until the run finishes', async () => {
    const fetcher = serve(feed([group(item(1))], { sources: [source(1, 'kou', { can_backfill: true, backfill_page: 1 })] }),
      { body: { job_id: 'job-3', status: 'running' } });
    const given = props();
    const host = await open(given);
    await click(host.querySelector('[data-follow-older]'));
    await settle();
    const start = fetcher.mock.calls.find(([url, init]) => url === '/api/follow/check' && init?.method === 'POST');
    expect(JSON.parse(String(start?.[1]?.body))).toEqual({ older: true, background: true });
    const options = (given.helpers.jobProgress as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(host.querySelector('[data-follow-older]')?.textContent).toContain('Scraping');
    expect(host.querySelector('[data-follow-older]')?.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('[data-follow-recheck]')?.getAttribute('aria-busy')).toBe('true');
    await act(async () => options.busy(true));
    expect(host.querySelector('[data-follow-older]')?.textContent).toContain('Scraping');
    expect(host.querySelector('[data-follow-backfill]')?.textContent).toBe('Every source fetched through page 2');
    // While busy, both keys only get aria-busy and none of BoardUI's disabled tier; clicking either again starts no new run.
    for (const selector of ['[data-follow-older]', '[data-follow-recheck]']) {
      const button = host.querySelector(selector)!;
      expect(button.getAttribute('aria-busy')).toBe('true');
      expect(button.hasAttribute('aria-disabled')).toBe(false);
      await click(button);
    }
    await settle();
    expect(fetcher.mock.calls.filter(([url, init]) => url === '/api/follow/check' && init?.method === 'POST')).toHaveLength(1);
  });

  it('Manage follows is the secondary button and check for updates the primary; with no sources only Manage follows remains', async () => {
    serve(feed([group(item(1))]));
    const host = await open(props());
    expect(host.querySelector('[data-follow-manage]')?.className).not.toContain('bg-button-primary');
    expect(host.querySelector('[data-follow-recheck]')?.className).toContain('bg-button-primary');
    queryClient.clear();
    serve(feed([], { sources: [], facets: {} }));
    const empty = await open(props({ revision: 2 }));
    expect(empty.querySelector('[data-follow-manage]')).not.toBeNull();
    expect(empty.querySelector('[data-follow-recheck]')).toBeNull();
  });

  it('Clicking the pressed creator again removes that entry, and the pressed one carries aria-pressed', async () => {
    serve(feed([group(item(1))]));
    const given = props({ view: view({ author: 'name:mira' }) });
    const host = await open(given);
    const pressed = host.querySelector('button[data-follow-author="name:mira"]');
    expect(pressed?.getAttribute('aria-pressed')).toBe('true');
    await click(pressed);
    expect(given.actions.route).toHaveBeenLastCalledWith({ ...given.view, author: '' });
  });

  it('Image cards with dimensions reserve space up front; those without write back intrinsic size after load; video cards never write back', async () => {
    serve(feed([group(item(1)), group(item(2, { media_kind: 'image', width: 640, height: 480 })),
      group(item(3, { media_kind: 'image' }))]));
    const given = props({ view: view({ media: 'images' }) });
    const host = await open(given);
    const image = (id: number) => host.querySelector<HTMLImageElement>(`[data-follow-item="${id}"] img`)!;
    expect([image(2).getAttribute('width'), image(2).getAttribute('height')]).toEqual(['640', '480']);
    expect(image(3).hasAttribute('width')).toBe(false);
    const load = async (element: HTMLImageElement) => {
      Object.defineProperty(element, 'naturalWidth', { value: 300 });
      Object.defineProperty(element, 'naturalHeight', { value: 500 });
      await act(async () => { element.dispatchEvent(new Event('load')) });
    };
    const learn = vi.mocked(learnFollowDims);
    learn.mockClear();
    await load(image(3));
    expect(learn).toHaveBeenCalledWith(3, null, 300, 500);
    expect([image(3).getAttribute('width'), image(3).getAttribute('height')]).toEqual(['300', '500']);
    await load(image(2));
    expect(learn).toHaveBeenCalledTimes(1);
    await act(async () => push({ view: view() }));
    await settle();
    await load(image(1));
    expect(learn).toHaveBeenCalledTimes(1);
  });

  it('After an image thumbnail fails it tries the matching full-image proxy, and a proxy failure ends the attempts', async () => {
    serve(feed([group(item(2, { media_kind: 'image', playable: true })),
      group(item(3, { media_kind: 'image', playable: true, media_items: [
        { index: 4, media_kind: 'image', thumb_url: 'https://example.test/image.jpg' },
      ] }))]));
    const host = await open(props({ view: view({ media: 'images' }) }));
    const image = (id: number) => host.querySelector<HTMLImageElement>(`[data-follow-item="${id}"] [data-media-pic] > img`);
    const fail = async (id: number) => {
      await act(async () => { image(id)!.dispatchEvent(new Event('error')) });
    };
    await fail(2);
    expect(image(2)?.getAttribute('src')).toBe('/follow-stream?id=2');
    await fail(3);
    expect(image(3)?.getAttribute('src')).toBe('/follow-stream?id=3&media=4');
    await fail(2);
    expect(image(2)).toBeNull();
    await fail(3);
    expect(image(3)).toBeNull();
  });

  it('A failed video thumbnail does not request the full video', async () => {
    serve(feed([group(item(1, { playable: true }))]));
    const host = await open(props());
    await act(async () => {
      host.querySelector('[data-media-pic] > img')!.dispatchEvent(new Event('error'));
    });
    expect(host.querySelector('[data-media-pic] > img')).toBeNull();
  });

  it('"Images only" appears only in photo view, and clicking hands the preference to the shell', async () => {
    serve(feed([group(item(1)), group(item(2, { media_kind: 'image' }))]));
    const given = props();
    const host = await open(given);
    expect(host.querySelector('[data-follow-images-only]')).toBeNull();
    await act(async () => push({ view: view({ media: 'images' }) }));
    await settle();
    const toggle = host.querySelector('[data-follow-images-only]');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    await click(toggle);
    expect(given.actions.setImagesOnly).toHaveBeenCalledWith(true);
    await act(async () => push({ imagesOnly: true }));
    expect(host.querySelector('[data-follow-images-only]')?.getAttribute('aria-pressed')).toBe('true');
  });
});
