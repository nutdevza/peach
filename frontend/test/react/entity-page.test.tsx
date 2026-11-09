/* The entity profile page: fetching, in-page state and write operations. How the profile card, overlay and body each render
 * is governed by their own cases (`entity-hero`/`entity-filter`/`entity-body.test.tsx`); this file covers the layer that
 * assembles them into a page: which pieces the first screen fetches, how many refetches a filter change costs, which actions
 * return to the shell to write the address, and which blocks update after a write succeeds.
 *
 * The geometry of skeleton-to-full-page swaps, stickiness and narrow-screen horizontal scroll are measured by e2e
 * (`entity-filter.test.ts`, `design-*.test.ts`). */
import { act, useState } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as legacyUi from '@peach/legacy/ui';

import { entityOptions, fetchItems, itemsParams, prefetchEntityPage, type EntityPageProps } from '../../src/react/entity-page/entity-page';
import { PENDING_REFETCH_MS } from '../../src/react/components/pending-work';
import { EntityPage } from '../../src/react/entity-page/entity-page-view';
import { queryClient } from '../../src/react/query';
import { buttonNamed, click, mountRoot, pending, settle } from './render';

afterEach(() => { queryClient.clear() });
notifyManager.setScheduler((notify) => notify());

const NAME = '篠田ゆう';
const entity = (patch: Record<string, unknown> = {}) => ({
  id: 7001, kind: 'performer', canonical_name: NAME, aliases: [], user_aliases: [], asset_count: 3,
  tags: [{ k: 'Big breasts', n: 12 }, { k: 'Pretty breasts', n: 4 }], related_performers: [], feed: { following: false },
  ...patch,
});
const items = (ids: number[], jav = false) => ({
  items: ids.map((id) => ({ id, name: `Video ${id}`, has_thumb: true, is_jav: jav })), total: ids.length, has_more: false,
});
const photos = (count: number, patch: Record<string, unknown> = {}) => ({
  total: count, sample_total: 0, sets: [], has_more: false, seed: '',
  items: Array.from({ length: count }, (_, at) => ({ id: 500 + at, name: `${String(at + 1).padStart(3, '0')}.jpg` })),
  ...patch,
});
const followGroup = (id: number, kind: 'video' | 'image') => ({
  primary: { id, title: `Update ${id}`, status: 'new', provider: 'rule34video', source_id: 1, media_kind: kind,
    thumb_url: `/thumb/${id}`, tags: [] },
  variants: [], duplicates: [], stack: null,
});
const followPage = (groups: unknown[]) => ({
  groups, counts: { new: groups.length }, offset: 0, has_more: false, facets: {},
  sources: [{ id: 1, provider: 'rule34video', provider_label: 'Rule34Video', author_key: 'name:jul3d' }],
  author_facets: { providers: ['rule34video'], tags: [['cum', groups.length]] },
});
const heroFollow = (n: number) => ({ key: 'name:jul3d', n, providers: ['rule34video'], avatar: '', avatar_fallback: '', held: [] });
const creator = (patch: Record<string, unknown> = {}) =>
  entity({ kind: 'creator', canonical_name: 'Jul3D', follow: heroFollow(3), ...patch });

interface Plan {
  entity?: Record<string, unknown>;
  items?: (query: URLSearchParams) => unknown;
  photos?: (query: URLSearchParams) => unknown;
  set?: (query: URLSearchParams) => unknown;
  feed?: unknown;
  /** The `/api/follow` reply: the profile page's online view page. */
  follow?: (query: URLSearchParams) => unknown;
  /** Each details fetch computes a fresh copy that overrides `entity`: used when the server gives different answers before and after the write. */
  entityFor?: () => Record<string, unknown>;
  /** Called when an avatar change is written back and lands. */
  picked?: () => void;
  /** Replies from `/api/feeds/check`, one per question in order; once the questions run out it stays on the last one. */
  checks?: string[];
}

/** A fake fetch that routes by endpoint, recording every request's URL and body. */
function serve(plan: Plan = {}) {
  const writes: { url: string; body: Record<string, unknown> }[] = [];
  const reply = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(String(input), 'http://peach.test');
    const query = url.searchParams;
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      writes.push({ url: url.pathname, body });
      if (url.pathname === '/api/entity-alias') return reply({ added: !body.remove, alias: body.alias });
      if (url.pathname === '/api/avatar-pick') {
        plan.picked?.();
        return reply({ ok: true });
      }
      if (url.pathname === '/api/avatar-frame') {
        return reply({ ref: body.ref, source: 'gfriends', label: 'a', width: 300, height: 400, detail: '',
          found_by: '', current: false, crop: false, bases: [body.ref], focus: null, cast: 0, version: '' });
      }
      if (url.pathname === '/api/entity-name') {
        return reply({ changed: true, canonical_name: body.canonical, previous_name: body.name });
      }
      return reply({ ok: true });
    }
    if (url.pathname === '/api/avatar-choices') {
      return reply({ kind: 'performer', entity_id: 7001, names: [NAME], matched_names: [NAME], index_age_hours: 1,
        index_stale: false, choices: [{ ref: 'gfriends:a.jpg', source: 'gfriends', label: 'a', width: 0, height: 0,
          detail: '', found_by: '', current: false, crop: false, bases: [], focus: null, cast: 0 }] });
    }
    if (url.pathname === '/api/entity') return reply(plan.entityFor?.() ?? plan.entity ?? entity());
    if (url.pathname === '/api/items') return reply(plan.items ? plan.items(query) : items([1, 2, 3]));
    if (url.pathname === '/api/photos') return reply(plan.photos ? plan.photos(query) : photos(0));
    if (url.pathname === '/api/photo-set') return reply(plan.set ? plan.set(query) : photos(2, { id: 9, title: 'Gallery' }));
    if (url.pathname === '/api/follow/credentials') return reply({ providers: [] });
    if (url.pathname === '/api/follow') return reply(plan.follow ? plan.follow(query) : followPage([]));
    if (url.pathname === '/api/feeds/discoveries') return reply(plan.feed ?? { items: [] });
    if (url.pathname === '/api/feeds/check') {
      const checks = plan.checks ?? ['idle'];
      return reply({ status: checks.length > 1 ? checks.shift() : checks[0] });
    }
    throw new Error(`No handler is scheduled for this endpoint: ${url.pathname}`);
  });
  vi.stubGlobal('fetch', fetcher);
  const calls = (path: string) => fetcher.mock.calls
    .map(([input]) => new URL(String(input), 'http://peach.test'))
    .filter((url) => url.pathname === path);
  return { fetcher, writes, calls };
}

function shellProps(patch: Partial<EntityPageProps> = {}): EntityPageProps {
  const host = () => { const el = document.createElement('div'); el.className = 'peach-react'; document.body.append(el); return el };
  const feed = document.createElement('section');
  feed.hidden = true;
  document.body.append(feed);
  return {
    kind: 'performer', name: NAME, filters: {}, media: { media: 'videos', set: 0 }, jav: false, seed: '42',
    revision: 0, feedRevision: 0, photoSize: 'small', photoLayout: 'masonry', followImagesOnly: false,
    javLayout: 'small', javLayouts: [['big', 'Large images', 'maximize'], ['small', 'Small images', 'layout-grid']],
    photoLayouts: [['fixed', 'Fixed ratio', 'layout-grid'], ['masonry', 'Masonry', 'columns-2']],
    states: [{ k: '', label: 'All' }, { k: 'fresh', label: 'Not watched' }], peopleLayout: 'big',
    hosts: { filter: host(), feed, body: host() },
    layout: { active: false, size: 'small', portrait: false, javImage: 'cover' },
    selectMode: false, selected: new Set(), seekSeconds: 10, wireDrag: vi.fn(),
    skeletonHtml: () => '<div data-test-skeleton></div>', groupCollapse: true, canLoadMore: () => true,
    card: {
      helpers: {
        badgeHtml: () => '', titleHtml: (_it, raw) => raw,
        displayName: (_it, raw) => raw, tagLabel: (tag) => tag,
        personAvatar: vi.fn(() => ({ html: '', face: '' })),
      },
      actions: {
        open: vi.fn(), openResource: vi.fn(), openShort: vi.fn(), openShorts: vi.fn(), openMix: vi.fn(),
        openEntity: vi.fn(), openUnowned: vi.fn(), toggleTag: vi.fn(), toggleSelection: vi.fn(),
        watchLater: vi.fn(async () => {}), rate: vi.fn(async () => {}), resourceOperation: vi.fn(async () => {}), mixRelated: vi.fn(async () => []),
        canFlip: () => true, revealSource: vi.fn(async () => ''),
      },
    },
    follow: {
      helpers: { workMark: () => '', tagLabel: (tag) => tag, wireDrag: vi.fn(), wireScroller: vi.fn(),
        listSkeletonHtml: () => '<div data-test-follow-skeleton></div>', jobProgress: vi.fn() },
      actions: { route: vi.fn(), shuffle: vi.fn(), loaded: vi.fn(), openDetail: vi.fn(), openAuthor: vi.fn(),
        toggleSelection: vi.fn(), setImagesOnly: vi.fn(), setPhotoLayout: vi.fn(), canFlip: () => false, toast: vi.fn(),
        failure: vi.fn(), checkReport: vi.fn() },
    },
    helpers: {
      portraitImg: () => '', wireDrag: vi.fn(), wireScroller: vi.fn(), wireFeedRow: vi.fn(),
      feedRowHtml: (data) => `<div class="feednewrow">${(data?.items || []).map((one) => `<div data-feed-id="${one.id}"></div>`).join('')}</div>`,
      receipt: vi.fn(), failure: vi.fn(), aliasForm: vi.fn(async () => {}),
      sourceToolsHtml: () => '', wireSourceTools: vi.fn(), comboItems: () => [],
      sortKeys: vi.fn((sort: string) => [{ key: 'new', label: 'Date added', pressed: sort === 'new', dir: '' as const, ariaLabel: '' }]),
    },
    actions: {
      route: vi.fn(), toggleTag: vi.fn(), clearFilter: vi.fn(), clearAll: vi.fn(), setSort: vi.fn(),
      reshuffleVideos: vi.fn(() => '77'), setJavLayout: vi.fn(), setPhotoLayout: vi.fn(), openEntity: vi.fn(),
      javContext: vi.fn(), painted: vi.fn(), missing: vi.fn(), avatarChanged: vi.fn(), openFollowAuthor: vi.fn(),
    },
    ...patch,
  };
}

let push: (patch: Partial<EntityPageProps>) => Promise<void> = async () => {};
/** The patch the shell pushes through `updateManagedRoute`, replaced here by a layer of state. */
function Shell(given: EntityPageProps) {
  const [current, set] = useState(given);
  push = (patch) => act(async () => { set((value) => ({ ...value, ...patch })) });
  return <EntityPage {...current} />;
}

/** Take the real first-screen path: prefetch lands in the cache first, then mount. */
async function open(plan: Plan = {}, patch: Partial<EntityPageProps> = {}) {
  const served = serve(plan);
  const props = shellProps(patch);
  await prefetchEntityPage(props);
  const requestsBeforeMount = served.fetcher.mock.calls.length;
  const { host } = await mountRoot(<QueryClientProvider client={queryClient}><Shell {...props} /></QueryClientProvider>);
  await settle();
  return { ...served, props, host, requestsBeforeMount };
}

const cards = (props: EntityPageProps) =>
  [...props.hosts.body.querySelectorAll<HTMLElement>('[data-media-grid] > [data-media-card]')].map((card) => card.dataset.id);

it('While photos have not returned it shows the person identity and keeps the photo view; once the response arrives photos render in place', async () => {
  const delayed = pending<ReturnType<typeof photos>>();
  const { host, props } = await open({ photos: () => delayed.answer }, { media: { media: 'photos', set: 0 } });
  expect(host.textContent).toContain(NAME);
  expect(props.hosts.body.querySelector('[data-photo-wall]')).not.toBeNull();
  expect(props.hosts.body.querySelector('[data-media-card]')).toBeNull();
  await delayed.release(photos(2));
  await settle();
  expect(props.hosts.body.querySelectorAll('[data-photo-cell]')).toHaveLength(2);
});
const pressedView = (props: EntityPageProps) =>
  props.hosts.filter.querySelector('[data-media-view][aria-pressed="true"]')?.getAttribute('data-media-view');
const readout = (props: EntityPageProps) => props.hosts.filter.querySelector('[data-entity-readout]')?.textContent;

describe('First screen', () => {
  it('Profile tables fetch per page, sort the whole set, and keep person and tag filters', async () => {
    const served = serve();
    await fetchItems('performer', NAME, { tag: 'Demo tag', state: 'fresh' }, { jav: true, seed: '42' },
      20, new AbortController().signal, { limit: 20, sort: 'name', dir: 'asc' });
    const params = served.calls('/api/items')[0]!.searchParams;
    expect(Object.fromEntries(params)).toMatchObject({ performer: NAME, tag: 'Demo tag', state: 'fresh',
      jav: '1', offset: '20', limit: '20', sort: 'name', dir: 'asc' });
    expect(params.has('count')).toBe(false);
  });
  it('FC2 compilation counts are shown per video; the total file count is left to pagination', async () => {
    const page=await open({ entity:entity({asset_count:1}),items:()=>({...items([1,2,3]),total:19,work_total:1}) });
    expect(readout(page.props)).toBe('Videos · 1');
    expect(cards(page.props)).toEqual(['1','2','3']);
  });

  it('Old URLs of merged identities go through the in-app router to open the canonical profile page', async () => {
    const page=await open({entity:{redirect:{kind:'performer',name:'Christy White'}}}, {kind:'creator',name:'Christy White'});
    expect(page.props.actions.openEntity).toHaveBeenCalledWith('performer','Christy White',true);
    expect(page.props.actions.missing).not.toHaveBeenCalled();
    expect(page.host.querySelector('[data-entity-hero]')).toBeNull();
  });

  it.each(['performer', 'creator', 'studio', 'series', 'agency'])('The alias entry replaced %s\'s canonical profile', async kind => {
    const page = await open({ entity: entity({ kind, canonical_name: 'Canonical' }) }, { kind, name: 'Alias' });
    expect(page.props.actions.openEntity).toHaveBeenCalledExactlyOnceWith(kind, 'Canonical', true);
    expect(page.props.actions.missing).not.toHaveBeenCalled();
    expect(cards(page.props)).toEqual([]);
  });

  it('The canonical name entry shows the profile page directly', async () => {
    const page = await open();
    expect(page.props.actions.openEntity).not.toHaveBeenCalled();
    expect(cards(page.props)).toEqual(['1', '2', '3']);
    expect(readout(page.props)).toBe('Videos · 3');
  });

  it('Profile, first video page, full photo set, and new releases complete before mount, with no follow-up requests after attaching', async () => {
    const page = await open({ feed: { items: [{ id: 31, has_cover: true }] } });
    expect(page.calls('/api/entity')).toHaveLength(1);
    expect(page.calls('/api/items')).toHaveLength(1);
    expect(page.calls('/api/photos')).toHaveLength(1);
    expect(page.calls('/api/feeds/discoveries')[0]?.searchParams.get('entity')).toBe('7001');
    expect(page.fetcher.mock.calls).toHaveLength(page.requestsBeforeMount);
    expect(cards(page.props)).toEqual(['1', '2', '3']);
    expect(readout(page.props)).toBe('Videos · 3');
    expect(page.props.hosts.feed.querySelector('[data-feed-id="31"]')).not.toBeNull();
  });

  it('Entity data already fetched by the router feeds the first screen directly, while videos and photos still fetch in parallel to completion', async () => {
    const page = await open({}, { resolvedEntity: entity() });
    expect(page.calls('/api/entity')).toHaveLength(0);
    expect(page.calls('/api/items')).toHaveLength(1);
    expect(page.calls('/api/photos')).toHaveLength(1);
    expect(cards(page.props)).toEqual(['1', '2', '3']);
  });

  it('Video request convention: 48 per page, ordered and directed by the address, random carries the site-wide seed, and the key for this page itself is not sent twice', () => {
    const query = itemsParams('creator', 'Some creator', { creator: 'Some creator', tag: 'Big breasts', sort: 'seed', dir: '' },
      { jav: true, seed: '42' });
    expect(Object.fromEntries(query)).toEqual({
      creator: 'Some creator', limit: '48', offset: '0', sort: 'seed', seed: '42', tag: 'Big breasts', jav: '1' });
    const next = itemsParams('performer', NAME, { sort: 'size', dir: 'asc' }, { jav: false, seed: '42' }, 48);
    expect(Object.fromEntries(next)).toMatchObject({ sort: 'size', dir: 'asc', offset: '48', count: '0' });
    expect(next.has('seed')).toBe(false);
  });

  it('The tag profile page aggregates assets at the intersection of this tag and added filters', () => {
    const params = itemsParams('tag', 'Big breasts', { tag: 'Blowjob,Big tits', sort: 'new' }, { jav: true, seed: '42' });
    expect(params.get('tag')).toBe('Big breasts,Blowjob,Big tits');
    expect(params.get('tag_match')).toBe('all');
  });

  it('A deep link onto one gallery: the whole set and that group fetch together, the wall renders that group, and the caption names the gallery', async () => {
    const page = await open({ photos: () => photos(6) }, { media: { media: 'photos', set: 9 } });
    expect(page.calls('/api/photo-set')[0]?.search).toBe('?id=9&limit=120');
    expect(page.fetcher.mock.calls).toHaveLength(page.requestsBeforeMount);
    expect(pressedView(page.props)).toBe('photos');
    expect(readout(page.props)).toBe('Gallery · 2 images');
    expect(page.props.hosts.filter.querySelector('[data-photo-back]')).not.toBeNull();
  });

  it('When the name matches nobody: hand the shell an empty state instead of drawing half a page', async () => {
    const page = await open({ entity: { error: 'not found' } });
    expect(page.props.actions.missing).toHaveBeenCalledTimes(1);
    expect(page.host.textContent).toBe('');
    expect(page.props.hosts.filter.childElementCount).toBe(0);
  });

  it('The JAV context is inferred from the first page of videos and reported to the shell; sort key and card layout both follow it', async () => {
    const page = await open({ items: () => items([1, 2], true) });
    expect(page.props.actions.javContext).toHaveBeenCalledWith(true);
    expect(page.props.helpers.sortKeys).toHaveBeenCalledWith('new', '', true);
  });
});

describe('Switch filters and views', () => {
  it('Adding a tag refetches videos only once; switching back to a previously viewed filter reads the cache and sends no request', async () => {
    const page = await open({ items: (query) => items(query.get('tag') ? [7] : [1, 2, 3]) });
    await push({ filters: { tag: 'Big breasts' } });
    await settle();
    expect(page.calls('/api/items').map((url) => url.searchParams.get('tag'))).toEqual([null, 'Big breasts']);
    expect(cards(page.props)).toEqual(['7']);
    // Which chips are selected is listed by the intersection bar; the readout reports only a count: repeating the tag names, a few long tags would push this row off the page.
    expect(readout(page.props)).toBe('Videos · 1 · 1 tags selected');
    expect(page.props.hosts.filter.querySelector('[data-entity-tag="big tits"]')?.getAttribute('aria-pressed')).toBe(undefined);
    await push({ filters: {} });
    await settle();
    expect(page.calls('/api/items')).toHaveLength(2);
    expect(cards(page.props)).toEqual(['1', '2', '3']);
  });

  it('Not one video under the name: the body is the empty state and the bottom row shows no sort key', async () => {
    const page = await open({ entity: entity({ asset_count: 0 }), items: () => items([]) });
    expect(page.props.hosts.body.textContent).toContain('No videos yet');
    expect(page.props.hosts.body.querySelector('[data-media-grid]')).toBeNull();
    expect(page.props.hosts.filter.querySelector('[data-entity-sort]')).toBeNull();
    expect(buttonNamed('Clear filters', page.props.hosts.body)).toBeNull();
  });

  it('When the filter leaves nothing: the empty state offers a path back to all videos and clears the watch-state and intersection filters', async () => {
    const page = await open({ items: (query) => items(query.get('tag') ? [] : [1, 2, 3]) },
      { filters: { tag: 'Big breasts', state: 'fresh', sort: 'new' } });
    expect(page.props.hosts.body.textContent).toContain('No matching videos');
    await click(buttonNamed('Clear filters', page.props.hosts.body));
    expect(page.props.actions.route).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'new', tag: '', state: '', creator: '', studio: '', owner: '' }),
      expect.objectContaining({ media: 'videos' }));
  });

  it('View keys and watch state do not change the URL themselves: the shell writes it and pushes it back; photos were already fetched in the first screen, so switching does not request again', async () => {
    const page = await open({ photos: () => photos(4) });
    await click(page.props.hosts.filter.querySelector('[data-media-view="photos"]'));
    expect(page.props.actions.route).toHaveBeenLastCalledWith({}, { media: 'photos', set: 0 });
    const before = page.fetcher.mock.calls.length;
    await push({ media: { media: 'photos', set: 0 } });
    await settle();
    expect(page.fetcher.mock.calls).toHaveLength(before);
    expect(pressedView(page.props)).toBe('photos');
    expect(page.props.hosts.body.querySelectorAll('[data-photo-cell]')).toHaveLength(4);
    expect(page.props.actions.painted).toHaveBeenLastCalledWith('photos', true);
    await click(page.props.hosts.filter.querySelector('[data-media-view="videos"]'));
    expect(page.props.actions.route).toHaveBeenLastCalledWith({}, { media: 'videos', set: 0 });
  });

  it('Entering an agency page lands on its roster; changing filters returns to the video view', async () => {
    const roster = [{ id: 1, k: '河北彩花', n: 12 }, { id: 2, k: '小湊よつ葉', n: 3 }];
    const page = await open({ entity: entity({ kind: 'agency', canonical_name: 'NAX', related_performers: roster }) },
      { kind: 'agency', name: 'NAX' });
    expect(pressedView(page.props)).toBe('people');
    expect(readout(page.props)).toBe('Performers · 2');
    await push({ filters: { state: 'fresh' } });
    await settle();
    expect(pressedView(page.props)).toBe('videos');
  });

  it('The studio page roster is its labels; co-starring performers stay at the card bottom as before; entities without photos show no photo key', async () => {
    const page = await open({
      entity: entity({ kind: 'studio', canonical_name: 'S1', labels: [{ k: 'S1 NO.1 STYLE', n: 40 }],
        related_performers: [{ id: 3, k: '河北彩花', n: 2 }] }),
    }, { kind: 'studio', name: 'S1' });
    expect(readout(page.props)).toBe('Labels · 1');
    expect(page.props.hosts.filter.querySelector('[data-media-view="photos"]')).toBeNull();
    expect(page.host.querySelector('[data-related-performer="Kawakita Saika"]')).not.toBeNull();
  });

  it('No view toggle with a single content kind', async () => {
    const page = await open();
    expect(page.props.hosts.filter.querySelector('[data-media-view]')).toBeNull();
  });

  it('While profiles are still completing it refetches on a timer; each finished item refetches works and photos and swaps the avatar without a page refresh', async () => {
    const work = [{ task_key: 'entity-avatar', label: 'Fill in detail images', status: 'running' },
      { task_key: 'performer-profile', label: 'Performer detail fill-in', status: 'pending' }];
    let left = work;
    const page = await open({ entityFor: () => entity({ pending_work: left }) });
    const interval = entityOptions('performer', NAME).refetchInterval;
    expect(interval({ state: { data: entity({ pending_work: left }) } } as never)).toBe(PENDING_REFETCH_MS);
    expect(page.host.querySelector('[data-pending-work]')?.textContent).toBe('Completing: Fill in detail images、Performer detail fill-in');
    left = work.slice(1);
    await act(async () => { await queryClient.refetchQueries({ queryKey: ['entity', 'performer', NAME] }) });
    await settle();
    expect(page.calls('/api/items')).toHaveLength(2);
    expect(page.calls('/api/photos')).toHaveLength(2);
    expect(page.props.actions.avatarChanged).toHaveBeenCalledTimes(1);
    expect(page.host.querySelector('[data-pending-work]')?.textContent).toBe('Waiting to complete: performer profile completion');
    left = [];
    await act(async () => { await queryClient.refetchQueries({ queryKey: ['entity', 'performer', NAME] }) });
    await settle();
    expect(page.host.querySelector('[data-pending-work]')).toBeNull();
    expect(interval({ state: { data: entity() } } as never)).toBe(false);
    /* 补完之后再取一次，接住紧跟着落地的别名与外链；之后不再取。 */
    const settled = page.calls('/api/entity').length;
    await act(async () => { await new Promise((done) => setTimeout(done, PENDING_REFETCH_MS + 300)) });
    await settle();
    expect(page.calls('/api/entity')).toHaveLength(settled + 1);
  }, 15000);

  it('Bulk actions bump the epoch: videos refetch under the same filters', async () => {
    const page = await open();
    await push({ revision: 1 });
    await settle();
    expect(page.calls('/api/items')).toHaveLength(2);
  });

  it('Video shuffle: the shell picks the seed, the island fetches the new page first, and the spinner on the key waits exactly for this call', async () => {
    const page = await open();
    await act(async () => { page.props.hosts.filter.querySelector<HTMLElement>('[data-entity-batch]')?.click() });
    await settle();
    expect(page.props.actions.reshuffleVideos).toHaveBeenCalledTimes(1);
    expect(page.calls('/api/items').at(-1)?.searchParams.get('seed')).toBe('77');
    await push({ filters: { sort: 'seed' }, seed: '77' });
    await settle();
    expect(page.calls('/api/items')).toHaveLength(2);
  });
});

describe('Photo wall', () => {
  it('Pagination counts the already fetched local images, carrying the seed from the session; shuffle picks a new seed, and the new wall swaps in only once fetched', async () => {
    const page = await open({
      photos: (query) => (query.get('offset') ? photos(2, { has_more: false, seed: 's1' })
        : photos(3, { has_more: true, seed: query.get('seed') || 's1' })),
    }, { media: { media: 'photos', set: 0 } });
    await click(page.props.hosts.body.querySelector('[data-entity-more]'));
    await settle();
    const more = page.calls('/api/photos').at(-1)!;
    expect(Object.fromEntries(more.searchParams)).toMatchObject({ offset: '3', limit: '120', seed: 's1' });
    expect(page.props.hosts.body.querySelectorAll('[data-photo-cell]')).toHaveLength(5);
    await act(async () => { page.props.hosts.filter.querySelector<HTMLElement>('[data-entity-batch]')?.click() });
    await settle();
    const shuffled = page.calls('/api/photos').at(-1)!;
    expect(shuffled.searchParams.get('limit')).toBe('120');
    expect(shuffled.searchParams.get('seed')).toMatch(/^\d+$/);
    expect(page.props.hosts.body.querySelectorAll('[data-photo-cell]')).toHaveLength(3);
  });

  it('Clicking back in a gallery asks the shell to return to the full photo set', async () => {
    const page = await open({ photos: () => photos(6) }, { media: { media: 'photos', set: 9 } });
    await click(page.props.hosts.filter.querySelector('[data-photo-back]'));
    expect(page.props.actions.route).toHaveBeenLastCalledWith({}, { media: 'photos', set: 0 });
    await push({ media: { media: 'photos', set: 0 } });
    await settle();
    expect(readout(page.props)).toBe('Photos - 6 images');
  });
});

describe('The creator\'s online view', () => {
  const followCards = (props: EntityPageProps) =>
    [...props.hosts.body.querySelectorAll<HTMLElement>('[data-follow-item]')].map((card) => card.dataset.followItem);

  it('With nothing local: no video key, the page lands on online, and with many image groups the photo wall is the default', async () => {
    const page = await open({
      entity: creator({ asset_count: 0 }),
      follow: () => followPage([followGroup(1, 'image'), followGroup(2, 'image'), followGroup(3, 'video')]),
    }, { kind: 'creator', name: 'Jul3D' });
    await settle();
    expect(page.calls('/api/follow')[0]?.searchParams.get('author')).toBe('name:jul3d');
    expect(page.props.hosts.filter.querySelector('[data-entity-media]:not([data-online-media])')).toBeNull();
    expect(page.props.hosts.filter.querySelector('[data-online-media] [aria-pressed="true"]')
      ?.getAttribute('data-media-view')).toBe('images');
    expect(page.props.hosts.body.querySelector('[data-follow-wall]')).not.toBeNull();
    expect(followCards(page.props)).toEqual(['1', '2']);
    expect(readout(page.props)).toBe('Online · 3 updates');
    expect(page.props.actions.painted).toHaveBeenLastCalledWith('online', true);
  });

  it('Both local and online: two keys side by side, online not fetched up front; entering online lets the shell write the URL, and filters refetch only within the page', async () => {
    const page = await open({
      entity: creator({ asset_count: 3, follow: heroFollow(2) }),
      follow: (query) => followPage(query.get('provider') ? [followGroup(3, 'video')] : [followGroup(1, 'video'), followGroup(2, 'video')]),
    }, { kind: 'creator', name: 'Jul3D' });
    expect([...page.props.hosts.filter.querySelectorAll<HTMLElement>('[data-media-view]')]
      .map((key) => key.dataset.mediaView)).toEqual(['videos', 'online']);
    expect(page.calls('/api/follow')).toHaveLength(0);
    await click(page.props.hosts.filter.querySelector('[data-media-view="online"]'));
    expect(page.props.actions.route).toHaveBeenLastCalledWith({}, { media: 'online', set: 0 });
    await push({ media: { media: 'online', set: 0 } });
    await settle();
    expect(followCards(page.props)).toEqual(['1', '2']);
    expect(page.props.hosts.body.querySelector('[data-follow-wall]')).toBeNull();
    const routed = vi.mocked(page.props.actions.route).mock.calls.length;
    await click(page.props.hosts.filter.querySelector('[data-follow-provider="rule34video"]'));
    await settle();
    expect(page.calls('/api/follow').at(-1)?.searchParams.get('provider')).toBe('rule34video');
    expect(followCards(page.props)).toEqual(['3']);
    expect(page.props.actions.route).toHaveBeenCalledTimes(routed);
  });
});

describe('Write operation', () => {
  it('Add alias: the form lives in the shell and the write-back in the island; after writing, the profile card and video list refetch together', async () => {
    const page = await open();
    await click(page.host.querySelector('[data-namepick-toggle]'));
    await click(document.querySelector('[data-namepick-alias]'));
    const [mine, write] = vi.mocked(page.props.helpers.aliasForm).mock.calls[0]!;
    expect(mine).toEqual([]);
    const entityBefore = page.calls('/api/entity').length;
    const itemsBefore = page.calls('/api/items').length;
    await act(async () => { await write({ alias: 'しのだゆう' }) });
    await settle();
    expect(page.writes).toEqual([{ url: '/api/entity-alias', body: { kind: 'performer', name: NAME, alias: 'しのだゆう' } }]);
    expect(page.calls('/api/entity')).toHaveLength(entityBefore + 1);
    expect(page.calls('/api/items')).toHaveLength(itemsBefore + 1);
  });

  it('After an avatar change: the profile card and video grid rebuild from refetched data, and image URLs carry the new version', async () => {
    let version = 'old';
    const page = await open({
      entityFor: () => entity({ image_version: version }),
      items: () => ({ ...items([1, 2, 3]), items: items([1, 2, 3]).items.map(item => ({
        ...item, performers: [NAME], performer_entities: [{ id: 7001, name: NAME,
          has_image: true, image_version: version }],
      })) }),
      picked: () => { version = 'new' },
    }, {
      helpers: {
        ...shellProps().helpers,
        portraitImg: (_kind, data) => `<img data-test-portrait src="/entity-image?v=${String(data.image_version)}">`,
      },
    });
    const portrait = () => page.props.hosts.filter.ownerDocument.querySelector('[data-test-portrait]')?.getAttribute('src');
    expect(portrait()).toBe('/entity-image?v=old');
    expect(cards(page.props)).toEqual(['1', '2', '3']);
    const feedBefore = page.calls('/api/feeds/discoveries').length;
    await click(document.querySelector(`button[aria-label="Change ${NAME}'s avatar"]`));
    await settle();
    await click(document.querySelector('[data-avatar-choice]'));
    await settle();
    await click(buttonNamed('Use the whole image'));
    await settle();
    expect(page.writes.map((one) => one.url)).toEqual(['/api/avatar-frame', '/api/avatar-pick']);
    expect(portrait()).toBe('/entity-image?v=new');
    // The grid stores the first page as the initial value of its own state: refetching without re-keying leaves the cards (and her face in the byline) stuck on the old copy.
    expect(cards(page.props)).toEqual(['1', '2', '3']);
    const avatars = [...page.props.hosts.body.querySelectorAll<HTMLImageElement>('[data-media-avatar] img')];
    expect(avatars).toHaveLength(3);
    expect(avatars.every(image => new URL(image.src).searchParams.get('v') === 'new')).toBe(true);
    expect(page.calls('/api/feeds/discoveries').length).toBeGreaterThan(feedBefore);
    // The avatar row in the home top bar is cached by the shell, so it must be told to invalidate too.
    expect(page.props.actions.avatarChanged).toHaveBeenCalledOnce();
  });

  it('Renaming the canonical name: confirm first and navigate to the new name\'s page only after the write succeeds; the receipt\'s undo is another write, returning to the original name', async () => {
    const page = await open({ entity: entity({ aliases: ['しのだゆう'] }) });
    vi.spyOn(legacyUi, 'confirmModal').mockImplementation((async (options: { onConfirm: () => Promise<unknown> }) =>
      ({ confirmed: true, result: await options.onConfirm() })) as unknown as typeof legacyUi.confirmModal);
    await click(page.host.querySelector('[data-namepick-toggle]'));
    await click(document.querySelector('[data-namepick-name="しのだゆう"]'));
    await settle();
    // Changing the umbrella name rewrites the entity's whole flat projection: before writing, show what it becomes and where the old wording goes; button and receipt share one verb.
    expect(legacyUi.confirmModal).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Change the canonical name', confirmLabel: 'Change the canonical name',
      body: `"Shinoda Yuu" becomes the name shown for this profile, "${NAME}" stays as an alias. Credits on videos, search and tags will all be rewritten to match.`,
    }));
    expect(page.writes[0]).toEqual({ url: '/api/entity-name', body: { kind: 'performer', name: NAME, canonical: 'しのだゆう' } });
    expect(page.props.actions.openEntity).toHaveBeenLastCalledWith('performer', 'しのだゆう');
    const [message, options] = vi.mocked(page.props.helpers.receipt).mock.calls[0]!;
    expect(message).toBe('Changed the canonical name to しのだゆう');
    await act(async () => { await options?.undo?.() });
    expect(page.writes[1]).toEqual({ url: '/api/entity-name', body: { kind: 'performer', name: 'しのだゆう', canonical: NAME } });
    expect(page.props.actions.openEntity).toHaveBeenLastCalledWith('performer', NAME);
  });

  it('After the subscribe switch writes back successfully it is recorded in this page\'s details; failures hand the shell a failure receipt', async () => {
    const page = await open();
    const toggle = () => page.host.querySelector<HTMLInputElement>('input[data-entity-feed]')!;
    await click(toggle());
    await settle();
    expect(page.writes[0]).toEqual({ url: '/api/feeds/source', body: { action: 'follow', entity_id: 7001, enabled: true } });
    expect(toggle().checked).toBe(true);
    expect(queryClient.getQueryData<{ feed: { following: boolean } }>(['entity', 'performer', NAME])?.feed.following).toBe(true);
    page.fetcher.mockImplementationOnce(async () => ({ ok: false, status: 502, json: async () => ({}) }));
    await click(toggle());
    await settle();
    expect(page.props.helpers.failure).toHaveBeenCalledWith('Unsubscribe from new releases', expect.any(Error));
    expect(toggle().checked).toBe(true);
  });

  it('Just subscribed: wait for the server\'s current pull to finish, then refetch the new releases row once; no refetch while it is running', async () => {
    const page = await open({ checks: ['running', 'idle'] });
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    await click(page.host.querySelector<HTMLInputElement>('input[data-entity-feed]'));
    await settle();
    const step = async () => { await act(async () => { vi.advanceTimersByTime(3000) }); await settle() };
    await step();
    expect(page.calls('/api/feeds/check')).toHaveLength(1);
    expect(page.calls('/api/feeds/discoveries')).toHaveLength(1);
    await step();
    expect(page.calls('/api/feeds/check')).toHaveLength(2);
    expect(page.calls('/api/feeds/discoveries')).toHaveLength(2);
  });

  it('Changing the compilation switch mints a new epoch, refetching the new-releases row', async () => {
    const page = await open();
    await push({ feedRevision: 1 });
    await settle();
    expect(page.calls('/api/feeds/discoveries')).toHaveLength(2);
  });
});
