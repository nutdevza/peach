/* The index and profile pages' route elements (`src/react/router/pages/index-entity.tsx`): mount when the page group matches
 * these two groups, read the page from the address, and decide by page-open epoch, the shell's reopen count (`pageOpens` in
 * `@peach/shell`) and the overlay when to open the whole page; when the profile page's same person takes a new generation,
 * only the new filters are pushed in place. Opening first reports the surface change.
 *
 * How the pages fetch and render is governed by `managed-routes.test.tsx`, `entity-routes.test.tsx` and each page's cases;
 * this file covers when the element opens, how many times, and what it hands the shell. The history object and shell state
 * are module-level; every case reloads them. */
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
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(String(input), 'https://peach.test');
    const names: Record<string, string> = { '1': 'A', '2': 'B', '3': 'S1' };
    const name = names[url.searchParams.get('id') || ''] || url.searchParams.get('name') || '';
    const id = Number(Object.entries(names).find(([, value]) => value === name)?.[0] || 1);
    return { ok: true, status: 200, json: async () => ({ id, kind: url.searchParams.get('kind'), canonical_name: name }) };
  }));
  const [history, router, routes, shell, pages] = await Promise.all([
    import('../../../src/history'), import('../../../src/react/router/router'),
    import('../../../src/react/router/managed-routes'), import('../../../src/shell'),
    import('../../../src/react/router/pages/index-entity'),
  ]);
  return { ...history, ...router, ...routes, shell, entityTarget: pages.entityTarget };
}
type Loaded = Awaited<ReturnType<typeof load>>;

const unmounts: Array<() => void> = [];
afterEach(async () => {
  for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

/** The group handed in by the shell, plus a log of the open sequence in order. What `refresh` returns is up to the test. */
function shellActions(refreshed = { ok: true }) {
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
    surfaceChanged: vi.fn((kind: string, path: string) => { log.push(`surface ${kind} ${path}`) }),
    clearSearch: vi.fn(), openImmerse: vi.fn(), openOverlay: vi.fn(), closeStage: vi.fn(),
    grid: { helpers: {}, actions: {} } as ShellActions['grid'],
    configurable: () => true,
    surfaceShown: vi.fn((kind: string) => { log.push(`shown ${kind}`) }),
    entity: {
      missing: vi.fn(),
      loading: vi.fn(async (kind: string, name: string) => { log.push(`loading ${kind} ${name}`) }),
      props: vi.fn((kind: string, name: string, search: string) => {
        log.push(`props ${kind} ${name} ${search}`);
        return { kind, name, actions: {} } as never;
      }),
      refresh: vi.fn((kind: string, name: string, search: string) => {
        log.push(`refresh ${kind} ${name} ${search}`);
        return refreshed.ok;
      }),
    },
  };
  return { actions, log };
}

function indexSurface() {
  const index = document.createElement('section');
  index.id = 'index';
  document.body.append(index);
  return index;
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
  const before = vi.mocked(actions.surfaceChanged).mock.calls.length;
  await act(async () => { r.shell.writeShell({ pageOpens: 1 }) });
  await settle();
  return before;
}

const reopen = (r: Loaded) => r.shell.writeShell({ pageOpens: r.shell.pageOpens + 1 });
const opens = (actions: ShellActions) => vi.mocked(actions.surfaceChanged).mock.calls.length;

it('This person from the URL: decode the whole thing first, then split by segment; the name consumes all remaining segments; unrecognized kinds and empty names do not count', async () => {
  const r = await load();
  expect(r.entityTarget('/performers/A%2FB')).toEqual({ segment: 'performers', kind: 'performer', name: 'A/B' });
  expect(r.entityTarget('/series/x/y')).toEqual({ segment: 'series', kind: 'series', name: 'x/y' });
  expect(r.entityTarget('/agencies/%E6%9F%90%20Co')).toEqual({ segment: 'agencies', kind: 'agency', name: '某 Co' });
  expect(r.entityTarget('/performers/')).toBeNull();
  expect(r.entityTarget('/tags/x')).toEqual({ segment: 'tags', kind: 'tag', name: 'x' });
  expect(r.entityTarget('/performers/%E0')).toBeNull();
});

it('Index element: only mounted before the shell starts routing; on launch it opens once from the URL, reporting the view swap first, then laying the skeleton', async () => {
  const r = await load('/performers?q=ab');
  const index = indexSurface();
  const { actions, log } = shellActions();
  const before = await boot(r, actions);
  expect(before, 'Not opened before the shell starts routing').toBe(0);
  expect(log).toEqual(['surface index /performers']);
  expect(index.querySelector('[data-skeleton]'), 'Show this page\'s skeleton on open').not.toBeNull();
  expect(index.querySelector<HTMLInputElement>('input[type="search"]')?.value, 'The skeleton\'s filter box carries the address\'s filter text').toBe('ab');
});

it('Index element: claimed changes write the URL without reopening; unclaimed navigation, back and forward, and shell-requested reopens each open once', async () => {
  const r = await load('/performers');
  indexSurface();
  const { actions } = shellActions();
  await boot(r, actions);
  expect(opens(actions)).toBe(1);
  await act(async () => { r.shellNavigate('/performers?q=abc', { replace: true }) });
  await settle();
  expect(opens(actions), 'In-page filter input is claimed by the shell').toBe(1);
  await act(async () => { r.peachHistory.push('/performers?scope=online') });
  await settle();
  expect(opens(actions), 'Unclaimed navigations take a new generation').toBe(2);
  await act(async () => {
    window.history.replaceState(window.history.state, '', '/performers?q=x');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await settle();
  expect(opens(actions), 'Back/forward claims a new epoch').toBe(3);
  await act(async () => { reopen(r) });
  await settle();
  expect(opens(actions), 'Shell asks to reopen').toBe(4);
});

it('Index element: the shell claims an address write that moves to another page and immediately asks for a reopen; the two merge into one open', async () => {
  const r = await load('/performers');
  indexSurface();
  const { actions, log } = shellActions();
  await boot(r, actions);
  await act(async () => {
    r.shellNavigate('/tags');
    reopen(r);
  });
  await settle();
  expect(log.filter((line) => line.startsWith('surface'))).toEqual(['surface index /performers', 'surface index /tags']);
});

it('Index element: while covered by details it takes a new generation without reopening; the page underneath is already painted', async () => {
  const r = await load('/performers');
  indexSurface();
  const { actions } = shellActions();
  await boot(r, actions);
  await act(async () => {
    r.peachHistory.push('/assets/7', { backgroundLocation: { pathname: '/performers', search: '' }, overlay: 'item' });
  });
  await settle();
  expect(opens(actions)).toBe(1);
});

it('Index element: when back lands on details covering the index (having visited other pages in between) it stays closed on attach; closing back with this page not showing opens the full page once', async () => {
  const r = await load('/performers');
  const index = indexSurface();
  const { actions } = shellActions();
  await boot(r, actions);
  const overlay = { backgroundLocation: { pathname: '/performers', search: '' }, overlay: 'item' };
  await act(async () => { r.shellNavigate('/assets/7', { state: overlay }) });
  await settle();
  await act(async () => { r.peachHistory.push('/stats') });
  await settle();
  index.hidden = true;
  await act(async () => {
    window.history.replaceState({ usr: overlay, key: 'x', idx: 1 }, '', '/assets/7');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await settle();
  expect(opens(actions), 'Mounted under details without opening').toBe(1);
  await act(async () => { r.shellNavigate('/performers') });
  await settle();
  expect(opens(actions), 'Closing and returning opens the full page').toBe(2);
});

it('The target skeleton shows before details are submitted; the same person lets the shell take over refreshing, and only a different person or an explicit reopen rebuilds the props', async () => {
  const refreshed = { ok: true };
  const r = await load('/performers/1');
  indexSurface();
  const { actions, log } = shellActions(refreshed);
  await boot(r, actions);
  expect(log).toEqual(['surface entity /performers/1', 'loading performer 1', 'props performer A ']);
  log.length = 0;
  await act(async () => { r.peachHistory.push('/performers/1?tag=x') });
  await settle();
  expect(log, 'Once the target skeleton is in place the shell takes over refreshing').toEqual(['surface entity /performers/1', 'loading performer 1', 'refresh performer A ?tag=x']);
  log.length = 0;
  refreshed.ok = false;
  await act(async () => { r.peachHistory.push('/performers/1?tag=y') });
  await settle();
  expect(log, 'When the shell cannot take over, full-page props are built').toEqual(['surface entity /performers/1', 'loading performer 1',
    'refresh performer A ?tag=y', 'props performer A ?tag=y']);
  log.length = 0;
  refreshed.ok = true;
  await act(async () => { r.shellNavigate('/performers/2', { replace: true }) });
  await settle();
  expect(log, 'Switching people shows a skeleton by address first, then the canonical name once details arrive').toEqual(['surface entity /performers/2', 'loading performer 2',
    'props performer B ']);
  log.length = 0;
  await act(async () => { reopen(r) });
  await settle();
  expect(log, 'No in-place push when the shell requests a reopen').toEqual(['surface entity /performers/2', 'loading performer 2',
    'props performer B ']);
  expect(r.shell.entityJavLayout, 'Every full-page open starts from the non-JAV context').toBe(false);
});

it('Details element: claimed in-place address writes never reopen', async () => {
  const r = await load('/studios/3');
  indexSurface();
  const { actions, log } = shellActions();
  await boot(r, actions);
  log.length = 0;
  await act(async () => { r.shellNavigate('/studios/3?tag=x') });
  await settle();
  expect(log).toEqual([]);
});

it('Reopening an entity reads the current canonical id, and merged URLs keep filters and the hash', async () => {
  const r = await load('/performers/2?tag=x#photos');
  indexSurface();
  const { actions } = shellActions();
  await boot(r, actions);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200,
    json: async () => ({ id: 1, kind: 'performer', canonical_name: 'A' }) })));
  await act(async () => { reopen(r) });
  await settle();
  expect(r.peachHistory.navigation.location.pathname).toBe('/performers/1');
  expect(r.peachHistory.navigation.location.search).toBe('?tag=x');
  expect(r.peachHistory.navigation.location.hash).toBe('#photos');
  expect(actions.entity?.props).toHaveBeenLastCalledWith('performer', 'A', '?tag=x');
});

const TAGS = { items: [{ k: 'Nympho', n: 1, cat: 'role' }], has_more: false };

it('Tabs: open with the selection key, layout and configuration permissions, and report to the shell once painted; any change to the selection key is pushed to the painted page', async () => {
  const r = await load('/tags');
  const index = indexSurface();
  const { actions, log } = shellActions();
  vi.stubGlobal('fetch', vi.fn(async (input: string) => ({
    ok: true, status: 200, json: async () => (String(input).startsWith('/api/index') ? TAGS : { items: [], has_more: false }),
  })));
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  await boot(r, actions);
  for (let step = 0; step < 50 && !r.managedEntry(index); step += 1) await settle();
  expect(r.managedEntry(index)?.props).toMatchObject({ kind: 'tags', selectMode: false, layout: 'big', configurable: true });
  expect(log.at(-1)).toBe('shown index');
  await act(async () => { r.shell.writeShell({ selectMode: true }) });
  await settle();
  expect(r.managedEntry(index)?.props).toMatchObject({ selectMode: true });
  expect(opens(actions), 'Pushing the selection key does not reopen').toBe(1);
});
