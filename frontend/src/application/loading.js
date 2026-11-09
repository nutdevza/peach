/* loading domain controller: this domain's state and actions; startup installs them together through Application's lifecycle. */
import { followState } from './follow.js';
import { managementSkeletonHtml, pageSkeletonHtml, skeletonKeyOf } from './../management-placeholder';
import { photoSize } from './../appearance/layout';
import { $, ROUTE_ENTITIES } from '../core';
import { fitSkeleton, LOAD_MORE_STATUS, loadingDotsHtml, revealSkeleton } from '../ui-kit';
import { junkCountSkeletonHtml, junkRoute } from './../junk-queue';
import { state, presentedItem } from './../shell/index';
import { homeRouteLabel, mediaRouteLabel, postRouteLabel } from '../history/page-title';
import { subscribeNames } from '../core/entity-names';
import { catalogCardRatio, catalogHeadProps, catalogSkeletonHtml, clearCatalogGrid, gridTaken, paintCatalogFilter, syncCatalogFilterScreen } from './catalog.js';
import { followListLayout, followManageParams, indexState, showIndexContainer } from './index.js';
import { applicationEffects } from './effects';
import { feedState, loadEntityShapes } from './feed.js';
import { navigationState, paintNav } from './navigation.js';
import { indexParams, paintIndexSkeleton } from './../index-skeleton';
import { showEntityLoading } from './entity.js';
import { routeMetaOf } from './../history/route-meta';
import { javTab } from '../react/jav/jav-navigation';
import { paintWallBootSkeleton } from '../react/video-wall/wall-boot';
export const loadingState = { setGridCards: undefined, gridCards: undefined, managementPlaceholder: undefined, wantsDiscoveryBars: undefined, entityShapesReady: undefined, ENTITY_SHAPES_WAIT: undefined, syncPageTitle: undefined };

export function renderCatalogLoading(label='Loading videos'){
  if(location.pathname==='/wall'){$('#loadSentinel').hidden=true;return}
  const count=$('#count');
  /* The junk files screen's count row is its own: one summary face plus a category switch, no sorting and no batch change.
     This version is a static copy of the one shown while the junk queue waits for data, swapped out once the queue paints; the category links in the skeleton
     are real `<a href>`, so clicking still navigates when React has not wrapped yet. The catalog and trash counts live in the filter bar,
     so this row stays empty. */
  const junk=decodeURIComponent(location.pathname)==='/junk-files';
  count.classList.toggle('manage-static',junk);
  count.classList.toggle('junkcount',junk);
  if(junk){
    count.setAttribute('aria-busy','true');count.setAttribute('aria-label',label);
    count.innerHTML=junkCountSkeletonHtml(junkRoute(location.search));
    fitSkeleton(count);
  }else{
    count.removeAttribute('aria-busy');count.removeAttribute('aria-label');count.textContent='';
    if(state)paintCatalogFilter({count:null,...catalogHeadProps()});
  }
  /* As soon as the skeleton goes up, the bottom Loading Dots must come down. The skeleton says "how many cards of what shape will appear next";
     the dots say "there is already content above, more is being appended"; with both on screen at once there are two waiting animations
     in one viewport while only one request is actually running. The sentinel's visibility is re-decided by `has_more` after data lands,
     so this code only removes it, without remembering the original value. */
  $('#loadSentinel').hidden=true;
  /* When the grid is already rendered (or the first screen is in flight), the skeleton belongs to the page itself: `#grid` is its container, and a shell write would wash the page away. */
  if(gridTaken())return;
  const grid=$('#grid'),placeholder=catalogSkeletonHtml(label);
  const skeleton=grid.querySelector('.catalog-skeleton');
  if(skeleton?.dataset.skeleton===skeletonKeyOf(placeholder)
    &&Number(skeleton.querySelector('[style]')?.style.getPropertyValue('--skeleton-card-ratio'))===catalogCardRatio())return;
  if(skeleton)grid.innerHTML=`<div class="grid">${placeholder}</div>`;
  else loadingState.setGridCards(placeholder);
  fitSkeleton($('#grid'));
}

export function hideDiscoveryBars(){$('#catalogFilter').style.display='none';syncCatalogFilterScreen()}

export function waitEntityShapes(){
  const deadline=new Promise(resolve=>{
    let left=loadingState.ENTITY_SHAPES_WAIT,last=performance.now();
    const tick=()=>{
      const now=performance.now();
      left-=Math.min(now-last,50);last=now;
      if(left>0)applicationEffects.delay(tick,Math.min(left,50));else resolve();
    };
    applicationEffects.delay(tick,50);
  });
  return Promise.race([loadingState.entityShapesReady||=loadEntityShapes(),deadline]);
}

export function renderInitialSurfaceLoading(){
  const path=decodeURIComponent(location.pathname);
  /* The skeleton draws exactly this surface, so write `data-surface` first: on a deep-link cold start the shell starts routing after this step,
     and waiting for it would lay the skeleton out once in the default layout, then jump to the split columns when data arrives. */
  document.body.dataset.surface=location.pathname;
  if(path==='/wall'){
    document.body.setAttribute('data-wall-open','');hideDiscoveryBars();paintWallBootSkeleton();return;
  }
  if(/^\/assets\/\d+$/.test(path)){
    /* The details skeleton belongs to the stage island: once the route lands, `openItem` fetches the React package and paints. The list below is backfilled by the route tree's catalog element. */
    hideDiscoveryBars();return;
  }
  if(path==='/settings'||/^\/settings\/(appearance|playback|jav|search|content)$/.test(path)||path.startsWith('/posts/')||path.startsWith('/works/')){
    /* Follow detail likewise waits only for the skeleton inside the stage popover and does not pre-lay one in the page; the list paints after the detail closes, with no re-issue. */
    hideDiscoveryBars();return;
  }
  if(path==='/junk-files'){
    /* Junk files is a screen of homogeneous cards, waiting for content structure rather than background progress: Loading Dots says
       "still running", while what needs saying here is "how many cards of what shape are coming", so the catalog skeleton is used. */
    renderCatalogLoading('Reading junk files');
    return;
  }
  if(path==='/jav'&&javTab(new URLSearchParams(location.search).get('tab'))==='library'){
    renderCatalogLoading('Loading the library');return;
  }
  /* The admin area, playlist page, and follows page placeholders are taken over by each page. */
  if(navigationState.managedPagePath(path)){
    hideDiscoveryBars();
    const stats=$('#stats');stats.hidden=false;clearCatalogGrid();
    stats.innerHTML=path.startsWith('/follow')&&path!=='/subscriptions'
      ?followState.followSkeletonHtml('Reading followed content')
      :loadingState.managementPlaceholder(path);
    fitSkeleton(stats);
    return;
  }
  if(/^\/(performers|creators|studios|agencies|tags)$/.test(path)){
    hideDiscoveryBars();showIndexContainer();
    paintIndexSkeleton($('#index'),indexParams(path.slice(1),location.search),indexState.peopleIndexLayout());
    return;
  }
  if(/^\/(?:performers|creators|studios|agencies|series|tags)\//.test(path)){
    hideDiscoveryBars();
    $('#index').hidden=false;clearCatalogGrid();
    const kind=ROUTE_ENTITIES[path.split('/')[1]],name=path.split('/').slice(2).join('/');
    const ready=feedState.hasEntityShape(kind,name)?Promise.resolve():waitEntityShapes();
    void ready.then(()=>{
      if($('#index').firstElementChild||decodeURIComponent(location.pathname)!==path)return;
      showEntityLoading(kind,name);
      fitSkeleton($('#index'));
    });
    return;
  }
  /* An unmatched address has no subsequent read and must not leave a catalog skeleton that will never be replaced. A valid catalog,
     trash, and immersive mode all have routes, so only then do they enter the waiting state matching their real request. */
  if(!navigationState.routeMeta(path)){
    clearCatalogGrid();$('#count').textContent='';$('#loadSentinel').hidden=true;
    return;
  }
  renderCatalogLoading();
}

export function installLoading3() {
followState.followContentSkeletonHtml = (media=new URLSearchParams(location.search).get('media')==='images'?'images':'videos',
  label='Reading followed content')=>pageSkeletonHtml(label,{cards:true,className:'follow-content-skeleton postercard-skeleton',
  gridClass:media==='images'?'followlist followphotowall':'',gridSize:photoSize()});
followState.followSkeletonHtml = (label='Reading followed content')=>`<div class="peach-react"><div class="follow" data-follow-feed>
  <div data-follow-head><h2 data-follow-title>Follows</h2></div>
  <div class="tier followauthors" data-skeleton-tier="av"></div>
  <div class="tier followworks" data-skeleton-tier="brandpill"></div>
  <div class="board-filter-frame" data-filter-frame>
    <div class="tagbar followfilters" data-filter-row="top" data-skeleton-tier="pill"></div>
    <div class="count followcount" data-filter-row="bottom"><span class="mono"><span class="countskeleton"></span></span></div></div>
  ${followState.followContentSkeletonHtml(undefined,label)}</div></div>`;
$('#loadSentinel').innerHTML=loadingDotsHtml(LOAD_MORE_STATUS);
loadingState.setGridCards = html=>revealSkeleton($('#grid'),()=>{$('#grid').innerHTML=`<div class="grid">${html}</div>`});
loadingState.gridCards = ()=>document.querySelectorAll(
    ':is(#grid,#index [data-entity-grid]) :is([data-media-grid] > [data-media-card][data-id],[data-catalog-row][data-id])');
loadingState.managementPlaceholder = path=>managementSkeletonHtml(path,{followLayout:followListLayout(),
  ...(({sort,dir,tab})=>({followSort:sort,followDir:dir,followTab:tab}))(followManageParams())});
loadingState.wantsDiscoveryBars = ()=>$('#catalogFilter').style.display!=='none';
loadingState.entityShapesReady = null;
loadingState.ENTITY_SHAPES_WAIT = 400;
loadingState.syncPageTitle = path=>{
  const url=writePageTitle(path);
  document.body.dataset.surface=url.pathname;
  paintNav();
};
/* 资料页标题是人名：名单晚到、换了中文或日文写法时只重写标题。 */
subscribeNames(()=>writePageTitle(location.href));
}

function writePageTitle(path){
  const url=new URL(path,location.origin);
  const pathname=decodeURIComponent(url.pathname);
  const label=mediaRouteLabel(pathname,presentedItem)||postRouteLabel(pathname)||homeRouteLabel(pathname,url.search)||routeMetaOf(pathname)?.title;
  document.title=label?`${label} · Peach`:'Peach · 蜜桃';
  return url;
}
