/* The in-page components inside pages are rendered by the route tree (`SURFACE_ROUTES`): home filter bar, home new-releases
 * row, the catalog page's processing banner and the top-bar search dropdown are registered by name, opened by the shell via
 * `openManagedRoute`, pushed via `updateManagedRoute` and torn down via `releaseManagedRoute`, each rendering into its own
 * container. A surface opened before the route tree connects waits for it before rendering; the shell's skeleton is swapped
 * only once the first screen is fetched; while the first screen is in flight the container already belongs to the route tree.
 *
 * Each surface's own content and timing are governed by `library-processing.test.tsx`, `search.test.tsx` and the like; this
 * file covers the route tree layer. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import type { SearchApi, SearchProps } from '../../src/react/search/search';
import type { ShellActions } from '../../src/react/router/shell-actions';

import { deferredFetch } from '../helpers';

// The first import compiles the whole page subtree the route table pulls in, with the compile wait on its own finite window; every later case remounts and only reruns the module.
const REACT_IMPORT_TIMEOUT_MS = 30_000;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => { await import('../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

async function load() {
  vi.resetModules();
  window.history.replaceState(null, '', '/');
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

/** The shell's startup order: render the route tree first, then wire up fetching (`loadRouter`). */
async function mount(r: Loaded) {
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<r.RouterRoot actions={shellActions()} />) });
  unmounts.push(() => root.unmount());
  await act(async () => { r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute)) });
}

/** The container where the shell lays the skeleton. */
function container(id: string): HTMLElement {
  const el = document.createElement('div');
  el.id = id;
  el.innerHTML = '<div class="geist-skeleton" data-skeleton="cards">Loading</div>';
  document.body.append(el);
  return el;
}

/** The steps between dynamic loading and fetching are not fixed; wait until the condition holds. */
async function until(ok: () => boolean, what: string): Promise<void> {
  for (let step = 0; step < 100; step += 1) {
    if (ok()) return;
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

/** The top bar search props: a static input, an `expose` that can hand out commands, and every fetch returning empty. */
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

it('The search dropdown opened before the route tree attaches waits and leaves the container alone; at attach time it renders in and hands over the commands', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) })));
  const r = await load();
  const preload = vi.fn();
  r.preloadManagedRoutes(preload);
  const menu = container('searchMenu');
  const exposed: { api: SearchApi | null } = { api: null };
  const opening = r.openManagedRoute('search', searchProps(exposed), { container: menu, isCurrent: () => true });
  expect(preload, 'The first open fires the React bundle request immediately, without waiting for loadRouter').toHaveBeenCalledTimes(1);
  void r.openManagedRoute('library-processing', { toast: vi.fn() }, { container: container('y'), isCurrent: () => true });
  r.releaseManagedRoute(document.getElementById('y')!);
  expect(preload, 'The mount entry runs only once').toHaveBeenCalledTimes(1);
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });
  expect(menu.querySelector('[data-skeleton]'), 'Before the route tree attaches, the container belongs to the shell').not.toBeNull();
  expect(r.managedTaken(menu), 'The waiting attempt already holds the container, so the shell never reopens').toBe(true);
  expect(r.managedEntry(menu)).toBeNull();

  await mount(r);
  await act(async () => { expect(await opening).toBe(true) });
  expect(menu.querySelector('[data-skeleton]')).toBeNull();
  expect(menu.querySelector(':scope > .peach-react')).not.toBeNull();
  expect(exposed.api, 'Once the dropdown paints it hands commands to the shell').not.toBeNull();
  expect(r.managedEntry(menu)?.path).toBe('search');
});

it('The processing banner swaps out the skeleton only once the first screen completes; while it is in flight the container already belongs to the route tree', async () => {
  const fetch = deferredFetch({ status: 'idle' });
  fetch.install();
  const r = await load();
  await mount(r);
  const el = container('libraryProcessing');
  const opening = r.openManagedRoute('library-processing', { toast: vi.fn() }, { container: el, isCurrent: () => true });
  await until(() => fetch.fetched.mock.calls.length > 0, 'Fetch request sent');
  expect(r.managedTaken(el)).toBe(true);
  expect(el.querySelector('[data-skeleton]'), 'Removing the skeleton before data returns creates a second waiting state').not.toBeNull();
  fetch.resolve();
  await act(async () => { await opening });
  expect(el.querySelector('[data-skeleton]')).toBeNull();
  // Tokens, Preflight, and focus rules all act on `.peach-react`; a page that does not render inside it gets no styles.
  expect(el.querySelector('.peach-react')?.textContent).toContain('Sync new files');
});

it('If the shell already changed pages during the fetch nothing paints, leaving the skeleton to the next page', async () => {
  const fetch = deferredFetch({ status: 'idle' });
  fetch.install();
  const r = await load();
  await mount(r);
  const el = container('libraryProcessingNotice');
  let current = true;
  const opening = r.openManagedRoute('library-processing', { toast: vi.fn(), mode: 'notice' },
    { container: el, isCurrent: () => current });
  await until(() => fetch.fetched.mock.calls.length > 0, 'Fetch request sent');
  current = false;
  fetch.resolve();
  await act(async () => { expect(await opening).toBe(false) });
  expect(el.querySelector('.peach-react')).toBeNull();
  expect(el.querySelector('[data-skeleton]')).not.toBeNull();
  expect(r.managedTaken(el)).toBe(false);
});

it('Collapsing aborts in-flight fetches; if it had painted, the host is torn down too', async () => {
  const fetch = deferredFetch({ status: 'idle' });
  fetch.install();
  const r = await load();
  await mount(r);
  const el = container('libraryProcessingNotice');
  const opening = r.openManagedRoute('library-processing', { toast: vi.fn() }, { container: el, isCurrent: () => true });
  await until(() => fetch.fetched.mock.calls.length > 0, 'Fetch request sent');
  r.releaseManagedRoute(el);
  await act(async () => { expect(await opening).toBe(false) });
  expect(fetch.signal()?.aborted, 'Leaving the page must truly abort the request').toBe(true);
  expect(el.querySelector('[data-skeleton]'), 'Collapsing before ever painting leaves the shell\'s skeleton in the container').not.toBeNull();

  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'idle' }) })));
  await act(async () => {
    await r.openManagedRoute('library-processing', { toast: vi.fn() }, { container: el, isCurrent: () => true });
  });
  expect(r.managedTaken(el)).toBe(true);
  await act(async () => { r.releaseManagedRoute(el) });
  expect(el.querySelector('.peach-react'), 'Host collapses along with it').toBeNull();
  expect(r.managedTaken(el)).toBe(false);
});

it('Patching an unpainted container is a no-op; after painting it merges in place with no remount', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) })));
  const r = await load();
  await mount(r);
  const menu = container('searchMenu');
  r.updateManagedRoute(menu, { historyLimit: 3 });
  r.updateManagedRoute(null, { historyLimit: 3 });
  expect(menu.querySelector('[data-skeleton]')).not.toBeNull();

  const exposed: { api: SearchApi | null } = { api: null };
  await act(async () => {
    await r.openManagedRoute('search', searchProps(exposed), { container: menu, isCurrent: () => true });
  });
  const host = menu.querySelector('.peach-react');
  const revision = r.managedEntry(menu)?.revision;
  await act(async () => { r.updateManagedRoute(menu, { historyLimit: 3 }) });
  expect((r.managedEntry(menu)?.props as SearchProps | undefined)?.historyLimit).toBe(3);
  expect(r.managedEntry(menu)?.revision).toBe(revision);
  expect(menu.querySelector('.peach-react'), 'In-place updates never swap the host').toBe(host);
});
