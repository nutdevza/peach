/* 由路由画的那几页与页面里的页面内组件（ADR-0031「页面与页面里的页面内组件只由路由树画」）：壳决定什么时候开、
 * 什么时候收，React 路由树画。
 *
 * 页面画进壳的三个容器：管理区正文 `#stats`，索引页与资料页共用的 `#index`，目录网格与垃圾队列共用的
 * `#grid`。页面内组件各有自己的容器：首页筛选条 `#catalogFilter`、首页新作行 `#feedNew`、
 * 顶栏搜索下拉 `#searchMenu`。一个容器同时只有一页（或一面），各个容器各记各的：
 * 资料页画进 `#index` 时，管理区那一页只是被壳藏起来、照旧活着（有轮询的页面照着原节律取数），等壳下一次
 * 认领表面（`claimSurface`）才把 `#stats` 与 `#index` 一起收；`#grid` 不在其中，目录内换筛选也认领表面，网格
 * 要一直画着；页面内组件由壳按各自的路由判据收，搜索下拉壳从不收。页面跟着这里登记的那一条走，不跟着
 * 地址匹配走：详情舞台压在页面上时地址是 `/assets/:id`，页面要留着。
 *
 * 常驻组件（批量条、配色卡、管理区页头、沉浸模式、设置面板、侧栏、舞台）不跟某一页走，经 `openResidentSurface` 打开：
 * 没有首屏取数、一直算当前页，宿主就是那个常驻节点。它们从不收；只有错误边界会卸掉它的组件，而且只卸组件、
 * 不撤宿主。
 *
 * 登记键是「面」：页面用路径（`/stats`、`/performers/*`、`/`），页面内组件与常驻组件用名字（`search`、
 * `batch-dock`），两者不重叠，路由树按键查同一组表（`react/router/managed-routes.tsx`）。
 *
 * 一次打开：壳铺好骨架后调 `openManagedRoute`，这里保留同一容器里的上一页并取首屏；取齐、壳也还停在
 * 这一页时，在同一个任务里换掉骨架、放进宿主，再让路由树同步画出整页。路由树还没接上时，打开先等它接上
 * 再取数（搜索下拉在壳的模块求值时就打开，早于 `loadRouter`）。每次打开都领一个新代次，页面按代次重挂、
 * 重取。打开之后壳的开关（选择模式、换筛选、换版式）经 `updateManagedRoute` 合进同一页的 props：代次不变，
 * 页面就地重渲染，不重挂也不重取。 */

import { rememberPageState, restoredPageState } from './page-navigation';

/** The page (or panel) rendered inside some container. `host` is the `.peach-react` host the page portals into. */
export interface ManagedEntry {
  /** The registration key: the page's path, or a component's name within the page. */
  path: string;
  props: object;
  revision: number;
  /** The shell's container (`#stats`, `#index`, `#grid`, or a component container inside a page). */
  container: Element;
  host: HTMLElement;
  /** A resident component: the host is the shell's node, and on collapse or error only the component unmounts while the host stays. */
  resident: boolean;
}

/** The first-screen fetch the route tree hands here: fetches by registered key and throws `AbortError` once aborted. */
export type ManagedPrefetch = (path: string, props: object, signal: AbortSignal) => Promise<void>;

export interface ManagedOpenOptions {
  /** The container the page renders into. */
  container: Element;
  /** The shell's page-change rule: if the user walked away during the fetch, do not render. */
  isCurrent: () => boolean;
  /** The first screen is fully loaded; switching the shell's visible face happens in the same task as the content commit. */
  beforePlace?: () => void;
  /** Same-kind pages reuse the host and component, updating only props. */
  reuse?: boolean;
  /** The frame the shell lays itself: at the moment the first screen is fetched it swaps the frame into the container and
 *  returns the host the page renders into. When not given, it empties the container and puts in a new `.peach-react`. The
 *  profile page needs this: the overlay's stickiness requires its parent box to be `#index`, and the new-releases row is a
 *  legacy-layer card outside `.peach-react`, so the shell lays the frame's four blocks and the page takes one, portaling into
 *  the other three. */
  place?: (container: Element) => HTMLElement;
  /** Resident components (the ones opened via `openResidentSurface`): the host belongs to the shell; on collapse or throw only the component unmounts and the host stays. */
  resident?: boolean;
}

/** Subscribers receive what the containers hold at that moment. With `sync` true it must finish rendering on the spot: the shell just swapped or removed hosts within the same task,
 *  and being a beat late means a blank frame. With false it updates in place and queues into the next render as usual. */
type ManagedListener = (entries: readonly ManagedEntry[], sync: boolean) => void;

/* `page`: the registration key is the path, and this run is a page change; data fetching by in-page and persistent components doesn't count. */
interface Pending { revision: number; controller: AbortController; page: boolean }

/* Before the route tree is wired to fetching, opens wait here; if the wired copy fails to load, the waiting opens fail with it. */
let connect: (ready: Promise<ManagedPrefetch>) => void = () => {};
const prefetcher = new Promise<ManagedPrefetch>((resolve) => { connect = resolve });
prefetcher.catch(() => {});
/* On first open, call the app's registered ready hook so the search dropdown and the first-screen filter bar wait for the route tree to connect before fetching.
 * Page code is already in the main bundle, and the ready hook is called only once. */
let preload: (() => void) | null = null;
export function preloadManagedRoutes(load: () => void): void {
  preload = load;
}
const entries = new Map<Element, ManagedEntry>();
const pending = new Map<Element, Pending>();
let revision = 0;
const listeners = new Set<ManagedListener>();
const loadingListeners = new Set<(loading: boolean) => void>();
let loading = false;

/** A page is still fetching its first screen: the page-switch progress bar (navigation-progress.ts) reads it. */
export const managedLoading = (): boolean => loading;

/** Subscribe to changes in “a page is still fetching its first screen”, notifying only on a true/false flip. */
export function listenManagedLoading(listener: (loading: boolean) => void): () => void {
  loadingListeners.add(listener);
  return () => { loadingListeners.delete(listener) };
}

/* `pending` is called after every add or remove. */
function settleLoading(): void {
  const next = [...pending.values()].some((inflight) => inflight.page);
  if (next === loading) return;
  loading = next;
  for (const listener of [...loadingListeners]) listener(loading);
}

/** Hooks up fetching when the route tree loads. Only the first time counts. */
export function connectManagedRoutes(ready: Promise<ManagedPrefetch>): void {
  connect(ready);
}

/** The page currently rendered in this container; null while the first screen is still loading or after it is collapsed. */
export function managedEntry(container: Element): ManagedEntry | null {
  return entries.get(container) ?? null;
}
/** This container belongs to the router tree: either already rendered or first screen still loading. The shell uses that to decide whether to open again: opening while in flight aborts that request
 *  and refetches; opening while rendered tears it down and redraws, and when the content has not changed that is nothing but a wasted layout collapse. */
export function managedTaken(container: Element | null): boolean {
  return !!container && (entries.has(container) || pending.has(container));
}
/** Every page being drawn right now; the route tree renders portals from it. */
export const managedEntries = (): readonly ManagedEntry[] => [...entries.values()];

/** The route tree subscription: every page change, collapse or in-place update notifies synchronously. */
export function listenManagedEntry(listener: ManagedListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener) };
}

function notify(sync: boolean): void {
  const shown = managedEntries();
  for (const listener of [...listeners]) listener(shown, sync);
}

/** Open a page and wait for its first screen to land. Returns true once painted; false if it was collapsed, reopened, or the shell switched pages meanwhile. */
export async function openManagedRoute(path: string, props: object, options: ManagedOpenOptions): Promise<boolean> {
  const { container } = options;
  pending.get(container)?.controller.abort();
  pending.delete(container);
  settleLoading();
  if (!options.isCurrent()) return false;
  const previous = entries.get(container);
  if (options.reuse && previous?.host.isConnected) {
    entries.set(container, { ...previous, path, props });
    notify(true);
    if (path.startsWith('/')) rememberPageState(`managed:${path}`, true);
    return true;
  }
  revision += 1;
  const mine: Pending = { revision, controller: new AbortController(), page: path.startsWith('/') && !options.resident };
  pending.set(container, mine);
  settleLoading();
  const load = preload;
  preload = null;
  load?.();
  const prefetch = await prefetcher;
  if (pending.get(container) !== mine) return false;
  try {
    if (!path.startsWith('/') || !restoredPageState<boolean>(`managed:${path}`)) {
      await prefetch(path, props, mine.controller.signal);
    }
  } catch {
    // Aborting means the user has walked away. Other failures render as usual: the reason and retry cadence stay in the page's hands.
    if (mine.controller.signal.aborted) return false;
  }
  if (pending.get(container) !== mine) return false;
  pending.delete(container);
  settleLoading();
  if (!options.isCurrent()) return false;
  options.beforePlace?.();
  releaseManagedRoute(container);
  const host = options.place ? options.place(container) : defaultHost(container);
  entries.set(container, { path, props, revision: mine.revision, container, host, resident: !!options.resident });
  notify(true);
  if (path.startsWith('/')) rememberPageState(`managed:${path}`, true);
  return true;
}

/** Opens a resident component (a name in the resident table `RESIDENT_ROUTES`): it always counts as the current page, the host
 *  is the node the shell hands over itself, and the component renders directly as its child, so the DOM matches what the
 *  surface would have built with its own root. No first-screen fetch; it renders as soon as the route tree connects; returns
 *  true once rendered.
 *
 *  `place` hands the host to the route tree in the same task as the first frame, and must return that node itself; when not
 *  given, hand it back unchanged. When the shell's startup skeleton is already inside the host (management header, sidebar),
 *  `place` clears it: the skeleton survives until the first frame renders, with no blank frame in between. When the host is a
 *  new node not yet in the document (immersive mode, settings panel), `place` mounts it into the document so node and first
 *  frame appear together.
 *
 *  Each opens once, at shell startup (or first use). After that the shell pushes content through its imperative handle and the
 *  component subscribes to its own store; after a thrown error the boundary unmounts only the component, the surface stays
 *  empty until refresh, and the handle remains callable without throwing. */
export function openResidentSurface(
  name: string, container: HTMLElement, place: (container: HTMLElement) => HTMLElement = () => container,
): Promise<boolean> {
  return openManagedRoute(name, {}, { container, isCurrent: () => true, place: () => place(container), resident: true });
}

/* Token, Preflight, and focus rules all act on `.peach-react`; the container belongs to the shell, so build another one and remove it together with the collapse. */
function defaultHost(container: Element): HTMLElement {
  const host = container.ownerDocument.createElement('div');
  host.className = 'peach-react';
  container.replaceChildren(host);
  return host;
}

/** Folds the shell's toggle into the page currently on screen: the generation is unchanged, the page rerenders in place, no remount, no refetch. When that container has not rendered yet
 *  (first screen still loading or already collapsed) it is a no-op, and the copy handed in on open still stands. */
export function updateManagedRoute(container: Element | null, patch: object): void {
  const shown = container ? entries.get(container) : undefined;
  if (!shown) return;
  entries.set(shown.container, { ...shown, props: { ...shown.props, ...patch } });
  notify(false);
}

/** Tears down the pages in these containers: aborts first-screen fetches in flight, unmounts pages and withdraws hosts, one
 *  notification. Containers with no page are a no-op.
 *  Containers are named one by one, with no "collapse all": when the shell claims a surface on page change it tears down
 *  `#stats` and `#index`, `#grid` keeps rendering across the catalog's paths and trash and is torn down only on leaving the
 *  catalog, and in-page components are torn down by the shell per their own route criteria. Resident components' hosts are
 *  the shell's nodes, so only the component unmounts and the host is not withdrawn. */
export function releaseManagedRoute(container: Element, ...more: Element[]): void {
  const removed: ManagedEntry[] = [];
  for (const target of new Set([container, ...more])) {
    const inflight = pending.get(target);
    if (inflight) {
      inflight.controller.abort();
      pending.delete(target);
      settleLoading();
    }
    const shown = entries.get(target);
    if (shown) {
      entries.delete(target);
      removed.push(shown);
    }
  }
  if (!removed.length) return;
  notify(true);
  for (const shown of removed) if (!shown.resident) shown.host.remove();
}

/** Unmounting the app collapses every registration and aborts first-screen requests that never became a page. */
export function releaseAllManagedRoutes(): void {
  const [first, ...rest] = new Set([...entries.keys(), ...pending.keys()]);
  if (first) releaseManagedRoute(first, ...rest);
}

/** Called after a surface's render threw and the route tree's error boundary caught it: withdraws only that surface's
 *  registration and host, leaving other surfaces rendering. Afterwards `managedTaken` returns false and `updateManagedRoute`
 *  is a no-op for it, and the shell's next open reopens. A generation mismatch (the cell already torn down or reopened) is a
 *  no-op: an expired surface must not withdraw the new one the shell just opened. Resident components' hosts are the shell's
 *  nodes; only the component unmounts, not the host; the shell will not open it again, and the surface stays empty until
 *  refresh.
 *
 *  Deleting the registration and withdrawing the host happen on the spot, and notification waits for a microtask: this runs
 *  inside React's commit phase (the error boundary's `componentDidCatch`), and notifying would re-render the route tree. When
 *  the throw happens on an open's first frame, open still returns true, only the registration is already withdrawn by the time
 *  it returns, and the patch the shell pushes next is a no-op. */
export function failManagedRoute(container: Element, failed: number): void {
  const shown = entries.get(container);
  if (shown?.revision !== failed) return;
  entries.delete(container);
  if (!shown.resident) shown.host.remove();
  queueMicrotask(() => { notify(false) });
}
