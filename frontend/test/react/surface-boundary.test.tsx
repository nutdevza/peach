/* The route tree carries one error boundary per surface per layer: a render error in one surface empties only that surface
 * and withdraws its registration, leaving other surfaces and `<Routes>` alone;
 * errors go through the root's `onCaughtError` to `reportError`, one per occurrence; the shell's next open can reopen.
 *
 * The home new-releases row's and junk queue's page modules are swapped wholesale; whether they throw and whether the first
 * screen fetch succeeds is decided by `pages` on the spot: changing it mid-case is "the next open gets the good page". */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useLocation } from 'react-router';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import type { CatalogFilterProps } from '../../src/react/catalog-filter/catalog-filter';
import type { FeedNewProps } from '../../src/react/feed-new/feed-new';
import type { ShellActions } from '../../src/react/router/shell-actions';
import type { SearchApi, SearchProps } from '../../src/react/search/search';

// The first import compiles the whole page subtree the route table pulls in, with the compile wait on its own finite window; every later case remounts and only reruns the module.
const REACT_IMPORT_TIMEOUT_MS = 30_000;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => { await import('../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

const pages = vi.hoisted(() => ({
  feedBroken: false, junkBroken: false, feedPrefetchFails: false,
}));

vi.mock('../../src/react/feed-new/feed-new-page', () => ({
  FeedNewPage: () => {
    if (pages.feedBroken) throw new Error('New releases row fails to render');
    return <p data-feed-good>New releases</p>;
  },
}));
vi.mock(import('../../src/react/feed-new/feed-new'), async (importOriginal) => ({
  ...(await importOriginal()),
  prefetchFeedNew: async () => { if (pages.feedPrefetchFails) throw new Error('Failed to fetch data') },
}));
vi.mock('../../src/react/junk-queue/junk-queue-page', () => ({
  JunkQueuePage: () => {
    if (pages.junkBroken) throw new Error('The junk queue never paints');
    return null;
  },
}));

/** Stays on the immersive URL while loading: the page group's `path="*"` renders `children` only for URLs the route tree does not paint. */
async function load() {
  vi.resetModules();
  window.history.replaceState(null, '', '/nowhere');
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
  Object.assign(pages, { feedBroken: false, junkBroken: false, feedPrefetchFails: false });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

/** The shell's startup order: draw the router tree first, then attach fetching. The root's options are the same set as `configureRouter`'s; it returns the container the root lives in,
 *  and the `children` marker nodes render inside it. */
/* The slot for addresses the page group cannot recognize: it remembers the address it saw; if it still follows changes after back and forward, `<Routes>` is still alive. */
function Marker() {
  return <i data-marker data-path={useLocation().pathname} />;
}

async function mount(r: Loaded): Promise<HTMLElement> {
  const el = document.createElement('div');
  const root = createRoot(el, r.ROUTER_ROOT_OPTIONS);
  await act(async () => { root.render(<r.RouterRoot actions={shellActions()}><Marker /></r.RouterRoot>) });
  unmounts.push(() => root.unmount());
  await act(async () => { r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute)) });
  return el;
}

/** The container where the shell lays the skeleton. */
function container(id: string): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  el.innerHTML = '<div class="geist-skeleton" data-skeleton="cards">Loading</div>';
  document.body.append(el);
  return el;
}

/** Accept every report; `console.error` is only muted, not counted. Fetches always return idle and an empty list. */
function watchReports() {
  const reported = vi.fn();
  vi.stubGlobal('reportError', reported);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'idle', items: [] }) })));
  return reported;
}

function filterProps(): CatalogFilterProps {
  return {
    tiers: { key: 'k', performers: [], studios: [] }, tiersPending: false, empty: true, tags: [], tagFirst: 0,
    views: [{ k: '', label: 'All', href: '/' }], state: '', count: { total: 0, shown: 0 }, trash: false,
    sorts: [], layout: null, refreshing: false, offscreen: false, combo: [], comboHidden: true, comboHost: null,
    actions: {
      openEntity: vi.fn(), setView: vi.fn(), toggleTag: vi.fn(), clearFilter: vi.fn(), clearAll: vi.fn(),
      setSort: vi.fn(), reshuffle: vi.fn(async () => {}), setLayout: vi.fn(), moreTops: vi.fn(async () => []),
    },
    helpers: { wireDrag: vi.fn(), wireScroller: vi.fn() },
  };
}

function feedProps(host: HTMLElement, revision = 0): FeedNewProps {
  return { host, revision, helpers: { feedRowHtml: () => '', wireFeedRow: vi.fn() }, actions: { settled: vi.fn() } };
}

function searchProps(exposed: { api: SearchApi | null }): SearchProps {
  const input = document.createElement('input');
  document.body.append(input);
  return {
    input, historyLimit: 10,
    actions: { search: vi.fn(), openItem: vi.fn(), openEntity: vi.fn() },
    helpers: {
      pool: async () => [], coverHtml: () => '',
      present: (el) => { el.hidden = false }, dismiss: (el) => { el.hidden = true },
      wireScroller: () => {}, typed: () => {}, composing: () => {}, clearField: (el) => { el.value = '' },
    },
    expose: (api) => { exposed.api = api },
  };
}

const always = () => true;

async function openFilter(r: Loaded): Promise<HTMLElement> {
  const el = container('catalogFilter');
  await act(async () => {
    expect(await r.openManagedRoute('catalog-filter', filterProps(), { container: el, isCurrent: always })).toBe(true);
  });
  return el;
}

it('When an in-page component throws while rendering: only its surface blanks, its registration is withdrawn, one report goes out, and the other surface and the tree are untouched', async () => {
  const reported = watchReports();
  pages.feedBroken = true;
  const r = await load();
  const tree = await mount(r);
  const filter = await openFilter(r);
  const feed = container('feedNew');
  await act(async () => {
    expect(await r.openManagedRoute('feed-new', feedProps(feed), { container: feed, isCurrent: always }),
      'Even when the first frame throws, opening still returns true').toBe(true);
  });

  expect(r.managedTaken(feed), 'The shell can reopen it next time').toBe(false);
  expect(feed.childNodes.length, 'The broken face is torn down along with its host').toBe(0);
  expect(r.managedEntry(feed)).toBeNull();
  expect(r.managedEntries().map((entry) => entry.path)).toEqual(['catalog-filter']);
  expect(filter.querySelector(':scope > .peach-react [data-catalog-placeholder="performer"]'), 'Filter bar still drawn').not.toBeNull();
  expect(tree.querySelector('[data-marker]'), 'Whole tree not unmounted').not.toBeNull();
  expect(reported).toHaveBeenCalledTimes(1);
  expect(reported).toHaveBeenCalledWith(expect.objectContaining({ message: 'New releases row fails to render' }));
});

it('Pushing a patch after a thrown error is a no-op; the shell reports once per reopen, and once a good page arrives it paints', async () => {
  const reported = watchReports();
  pages.feedBroken = true;
  const r = await load();
  await mount(r);
  const feed = container('feedNew');
  const open = (revision: number) => r.openManagedRoute('feed-new', feedProps(feed, revision),
    { container: feed, isCurrent: always });
  await act(async () => { await open(0) });
  expect(reported).toHaveBeenCalledTimes(1);

  await act(async () => { r.updateManagedRoute(feed, { revision: 1 }) });
  expect(reported, 'Containers that never painted take the patch without repainting').toHaveBeenCalledTimes(1);
  await act(async () => { await open(2) });
  expect(reported, 'The deterministic throw reports once per reopen').toHaveBeenCalledTimes(2);

  pages.feedBroken = false;
  await act(async () => { expect(await open(3)).toBe(true) });
  expect(feed.querySelector(':scope > .peach-react [data-feed-good]')).not.toBeNull();
  expect(r.managedTaken(feed)).toBe(true);
  expect(reported).toHaveBeenCalledTimes(2);
});

it('A first-screen fetch failure is not a render error: it paints and never reports', async () => {
  const reported = watchReports();
  pages.feedPrefetchFails = true;
  const r = await load();
  await mount(r);
  const feed = container('feedNew');
  await act(async () => {
    expect(await r.openManagedRoute('feed-new', feedProps(feed), { container: feed, isCurrent: always })).toBe(true);
  });
  expect(feed.querySelector(':scope > .peach-react [data-feed-good]')).not.toBeNull();
  expect(r.managedTaken(feed)).toBe(true);
  expect(reported).not.toHaveBeenCalled();
});

it('One page throwing: all four in-page components still paint, and back/forward keeps working', async () => {
  const reported = watchReports();
  pages.junkBroken = true;
  const r = await load();
  const tree = await mount(r);
  const filter = await openFilter(r);
  const feed = container('feedNew');
  const notice = container('libraryProcessingNotice');
  const menu = container('searchMenu');
  const exposed: { api: SearchApi | null } = { api: null };
  await act(async () => {
    await r.openManagedRoute('feed-new', feedProps(feed), { container: feed, isCurrent: always });
    await r.openManagedRoute('library-processing', { toast: vi.fn(), mode: 'notice' }, { container: notice, isCurrent: always });
    await r.openManagedRoute('search', searchProps(exposed), { container: menu, isCurrent: always });
  });
  const grid = container('grid');
  await act(async () => { await r.openManagedRoute('/junk-files', {}, { container: grid, isCurrent: always }) });

  expect(grid.childNodes.length).toBe(0);
  expect(r.managedTaken(grid)).toBe(false);
  expect(reported).toHaveBeenCalledTimes(1);
  expect(r.managedEntries().map((entry) => entry.path).sort())
    .toEqual(['catalog-filter', 'feed-new', 'library-processing', 'search']);
  expect(filter.querySelector('[data-catalog-placeholder="performer"]')).not.toBeNull();
  expect(feed.querySelector('[data-feed-good]')).not.toBeNull();
  expect(notice.querySelector(':scope > .peach-react')).not.toBeNull();
  expect(menu.querySelector(':scope > .peach-react')).not.toBeNull();
  expect(exposed.api).not.toBeNull();
  expect(tree.querySelector('[data-marker]')).not.toBeNull();

  await act(async () => {
    window.history.replaceState(window.history.state, '', '/elsewhere');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  expect(tree.querySelector('[data-marker]')?.getAttribute('data-path'), 'The route root still follows history').toBe('/elsewhere');
});
