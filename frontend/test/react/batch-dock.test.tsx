/* Batch bar: which keys each of four contexts lists, counts, collapsing when the selection empties, which shell flow a click
 * returns to, plus its behavior as a resident component (`RESIDENT_ROUTES['batch-dock']`) in the route tree: the host is
 * `[data-batch-dock]`, the handle renders synchronously, both collapsing and a thrown error unmount only the component without
 * withdrawing the host, and after the error the surface stays empty until refresh.
 *
 * The bar's glass, position and narrow-screen three-column grid need measured layout, walked in the browser by e2e
 * (`e2e/design-*.test.ts`). */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { batchActions, type BatchDockApi, type BatchDockHost, type BatchDockProps } from '../../src/react/batch-dock/batch-dock-api';
import type { ShellActions } from '../../src/react/router/shell-actions';
import { click } from './render';

// The first import compiles the whole page subtree the route table pulls in, with the compile wait on its own finite window; every later case remounts and only reruns the module.
const REACT_IMPORT_TIMEOUT_MS = 30_000;

type ActFlag = { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => { await import('../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

/* The dock's shell gets a wrapper that decides on the spot whether to throw: a test flips `dock.broken` mid-case, meaning "throw on the next render". */
const dock = vi.hoisted(() => ({ broken: false }));
vi.mock(import('../../src/react/components/selection-dock'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    SelectionDock: (props: Parameters<typeof actual.SelectionDock>[0]) => {
      if (dock.broken) throw new Error('The dock never paints');
      return actual.SelectionDock(props);
    },
  };
});

/* The resident component adapter reads the config functions from the same package directly; tests only hook into this scenario's handle contract. */
type ShellIslands = { connectApplication(next: (actions: ShellActions) => void): () => void; loadBatchDock(host: BatchDockHost): Promise<BatchDockApi>; batchDockApi(): BatchDockApi | null };
const ISLANDS_MODULE = '../../src/react/application-residents';

async function load() {
  vi.resetModules();
  window.history.replaceState(null, '', '/');
  const [history, router, routes, island, islands] = await Promise.all([
    import('../../src/history'), import('../../src/react/router/router'), import('../../src/react/router/managed-routes'),
    import('../../src/react/batch-dock/batch-dock-island'), import(/* @vite-ignore */ ISLANDS_MODULE) as Promise<ShellIslands>,
  ]);
  return { ...history, ...router, ...routes, ...island, islands };
}
type Loaded = Awaited<ReturnType<typeof load>>;

const unmounts: Array<() => void> = [];
afterEach(async () => {
  (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = true;
  for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
  document.body.innerHTML = '';
  dock.broken = false;
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

/** The shell's startup order: paint the route tree first (the root's options are the same copy as `mountApplication`), then wire up the fetching. */
async function mountRouter(r: Loaded) {
  unmounts.push(r.islands.connectApplication(() => {}));
  const root = createRoot(document.createElement('div'), r.ROUTER_ROOT_OPTIONS);
  await act(async () => { root.render(<r.RouterRoot actions={shellActions()} />) });
  unmounts.push(() => root.unmount());
  await act(async () => { r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute)) });
}

/** The resident host inside the shell's `index.html`. */
function dockHost(): BatchDockHost {
  const root = document.createElement('div');
  root.setAttribute('data-batch-dock', '');
  document.body.append(root);
  return { root, run: vi.fn() };
}

/** Hooks up like the shell's `loadBatchDock`: hands over the handle, then opens this face in the route tree. */
async function setup() {
  const r = await load();
  await mountRouter(r);
  const host = dockHost();
  const api: BatchDockApi = r.configureBatchDock(host);
  await act(async () => { expect(await r.openResidentSurface('batch-dock', host.root)).toBe(true) });
  const render = async (props: BatchDockProps) => { await act(async () => { api.render(props) }) };
  return { r, root: host.root, host, api, render };
}

/** Accept every report; `console.error` is only muted, not counted. */
function watchReports() {
  const reported = vi.fn();
  vi.stubGlobal('reportError', reported);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return reported;
}

const labels = (root: ParentNode) => [...root.querySelectorAll('[data-selection-dock] button')].map((node) => node.textContent?.trim());

describe('Per-context keys', () => {
  it('Left-to-right order with "Cancel" always last; the only destructive actions are remove and delete permanently', () => {
    const shape = (context: Parameters<typeof batchActions>[0], dismissed = false) =>
      batchActions(context, dismissed).map((action) => `${action.label}${action.danger ? '!' : ''}`);
    expect(shape('catalog')).toEqual(['Like', 'Watched', 'Watch later', 'Decide origin', 'Move to trash!', 'Cancel']);
    expect(shape('trash')).toEqual(['Restore', 'Delete permanently!', 'Cancel']);
    expect(shape('junk')).toEqual(['Not junk', 'Move to trash!', 'Cancel']);
    expect(shape('junk', true)).toEqual(['Judge again', 'Move to trash!', 'Cancel']);
    expect(shape('follow')).toEqual(['Save to the database', 'Mark as watched', 'Ignore', 'Cancel']);
  });

  it('Ignore uses a crossed-out eye, never borrowing the cancel X', () => {
    const glyph = (operation: string) => batchActions('follow').find((action) => action.operation === operation)!.glyph;
    expect([glyph('ignored'), glyph('clear')]).toEqual(['eye-off', 'x']);
  });
});

describe('Dock', () => {
  it('Nothing renders when nothing is selected; once selected it shows the count and the key for this context, swapping the key the moment context changes', async () => {
    const { root, render } = await setup();
    expect(root.querySelector('[data-selection-dock]')).toBeNull();
    await render({ count: 2, context: 'trash', junkDismissed: false });
    const shown = root.querySelector('[data-selection-dock]')!;
    expect(shown.getAttribute('aria-label')).toBe('Actions for selected items');
    expect(shown.querySelector('[role="status"]')!.textContent).toBe('Selected 2 items');
    expect(labels(root)).toEqual(['Restore', 'Delete permanently', 'Cancel']);
    await render({ count: 3, context: 'junk', junkDismissed: true });
    expect(root.querySelector('[data-selection-dock] [role="status"]')!.textContent).toBe('Selected 3 items');
    expect(labels(root)).toEqual(['Judge again', 'Move to trash', 'Cancel']);
    expect(root.querySelector('[data-batch-scope]')!.getAttribute('data-context')).toBe('junk');
  });

  it('While the dock bar is up, body carries data-batch-dock-open to make room for the grid, removed when the selection empties', async () => {
    const { render } = await setup();
    expect(document.body.hasAttribute('data-batch-dock-open')).toBe(false);
    await render({ count: 2, context: 'catalog', junkDismissed: false });
    expect(document.body.hasAttribute('data-batch-dock-open')).toBe(true);
    await render({ count: 0, context: 'catalog', junkDismissed: false });
    expect(document.body.hasAttribute('data-batch-dock-open')).toBe(false);
  });

  it('Counts past a thousand get thousands separators', async () => {
    const { root, render } = await setup();
    await render({ count: 12345, context: 'catalog', junkDismissed: false });
    expect(root.querySelector('[data-selection-dock] [role="status"]')!.textContent).toBe('Selected 12,345 items');
  });

  it('Danger buttons carry data-danger and use the site-wide red; each button has its own sprite glyph', async () => {
    const { root, render } = await setup();
    await render({ count: 2, context: 'catalog', junkDismissed: false });
    const keys = [...root.querySelectorAll<HTMLButtonElement>('[data-selection-dock] button')];
    expect(keys.filter((key) => key.hasAttribute('data-danger')).map((key) => key.dataset.batchAction)).toEqual(['dispose']);
    expect(keys.map((key) => key.querySelector('use')?.getAttribute('href')))
      .toEqual(['#i-thumbs-up', '#i-eye', '#i-bookmark-plus', '#i-globe', '#i-trash', '#i-x']);
  });

  it('Clicking a key hands the group, action, and that key back to the shell', async () => {
    const { root, host, render } = await setup();
    await render({ count: 1, context: 'catalog', junkDismissed: false });
    const region = root.querySelector<HTMLButtonElement>('[data-batch-action="region"]')!;
    await click(region);
    expect(host.run).toHaveBeenCalledWith('region', 'region', region);
    await click(root.querySelector('[data-batch-action="dispose"]'));
    expect(host.run).toHaveBeenLastCalledWith('batch', 'dispose', expect.any(HTMLButtonElement));
    await click(root.querySelector('[data-batch-group="clear"]'));
    expect(host.run).toHaveBeenLastCalledWith('clear', 'clear', expect.any(HTMLButtonElement));
  });
});

describe('Resident components', () => {
  it('The host is the [data-batch-dock] element itself: the .peach-react layer of the component is its direct child with no wrapper in between', async () => {
    const { root } = await setup();
    expect([...root.children].map((child) => [child.className, child.getAttribute('data-context')]))
      .toEqual([['peach-react', 'catalog']]);
  });

  it('When the handle\'s render returns the dock is already painted, with no wait for the next render', async () => {
    const { root, api } = await setup();
    /* No act wrapper: act defers flushSync to its end, which hides whether the handle flushed synchronously on its own. */
    (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = false;
    api.render({ count: 4, context: 'follow', junkDismissed: false });
    const status = root.querySelector('[data-selection-dock] [role="status"]')?.textContent;
    const context = root.querySelector('[data-batch-scope]')?.getAttribute('data-context');
    expect([status, context]).toEqual(['Selected 4 items', 'follow']);
  });

  it('The shell loadBatchDock hands over the handle only after this face paints', async () => {
    const r = await load();
    await mountRouter(r);
    const host = dockHost();
    expect(r.islands.batchDockApi(), 'Before resident components mount there is no handle, and the app remembers only the current copy').toBeNull();
    let api: BatchDockApi | null = null;
    await act(async () => { api = await r.islands.loadBatchDock(host) });
    expect(r.islands.batchDockApi()).toBe(api);
    expect(r.managedEntry(host.root)?.path).toBe('batch-dock');
    expect(host.root.querySelector(':scope > [data-batch-scope]')).not.toBeNull();
    await act(async () => { api!.render({ count: 1, context: 'catalog', junkDismissed: false }) });
    expect(host.root.querySelector('[data-selection-dock] [role="status"]')?.textContent).toBe('Selected 1 items');
  });

  it('Collapsing unmounts only the component, leaving the host in the document', async () => {
    const { r, root, render } = await setup();
    await render({ count: 2, context: 'catalog', junkDismissed: false });
    await act(async () => { r.releaseManagedRoute(root) });
    expect(root.isConnected, 'Host is the shell\'s node').toBe(true);
    expect(root.childNodes.length).toBe(0);
    expect(r.managedTaken(root)).toBe(false);
  });

  it('On throw only the component unmounts, the host stays and other faces still paint; afterwards the handle is a no-op that does not throw, this face stays empty until refresh, and the error is reported once', async () => {
    const reported = watchReports();
    const { r, root, api, render } = await setup();
    const menu = document.createElement('div');
    menu.id = 'boardGlowMenu';
    document.body.append(menu);
    await act(async () => { expect(await r.openResidentSurface('glow-picker', menu)).toBe(true) });
    await render({ count: 2, context: 'catalog', junkDismissed: false });

    dock.broken = true;
    await render({ count: 3, context: 'catalog', junkDismissed: false });
    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith(expect.objectContaining({ message: 'The dock never paints' }));
    expect(root.isConnected, 'The host is the shell\'s node and never withdraws').toBe(true);
    expect(root.childNodes.length, 'Component unmounted').toBe(0);
    expect(r.managedTaken(root)).toBe(false);
    expect(r.managedEntries().map((entry) => entry.path), 'Other faces still drawn').toEqual(['glow-picker']);

    /* The shell still pushes a copy on every selected-state repaint: no throw, no reopen, no further reporting. */
    for (const count of [4, 5, 6]) {
      await act(async () => { expect(() => api.render({ count, context: 'trash', junkDismissed: false })).not.toThrow() });
    }
    expect(reported, 'The deterministic throw is reported only once').toHaveBeenCalledTimes(1);
    dock.broken = false;
    await render({ count: 7, context: 'catalog', junkDismissed: false });
    expect(root.childNodes.length, 'Stays empty until refresh, no self-healing').toBe(0);
    expect(r.managedTaken(root)).toBe(false);
  });
});
