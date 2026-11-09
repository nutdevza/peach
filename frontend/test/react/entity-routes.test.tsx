/* The profile page is rendered by the route tree into `#index` (`ENTITY_ROUTES`, registered by patterns like
 * `/performers/*`): the frame is laid out by the profile page element and swapped into the container via `place` at the moment
 * the first screen is fetched, with skeleton and full page in the same batch of changes; later shell toggles merge in via
 * `updateManagedRoute` and the page refetches by the new key without remounting; when a name carries slashes, percent signs,
 * spaces or Japanese, the two address encodings must agree on name, title, links and the first-screen request; in-page jumps
 * to the profile page go to the shell to write the address, not through React Router's `navigate`.
 *
 * When the element opens and how it parses the person from the address is governed by `pages/index-entity.test.tsx`.
 *
 * In-page fetching, writes and how each block renders are governed by `entity-page.test.tsx` and each block's own cases; this
 * file covers the route tree layer. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

// Use the real module: how links are built and which entity an address segment matches is the same copy the browser uses.
import { entityPath } from '../../src/core';
import { routeMetaOf } from '../../src/history/route-meta';
import type { EntityPageProps } from '../../src/react/entity-page/entity-page';
import { entityTarget } from '../../src/react/router/pages/index-entity';
import type { ShellActions } from '../../src/react/router/shell-actions';

// The first import compiles the whole page subtree the route table pulls in, with the compile wait on its own finite window; every later case remounts and only reruns the module.
const REACT_IMPORT_TIMEOUT_MS = 30_000;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => { await import('../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

async function load(path = '/') {
  vi.resetModules();
  window.history.replaceState(null, '', path);
  const [history, router, routes] = await Promise.all([
    import('../../src/history'), import('../../src/react/router/router'), import('../../src/react/router/managed-routes'),
  ]);
  return { ...history, ...router, ...routes };
}
type Loaded = Awaited<ReturnType<typeof load>>;

const unmounts: Array<() => void> = [];
afterEach(async () => {
  for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function shellActions(): ShellActions {
  return {
    openItem: vi.fn(), openEntity: vi.fn(), openTag: vi.fn(), openTasteSignal: vi.fn(), navigate: vi.fn(),
    openManage: vi.fn(), managePath: vi.fn(() => ''), openFollow: vi.fn(), receipt: vi.fn(), toast: vi.fn(),
    failure: vi.fn(), revealSource: vi.fn(async () => ''), reopenTutorial: vi.fn(async () => {}),
    routeReview: vi.fn(),
    routeFollowManage: vi.fn(), saveFollowPreference: vi.fn(), srcBadge: () => '', routeIndex: vi.fn(),
    savePeopleLayout: vi.fn(), exitSelectMode: vi.fn(), personAvatar: vi.fn(() => ({ html: '', face: '' })),
    authorAvatar: vi.fn(() => ''), showIndexTags: vi.fn(), openFollowAuthor: vi.fn(), openFollowTag: vi.fn(),
    openPlaylist: vi.fn(), canFlip: () => true,
    surfaceChanged: vi.fn(), clearSearch: vi.fn(), openImmerse: vi.fn(), openOverlay: vi.fn(), closeStage: vi.fn(), grid: {} as ShellActions['grid'],
  };
}

async function mount(r: Loaded) {
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<r.RouterRoot actions={shellActions()} />) });
  unmounts.push(() => root.unmount());
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
}

type Reply = { ok: boolean; status: number; json(): Promise<unknown> };
const reply = (body: unknown): Reply => ({ ok: true, status: 200, json: async () => body });

/** The profile page's fetching: `/api/entity` can be resolved manually (the first screen waits for exactly that), everything else answers on the spot. */
function entityFetch({ deferred = false } = {}) {
  const pending: Array<() => void> = [];
  const fetched = vi.fn((input: string, init?: RequestInit) => {
    const url = new URL(String(input), 'http://peach.test');
    if (url.pathname === '/api/entity') {
      const body = { id: 7001, kind: 'performer', canonical_name: url.searchParams.get('name'), aliases: [],
        user_aliases: [], asset_count: 2, tags: [], related_performers: [], feed: { following: false } };
      if (!deferred) return Promise.resolve(reply(body));
      return new Promise<Reply>((resolve, reject) => {
        pending.push(() => resolve(reply(body)));
        init?.signal?.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')) });
      });
    }
    if (url.pathname === '/api/items') {
      return Promise.resolve(reply({ items: [1, 2].map((id) => ({ id, name: `Video ${id}`, has_thumb: true })),
        total: 2, has_more: false }));
    }
    if (url.pathname === '/api/photos') {
      return Promise.resolve(reply({ total: 0, sample_total: 0, sets: [], has_more: false, seed: '', items: [] }));
    }
    if (url.pathname === '/api/feeds/discoveries') return Promise.resolve(reply({ items: [] }));
    return Promise.resolve(reply({ status: 'idle' }));
  });
  vi.stubGlobal('fetch', fetched);
  const calls = (path: string) => fetched.mock.calls
    .map(([input]) => new URL(String(input), 'http://peach.test'))
    .filter((url) => url.pathname === path);
  return { fetched, calls, resolve: () => { for (const settle of pending.splice(0)) settle() } };
}

/** The skeleton the shell laid out inside `#index`. */
function indexSurface() {
  const index = document.createElement('section');
  index.id = 'index';
  index.innerHTML = '<div class="geist-skeleton" data-skeleton="entity">Loading</div>';
  document.body.append(index);
  return { index, skeleton: index.firstElementChild! };
}

/** The four frame blocks the profile page element lays out (`openEntity` in `pages/index-entity.tsx`), together with the `place` handed to `openManagedRoute`. */
function entityFrame() {
  const frame = document.createElement('template');
  frame.innerHTML = `<div data-entity-hero><div class="peach-react"></div></div>
    <div data-entity-filter><div class="peach-react"></div></div>
    <section class="feednew" data-feed-new aria-label="New releases not in library" hidden></section>
    <div data-entity-body><div class="peach-react"></div></div>`;
  const parts = [...frame.content.childNodes];
  const hero = frame.content.querySelector<HTMLElement>('[data-entity-hero]')!;
  const hosts = {
    filter: frame.content.querySelector<HTMLElement>('[data-entity-filter]>.peach-react')!,
    feed: frame.content.querySelector<HTMLElement>('[data-feed-new]')!,
    body: frame.content.querySelector<HTMLElement>('[data-entity-body]>.peach-react')!,
  };
  const place = (container: Element) => { container.replaceChildren(...parts); return hero.firstElementChild as HTMLElement };
  return { hero, hosts, place };
}

function entityProps(name: string, hosts: EntityPageProps['hosts']): EntityPageProps {
  return {
    kind: 'performer', name, filters: {}, media: { media: 'videos', set: 0 }, jav: false, seed: '42',
    revision: 0, feedRevision: 0, photoSize: 'small', photoLayout: 'masonry', followImagesOnly: false,
    javLayout: 'small', javLayouts: [['small', 'Small images', 'layout-grid']], photoLayouts: [['masonry', 'Masonry', 'columns-2']],
    states: [{ k: '', label: 'All' }], peopleLayout: 'big', hosts,
    layout: { active: false, size: 'small', portrait: false, javImage: 'cover' },
    selectMode: false, selected: new Set(), seekSeconds: 10, wireDrag: vi.fn(),
    skeletonHtml: () => '<div data-test-skeleton></div>', groupCollapse: true, canLoadMore: () => true,
    card: {
      helpers: {
        badgeHtml: () => '', titleHtml: (_it, raw) => raw, displayName: (_it, raw) => raw, tagLabel: (tag) => tag,
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
      feedRowHtml: () => '<div class="feednewrow"></div>', receipt: vi.fn(), failure: vi.fn(),
      aliasForm: vi.fn(async () => {}), sourceToolsHtml: () => '', wireSourceTools: vi.fn(), comboItems: () => [],
      sortKeys: vi.fn(() => [{ key: 'new', label: 'Date added', pressed: true, dir: '' as const, ariaLabel: '' }]),
    },
    actions: {
      route: vi.fn(), toggleTag: vi.fn(), clearFilter: vi.fn(), clearAll: vi.fn(), setSort: vi.fn(),
      reshuffleVideos: vi.fn(() => '77'), setJavLayout: vi.fn(), setPhotoLayout: vi.fn(), openEntity: vi.fn(),
      javContext: vi.fn(), painted: vi.fn(), missing: vi.fn(), avatarChanged: vi.fn(), openFollowAuthor: vi.fn(),
    },
  };
}

async function until(ok: () => boolean, what: string): Promise<void> {
  for (let step = 0; step < 200; step += 1) {
    if (ok()) return;
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

const NAME = '篠田ゆう';
const heroPainted = (index: Element) => index.querySelector('[data-entity-hero] > .peach-react > *');

it('Cold start deep link to a profile page: the skeleton stays until the first screen completes, and the element\'s frame swaps in with the full page in the same batch of changes', async () => {
  const r = await load(entityPath('performer', NAME));
  const { index, skeleton } = indexSurface();
  await mount(r);
  const fetch = entityFetch({ deferred: true });
  const { hosts, place } = entityFrame();
  const opened = r.openManagedRoute('/performers/*', entityProps(NAME, hosts), { container: index, isCurrent: () => true, place });
  await until(() => fetch.calls('/api/entity').length > 0, 'First-screen fetch sent out');
  expect(index.firstElementChild, 'Skeleton kept as-is until data lines up').toBe(skeleton);
  const batches: Array<{ skeleton: boolean; painted: boolean }> = [];
  const observer = new MutationObserver(() => {
    batches.push({ skeleton: index.contains(skeleton), painted: Boolean(heroPainted(index)) });
  });
  observer.observe(index, { childList: true, subtree: true });
  unmounts.push(() => observer.disconnect());
  fetch.resolve();
  await act(async () => { expect(await opened).toBe(true) });
  expect(batches[0], 'Within the batch removing the skeleton the profile card is already painted').toEqual({ skeleton: false, painted: true });
  expect([...index.children].map((el) => el.getAttribute('data-entity-hero') ?? el.getAttribute('data-entity-filter')
    ?? el.getAttribute('data-feed-new') ?? el.getAttribute('data-entity-body'))).toEqual(['', '', '', '']);
  expect(hosts.filter.childElementCount, 'The popover paints through a portal into the element\'s slot').toBeGreaterThan(0);
  expect(hosts.body.querySelectorAll('[data-media-card]')).toHaveLength(2);
  expect(r.managedEntry(index)).toMatchObject({ path: '/performers/*', host: index.querySelector('[data-entity-hero] > .peach-react') });
  act(() => { r.releaseManagedRoute(index) });
  expect(heroPainted(index), 'Collapsing withdraws the page together with the profile card\'s layer host').toBeNull();
  expect(index.querySelector('[data-entity-hero] > .peach-react')).toBeNull();
});

/* The shell's filter change (`routeEntityPage`) and layout or selection-key switches (`pushEntityPage`) only merge into the page already on screen: the generation stays,
   the profile card does not remount; when the filter key changes, the page refetches only the video list under the new key. */
it('The profile page updates in place: changing filters refetches only videos, changing layout fetches nothing, and neither remounts', async () => {
  const r = await load(entityPath('performer', NAME));
  const { index } = indexSurface();
  await mount(r);
  const fetch = entityFetch();
  const { hosts, place } = entityFrame();
  await act(async () => {
    await r.openManagedRoute('/performers/*', entityProps(NAME, hosts), { container: index, isCurrent: () => true, place });
  });
  const card = heroPainted(index);
  const revision = r.managedEntry(index)?.revision;
  const before = { entity: fetch.calls('/api/entity').length, items: fetch.calls('/api/items').length };
  await act(async () => { r.updateManagedRoute(index, { layout: { active: true, size: 'big', portrait: false, javImage: 'cover' } }) });
  expect(fetch.fetched.mock.calls.length - before.entity - before.items - fetch.calls('/api/photos').length
    - fetch.calls('/api/feeds/discoveries').length, 'Layout changes send no requests').toBe(0);
  await act(async () => { r.updateManagedRoute(index, { filters: { tag: 'Big breasts' } }) });
  await until(() => fetch.calls('/api/items').length > before.items, 'Refetch videos under the new filter');
  expect(fetch.calls('/api/items').at(-1)?.searchParams.get('tag')).toBe('Big breasts');
  expect(fetch.calls('/api/entity'), 'Profile not refetched on filter change').toHaveLength(before.entity);
  expect(heroPainted(index), 'Pushing a new value must not remount').toBe(card);
  expect(r.managedEntry(index)?.revision).toBe(revision);
  expect(r.managedEntry(index)?.props).toMatchObject({ kind: 'performer', name: NAME, filters: { tag: 'Big breasts' } });
});

/* Performer names contain slashes, so the address consumes all remaining segments; elements `decodeURIComponent` first, then split by segment. Links are built with
   `encodeURIComponent` (slash written as `%2F`), but hand-typed or external addresses may keep the slash raw (`encodeURI`);
   both must read out the same name. The title looks up route metadata by the decoded path. */
const NAMES = ['A/B', '100%', 'Mia Nix', '三上悠亜', 'ラ/ブ 50%'];

it('Name with slash, percent, spaces, and Japanese: both spellings resolve to the same name; the title, link, and first-screen request all use it', async () => {
  for (const name of NAMES) {
    const href = entityPath('performer', name);
    expect(href).toBe(`/performers/${encodeURIComponent(name)}`);
    for (const written of [href, `/performers/${encodeURI(name)}`]) {
      const hit = entityTarget(written);
      expect(hit?.name, `Names read by ${written}`).toBe(name);
      expect(hit?.kind).toBe('performer');
      expect(routeMetaOf(decodeURIComponent(written))?.title, `${written}'s title`).toBe(name);
      const r = await load(written);
      const { index } = indexSurface();
      await mount(r);
      const fetch = entityFetch();
      const { hosts, place } = entityFrame();
      await act(async () => {
        await r.openManagedRoute('/performers/*', entityProps(hit!.name, hosts), { container: index, isCurrent: () => true, place });
      });
      expect(fetch.calls('/api/entity')[0]?.searchParams.get('name'), `${written}'s first-screen request`).toBe(name);
      expect(r.managedEntry(index)?.props).toMatchObject({ kind: 'performer', name });
      for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
      document.body.innerHTML = '';
    }
  }
});

it('Profile page paths bypass React Router navigate: same-page search changes, switching people, and both spellings all hand the address to the shell', async () => {
  const r = await load('/');
  const actions = shellActions();
  const navigate = vi.fn();
  const paths = [entityPath('performer', 'A/B'), '/performers/A/B?tag=x', entityPath('studio', 'S1'),
    '/agencies/some-agency', '/series/series?media=photos&set=9', '/creators/someone'];
  for (const path of paths) r.managedGo(path, actions, navigate);
  expect(navigate).not.toHaveBeenCalled();
  expect(vi.mocked(actions.navigate).mock.calls).toEqual(paths.map((path) => [path]));
  expect(r.ROUTED_PATHS).toEqual(expect.arrayContaining(
    ['/performers/*', '/studios/*', '/creators/*', '/series/*', '/agencies/*']));
  expect(r.isRoutedPath('/performers/A')).toBe(false);
});
