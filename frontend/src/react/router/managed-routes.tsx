/* The pages rendered by the router, the in-page components inside them, and the resident components: a table of registration
 * key to first-screen fetch and render style, seven tables; plus the legacy direct-address rewrite table `REDIRECT_ROUTES` and
 * immersive mode's `IMMERSE_ROUTES`, which only mount elements.
 *
 * `MANAGED_ROUTES` is the management pages (rendered into `#stats`), keyed by exact path, each entry carrying the element the
 * page group mounts on match; `BROWSE_ROUTES` is the playlists and follows pages, rendered into `#stats` the same way;
 * `INDEX_ROUTES` is the index pages and `ENTITY_ROUTES` is the profile page (both rendered into `#index`), with the profile
 * page registered by pattern (`/performers/*`), kind and name following the open; `CATALOG_ROUTES` is the catalog grid and
 * junk queue rendered into `#grid`, keyed per page; `SURFACE_ROUTES` is the in-page components and `RESIDENT_ROUTES` the
 * resident components that are not tied to a page, both registered by name, not address, and not inside `<Routes>`. The
 * `open` handed in on each open (computed by the page element for management, by the shell for the rest) carries only the
 * values computable for that open (the category and tab on the address, read-only state, onboarding flags, one-shot prefill,
 * refresh generation); the two `#grid` pages and the in-page components get the shell's whole props; receipts and switching to
 * screens still owned by the shell go through `ShellActions`.
 * Jumps between management pages go through `go`: entries landing on `MANAGED_ROUTES` go to React Router's `navigate`, the
 * rest go to the shell. The other four tables' pages do not use `go`: their in-page address writes are all claimed by the
 * shell (`routeIndex`, the profile and follows pages' `actions.route`, the catalog's filter change, the junk queue's category
 * change), cross-page jumps also go to the shell, and open counts match the shell's own opens. */
import type { ReactElement } from 'react';
import type { ConfigurationPath } from '@peach/history';

import { javDisplayName, javTitleHtml } from '@peach/legacy/jav-title';
import { tagLabel } from '@peach/legacy/tags';

import { prefetchTasks } from '../activity/tasks';
import { BatchDockSurface } from '../batch-dock/batch-dock-island';
import type { DataCleanupSection, LibraryProcessingProps } from '../bundle';
import { CatalogFilterPage } from '../catalog-filter/catalog-filter-page';
import { CatalogGridPage } from '../catalog-grid/catalog-grid-page';
import { prefetchCatalogGrid } from '../catalog-grid/catalog-grid';
import { catalogView } from '../catalog-grid/catalog-view';
import { prefetchDataCleanup, prefetchDataCleanupTool } from '../data-cleanup/data-cleanup';
import { CLEANUP_TOOLS, type CleanupToolPath } from '../../cleanup-tools';
import { prefetchEntityPage, type EntityPageProps } from '../entity-page/entity-page';
import { EntityPage } from '../entity-page/entity-page-view';
import { prefetchDuplicates } from '../duplicates/duplicates';
import { prefetchRepairs } from '../settings/repair-center-data';
import { prefetchDiagnostics } from '../diagnostics/diagnostics';
import { prefetchFeedNew } from '../feed-new/feed-new';
import { FeedNewPage } from '../feed-new/feed-new-page';
import { prefetchFollowFeed } from '../follow-feed/follow-feed';
import { FollowFeedPage } from '../follow-feed/follow-feed-page';
import { prefetchFollowManage } from '../follow-manage/follow-manage';
import { GlowPickerSurface } from '../glow-picker/glow-picker-island';
import { ImmerseSurface } from '../immerse/immerse-island';
import { prefetchIndex } from '../index/index-data';
import { IndexPage } from '../index/index-page';
import { JunkQueuePage } from '../junk-queue/junk-queue-page';
import { prefetchJav } from '../jav/jav';
import { prefetchLibraryProcessing } from '../library-processing/library-processing';
import { LibraryProcessingCard } from '../library-processing/library-processing-card';
import { LibraryProcessingNotice } from '../library-processing/library-processing-notice';
import { ManageHeaderSurface } from '../manage-header/manage-header-island';
import { prefetchPlaylists } from '../playlists/playlists';
import { prefetchQualityGoals } from '../quality-goals/quality-goals';
import { prefetchReview } from '../review/review';
import { prefetchScraping } from '../scraping/scraping';
import { SearchPage } from '../search/search-page';
import { prefetchConfiguration } from '../settings/configuration';
import { SettingsPanelSurface } from '../settings-panel/settings-panel';
import { SidebarSurface } from '../sidebar/sidebar-island';
import { StageSurface } from '../stage/stage';
import { prefetchStats } from '../stats/stats';
import { DEFAULT_WINDOW, prefetchTaste } from '../taste/taste';
import { CatalogMatch } from './pages/catalog';
import { FollowMatch, PlaylistsMatch } from './pages/follow';
import { ImmerseMatch } from './pages/immerse';
import { EntityMatch, IndexMatch } from './pages/index-entity';
import { ManagedMatch, ResourceSyncRedirect } from './pages/managed';
import { routeChunk, type RouteChunk } from './route-chunk';
import type {
  BrowseOpenProps, BrowseRoutePath, CatalogOpenProps, CatalogPagePath, EntityRoutePath, IndexOpenProps,
  IndexOpenPropsTable, IndexRoutePath, ManagedOpenProps, ManagedPath, ResidentName, ResidentOpenProps, ShellActions,
  SurfaceName, SurfaceOpenProps,
} from './shell-actions';

interface ManagedRoute<P> {
  prefetch(open: P, signal: AbortSignal): Promise<void>;
  page(open: P, actions: ShellActions, go: (path: string) => void): ReactElement;
  /** The element for this route in the page group: opens this page by address (`pages/`). The pages that do not exist are still opened by the shell. */
  element?: ReactElement;
}

type ManagedRouteTable = { [Path in ManagedPath]: ManagedRoute<ManagedOpenProps[Path]> };
type BrowseRouteTable = { [Path in BrowseRoutePath]: ManagedRoute<BrowseOpenProps[Path]> };
type IndexRouteTable = { [Path in IndexRoutePath]: ManagedRoute<IndexOpenPropsTable[Path]> };
type EntityRouteTable = { [Path in EntityRoutePath]: ManagedRoute<EntityPageProps> };
type CatalogRouteTable = { [Path in CatalogPagePath]: ManagedRoute<CatalogOpenProps[Path]> };
type SurfaceRouteTable = { [Name in SurfaceName]: ManagedRoute<SurfaceOpenProps[Name]> };
type ResidentRouteTable = { [Name in ResidentName]: ManagedRoute<ResidentOpenProps[Name]> };
/** All pages and panels the route tree renders: the managed-area pages, the playlists and follows pages, index and profile pages, the catalog grid, plus the names of in-page and resident components. */
export type RoutedPath =
  ManagedPath | BrowseRoutePath | IndexRoutePath | EntityRoutePath | CatalogPagePath | SurfaceName | ResidentName;

/* Low-frequency pages' code is not in the entry bundle (ADR-0118): first-screen fetches and chunk loads run in parallel, and the page paints when both land. Data first means waiting for code,
 *  code first means waiting for data; either failing still goes to `openManagedRoute`, and aborting just means the user moved on. */
async function withPage(chunk: RouteChunk<unknown>, data: Promise<void>): Promise<void> {
  const [code, first] = await Promise.allSettled([chunk.preload(), data]);
  if (first.status === 'rejected') throw first.reason;
  if (code.status === 'rejected') throw code.reason;
}

const javPage = routeChunk(() => import('../jav/jav-page'));
const statsPage = routeChunk(() => import('../stats/stats-page'));
const tastePage = routeChunk(() => import('../taste/taste-page'));
const reviewPage = routeChunk(() => import('../review/review-page'));
const dataCleanupPage = routeChunk(() => import('../data-cleanup/data-cleanup-page'));
const duplicatesPage = routeChunk(() => import('../duplicates/duplicates-page'));
const qualityGoalsPage = routeChunk(() => import('../quality-goals/quality-goals-page'));
const scrapingPage = routeChunk(() => import('../scraping/scraping-page'));
const configurationPage = routeChunk(async () => {
  const [{ ConfigurationPage }, { DiagnosticsPage }] = await Promise.all([
    import('../settings/configuration-page'), import('../diagnostics/diagnostics-page')]);
  return { ConfigurationPage, DiagnosticsPage };
});
const activityPage = routeChunk(() => import('../activity/activity-page'));
const followManagePage = routeChunk(() => import('../follow-manage/follow-manage-page'));
const playlistsPage = routeChunk(() => import('../playlists/playlists-page'));
const repairCenterPage = routeChunk(() => import('../settings/repair-center'));

/* Among the data management page's readout card destinations, only duplicate files is not looked up by its manage-area identity: it reports the data management identity. */
function openCleanupSection(section: DataCleanupSection, actions: ShellActions, go: (path: string) => void) {
  if (section === 'duplicates') { go('/duplicates'); return }
  const path = actions.managePath(section);
  if (isManagedPath(path)) go(path);
  else actions.openManage(section);
}

/* The first frame paints synchronously in the same task the host enters `#stats` (`router.tsx`'s `ManagedSurface`): right after the shell paints this page it reads the structure it painted
 * (the config page scrolls to `#peachProxy` from the address, and at that moment the selected tab is already "Network and access"). */
const configurationRoute = (path: ConfigurationPath): ManagedRoute<ManagedOpenProps['/settings/library']> => ({
  element: <ManagedMatch path={path} />,
  prefetch: (_open, signal) => {
    if (path === '/settings/diagnostics') void prefetchDiagnostics(signal).catch(() => {});
    return withPage(configurationPage, prefetchConfiguration(signal));
  },
  page: (open, actions) => {
    const { ConfigurationPage, DiagnosticsPage } = configurationPage.get();
    return <ConfigurationPage receipt={message => actions.receipt(message)}
      reopenTutorial={actions.reopenTutorial} section={path === '/settings/diagnostics' ? 'System diagnostics' : open.section ?? ''}
      diagnostics={<DiagnosticsPage openItem={actions.openItem} receipt={message => actions.receipt(message)} />} />;
  },
});

const cleanupRoutes = CLEANUP_TOOLS.reduce((routes, tool) => {
  routes[tool.path] = {
    element: <ManagedMatch path={tool.path} />,
    prefetch: (_open: Record<string, never>, signal: AbortSignal) =>
      withPage(dataCleanupPage, prefetchDataCleanupTool(tool.key, signal)),
    page: (_open: Record<string, never>, actions: ShellActions) => {
      const { DataCleanupToolPage } = dataCleanupPage.get();
      return <DataCleanupToolPage tool={tool.key} failure={actions.failure}
        toast={(message, { warning = false } = {}) => (
          warning ? actions.toast({ text: message }, { sound: 'warning' }) : actions.receipt(message))} />;
    },
  };
  return routes;
}, {} as Pick<ManagedRouteTable, CleanupToolPath>);

export const MANAGED_ROUTES: ManagedRouteTable = {
  ...cleanupRoutes,
  '/jav': {
    element: <ManagedMatch path="/jav" />,
    prefetch: (open, signal) => withPage(javPage, prefetchJav(open.tab, signal)),
    page: (open, actions) => {
      const { JavPage } = javPage.get();
      return <JavPage {...open} navigate={actions.navigate} receipt={message => actions.receipt(message)} />;
    },
  },
  '/stats': {
    element: <ManagedMatch path="/stats" />,
    prefetch: (_open, signal) => withPage(statsPage, prefetchStats(signal)),
    /* Clicking a content tag means 'back to the catalog, filtered by it'; swapping the whole page to the catalog still belongs to the shell. */
    page: (_open, actions) => {
      const { StatsPage } = statsPage.get();
      return <StatsPage tagLabel={tagLabel} onTag={actions.openTag} />;
    },
  },
  '/taste': {
    element: <ManagedMatch path="/taste" />,
    /* The first screen fetches the 'all time' dataset: the analysis window is component state, and every visit to this page starts from it. */
    prefetch: (_open, signal) => withPage(tastePage, prefetchTaste(DEFAULT_WINDOW, signal)),
    /* The next actions in the summary navigate by path (as given by `taste_history.py`); the ones missing from the route tree go to the shell's route table. */
    page: (open, actions, go) => {
      const { TastePage } = tastePage.get();
      return <TastePage onSignal={actions.openTasteSignal} navigate={go} toast={(message) => actions.receipt(message)}
        onboarding={open.onboarding} />;
    },
  },
  /* ADR-0018's decided items were already written to the database by the scan and profile processing jobs; the review page reads only the remaining judgment calls. */
  '/review': {
    element: <ManagedMatch path="/review" />,
    prefetch: (_open, signal) => withPage(reviewPage, prefetchReview(signal)),
    page: (open, actions) => {
      const { ReviewPage } = reviewPage.get();
      return <ReviewPage {...open} route={actions.routeReview} openItem={actions.openItem} openEntity={actions.openEntity}
        revealSource={actions.revealSource} toast={(message) => actions.receipt(message)} />;
    },
  },
  /* The home page only expands the daily scan; maintenance tools each pre-fetch their own second-level page data. */
  '/data-cleanup': {
    element: <ManagedMatch path="/data-cleanup" />,
    prefetch: (_open, signal) => withPage(dataCleanupPage, prefetchDataCleanup(signal)),
    page: (_open, actions, go) => {
      const { DataCleanupPage } = dataCleanupPage.get();
      return <DataCleanupPage navigate={go} failure={actions.failure} open={(section) => openCleanupSection(section, actions, go)}
        toast={(message, { warning = false } = {}) => (
          warning ? actions.toast({ text: message }, { sound: 'warning' }) : actions.receipt(message))} />;
    },
  },
  '/duplicates': {
    element: <ManagedMatch path="/duplicates" />,
    prefetch: (_open, signal) => withPage(duplicatesPage, prefetchDuplicates(signal)),
    page: (_open, actions) => {
      const { DuplicatesPage } = duplicatesPage.get();
      return <DuplicatesPage openItem={actions.openItem} failure={actions.failure}
        toast={(message, { undo } = {}) => actions.receipt(message, undo ? { undo } : {})} />;
    },
  },
  '/quality-goals': {
    element: <ManagedMatch path="/quality-goals" />,
    prefetch: (_open, signal) => withPage(qualityGoalsPage, prefetchQualityGoals(signal)),
    page: (_open, actions) => {
      const { QualityGoalsPage } = qualityGoalsPage.get();
      return <QualityGoalsPage openItem={actions.openItem} javTitleHtml={javTitleHtml} javDisplayName={javDisplayName}
        toast={(message) => actions.receipt(message)} srcBadge={actions.srcBadge} />;
    },
  },
  '/sources': {
    element: <ManagedMatch path="/sources" />,
    prefetch: (_open, signal) => withPage(scrapingPage, prefetchScraping(signal)),
    page: (_open, actions) => {
      const { ScrapingPage } = scrapingPage.get();
      return <ScrapingPage toast={(message) => actions.toast(message)} />;
    },
  },
  '/settings/library': configurationRoute('/settings/library'),
  '/settings/subscriptions': configurationRoute('/settings/subscriptions'),
  '/settings/downloads': configurationRoute('/settings/downloads'),
  '/settings/network': configurationRoute('/settings/network'),
  '/settings/maintenance': configurationRoute('/settings/maintenance'),
  '/settings/diagnostics': configurationRoute('/settings/diagnostics'),
  /* 「应用与维护」之下的子页，不在配置页签里：页头画面包屑回到「应用与维护」；首屏数据随路由预取，等待时画路由骨架。 */
  '/settings/maintenance/repairs': {
    element: <ManagedMatch path="/settings/maintenance/repairs" />,
    prefetch: (_open, signal) => withPage(repairCenterPage, prefetchRepairs(signal)),
    page: () => {
      const { RepairCenterPage } = repairCenterPage.get();
      return <RepairCenterPage />;
    },
  },
  '/tasks': {
    element: <ManagedMatch path="/tasks" />,
    prefetch: (_open, signal) => withPage(activityPage, prefetchTasks(signal)),
    page: () => {
      const { ActivityPage } = activityPage.get();
      return <ActivityPage />;
    },
  },
  /* The first screen fetches only the source list and credential status, plus feeds when the URL points at "Feeds". Snapshots of the update-check and lookup background
     tasks are not in the first screen: they sit on the previous run's receipt all the time, and waiting for them would only add a round trip. */
  '/subscriptions': {
    element: <ManagedMatch path="/subscriptions" />,
    prefetch: (_open, signal) => withPage(followManagePage, prefetchFollowManage(signal)),
    page: (open, actions) => {
      const { FollowManagePage } = followManagePage.get();
      return <FollowManagePage {...open} route={actions.routeFollowManage} savePreference={actions.saveFollowPreference}
        toast={(message) => actions.receipt(message)} openFollow={actions.openFollow} />;
    },
  },
};

/** The criterion for navigation between managed-area pages: only exact paths from `MANAGED_ROUTES` count. Index pages do not: their search changes are claimed by the shell,
 *  and crossing into them is also the shell writing the URL and opening them itself. */
export const isManagedPath = (path: string): path is ManagedPath => Object.hasOwn(MANAGED_ROUTES, path);

/** Legacy direct addresses: the page group mounts elements by match, the elements rewrite the address onto another page and render nothing themselves. */
export const REDIRECT_ROUTES: Readonly<Record<string, { element: ReactElement }>> = {
  '/resource-sync': { element: <ResourceSyncRedirect /> },
};

/** Immersive mode: the page group mounts the element on match (`pages/immerse.tsx`), and the element hands the shell the open of the resident component `immerse`, drawing nothing itself. */
export const IMMERSE_ROUTES: Readonly<Record<string, { element: ReactElement }>> = {
  '/immerse': { element: <ImmerseMatch /> },
};

/* Both pages are opened by their elements on match (`pages/follow.tsx`). Playlists page: the first screen refetches from the
   server every time (a Mix just saved on home must be visible on arrival). While on the page, when the shell asks for a
   reread the element pushes a new `revision` via `updateManagedRoute`, and the page only refetches without remounting.
   Opening one into the stage, the paging threshold and receipts belong to the shell.
   Follows page: the first screen is the list's first page and credentials in parallel, final on mount; later filter changes,
   Shuffle, selection mode and photo layout are pushed in by the shell via `updateManagedRoute`, and the page refetches only
   the list per the new key without remounting. */
export const BROWSE_ROUTES: BrowseRouteTable = {
  '/playlists': {
    element: <PlaylistsMatch />,
    prefetch: (_open, signal) => withPage(playlistsPage, prefetchPlaylists(signal)),
    page: (open, actions) => {
      const { PlaylistsPage } = playlistsPage.get();
      return <PlaylistsPage revision={open.revision} openPlaylist={actions.openPlaylist} openEntity={actions.openEntity}
        canFlip={actions.canFlip} toast={(message, { undo } = {}) => actions.receipt(message, undo ? { undo } : {})} />;
    },
  },
  '/follow': {
    element: <FollowMatch />,
    prefetch: (open, signal) => prefetchFollowFeed(open, signal),
    page: (open) => <FollowFeedPage {...open} />,
  },
};
const isBrowsePath = (path: string): path is BrowseRoutePath => Object.hasOwn(BROWSE_ROUTES, path);

/* Index page: the address bar's four items are read from the address by the element and handed in with this open; in-page state changes go through `routeIndex` where the shell writes the address and claims it,
   without remounting (back/forward to another search copy of the same page takes a new page-open epoch, and the element reopens once by address). The first screen fetches only the first page. */
const indexRoute: ManagedRoute<IndexOpenProps> = {
  element: <IndexMatch />,
  prefetch: (open, signal) => prefetchIndex(open, signal),
  page: (open, actions) => (
    <IndexPage {...open} route={actions.routeIndex} savePreference={actions.savePeopleLayout}
      exitSelectMode={actions.exitSelectMode} personAvatar={actions.personAvatar} authorAvatar={actions.authorAvatar}
      tagLabel={tagLabel} openEntity={actions.openEntity} showTags={actions.showIndexTags}
      openFollowAuthor={actions.openFollowAuthor} openFollowTag={actions.openFollowTag} />
  ),
};
export const INDEX_ROUTES: IndexRouteTable = {
  '/performers': indexRoute, '/creators': indexRoute, '/studios': indexRoute, '/agencies': indexRoute, '/tags': indexRoute,
  '/series': indexRoute,
};

/* 资料页：资料卡、筛选浮层、新作那一行与正文是同一页的四块。框架由元素排好（`openManagedRoute` 的
   `place`），页面画进资料卡那一格，再经 portal 画进另外三块。身份资料先显示，作品、照片与新作各自加载；
   换头像的候选不在首屏里，资料页每进一次就打一遍图库的话，多数时候没人
   点开它。壳交进来的筛选、视图与展示设置之后经 `updateManagedRoute` 推进来，页面按新键重取、不重挂。卡片与
   遗留层拼的 HTML（头像、新作那一行、源文件键）都是壳的那一份，跟着打开走。 */
const entityRoute: ManagedRoute<EntityPageProps> = {
  element: <EntityMatch />,
  prefetch: (open) => prefetchEntityPage(open),
  page: (open) => <EntityPage {...open} />,
};
export const ENTITY_ROUTES: EntityRouteTable = {
  '/performers/*': entityRoute, '/studios/*': entityRoute, '/creators/*': entityRoute, '/series/*': entityRoute,
  '/agencies/*': entityRoute, '/tags/*': entityRoute,
};

/* 画进 `#grid` 的两页。目录网格：首页、四个筛选态里除垃圾文件外的三个，和回收站，画的都是这一张网格，
   筛选是壳那一份 `state`；垃圾队列：垃圾文件那一屏，分类与视图只从地址读。表按页面分键：壳用 `/` 打开
   网格、用 `/junk-files` 打开队列，槽里记的路径说的是画着哪一页、不是地址。按地址分键会在三处出错：网格在
   `/trash` 打开之后去 `/` 是就地推，槽里的路径不跟着变；`?state=ads` 落在 `/` 上，画的是垃圾队列；冷启动
   落在详情地址上时，网格在 `/assets/:id` 底下补画。
   目录网格在打开前取第一页，壳铺的骨架一直留到数据到，挂上就是卡片：先挂再取的话，岛挂得晚于骨架显示
   门槛时，壳那份骨架会再淡出换成岛自己的一份。队列不在打开前等，画上即取数并显示自己的骨架。之后换
   筛选或分类、换版式、选择模式与刷新代次都由壳经 `updateManagedRoute` 推进来，页面按新键重取、自己铺
   骨架，不重挂。 */
export const CATALOG_ROUTES: CatalogRouteTable = {
  '/': {
    element: <CatalogMatch />,
    prefetch: (open, signal) => prefetchCatalogGrid(open, catalogView(), signal),
    page: (open) => <CatalogGridPage {...open} />,
  },
  '/junk-files': {
    element: <CatalogMatch />,
    prefetch: async () => {},
    page: (open) => <JunkQueuePage {...open} />,
  },
};
const isCatalogPage = (path: string): path is CatalogPagePath => Object.hasOwn(CATALOG_ROUTES, path);

/* Scan and scrape provides both the data management card and a compact task panel. The two read the same
 * `queryKey`, so when mounted together they see the same snapshot and Query sends only one poll. */
const LibraryProcessing = (props: LibraryProcessingProps) => (
  props.mode === 'notice' ? <LibraryProcessingNotice {...props} /> : <LibraryProcessingCard {...props} />
);

/* 页面里的页面内组件，按名字登记：壳每次打开交进来整份 props，之后经 `updateManagedRoute` 推补丁，页面就地
   重渲染。首页筛选条与搜索下拉不在打开前等数据（筛选条的读数与头像由壳推进来，搜索下拉的记录与推荐聚焦
   时才取）；首页新作条目先显示，封面各自加载；任务面先取一份进度快照。 */
export const SURFACE_ROUTES: SurfaceRouteTable = {
  'catalog-filter': {
    prefetch: async () => {},
    page: (open) => <CatalogFilterPage {...open} />,
  },
  'feed-new': {
    prefetch: (open) => prefetchFeedNew(open),
    page: (open) => <FeedNewPage {...open} />,
  },
  'library-processing': {
    prefetch: (_open, signal) => prefetchLibraryProcessing(signal),
    page: (open) => <LibraryProcessing {...open} />,
  },
  /* The input box belongs to the shell; the dropdown only hooks its events and draws the dropdown's contents. */
  search: {
    prefetch: async () => {},
    page: (open) => <SearchPage {...open} />,
  },
};
const isSurfaceName = (key: string): key is SurfaceName => Object.hasOwn(SURFACE_ROUTES, key);

/* Resident components, registered by name: the shell opens each once via `openResidentSurface` at startup, always counting as
   the current page, with no first-screen fetch, the host being the shell's node. Never torn down; only an error boundary
   unmounts their component while the host stays in the document. Opening carries no props: the shell pushes content through
   the imperative handle, the component subscribes to its own module's store, and the handle's renders complete synchronously.
   The management header and sidebar's hosts already hold the shell's startup skeleton, cleared by `place` in the same task as
   the first frame on open; immersive and stage hosts are not in the shell's pages, are created on first open, and are mounted
   at the end of body by `place` in the same task as the first frame (immersive's hidden outer frame, stage's mini player
   node); the settings panel's host exists only on first open, placed at the end of body by `place` in the same task. */
export const RESIDENT_ROUTES: ResidentRouteTable = {
  'batch-dock': {
    prefetch: async () => {},
    page: () => <BatchDockSurface />,
  },
  'glow-picker': {
    prefetch: async () => {},
    page: () => <GlowPickerSurface />,
  },
  'manage-header': {
    prefetch: async () => {},
    page: () => <ManageHeaderSurface />,
  },
  immerse: {
    prefetch: async () => {},
    page: () => <ImmerseSurface />,
  },
  'settings-panel': {
    prefetch: async () => {},
    page: () => <SettingsPanelSurface />,
  },
  sidebar: {
    prefetch: async () => {},
    page: () => <SidebarSurface />,
  },
  stage: {
    prefetch: async () => {},
    page: () => <StageSurface />,
  },
};
const isResidentName = (key: string): key is ResidentName => Object.hasOwn(RESIDENT_ROUTES, key);
/** Paths the address may land on while the two `#grid` pages are drawn: home, the three filter states, trash, and junk files. Only goes into the `<Routes>` declaration,
 *  not used as a slot key. */
export const CATALOG_PATHS = ['/', '/wall', '/unseen', '/watch-later', '/flagged', '/trash', '/junk-files'] as const;

/** The paths declared in `<Routes>`: the keys of the first four tables, plus the paths the URL can land on while the two `#grid` pages render. */
export const ROUTED_PATHS: readonly string[] = [
  ...Object.keys(MANAGED_ROUTES), ...Object.keys(BROWSE_ROUTES), ...Object.keys(INDEX_ROUTES),
  ...Object.keys(ENTITY_ROUTES), ...CATALOG_PATHS,
];
/** Can the route tree render this page: first-screen fetch and page paint look up by the registration key recorded in the slot; the two `#grid` pages accept only page keys, while in-page and resident components accept only names. */
export const isRoutedPath = (path: string): path is RoutedPath => (
  isManagedPath(path) || isBrowsePath(path) || Object.hasOwn(INDEX_ROUTES, path) || Object.hasOwn(ENTITY_ROUTES, path)
  || isCatalogPage(path) || isSurfaceName(path) || isResidentName(path));

function routeOf(path: RoutedPath): ManagedRoute<object> {
  if (isManagedPath(path)) return MANAGED_ROUTES[path] as ManagedRoute<object>;
  if (isBrowsePath(path)) return BROWSE_ROUTES[path] as ManagedRoute<object>;
  if (isCatalogPage(path)) return CATALOG_ROUTES[path] as ManagedRoute<object>;
  if (isSurfaceName(path)) return SURFACE_ROUTES[path] as ManagedRoute<object>;
  if (isResidentName(path)) return RESIDENT_ROUTES[path] as ManagedRoute<object>;
  if (Object.hasOwn(INDEX_ROUTES, path)) return INDEX_ROUTES[path as IndexRoutePath] as ManagedRoute<object>;
  return ENTITY_ROUTES[path as EntityRoutePath] as ManagedRoute<object>;
}

/** First-screen fetch (`openManagedRoute` calls it through `connectManagedRoutes`). */
export function prefetchManagedRoute(path: string, open: object, signal: AbortSignal): Promise<void> {
  if (!isRoutedPath(path)) return Promise.reject(new Error(`No page in the route tree for ${path}`));
  return routeOf(path).prefetch(open, signal);
}

/** Render this page. */
export function managedPage(path: RoutedPath, open: object, actions: ShellActions, go: (path: string) => void) {
  return routeOf(path).page(open, actions, go);
}
