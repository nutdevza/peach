/* navigation domain controller: this domain's state and actions; startup installs them together through Application's lifecycle. */
import { ROUTE_META, routeMetaOf } from './../history/route-meta';
import { $, isCatalogPath } from '../core';
import { clearOverlayBackground, holdOverlayBackground, isOverlayPath, overlayState } from './../history/overlay';
import { openTok } from './media.js';
import { immerseStartId } from './preferences.js';
import { enterFollow } from './follow.js';
import { setSelectMode } from './selection.js';
import { followManageEntry, indexPath } from './index.js';
import { sidebarApi } from '../react/application-residents';
import { layoutState, navOn, paintListTitle, syncHeaderActions } from './layout.js';
import { clearHomeFeed, isFeedNewPath } from './feed.js';
import { releaseManagedRoute } from './../history/managed';
import { catalogState, clearCatalogGrid } from './catalog.js';
import { peachHistory, shellNavigate } from './../history/index';
import { loadingState } from './loading.js';
import { pageOpens, writeShell } from './../shell/index';
export const navigationState = { routeMeta: undefined, routePathOf: undefined, catalogPage: undefined, managedPagePath: undefined, openRoutePath: undefined, surfaceEpoch: undefined, surfacePath: undefined, surfaceRequests: undefined, surfaceToken: undefined, surfaceCurrent: undefined, claimSurface: undefined, route: undefined, navigatePath: undefined, requestedOverlay: undefined, requestedQueue: undefined, queueOpenRequest: undefined, initialOverlayOpened: undefined };

export function paintNav(){
  const sidebar=sidebarApi();
  if(sidebar){sidebar.navChanged();return}
  $('#drawerScroll')?.querySelectorAll('[data-nav]')
    .forEach(b=>b.setAttribute('aria-pressed',String(navOn(b.dataset.nav))));
}

export function paintSidebar(patch={}){
  const surface=navigationState.surfacePath();
  if(surface!==layoutState.sidebarSurface){layoutState.sidebarSurface=surface;layoutState.sidebarProps={...layoutState.sidebarProps,content:null,latest:null}}
  layoutState.sidebarProps={...layoutState.sidebarProps,...patch};
  sidebarApi()?.render(layoutState.sidebarProps);
}

export function syncNavigation(){paintSidebar();paintNav();syncHeaderActions()}

export function cancelQueueRequest(){
  if(navigationState.queueOpenRequest)navigationState.queueOpenRequest.cancelled=true;
  navigationState.queueOpenRequest=null;navigationState.requestedQueue=null;
  writeShell({pendingQueueRoute:null});
}

export function requestOverlay(path,kind,open){
  cancelQueueRequest();
  holdOverlayBackground();
  navigationState.requestedOverlay={path,open};
  navigationState.route(path,false,overlayState(kind));
}

export function syncRouteChrome(){
  navigationState.surfaceEpoch++;
  catalogState.barsRequestSeq++;
  loadingState.syncPageTitle(location.href);
  paintSidebar();
  clearOverlayBackground();
}

export function openRoutedPage(path){
  navigationState.route(path);writeShell({pageOpens:pageOpens+1});
}

export function installNavigation2() {
navigationState.routeMeta = path=>{const meta=routeMetaOf(path);return meta?{route:meta}:null};
navigationState.routePathOf = (key,value)=>Object.keys(ROUTE_META).find(path=>ROUTE_META[path][key]===value);
navigationState.catalogPage = path=>isCatalogPath(path)||path==='/trash';
navigationState.managedPagePath = path=>{
  const meta=routeMetaOf(path);
  return !!meta&&meta.reload!=='reopen'&&!navigationState.catalogPage(path)&&!isOverlayPath(path)&&path!=='/immerse';
};
navigationState.openRoutePath = path=>{
  if(path==='/immerse'){void openTok(immerseStartId());return}
  if(path==='/follow'){enterFollow();return}
  if(path==='/playlists'||navigationState.catalogPage(path)){openRoutedPage(path);return}
  if(!navigationState.managedPagePath(path)){
    setSelectMode(false,true);
    openRoutedPage(indexPath({kind:path.slice(1),q:'',scope:'local',view:'alphabet',category:'all'}));
    return;
  }
  navigationState.navigatePath(path==='/subscriptions'?followManageEntry():path);
};
}

export function installNavigation4() {
navigationState.surfaceEpoch = 0;
navigationState.surfacePath = ()=>decodeURIComponent(location.pathname);
navigationState.surfaceRequests = null;
navigationState.surfaceToken = path=>({epoch:navigationState.surfaceEpoch,path,signal:navigationState.surfaceRequests?.signal});
navigationState.surfaceCurrent = token=>token.epoch===navigationState.surfaceEpoch&&navigationState.surfacePath()===token.path;
navigationState.claimSurface = path=>{
  /* That banner speaks of the fate of the library's background run, regardless of which list is being viewed. It unmounts and remounts on every fetch,
     so changing one filter makes it collapse and re-expand; measured, the block underneath first jumps up 62px,
     then settles back about twenty milliseconds later, far more noticeable than the sentence it is trying to say. It stays up across catalog pages, polling
     library progress on its own; it only retracts when leaving the catalog, since those pages should never have it. */
  /* The home page's new releases row likewise belongs to the catalog page only. The managed area's entry does not pass through `showHomeSurfaces`; leaving the catalog page
     collapses and clears it here, stopping its auto-scroll along with it. */
  if(!isFeedNewPath(path))clearHomeFeed();
  /* The management body's and the index and profile pages' containers pass through here on every page change, so teardown
     lands here too. The pages the route tree renders into `#stats` and `#index` (`openManagedRoute`) manage their own
     fetching: without tearing them down, pages stay alive after leaving, and ones with polling keep hitting the library on
     their original cadence. Containers with no rendered page are a no-op, and judging page by page would instead miss newly
     migrated pages. While the details stage stacks over them this is not consulted, and the pages stay. `#grid` is not in
     this group; its containers are named one by one. */
  releaseManagedRoute($('#stats'),$('#index'));
  /* The catalog grid does not tear down on page changes: it keeps rendering between the catalog page and trash, and a filter change only swaps the query; only leaving for other pages
     tears it down via `clearCatalogGrid`, since those pages then write their own content into `#grid`. */
  if(!isCatalogPath(path)&&path!=='/trash')clearCatalogGrid();
  navigationState.surfaceRequests?.abort();
  navigationState.surfaceRequests=new AbortController();
  navigationState.surfaceEpoch++;return navigationState.surfaceToken(path)};
navigationState.route = (path,replace=false,state)=>{
  navigationState.surfaceEpoch++;
  catalogState.barsRequestSeq++;
  shellNavigate(path,{replace,state});loadingState.syncPageTitle(path);
  queueMicrotask(()=>{syncHeaderActions();paintListTitle();paintSidebar()});
};
navigationState.navigatePath = (path,replace=false,state)=>{
  if(replace)peachHistory.replace(path,state);else peachHistory.push(path,state);
  queueMicrotask(()=>{syncHeaderActions();paintListTitle()});
};
navigationState.requestedOverlay = null;
navigationState.requestedQueue = null;
navigationState.queueOpenRequest = null;
navigationState.initialOverlayOpened = false;
}
