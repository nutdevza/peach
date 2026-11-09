/* 全站唯一的浏览器历史（`@peach/history`）。
 *
 * Application 与 React 路由树直接引用本模块，随 peach-app.js 发出同一个历史实例。
 * 已由壳处理的地址同步使用 shellNavigate，Router 的 navigator 也读这一份。
 *
 * 实现是 React Router 自己的 `createBrowserHistory`（`v5Compat` 档：push / replace 也通知监听者），
 * 和它的 `<Router>` 读写的是同一种 `{usr, key, idx}` 历史条目，不另引一份 history 库。它只收一个
 * 监听者，而且要有监听者才挂 `popstate`：这里一建好就由本模块接上，再分发给各个订阅者，所以页面
 * 一加载就在数后退与前进，不等谁来订阅。
 *
 * 每一次历史变化（壳写的、React 子树写的、后退前进）都领一个递增的序号 `seq`。壳写地址走 `shellNavigate`，
 * 那一次当场认领（`claimed`）：页面元素保持代次，覆盖元素接走这一次的打开请求。后退前进、React
 * 子树写的与壳经 `peachHistory` 直接写的那几次没人认领，另领一个页面打开序号（`openEpoch`）：每一次都要把那一页
 * 按地址重开一遍。代次在通知订阅者之前就定了，路由根同步提交那一次渲染里读到的已经是新代次，页面按它挂 key，
 * 一次打开只挂一次。判据用序号与代次不用地址：同一条目重放的 `popstate` 地址不变，那一页照样要重开。 */
import { UNSAFE_createBrowserHistory, type Location, type NavigationType, type Navigator, type To } from 'react-router';

import { backgroundOf, type BackgroundLocation } from './overlay';
import { canonicalPath } from './canonical-path';
import { settingsBackgroundOf, isPreferencePath } from './settings-route';
export * from './settings-route';
export { canonicalPath } from './canonical-path';

/** One history change: the action, the URL after the change, the counter it drew, the page open counter as of this change, and whether this one was a shell-claimed write. */
export interface Navigation {
  action: NavigationType;
  location: Location;
  seq: number;
  openEpoch: number;
  claimed: boolean;
}

export type NavigationListener = (navigation: Navigation) => void;

/** The copy handed to `<Router navigator>`, plus the current change and its subscription. */
export interface PeachHistory extends Navigator {
  readonly navigation: Navigation;
  listen(listener: NavigationListener): () => void;
}

const browser = UNSAFE_createBrowserHistory({ v5Compat: true });
let seq = 0;
let openEpoch = 0;
let current: Navigation = { action: browser.action, location: browser.location, seq, openEpoch, claimed: true };
const listeners = new Set<NavigationListener>();
/* `claiming` is true only during the moment `shellNavigate` writes the address. */
let claiming = false;
/* Still on the entry from page load: since then only rewritten via replace (cleaning the startup address, in-page parameter writes), no push and no back/forward. */
let onBootEntry = true;

browser.listen(({ action, location }) => {
  const path = location.pathname + location.search + location.hash;
  const canonical = canonicalPath(path);
  if (canonical !== path) {
    window.history.replaceState(window.history.state, '', canonical);
    location = browser.location;
  }
  seq += 1;
  if (!claiming) openEpoch += 1;
  if (action !== 'REPLACE') onBootEntry = false;
  current = { action, location, seq, openEpoch, claimed: claiming };
  for (const listener of [...listeners]) listener(current);
});

function canonicalTo(to: To): To {
  if (typeof to === 'string') return canonicalPath(new URL(to, window.location.href).href);
  const source = new URL(`${to.pathname ?? window.location.pathname}${to.search || ''}${to.hash || ''}`, window.location.href);
  const canonical = canonicalPath(source.href);
  if (canonical === source.pathname + source.search + source.hash) return to;
  const target = new URL(canonical, window.location.origin);
  return { ...to, pathname: target.pathname, search: target.search, hash: target.hash };
}

export const peachHistory: PeachHistory = {
  get navigation() { return current },
  listen(listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener) };
  },
  createHref: (to) => browser.createHref(to),
  createURL: (to) => browser.createURL(to),
  encodeLocation: (to) => browser.encodeLocation(to),
  go: (delta) => browser.go(delta),
  push: (to, state) => browser.push(canonicalTo(to), state),
  replace: (to, state) => browser.replace(canonicalTo(to), state),
};

export interface ShellNavigateOptions {
  replace?: boolean;
  /** The `usr` state of the new entry. When cleaning the address, pass `peachHistory.navigation.location.state` to preserve the current one intact. */
  state?: unknown;
}

/** 壳写地址：push 或 replace 一条，当场认领。调用方须已处理正文或提交打开请求；
 * 页面重定向由 peachHistory.push / replace 交路由打开，不能只认领地址。
 *
 * 路径先按当前地址解析成绝对的：壳传进来的有相对路径、有只带查询串的，也有整条 href，
 * `history.pushState` 本来就是这样解析的；React Router 的 `To` 只认路径，`#x` 这种会丢掉查询串。 */
export function shellNavigate(path: string | URL, { replace = false, state }: ShellNavigateOptions = {}): void {
  const url = new URL(path, window.location.href);
  const to: To = canonicalPath(`${url.pathname}${url.search}${url.hash}`);
  claiming = true;
  try {
    if (replace) browser.replace(to, state);
    else browser.push(to, state);
  } finally {
    claiming = false;
  }
}

/** Whether the current entry is the one from page load (refresh, new tab, deep link). */
export const bootEntry = (): boolean => onBootEntry;

/** The page group matches its background: the page the current entry recorded in `usr`. The startup entry is not read (ADR-0031 "details entries record the page pressed beneath"):
 *  `usr` survives refresh, but the page beneath was never painted, so refresh, new tabs, and deep links landing on details count as having no background. */
export function navigationBackground(): BackgroundLocation | null {
  if (isPreferencePath(current.location.pathname)) {
    const settings = onBootEntry ? null : settingsBackgroundOf(current.location.state);
    return settings ? backgroundOf(settings.state) || settings : null;
  }
  return onBootEntry ? null : backgroundOf(current.location.state);
}

export {
  adoptOverlayState, backgroundOf, clearOverlayBackground, holdOverlayBackground, isOverlayPath, OVERLAY_PATHS,
  overlayState, overlayTarget, takeOverlayReturn,
  type BackgroundLocation, type OverlayKind, type OverlayPath, type OverlayState, type OverlayTarget,
} from './overlay';
export { ROUTE_META, routeMetaOf, type RouteMeta } from './route-meta';
export {
  connectManagedRoutes, failManagedRoute, listenManagedEntry, managedEntries, managedEntry, managedTaken, openManagedRoute,
  openResidentSurface, preloadManagedRoutes, releaseAllManagedRoutes, releaseManagedRoute, updateManagedRoute,
  type ManagedEntry, type ManagedOpenOptions, type ManagedPrefetch,
} from './managed';
