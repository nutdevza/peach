/* Sidebar: the skeleton-to-route-tree handover, nav order following the store, drag-reorder write-back, filter keys' pressed
 * states and counts, group collapse, "Expand all", follow tags and the duration range, plus its behavior as a resident
 * component (`RESIDENT_ROUTES.sidebar`) in the route tree: the host is `#drawerScroll`, the skeleton swaps in the same task
 * as the first frame, `attached` runs once after the first frame, the handle renders synchronously, the nodes the shell moved
 * into the header row survive re-renders, and a thrown error unmounts only the component.
 *
 * The glass's sliding, real drag gestures and drawer open/close need measured layout, walked in the browser by e2e
 * (`e2e/sidebar.test.ts`). */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSettingsStore } from '../../src/settings-store';
import { NAV_CATALOG } from '../../src/application/navigation-items';
import { DEFAULT_SIDEBAR_ORDER } from '../../src/sidebar';
import { sidebarSkeletonHtml } from '../../src/sidebar-skeleton';
import type { BatchDockApi, BatchDockHost } from '../../src/react/batch-dock/batch-dock-api';
import type { ShellActions } from '../../src/react/router/shell-actions';
import type { SidebarApi, SidebarChip, SidebarFacets, SidebarHost, SidebarProps } from '../../src/react/sidebar/sidebar-api';
import { moveSidebarKey } from '../../src/react/sidebar/sidebar-order';
import { click, fetchMock, sentBody, settle } from './render';

// The first import compiles the whole page subtree the route table pulls in, with the compile wait on its own finite window; every later case remounts and only reruns the module.
const REACT_IMPORT_TIMEOUT_MS = 30_000;

type ActFlag = { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(async () => { await import('../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

/* The sidebar's glyphs get a wrapper that decides on the spot whether to throw: a test flips `glyph.broken` mid-case, meaning "throw on the next render". */
const glyph = vi.hoisted(() => ({ broken: false }));
vi.mock(import('../../src/react/settings-panel/icon'), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Icon: (props: Parameters<typeof actual.Icon>[0]) => {
      if (glyph.broken) throw new Error('The sidebar never paints');
      return actual.Icon(props);
    },
  };
});

/* The resident component adapter reads the config functions from the same package directly; tests only hook into this scenario's handle contract. */
type ShellIslands = { connectApplication(next: (actions: ShellActions) => void): () => void;
  loadSidebar(host: SidebarHost): Promise<SidebarApi>;
  sidebarApi(): SidebarApi | null;
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

const CATALOG = [['', 'Home', 'home'], ['unseen', 'Unwatched', 'eye'], ['follow', 'Follows', 'rss'], ['stats', 'Stats', 'chart']] as const;

const chip = (value: string, n: number | null = 1, extra: Partial<SidebarChip> = {}): SidebarChip =>
  ({ value, label: value.toUpperCase(), n, ...extra });

const facets = (patch: Partial<SidebarFacets> = {}): SidebarFacets => ({
  locations: [chip('local', 3), chip('115', 2, { offline: 'This drive is not mounted' })],
  regions: [], orientations: [], creators: [], tags: [chip('a', 5), chip('b', 4)], tech: [], followTags: [],
  duration: false, ...patch,
});

/** The drawer and scroll layers from the shell's `index.html`, written into the navigation skeleton synchronously at shell startup; `attached` is swapped by the test for the shell's moves as needed. */
function sidebarHost(order = ['', 'unseen', 'follow'], current = '', attached: () => void = () => {}) {
  const drawer = document.createElement('aside');
  drawer.setAttribute('data-sidebar-drawer', '');
  const scroll = document.createElement('div');
  scroll.setAttribute('data-sidebar-scroll', '');
  drawer.append(scroll);
  document.body.append(drawer);
  const store = createSettingsStore('peach.settings.v1', { sidebarOrder: order });
  let pressed = current;
  const host: SidebarHost = {
    scroll, store, navCatalog: CATALOG,
    navOn: (key) => key === pressed,
    navTo: vi.fn(), navToTop: vi.fn(), toggleChip: vi.fn(), setDuration: vi.fn(), openFollowTag: vi.fn(), selectFollowTag: vi.fn(),
    selectFollowProvider: vi.fn(), setFollowDuration: vi.fn(),
    attached: vi.fn(attached),
  };
  scroll.innerHTML = sidebarSkeletonHtml(order, CATALOG, host.navOn);
  return { drawer, scroll, store, host, press: (key: string) => { pressed = key } };
}

/** Follows the shell's startup order: render the route tree and wire up fetching, lay the skeleton, load the sidebar, grab the handle. */
async function setup(order?: string[], current?: string, attached?: () => void) {
  const r = await load();
  await mountRouter(r);
  await connect(r);
  const shell = sidebarHost(order, current, attached);
  let api!: SidebarApi;
  await act(async () => { api = await r.islands.loadSidebar(shell.host) });
  const render = (props: Partial<SidebarProps>) => act(() => { api.render({ content: null, filters: {}, latest: null, ...props }) });
  return { r, ...shell, api, render };
}

/** Accept every report; `console.error` is only muted, not counted. */
function watchReports() {
  const reported = vi.fn();
  vi.stubGlobal('reportError', reported);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return reported;
}

const navKeys = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-sidebar-nav] [data-nav]')].map((node) => node.dataset.nav);
const group = (root: ParentNode, title: string) => root.querySelector<HTMLDetailsElement>(`[data-sidebar-group="${title}"]`);
const chipOf = (root: ParentNode, key: string, value: string) =>
  root.querySelector<HTMLButtonElement>(`[data-sidebar-chip][data-key="${key}"][data-val="${value}"]`);

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  document.body.replaceChildren();
});

describe('Handoff', () => {
  it('The skeleton and sidebar paint the same column: order, pressed state and home marker all match; when prefetch did not connect, the scroll layer holds the skeleton and the handle is null', async () => {
    const skeleton = document.createElement('div');
    skeleton.innerHTML = sidebarSkeletonHtml(['unseen', '', 'missing'], CATALOG, (key) => key === 'unseen');
    expect(navKeys(skeleton)).toEqual(['unseen', '']);
    expect(skeleton.querySelector('[data-nav="unseen"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(skeleton.querySelector('[data-nav=""] [data-sidebar-home-logo]')).not.toBeNull();
    const r = await load();
    await mountRouter(r);
    const { scroll, host } = sidebarHost(['unseen', '', 'missing'], 'unseen');
    const html = scroll.innerHTML;
    let loaded: Promise<SidebarApi> | null = null;
    await act(async () => { loaded = r.islands.loadSidebar(host) });
    expect(scroll.innerHTML, 'The route tree has not attached fetching yet, so the skeleton stays as-is').toBe(html);
    expect(r.islands.sidebarApi(), 'Before painting there is no handle, and the shell keeps taking skeleton clicks').toBeNull();
    expect(host.attached).not.toHaveBeenCalled();

    await connect(r);
    let api: SidebarApi | null = null;
    await act(async () => { api = await loaded });
    expect(r.islands.sidebarApi()).toBe(api);
    expect(r.managedEntry(scroll)?.path).toBe('sidebar');
    expect(navKeys(scroll)).toEqual(navKeys(skeleton));
    expect(scroll.querySelector(':scope > [data-sidebar-head]')).not.toBeNull();
    expect(scroll.querySelector('[data-nav="unseen"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(host.attached).toHaveBeenCalledTimes(1);
  });

  it('Skeleton and first frame swap within one task: at every task boundary the scroll layer holds either the skeleton or the painted nav, with no extra .peach-react wrapper', async () => {
    const r = await load();
    await mountRouter(r);
    await connect(r);
    const { scroll, host } = sidebarHost();
    const skeletonNav = scroll.querySelector('[data-nav]');
    /* No act wrapper: act defers flushSync to its end, which hides at which beat the handoff happened. */
    (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = false;
    let done = false;
    void r.islands.loadSidebar(host).then(() => { done = true });
    const state = () => (scroll.contains(skeletonNav) ? 'skeleton' : navKeys(scroll).length ? 'sidebar' : 'empty');
    const seen: string[] = [];
    for (let turn = 0; turn < 200 && !done; turn += 1) {
      seen.push(state());
      await new Promise((resolve) => { setTimeout(resolve, 0) });
    }
    seen.push(state());
    expect(done).toBe(true);
    expect(seen).not.toContain('empty');
    expect(seen.at(-1)).toBe('sidebar');
    expect(navKeys(scroll)).toEqual(['', 'unseen', 'follow']);
    expect(scroll.querySelector(':scope > .peach-react')).toBeNull();
    expect(scroll.firstElementChild?.hasAttribute('data-sidebar-head')).toBe(true);
  });

  it('attached runs once after the first frame paints and before the handle is handed over; later repaints do not call it again', async () => {
    const r = await load();
    await mountRouter(r);
    await connect(r);
    const seen: Array<{ skeleton: boolean; nav: Array<string | undefined>; head: boolean; api: SidebarApi | null }> = [];
    const shell = sidebarHost(undefined, undefined, () => {
      seen.push({
        skeleton: shell.scroll.contains(skeletonNav), nav: navKeys(shell.scroll),
        head: shell.scroll.querySelector(':scope > [data-sidebar-head]') !== null, api: r.islands.sidebarApi(),
      });
    });
    const skeletonNav = shell.scroll.querySelector('[data-nav]');
    let api!: SidebarApi;
    await act(async () => { api = await r.islands.loadSidebar(shell.host) });
    expect(seen).toEqual([{ skeleton: false, nav: ['', 'unseen', 'follow'], head: true, api: null }]);
    act(() => { api.render({ content: { kind: 'catalog', key: '1', facets: facets() }, filters: {}, latest: null }) });
    act(() => { api.navChanged() });
    act(() => { shell.store.value.sidebarOrder = ['follow', '']; shell.store.save() });
    expect(shell.host.attached).toHaveBeenCalledTimes(1);
  });

  it('The skeleton escapes names', async () => {
    const node = document.createElement('div');
    node.innerHTML = sidebarSkeletonHtml(['x'], [['x', '<img src=x>', 'a"b']], () => false);
    expect(node.querySelector('img')).toBeNull();
    expect(node.querySelector('button')!.getAttribute('aria-label')).toBe('<img src=x>');
  });
});

describe('Navigation', () => {
  it('The full vocabulary paints the default nav per the persistent preference, and immersive mode can enable after following', async () => {
    const r = await load();
    await mountRouter(r);
    await connect(r);
    const { scroll, host, store } = sidebarHost([...DEFAULT_SIDEBAR_ORDER]);
    host.navCatalog = NAV_CATALOG;
    scroll.innerHTML = sidebarSkeletonHtml(store.value.sidebarOrder, NAV_CATALOG, host.navOn);
    await act(async () => { await r.islands.loadSidebar(host) });
    expect(navKeys(scroll)).toEqual(DEFAULT_SIDEBAR_ORDER);
    expect(scroll.querySelector('[data-nav="immerse"]')).toBeNull();
    await act(async () => {
      store.value.sidebarOrder = ['follow', 'immerse', ...DEFAULT_SIDEBAR_ORDER.filter((key) => key !== 'follow')];
      store.save();
    });
    expect(navKeys(scroll).slice(0, 2)).toEqual(['follow', 'immerse']);
    expect(scroll.querySelector('[data-nav="immerse"]')?.textContent).toContain('沉浸模式');
  });

  it('The moment the order in the store changes (settings panel or sync from another machine), this column reorders on the spot', async () => {
    const { scroll, store } = await setup();
    act(() => { store.value.sidebarOrder = ['follow', '', 'stats']; store.save() });
    expect(navKeys(scroll)).toEqual(['follow', '', 'stats']);
  });

  it('Clicking an item hands over to the shell\'s navTo; the pressed state changes only when the shell asks for a reread', async () => {
    const { scroll, host, api, press } = await setup();
    await click(scroll.querySelector('[data-nav="unseen"]'));
    expect(host.navTo).toHaveBeenCalledWith('unseen');
    press('unseen');
    act(() => api.navChanged());
    expect(scroll.querySelector('[data-nav="unseen"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(scroll.querySelector('[data-nav=""]')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('Double-clicking navigation only requests a scroll to top and never rebuilds section content', async () => {
    const { scroll, host } = await setup();
    act(() => { scroll.querySelector('[data-nav=""]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) });
    expect(host.navToTop).toHaveBeenCalledOnce();
  });

  it('Arrow-down on the keyboard: land in the local store first, then write /api/settings', async () => {
    const fetcher = fetchMock(200, { sidebarOrder: ['unseen', '', 'follow'] });
    vi.stubGlobal('fetch', fetcher);
    const { scroll, store } = await setup();
    act(() => { scroll.querySelector('[data-nav=""]')!.dispatchEvent(new KeyboardEvent('keydown',
      { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true })) });
    await settle();
    expect(store.value.sidebarOrder).toEqual(['unseen', '', 'follow']);
    expect(JSON.parse(localStorage.getItem('peach.settings.v1')!).sidebarOrder).toEqual(['unseen', '', 'follow']);
    expect(navKeys(scroll)).toEqual(['unseen', '', 'follow']);
    expect(scroll.querySelector('[data-dragging],[data-drop]')).toBeNull();
    expect(fetcher.mock.calls[0]?.[0]).toBe('/api/settings');
    expect(sentBody(fetcher)).toEqual({ sidebarOrder: ['unseen', '', 'follow'] });
  });

  it('Cases that cannot move produce no new order', async () => {
    expect(moveSidebarKey(['a', 'b', 'c'], 'a', 'c', false)).toEqual(['b', 'a', 'c']);
    expect(moveSidebarKey(['a', 'b'], 'a', 'a', true)).toBeNull();
    expect(moveSidebarKey(['a', 'b'], 'x', 'a', true)).toBeNull();
  });
});

describe('Filter group', async () => {
  it('Pressed states paint per the current context\'s filters and clicks go to the shell; dead sources are not clickable', async () => {
    const { scroll, host, render } = await setup();
    render({ content: { kind: 'catalog', key: '1', facets: facets() }, filters: { loc: 'local', tag: 'b' } });
    expect(chipOf(scroll, 'loc', 'local')!.getAttribute('aria-pressed')).toBe('true');
    expect(chipOf(scroll, 'tag', 'b')!.getAttribute('aria-pressed')).toBe('true');
    expect(chipOf(scroll, 'tag', 'a')!.getAttribute('aria-pressed')).toBe('false');
    await click(chipOf(scroll, 'loc', 'local'));
    expect(host.toggleChip).toHaveBeenCalledWith('loc', 'local', true);
    await click(chipOf(scroll, 'tag', 'a'));
    expect(host.toggleChip).toHaveBeenLastCalledWith('tag', 'a', false);
    const offline = chipOf(scroll, 'loc', '115')!;
    expect(offline.disabled).toBe(true);
    expect(offline.hasAttribute('data-offline')).toBe(true);
    expect(offline.title).toBe('This drive is not mounted');
  });

  it('When a name is ellipsized for space, hovering reads the full name: both plain entries and follow tags carry a title', async () => {
    const { scroll, render } = await setup();
    render({ content: { kind: 'catalog', key: '1', facets: facets({ followTags: [chip('the_legend_of_zelda:_tears_of_the_kingdom', 2)] }) } });
    expect(chipOf(scroll, 'tag', 'a')!.title).toBe(chipOf(scroll, 'tag', 'a')!.querySelector('[data-sidebar-chip-label]')!.textContent);
    expect(scroll.querySelector<HTMLElement>('[data-follow-drawer-tag="the_legend_of_zelda:_tears_of_the_kingdom"]')!.title)
      .toBe(scroll.querySelector('[data-follow-drawer-tag="the_legend_of_zelda:_tears_of_the_kingdom"] [data-sidebar-chip-label]')!.textContent);
  });

  it('In-place refresh counts change only the numbers: entries present in the list but absent from the new aggregation read 0', async () => {
    const { scroll, render } = await setup();
    const content = { kind: 'catalog' as const, key: '1', facets: facets() };
    render({ content });
    expect(chipOf(scroll, 'tag', 'a')!.querySelector('[data-sidebar-count]')!.textContent).toBe('5');
    render({ content, latest: facets({ tags: [chip('b', 9)] }) });
    expect(chipOf(scroll, 'tag', 'a')!.querySelector('[data-sidebar-count]')!.textContent).toBe('0');
    expect(chipOf(scroll, 'tag', 'b')!.querySelector('[data-sidebar-count]')!.textContent).toBe('9');
  });

  it('On entry only the active groups are expanded; groups the person opened or collapsed are remembered for the session and survive a new aggregation', async () => {
    const { scroll, render } = await setup();
    render({ content: { kind: 'catalog', key: '1', facets: facets() }, filters: { tag: 'a' } });
    expect(group(scroll, 'Content tags')!.open).toBe(true);
    expect(group(scroll, 'Source')!.open).toBe(false);
    const toggle = group(scroll, 'Source')!.querySelector<HTMLElement>('[data-sidebar-toggle]')!;
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).not.toBeNull();
    await click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    render({ content: { kind: 'catalog', key: '2', facets: facets() }, filters: {} });
    expect(group(scroll, 'Source')!.open).toBe(true);
    expect(group(scroll, 'Content tags')!.open).toBe(false);
  });

  it('"Expand all" sits at the end of the list, and expanding aggregates by the latest snapshot', async () => {
    const { scroll, render } = await setup();
    const tags = Array.from({ length: 32 }, (_, index) => chip(`t${index}`, 40 - index));
    const content = { kind: 'catalog' as const, key: '1', facets: facets({ tags }) };
    render({ content, latest: facets({ tags: [...tags, chip('late', 1)] }) });
    await click(group(scroll, 'Content tags')!.querySelector('[data-sidebar-toggle]'));
    const body = group(scroll, 'Content tags')!.querySelector('[data-sidebar-body]')!;
    expect(body.querySelectorAll('[data-sidebar-chip]')).toHaveLength(30);
    const more = body.lastElementChild as HTMLButtonElement;
    expect(more.getAttribute('data-sidebar-more')).toBe('tag');
    expect(more.getAttribute('aria-label')).toBe('Expand all Content tags');
    await click(more);
    expect(body.querySelectorAll('[data-sidebar-chip]')).toHaveLength(33);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.getAttribute('aria-label')).toBe('Collapse Content tags');
    /* Collapsing takes the whole group: the group title announces the collapse on the spot and the body stops being focusable; `details.open` is only removed once the height transition finishes. */
    await click(more);
    expect(group(scroll, 'Content tags')!.querySelector('[data-sidebar-toggle]')!.getAttribute('aria-expanded')).toBe('false');
    expect(group(scroll, 'Content tags')!.querySelector<HTMLElement>('[data-sidebar-collapse]')!.inert).toBe(true);
    expect(body.querySelectorAll('[data-sidebar-chip]')).toHaveLength(30);
  });

  it('On a new aggregation only badges whose number changed bounce', async () => {
    const { scroll, render } = await setup();
    render({ content: { kind: 'catalog', key: '1', facets: facets({ tags: [chip('pa', 5), chip('pb', 4)] }) } });
    /* `popped` is added and immediately removed, so by the time the callback arrives the class is long gone; the removal entry's old value still carries it. */
    const popped: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (/\bpopped\b/.test(record.oldValue ?? '')) popped.push((record.target as HTMLElement).dataset.countBadge!);
      }
    });
    observer.observe(scroll, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    render({ content: { kind: 'catalog', key: '2', facets: facets({ tags: [chip('pa', 5), chip('pb', 7)] }) } });
    await settle();
    observer.disconnect();
    expect(popped).toEqual(['tag:pb']);
  });

  it('The follows tag on the catalog page goes to the follows page; on the follows page a content tag switches to filtering by just that one', async () => {
    const { scroll, host, render } = await setup();
    render({ content: { kind: 'catalog', key: '1', facets: facets({ followTags: [chip('x', 2)] }) } });
    await click(scroll.querySelector('[data-follow-drawer-tag="x"]'));
    expect(host.openFollowTag).toHaveBeenCalledWith('x');
    render({ content: { kind: 'follow', tags: [chip('y', 3), chip('z', 1)], selected: ['z'] } });
    expect(group(scroll, 'Source')).toBeNull();
    const z = scroll.querySelector('[data-follow-drawer-tag="z"]')!;
    expect(z.getAttribute('aria-pressed')).toBe('true');
    expect(z.querySelector('[data-sidebar-count]')!.textContent).toBe('1');
    await click(scroll.querySelector('[data-follow-drawer-tag="y"]'));
    expect(host.selectFollowTag).toHaveBeenCalledWith('y');
  });

  it('The follows page\'s source and duration return to follow filters, not catalog filters; when details provide only tags there is just the one content tags group', async () => {
    const { scroll, host, render } = await setup();
    const kemono = chip('kemono', null, { dot: { kind: 'image', src: '/source-icon?provider=kemono' } });
    render({
      content: { kind: 'follow', tags: [chip('y', 3)], selected: [], providers: [kemono, chip('fanbox', null)], duration: true },
      filters: { provider: 'fanbox', dur_min: 600, dur_max: '' },
    });
    expect([...scroll.querySelectorAll('[data-sidebar-group]')].map((node) => node.getAttribute('data-sidebar-group')))
      .toEqual(['Source', 'Duration', 'Content tags']);
    expect(chipOf(scroll, 'provider', 'fanbox')!.getAttribute('aria-pressed')).toBe('true');
    expect(chipOf(scroll, 'provider', 'kemono')!.querySelector('[data-sidebar-count]')).toBeNull();
    expect(chipOf(scroll, 'provider', 'kemono')!.querySelector('img')!.getAttribute('src')).toBe('/source-icon?provider=kemono');
    expect(scroll.querySelector(`[data-range-end="min"]`)!.textContent).toBe('10 min');
    await click(chipOf(scroll, 'provider', 'kemono'));
    expect(host.selectFollowProvider).toHaveBeenCalledWith('kemono');
    expect(host.toggleChip).not.toHaveBeenCalled();
    const max = scroll.querySelector<HTMLInputElement>('#durMax')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(max, '60');
      max.dispatchEvent(new Event('input', { bubbles: true }));
      max.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.setFollowDuration).toHaveBeenCalledWith(10, 60);
    expect(host.setDuration).not.toHaveBeenCalled();

    render({ content: { kind: 'follow', tags: [chip('y', 1)], selected: [] } });
    expect([...scroll.querySelectorAll('[data-sidebar-group]')].map((node) => node.getAttribute('data-sidebar-group')))
      .toEqual(['Content tags']);
  });

  it('The duration slider keeps a reading at each end with "Any" at the far right, and commits only on release', async () => {
    const { scroll, host, render } = await setup();
    render({ content: { kind: 'catalog', key: '1', facets: facets({ duration: true }) }, filters: { dur_min: '1200' } });
    const tip = (end: string) => scroll.querySelector(`[data-range-end="${end}"]`)!.textContent;
    expect(tip('min')).toBe('20 min');
    expect(tip('max')).toBe('Any');
    const max = scroll.querySelector<HTMLInputElement>('#durMax')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(max, '60');
      max.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(tip('max')).toBe('60 min');
    expect(host.setDuration).not.toHaveBeenCalled();
    act(() => { max.dispatchEvent(new Event('change', { bubbles: true })) });
    expect(host.setDuration).toHaveBeenCalledWith(20, 60);
  });

  it('With null content only the nav paints', async () => {
    const { scroll, render } = await setup();
    render({ content: { kind: 'catalog', key: '1', facets: facets() } });
    render({ content: null });
    expect(scroll.querySelector('[data-sidebar-group]')).toBeNull();
    expect(navKeys(scroll)).toEqual(['', 'unseen', 'follow']);
  });
});

describe('Resident components', () => {
  it('By the time the handle render and navChanged return, the DOM is painted without waiting for the next render', async () => {
    const { scroll, api, press } = await setup();
    /* No act wrapper: act defers flushSync to its end, which hides whether the handle flushed synchronously on its own. */
    (globalThis as ActFlag).IS_REACT_ACT_ENVIRONMENT = false;
    api.render({ content: { kind: 'catalog', key: '1', facets: facets() }, filters: { tag: 'a' }, latest: null });
    expect(chipOf(scroll, 'tag', 'a')!.getAttribute('aria-pressed')).toBe('true');
    press('unseen');
    api.navChanged();
    expect(scroll.querySelector('[data-nav="unseen"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(scroll.querySelector('[data-nav=""]')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('The brand and drawer button the shell moves into the title row are still those two nodes across repaints, pressed-state changes, and reflows', async () => {
    const brand = document.createElement('a'), toggle = document.createElement('button');
    const place = () => { document.querySelector('[data-sidebar-scroll] > [data-sidebar-head]')!.append(brand, toggle) };
    const { scroll, store, api, render, press } = await setup(undefined, undefined, place);
    const head = scroll.querySelector(':scope > [data-sidebar-head]')!;
    expect([...head.children]).toEqual([brand, toggle]);
    render({ content: { kind: 'catalog', key: '1', facets: facets() }, filters: { tag: 'a' } });
    render({ content: { kind: 'follow', tags: [chip('y', 3)], selected: [] } });
    press('unseen');
    act(() => { api.navChanged() });
    act(() => { store.value.sidebarOrder = ['follow', 'unseen', '']; store.save() });
    render({ content: null });
    expect(scroll.querySelector(':scope > [data-sidebar-head]')).toBe(head);
    expect([...head.children]).toEqual([brand, toggle]);
  });

  it('On throw only the component unmounts, the scroll layer stays and the batch bar still paints; afterwards the handle is a no-op that does not throw, this face stays empty until refresh, and the error is reported once', async () => {
    const reported = watchReports();
    const { r, drawer, scroll, api, render } = await setup();
    const dockRoot = document.createElement('div');
    dockRoot.setAttribute('data-batch-dock', '');
    document.body.append(dockRoot);
    let dock!: BatchDockApi;
    await act(async () => { dock = await r.islands.loadBatchDock({ root: dockRoot, run: vi.fn() }) });

    glyph.broken = true;
    render({ content: { kind: 'catalog', key: '1', facets: facets() } });
    await act(async () => {});
    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith(expect.objectContaining({ message: 'The sidebar never paints' }));
    expect(scroll.isConnected && scroll.parentElement === drawer, 'The scroll layer is the shell\'s node and never withdraws').toBe(true);
    expect(scroll.childNodes.length, 'Component unmounted').toBe(0);
    expect(drawer.querySelector('[data-sidebar-glide]'), 'The glass unmounts with the component').toBeNull();
    expect(r.managedTaken(scroll)).toBe(false);
    expect(r.managedEntries().map((entry) => entry.path), 'Other faces still drawn').toEqual(['batch-dock']);
    await act(async () => { dock.render({ count: 2, context: 'catalog', junkDismissed: false }) });
    expect(dockRoot.querySelector('[data-selection-dock] [role="status"]')?.textContent).toBe('Selected 2 items');

    /* The shell still pushes a copy and flips the pressed state on every page change: no throw, no reopen, no further reporting. */
    await act(async () => {
      expect(() => api.render({ content: null, filters: {}, latest: null })).not.toThrow();
      expect(() => api.navChanged()).not.toThrow();
    });
    expect(reported, 'The deterministic throw is reported only once').toHaveBeenCalledTimes(1);
    glyph.broken = false;
    render({ content: null });
    expect(scroll.childNodes.length, 'Stays empty until refresh, no self-healing').toBe(0);
  });
});
