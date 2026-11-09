/* media domain controller: this domain's state and actions; startup installs them together through Application's lifecycle. */
import { loadSourceStatus, preferencesState, wireDrag } from './preferences.js';
import { receiptsState } from './receipts.js';
import { followState, followViewPath, openFollowDetail } from './follow.js';
import { immerseApi, loadImmerse, loadStage, stageApi } from '../react/application-residents';
import { cancelQueueRequest, navigationState, openRoutedPage, requestOverlay } from './navigation.js';
import { activeQueue, barsContext, detailOriginAbove, detailOriginAnchor, detailReturnBarsContext, detailReturnNeedsRestore, detailReturnPath, pageOpens, pendingQueueRoute, presentedItem, queueOpens, selectMode, selected, state, writeShell } from './../shell/index';
import { scheduleStickySurfaces } from './layout.js';
import { clearOverlayBackground, holdOverlayBackground, overlayState, takeOverlayReturn } from './../history/overlay';
import { peachHistory, shellNavigate } from './../history/index';
import { $, DURATION_TAGS } from '../core';
import { apiGet } from '../api';
import { javDisplayName, javTitleHtml } from '../core/jav-title';
import { tagLabel } from '../core/tags';
import { pageSkeletonHtml } from './../management-placeholder';
import { buildBars, catalogGridLayout, catalogState, commitContextFilter, goHome, loadCatalog, mixRelated } from './catalog.js';
import { wireDragReorder } from '../ui-kit';
import { currentBarsContext, entityState, openEntity, revealForIsland, syncForIsland } from './entity.js';
import { openAddToPlaylist, rereadPlaylists, saveMixAsPlaylist } from './playlists.js';
import { releaseHoverPreviews } from './../card-art/hover';
import { applicationEffects } from './effects';
import { loadingState } from './loading.js';
export const mediaState = { total: undefined, facets: undefined, stageHost: undefined, stageOpen: undefined, itemDetailHelpers: undefined, itemDetailActions: undefined, immerseHost: undefined, immerseOpen: undefined, requestedImmerseId: undefined };

export function urlResume(){
  const seconds=Number(new URLSearchParams(location.search).get('t'));
  return Number.isFinite(seconds)&&seconds>0?{time:seconds,autoplay:false}:null;
}

export function stageExit(){return stageApi()?.exit()||Promise.resolve()}

export function disposeStage(push=false,preserveInlineOrigin=false,{miniplayer=true,preserveQueueRequest=null}={}){
  if(navigationState.queueOpenRequest!==preserveQueueRequest)cancelQueueRequest();
  stageApi()?.dispose({miniplayer});
  writeShell({activeQueue:null,pendingQueueRoute:null,presentedItem:null});
  if(!preserveInlineOrigin){
    writeShell({detailOriginAnchor:null,detailOriginAbove:false,detailReturnNeedsRestore:false});
  }
  scheduleStickySurfaces();
  if(push)navigationState.route(detailReturnPath||'/');
}

export function repaintDetailPoster(){stageApi()?.repaintPoster()}

export function openQueue(kind,key,itemId,push,anchor=null,options={}){
  key=+key;
  const same=activeQueue?.kind===kind&&(kind==='playlist'?activeQueue.playlistId:activeQueue.seedId)===key;
  /* Switching items within the same queue keeps the origin page from the moment the queue was opened: closing a playlist returns to the list page and refetches. */
  if(push&&!same)writeShell({detailReturnPath:location.pathname+location.search});
  /* The queue address is pushed only once its fetch completes (`present`), and the background is recorded at that moment; swapping items within the same queue stays on the details address and keeps the previous item's background. */
  if(push)holdOverlayBackground();
  const queue=kind==='playlist'?{kind,playlistId:key,fresh:true}:{kind,seedId:key,fresh:!same};
  if(options.autoplay)queue.autoplay=true;
  if(push){
    cancelQueueRequest();
    const request=navigationState.queueOpenRequest={seq:peachHistory.navigation.seq,cancelled:false};
    navigationState.requestedQueue=()=>openItem(itemId==null?null:+itemId,false,queue,anchor,true,request);
    writeShell({queueOpens:queueOpens+1});
    return;
  }
  return openItem(itemId==null?null:+itemId,false,queue,anchor,push);
}

export function openMix(seedId,itemId=seedId,push=true,anchor=null){return openQueue('mix',seedId,itemId,push,anchor)}

export function openEditions(seedId,itemId=seedId,push=true,anchor=null){return openQueue('editions',seedId,itemId,push,anchor)}

export function openParts(seedId,itemId=seedId,push=true,anchor=null){return openQueue('parts',seedId,itemId,push,anchor)}

export function openPlaylist(playlistId,itemId=null,push=true){return openQueue('playlist',playlistId,itemId,push)}

export function hasReturnSurface(){
  return !!$('#grid').querySelector('[data-id],[data-mix-seed]')
    ||!!document.querySelector('[data-video-wall]')
    ||!$('#index').hidden||!$('#stats').hidden;
}

export async function openItem(id,push=true,queue=null,anchor=null,queuePush=false,queueRequest=null){
  if(queueRequest?.cancelled)return;
  if(!queueRequest)cancelQueueRequest();
  if(push&&!queue){
    writeShell({detailReturnPath:location.pathname+location.search});
    requestOverlay('/assets/'+(+id),'item',()=>openItem(id,false,null,anchor));
    return;
  }
  releaseHoverPreviews();
  id=id==null?null:+id;
  const origin=anchor?.isConnected?anchor:(detailOriginAnchor?.isConnected?detailOriginAnchor:null);
  const above=anchor?.isConnected
    ? anchor.getBoundingClientRect().top+anchor.getBoundingClientRect().height/2>window.innerHeight/2
    : detailOriginAbove;
  const returnSurfaceReady=hasReturnSurface();
  const needsReturnRestore=detailReturnNeedsRestore||(!push&&!returnSurfaceReady);
  const returnBars=barsContext.type==='item'?detailReturnBarsContext:entityState.cloneBarsContext(currentBarsContext());
  /* On click, record the current page; on back/forward, use the origin the entry recorded, and if the entry recorded none (cold start, deep link) keep the last recorded one.
     The queue switching entries from details also enters with push=false (`queuePush`), with the origin already set by `openQueue`, not fetched here. */
  if(push)writeShell({detailReturnPath:location.pathname+location.search});
  else if(!queuePush)writeShell({detailReturnPath:takeOverlayReturn()||detailReturnPath});
  // An entry's background is tracked separately: entering from a page records that page, opening another item from detail reuses the previous one's background, no nesting.
  if(push)holdOverlayBackground();
  /* Opening details does not enter the mini player; if the mini player holds another entry it yields (decided by the stage island), and the two players never sound at once. While video details is open
     (queue volume switch, related videos) the stage swaps entries in place without tearing down. */
  if(stageApi()?.showing()!=='item')disposeStage(false,true,{miniplayer:false,preserveQueueRequest:queueRequest});
  writeShell({detailOriginAnchor:origin,detailOriginAbove:above,detailReturnNeedsRestore:needsReturnRestore});
  writeShell({detailReturnBarsContext:returnBars});
  writeShell({activeQueue:queue&&{kind:queue.kind,seedId:queue.seedId,playlistId:queue.playlistId}});
  writeShell({pendingQueueRoute:queue&&queuePush
    ? `${queue.kind}=${queue.kind==='playlist'?queue.playlistId:queue.seedId}`:null});
  if(push&&!queue)navigationState.route('/assets/'+id,false,overlayState('item'));
  const stage=await loadStage(mediaState.stageHost);
  if(queueRequest?.cancelled)return;
  const actions=queueRequest?{...mediaState.itemDetailActions,
    present:(item,queue)=>{if(!queueRequest.cancelled)mediaState.itemDetailActions.present(item,queue)},
    redirect:to=>{if(!queueRequest.cancelled)mediaState.itemDetailActions.redirect(to)},
  }:mediaState.itemDetailActions;
  await stage.open({kind:'item',
    id,queue,relatedLimit:preferencesState.appSettings.relatedLimit>0?+preferencesState.appSettings.relatedLimit:0,
    helpers:mediaState.itemDetailHelpers,actions,
    grid:{helpers:catalogState.gridHelpers,actions:catalogState.gridActions},
    layout:catalogGridLayout(),selectMode,selected:new Set(selected),seekSeconds:preferencesState.appSettings.seekSeconds,
    resume:push||id==null?null:urlResume(),
  });
  scheduleStickySurfaces();
}

export async function closeItemDetail(){
  const restore=entityState.cloneBarsContext(detailReturnBarsContext);
  const returnPath=detailReturnPath||'/',restoreSurface=detailReturnNeedsRestore;
  await stageExit();
  disposeStage(false,false,{miniplayer:false});writeShell({detailReturnBarsContext:null});clearOverlayBackground();
  writeShell({barsContext:restore||{type:'home',filters:state}});
  /* When the screen below is missing and must be rebuilt from the URL, the manage area does not claim the address write, takes a page open counter, and reopens; the rest claim the address write and make the route tree reopen from the start. */
  if(restoreSurface&&navigationState.managedPagePath(new URL(returnPath,location.href).pathname)){navigationState.navigatePath(returnPath);return}
  navigationState.route(returnPath);
  if(restoreSurface)writeShell({pageOpens:pageOpens+1});
  // The playlist keeps the page, refreshing only the resume position and the list content changed in the detail.
  else{buildBars();if(location.pathname==='/playlists')rereadPlaylists()}
}

/** Out-of-library videos open in the same detail stage; origin and close behavior follow the overlay entry. */
export async function openJavMovie(code,push=true){
  if(push){
    writeShell({detailReturnPath:location.pathname+location.search});
    requestOverlay('/works/'+encodeURIComponent(code),'jav',()=>openJavMovie(code,false));
    return;
  }
  const seq=peachHistory.navigation.seq;
  const restore=entityState.cloneBarsContext(currentBarsContext());
  const needsRestore=!hasReturnSurface();
  const returnPath=takeOverlayReturn()||(needsRestore?'/jav?tab=discover':detailReturnPath)||'/jav?tab=discover';
  if(stageApi()?.showing()!=='jav')disposeStage(false,true,{miniplayer:false});
  writeShell({detailReturnPath:returnPath,detailReturnBarsContext:restore,detailReturnNeedsRestore:needsRestore});
  releaseHoverPreviews();
  const [stage,runtime]=await Promise.all([loadStage(mediaState.stageHost),apiGet('/healthz')]);
  if(peachHistory.navigation.seq!==seq)return;
  await stage.open({kind:'jav',code,readOnly:!!runtime.ledger_read_only,
    actions:{close:()=>void closeItemDetail(),navigate:path=>navigationState.navigatePath(path),
      canonicalCode:canonical=>{
        if(peachHistory.navigation.seq!==seq||!canonical||canonical===code)return;
        shellNavigate('/works/'+encodeURIComponent(canonical)+location.search+location.hash,
          {replace:true,state:peachHistory.navigation.location.state});
        loadingState.syncPageTitle(location.href);
      },
      openTag:tag=>commitContextFilter(filters=>{filters.tag=tag}),
      receipt:message=>receiptsState.toast({text:message})}});
  scheduleStickySurfaces();
}

export async function openTok(startId=null,push=true){
  if(push){mediaState.requestedImmerseId=startId;navigationState.route('/immerse');return}
  stageApi()?.closeMiniplayer();
  await (await loadImmerse(mediaState.immerseHost)).open(startId);
}

export function installMedia10() {
mediaState.total = 0;
mediaState.facets = null;
mediaState.stageHost = {
  player:{
    settings:()=>preferencesState.appSettings,saveSettings:()=>preferencesState.saveSettings(),
    toast:(text,options)=>receiptsState.toast({text},options),
    loadSourceStatus:()=>loadSourceStatus(),offlineReason:key=>preferencesState.offlineReason(key),
  },
  sourceOffline:key=>preferencesState.sourceOffline(key),
  /* "Expand" in the mini player: the same player moves back into this item's detail, with the address and origin following the item the card was clicked from. */
  expand:(kind,id,mediaIndex)=>{if(kind==='follow')void openFollowDetail(id,true,mediaIndex);else void openItem(id,true)},
  openItem:id=>void openItem(id),
};
mediaState.stageOpen = ()=>!!stageApi()?.isOpen();
}

export function installMedia21() {
mediaState.itemDetailHelpers = {
  badgeHtml:(location,cost,cls)=>preferencesState.srcBadge(location,cost,cls),
  titleHtml:it=>javTitleHtml(it),
  displayName:it=>javDisplayName(it),
  javImage:()=>preferencesState.appSettings.javImage,
  tagLabel:tag=>tagLabel(tag),
  isDurationTag:tag=>DURATION_TAGS.has(tag),
  tagCandidates:()=>(mediaState.facets&&mediaState.facets.tags)||[],
  sourceOffline:key=>preferencesState.sourceOffline(key),
  offlineReason:key=>preferencesState.offlineReason(key),
  relatedSkeletonHtml:()=>pageSkeletonHtml('Loading recommendations',{cards:true,className:'related-skeleton'}),
  mixRelated:seedId=>mixRelated(seedId),
  wireDrag:el=>wireDrag(el),
  wireDragReorder:(root,options)=>wireDragReorder(root,options),
};
mediaState.itemDetailActions = {
  close:()=>closeItemDetail(),
  /* The top bar's entity context follows the item actually painted; the queue address is pushed at this moment too, while which item to settle on waits for the island. */
  present:item=>{
    writeShell({presentedItem:item});
    const returnBars=detailReturnBarsContext;
    writeShell({barsContext:{type:'item',id:item.id,filters:returnBars?.type==='entity'
      ? {...returnBars.filters}:entityState.emptyEntityFilters()}});
    if(pendingQueueRoute){navigationState.queueOpenRequest=null;navigationState.route(`/assets/${item.id}?${pendingQueueRoute}`,false,overlayState('item'));writeShell({pendingQueueRoute:null})}
    loadingState.syncPageTitle(location.href);
    buildBars();
  },
  /* When fetching reveals the destination lies elsewhere: saved online videos go to follow details, a queue that cannot load falls back to plain details, an emptied playlist
     returns to the list page, and a gone entry collapses the stage. Once the shell swaps the stage, this island mount is void. */
  redirect:to=>{
    const push=!!pendingQueueRoute;
    if(to.kind==='follow'){
      navigationState.queueOpenRequest=null;
      writeShell({pendingQueueRoute:null,followDetailReturnPath:detailReturnPath||'/'});
      navigationState.route(`/posts/${to.id}`,!push,overlayState('follow'));
      void openFollowDetail(to.id,false,null,true);return;
    }
    if(to.kind==='item'){void openItem(to.id,true);return}
    // The queue URL has not been pushed and the user is still on the playlist page: re-read only that page.
    if(to.kind==='playlists'){if(push||location.pathname!=='/playlists')openRoutedPage('/playlists');else rereadPlaylists();return}
    disposeStage(false);
  },
  openQueueItem:(queue,id,push=true)=>void openQueue(queue.kind,queue.kind==='playlist'?queue.playlistId:queue.seedId,id,push,null,{autoplay:queue.autoplay}),
  // Once the drive is back, reopen through the normal path without mounting the player midway; the open queue stays in place.
  reopen:()=>{
    const it=presentedItem;
    if(!it)return;
    const queue=activeQueue;
    if(queue)void openQueue(queue.kind,queue.kind==='playlist'?queue.playlistId:queue.seedId,it.id,false);
    else void openItem(it.id,false);
  },
  checkSource:async key=>(await loadSourceStatus())[key]!==false,
  /* Enter the "saved" tier directly. The follow page's filters are derived from the address, so the state must be written into the address first; setting only the global gets pushed back to unseen. */
  openSavedFollow:()=>{
    followState.followAuthors=new Set();followState.followProviders=new Set();followState.followTags=new Set();followState.followWorks=new Set();followState.followMediaView='videos';
    followState.followDurMin=followState.followDurMax=0;followState.followFilter='saved';openRoutedPage(followViewPath())},
  openEntity:(kind,name)=>openEntity(kind,name),
  openUnowned:()=>goHome({owner:'none'}),
  openRegion:region=>goHome({region:region||'none'}),
  openTag:tag=>commitContextFilter(filters=>{filters.tag=tag}),
  addToPlaylist:item=>openAddToPlaylist(item),
  saveMix:options=>saveMixAsPlaylist(options),
  editPlaylist:()=>openRoutedPage('/playlists'),
  openPlaylists:()=>openRoutedPage('/playlists'),
  reveal:id=>revealForIsland(id),
  sync:id=>syncForIsland(id),
  /* The "Junk files" tier (`state=ads`) lists by trash state: an entry moved to trash must disappear from the list, and undoing
     any piece of feedback re-reads the list too. Other lists are unaffected. */
  trashChanged:async(disposal,undo)=>{
    if(state.state!=='ads')return;
    if(!undo&&disposal!=='trash')return;
    if(!undo){clearOverlayBackground();disposeStage(true,false,{miniplayer:false});}
    await loadCatalog();
  },
  toast:(message,{undo}={})=>receiptsState.actionReceipt(message,{undo}),
  failure:(action,error)=>receiptsState.actionFailure(action,error),
};
mediaState.immerseHost = {
  filters:()=>state,
  seekSeconds:()=>preferencesState.appSettings.seekSeconds,
  sourceOffline:key=>preferencesState.sourceOffline(key),
  displayName:it=>javDisplayName(it),
  /* Write the address with replace on every item change: one history entry per swipe would break the back key. */
  route:id=>navigationState.route('/immerse?id='+id,true),
  closed:()=>goHome(),
  openItem:id=>void openItem(id),
  openEntity:(kind,name)=>openEntity(kind,name),
  openUnowned:()=>goHome({owner:'none'}),
  toast:(message,{undo}={})=>receiptsState.actionReceipt(message,{undo}),
  warn:message=>receiptsState.toast({text:message},{sound:'warning'}),
  failure:(action,error)=>receiptsState.actionFailure(action,error),
};
mediaState.immerseOpen = ()=>!!immerseApi()?.isOpen();
applicationEffects.handler($('#immerseBtn'), 'onclick', ()=>openTok());
}
