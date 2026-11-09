/* composition domain controller: this domain's state and actions, installed at startup by Application's lifecycle. */
import { loadingState, renderInitialSurfaceLoading } from './loading.js';
import { clearHomeFeed, feedState, installEntityShapeBootstrap, isFeedNewPath, loadEntityShapes, prepareHomeFeed } from './feed.js';
import { buildManageBar, closeStats, enterManagementSurface, loadSyncedSettings, mountManageHeader, mountSidebar, openManage, openSettings, paintCatalogPageTitle, paintListTitle, scheduleStickySurfaces, showHomeSurfaces, showManagementBody, syncHeaderActions } from './layout.js';
import { disposeStage, mediaState, openItem, openJavMovie, openPlaylist, openQueue, openTok } from './media.js';
import { currentBarsContext, entityState, openEntity, revealForIsland, routeEntityPage, showEntityMissing } from './entity.js';
import { applyFilterStateInPlace, buildBars, catalogState, clearCatalogGrid, gridTaken, loadCatalog, onlineDefaultLoc, paintCatalogGrid, refreshFacetCounts, syncCatalogFilterScreen, toggleTag } from './catalog.js';
import { openTasteSignal, routeReview } from './playlists.js';
import { navigationState, requestOverlay, syncNavigation, syncRouteChrome } from './navigation.js';
import { enterFollow, followState, openFollowDetail } from './follow.js';
import { receiptsState } from './receipts.js';
import { reopenPostSetupTutorial } from './tutorial.js';
import { runtimeConfigurable, selectMode, state, writeShell } from './../shell/index';
import { indexPath, indexState, onlineAuthorRingHtml, openFollowAuthorFromIndex, openFollowTagFromIndex, routeFollowManage, showIndexContainer, showIndexTags } from './index.js';
import { censorOn, loadSourceStatus, preferencesState, wireAllDrag } from './preferences.js';
import { mountBatchDock, setSelectMode } from './selection.js';
import { releaseHoverPreviews } from './../card-art/hover';
import { bootEntry, peachHistory } from './../history/index';
import { $ } from '../core';
import { dropBars } from './../catalog-bars';
import { isOverlayPath, overlayTarget } from './../history/overlay';
import { navigationLinkPath } from './../history/links';
import { scrollToAnchor } from '../ui-kit/anchor-scroll';
import { loadRouter, settingsPanelApi } from '../react/application-residents';
import { applicationEffects } from './effects';
export const compositionState = { shellActions: undefined, routing: undefined };



export function installComposition24() {
const effects=applicationEffects;
const openOverlayTarget=target=>{
  if(target.kind==='item')void openItem(target.id,false);
  else if(target.kind==='jav')void openJavMovie(target.code,false);
  else if(target.kind==='follow')void openFollowDetail(target.id,false);
  else void openQueue(target.queue,target.key,target.item,false);
};
installEntityShapeBootstrap();
loadingState.entityShapesReady=loadEntityShapes();
renderInitialSurfaceLoading();
/* The home page title appears together with the first-screen skeleton: showing it only after the route opens the catalog would push the whole skeleton page down one jump. Other state pages' titles are still set by `paintListTitle`. */
if(location.pathname==='/'){
  const query=new URLSearchParams(location.search);
  if(!query.has('state')&&query.get('jav')!=='1'){
    $('#catalogPageHeading').hidden=false;paintCatalogPageTitle($('#catalogPageHeading'),query.get('q'));
  }
}
/* The new releases row lays its skeleton together with the first screen based on the conclusion remembered on this machine, the same for both card and list display modes. */
if(isFeedNewPath(decodeURIComponent(location.pathname)))prepareHomeFeed($('#feedNew'));
mountSidebar();
compositionState.shellActions = {
  openSettings:section=>openSettings(section,true),
  closeSettings:()=>settingsPanelApi()?.close(false),
  openItem:id=>void openItem(id),
  openEntity:(kind,name)=>void openEntity(kind,name),
  /* Tapping a content tag means "back to the catalog filtered by it": the full-page swap to the catalog stays with the shell, and the page only reports which key was tapped. */
  openTag:key=>{closeStats();toggleTag(key)},
  openTasteSignal,
  navigate:path=>{
    const url=new URL(path,location.href),target=overlayTarget(url.pathname,url.search);
    if(target){
      const kind=target.kind==='queue'?'item':target.kind;
      requestOverlay(url.pathname+url.search+url.hash,kind,()=>openOverlayTarget(target));
    }else if(url.hash&&url.pathname===location.pathname&&url.search===location.search&&!isOverlayPath(location.pathname)){
      navigationState.route(path);
      const seq=peachHistory.navigation.seq;
      void scrollToAnchor(url.hash,()=>peachHistory.navigation.seq===seq);
    }else navigationState.navigatePath(path);
  },
  openManage,
  managePath:section=>navigationState.routePathOf('section',section)||'',
  openFollow:()=>enterFollow(),
  receipt:(message,options)=>receiptsState.actionReceipt(message,options),
  toast:(message,options)=>receiptsState.toast(message,options),
  failure:receiptsState.actionFailure,
  revealSource:revealForIsland,
  reopenTutorial:reopenPostSetupTutorial,
  routeReview,
  routeFollowManage,
  saveFollowPreference:patch=>{
    if(patch.pageSize!==undefined)preferencesState.appSettings.followPageSize=patch.pageSize;
    if(patch.layout!==undefined)preferencesState.appSettings.followLayout=patch.layout;
    preferencesState.saveSettings();
  },
  srcBadge:(location,cost)=>preferencesState.srcBadge(location,cost),
  /* Index page: a same-page search change is claimed by the shell and does not remount; going back or forward to a different search reopens the route tree's index element by URL. */
  routeIndex:(next,{replace=false}={})=>navigationState.route(indexPath(next),replace),
  savePeopleLayout:({layout})=>{preferencesState.appSettings.peopleLayout=layout;preferencesState.saveSettings()},
  exitSelectMode:()=>setSelectMode(false,false),
  personAvatar:(item,entityKind,big)=>indexState.personAvatar(item,entityKind,big),
  authorAvatar:author=>onlineAuthorRingHtml(author),
  showIndexTags,
  openFollowAuthor:openFollowAuthorFromIndex,
  openFollowTag:openFollowTagFromIndex,
  openPlaylist:(id,resume)=>void openPlaylist(id,resume,true),
  canFlip:()=>!selectMode&&!censorOn()&&!window.__scrolling&&!catalogState.reduceMotion(),
  /* Fires once when the page element mounts, before fetching starts: collapse the face the previous page left behind, then lay out this page's side. */
  surfaceChanged:(kind,path)=>{
    /* Both the index page and the profile page render into `#index`. `showHomeSurfaces` clears `index-open`/`entity-open` and restores the top bar,
       so these two classes must be added after it. The profile page's context is derived from the page being rendered (`currentBarsContext`); the variable only records the home copy. */
    if(kind==='entity'){
      releaseHoverPreviews();writeShell({barsContext:{type:'home',filters:state}});showHomeSurfaces();
      document.body.classList.add('entity-open');syncCatalogFilterScreen();showIndexContainer();return;
    }
    if(kind==='index'){
      releaseHoverPreviews();document.body.classList.remove('entity-open');navigationState.claimSurface(path);showHomeSurfaces();
      document.body.classList.add('index-open');syncCatalogFilterScreen();showIndexContainer();return;
    }
    releaseHoverPreviews();navigationState.claimSurface(path);
    if(kind==='catalog'){showHomeSurfaces();return}
    enterManagementSurface();showManagementBody({manage:kind==='management'});
  },
  clearSearch:()=>catalogState.clearSearchField(),
  openImmerse:id=>{
    const start=mediaState.requestedImmerseId===undefined?id:mediaState.requestedImmerseId;
    mediaState.requestedImmerseId=undefined;void openTok(start,false);
  },
  openQueueRequest:()=>{
    const open=navigationState.requestedQueue;navigationState.requestedQueue=null;
    if(open)void open();
  },
  /* The route the override address should open (video details, follow details, the four queues); the address bar is already on it. */
  openOverlay:target=>{
    const requested=navigationState.requestedOverlay;
    navigationState.requestedOverlay=null;
    if(peachHistory.navigation.claimed&&(!bootEntry()||navigationState.initialOverlayOpened)){
      if(requested?.path===location.pathname+location.search+location.hash)void requested.open();
      return;
    }
    if(bootEntry())navigationState.initialOverlayOpened=true;
    openOverlayTarget(target);
  },
  closeStage:()=>{if(mediaState.stageOpen())disposeStage(false)},
  grid:{helpers:catalogState.gridHelpers,actions:catalogState.gridActions},

  // Used by the index page and profile page elements.
  configurable:()=>!!runtimeConfigurable,
  /* 整页画上之后：索引页重读侧栏按下态、重排吸顶；资料页重拉侧栏与顶部横条，按取到的名字重写标题（按 ID 直达时导航那一刻还不知道名字）。 */
  surfaceShown:kind=>{if(kind==='index'){syncNavigation();scheduleStickySurfaces()}else{buildBars();loadingState.syncPageTitle(location.href)}},
  entity:{
    missing:kind=>{compositionState.shellActions.surfaceChanged('entity',location.pathname);showEntityMissing(kind)},
    /* The roster starts fetching at startup; on a deep link straight to the profile page it may still be in flight, so wait briefly before drawing the skeleton and it comes out in its final shape. If it does not
       arrive in time, draw anyway and patch in those two blocks once the roster lands. The roster refetches on every page turn, so the next page uses the server's current state. */
    loading:(kind,name,current)=>entityState.application.loading(kind,name,current),
    props:(kind,name,search)=>{
      writeShell({entityJavLayout:['performer','studio'].includes(kind)&&feedState.hasEntityPart(kind,name,'jav')});
      return entityState.application.addressProps(kind,name,search);
    },
    /* Back and forward land on another filter set for the same position: while this page is still rendered, just push the new filters from the address over. */
    refresh:(kind,name,search)=>{
      const filters=entityState.parseEntityFilters(search);if(kind==='creator')filters.creator='';
      const shown=currentBarsContext();
      if(shown.type!=='entity'||shown.kind!==kind||shown.name!==name)return false;
      if(!routeEntityPage(kind,name,filters,entityState.parseMediaView(search),{push:false}))return false;
      applyFilterStateInPlace(filters);refreshFacetCounts(currentBarsContext());return true;
    },
  },

  // Used by follows and playlists.
  follow:followState.followFeedShell,

  // Used by the catalog.
  catalog:{
    /* Defaults when the address names no source: local plus 115, with the offline entry dropped. */
    defaultLoc:()=>onlineDefaultLoc('local,115'),
    /* Whole-page open: filters have already been written into `state` by the catalog element from the address. `retitle` is the home `?state=ads` rewrite into the junk files address;
       once the rewrite is claimed, title, sidebar, and tutorial state are filled in here; `entering` is returning home from elsewhere, invalidating the top three layers' cache.
       Trash clears the search box; other pages put the address's search term back into the box. */
    open:(path,{entering=false,retitle=false}={})=>{
      if(retitle){syncRouteChrome();syncHeaderActions();paintListTitle()}
      if(entering)dropBars();
      if(path==='/trash'){catalogState.clearSearchField()}
      else{$('#q').value=state.q;catalogState.rememberSearchValue()}
      syncNavigation();buildBars();return preferencesState.handOff(loadCatalog());
    },
    /* The shell claimed it and wrote the address, filters are already in `state`: just refetch. */
    load:()=>preferencesState.handOff(loadCatalog()),
    /* Video and queue addresses without a background (deep links, refresh): the list under details has sent no request at all, so
       backfill one, rather than leaving a skeleton that says loading with no request running. It mounts the grid directly via
       `paintCatalogGrid`: `loadCatalog` starts with `disposeStage()`, which would tear down this screen's details too. Once the
       grid is mounted (even still fetching its first page) it does not backfill again; when this is not the startup entry it
       only takes over the existing skeleton. */
    fill:()=>{
      if(gridTaken())return;
      if(!bootEntry()&&!$('#grid').querySelector('.catalog-skeleton'))return;
      const count=$('#count');count.removeAttribute('aria-busy');count.removeAttribute('aria-label');
      void paintCatalogGrid(navigationState.surfaceToken(navigationState.surfacePath()));
    },
    /* Leaving catalog: collapse the grid and the home new releases row. */
    release:()=>{clearCatalogGrid();clearHomeFeed()},
  },
};
compositionState.routing = false;
effects.listen(document,'click',event=>{
  const path=navigationLinkPath(event);
  if(!path)return;
  event.preventDefault();compositionState.shellActions.navigate(path);
});
applicationEffects.own(peachHistory.listen(navigation=>{
  /* Until everything lands, the URL still sits on the source page: any non-overlay history change (including a same-URL POP) rewinds this run, and late packets or responses can no longer open the stage. */
  if(navigationState.queueOpenRequest&&navigation.seq!==navigationState.queueOpenRequest.seq&&!isOverlayPath(navigation.location.pathname))disposeStage(false);
  // Inside the history notification, sync the page epoch first; the route element's microtask then claims the fetch epoch.
  if(compositionState.routing&&!navigation.claimed)syncRouteChrome();
}));
loadRouter(compositionState.shellActions).catch(error=>console.error('Client-side navigation failed to load',error));
mountManageHeader();
mountBatchDock();
buildManageBar();
Promise.all([loadSourceStatus(),loadSyncedSettings()])
  .then(()=>{
    if(!effects.isActive)return;
    /* The two aggregates for the top rows and the filter bar bring their own skeletons and settle into place on arrival, so the page opens without waiting for them: the video list fetches at the same time as they do. */
    if(loadingState.wantsDiscoveryBars())buildBars().catch(error=>console.error('Home\'s strip failed to load',error));
    syncNavigation();wireAllDrag();
    // Pages opened by match in the route tree only start opening at this moment: the shell's state is only complete by then.
    compositionState.routing=true;writeShell({pageOpens:1});syncRouteChrome();
    scheduleStickySurfaces();
  }).catch(error=>{if(effects.isActive)console.error('App failed to start',error)});
}
