/* The catalog's route element (`src/react/router/pages/catalog.tsx`): mounts when the page group matches the catalog's six
 * paths, and decides by page-open epoch, the shell's reopen count (`pageOpens` in `@peach/shell`) and the overlay whether to
 * open the whole page or only refetch; a full open rebuilds the catalog filters per the address and hands the rest to the
 * shell.
 *
 * How the grid fetches and renders is governed by `catalog-routes.test.tsx` and each page's cases; this file covers when the
 * element opens, how many times, which filter set is written into `state`, and what it hands the shell. The history object
 * and shell state are module-level; every case reloads them. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import type { ShellActions } from '../../../src/react/router/shell-actions';

// The cold load of the full route tree is timed separately; interaction cases use the Vitest default timeout.
const REACT_IMPORT_TIMEOUT_MS = 60_000;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => { await import('../../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

async function load(path = '/') {
  vi.resetModules();
  window.history.replaceState(null, '', path);
  const [history, router, routes, shell, core, sorting] = await Promise.all([
    import('../../../src/history'), import('../../../src/react/router/router'),
    import('../../../src/react/router/managed-routes'), import('../../../src/shell'),
    import('../../../src/core'), import('../../../src/sort-preferences'),
  ]);
  return { ...history, ...router, ...routes, shell, core, sortFromAddress: sorting.sortFromAddress };
}
type Loaded = Awaited<ReturnType<typeof load>>;

const unmounts: Array<() => void> = [];
afterEach(async () => {
  for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** The set handed in by the shell, plus a record of the opening sequence in order. */
function shellActions() {
  const log: string[] = [];
  const actions: ShellActions = {
    openItem: vi.fn(), openEntity: vi.fn(), openTag: vi.fn(), openTasteSignal: vi.fn(), navigate: vi.fn(),
    openManage: vi.fn(), managePath: vi.fn(() => ''), openFollow: vi.fn(), receipt: vi.fn(), toast: vi.fn(),
    failure: vi.fn(), revealSource: vi.fn(async () => ''), reopenTutorial: vi.fn(async () => {}),
    routeReview: vi.fn(),
    routeFollowManage: vi.fn(), saveFollowPreference: vi.fn(), srcBadge: () => '', routeIndex: vi.fn(),
    savePeopleLayout: vi.fn(), exitSelectMode: vi.fn(), personAvatar: vi.fn(() => ({ html: '', face: '' })),
    authorAvatar: vi.fn(() => ''), showIndexTags: vi.fn(), openFollowAuthor: vi.fn(), openFollowTag: vi.fn(),
    openPlaylist: vi.fn(), canFlip: () => true,
    surfaceChanged: vi.fn(), clearSearch: vi.fn(), openImmerse: vi.fn(), openOverlay: vi.fn(), closeStage: vi.fn(),
    grid: { helpers: {}, actions: {} } as ShellActions['grid'],
    configurable: () => true,
    surfaceShown: vi.fn(),
    catalog: {
      defaultLoc: () => 'local,115',
      open: vi.fn((path: string, options?: { entering?: boolean; retitle?: boolean }) => {
        log.push(`open ${path}${options?.entering ? ' entering' : ''}${options?.retitle ? ' retitle' : ''}`);
      }),
      load: vi.fn(() => { log.push('load') }),
      release: vi.fn(() => { log.push('release') }),
      fill: vi.fn(() => { log.push('fill') }),
    },
  };
  return { actions, log };
}

async function settle() {
  for (let step = 0; step < 3; step += 1) {
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });
  }
}

/** Mounts the route root and starts routing like the shell does: the startup pass writes `pageOpens` as 1. */
async function boot(r: Loaded, actions: ShellActions) {
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<r.RouterRoot actions={actions} />) });
  unmounts.push(() => root.unmount());
  await settle();
  await act(async () => { r.shell.writeShell({ pageOpens: 1 }) });
  await settle();
}

/** Back and forward: the browser swaps the address and then fires `popstate`, without going through the shell. */
async function pop(path: string, state: unknown = null) {
  await act(async () => {
    window.history.replaceState(state, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
  });
  await settle();
}

const filters = (r: Loaded) => r.shell.state ?? {};

it('Startup: only attached before the shell starts routing; at startup it writes filters from the address and opens the full page once', async () => {
  const r = await load('/unseen?tag=a,%E7%9F%AD%E7%89%87-2%E5%88%86%E5%86%85&owner=none&loc=local');
  const { actions, log } = shellActions();
  await boot(r, actions);
  expect(log).toEqual(['open /unseen']);
  expect(filters(r)).toMatchObject({ state: 'fresh', tag: 'a', owner: 'none', loc: 'local' });
  expect(filters(r).seed, 'Without a seed in the address it rolls one').toMatch(/^\d+$/);
});

it('Going back from trash to home rerolls the sampling seed and asks the shell to invalidate the top three layers\' caches', async () => {
  const r = await load('/trash');
  r.shell.writeShell({ state: { seed: '111', sort: 'seed', dir: '' } });
  const { actions, log } = shellActions();
  await boot(r, actions);
  expect(log).toEqual(['open /trash']);
  expect(filters(r)).toMatchObject({ state: 'trash', seed: '111' });
  await pop('/');
  expect(log.slice(1)).toEqual(['open / entering']);
  expect(filters(r).state).toBe('');
  expect(filters(r).seed).toMatch(/^\d+$/);
  expect(filters(r).seed).not.toBe('111');
});

it('Home\'s back/forward across one tag change reuses that same seed', async () => {
  const r = await load('/?tag=a');
  r.shell.writeShell({ state: { seed: '222' } });
  const { actions, log } = shellActions();
  await boot(r, actions);
  expect(filters(r)).toMatchObject({ tag: 'a', seed: '222' });
  await pop('/?tag=b');
  expect(log.slice(1)).toEqual(['open /']);
  expect(filters(r)).toMatchObject({ tag: 'b', seed: '222' });
});

it('Use the torrent if the URL specifies one', async () => {
  const r = await load('/trash');
  const { actions } = shellActions();
  await boot(r, actions);
  await pop('/?seed=4321');
  expect(filters(r).seed).toBe('4321');
});

it('A shell-claimed address write only refetches and never rebuilds filters; writing the same address again refetches too', async () => {
  const r = await load('/');
  const { actions, log } = shellActions();
  await boot(r, actions);
  r.shell.writeShell({ state: { ...filters(r), tag: 'x' } });
  await act(async () => { r.shellNavigate('/?tag=x') });
  await settle();
  await act(async () => { r.shellNavigate('/?tag=x', { replace: true }) });
  await settle();
  expect(log.slice(1)).toEqual(['load', 'load']);
  expect(filters(r).tag).toBe('x');
});

it('Paging between the index, filter states and trash does not remount; the shell claims entering trash and immediately asks to reopen, and the two merge into one full page open', async () => {
  const r = await load('/');
  const { actions, log } = shellActions();
  await boot(r, actions);
  await act(async () => {
    r.shellNavigate('/trash');
    r.shell.writeShell({ pageOpens: r.shell.pageOpens + 1 });
  });
  await settle();
  expect(log.slice(1)).toEqual(['open /trash']);
  expect(actions.catalog?.release).not.toHaveBeenCalled();
});

it('While details are overlaid nothing happens; closing returns to the overlaid URL; filters unchanged means no refetch, and only changed filters refetch', async () => {
  const r = await load('/?tag=a');
  const { actions, log } = shellActions();
  await boot(r, actions);
  const overlay = { backgroundLocation: { pathname: '/', search: '?tag=a' }, overlay: 'item' };
  await act(async () => { r.shellNavigate('/assets/7', { state: overlay }) });
  await settle();
  await act(async () => { r.peachHistory.push('/assets/8', overlay) });
  await settle();
  await act(async () => { r.shellNavigate('/?tag=a') });
  await settle();
  expect(log.slice(1), 'Closing returns to where you were').toEqual([]);
  await act(async () => { r.shellNavigate('/assets/7', { state: overlay }) });
  await settle();
  r.shell.writeShell({ state: { ...filters(r), seed: '9' } });
  await act(async () => { r.shellNavigate('/?tag=a') });
  await settle();
  expect(log.slice(1), 'Filter changed while covered by details').toEqual(['load']);
  expect(actions.catalog?.release).not.toHaveBeenCalled();
});

it('Video addresses without a background (deep links): paint the catalog grid once without a full page open; only when the shell asks to reopen on close does the full page open', async () => {
  const r = await load('/assets/7');
  const { actions, log } = shellActions();
  await boot(r, actions);
  expect(log).toEqual(['fill']);
  await act(async () => {
    r.shellNavigate('/');
    r.shell.writeShell({ pageOpens: r.shell.pageOpens + 1 });
  });
  await settle();
  expect(log).toEqual(['fill', 'open /']);
});

it('Back only attaches when landing on details overlaid on the home page (other pages visited in between): while overlaid it does nothing, and closing returns to home as a full-page open', async () => {
  const r = await load('/');
  const { actions, log } = shellActions();
  await boot(r, actions);
  const overlay = { backgroundLocation: { pathname: '/', search: '' }, overlay: 'item' };
  await act(async () => { r.shellNavigate('/assets/7', { state: overlay }) });
  await settle();
  await act(async () => { r.peachHistory.push('/stats') });
  await settle();
  expect(log.slice(1), 'The page hands over to the target surface to switch while the catalog host is kept alive').toEqual([]);
  await pop('/assets/7', { usr: overlay, key: 'x', idx: 1 });
  expect(log.slice(1), 'Does not open while pressed').toEqual([]);
  await act(async () => { r.shellNavigate('/') });
  await settle();
  expect(log.slice(1)).toEqual(['open /']);
});

it('On the index page, `?state=ads` is rewritten in place to the junk files address, opened full page by the junk files page which also fills in the title', async () => {
  const r = await load('/?state=ads&type=video&view=dismissed');
  const { actions, log } = shellActions();
  const length = window.history.length;
  await boot(r, actions);
  expect(window.location.pathname + window.location.search).toBe('/junk-files?type=video&view=dismissed');
  expect(window.history.length, 'Rewrites without adding a history entry').toBe(length);
  expect(log).toEqual(['open /junk-files retitle']);
  expect(filters(r).state).toBe('ads');
});

it('Sort from the URL: a column without direction takes that column\'s default; with neither given, the browsing preference applies; legacy keys carry their own direction', async () => {
  const r = await load('/?sort=new');
  const { actions } = shellActions();
  await boot(r, actions);
  expect(filters(r)).toMatchObject({ sort: 'new', dir: 'desc' });
  await pop('/?sort=new&dir=asc');
  expect(filters(r)).toMatchObject({ sort: 'new', dir: 'asc' });
  await pop('/?sort=big');
  expect(filters(r)).toMatchObject({ sort: 'size', dir: 'desc' });
  expect(r.sortFromAddress(null, null, 'new', 'asc')).toEqual({ sort: 'new', dir: 'asc' });
  expect(r.sortFromAddress(null, null, 'seed', 'asc')).toEqual({ sort: 'seed', dir: '' });
  expect(r.sortFromAddress('nope', null, 'rating', 'desc', 'new')).toEqual({ sort: 'new', dir: 'desc' });
});

it('Back/forward re-reads unattributed from the address while origin carries over', async () => {
  const r = await load('/?owner=none');
  r.shell.writeShell({ state: { region: 'jp' } });
  const { actions } = shellActions();
  await boot(r, actions);
  expect(filters(r)).toMatchObject({ owner: 'none', region: 'jp' });
  await pop('/');
  expect(filters(r)).toMatchObject({ owner: '', region: 'jp' });
  await pop('/?owner=none');
  expect(filters(r).owner).toBe('none');
});

it('Leaving the catalog keeps the grid host alive, and the target page switches the visible surface', async () => {
  const r = await load('/');
  const { actions } = shellActions();
  await boot(r, actions);
  await act(async () => { r.shellNavigate('/performers/A') });
  await settle();
  await act(async () => { r.shellNavigate('/immerse') });
  await settle();
  await act(async () => { r.shellNavigate('/assets/3') });
  await settle();
  expect(actions.catalog?.release).not.toHaveBeenCalled();
  await act(async () => { r.shellNavigate('/') });
  await settle();
  await act(async () => { r.shellNavigate('/stats') });
  await settle();
  expect(actions.catalog?.release).not.toHaveBeenCalled();
});

it('The sidebar keys and labels for the three filter states and junk files are exactly the `STATE_ROUTES` and `STATE_LABELS` entries', async () => {
  const r = await load('/');
  for (const [key, path] of Object.entries(r.core.STATE_ROUTES)) {
    expect(r.routeMetaOf(path)).toEqual({ nav: key, title: r.core.STATE_LABELS[key] });
  }
  expect(r.routeMetaOf('/trash')).toEqual({ section: 'trash', title: '回收站' });
  expect(r.routeMetaOf('/')).toEqual({});
});
