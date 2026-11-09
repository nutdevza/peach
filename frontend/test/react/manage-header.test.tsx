/* Management header: the skeleton-to-route-tree handover, the manage bar's pressed states and clicks, breadcrumbs taking a
 * plain left click through routing while modifier keys follow the link, the trash explainer row placing a placeholder first
 * and landing the readout with the readout cell swapping text in place on same-page re-renders, plus its behavior as a
 * resident component (`RESIDENT_ROUTES['manage-header']`) in the route tree: the host is `[data-manage-header]`, the skeleton
 * swaps in the same task as the first frame, the handle renders synchronously, and a thrown error unmounts only the
 * component.
 *
 * The indicator line's sliding, title centering and narrow-screen collapse need measured layout, walked in the browser by e2e
 * (`e2e/management-layout.test.ts`). */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { manageHeaderSkeletonHtml, pressedManageKey, type ManageEntry, type ManageHeaderProps } from '../../src/manage-header';
import type { BatchDockApi, BatchDockHost } from '../../src/react/batch-dock/batch-dock-api';
import type { ManageHeaderApi, ManageHeaderHost } from '../../src/react/manage-header/manage-header-api';
import type { ShellActions } from '../../src/react/router/shell-actions';
import { click } from './render';
import { createSettingsStore } from '../../src/settings-store';

// The first import compiles the whole page subtree the route table pulls in, with the compile wait on its own finite window; every later case remounts and only reruns the module.
const REACT_IMPORT_TIMEOUT_MS = 30_000;

type ActFlag = { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => { await import('../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

/* Tab and breadcrumb glyphs get a wrapper that decides on the spot whether to throw: a test flips `glyph.broken` mid-case, meaning "throw on the next render". */
const glyph = vi.hoisted(() => ({ broken: false }));
vi.mock(import('../../src/react/settings-panel/icon'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Icon: (props: Parameters<typeof actual.Icon>[0]) => {
      if (glyph.broken) throw new Error('The header never paints');
      return actual.Icon(props);
    },
  };
});

/* The resident component adapter reads the config functions from the same package directly; tests only hook into this scenario's handle contract. */
type ShellIslands = { connectApplication(next: (actions: ShellActions) => void): () => void;
  loadManageHeader(host: ManageHeaderHost): Promise<ManageHeaderApi>;
  manageHeaderApi(): ManageHeaderApi | null;
  loadBatchDock(host: BatchDockHost): Promise<BatchDockApi>;
};
const ISLANDS_MODULE = '../../src/react/application-residents';

async function load() {
  vi.resetModules();
  window.history.replaceState(null, '', '/');
  const [history, router, routes, islands] = await Promise.all([
    import('../../src/history'), import('../../src/react/router/router'), import('../../src/react/router/managed-routes'),
    import(/* @vite-ignore */ ISLANDS_MODULE) as Promise<ShellIslands>,
  ]);
  return { ...history, ...router, ...routes, islands };
}
type Loaded = Awaited<ReturnType<typeof load>>;

const unmounts: Array<() => void> = [];
afterEach(async () => {
  vi.useRealTimers();
  (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = true;
  for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
  document.body.innerHTML = '';
  glyph.broken = false;
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

/** At shell startup the route tree paints first (the root's options are the same ones as `mountApplication`); attaching fetches is a separate step the test can defer. */
async function mountRouter(r: Loaded) {
  unmounts.push(r.islands.connectApplication(() => {}));
  const root = createRoot(document.createElement('div'), r.ROUTER_ROOT_OPTIONS);
  await act(async () => { root.render(<r.RouterRoot actions={shellActions()} />) });
  unmounts.push(() => root.unmount());
}
async function connect(r: Loaded) {
  await act(async () => { r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute)) });
}

const SECTIONS: ManageEntry[] = [['stats', 'Stats', 'chart'], ['cleanup', 'Data management', 'database'], ['trash', 'Trash', 'trash']];
const MENU = SECTIONS.filter(([key]) => key !== 'trash');

const props = (section: string, path: string, patch: Partial<ManageHeaderProps> = {}): ManageHeaderProps =>
  ({ section, path, sections: SECTIONS, menu: MENU, trash: null, ...patch });

/** The permanent host in the shell's `index.html`, written into the skeleton synchronously at shell startup. */
function headerHost(first: ManageHeaderProps): ManageHeaderHost {
  const root = document.createElement('div');
  root.setAttribute('data-manage-header', '');
  document.body.append(root);
  root.innerHTML = manageHeaderSkeletonHtml(first);
  return { root, store: createSettingsStore('test.manage-order', { manageOrder: ['stats', 'cleanup'] }),
    openManage: vi.fn(), openPath: vi.fn(), emptyTrash: vi.fn() };
}

/** Wire up along the shell's `mountManageHeader`: lay the skeleton, mount, and once the handle arrives push in the copy at hand. */
async function setup(first: ManageHeaderProps) {
  const r = await load();
  await mountRouter(r);
  await connect(r);
  const host = headerHost(first);
  let api!: ManageHeaderApi;
  await act(async () => { api = await r.islands.loadManageHeader(host) });
  const render = (next: ManageHeaderProps) => act(() => { api.render(next) });
  render(first);
  return { r, root: host.root, host, api, render };
}

/** Accept every report; `console.error` is only muted, not counted. */
function watchReports() {
  const reported = vi.fn();
  vi.stubGlobal('reportError', reported);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return reported;
}

const title = (root: ParentNode) => root.querySelector('[data-manage-title]')?.textContent;

describe('Handoff', () => {
  it('When prefetch did not connect, the host holds the skeleton and the handle is null; the handle is handed over only after painting, and what is painted is the same structure', async () => {
    const first = props('cleanup', '/junk-files');
    const skeleton = document.createElement('div');
    skeleton.innerHTML = manageHeaderSkeletonHtml(first);
    const r = await load();
    await mountRouter(r);
    const host = headerHost(first);
    const html = host.root.innerHTML;
    let loaded: Promise<ManageHeaderApi> | null = null;
    await act(async () => { loaded = r.islands.loadManageHeader(host) });
    expect(host.root.innerHTML, 'The route tree has not attached fetching yet, so the skeleton stays as-is').toBe(html);
    expect(r.islands.manageHeaderApi(), 'Before painting there is no handle, and the shell keeps taking skeleton clicks').toBeNull();

    await connect(r);
    let api: ManageHeaderApi | null = null;
    await act(async () => { api = await loaded });
    expect(r.islands.manageHeaderApi()).toBe(api);
    expect(r.managedEntry(host.root)?.path).toBe('manage-header');
    expect(host.root.childNodes.length, 'The skeleton cleared, the first frame has no props and paints empty').toBe(0);

    await act(async () => { api!.render(first) });
    const shape = (node: ParentNode) => [...node.querySelectorAll('*')]
      .filter(el => !el.hasAttribute('data-pill-thumb'))
      .map((el) => [el.tagName, ...[...el.attributes].map((a) => a.name).filter((name) => name.startsWith('data-') || name.startsWith('aria-')).sort()].join(' '))
      .filter((line) => !line.startsWith('USE'));
    expect(shape(host.root)).toEqual(shape(skeleton));
    expect(host.root.querySelector('[data-pill-thumb]')).not.toBeNull();
    expect(title(host.root)).toBe('Junk files');
  });

  it('Skeleton and first frame swap within one task: at every task boundary the host holds either the skeleton or the painted header, with no extra .peach-react wrapper on the host', async () => {
    const first = props('stats', '/stats');
    const r = await load();
    await mountRouter(r);
    await connect(r);
    const host = headerHost(first);
    const skeletonTitle = host.root.querySelector('[data-manage-title]');
    /* No act wrapper: act defers flushSync to its end, which hides at which beat the handoff happened. */
    (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = false;
    let done = false;
    void r.islands.loadManageHeader(host).then((api) => { api.render(first); done = true });
    const state = () => (host.root.contains(skeletonTitle) ? 'skeleton' : title(host.root) ? 'header' : 'empty');
    const seen: string[] = [];
    for (let turn = 0; turn < 200 && !done; turn += 1) {
      seen.push(state());
      await new Promise((resolve) => { setTimeout(resolve, 0) });
    }
    seen.push(state());
    expect(done).toBe(true);
    expect(seen).not.toContain('empty');
    expect(seen.at(-1)).toBe('header');
    expect(title(host.root)).toBe('Stats');
    expect(host.root.querySelector(':scope > .peach-react')).toBeNull();
    expect(host.root.firstElementChild?.hasAttribute('data-manage-bar')).toBe(true);
  });

  it('Clicks during the skeleton go through the shell\'s delegation, belong to the component after the handover, and one click lands in exactly one place', async () => {
    const r = await load();
    await mountRouter(r);
    const host = headerHost(props('stats', '/stats'));
    /* The delegation segment inside the shell's `mountManageHeader`: honored only while the handle has not been handed over. */
    const delegated = vi.fn();
    host.root.addEventListener('click', (event) => {
      if (r.islands.manageHeaderApi()) return;
      const tab = (event.target as Element).closest<HTMLElement>('[data-manage]');
      if (tab) delegated(tab.dataset.manage);
    });
    let loaded: Promise<ManageHeaderApi> | null = null;
    await act(async () => { loaded = r.islands.loadManageHeader(host) });
    await click(host.root.querySelector('[data-manage="cleanup"]'));
    expect(delegated.mock.calls).toEqual([['cleanup']]);
    expect(host.openManage).not.toHaveBeenCalled();

    await connect(r);
    let api: ManageHeaderApi | null = null;
    await act(async () => { api = await loaded });
    act(() => { api!.render(props('cleanup', '/data-cleanup')) });
    await click(host.root.querySelector('[data-manage="stats"]'));
    expect(vi.mocked(host.openManage).mock.calls).toEqual([['stats']]);
    expect(delegated, 'Delegation no longer honored').toHaveBeenCalledTimes(1);
  });

  it('Leaving manage areas clears the whole block, repainting on return', async () => {
    const { root, render } = await setup(props('stats', '/stats'));
    render(props('', '/'));
    expect(root.childElementCount).toBe(0);
    render(props('cleanup', '/data-cleanup'));
    expect(title(root)).toBe('Data management');
    expect(root.querySelector('[data-manage-title]')!.hasAttribute('data-compact')).toBe(true);
    expect(root.querySelector('[data-manage-crumb]')).toBeNull();
  });
});

describe('Management bar and breadcrumbs', () => {
  it('Horizontal ordering updates shared settings and keeps the current page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ manageOrder: ['cleanup', 'stats'] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const { root, host } = await setup(props('stats', '/stats'));
    const target = root.querySelector<HTMLButtonElement>('[data-manage="cleanup"]')!;
    await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, bubbles: true })) });
    expect([...root.querySelectorAll('[data-manage]')].map(node => node.getAttribute('data-manage'))).toEqual(['cleanup', 'stats']);
    expect(host.store.value.manageOrder.indexOf('cleanup')).toBeLessThan(host.store.value.manageOrder.indexOf('stats'));
    expect(host.openManage).not.toHaveBeenCalled();
  });

  it('The pressed item follows the current section, and clicking one hands off to openManage in the shell', async () => {
    const { root, host, render } = await setup(props('stats', '/stats'));
    const pressed = () => [...root.querySelectorAll('[data-manage][aria-pressed="true"]')].map((node) => node.getAttribute('data-manage'));
    expect(pressed()).toEqual(['stats']);
    expect(root.querySelector('[data-manage="stats"]')!.getAttribute('aria-current')).toBe('page');
    render(props('cleanup', '/data-cleanup'));
    expect(pressed()).toEqual(['cleanup']);
    expect(root.querySelector('[data-manage="stats"]')!.hasAttribute('aria-current')).toBe(false);
    await click(root.querySelector('[data-manage="stats"]'));
    expect(host.openManage).toHaveBeenCalledWith('stats');
  });

  it('Subpages under data management press "Data management", with the skeleton and component sharing one criterion; sections absent from the admin bar press nothing', async () => {
    const first = props('trash', '/trash');
    const { root, render } = await setup(first);
    const pressed = () => [...root.querySelectorAll('[data-manage][aria-pressed="true"]')].map((node) => node.getAttribute('data-manage'));
    expect(pressed()).toEqual(['cleanup']);
    const skeleton = document.createElement('div');
    skeleton.innerHTML = manageHeaderSkeletonHtml(first);
    expect([...skeleton.querySelectorAll('[data-manage][aria-pressed="true"]')]
      .map((node) => node.getAttribute('data-manage'))).toEqual(pressed());
    render(props('cleanup', '/quality-goals'));
    expect(pressed()).toEqual(['cleanup']);
    render(props('stats', '/stats'));
    expect(pressed()).toEqual(['stats']);
    expect(pressedManageKey({ section: 'trash', path: '/somewhere', menu: MENU })).toBe('');
  });

  it('Breadcrumb plain left clicks use the router, while modified or middle clicks follow the link itself', async () => {
    const { root, host } = await setup(props('cleanup', '/duplicates'));
    const link = root.querySelector<HTMLAnchorElement>('[data-manage-crumb] a')!;
    expect(link.getAttribute('href')).toBe('/data-cleanup');
    expect(root.querySelector('[data-manage-crumb] [aria-current="true"]')!.textContent).toBe('Duplicates');
    const fire = (init: MouseEventInit) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
      act(() => { link.dispatchEvent(event) });
      return event.defaultPrevented;
    };
    expect(fire({})).toBe(true);
    expect(host.openPath).toHaveBeenCalledWith('/data-cleanup');
    expect([fire({ ctrlKey: true }), fire({ metaKey: true }), fire({ shiftKey: true }), fire({ button: 1 })])
      .toEqual([false, false, false, false]);
    expect(host.openPath).toHaveBeenCalledTimes(1);
  });
});

describe('Trash note row', () => {
  it('A same-shaped placeholder fills in before the count arrives, then the count and clear button land; the description row stays the same node throughout', async () => {
    const { root, host, render } = await setup(props('trash', '/trash'));
    const lede = root.querySelector('[data-manage-lede]')!;
    expect(lede.querySelectorAll('[data-trash-lede-skeleton]')).toHaveLength(2);
    expect(lede.querySelector('[data-lede-text]')).toBeNull();
    render(props('trash', '/trash', { trash: { total: 1234, shown: 8 } }));
    expect(root.querySelector('[data-manage-lede]')).toBe(lede);
    expect(lede.querySelector('[data-trash-lede-skeleton]')).toBeNull();
    expect(lede.querySelector('[data-lede-text]')!.textContent).toBe('1,234 matches · showing 8');
    await click(lede.querySelector('[data-empty-trash]'));
    expect(host.emptyTrash).toHaveBeenCalledTimes(1);
    render(props('trash', '/trash', { trash: { total: 0, shown: 0 } }));
    expect(lede.querySelector('[data-empty-trash]')).toBeNull();
  });

  it('Repainting the same page: the count cell keeps its node, old text fades into new, and it never returns to the placeholder', async () => {
    const { root, render } = await setup(props('trash', '/trash', { trash: { total: 20, shown: 8 } }));
    vi.useFakeTimers();
    const cell = root.querySelector<HTMLElement>('[data-lede-text]')!;
    render(props('trash', '/trash', { trash: { total: 20, shown: 16 } }));
    expect(root.querySelector('[data-lede-text]')).toBe(cell);
    expect(root.querySelector('[data-trash-lede-skeleton]')).toBeNull();
    expect(cell.classList.contains('leaving')).toBe(true);
    expect(cell.textContent).toBe('20 matches · showing 8');
    act(() => { vi.advanceTimersByTime(400) });
    expect(cell.textContent).toBe('20 matches · showing 16');
    expect(cell.classList.contains('leaving')).toBe(false);
  });
});

describe('Resident components', () => {
  it('By the time the handle render returns, the title already shows the new content, with no wait for the next render', async () => {
    const { root, api } = await setup(props('stats', '/stats'));
    /* No act wrapper: act defers flushSync to its end, which hides whether the handle flushed synchronously on its own. */
    (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = false;
    api.render(props('cleanup', '/junk-files'));
    expect(title(root)).toBe('Junk files');
    api.render(props('trash', '/trash'));
    expect([title(root), root.querySelectorAll('[data-trash-lede-skeleton]').length]).toEqual(['Trash', 2]);
  });

  it('On throw only the component unmounts, the host stays and the batch bar still paints; afterwards the handle is a no-op that does not throw, this face stays empty until refresh, and the error is reported once', async () => {
    const reported = watchReports();
    const { r, root, api, render } = await setup(props('stats', '/stats'));
    const dockRoot = document.createElement('div');
    dockRoot.setAttribute('data-batch-dock', '');
    document.body.append(dockRoot);
    let dock!: BatchDockApi;
    await act(async () => { dock = await r.islands.loadBatchDock({ root: dockRoot, run: vi.fn() }) });

    glyph.broken = true;
    render(props('cleanup', '/data-cleanup'));
    await act(async () => {});
    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith(expect.objectContaining({ message: 'The header never paints' }));
    expect(root.isConnected, 'The host is the shell\'s node and never withdraws').toBe(true);
    expect(root.childNodes.length, 'Component unmounted').toBe(0);
    expect(r.managedTaken(root)).toBe(false);
    expect(r.managedEntries().map((entry) => entry.path), 'Other faces still drawn').toEqual(['batch-dock']);
    await act(async () => { dock.render({ count: 2, context: 'catalog', junkDismissed: false }) });
    expect(dockRoot.querySelector('[data-selection-dock] [role="status"]')?.textContent).toBe('Selected 2 items');

    /* The shell still pushes one on every page change as before: no throw, no reopen, no further reporting. */
    for (const next of [props('stats', '/stats'), props('trash', '/trash')]) {
      await act(async () => { expect(() => api.render(next)).not.toThrow() });
    }
    expect(reported, 'The deterministic throw is reported only once').toHaveBeenCalledTimes(1);
    glyph.broken = false;
    render(props('stats', '/stats'));
    expect(root.childNodes.length, 'Stays empty until refresh, no self-healing').toBe(0);
  });
});
