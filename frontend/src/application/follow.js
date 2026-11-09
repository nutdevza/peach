import { createFollowController } from '../react/follow-feed/follow-controller';
import { followViewPath as pathForFollow } from '../react/follow-feed/follow-view';
import { createFollowFeedHelpers } from '../react/follow-feed/follow-helpers';
import { createFollowDetailActions } from '../react/follow-detail/follow-detail-actions';
import { checkReceipt } from '../react/follow-manage/follow-manage';
import { followScrollY } from '../shell';
import { pageNavigationReady, rememberPageState } from '../history/page-navigation';
/* follow domain controller: this domain's state and actions; startup installs them together through Application's lifecycle. */
import { receiptsState } from './receipts.js';
import { managedEntry, releaseManagedRoute, updateManagedRoute } from './../history/managed';
import { $, entityPath } from '../core';
import { navigationState, openRoutedPage, requestOverlay } from './navigation.js';
import { entityState, syncPhotoWalls } from './entity.js';
import { followDetailReturnPath, followDiscoverySeed, followRevision, followSelected, pageOpens, selectMode, writeShell } from './../shell/index';
import { censorOn, preferencesState, wireDrag } from './preferences.js';
import { revealSkeleton, wireHorizontalScroller } from '../ui-kit';
import { followJobProgress } from './../jobs';
import { enterManagementSurface, renderFollowDrawer, scheduleStickySurfaces, showManagementBody } from './layout.js';
import { toggleFollowSelection } from './selection.js';
import { photoLayout, photoSize, storePhotoLayout } from './../appearance/layout';
import { catalogState } from './catalog.js';
import { releaseHoverPreviews } from './../card-art/hover';
import { loadStage, stageApi } from '../react/application-residents';
import { disposeStage, mediaState, stageExit, urlResume } from './media.js';
import { clearOverlayBackground, holdOverlayBackground, overlayState, takeOverlayReturn } from './../history/overlay';
import { presentPost } from '../history/page-title';
import { loadingState } from './loading.js';
export const followState = { followFilter: undefined, followAuthors: undefined, followProviders: undefined, followTags: undefined, followWorks: undefined, followMediaView: undefined, FOLLOW_FEED_SORTS: undefined, FOLLOW_RANDOM_SORT: undefined, followSort: undefined, followDir: undefined, followSeed: undefined, followDurMin: undefined, followDurMax: undefined, followContentSkeletonHtml: undefined, followSkeletonHtml: undefined, followFeedHelpers: undefined, followFeedActions: undefined, followFeedProps: undefined, followFeedShell: undefined, followDetailActions: undefined, FOLLOW_MANAGE_TABS: undefined, followSidebarFilters: undefined };

export function followCheckToast(report){
  const rows=report.results||[];
  const failed=rows.filter(r=>!r.ok).length;
  receiptsState.toast({text:checkReceipt(report)},
    {warn:!!failed,timeout:failed?8000:6000,sound:failed?'warning':'success',
     action:{label:'View',run:()=>enterFollow(true)}});
}

export function followViewPath(){return pathForFollow(followView())}

export function readFollowView(){return followState.controller.read()}

export function followView(){
  return {status:followState.followFilter,media:followState.followMediaView,author:[...followState.followAuthors][0]||'',
    provider:[...followState.followProviders][0]||'',work:[...followState.followWorks][0]||'',tags:[...followState.followTags],
    durMin:followState.followDurMin,durMax:followState.followDurMax,sort:followState.followSort,dir:followState.followDir,seed:followState.followSeed};
}

export function adoptFollowView(view){
  followState.followFilter=view.status;followState.followMediaView=view.media;
  followState.followAuthors=new Set(view.author?[view.author]:[]);
  followState.followProviders=new Set(view.provider?[view.provider]:[]);
  followState.followWorks=new Set(view.work?[view.work]:[]);
  followState.followTags=new Set(view.tags);
  followState.followDurMin=view.durMin||0;followState.followDurMax=view.durMax||0;
  followState.followSort=view.sort;followState.followDir=view.dir;followState.followSeed=view.seed;
}

export function followFeedEntry(){
  const entry=managedEntry($('#stats'));
  return entry&&entry.path==='/follow'&&entry.host.isConnected?entry:null;
}

export function followFeedLive(){return !!followFeedEntry()}

export function pushFollowFeed(patch){if(followFeedLive())updateManagedRoute($('#stats'),patch)}

export function routeFollowFeed(view,patch={}){return followState.controller.route(view,patch)}

export function shuffleFollowFeed(){followState.controller.shuffle()}

export function enterFollow(fresh=false){followState.controller.enter(fresh)}

export async function openFollowDetail(id,push=true,mediaIndex=null,preserveReturn=false){
  if(push){
    if(!location.pathname.startsWith('/posts/')&&!preserveReturn)writeShell({followDetailReturnPath:location.pathname+location.search});
    requestOverlay(`/posts/${+id}`,'follow',()=>openFollowDetail(id,false,mediaIndex,preserveReturn));
    return;
  }
  releaseHoverPreviews();
  id=+id;
  const entering=!location.pathname.startsWith('/posts/');
  if(push&&entering&&!preserveReturn)writeShell({followDetailReturnPath:location.pathname+location.search});
  /* Entering via back and forward uses the origin recorded on the entry (the filtered copy of the list); cold starts and entries without a recorded background return to `/follow`. */
  if(!push&&!preserveReturn)writeShell({followDetailReturnPath:takeOverlayReturn()||'/follow'});
  // The entry's background is tracked separately: coming from a list records that list page (with its filters), and switching entries within a group reuses the previous one.
  if(push)holdOverlayBackground();
  // Switching details does not enter the mini player; if the mini player holds another item it yields anyway (decided by the stage island), so two players never sound at once. While follow details are open, items swap in place.
  if(stageApi()?.showing()!=='follow')disposeStage(false,false,{miniplayer:false});
  if(push)navigationState.route(`/posts/${id}`,false,overlayState('follow'));
  const stage=await loadStage(mediaState.stageHost);
  await stage.open({kind:'follow',id,mediaIndex,mediaView:followState.followMediaView,
    relatedLimit:preferencesState.appSettings.relatedLimit>0?+preferencesState.appSettings.relatedLimit:0,
    helpers:followState.followFeedHelpers,actions:followState.followDetailActions,resume:push?null:urlResume()});
  scheduleStickySurfaces();
}

export async function closeFollowDetail(){
  await stageExit();
  disposeStage(false,false,{miniplayer:false});clearOverlayBackground();
  navigationState.route(followDetailReturnPath||'/follow');
  /* Entered from the profile page's online view: the profile page stays rendered underneath, and filters, the loaded pages, and the scroll position carry on as-is instead of starting over. */
  if(entityState.entityPageView&&entityState.entityPageCurrent()&&!$('#index').hidden)return;
  if(location.pathname!=='/follow'){writeShell({pageOpens:pageOpens+1});return}
  if(!followFeedLive()){writeShell({pageOpens:pageOpens+1});return}
  readFollowView();pushFollowFeed({view:followView()});
}

export function revealRoutedPage(container){
  const host=document.createElement('div');host.className='peach-react';
  revealSkeleton(container,()=>{container.textContent='';container.append(host)});
  return host;
}

export function installFollow15() {
followState.followFeedHelpers = createFollowFeedHelpers({wireDrag:row=>{if(row)wireDrag(row)},
    wireScroller:row=>{if(row)wireHorizontalScroller(row)},listSkeletonHtml:media=>followState.followContentSkeletonHtml(media),jobProgress:followJobProgress});
followState.followFeedActions = {
  loaded:drawer=>renderFollowDrawer(drawer),
  openDetail:id=>openFollowDetail(id),
  openAuthor:name=>navigationState.navigatePath(entityPath('creator',name)),
  toggleSelection:(id,range)=>toggleFollowSelection(id,range),
  setImagesOnly:on=>{preferencesState.appSettings.followImagesOnly=!!on;preferencesState.saveSettings();syncPhotoWalls()},
  setPhotoLayout:layout=>{storePhotoLayout(layout);syncPhotoWalls()},
  canFlip:()=>!selectMode&&!censorOn()&&!window.__scrolling&&!catalogState.reduceMotion(),
  toast:(message,{undo}={})=>receiptsState.actionReceipt(message,{undo}),
  failure:(action,error)=>receiptsState.actionFailure(action,error),
  checkReport:report=>followCheckToast(report),
};
followState.followFeedShell = {
  skeleton:()=>followState.followSkeletonHtml('Reading followed content'),
  /* No list is drawn beneath the follow details (deep link, or back/forward landing on details stacked over the list after visiting other pages in between): yield `#stats`,
     draw no list, and reopen by URL once the details close. When follow details are already open (switching entries within the group), leave it alone. */
  ground:()=>{
    if(stageApi()?.showing()==='follow')return;
    releaseHoverPreviews();disposeStage(false);enterManagementSurface();
    if(followFeedLive())return;
    navigationState.claimSurface(navigationState.surfacePath());
    showManagementBody({manage:false});
    // If the manage-area page is still mounted on `#stats`, unmount it first: clearing directly would leave a root governing nodes no longer on the page.
    if($('#stats').querySelector('.peach-react'))releaseManagedRoute($('#stats'));
    $('#stats').replaceChildren();
  },
};
followState.followDetailActions = createFollowDetailActions({view:followView,adoptView:adoptFollowView,
    rememberReturn:path=>writeShell({followDetailReturnPath:path}),close:()=>void closeFollowDetail(),
    open:(id,index,preserve)=>void openFollowDetail(id,true,index,preserve),drawer:renderFollowDrawer,
    openAuthor:name=>navigationState.navigatePath(entityPath('creator',name)),
    presented:item=>{presentPost(item.id,item.title,item.author);loadingState.syncPageTitle(location.href)}},
    {toast:(message,{undo}={})=>receiptsState.actionReceipt(message,{undo}),failure:receiptsState.actionFailure,
     canFlip:followState.followFeedActions.canFlip});
}

export function connectFollowController(){
    followState.controller=createFollowController({
      location:()=>location,view:followView,adoptView:adoptFollowView,
      session:()=>({discoverySeed:followDiscoverySeed,revision:followRevision,scrollY:followScrollY}),
      writeSession:patch=>writeShell({...(patch.discoverySeed===undefined?{}:{followDiscoverySeed:patch.discoverySeed}),
        ...(patch.revision===undefined?{}:{followRevision:patch.revision}),...(patch.scrollY===undefined?{}:{followScrollY:patch.scrollY})}),
      preferences:()=>({selectMode,selected:followSelected,photoSize:photoSize(),photoLayout:photoLayout(),imagesOnly:!!preferencesState.appSettings.followImagesOnly}),
      live:followFeedLive,push:pushFollowFeed,route:path=>{
        navigationState.route(path);
        rememberPageState('follow',{view:followView(),seed:followDiscoverySeed,revision:followRevision});
      },openPage:openRoutedPage,
      rollSeed:()=>Number(receiptsState.rollSeed()),enterSeed:()=>Math.floor(Math.random()*0xffffffff),
      revealFeed:()=>{releaseHoverPreviews();enterManagementSurface();showManagementBody({manage:false})},
      syncPhotoWalls,scrollTop:()=>{void pageNavigationReady(()=>location.pathname==='/follow',
        $('#stats').querySelector('[data-filter-frame]'))},
    },followState.followFeedHelpers,followState.followFeedActions);
    followState.followFeedActions=followState.controller.actions;
    followState.followFeedProps=followState.controller.props;
    followState.followFeedShell.refresh=followState.controller.refresh;
    followState.followFeedShell.props=followState.controller.props;
  }
