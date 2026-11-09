/* The details overlay's route element (`src/react/router/pages/overlay.tsx`): the overlay group matches the six overlay paths
 * on the real address; when an unclaimed history change lands, it adopts the background the entry recorded and has the shell
 * open that entry (`ShellActions.openOverlay`), and open requests from claimed address writes also go to the element; when the
 * destination is not an overlay address, the stage is torn down.
 * The page group side matches on background, and the background page is not remounted; the startup entry reads no background,
 * videos and queues backfill the catalog grid, and follow details only yield `#stats`.
 *
 * How the shell fetches and renders details is governed by the stage island and e2e; this file covers when it opens, which
 * entry opens, and whether the background was adopted. The history object and shell state are module-level; every case
 * reloads them. */
import { act, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { useLocation } from 'react-router';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import type { OverlayTarget } from '../../../src/history';
import type { ShellActions } from '../../../src/react/router/shell-actions';

const REACT_IMPORT_TIMEOUT_MS = 30_000;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => { await import('../../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

/* `entry` is the history entry present at mount time (`{ usr, key, idx }`; the entry still carries it after a refresh). */
async function load(path: string, entry: unknown = null) {
  vi.resetModules();
  window.history.replaceState(entry, '', path);
  const [history, router, shell] = await Promise.all([
    import('../../../src/history'), import('../../../src/react/router/router'), import('../../../src/shell'),
  ]);
  return { ...history, ...router, shell };
}
type Loaded = Awaited<ReturnType<typeof load>>;

const unmounts: Array<() => void> = [];
afterEach(async () => {
  for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** The group the shell passes in: open records the target and the origin fetched at that moment; the rest are empty stubs. */
function shellActions(r: Loaded) {
  const opened: Array<{ target: OverlayTarget; from: string | null }> = [];
  let bootOpened = false;
  const actions = {
    openOverlay: vi.fn((target: OverlayTarget) => {
      if ((!r.bootEntry() || bootOpened) && r.peachHistory.navigation.claimed) return;
      bootOpened ||= r.bootEntry();
      opened.push({ target, from: r.takeOverlayReturn() });
    }),
    closeStage: vi.fn(), openImmerse: vi.fn(), surfaceChanged: vi.fn(),
    catalog: { defaultLoc: () => 'local', open: vi.fn(), load: vi.fn(), release: vi.fn(), fill: vi.fn() },
    follow: { refresh: vi.fn(() => false), skeleton: vi.fn(() => ''), props: vi.fn(), ground: vi.fn() },
  } as unknown as ShellActions;
  return { actions, opened };
}

/** A probe for the slot of addresses the page group cannot recognize: it records mount, unmount, and the address it sees. */
function probe() {
  const seen = { mounted: 0, unmounted: 0, paths: [] as string[] };
  function Probe() {
    seen.paths.push(useLocation().pathname);
    useEffect(() => { seen.mounted += 1; return () => { seen.unmounted += 1 } }, []);
    return null;
  }
  return { seen, Probe };
}

async function settle() {
  for (let step = 0; step < 3; step += 1) {
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });
  }
}

async function mount(r: Loaded, actions: ShellActions, children?: React.ReactNode) {
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<r.RouterRoot actions={actions}>{children}</r.RouterRoot>) });
  unmounts.push(() => root.unmount());
  await settle();
}

/** Start routing the way the shell does: write `pageOpens` as 1. */
async function start(r: Loaded) {
  await act(async () => { r.shell.writeShell({ pageOpens: 1 }) });
  await settle();
}

/** The browser's back and forward: address and entry are swapped before `popstate` fires; without an address it replays the same entry. */
async function pop(path?: string, entry?: unknown) {
  await act(async () => {
    if (path) window.history.replaceState(entry === undefined ? window.history.state : entry, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await settle();
}

const over = (pathname: string, overlay: 'item' | 'follow' = 'item', search = '') =>
  ({ backgroundLocation: { pathname, search }, overlay });
const entry = (state: unknown, key = 'x') => ({ usr: state, key, idx: 1 });

it('The launch overlay element opens once app actions are ready; leaving details closes the stage with the current action', async () => {
  const r = await load('/assets/7');
  const { actions, opened } = shellActions(r);
  const root = createRoot(document.createElement('div'));
  unmounts.push(() => root.unmount());
  await act(async () => { root.render(<r.RouterRoot />) });
  await settle();
  expect(actions.openOverlay).not.toHaveBeenCalled();
  await act(async () => { root.render(<r.RouterRoot actions={actions} />) });
  await start(r);
  expect(opened.map(one => one.target)).toEqual([{ kind: 'item', id: 7 }]);
  await act(async () => { r.peachHistory.push('/performers/name') });
  await settle();
  expect(actions.closeStage).toHaveBeenCalledTimes(1);
});

it('Back and forward landing on an overlay address reconnect the background and open; claimed entries without a request only sync the address; closing does not remount the background page', async () => {
  const r = await load('/nowhere');
  const { actions, opened } = shellActions(r);
  const { seen, Probe } = probe();
  await mount(r, actions, <Probe />);
  await start(r);
  await act(async () => { r.shellNavigate('/assets/7', { state: over('/nowhere') }) });
  await settle();
  expect(opened, 'Claimed entries without an open request never reopen the stage').toEqual([]);
  await pop('/assets/8', entry(over('/nowhere', 'item', '?q=1'), 'a'));
  await pop('/assets/4?mix=3', entry(over('/nowhere'), 'b'));
  await pop('/posts/5', entry(over('/nowhere', 'follow'), 'c'));
  await pop('/assets/9?playlist=2', entry(over('/nowhere'), 'd'));
  expect(opened).toEqual([
    { target: { kind: 'item', id: 8 }, from: '/nowhere?q=1' },
    { target: { kind: 'queue', queue: 'mix', key: 3, item: 4 }, from: '/nowhere' },
    { target: { kind: 'follow', id: 5 }, from: '/nowhere' },
    { target: { kind: 'queue', queue: 'playlist', key: 2, item: 9 }, from: '/nowhere' },
  ]);
  expect(actions.closeStage, 'Switching back and forth between overlays never tears down the stage').not.toHaveBeenCalled();
  await act(async () => { r.shellNavigate('/nowhere') });
  await settle();
  expect(actions.closeStage).toHaveBeenCalledTimes(1);
  expect([seen.mounted, seen.unmounted], 'The background page is one instance throughout').toEqual([1, 0]);
  expect(new Set(seen.paths)).toEqual(new Set(['/nowhere']));
});

it('Replaying the same entry with empty `history.state`: claim a new generation, reopen the same entry, and do not reconnect the background', async () => {
  const r = await load('/nowhere');
  const { actions, opened } = shellActions(r);
  await mount(r, actions);
  await start(r);
  await act(async () => { r.shellNavigate('/assets/7', { state: over('/nowhere') }) });
  await settle();
  await pop('/assets/7', null);
  await pop();
  expect(opened).toEqual([
    { target: { kind: 'item', id: 7 }, from: null },
    { target: { kind: 'item', id: 7 }, from: null },
  ]);
});

it('Card attribution navigation opens through the overlay element: reopening the same path redelivers, and the background page keeps its original nodes', async () => {
  const r = await load('/nowhere');
  const { actions } = shellActions(r);
  const { seen, Probe } = probe();
  await mount(r, actions, <Probe />);
  await start(r);
  const presented: OverlayTarget[] = [];
  vi.mocked(actions.openOverlay).mockImplementation((target) => { presented.push(target) });
  await act(async () => { r.shellNavigate('/assets/7', { state: over('/nowhere') }) });
  await settle();
  await act(async () => { r.shellNavigate('/assets/7', { state: over('/nowhere') }) });
  await settle();
  expect(presented).toEqual([{ kind: 'item', id: 7 }, { kind: 'item', id: 7 }]);
  expect([seen.mounted, seen.unmounted]).toEqual([1, 0]);
});

it('Deep link `/assets/:id`: attached only before the shell starts routing, opening that item and backfilling the catalog grid at that moment; the startup entry reads no background', async () => {
  const r = await load('/assets/7', entry(over('/stats')));
  const { actions, opened } = shellActions(r);
  await mount(r, actions);
  expect(opened, 'Not opened before the shell starts routing').toEqual([]);
  await start(r);
  expect(opened).toEqual([{ target: { kind: 'item', id: 7 }, from: null }]);
  expect(actions.catalog!.fill).toHaveBeenCalledTimes(1);
  expect(actions.follow!.ground).not.toHaveBeenCalled();
  expect(actions.surfaceChanged, 'The entry\'s recorded background page never opens').not.toHaveBeenCalled();
  await act(async () => { r.shellNavigate('/assets/7?t=12', { replace: true }) });
  await settle();
  expect(opened).toHaveLength(1);
});

it('Deep link `/posts/:id`: opens that entry, yields only `#stats`, mounts no list and paints no catalog', async () => {
  const r = await load('/posts/5');
  const { actions, opened } = shellActions(r);
  await mount(r, actions);
  await start(r);
  expect(opened).toEqual([{ target: { kind: 'follow', id: 5 }, from: null }]);
  expect(actions.follow!.ground).toHaveBeenCalledTimes(1);
  expect(actions.follow!.refresh).not.toHaveBeenCalled();
  expect(actions.catalog!.fill).not.toHaveBeenCalled();
});

it('The router root mounts only when it comes up after the shell starts routing; once mounted it opens the launch entry, exactly once', async () => {
  const r = await load('/assets/4?parts=3');
  const { actions, opened } = shellActions(r);
  r.shell.writeShell({ pageOpens: 1 });
  await mount(r, actions);
  await settle();
  expect(opened).toEqual([{ target: { kind: 'queue', queue: 'parts', key: 3, item: 4 }, from: null }]);
});

it('Parameters accept digits only: `/assets/abc` opens nothing and draws no fallback below', async () => {
  const r = await load('/assets/abc');
  const { actions, opened } = shellActions(r);
  await mount(r, actions);
  await start(r);
  expect(opened).toEqual([]);
  expect(actions.catalog!.fill).not.toHaveBeenCalled();
  expect(r.overlayTarget('/assets/2?editions=1')).toEqual({ kind: 'queue', queue: 'editions', key: 1, item: 2 });
  expect(r.overlayTarget('/assets/7/x')).toBeNull();
  expect(r.overlayTarget('/assets/b?playlist=1')).toBeNull();
  expect(r.overlayTarget('/assets/')).toBeNull();
});

it('Open runs outside the commit phase: the shell paints other islands with flushSync inside; it paints on the spot and raises no warning', async () => {
  const errors = vi.spyOn(console, 'error');
  const r = await load('/nowhere');
  const { actions } = shellActions(r);
  const host = document.createElement('div');
  const other = createRoot(host);
  unmounts.push(() => other.unmount());
  const painted: string[] = [];
  vi.mocked(actions.openOverlay).mockImplementation(() => {
    flushSync(() => other.render(<i>{location.pathname}</i>));
    painted.push(host.textContent ?? '');
  });
  await mount(r, actions);
  await start(r);
  await pop('/assets/9', entry(over('/nowhere')));
  expect(painted).toEqual(['/assets/9']);
  expect(errors).not.toHaveBeenCalled();
});

it('Queue intent is handed to the router tree: it waits while the shell is not ready, and the URL and history depth hold until fetching completes', async () => {
  const r = await load('/nowhere');
  const { actions } = shellActions(r);
  actions.openQueueRequest = vi.fn();
  await mount(r, actions);
  const depth = history.length;
  await act(async () => { r.shell.writeShell({ queueOpens: 1 }) });
  await settle();
  expect(actions.openQueueRequest).not.toHaveBeenCalled();
  await start(r);
  expect(actions.openQueueRequest).toHaveBeenCalledTimes(1);
  expect([location.pathname, history.length]).toEqual(['/nowhere', depth]);
  await act(async () => { r.shell.writeShell({ queueOpens: 2 }) });
  await settle();
  expect(actions.openQueueRequest).toHaveBeenCalledTimes(2);
});

it('Immersive opens from the top bar attribution navigation; replacing the item does not reopen it; back leaving the URL keeps the close button behavior', async () => {
  const r = await load('/nowhere');
  const { actions } = shellActions(r);
  await mount(r, actions);
  await start(r);
  await act(async () => { r.shellNavigate('/immerse') });
  await settle();
  expect(actions.openImmerse).toHaveBeenCalledTimes(1);
  const depth = history.length;
  await act(async () => { r.shellNavigate('/immerse?id=8', { replace: true }) });
  await settle();
  expect(actions.openImmerse).toHaveBeenCalledTimes(1);
  expect(history.length).toBe(depth);
  await pop('/nowhere', null);
  expect(actions.closeStage).not.toHaveBeenCalled();
});
