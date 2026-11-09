/* The playlists and follows pages are rendered by the route tree into `#stats` (`BROWSE_ROUTES`): the skeleton survives until
 * the first screen is fetched, with the swap to the full page in the same batch of changes (the follows page's skeleton is
 * lifted into a fading layer via `revealSkeleton`); while on the page, `updateManagedRoute` pushes refresh generation or
 * filters, the page only refetches without remounting and the generation does not change; the pages' destinations and receipts
 * connect to the shell's group; when management navigates to these two paths, writing the address goes to the shell.
 *
 * In-page fetching, writes and card faces are governed by `playlists.test.tsx` and `follow-feed.test.tsx`, when they open by
 * `pages/follow.test.tsx`; this file covers the route tree layer. */
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import type { PlaylistsProps } from '../../src/react/bundle';
import type {
  FollowFeedActions, FollowFeedHelpers, FollowFeedProps, FollowView,
} from '../../src/react/follow-feed/follow-feed';
import type { ShellActions } from '../../src/react/router/shell-actions';
import { revealSkeleton } from '../../src/ui-kit';

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
    openPlaylist: vi.fn(), canFlip: vi.fn(() => true),
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

/** One playlist row; the name tells which fetch the rendered one came from. */
const playlist = (name: string) => ({
  items: [{
    id: 1, name, source_kind: 'manual', source_seed_asset_id: null, current_asset_id: null,
    created_at: '2026-09-01 10:00:00', updated_at: '2026-09-01 10:00:00', item_count: 2,
    preview_asset_id: 11, preview_ids: [11, 12], faces: [],
  }],
});

/** The playlists page fetch: `/api/playlists` can be resolved manually (the first screen waits on exactly that), and the returned names can be swapped mid-flight. */
function playlistsFetch({ deferred = false } = {}) {
  const pending: Array<() => void> = [];
  let name = 'Weekend binge';
  const fetched = vi.fn((input: string, init?: RequestInit) => {
    const body = playlist(name);
    if (!deferred) return Promise.resolve(reply(body));
    return new Promise<Reply>((resolve, reject) => {
      pending.push(() => resolve(reply(body)));
      init?.signal?.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')) });
    });
  });
  vi.stubGlobal('fetch', fetched);
  const calls = (path: string) => fetched.mock.calls
    .map(([input]) => new URL(String(input), 'http://peach.test')).filter((url) => url.pathname === path);
  return {
    fetched, calls, rename: (next: string) => { name = next },
    resolve: () => { for (const settle of pending.splice(0)) settle() },
  };
}

/** The admin area body container, holding the skeleton the shell laid down. */
function statsSurface(skeleton = '<div class="geist-skeleton" data-skeleton="playlists">Reading playlists</div>') {
  const stats = document.createElement('section');
  stats.id = 'stats';
  stats.innerHTML = skeleton;
  document.body.append(stats);
  return { stats, skeleton: stats.firstElementChild! };
}

async function until(ok: () => boolean, what: string): Promise<void> {
  for (let step = 0; step < 200; step += 1) {
    if (ok()) return;
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

/** The block the page renders (the host's first element): after a remount it is a different one. */
const painted = (stats: Element) => stats.querySelector(':scope > .peach-react > *');

it('Cold-start deep link to the playlist page: the skeleton stays until the first screen is fully fetched, then the full page swaps in within one batch of changes', async () => {
  const r = await load('/playlists');
  const { stats, skeleton } = statsSurface();
  await mount(r);
  const fetch = playlistsFetch({ deferred: true });
  const opened = r.openManagedRoute('/playlists', { revision: 0 }, { container: stats, isCurrent: () => true });
  await until(() => fetch.calls('/api/playlists').length > 0, 'First-screen fetch sent out');
  expect(stats.firstElementChild, 'Skeleton kept as-is until data lines up').toBe(skeleton);
  const batches: Array<{ skeleton: boolean; painted: boolean }> = [];
  const observer = new MutationObserver(() => {
    batches.push({ skeleton: stats.contains(skeleton), painted: Boolean(stats.textContent?.includes('Weekend binge')) });
  });
  observer.observe(stats, { childList: true, subtree: true });
  unmounts.push(() => observer.disconnect());
  fetch.resolve();
  await act(async () => { expect(await opened).toBe(true) });
  expect(batches[0], 'Within the batch removing the skeleton the full page is already painted').toEqual({ skeleton: false, painted: true });
  expect(r.managedEntry(stats)).toMatchObject({ path: '/playlists', props: { revision: 0 } });
});

/* The top bar's "shuffle" lands on this page: the shell pushes a new refresh epoch, the page refetches only that list, and the cards do not remount. */
it('The playlists page pushes the refresh epoch in place: the epoch does not change, nothing remounts, and it refetches exactly once', async () => {
  const r = await load('/playlists');
  const { stats } = statsSurface();
  await mount(r);
  const fetch = playlistsFetch();
  await act(async () => {
    await r.openManagedRoute('/playlists', { revision: 0 }, { container: stats, isCurrent: () => true });
  });
  const page = painted(stats);
  const revision = r.managedEntry(stats)?.revision;
  expect(fetch.calls('/api/playlists')).toHaveLength(1);
  fetch.rename('Renamed');
  await act(async () => { r.updateManagedRoute(stats, { revision: 1 }) });
  await until(() => Boolean(stats.textContent?.includes('Renamed')), 'The copy refetched under the new epoch is what paints');
  expect(fetch.calls('/api/playlists'), 'Refetch only once').toHaveLength(2);
  expect(fetch.fetched).toHaveBeenCalledTimes(2);
  expect(painted(stats), 'Pushing a new epoch must never remount').toBe(page);
  expect(stats.querySelector('[data-skeleton]'), 'In-place refetching never lays a skeleton').toBeNull();
  expect(r.managedEntry(stats)?.revision).toBe(revision);
  expect(r.managedEntry(stats)?.props).toEqual({ revision: 1 });
});

it('Playlist page: entering the stage, going to profiles, pagination threshold and receipt all hook into the same shell set', async () => {
  const r = await load();
  const actions = shellActions();
  // Read `page()`'s props directly, without going through the first-screen fetch: the playlist page's code mounts first.
  await (await import('../../src/react/router/route-chunk')).loadRouteChunks();
  const props = (r.BROWSE_ROUTES['/playlists'].page({ revision: 3 }, actions, vi.fn()) as ReactElement<PlaylistsProps>).props;
  expect([props.openPlaylist, props.openEntity, props.canFlip]).toEqual([actions.openPlaylist, actions.openEntity, actions.canFlip]);
  expect(props.revision).toBe(3);
  const undo = async () => {};
  props.toast('Playlist deleted', { undo });
  props.toast('Renamed');
  expect(vi.mocked(actions.receipt).mock.calls).toEqual([['Playlist deleted', { undo }], ['Renamed', {}]]);
  expect(actions.toast).not.toHaveBeenCalled();
});

it('Playlist and follows page paths skip React Router: the shell writes the URL first, then opens', async () => {
  const r = await load('/');
  const actions = shellActions();
  const navigate = vi.fn();
  r.managedGo('/playlists', actions, navigate);
  r.managedGo('/follow', actions, navigate);
  expect(navigate).not.toHaveBeenCalled();
  expect(vi.mocked(actions.navigate).mock.calls).toEqual([['/playlists'], ['/follow']]);
  for (const path of ['/playlists', '/follow']) {
    expect(r.ROUTED_PATHS).toContain(path);
    expect(r.isManagedPath(path)).toBe(false);
  }
});

/* ── Follows page ── */

const VIEW: FollowView = {
  status: '', media: 'videos', author: '', provider: '', work: '', tags: [], durMin: 0, durMax: 0, sort: 'new', dir: 'desc', seed: 7,
};

function followHelpers(): FollowFeedHelpers {
  return {
    workMark: () => '', tagLabel: (tag) => tag, wireDrag: vi.fn(), wireScroller: vi.fn(),
    listSkeletonHtml: () => '<div data-test-skeleton>skeleton</div>', jobProgress: vi.fn(),
  };
}
function followActions(): FollowFeedActions {
  return {
    route: vi.fn(), shuffle: vi.fn(), loaded: vi.fn(), openDetail: vi.fn(), openAuthor: vi.fn(), toggleSelection: vi.fn(),
    setImagesOnly: vi.fn(), setPhotoLayout: vi.fn(), canFlip: () => false, toast: vi.fn(), failure: vi.fn(), checkReport: vi.fn(),
  };
}
const followOpen = (patch: Partial<FollowFeedProps> = {}): FollowFeedProps => ({
  view: VIEW, seed: 5, revision: 0, selectMode: false, selected: new Set(), photoSize: 'small', photoLayout: 'masonry',
  imagesOnly: false, helpers: followHelpers(), actions: followActions(), ...patch,
});

/** One page of the follows list: the title carries the status tier, so which fetch it depicts is recognizable. */
const followPage = (status: string) => ({
  groups: [1, 2, 3].map((id) => ({
    primary: { id, title: `Update ${id} ${status || 'all'}`, status: 'new', provider: 'kemono', provider_label: 'Kemono',
      source_id: 1, published_at: '2026-09-10T08:00:00Z', media_kind: 'video', playable: true, thumb_url: `/thumb/${id}`,
      tags: [] },
    variants: [], duplicates: [], stack: null,
  })),
  counts: { new: 3, saved: 0, ignored: 0 }, sources: [{ id: 1, provider: 'kemono', provider_label: 'Kemono',
    author_key: 'name:kou', last_status: 'ok' }], author_aliases: [], offset: 0, has_more: false,
  facets: { authors: ['name:kou'], providers: ['kemono'], tags: [], works: [] },
});

/** The follows page's data fetches: list and credentials, both can be resolved manually (the first screen renders only once both arrive). */
function followFetch({ deferred = false } = {}) {
  const pending: Array<() => void> = [];
  const fetched = vi.fn((input: string, init?: RequestInit) => {
    const url = new URL(String(input), 'http://peach.test');
    const body = url.pathname === '/api/follow/credentials' ? { providers: [] } : followPage(url.searchParams.get('status') || '');
    if (!deferred) return Promise.resolve(reply(body));
    return new Promise<Reply>((resolve, reject) => {
      pending.push(() => resolve(reply(body)));
      init?.signal?.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')) });
    });
  });
  vi.stubGlobal('fetch', fetched);
  const calls = (path: string) => fetched.mock.calls
    .map(([input]) => new URL(String(input), 'http://peach.test')).filter((url) => url.pathname === path);
  return { fetched, calls, resolve: () => { for (const settle of pending.splice(0)) settle() } };
}

/** Same as the shell's `revealRoutedPage`: the skeleton goes to `revealSkeleton` to be raised into a fade-out layer, while `write` only goes into the empty host. */
function revealRoutedPage(container: Element): HTMLElement {
  const host = document.createElement('div');
  host.className = 'peach-react';
  revealSkeleton(container, () => { container.textContent = ''; container.append(host) });
  return host;
}

const FOLLOW_SKELETON = '<div class="follow" data-skeleton="follow"><h2 class="pagetitle">Follows</h2>'
  + '<span class="countskeleton"></span></div>';

it('Cold-start deep link to follows: the skeleton fade and the full page hand over in the same batch of changes with no empty frame between', async () => {
  const r = await load('/follow');
  const { stats, skeleton } = statsSurface(FOLLOW_SKELETON);
  await mount(r);
  const fetch = followFetch({ deferred: true });
  const opened = r.openManagedRoute('/follow', followOpen(), { container: stats, isCurrent: () => true, place: revealRoutedPage });
  await until(() => fetch.calls('/api/follow').length > 0 && fetch.calls('/api/follow/credentials').length > 0, 'Both first-screen passes sent out');
  expect(stats.firstElementChild, 'Skeleton kept as-is until data lines up').toBe(skeleton);
  const batches: Array<{ bare: boolean; fading: boolean; painted: boolean; revealing: boolean }> = [];
  const observer = new MutationObserver(() => {
    batches.push({
      bare: Boolean(stats.querySelector(':scope > [data-skeleton]')),
      fading: Boolean(stats.querySelector(':scope > .skelfade > [data-skeleton]')),
      painted: Boolean(stats.querySelector('.peach-react [data-follow-feed]')),
      revealing: stats.classList.contains('skelreveal') && stats.classList.contains('revealing'),
    });
  });
  observer.observe(stats, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  unmounts.push(() => observer.disconnect());
  fetch.resolve();
  await act(async () => { expect(await opened).toBe(true) });
  expect(batches[0], 'Within the batch removing the skeleton, the skeleton is already a fade layer and the full page is painted').toEqual(
    { bare: false, fading: true, painted: true, revealing: true });
  expect(batches.every((batch) => batch.bare || batch.fading || batch.painted), 'No batch is empty').toBe(true);
  expect(stats.querySelector('.skelfade')?.firstElementChild, 'Inside the fade layer sits the original skeleton').toBe(skeleton);
  expect(r.managedEntry(stats)?.host.parentElement).toBe(stats);
  // jsdom does not fire transitionend, so the fade layer is cleaned up by `revealSkeleton`'s fallback timer.
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 1100) }) });
  expect(stats.querySelector('.skelfade')).toBeNull();
  expect(stats.classList.contains('skelreveal')).toBe(false);
  expect(stats.querySelector(':scope > .peach-react [data-follow-feed]')).not.toBeNull();
});

/* In-page filter changes, sidebar tabs, and back/forward land on this page: the shell pushes a new `view` (re-entry also carries a new seed and generation), and the page only refetches
   the list under the new key; credentials are not refetched, and the page header and the two rows do not remount. */
it('The follows page pushes filter and generation in place: the generation stays, nothing remounts, and only the list refetches with the new key', async () => {
  const r = await load('/follow');
  const { stats } = statsSurface(FOLLOW_SKELETON);
  await mount(r);
  const fetch = followFetch();
  const open = followOpen();
  await act(async () => {
    await r.openManagedRoute('/follow', open, { container: stats, isCurrent: () => true, place: revealRoutedPage });
  });
  await until(() => Boolean(stats.textContent?.includes('Update 1 all')), 'The first-screen list painted');
  const page = stats.querySelector('.peach-react [data-follow-feed]');
  const revision = r.managedEntry(stats)?.revision;
  expect([fetch.calls('/api/follow').length, fetch.calls('/api/follow/credentials').length]).toEqual([1, 1]);
  await act(async () => { r.updateManagedRoute(stats, { view: { ...VIEW, status: 'new' }, seed: 9, revision: 1 }) });
  await until(() => Boolean(stats.textContent?.includes('Update 1 new')), 'Paint the copy refetched with the new key');
  expect(fetch.calls('/api/follow').map((url) => url.searchParams.get('status')), 'Refetches once under the new key only').toEqual([null, 'new']);
  expect(fetch.calls('/api/follow/credentials'), 'Credentials not refetched').toHaveLength(1);
  expect(stats.querySelector('.peach-react [data-follow-feed]'), 'Pushing new filters must never remount').toBe(page);
  expect(r.managedEntry(stats)?.revision).toBe(revision);
  expect(r.managedEntry(stats)?.props).toMatchObject({ view: { status: 'new' }, seed: 9, revision: 1 });
  expect((r.managedEntry(stats)!.props as FollowFeedProps).actions, 'The shell\'s own actions kept as-is').toBe(open.actions);
});

it('Follows page: the helpers and actions are the shell\'s, passed through to the page as-is', async () => {
  const r = await load();
  const open = followOpen({ revision: 4 });
  const props = (r.BROWSE_ROUTES['/follow'].page(open, shellActions(), vi.fn()) as ReactElement<FollowFeedProps>).props;
  expect(props).toEqual(open);
  expect([props.helpers, props.actions]).toEqual([open.helpers, open.actions]);
  expect(props.helpers).toBe(open.helpers);
  expect(props.actions).toBe(open.actions);
});
