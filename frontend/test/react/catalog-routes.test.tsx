/* 目录网格与垃圾队列由路由树画进 `#grid`（`CATALOG_ROUTES`）：页面挂载即取数，骨架与内容在变化区交叉淡化。
 * 壳认领表面只收 `#stats` 与 `#index`，`#grid` 上那一页留着；停在目录时壳经 `updateManagedRoute`
 * 推选择态、版式与筛选，页面不重挂、代次不变，换筛选只按新键重取一次；垃圾队列一次清空骨架，收起时计数行那一格
 * 同步撤掉；壳那一份助手与动作原样交给页面；这些路径不交给 React Router。
 *
 * 一屏卡片怎么排、卡面画什么由 `catalog-grid.test.tsx` 与 `junk-queue.test.tsx` 管，这里看的是路由树这一层。 */
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import type { CatalogGridProps, MediaCardActions, MediaCardHelpers } from '../../src/react/catalog-grid/types';
import type { JunkQueueProps } from '../../src/react/junk-queue/junk-queue';
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

/** One page of the catalog: names carry the sort key so you can tell which fetch this page was drawn from. */
const catalogPage = (sort: string) => ({
  items: [1, 2, 3].map((id) => ({ id, name: `Video ${id} ${sort}`, has_thumb: true })), total: 3,
});
const playlistPage = { items: [] };
/** One page of the junk queue: names carry the category so you can tell which fetch this page was drawn from. */
const junkPage = (kind: string) => ({
  items: [11, 12, 13].map((id) => ({
    id, name: `junk ${id} ${kind || 'All'}.mp4`, junk_kind: kind || 'video', why: 'Duration too short', location: 'local', cost: 'free',
  })),
  total: 3, all_total: 3, dismissed_total: 0, counts: { video: 3 },
});

/** Fetching for the catalog, the junk queue, and playlists: `/api/items` can be resolved manually (the first screen waits for exactly that). */
function catalogFetch({ deferred = false } = {}) {
  const pending: Array<() => void> = [];
  const fetched = vi.fn((input: string, init?: RequestInit) => {
    const url = new URL(String(input), 'http://peach.test');
    const summary = url.pathname === '/api/items' && url.searchParams.get('summary_only') === '1';
    const body = summary ? { total: 3, bytes: 0, work_total: 3 }
      : url.pathname === '/api/playlists' ? playlistPage
      : url.pathname === '/api/ads' ? junkPage(url.searchParams.get('kind') || '')
        : catalogPage(url.searchParams.get('sort') || '');
    if (!deferred || url.pathname !== '/api/items' || summary) return Promise.resolve(reply(body));
    return new Promise<Reply>((resolve, reject) => {
      pending.push(() => resolve(reply(body)));
      init?.signal?.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')) });
    });
  });
  vi.stubGlobal('fetch', fetched);
  const calls = (path: string) => fetched.mock.calls
    .map(([input]) => new URL(String(input), 'http://peach.test')).filter((url) => url.pathname === path);
  return { fetched, calls,
    pages: () => calls('/api/items').filter(url => url.searchParams.get('summary_only') !== '1'),
    summaries: () => calls('/api/items').filter(url => url.searchParams.get('summary_only') === '1'),
    resolve: () => { for (const settle of pending.splice(0)) settle() } };
}

const helpers: MediaCardHelpers = {
  badgeHtml: () => '', titleHtml: (_item, raw) => raw, displayName: (_item, raw) => raw, tagLabel: (tag) => tag,
};
function cardActions(): MediaCardActions {
  return {
    open: vi.fn(), openResource: vi.fn(), openShort: vi.fn(), openShorts: vi.fn(), openMix: vi.fn(),
    openEntity: vi.fn(), openUnowned: vi.fn(), toggleTag: vi.fn(), toggleSelection: vi.fn(),
    watchLater: vi.fn(async () => {}), rate: vi.fn(async () => {}), resourceOperation: vi.fn(async () => {}), mixRelated: vi.fn(async () => []),
    canFlip: () => true,
  };
}
const catalogOpen = (patch: Partial<CatalogGridProps> = {}): CatalogGridProps => ({
  mode: 'catalog', helpers, actions: cardActions(), layout: { active: false, size: 'small', portrait: false, javImage: 'cover' },
  selectMode: false, selected: new Set(), seekSeconds: 10, revision: 0, skeletonHtml: () => '', wireDrag: vi.fn(),
  settled: vi.fn(), filters: { sort: 'seed' }, batchSize: 60, groupCollapse: true, excludeVertical: false,
  mix: false, shorts: false, onCount: vi.fn(), emptyHtml: () => '', canLoadMore: () => true, ...patch,
});

/** Opening the junk files queue page: the count row is the shell's `#count`, with the shell's skeleton version laid inside. */
function junkOpen(patch: Partial<JunkQueueProps> = {}): JunkQueueProps {
  const countRow = document.createElement('div');
  countRow.id = 'count';
  countRow.innerHTML = '<div class="peach-react" data-junk-count-skeleton=""></div>';
  document.body.append(countRow);
  return {
    kind: '', view: 'pending', helpers: { badgeHtml: () => '' },
    actions: { navigate: vi.fn(), toggleSelection: vi.fn(), open: vi.fn(), reveal: vi.fn(async () => ''), operate: vi.fn(async () => {}) },
    batchSize: 60, revision: 0, selectMode: false, selected: new Set(), countRow,
    skeletonHtml: () => '<div class="grid"><div class="skeletoncard"></div></div>', settled: vi.fn(), ...patch,
  };
}
const junkCards = (grid: Element) => grid.querySelectorAll('.peach-react [data-junk-card]');

const GRID_SKELETON = '<div class="grid"><div class="catalog-skeleton" data-skeleton="catalog">'
  + '<div class="skeletoncard"></div></div></div>';

/** The catalog container; the shell lays the skeleton inside. */
function gridSurface() {
  const grid = document.createElement('div');
  grid.id = 'grid';
  grid.innerHTML = GRID_SKELETON;
  document.body.append(grid);
  return { grid, skeleton: grid.firstElementChild! };
}
function statsSurface() {
  const stats = document.createElement('section');
  stats.id = 'stats';
  stats.innerHTML = '<div data-skeleton="playlists">Loading playlists</div>';
  const index = document.createElement('section');
  index.id = 'index';
  document.body.append(stats, index);
  return { stats, index };
}

/** Same as the shell's `revealRoutedPage`: the skeleton goes to `revealSkeleton` to be raised into a fade-out layer, while `write` only goes into the empty host. */
function revealRoutedPage(container: Element): HTMLElement {
  const host = document.createElement('div');
  host.className = 'peach-react';
  revealSkeleton(container, () => { container.textContent = ''; container.append(host) });
  return host;
}

async function until(ok: () => boolean, what: string): Promise<void> {
  for (let step = 0; step < 200; step += 1) {
    if (ok()) return;
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

const cards = (grid: Element) => grid.querySelectorAll('.peach-react [data-media-grid] > [data-media-card][data-id]');
/** The block the page renders (the host's first element): after a remount it is a different one. */
const painted = (grid: Element) => grid.querySelector(':scope > .peach-react > *');

it('冷启动深链首页取齐首屏再挂，壳的骨架一直留到数据到，挂上就是内容', async () => {
  const r = await load('/');
  const { grid, skeleton } = gridSurface();
  await mount(r);
  const fetch = catalogFetch({ deferred: true });
  const open = catalogOpen({ skeletonHtml: () => GRID_SKELETON });
  const opened = r.openManagedRoute('/', open, { container: grid, isCurrent: () => true, place: revealRoutedPage });
  await until(() => fetch.calls('/api/items').length > 0, 'First-screen fetch sent out');
  expect(skeleton.isConnected, '取数在途时壳的骨架原样留着').toBe(true);
  expect(r.managedEntry(grid), '页面还没挂').toBeFalsy();
  const batches: Array<{ pageSkeleton: boolean; shell: boolean; painted: boolean }> = [];
  const observer = new MutationObserver(() => {
    batches.push({
      pageSkeleton: Boolean(grid.querySelector('[data-content-transition][aria-busy="true"] [data-skeleton]')),
      shell: skeleton.isConnected,
      painted: cards(grid).length === 3,
    });
  });
  observer.observe(grid, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-busy'] });
  unmounts.push(() => observer.disconnect());
  fetch.resolve();
  await act(async () => { expect(await opened).toBe(true) });
  await until(() => cards(grid).length === 3, 'First-screen content ready');
  expect(batches.length).toBeGreaterThan(0);
  expect(batches.some((batch) => batch.pageSkeleton), '页面挂上时不再铺第二份骨架').toBe(false);
  expect(batches.every((batch) => batch.shell || batch.painted), 'Every batch of changes has a placeholder or real content').toBe(true);
  expect(grid.querySelector('.skelfade')?.contains(skeleton), '壳的骨架抬成淡出层与内容交叉').toBe(true);
  expect(grid.querySelector('[data-content-transition]')?.getAttribute('aria-busy')).toBe('false');
  expect(grid.querySelector('[data-content-skeleton]')?.getAttribute('aria-hidden')).toBe('true');
  expect(fetch.pages(), 'The first-screen list fetches only once').toHaveLength(1);
  expect(fetch.summaries(), 'Statistics fetch once separately').toHaveLength(1);
  expect(open.settled).toHaveBeenCalledWith(0);
  expect(r.managedEntry(grid)).toMatchObject({ path: '/', props: { filters: { sort: 'seed' } } });
  // jsdom does not fire transitionend, so the fade layer is cleaned up by `revealSkeleton`'s fallback timer.
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 1100) }) });
  expect(grid.querySelector('.skelfade')).toBeNull();
  expect(cards(grid)).toHaveLength(3);
});

/* The shell claims surfaces on every page change (`claimSurface`), including filter changes inside the catalog: there it names `#stats` and `#index` for teardown, while the
   grid on `#grid` keeps rendering and is torn down only when `#grid` is named. */
it('While the grid is painted on `#grid`, collapsing `#stats` and `#index` leaves it alone; only naming `#grid` collapses it', async () => {
  const r = await load('/');
  const { grid } = gridSurface();
  const { stats, index } = statsSurface();
  await mount(r);
  const fetch = catalogFetch();
  await act(async () => { await r.openManagedRoute('/', catalogOpen(), { container: grid, isCurrent: () => true }) });
  await act(async () => { await r.openManagedRoute('/playlists', { revision: 0 }, { container: stats, isCurrent: () => true }) });
  const page = painted(grid);
  const revision = r.managedEntry(grid)?.revision;
  expect(r.managedEntries().map((entry) => entry.path)).toEqual(['/', '/playlists']);
  act(() => { r.releaseManagedRoute(stats, index) });
  expect(stats.querySelector('.peach-react'), 'The `#stats` page collapsed').toBeNull();
  expect(painted(grid), 'Collapsing other containers must not unmount the grid').toBe(page);
  expect(r.managedEntry(grid)?.revision).toBe(revision);
  expect(cards(grid)).toHaveLength(3);
  expect(fetch.pages(), 'Grid not refetched').toHaveLength(1);
  expect(fetch.summaries(), 'Statistics not refetched').toHaveLength(1);
  act(() => { r.releaseManagedRoute(grid) });
  expect([grid.querySelector('.peach-react'), r.managedEntries().length]).toEqual([null, 0]);
});

/* Multi-select, layout change and skip-seconds change land on the catalog: the shell pushes them in, cards redraw in place, no remount and no refetch. */
it('Selection state and layout are pushed in place: same generation, no remount, no refetch', async () => {
  const r = await load('/');
  const { grid } = gridSurface();
  await mount(r);
  const fetch = catalogFetch();
  const open = catalogOpen();
  await act(async () => { await r.openManagedRoute('/', open, { container: grid, isCurrent: () => true }) });
  const page = painted(grid);
  const revision = r.managedEntry(grid)?.revision;
  await act(async () => { r.updateManagedRoute(grid, { selected: new Set([2]), selectMode: true }) });
  expect(grid.querySelector('[data-media-sections]')?.hasAttribute('data-select-mode')).toBe(true);
  await act(async () => {
    r.updateManagedRoute(grid, { layout: { active: true, size: 'big', portrait: false, javImage: 'cover' }, seekSeconds: 30 });
  });
  expect(painted(grid), 'Pushing selection state and layout must never remount').toBe(page);
  expect(r.managedEntry(grid)?.revision).toBe(revision);
  expect(fetch.pages(), 'The list is not refetched').toHaveLength(1);
  expect(fetch.summaries(), 'Statistics not refetched').toHaveLength(1);
  expect(r.managedEntry(grid)?.props).toMatchObject({ selectMode: true, seekSeconds: 30, layout: { size: 'big' } });
  expect((r.managedEntry(grid)!.props as CatalogGridProps).actions, 'The shell\'s own actions kept as-is').toBe(open.actions);
});

/* Changing the sort, switching sidebar tags, and moving between home and trash all land on the catalog: the shell pushes the new filters and refresh epoch, the page refetches once under the new key, and the host stays. */
it('Filters and the refresh epoch push in place: host and epoch stay, and only one refetch runs under the new key', async () => {
  const r = await load('/');
  const { grid } = gridSurface();
  await mount(r);
  const fetch = catalogFetch();
  const open = catalogOpen();
  await act(async () => { await r.openManagedRoute('/', open, { container: grid, isCurrent: () => true }) });
  const host = r.managedEntry(grid)?.host;
  const revision = r.managedEntry(grid)?.revision;
  await act(async () => { r.updateManagedRoute(grid, { filters: { sort: 'new' }, revision: 1 }) });
  await until(() => Boolean(grid.textContent?.includes('Video 1 new')), 'Paint the copy refetched with the new key');
  expect(fetch.pages().map((url) => url.searchParams.get('sort')), 'The list refetches once only by the new key').toEqual(['seed', 'new']);
  expect(fetch.summaries().map((url) => url.searchParams.get('sort')), 'Statistics fetch once each under the same filters').toEqual(['seed', 'new']);
  expect(grid.querySelectorAll(':scope > .peach-react'), 'Exactly one host').toHaveLength(1);
  expect(r.managedEntry(grid)?.host).toBe(host);
  expect(r.managedEntry(grid)?.revision).toBe(revision);
  expect(open.settled).toHaveBeenLastCalledWith(1);
});

/* Entering junk files: the shell first removes the catalog grid on `#grid`, then opens the queue. No fetch before the queue opens; the skeleton is cleared once and placed into the host,
   no cross-fade; the page fetches its own counts, exactly once. */
it('Junk queue: swap the grid on `#grid`, clear the skeleton in one pass, and the page fetches the first screen itself once', async () => {
  const r = await load('/junk-files');
  const { grid } = gridSurface();
  await mount(r);
  const fetch = catalogFetch();
  await act(async () => { await r.openManagedRoute('/', catalogOpen(), { container: grid, isCurrent: () => true }) });
  await until(() => cards(grid).length === 3, 'Painted on the catalog\'s first screen');
  expect(grid.querySelector('[data-media-sections]'), 'Draws the catalog grid first').not.toBeNull();
  const open = junkOpen();
  await act(async () => { expect(await r.openManagedRoute('/junk-files', open, { container: grid, isCurrent: () => true })).toBe(true) });
  expect(r.managedEntries().map((entry) => entry.path), 'One container keeps a single page').toEqual(['/junk-files']);
  expect([...grid.children].map((el) => el.className), 'The skeleton clears at once with no fade layer').toEqual(['peach-react']);
  await until(() => junkCards(grid).length === 3, 'The queue painted');
  expect(grid.querySelector('[data-media-sections]'), 'The catalog grid is already gone').toBeNull();
  expect(fetch.calls('/api/ads'), 'The reading fetches once').toHaveLength(1);
  expect(open.countRow?.querySelector(':scope > .peach-react:not([data-junk-count-skeleton])'), 'The count row\'s cell took over from the skeleton').not.toBeNull();
  expect(open.settled).toHaveBeenCalledWith(0);
});

/* When the shell navigates away from junk files it first retracts `#grid`, then lays a skeleton over `#count`. The cell the queue built in the count row must already be withdrawn at retraction:
   withdrawing one beat late would flush away the shell's freshly laid skeleton, or unload a portal into an already-replaced node. */
it('Collapsing the junk queue on `#grid`: the count row cell is removed the same instant it collapses, and the skeleton the shell lays afterwards stays', async () => {
  const r = await load('/junk-files');
  const { grid } = gridSurface();
  await mount(r);
  catalogFetch();
  const open = junkOpen();
  const count = open.countRow!;
  await act(async () => { await r.openManagedRoute('/junk-files', open, { container: grid, isCurrent: () => true }) });
  await until(() => junkCards(grid).length === 3, 'The queue painted');
  const errors = vi.spyOn(console, 'error');
  let atRelease: unknown[] = [];
  act(() => {
    r.releaseManagedRoute(grid);
    atRelease = [count.childElementCount, grid.querySelector('.peach-react'), r.managedEntry(grid)];
    count.innerHTML = '<div class="peach-react" data-junk-count-skeleton=""></div>';
  });
  expect(atRelease, 'At the moment of collapse, the count row cell, host, and registration are all gone').toEqual([0, null, null]);
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });
  expect(count.querySelectorAll('[data-junk-count-skeleton]'), 'Skeleton laid by the shell remains').toHaveLength(1);
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

/* Category switch, view switch, re-read after disposal, and selection mode land on the junk queue: the shell pushes them in, the page refetches by the new key, and the host and epoch stay unchanged. */
it('Category, generation, and selection are pushed in place: the trash queue never remounts, it only refetches once with the new key', async () => {
  const r = await load('/junk-files');
  const { grid } = gridSurface();
  await mount(r);
  const fetch = catalogFetch();
  const open = junkOpen();
  await act(async () => { await r.openManagedRoute('/junk-files', open, { container: grid, isCurrent: () => true }) });
  await until(() => junkCards(grid).length === 3, 'The queue painted');
  const host = r.managedEntry(grid)?.host;
  const revision = r.managedEntry(grid)?.revision;
  const countHost = open.countRow?.firstElementChild;
  await act(async () => { r.updateManagedRoute(grid, { kind: 'image', revision: 1 }) });
  await until(() => Boolean(grid.textContent?.includes('Junk 11 image')), 'Paint the copy refetched with the new category');
  await act(async () => { r.updateManagedRoute(grid, { selectMode: true, selected: new Set([12]) }) });
  expect(fetch.calls('/api/ads').map((url) => url.searchParams.get('kind')), 'Refetches once under the new key only').toEqual([null, 'image']);
  expect([r.managedEntry(grid)?.host, r.managedEntry(grid)?.revision]).toEqual([host, revision]);
  expect(open.countRow?.firstElementChild, 'The count row cell is not rebuilt').toBe(countHost);
  expect(grid.querySelector('[data-junk-grid]')?.hasAttribute('data-select-mode')).toBe(true);
  expect(open.settled).toHaveBeenLastCalledWith(1);
});

it('Catalog grid and junk queue: the shell\'s full props are handed to the page as-is, with helper and action identities unchanged', async () => {
  const r = await load();
  const open = catalogOpen({ revision: 4 });
  const props = (r.CATALOG_ROUTES['/'].page(open, shellActions(), vi.fn()) as ReactElement<CatalogGridProps>).props;
  expect(props).toEqual(open);
  expect(props.helpers).toBe(open.helpers);
  expect(props.actions).toBe(open.actions);
  const junk = junkOpen({ revision: 2 });
  const junkProps = (r.CATALOG_ROUTES['/junk-files'].page(junk, shellActions(), vi.fn()) as ReactElement<JunkQueueProps>).props;
  expect(junkProps).toEqual(junk);
  expect(junkProps.helpers).toBe(junk.helpers);
  expect(junkProps.actions).toBe(junk.actions);
});

it('Catalog and junk files paths do not go through React Router: hand the shell the address write, then open; the slot only recognizes page keys', async () => {
  const r = await load('/stats');
  const actions = shellActions();
  const navigate = vi.fn();
  const paths = ['/', '/unseen', '/watch-later', '/flagged', '/trash', '/junk-files'];
  for (const path of paths) r.managedGo(path, actions, navigate);
  r.managedGo('/?tag=a&sort=new', actions, navigate);
  expect(navigate).not.toHaveBeenCalled();
  expect(vi.mocked(actions.navigate).mock.calls).toEqual([...paths, '/?tag=a&sort=new'].map((path) => [path]));
  for (const path of paths) {
    expect(r.ROUTED_PATHS).toContain(path);
    expect(r.isManagedPath(path)).toBe(false);
  }
  expect([r.isRoutedPath('/'), r.isRoutedPath('/junk-files')]).toEqual([true, true]);
  expect(r.isRoutedPath('/trash'), 'Trash also paints the `/` page').toBe(false);
});
