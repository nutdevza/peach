/* The follows and playlists route elements (`src/react/router/pages/follow.tsx`): mount when the page group matches these
 * two, and decide by page-open epoch, the shell's reopen count (`pageOpens` in `@peach/shell`) and the overlay when to open
 * that page by address, rendering into `#stats`.
 *
 * The follows page does not key by generation: on every open it first has the shell read filters from the address
 * (`follow.refresh`); if the list is still rendered the shell pushes in place, and only otherwise does the whole page open.
 * The shell double here pushes per the real shell's criteria: when the follows page is rendered in `#stats`, it pushes the
 * address's seed and a new generation. How the pages fetch and render is governed by `browse-routes.test.tsx` and each
 * page's cases. The history object and shell state are module-level; every case reloads them. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import type { FollowFeedActions, FollowFeedHelpers, FollowFeedProps } from '../../../src/react/follow-feed/follow-feed';
import type { ShellActions } from '../../../src/react/router/shell-actions';

const REACT_IMPORT_TIMEOUT_MS = 30_000;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => { await import('../../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

async function load(path = '/') {
  vi.resetModules();
  window.history.replaceState(null, '', path);
  const [history, router, routes, shell] = await Promise.all([
    import('../../../src/history'), import('../../../src/react/router/router'),
    import('../../../src/react/router/managed-routes'), import('../../../src/shell'),
  ]);
  // The shell's in-memory state is a live binding: keep the whole module around for reading.
  return { ...history, ...router, ...routes, shell };
}
type Loaded = Awaited<ReturnType<typeof load>>;

const unmounts: Array<() => void> = [];
afterEach(async () => {
  for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const FOLLOW_SKELETON = '<div class="follow" data-skeleton="follow"><h2 class="pagetitle">Follows</h2></div>';

const helpers: FollowFeedHelpers = {
  workMark: () => '', tagLabel: (tag) => tag, wireDrag: () => {}, wireScroller: () => {},
  listSkeletonHtml: () => '<div data-test-skeleton>skeleton</div>', jobProgress: () => {},
};
const feedActions: FollowFeedActions = {
  route: () => {}, shuffle: () => {}, loaded: () => {}, openDetail: () => {}, openAuthor: () => {}, toggleSelection: () => {},
  setImagesOnly: () => {}, setPhotoLayout: () => {}, canFlip: () => false, toast: () => {}, failure: () => {}, checkReport: () => {},
};

/** The group handed in by the shell, plus a log of the open sequence in order. The follows page's steps follow the real shell's criteria. */
function shellActions(r: Loaded) {
  const log: string[] = [];
  const stats = () => document.getElementById('stats')!;
  const followShown = () => r.managedEntry(stats())?.path === '/follow';
  const props = (): FollowFeedProps => ({
    view: { status: '', media: 'videos', author: '', provider: '', work: '', tags: [], durMin: 0, durMax: 0, sort: 'new', dir: 'desc', seed: 7 },
    seed: r.shell.followDiscoverySeed, revision: r.shell.followRevision, selectMode: false, selected: new Set(),
    photoSize: 'small', photoLayout: 'masonry', imagesOnly: false, helpers, actions: feedActions,
  });
  const actions: ShellActions = {
    openItem: vi.fn(), openEntity: vi.fn(), openTag: vi.fn(), openTasteSignal: vi.fn(), navigate: vi.fn(),
    openManage: vi.fn(), managePath: vi.fn(() => ''), openFollow: vi.fn(), receipt: vi.fn(), toast: vi.fn(),
    failure: vi.fn(), revealSource: vi.fn(async () => ''), reopenTutorial: vi.fn(async () => {}),
    routeReview: vi.fn(),
    routeFollowManage: vi.fn(), saveFollowPreference: vi.fn(), srcBadge: () => '', routeIndex: vi.fn(),
    savePeopleLayout: vi.fn(), exitSelectMode: vi.fn(), personAvatar: vi.fn(() => ({ html: '', face: '' })),
    authorAvatar: vi.fn(() => ''), showIndexTags: vi.fn(), openFollowAuthor: vi.fn(), openFollowTag: vi.fn(),
    openPlaylist: vi.fn(), canFlip: () => true,
    surfaceChanged: vi.fn((kind: string, path: string) => { log.push(`surface ${kind} ${path}`) }),
    clearSearch: vi.fn(), openImmerse: vi.fn(), openOverlay: vi.fn(), closeStage: vi.fn(),
    grid: { helpers: {}, actions: {} } as ShellActions['grid'],
    follow: {
      refresh: vi.fn(() => {
        log.push('refresh');
        if (!followShown()) return false;
        r.shell.writeShell({ followRevision: r.shell.followRevision + 1 });
        r.updateManagedRoute(stats(), { seed: r.shell.followDiscoverySeed, revision: r.shell.followRevision });
        return true;
      }),
      skeleton: vi.fn(() => FOLLOW_SKELETON),
      props: vi.fn(props),
      ground: vi.fn(() => { log.push('ground') }),
    },
  };
  return { actions, log };
}

type Reply = { ok: boolean; status: number; json(): Promise<unknown> };
const reply = (body: unknown): Reply => ({ ok: true, status: 200, json: async () => body });

const followPage = {
  groups: [1, 2].map((id) => ({
    primary: { id, title: `Update ${id}`, status: 'new', provider: 'kemono', provider_label: 'Kemono', source_id: 1,
      published_at: '2026-09-10T08:00:00Z', media_kind: 'video', playable: true, thumb_url: `/thumb/${id}`, tags: [] },
    variants: [], duplicates: [], stack: null,
  })),
  counts: { new: 2, saved: 0, ignored: 0 }, sources: [{ id: 1, provider: 'kemono', provider_label: 'Kemono',
    author_key: 'name:kou', last_status: 'ok' }], author_aliases: [], offset: 0, has_more: false,
  facets: { authors: ['name:kou'], providers: ['kemono'], tags: [], works: [] },
};
const playlists = {
  items: [{
    id: 1, name: 'Weekend binge', source_kind: 'manual', source_seed_asset_id: null, current_asset_id: null,
    created_at: '2026-09-01 10:00:00', updated_at: '2026-09-01 10:00:00', item_count: 2,
    preview_asset_id: 11, preview_ids: [11, 12], faces: [],
  }],
};

/** A local data stand-in: the follows list, credentials, and playlist each return a copy, and every request is recorded. */
function serve() {
  const fetched = vi.fn((input: string) => {
    const path = new URL(String(input), 'http://peach.test').pathname;
    const body = path === '/api/follow/credentials' ? { providers: [] } : path === '/api/playlists' ? playlists : followPage;
    return Promise.resolve(reply(body));
  });
  vi.stubGlobal('fetch', fetched);
  return (path: string) => fetched.mock.calls.filter(([input]) => new URL(String(input), 'http://peach.test').pathname === path).length;
}

function statsSurface(skeleton = FOLLOW_SKELETON) {
  const stats = document.createElement('section');
  stats.id = 'stats';
  stats.innerHTML = skeleton;
  document.body.append(stats);
  return stats;
}

async function until(ok: () => boolean, what: string): Promise<void> {
  for (let step = 0; step < 200; step += 1) {
    if (ok()) return;
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });
  }
  throw new Error(`Timed out waiting for: ${what}`);
}
async function settle() {
  for (let step = 0; step < 3; step += 1) {
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });
  }
}

/** Mount the route root, wire up the page bundle, then start routing like the shell: the initial start writes `pageOpens` to 1. */
async function boot(r: Loaded, actions: ShellActions) {
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<r.RouterRoot actions={actions} />) });
  unmounts.push(() => root.unmount());
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  await act(async () => { r.shell.writeShell({ pageOpens: 1 }) });
  await settle();
}

/** The shell claims the address write, then asks for a reopen by address (`openRoutedPage`). */
async function openRouted(r: Loaded, path: string) {
  await act(async () => {
    r.shellNavigate(path);
    r.shell.writeShell({ pageOpens: r.shell.pageOpens + 1 });
  });
  await settle();
}

async function pop(r: Loaded, path: string, state: unknown = null) {
  await act(async () => {
    window.history.replaceState(state, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
  });
  await settle();
}

const page = (stats: Element) => stats.querySelector(':scope > .peach-react > *');
const opens = (actions: ShellActions) => vi.mocked(actions.surfaceChanged).mock.calls.length;
const FOLLOW_ITEM_STATE = { backgroundLocation: { pathname: '/follow', search: '' }, overlay: 'follow' };

it('Follows element: when the shell starts routing it opens full page from the URL; the shell reads the filters first, then reports the view swap, lays the skeleton, and completes the first screen', async () => {
  const r = await load('/follow');
  const stats = statsSurface();
  const calls = serve();
  const { actions, log } = shellActions(r);
  await boot(r, actions);
  await until(() => page(stats) !== null, 'The full page painted');
  expect(log).toEqual(['refresh', 'surface follow /follow']);
  expect(actions.follow!.skeleton).toHaveBeenCalledTimes(1);
  expect([calls('/api/follow'), calls('/api/follow/credentials')]).toEqual([1, 1]);
  expect(r.managedEntry(stats)).toMatchObject({ path: '/follow', props: { revision: 0 } });
});

it('Follow element: re-entering from the sidebar (the shell rerolls the seed and asks to reopen) with the list still painted pushes a new seed and new generation in place, refetching by the new generation without remounting', async () => {
  const r = await load('/follow');
  const stats = statsSurface();
  const calls = serve();
  const { actions } = shellActions(r);
  await boot(r, actions);
  await until(() => page(stats) !== null, 'The full page painted');
  const painted = page(stats);
  r.shell.writeShell({ followDiscoverySeed: 99, followScrollY: 0 });
  await openRouted(r, '/follow');
  await until(() => calls('/api/follow') === 2, 'Refetch the list under the new epoch');
  expect(r.managedEntry(stats)?.props).toMatchObject({ seed: 99, revision: 1 });
  expect(page(stats), 'Push in place, no remount').toBe(painted);
  expect(opens(actions), 'Never re-reports the face swap').toBe(1);
  expect(calls('/api/follow/credentials'), 'Credentials not refetched').toBe(1);
});

it('Follow element: when back lands on the follows page and the list has been collapsed it opens the full page; with the epoch unchanged and the first screen hitting cache the list is not refetched, and it scrolls back to the remembered position', async () => {
  const r = await load('/follow');
  const stats = statsSurface();
  const calls = serve();
  let scrollTop = 0;
  vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollTop);
  const scrolled = vi.spyOn(window, 'scrollTo').mockImplementation((options: number | ScrollToOptions | undefined) => {
    if (typeof options === 'object') scrollTop = options.top ?? scrollTop;
  });
  const { actions } = shellActions(r);
  await boot(r, actions);
  await until(() => page(stats) !== null, 'The full page painted');
  scrollTop = 640;
  // Navigating to another page: when that page claims the surface, it dismisses the follows page.
  await act(async () => { r.shellNavigate('/immerse') });
  await settle();
  expect(r.managedEntry(stats)?.path, 'Page not collapsed on element unmount').toBe('/follow');
  await act(async () => { r.releaseManagedRoute(stats) });
  scrolled.mockClear();
  await pop(r, '/follow');
  await until(() => page(stats) !== null, 'The full page repaints');
  expect(opens(actions), 'The full page opens once').toBe(2);
  expect(calls('/api/follow'), 'Generation unchanged, list not refetched').toBe(1);
  expect(r.managedEntry(stats)?.props).toMatchObject({ revision: 0 });
  await until(() => scrollTop === 640, 'Restores the historical reading position');
  expect(scrolled).toHaveBeenLastCalledWith({ left: 0, top: 640, behavior: 'smooth' });
});

it('Follow element: entering details and closing back to the list are both shell-claimed address writes; the list neither remounts nor refetches', async () => {
  const r = await load('/follow');
  const stats = statsSurface();
  const calls = serve();
  const { actions, log } = shellActions(r);
  await boot(r, actions);
  await until(() => page(stats) !== null, 'The full page painted');
  const painted = page(stats);
  const before = log.length;
  await act(async () => { r.shellNavigate('/posts/2', { state: FOLLOW_ITEM_STATE }) });
  await settle();
  await act(async () => { r.shellNavigate('/follow', { replace: true }) });
  await settle();
  expect(log.slice(before), 'The element does nothing').toEqual([]);
  expect(page(stats)).toBe(painted);
  expect(calls('/api/follow')).toBe(1);
});

it('Follow element: a deep link straight into follow details mounts no list and only asks the shell to yield `#stats`; closing the details (a shell-claimed write that asks to reopen) is what opens the full page', async () => {
  const r = await load('/posts/2');
  const stats = statsSurface('');
  const calls = serve();
  const { actions, log } = shellActions(r);
  await boot(r, actions);
  expect(log, 'No list mounted under deep-linked details').toEqual(['ground']);
  expect(calls('/api/follow')).toBe(0);
  await openRouted(r, '/follow');
  await until(() => page(stats) !== null, 'Full page renders after the details close');
  expect(log).toEqual(['ground', 'refresh', 'surface follow /follow']);
});

it('Follow element: when back/forward lands on details covering a list that is not painted, the shell yields `#stats`; closing back to the list (a claimed address write) opens the full page once', async () => {
  const r = await load('/immerse');
  const stats = statsSurface('');
  serve();
  const { actions, log } = shellActions(r);
  await boot(r, actions);
  await pop(r, '/posts/2', { usr: FOLLOW_ITEM_STATE, key: 'x', idx: 1 });
  expect(log, 'Mounted under details without opening').toEqual(['ground']);
  await act(async () => {
    r.shellNavigate('/follow');
    r.shell.writeShell({ pageOpens: r.shell.pageOpens + 1 });
  });
  await until(() => page(stats) !== null, 'Full page renders after the details close');
  expect(log, 'A claimed address write and a reopen request merge into one').toEqual(['ground', 'refresh', 'surface follow /follow']);
});

it('Playlist element: opens full page by address; staying on this page and asking to refetch pushes a new generation in place and refetches, and when the shell asks to reopen, the full page reopens', async () => {
  const r = await load('/playlists');
  const stats = statsSurface('');
  const calls = serve();
  const { actions, log } = shellActions(r);
  await boot(r, actions);
  await until(() => page(stats) !== null, 'The full page painted');
  expect(log).toEqual(['surface playlists /playlists']);
  expect(stats.querySelector('[data-skeleton]'), 'The skeleton withdraws once the first screen completes').toBeNull();
  const painted = page(stats);
  await act(async () => { r.shell.writeShell({ playlistsRevision: r.shell.playlistsRevision + 1 }) });
  await until(() => calls('/api/playlists') === 2, 'Refetch under the new epoch');
  expect(page(stats), 'Push in place, no remount').toBe(painted);
  expect(r.managedEntry(stats)?.props).toEqual({ revision: 1 });
  expect(opens(actions)).toBe(1);
  await openRouted(r, '/playlists');
  await until(() => page(stats) !== null && page(stats) !== painted, 'The full page reopened');
  expect(calls('/api/playlists'), 'Returning to the same list reuses the cache').toBe(2);
  expect(opens(actions), 'Clicking the sidebar again reopens the full page').toBe(2);
});
