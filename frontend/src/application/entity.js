import { createRevealSourceAction } from './source-action';
import { emptyEntityFilters, parseEntityFilters, entityFilterSearch, parseMediaView, entityViewSearch } from '../react/entity-page/entity-route';
import { photoViewActive as hasPhotoView } from '../react/entity-page/photo-surface';
import { createEntityApplication } from '../react/entity-page/entity-application';
import { waitEntityShapes } from './loading.js';
/* entity domain controller: this domain's state and actions; startup installs them together through Application's lifecycle. */
import { catalogGridLayout, catalogSkeletonHtml, catalogState, comboItems, commitContextFilter, toggleTag } from './catalog.js';
import { nextSortState, sortDirWord } from './../sort-preferences';
import { barsContext, notifyShell, selectMode, selected, state, writeShell } from './../shell/index';
import { $, ENTITY_ROUTES, api, esc, icon } from '../core';
import { managedEntry, releaseManagedRoute, updateManagedRoute } from './../history/managed';
import { javActive, scheduleStickySurfaces, setJavLayout, sortOptions } from './layout.js';
import { navigationState, openRoutedPage } from './navigation.js';
import { releaseHoverPreviews } from './../card-art/hover';
import { preferencesState, wireDrag } from './preferences.js';
import { fitSkeleton, formModal, indexSkeletonHtml, wireHorizontalScroller } from '../ui-kit';
import { feedRowHtml, feedState, loadEntityShapes, wireFeedNewRow } from './feed.js';
import { receiptsState } from './receipts.js';
import { JAV_LAYOUTS, PHOTO_LAYOUTS, javLayout, photoLayout, photoSize, storePhotoLayout, storePhotoSize } from './../appearance/layout';
import { dropBars } from './../catalog-bars';
import { indexState, openFollowAuthorFromIndex } from './index.js';
import { followState, pushFollowFeed } from './follow.js';
import { applyDensity, paintPhotoSizeButton } from './../appearance/density';
import { applicationEffects } from './effects';
import { entitySkeletonHtml } from './../entity-skeleton';
import { INDEX_TITLES } from './../index-skeleton';
import { FILTER_WAITING, filterControlsSkeletonHtml } from './../filter-controls-skeleton';
import { cardRatio, gridLayout } from './../appearance/layout';
import { islandShortcutsEntry } from './../island-skeleton';
import { catalogContentSkeletonHtml } from '../catalog-content-skeleton';
export const entityState = { ENTITY_FILTER_KEYS: undefined, emptyEntityFilters: undefined, parseEntityFilters: undefined, entityFilterSearch: undefined, cloneBarsContext: undefined, activeFilterState: undefined, entityPageView: undefined, entityPageWall: undefined, entityPageRevision: undefined, entityPageCurrent: undefined, entityPageLive: undefined, EMPTY_ENTITY_MEDIA: undefined, parseMediaView: undefined, entityViewSearch: undefined, entityBodyCanLoadMore: undefined, entityBodySkeleton: undefined, entityPageHelpers: undefined, entityFollowActions: undefined, SOURCE_HINTS: undefined, sourceHint: undefined, syncedText: undefined, sourceToolButtons: undefined, application: undefined };

export function entityPageEntry(){
  const entry=managedEntry($('#index'));
  return entry&&entry.path.endsWith('/*')&&entry.host.isConnected?entry:null;
}

export function pushEntityPage(patch){if(entityState.entityPageCurrent())updateManagedRoute($('#index'),patch)}

export function currentBarsContext(){
  if(barsContext.type==='item')return barsContext;
  const entry=entityPageEntry();
  if(entry){const {kind,name,filters}=entry.props;return {type:'entity',kind,name,filters:{...filters}}}
  return barsContext;
}

export function sortKeys(current,dir,jav=javActive()){
  return sortOptions(jav).map(([key,label])=>{
    const pressed=current===key,next=nextSortState(key,current,dir);
    return {key,label,pressed,dir:pressed&&sortDirWord(key,dir)?(dir==='asc'?'asc':'desc'):'',
      ariaLabel:next?`Sort by ${label}${next.dir?sortDirWord(next.sort,next.dir):''}`:''}});
}

export function routeEntityPage(kind,name,filters,media=entityState.EMPTY_ENTITY_MEDIA,options={}){
  return entityState.application.route(kind,name,filters,media,options);
}

export function entityPageActions(kind,name){return entityState.application.actions(kind,name)}

export function entityPageProps(kind,name,filters,media){return entityState.application.props(kind,name,filters,media)}

export function photoViewActive(){return hasPhotoView({entityWall:entityState.entityPageWall,
    entityCurrent:entityState.entityPageCurrent(),indexVisible:!$('#index').hidden,pathname:location.pathname,
    followMedia:followState.followMediaView,statsVisible:!$('#stats').hidden},
    ()=>[...document.querySelectorAll('.followphotowall')].some(wall=>wall.getClientRects().length>0))}

export function syncPhotoWalls(){entityState.photos.sync()}

export function syncDensityControl(){
  if(photoViewActive())paintPhotoSizeButton(photoSize());else applyDensity();
}

export function setPhotoSize(value){entityState.photos.setSize(value)}

export const revealSource = createRevealSourceAction({
  request:id=>api('/api/reveal',{method:'POST',body:JSON.stringify({id})}),
  success:()=>receiptsState.toast({text:'Revealed in File Explorer'}),
  failureText:error=>entityState.sourceHint(error instanceof Error?error.message:String(error)),
});

export async function revealForIsland(id){const status={textContent:''};await revealSource(id,status);return status.textContent}

export async function syncForIsland(id){
  const status={textContent:''};let removed=[];
  await syncMissing(id,status,result=>{if(result.items)removed=result.items.map(item=>item.id)});
  return {text:status.textContent,removed};
}

export async function syncMissing(id,status,done){
  status.textContent='Verifying folders…';
  try{
    const r=await api('/api/purge-missing',{method:'POST',body:JSON.stringify({id})});
    if(r.ok===false){status.textContent=entityState.sourceHint(r.error);return}
    status.textContent=r.removed
      ? `${entityState.syncedText(r)} (${r.checked} checked${r.unreadable?`, ${r.unreadable} could not be read`:''})`
      : r.unreadable
        ? `${r.unreadable} entries in the folder are temporarily unreadable and were left unchanged this run`
        : `All ${r.checked} entries in the folder are still present; nothing to change`;
    if(r.removed){
      const ids=(r.items||[]).filter(item=>item.disposal!=='reattached').map(item=>item.id);
      if(done)done(r);
      receiptsState.actionReceipt(entityState.syncedText(r),{undo:ids.length?async()=>{
        await api('/api/batch',{method:'POST',body:JSON.stringify({ids,operation:'restore'})});
        if(done)done({removed:0,restored:ids.length});
      }:null});
    }else receiptsState.actionReceipt('Folder verification finished; nothing to change');
  }catch(e){status.textContent=entityState.sourceHint(e.message);receiptsState.actionFailure('Verify folders',e)}
}

export function sourceTools(id){return `<div class="srctools">${entityState.sourceToolButtons(id)}
    <span class="srcstate" aria-live="polite"></span></div>`}

export function wireSourceTools(root,done){
  const status=root.querySelector('.srcstate');
  if(!status)return;
  const reveal=root.querySelector('[data-reveal]');
  const sync=root.querySelector('[data-sync]');
  if(reveal)applicationEffects.handler(reveal, 'onclick', ()=>revealSource(Number(reveal.dataset.reveal),status,{button:reveal}));
  if(sync)applicationEffects.handler(sync, 'onclick', ()=>syncMissing(Number(sync.dataset.sync),status,done));
}

export async function entityAliasForm(mine,write){
  const form=formModal({
    title:'Add alias',
    description:'The gallery finds images by name; adding aliases may surface more candidate images. An alias can also be set as the unified display name.',
    body:`<label class="modalfield"><span>Aliases</span>
        <input class="geist-input" name="alias" maxlength="80" autocomplete="off"
          placeholder="Another spelling, or another stage name"></label>`
      +(mine.length?`<div class="modalfield"><span>Added by you</span>
        <div class="aliaschips">${mine.map(one=>`<span class="aliaschip">${esc(one)}
          <button type="button" data-alias-drop="${esc(one)}"
            aria-label="Remove alias ${esc(one)}">${icon('x')}</button></span>`).join('')}</div></div>`:''),
    confirmLabel:'Add alias',
    confirmDisabled:true,
    onConfirm:()=>write({alias:field.value.trim()})});
  const field=form.dialog.querySelector('[name=alias]');
  applicationEffects.handler(field, 'oninput', ()=>{form.confirmButton.disabled=!field.value.trim()});
  /* Undo only touches the ones added here: aliases left by scraping and merging are the grounds this entity was first matched to this person,
     they must not be deleted with one click. The server guards this line by source; here we only list the ones it reports back. */
  form.dialog.querySelectorAll('[data-alias-drop]').forEach(chip=>applicationEffects.handler(chip, 'onclick', async()=>{
    const gone=chip.dataset.aliasDrop;
    form.close();
    try{await write({alias:gone,remove:true})}
    catch(error){receiptsState.actionFailure('Undo alias',error);return}
    receiptsState.actionReceipt(`Removed alias ${gone}`,{undo:async()=>{await write({alias:gone})}});
  }));
  const {confirmed,result}=await form.done;
  if(!confirmed)return;
  if(result?.added)receiptsState.actionReceipt(`Added alias ${result.alias}`,{undo:async()=>{
    await write({alias:result.alias,remove:true})}});
  else receiptsState.actionReceipt(`${result?.alias} is already a name in this profile`);
}

export function showEntityLoading(kind,name){
  const jav=['performer','studio'].includes(kind)&&feedState.hasEntityPart(kind,name,'jav');
  const head=`<div data-filter-row="bottom" class="flex min-w-0 items-center gap-3 px-3 py-2 min-h-12"><h3 data-entity-readout><span data-skeleton="count" class="relative inline-block h-3.5 w-24 rounded-md align-middle skeleton-sheen"></span></h3>${islandShortcutsEntry()}${kind==='agency'?'':filterControlsSkeletonHtml(sortKeys(state.sort,state.dir,jav),jav?{name:'jav-layout',label:'JAV card layout',value:javLayout(),options:JAV_LAYOUTS}:null)}</div>`;
  const top=kind==='agency'?'':`<div data-entity-media><button type="button" data-media-view="videos" aria-label="Videos" aria-pressed="true" ${FILTER_WAITING}>${icon('play')}</button><button type="button" data-media-view="photos" data-media-icon="image" aria-label="Photos" ${FILTER_WAITING}>${icon('pics')}</button></div><span data-entity-sep></span><div data-entity-scroll><div data-entity-states>${catalogState.catalogViews().map(view=>`<button type="button" data-entity-state="${esc(view.k)}" aria-pressed="${state.state===view.k}" ${FILTER_WAITING}>${esc(view.label)}</button>`).join('')}<span data-entity-sep></span></div>`;
  const body=kind==='agency'
    ?indexSkeletonHtml({kind:'performers',layout:indexState.peopleIndexLayout()})
    :catalogContentSkeletonHtml('Loading videos',cardRatio(gridLayout({active:jav,home:false,portrait:false})));
  const placeholder=entitySkeletonHtml(kind,head,body,top);
  if($('#index').firstElementChild?.dataset.skeleton!==`entity/${kind}`){
    $('#index').innerHTML=placeholder;
    syncEntitySkeletonParts(kind,name);
    fitSkeleton($('#index'));
  }else syncEntitySkeletonParts(kind,name);
}

export function syncEntitySkeletonParts(kind,name){
  const skeleton=$('#index').firstElementChild;
  if(skeleton?.dataset.skeleton!==`entity/${kind}`)return;
  const sync=(present,wanted,insert)=>{if(wanted&&!present)insert();else if(!wanted&&present)present.remove()};
  sync(skeleton.querySelector('.entityfoot'),kind!=='agency'&&feedState.hasEntityPart(kind,name,'costars'),
    ()=>skeleton.querySelector('.entityhero')?.insertAdjacentHTML('beforeend',feedState.costarSkeletonFoot()));
  sync(skeleton.querySelector('.feednew'),feedState.hasEntityPart(kind,name,'feed'),
    ()=>skeleton.querySelector('.entitysection')?.insertAdjacentHTML('beforebegin',feedState.feedNewSkeletonSection()));
  sync(skeleton.querySelector('.entityfacts'),kind==='performer'&&feedState.hasEntityPart(kind,name,'facts'),
    ()=>skeleton.querySelector('.entityprofile')?.insertAdjacentHTML('beforeend',feedState.factsSkeleton()));
}

export function showEntityMissing(kind){
  const index=ENTITY_ROUTES[kind]||kind,title=INDEX_TITLES[index]||'Entries';
  const actions=INDEX_TITLES[index]?`<a class="geist-button primary" href="/${index}">Back to ${title} list</a>`:'';
  $('#index').innerHTML=preferencesState.emptyState('search-x',`Cannot find this ${title}`,'The name may be misspelled, or it may have merged into another name; go back to the list and search again.',{actions});
}

export function openEntity(kind,name){openRoutedPage(entityState.application.fresh(kind,name))}

export function installEntity9() {
entityState.ENTITY_FILTER_KEYS = ['loc','creator','tag','state','dur_min','dur_max','orient','year','sort','dir'];
entityState.emptyEntityFilters = emptyEntityFilters;
entityState.parseEntityFilters = search=>parseEntityFilters(search,{sort:preferencesState.appSettings.defaultSort,dir:preferencesState.appSettings.defaultSortDirection});
entityState.entityFilterSearch = entityFilterSearch;
entityState.cloneBarsContext = context=>context&&context.type==='entity'
  ? {...context,filters:{...context.filters}}:context;
entityState.activeFilterState = ()=>{const context=currentBarsContext();return context.type==='home'?state:context.filters};
$('#q').value=state.q;
catalogState.rememberSearchValue();
}

export function installEntity17() {
entityState.entityPageView = '';
entityState.entityPageWall = false;
entityState.entityPageRevision = 0;
entityState.entityPageCurrent = ()=>!!entityPageEntry();
entityState.entityPageLive = (kind,name)=>{const entry=entityPageEntry();
  return !!entry&&!$('#index').hidden&&entry.props.kind===kind&&entry.props.name===name};
entityState.EMPTY_ENTITY_MEDIA = {media:'videos',set:0};
entityState.parseMediaView = parseMediaView;
entityState.entityViewSearch = entityViewSearch;
entityState.entityBodyCanLoadMore = ()=>!$('#index').hidden&&$('#stats').hidden;
entityState.entityBodySkeleton = ()=>catalogSkeletonHtml();
entityState.entityPageHelpers = {
  wireDrag:row=>{if(row)wireDrag(row)},
  wireScroller:row=>{if(row)wireHorizontalScroller(row)},
  wireFeedRow:row=>wireFeedNewRow(row),
  feedRowHtml,
  receipt:(message,options)=>receiptsState.actionReceipt(message,options),
  failure:(label,error)=>receiptsState.actionFailure(label,error),
  aliasForm:(mine,write)=>entityAliasForm(mine,write),
  sourceToolsHtml:id=>sourceTools(id),
  wireSourceTools:(root,done)=>wireSourceTools(root,done),
  comboItems:filters=>comboItems(filters),
  sortKeys:(sort,dir,jav)=>sortKeys(sort,dir,jav),
};
entityState.entityFollowActions = {...followState.followFeedActions,
  route:()=>{},shuffle:()=>{},loaded:()=>{},toggleSelection:()=>{}};
entityState.SOURCE_HINTS = {
  'source offline':'The library is unreachable, so files cannot be verified right now; retry after the connection recovers',
  'source not mapped':'This machine has no drive letter mapped for this source',
  'file missing':'Source file not found; click the scan button on the right to re-check the catalog and update the database records',
  'unsupported platform':'The current server OS does not support locating files directly',
  'reveal failed':'Couldn\'t open File Explorer. Try again.',
};
entityState.sourceHint = message=>entityState.SOURCE_HINTS[message]||message;
entityState.syncedText = r=>[r.trashed?`Moved ${r.trashed} items to trash`:'',
  r.vanished?`${r.vanished} items carried personal records and were marked as vanished`:'',
  r.reattached?`${r.reattached} items were reattached to another edition in the library`:''].filter(Boolean).join(', ');
entityState.sourceToolButtons = id=>`
    <button type="button" data-reveal="${id}" title="Open the source file's folder in the file manager"
      aria-label="Locate source file">${icon('folder-open')}</button>
    <button type="button" data-sync="${id}" title="Verify this directory: files deleted on disk move to Peach trash; ones with personal records are marked vanished"
      aria-label="Sync deletions">${icon('folder-sync')}</button>`;
}

export function connectPhotoController(){
  entityState.application=createEntityApplication({
    controller:{
      context:()=>{const context=currentBarsContext();return context.type==='entity'?context:null},
      live:(kind,name)=>entityState.entityPageLive(kind,name),current:()=>entityState.entityPageCurrent(),
      route:(path,replace=false)=>navigationState.route(path,replace),suffix:()=>location.search+location.hash,
      restoreHomeContext:()=>writeShell({barsContext:{type:'home',filters:state}}),
      releaseBodyPreviews:()=>releaseHoverPreviews($('#index [data-entity-body]')),push:pushEntityPage,
      state:()=>({seed:String(state.seed||''),jav:state.jav==='1'}),
      preferences:()=>({revision:entityState.entityPageRevision,feedRevision:feedState.feedRevision,
        photoSize:photoSize(),photoLayout:photoLayout(),photoLayouts:PHOTO_LAYOUTS,
        followImagesOnly:!!preferencesState.appSettings.followImagesOnly,
        javLayout:javLayout(),javLayouts:JAV_LAYOUTS,states:catalogState.VIEW_PILLS,peopleLayout:indexState.peopleIndexLayout(),
        layout:catalogGridLayout(),selectMode,selected:new Set(selected),seekSeconds:preferencesState.appSettings.seekSeconds,
        groupCollapse:preferencesState.appSettings.groupCollapse,wireDrag,skeletonHtml:entityState.entityBodySkeleton,
        canLoadMore:entityState.entityBodyCanLoadMore,
        follow:{helpers:followState.followFeedHelpers,actions:entityState.entityFollowActions}}),
      changeFilter:commitContextFilter,rollSeed:()=>receiptsState.rollSeed(),
      writeSeed:seed=>{state.seed=seed;notifyShell()},
      setJavLayout,javLayout,setPhotoLayout:storePhotoLayout,syncPhotoWalls,openEntity,photoViewActive,
      recordPainted:(view,wall)=>{entityState.entityPageView=view;entityState.entityPageWall=wall},
      syncDensity:syncDensityControl,scheduleSticky:scheduleStickySurfaces,
      releasePage:()=>releaseManagedRoute($('#index')),showMissing:showEntityMissing,dropBars,
    },
    loading:{
      shapesReady:(kind,name)=>feedState.hasEntityShape(kind,name),waitShapes:waitEntityShapes,paintSkeleton:showEntityLoading,
      resetView:()=>{writeShell({detailReturnBarsContext:null});entityState.entityPageView='';entityState.entityPageWall=false},
      loadShapes:loadEntityShapes,syncParts:syncEntitySkeletonParts,
    },
    photos:{
      preferences:()=>({size:photoSize(),layout:photoLayout(),imagesOnly:!!preferencesState.appSettings.followImagesOnly}),
      walls:()=>document.querySelectorAll('.followphotowall'),pushEntity:pushEntityPage,pushFollow:pushFollowFeed,
      syncDensity:syncDensityControl,storeSize:storePhotoSize,
    },
    helpers:entityState.entityPageHelpers,
    actions:{toggleTag,openFollowAuthor:openFollowAuthorFromIndex,javContext:on=>writeShell({entityJavLayout:!!on})},
    sortPreference:()=>({sort:preferencesState.appSettings.defaultSort,dir:preferencesState.appSettings.defaultSortDirection}),
  });
  entityState.photos=entityState.application.photos;
  entityState.entityPageHelpers=entityState.application.helpers;
}
