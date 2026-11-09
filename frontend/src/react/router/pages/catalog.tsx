/* 目录的路由元素（ADR-0031「目录由路由树按匹配打开」）：页面组匹配到 `CATALOG_PATHS`（首页、三个筛选态、回收站与
 * 垃圾文件）时挂上，按地址重建目录筛选（`@peach/shell` 的 `state`），再交壳收舞台以外的事：搜索框、侧栏与顶栏、
 * 顶部三层和取数（`ShellActions.catalog`）。
 *
 * 元素按页面挂 key：首页、三个筛选态与回收站画的是同一张网格，共用一个元素；垃圾文件是另一页。没有背景的作品与
 * 队列地址（深链、刷新）也挂这个元素。换筛选、后退前进与壳要求重开都不重挂，元素在每一轮变化之后的微任务里按下面的
 * 次序判断做哪一件：
 * - 详情压在上面：条目记了背景（页面组按背景匹配）就什么都不做，下面那一页一直画着；没有背景时补画一次目录网格
 *   （`ShellActions.catalog.fill`），详情下面不留一张永远在读的骨架。
 * - 壳要求按当前地址从头重开（`pageOpens` 加一：启动、深链详情关掉补画来处、从管理条进回收站）：整页打开。
 * - 领了新的页面打开序号（后退前进、不认领的跳转）：整页打开；历史返回沿用条目保存的筛选与种子，
 *   没有记录时按地址重建。地址上写了 `seed` 就用它。
 * - 壳认领写了地址（换筛选、换排序、换一批、回首页）：筛选已经由壳写进 `state`，只重取；关掉详情回到压着的那一份
 *   地址、筛选也没变时不重取。这一页要是还没开过（后退落到压在别处之上的详情，挂上时就被盖着），整页打开。
 * `pageOpens` 还是 0 时壳没开始路由，元素只挂着。挂上那一刻按那一次历史变化认没认领分别算作后两种；路由根晚于
 * 壳开始路由才装上时，挂上那一刻算第一种。
 *
 * `?state=ads` 落在首页上时不打开，改写成垃圾文件的地址（不加条目），由垃圾文件那一页的元素接着打开。
 * 目标页立即展示变化区域的等待态，稳定控件不重挂。判断与改写排进微任务，避开路由根的提交阶段。 */
import { useContext, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router';

import { appSettingsStore } from '@peach/appearance';
import { isOverlayPath, navigationBackground, overlayTarget, peachHistory, shellNavigate } from '@peach/history';
import { cleanTagFilter, isCatalogPath, newSeed, ROUTE_STATES } from '@peach/legacy/core';
import { pageOpens, state, subscribeShell, writeShell, type CatalogFilters } from '@peach/shell';

import { junkPath, junkRoute } from '../../../junk-queue';
import { sortFromAddress } from '../../../sort-preferences';
import { pageNavigationReady, rememberPageState, restoredPageState, restoringPage } from '../../../history/page-navigation';
import { ShellActionsContext, useOpenEpoch } from '../router';
import type { CatalogShell, ShellActions } from '../shell-actions';
import { JavLibraryHeader } from '../../jav/jav-header';
import { CatalogFolders } from '../../catalog-folders/catalog-folders-page';
import { removeWallBootSkeleton } from '../../video-wall/wall-boot';

const readOpens = () => pageOpens;

/* Whether each history change was claimed, and which path it was on before the change. Listening starts at module load, ahead of the route root: what the route root's synchronous commit reads
   is already this change. `initialSeq` is the sequence number at load; if the mounted sequence number still equals it, the route root mounted this very page on attach. */
const initialSeq = peachHistory.navigation.seq;
let epoch = peachHistory.navigation.openEpoch;
let here = peachHistory.navigation.location.pathname;
let last = { seq: initialSeq, claimed: true, from: here };
peachHistory.listen((navigation) => {
  last = { seq: navigation.seq, claimed: navigation.openEpoch === epoch, from: here };
  epoch = navigation.openEpoch;
  here = navigation.location.pathname;
});

/* The moment the home page's `?state=ads` is rewritten into the junk files URL: taken away when the junk files page's element mounts, opening the full page. */
let junkRedirect = false;

/** Where the element last got to: its index, page-open sequence, reopen count, whether details was pressed over it at that moment, which address and which filter set the page group rendered,
 *  and whether this page had been opened. */
interface Seen {
  seq: number;
  epoch: number;
  opens: number;
  covered: boolean;
  address: string;
  filters: string;
  opened: boolean;
}

function seen(opened: boolean): Seen {
  const { seq, openEpoch, location } = peachHistory.navigation;
  const covered = isOverlayPath(location.pathname);
  const shown = navigationBackground() ?? location;
  const filters = state ?? {};
  return {
    seq, epoch: openEpoch, opens: pageOpens, covered, address: `${shown.pathname}${shown.search}`,
    filters: JSON.stringify(filters, Object.keys(filters).sort()), opened,
  };
}

/** Catalog filters rebuilt from the URL, written the same way as the shell's startup copy; the trash pins the status only and clears the other filters. Origin and thumbnails are not refetched from the URL. */
function filtersAt(pathname: string, search: string, entering: boolean, shell: CatalogShell): CatalogFilters {
  const previous: CatalogFilters = { ...state };
  const restored = restoredPageState<CatalogFilters>('catalog');
  if (restored) return { ...restored };
  if (pathname === '/trash') return { ...previous, creator: '', studio: '', tag: '', orient: '', state: 'trash', q: '' };
  const params = new URLSearchParams(search);
  const { defaultSort, defaultSortDirection } = appSettingsStore().value;
  return {
    ...previous,
    loc: params.get('loc') ?? shell.defaultLoc(),
    creator: params.get('creator') || '', studio: params.get('studio') || '',
    owner: params.get('owner') === 'none' ? 'none' : '',
    tag: cleanTagFilter(params.get('tag')), tag_match: params.get('tag_match') === 'any' ? 'any' : 'all',
    len: params.get('len') || '', dur_min: params.get('dur_min') || '', dur_max: params.get('dur_max') || '',
    orient: params.get('orient') || '',
    state: ROUTE_STATES[pathname] || params.get('state') || '',
    ...sortFromAddress(params.get('sort'), params.get('dir'), defaultSort, defaultSortDirection),
    seed: params.get('seed') || (entering ? newSeed() : previous.seed || newSeed()),
    q: params.get('q') || '', jav: params.get('jav') || '',
    performer: params.get('performer') || '', series: params.get('series') || '',
    browse: params.get('browse') === 'folders' || params.get('folder') ? 'folders' : '',
    folder: params.get('folder') || '', folder_recursive: params.get('folder_recursive') === '0' ? '0' : '',
  };
}

/** After clicking, first show the target skeleton and position by page; for history restoration, position after the loaded pagination lands. */
function openCatalog(load: () => void | Promise<void>): void {
  const seq = peachHistory.navigation.seq;
  rememberPageState('catalog', { ...state });
  const loading = load();
  const current = () => peachHistory.navigation.seq === seq;
  const results = () => document.querySelector('#grid');
  void pageNavigationReady(current, results(), { pending: true });
  void Promise.resolve(loading).then(() => pageNavigationReady(current, results()));
}

/** Which one this judgment round performs, and it performs it; `mark` becomes this moment. */
function settle(mark: Seen, actions: ShellActions): void {
  const was = { ...mark };
  const now = seen(was.opened);
  Object.assign(mark, now);
  const shell = actions.catalog;
  if (!shell || now.opens === 0) return;
  if (now.covered) {
    if (!navigationBackground()) shell.fill();
    return;
  }
  let entering = false;
  if (now.opens === was.opens) {
    if (now.epoch === was.epoch && was.opened) {
      if (now.seq === was.seq || (was.covered && now.address === was.address && now.filters === was.filters)) return;
      openCatalog(() => shell.load());
      return;
    }
    if (now.epoch !== was.epoch) entering = peachHistory.navigation.action === 'POP' && last.from !== '/';
  }
  const { pathname, search } = peachHistory.navigation.location;
  if (pathname === '/' && new URLSearchParams(search).get('state') === 'ads') {
    const { kind, view } = junkRoute(search);
    junkRedirect = true;
    shellNavigate(junkPath(kind, view), { replace: true });
    return;
  }
  const retitle = junkRedirect;
  junkRedirect = false;
  entering &&= pathname === '/' && !restoringPage();
  mark.opened = true;
  writeShell({ state: filtersAt(pathname, search, entering, shell) });
  openCatalog(() => shell.open(pathname, { entering, retitle }));
}

function CatalogOpen() {
  const actions = useContext(ShellActionsContext);
  const openEpoch = useOpenEpoch();
  const opens = useSyncExternalStore(subscribeShell, readOpens);
  const location = useLocation();
  const mark = useRef<Seen | null>(null);
  const live = useRef({ mounted: true, queued: false });
  useEffect(() => {
    const own = live.current;
    own.mounted = true;
    const now = seen(!isOverlayPath(peachHistory.navigation.location.pathname));
    /* Record at mount time: if the shell then asks for a reopen in the same round (`pageOpens` incremented), a microtask comparison can tell the two apart. */
    if (!now.covered && now.opens > 0) {
      if (junkRedirect || last.seq === initialSeq) now.opens = -1;
      else if (!last.claimed) now.epoch = -1;
      else now.seq = -1;
    }
    mark.current = now;
    return () => {
      own.mounted = false;
    };
    // Registers once per mount; later changes are queued into a microtask by the cell below.
  }, []);
  useEffect(() => {
    const own = live.current;
    if (own.queued || !actions) return;
    own.queued = true;
    queueMicrotask(() => {
      own.queued = false;
      if (own.mounted && mark.current) settle(mark.current, actions);
    });
  }, [openEpoch, opens, location, actions]);
  return null;
}

/** The element shared by the catalog's six paths: home, three filtered states, and trash share one key; junk files gets another; when the page group matches by background it takes the background's page.
 *  When the address-override parameter is not numeric (`/assets/abc`), nothing mounts: that is not a details entry, and nothing is painted beneath either. */
export function CatalogMatch() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    if (pathname !== '/wall') return;
    document.body.setAttribute('data-wall-open', '');
    document.documentElement.removeAttribute('data-wall-entry');
    const chrome = Array.from(document.querySelectorAll<HTMLElement>('header.top,#drawer,#main,#catalogFilter,#count,#javLibraryHeader,#feedNew'));
    const inert = chrome.map(node => node.inert);
    chrome.forEach(node => { node.inert = true });
    return () => {
      document.body.removeAttribute('data-wall-open');
      removeWallBootSkeleton();
      chrome.forEach((node, index) => { node.inert = inert[index] || false });
    };
  }, [pathname]);
  if (isOverlayPath(pathname) && !overlayTarget(pathname)) return null;
  return <>
    <CatalogOpen key={pathname === '/junk-files' ? '/junk-files' : '/'} />
    {isCatalogPath(pathname) ? <CatalogFolders /> : null}
  </>;
}

/** The JAV header is persistent; the shell toggles its visibility when the target content commits, and the old header isn't torn down during routing fetches. */
export function CatalogChrome() {
  const actions = useContext(ShellActionsContext);
  const host = document.getElementById('javLibraryHeader');
  return host && actions ? createPortal(<JavLibraryHeader navigate={actions.navigate}
    receipt={message => actions.receipt(message)} />, host) : null;
}
