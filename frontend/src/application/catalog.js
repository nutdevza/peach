import { initialCatalogFilters, resetCatalogFilters, homeCatalogState, homePath as pathForCatalog, onlineDefaultLoc as defaultLocations, resolveSort } from '../react/catalog-grid/catalog-state';
import { CatalogController } from '../react/catalog-grid/catalog-controller';
import { nextRating, ratingStars } from '../react/components/rating-values';
/* catalog domain controller: this domain's state and actions; startup installs them together through Application's lifecycle. */
import { censorOn, preferencesState, refreshAll, replaceCatalogAddress, sidebarFacets, wireDrag } from './preferences.js';
import { nextSortState } from './../sort-preferences';
import { $, STATE_ROUTES, api, esc, firstGrapheme, isCatalogPath, leadingGraphemes } from '../core';
import { barsContext, detailReturnBarsContext, notifyShell, pageOpens, runtimeConfigurable, selectMode, selected, state, writeShell } from './../shell/index';
import { receiptsState } from './receipts.js';
import { fetchBars, fetchTopsPage } from './../catalog-bars';
import { confirmModal, dissolveValue, fitSkeleton, wireHorizontalScroller } from '../ui-kit';
import { navigationState, paintSidebar, syncNavigation } from './navigation.js';
import { disposeStage, mediaState, openEditions, openItem, openMix, openParts, openTok } from './media.js';
import { buildManageBar, cardLayout, homeLayoutActive, javActive, layoutState, setHomeLayout, setJavLayout, showHomeSurfaces } from './layout.js';
import { selectionState, setSelectMode, toggleSelection } from './selection.js';
import { javDisplayName, javTitleHtml } from '../core/jav-title';
import { tagLabel } from '../core/tags';
import { entityDisplayName } from '../core/entity-names';
import { loadStage, stageApi } from '../react/application-residents';
import { currentBarsContext, entityState, openEntity, pushEntityPage, routeEntityPage, sortKeys } from './entity.js';
import { applicationEffects } from './effects';
import { managedEntry, managedTaken, openManagedRoute, releaseManagedRoute, updateManagedRoute } from './../history/managed';
import { catalogFilterSkeletonHtml } from './../catalog-filter-skeleton';
import { catalogContentSkeletonHtml } from '../catalog-content-skeleton';
import { JAV_LAYOUTS, cardRatio, gridLayout, javLayout } from './../appearance/layout';
import { entityFaceImg, facePos, logoUrl } from './../card-art/markup';
import { sidebarHasCatalogContent } from './../sidebar';
import { rememberRepresentatives } from './../card-art/representatives';
import { clearHomeFeed, isFeedNewPath, renderHomeFeed } from './feed.js';
import { renderCatalogLoading } from './loading.js';
import { releaseHoverPreviews } from './../card-art/hover';
import { revealRoutedPage } from './follow.js';
import { pageSkeletonHtml } from './../management-placeholder';
import { catalogEmptyHtml } from './../catalog-onboarding';
import { junkRoute } from './../junk-queue';
import { wallAddress } from '../react/video-wall/wall-route';
import { restoringPage } from '../history/page-navigation';
export const catalogState = { homeHasFeed: undefined, barsRequestSeq: undefined, barsPendingSeq: undefined, barsRendered: undefined, catalogFilterProps: undefined, catalogFilterMounting: undefined, catalogTagRows: undefined, catalogTopsPages: undefined, initialParams: undefined, resolveSort: undefined, initialCatalogUrl: undefined, initialParam: undefined, HOME_QUERY_KEYS: undefined, searchValueSnapshot: undefined, cancelSearchDissolve: undefined, rememberSearchValue: undefined, clearSearchField: undefined, mixRelatedCache: undefined, reduceMotion: undefined, tagList: undefined, tagPressed: undefined, withTagToggled: undefined, gridHelpers: undefined, gridActions: undefined, topsQueryParams: undefined, facetCountsSeq: undefined, VIEW_PILLS: undefined, catalogViews: undefined, TAGS_FIRST: undefined, catalogOnScreen: undefined, COMBO_LABELS: undefined, hideCatalogCombo: undefined, junkQueueHelpers: undefined, junkQueueActions: undefined };

export function dropOfflineFromDefaultLoc(){
  if(catalogState.initialParams.has('loc'))return;
  state.loc=onlineDefaultLoc(state.loc);notifyShell();
}

export function onlineDefaultLoc(loc) { return defaultLocations(loc,preferencesState.sourceOnline) }

export function homePath(filters=state) { return pathForCatalog(filters) }

export function resetHomeState() {
    writeShell(homeCatalogState(resetCatalogFilters(state,preferencesState.appSettings,receiptsState.rollSeed)));
  }

export function goHome(filters=null){
  resetHomeState();
  if(filters){Object.assign(state,filters);notifyShell()}
  navigationState.route(filters?homePath():'/');catalogState.clearSearchField();disposeStage(false);
  syncNavigation();buildBars();
}

export function openResourceCard(item,anchor=null){
  const id=item.id;
  if(!item.medium||item.medium==='video'){openItem(id,true,null,anchor);return}
  if(item.medium==='image'&&item.location!=='online'){
    window.open('/photo?id='+id,'_blank','noopener');return
  }
  toggleSelection(id);
}

export function mixRelated(seedId){
  if(!catalogState.mixRelatedCache.has(seedId))
    catalogState.mixRelatedCache.set(seedId,api('/api/related?id='+seedId+'&limit=28')
      .then(d=>(d.items||[]).filter(x=>x.id!==seedId))
      .catch(error=>{catalogState.mixRelatedCache.delete(seedId);throw error}));
  return catalogState.mixRelatedCache.get(seedId);
}

export function openGridCard(it,anchor){
  if(stageApi()?.miniplayerTakesCard(it)){stageApi().miniplayerPlay(it.id);return}
  openCardDetails(it,anchor);
}

function openCardDetails(it,anchor){
  if(it.edition_group){openEditions(it.edition_group.seed_id,it.id,true,anchor);return}
  if(it.part_group){openParts(it.part_group.seed_id,it.id,true,anchor);return}
  openItem(it.id,true,null,anchor);
}

export async function toggleWatchLater(it,onChange){
  try{
    const r=await api('/api/watch-later',{method:'POST',body:JSON.stringify({id:it.id})});
    it.watch_later=r.watch_later;onChange(!!r.watch_later);
    receiptsState.actionReceipt(r.watch_later?'Added to Watch later':'Removed from Watch later',{undo:async()=>{
      const restored=await api('/api/watch-later',{method:'POST',body:JSON.stringify({id:it.id})});
      it.watch_later=restored.watch_later;onChange(!!restored.watch_later);
    }});
  }catch(error){receiptsState.actionFailure('Update Watch later',error)}
}

export async function runResourceOperation(it,operation){
  try{
    await api('/api/batch',{method:'POST',body:JSON.stringify({ids:[it.id],operation})});
    await loadCatalog();
    const inverse=operation==='restore'?'dispose':'restore';
    receiptsState.actionReceipt(operation==='restore'?'Restored':'Moved to trash',{undo:async()=>{
      await api('/api/batch',{method:'POST',body:JSON.stringify({ids:[it.id],operation:inverse,
        ...(inverse==='dispose'?{disposal_reason:it.disposal_reason??null}:{})})});
      await loadCatalog();
    }});
  }catch(error){receiptsState.actionFailure('Actions',error);throw error}
}

export async function rateCatalogItem(it,star,onChange,signal){
  const before=Number(it.rating)||0,value=nextRating(before,star);
  const save=async(value,signal)=>{
    const result=await api('/api/feedback',{method:'POST',body:JSON.stringify({id:it.id,kind:'rate',value}),signal});
    const rating=result.rating??null;onChange(rating);return rating;
  };
  try{
    const rating=await save(value,signal);
    receiptsState.actionReceipt(rating?`Rated ${ratingStars(rating)} stars`:'Rating removed',{undo:()=>save(before)});
  }catch(error){if(!signal?.aborted)receiptsState.actionFailure('Rating',error);throw error}
}

export async function getBarsData(context){
  // JAV mode's top three layers and the filter panel must narrow along with it, or the list would show videos that appear only in a creator's own works
  // Performers and labels that open to an empty page. The criterion goes into the key; a different criterion is a different cache entry.
  const facetParams=new URLSearchParams();
  if(javActive())facetParams.set('jav','1');
  if(context.type==='entity'){
    facetParams.set('scope_kind',context.kind);facetParams.set('scope_name',context.name)
  }else if(context.type==='item')facetParams.set('id',String(context.id));
  // Status pages like flagged and watch-later are also a narrower set. Without it, the row of avatars above and
  // The tag strip uses whole-library terms: the people and tags it lists have zero videos on this page.
  if(context.type==='home'&&state.state)facetParams.set('state',state.state);
  if(context.type!=='item'){
    const filters=entityState.activeFilterState();
    ['loc','creator','studio','tag','tag_match','len','dur_min','dur_max','orient','region','year','q','thumb','folder','folder_recursive'].forEach(key=>{
      if(filters[key])facetParams.set(key,filters[key]);
    });
  }
  // The top three layers follow the shuffle's single seed; only a refresh actually changes the people.
  return fetchBars(facetParams.toString(),catalogState.topsQueryParams(context).toString());
}

export function applyFilterStateInPlace(filters){
  // The profile page item's pressed state is computed by the page from the filters on the address; the new filters were already pushed through `routeEntityPage`.
  if(currentBarsContext().type!=='entity')paintCatalogFilter({tags:catalogTags(filters)});
  // The pressed state and duration ends of the sidebar groups are drawn by the sidebar from this filter; the members do not move.
  paintSidebar({filters:{...filters}});
  renderCombo();
}

export async function refreshFacetCounts(context){
  const seq=++catalogState.facetCountsSeq;
  const [facetData]=await getBarsData(context);
  if(seq!==catalogState.facetCountsSeq)return;
  if(context.type==='home')mediaState.facets=facetData;
  // Entries missing from the roster are recorded as 0 by the island; 'Expand all' unfolds against this same copy.
  paintSidebar({latest:sidebarFacets(facetData,context)});
}

export function commitContextFilter(mutate){
  const context=currentBarsContext();
  if(context.type==='entity'){
    // Tags are video filters and tapping one returns to the video view: staying in photos or the roster would neither apply it nor keep the tag bar consistent.
    const filters={...context.filters};mutate(filters);
    routeEntityPage(context.kind,context.name,filters);
    applyFilterStateInPlace(filters);refreshFacetCounts(currentBarsContext());return
  }
  if(context.type==='item'){
    // Returning from detail to list is a context change, not a filter change: those rows would be redrawn for the new context anyway.
    const target=entityState.cloneBarsContext(detailReturnBarsContext);
    disposeStage(false);writeShell({detailReturnBarsContext:null});
    if(target&&target.type==='entity'){
      mutate(target.filters);
      // The page beneath the details is usually still mounted, so pushing the new filters is enough; a deep-linked detail has nothing beneath it, so reopen from the new address.
      if(routeEntityPage(target.kind,target.name,target.filters))buildBars();
      else writeShell({pageOpens:pageOpens+1});
      return
    }
    mutate(state);writeShell({barsContext:{type:'home',filters:state}});navigationState.route(homePath());showHomeSurfaces();
    buildBars();return
  }
  mutate(state);notifyShell();navigationState.route(homePath());
  applyFilterStateInPlace(state);refreshFacetCounts(barsContext);
}

export function catalogFilterBase(){
  return {tiers:null,tiersPending:false,empty:false,tags:[],tagFirst:catalogState.TAGS_FIRST,views:catalogState.catalogViews(),state:'',count:null,
    trash:false,sorts:[],layout:null,refreshing:false,offscreen:false,combo:[],comboHidden:true,comboHost:$('#combo'),
    actions:catalogFilterActions(),
    helpers:{wireDrag,wireScroller:row=>{if(row)wireHorizontalScroller(row)}}};
}

export function syncCatalogFilterScreen(){if(catalogState.catalogFilterProps)paintCatalogFilter({})}

export function paintCatalogFilter(patch){
  const host=$('#catalogFilter');
  /* When collapsed the island keeps only the two avatar rows: the overlay's rows and those on profile and index pages are one set of controls, and hiding a copy means two identical ones,
     with readout shimmers that never arrive hanging on the page forever. When collapsed it likewise lays no static skeleton. */
  const offscreen=host.style.display==='none'||document.body.matches('.entity-open,.index-open');
  patch={...patch,offscreen};
  catalogState.catalogFilterProps={...(catalogState.catalogFilterProps||catalogFilterBase()),...patch};
  if(catalogState.catalogFilterMounting)return;
  if(managedTaken(host)){updateManagedRoute(host,patch);return}
  if(!host.firstChild&&!offscreen){host.innerHTML=catalogFilterSkeletonHtml(catalogState.catalogViews(),catalogState.catalogFilterProps.state,catalogHeadProps());fitSkeleton(host)}
  /* Resident: it does not collapse on page change, so the current page is not checked. */
  catalogState.catalogFilterMounting=openManagedRoute('catalog-filter',catalogState.catalogFilterProps,{container:host,isCurrent:()=>true})
    .then(()=>updateManagedRoute(host,catalogState.catalogFilterProps))
    .finally(()=>{catalogState.catalogFilterMounting=null});
}

export function catalogFilterActions(){
  return {
    currentHref:()=>{
      const href=new URL(homePath(),location.origin);
      href.searchParams.set('loc',state.loc||'');
      href.searchParams.set('thumb',state.thumb||'0');
      href.searchParams.set('sort',state.sort||'');
      href.searchParams.set('dir',state.dir||'');
      return href.pathname+href.search;
    },
    openEntity:(kind,name)=>openEntity(kind,name),
    /* Pressing pushes the new pressed state on the spot and the sliding glass follows; it does not wait for this fetch. */
    setView:view=>{
      state.state=view;notifyShell();paintCatalogFilter({state:view});
      navigationState.route(homePath());buildBars();
    },
    toggleTag:tag=>toggleTag(tag),
    clearFilter:key=>commitContextFilter(filters=>{filters[key]=''}),
    clearAll:()=>commitContextFilter(filters=>{filters.tag='';filters.creator='';filters.studio='';filters.owner=''}),
    setSort:key=>{
      const next=nextSortState(key,state.sort,state.dir);
      if(!next)return;
      state.sort=next.sort;state.dir=next.dir;notifyShell();replaceCatalogAddress();
    },
    reshuffle:()=>refreshAll(),
    setLayout:value=>{if(javActive())setJavLayout(value);else setHomeLayout(value)},
    /* Each row records its own page number: the rows' lengths differ, and sharing one counter would let the row that reached its end flip the other row's pages.
       Page numbers follow this list, counting from the start when `buildBars` swaps lists. When both rows reach the same page, `fetchTopsPage` shares one request. */
    moreTops:async kind=>{
      const pages=catalogState.catalogTopsPages;if(!pages)return [];
      const rows=(await fetchTopsPage(catalogState.topsQueryParams(pages.context,++pages[kind]).toString()))[kind]||[];
      return kind==='performers'?rows.map(tierPerformer):rows.map(tierStudio);
    },
  };
}

export function catalogLayoutProp(){
  if(javActive())return {name:'jav-layout',label:'JAV card layout',value:javLayout(),options:JAV_LAYOUTS};
  if(homeLayoutActive())return {name:'home-layout',label:'Home card layout',value:cardLayout(),options:JAV_LAYOUTS};
  return null;
}

export function catalogHeadProps(){
  return {sorts:sortKeys(state.sort,state.dir),layout:catalogLayoutProp(),
    state:state.state||'',trash:state.state==='trash'};
}

export function catalogTags(filters){
  return catalogState.catalogTagRows.map(row=>({...row,selected:catalogState.tagPressed(filters.tag,row.k)}));
}

export function tierPerformer(x){
  return {name:x.k,ringHtml:`<span data-tier-initial>${esc(firstGrapheme(entityDisplayName('performer',x.k,x.id)))}</span>${entityFaceImg(
    {id:x.id,hasImage:x.has_image,version:x.image_version,rep:x.has_avatar?x.rep:null,style:facePos(x.avatar_focus),focus:x.avatar_focus,
      standIn:x.avatar_stand_in})}`};
}

export function tierStudio(x){
  return {name:x.k,fallback:leadingGraphemes(x.k,2),
    logo:x.has_logo?logoUrl(x.k,'icon',x.logo_version):''};
}

export function renderBarsLoading(filterState,requestSeq){
  catalogState.barsPendingSeq=requestSeq;
  if(catalogState.catalogFilterProps?.tiers){paintCatalogFilter({tiersPending:true,state:filterState.state||''});return}
  catalogState.barsRendered='';
  paintCatalogFilter({tiers:null,tiersPending:true,state:filterState.state||''});
}

/* The two avatar rows show busy only when a fetch is genuinely in flight: if that round is invalidated (a page change pushed the sequence forward) or fails and no later round
   picks the fetch back up, the busy state is cleared by it; pages that do not fetch avatars (video wall, video pages) never show it. */
function releaseBarsPending(requestSeq){
  if(catalogState.barsPendingSeq!==requestSeq)return;
  catalogState.barsPendingSeq=0;
  paintCatalogFilter({tiersPending:false});
}

export async function buildBars(){
  const requestSeq=++catalogState.barsRequestSeq;
  paintSidebar();
  if(!sidebarHasCatalogContent(location.pathname))return;
  /* The details overlay is a modal covering the whole page: while it is open, not one cell of the two avatar rows, tag bar, and drawers is visible.
     Fetching another aggregate scoped to this one video just to serve them only evicts the list's cache; closing details
     rebuilds the whole avatar row together with its `<img>` tags, and what the person sees is "clicked in and backed out, and the page refreshed itself".
     So details never touch the surface's items; the list's scope and that cache stay as they are, waiting for them to come back. */
  if(barsContext.type==='item')return;
  const context=currentBarsContext(),filterState=entityState.activeFilterState();
  const signature=JSON.stringify([context,filterState,state.state||'',state.seed||'',javActive()]);
  renderBarsLoading(filterState,requestSeq);
  // The two aggregate queries are independent. Each takes about 1 second on a cold start; serializing them leaves the phone's first screen waiting for nothing;
  // Fetch in parallel, then draw the top bar and the drawer in one pass.
  let bars;
  try{bars=await getBarsData(context)}catch(error){releaseBarsPending(requestSeq);throw error}
  const [facetData,tops]=bars;
  if(requestSeq!==catalogState.barsRequestSeq){releaseBarsPending(requestSeq);return}
  /* When scope and data match the last time, the painted HTML is the same string. Assigning innerHTML anyway only buys rebuilding the whole avatar row
     together with its `<img>` tags and re-decoding, and on screen that is a white flash; every one in this row is an image. Compare data, not time: after ten minutes in details,
     what comes back is most likely still the same copy. */
  const rendered=signature+'\n'+JSON.stringify([facetData,tops]);
  /* The top rows stay as they are; when the sidebar switched pages midway (details opened and closed) it has already collapsed back to navigation only, and the same grouping is pushed back in. */
  if(rendered===catalogState.barsRendered){
    catalogState.barsPendingSeq=0;
    paintCatalogFilter({tiersPending:false});
    if(layoutState.sidebarCatalog)paintSidebar({content:layoutState.sidebarCatalog,filters:{...filterState}});
    return;
  }
  catalogState.barsRendered=rendered;
  if(context.type==='home')mediaState.facets=facetData;
  const topTags=facetData.tags||[];

  /* The top three layers: performer round avatars / labels / content tags. The representatives table only includes those with a genuinely fetchable avatar; see
     `frontend/src/card-art/representatives.ts` for the filter. */
  rememberRepresentatives(tops.performers);
  rememberRepresentatives(tops.studios);
  // "Both rows empty" now only happens when the whole library truly has no one: narrow sets already fall back to the library-wide scope in loadTops.
  const emptyHome=context.type==='home'&&!javActive()&&!state.state&&!state.q&&!facetData.locations.some(row=>row.n>0);
  catalogState.catalogTopsPages={context,performers:0,studios:0};
  /* The ones you added lead the row, in the order added. They are not necessarily in the drawn batch and may not rank at all,
     since people arrive from a card or details page. The row scrolls horizontally, and an applied tag at position thirty is as
     good as invisible: to remove the one just added you would have to shove the whole row over to find it.
     The rest of the first screen is filled by that batch's sample, and "Shuffle" shuffles exactly those members. What
     continues past it is what remains outside the batch, read from most to fewest: the sample only decides who shows first,
     and the order after that is not its business.
     Tags carry how many this tag holds, on the same basis as the profile page's filter bar; an applied tag outside this batch
     prints no number (`n` empty). */
  const appliedKeys=catalogState.tagList(filterState.tag);
  const byTagKey=new Map(topTags.map(row=>[row.k,row]));
  const appliedTags=appliedKeys.map(k=>byTagKey.get(k)||{k});
  const tagPool=topTags.filter(row=>!appliedKeys.includes(row.k));
  const pickedTags=receiptsState.seededSample(tagPool,catalogState.TAGS_FIRST,`tags:${state.seed||''}`);
  const pickedKeys=new Set(pickedTags.map(row=>row.k));
  catalogState.catalogTagRows=appliedTags.concat(pickedTags,tagPool.filter(row=>!pickedKeys.has(row.k)))
    .map(row=>({k:row.k,label:tagLabel(row.k),n:row.n??null}));
  catalogState.barsPendingSeq=0;
  paintCatalogFilter({
    tiers:{key:String(catalogState.barsRequestSeq),performers:tops.performers.map(tierPerformer),studios:tops.studios.map(tierStudio)},
    tiersPending:false,
    empty:emptyHome,tags:catalogTags(filterState),tagFirst:appliedTags.length+pickedTags.length,
    views:catalogState.catalogViews(),state:filterState.state||'',
  });
  renderCombo();
  /* The sidebar's groups are swapped for this aggregation: `key` changes, the island re-derives each group's open state from the new pressed state, and the count badges use the previous value to decide whether to pop. */
  layoutState.sidebarCatalog={kind:'catalog',key:String(++layoutState.sidebarContentSeq),facets:sidebarFacets(facetData,context)};
  paintSidebar({content:layoutState.sidebarCatalog,filters:{...filterState},latest:null});
}

export function paintCatalogCount(nextTotal,n){
  mediaState.total=nextTotal;
  /* The trash's readout lives in the page header's caption line (with 'Empty trash' at the right end), drawn by the header island. */
  if(state.state==='trash')selectionState.trashCount={total: mediaState.total,shown:n};
  buildManageBar();
  paintCatalogFilter({count:{total: mediaState.total,shown:n}});
}

export function emptyTrash(){
  return confirmModal({title:'Empty trash',body:'All files and library records in trash will be permanently deleted and cannot be recovered.',confirmLabel:'Empty trash',danger:true,onConfirm:async()=>{
    try{
      const r=await api('/api/trash/empty',{method:'POST'});
      /* Files that cannot be deleted (in use, cloud drive offline) stay in trash together with their database rows; this must be stated,
         otherwise seeing the entries still there makes the user think emptying failed again. */
      if(r.blocked&&r.blocked.length)throw new Error(`Permanently deleted ${r.purged} items; ${r.blocked.length} could not be deleted and remain in trash:\n`
        +r.blocked.slice(0,5).map(x=>`${x.path} (${x.reason})`).join('\n'));
      receiptsState.actionReceipt(`Permanently deleted ${r.purged} items`);
    }finally{await loadCatalog()}
  }});
}

export function toggleTag(t){commitContextFilter(filters=>{filters.tag=t?catalogState.withTagToggled(filters.tag,t):''})}

export function comboItems(filters){
  const items=[];
  if(filters.creator)items.push({kind:'clear',key:'creator',label:`${catalogState.COMBO_LABELS.creator} ${filters.creator}`});
  if(filters.studio)items.push({kind:'clear',key:'studio',label:`${catalogState.COMBO_LABELS.studio} ${filters.studio}`});
  if(filters.owner==='none')items.push({kind:'clear',key:'owner',label:`${catalogState.COMBO_LABELS.owner} unassigned`});
  if(filters.year)items.push({kind:'clear',key:'year',label:`Release year ${filters.year.split(',').map(year=>year==='none'?'unknown year':year).join(', ')}`});
  catalogState.tagList(filters.tag).forEach(t=>items.push({kind:'untag',key:t,label:tagLabel(t)}));
  return items;
}

export function renderCombo(){
  paintCatalogFilter({combo:comboItems(state),comboHidden:!catalogState.catalogOnScreen()});
}

export async function loadCatalog(){
  const surface=navigationState.claimSurface(navigationState.surfacePath());
  /* The new releases row only appears on catalog paths: manage pages, trash, and the like answer other questions, and a row saying "what's new out there"
     placed there is just noise. Leaving the catalog must explicitly retract it; it is a fixed child of `#main`, and nobody retracting means
     it hangs there forever. */
  writeShell({barsContext:{type:'home',filters:state},detailReturnBarsContext:null});disposeStage(false);
  if(state.state==='ads')return loadJunk(surface);
  // Unmounting the junk queue must happen before the skeleton is laid: its count row also lives in `#count`, and laying first would wash away the cell it holds.
  if(catalogState.controller.page==='/junk-files')clearCatalogGrid();
  renderCatalogLoading();
  showHomeSurfaces();
  const painting=paintCatalogGrid(surface);
  if(isFeedNewPath(location.pathname)&&state.browse!=='folders'){
    renderHomeFeed();
  }else clearHomeFeed();
  renderCombo();
  $('#count').classList.remove('manage-static','junkcount');
  return painting;
}

export function settleCatalog(revision) { catalogState.controller.settle(revision) }

export function clearCatalogGrid() {
    const grid=$('#grid');releaseHoverPreviews(grid);releaseManagedRoute(grid);
    catalogState.controller.clear();grid.innerHTML='';
  }

export function paintCatalogGrid(surface){return paintGridPage('/',catalogGridProps,surface,{place:revealRoutedPage})}

export function paintJunkQueue(surface){return paintGridPage('/junk-files',junkQueueProps,surface)}

export function gridPainted(){return !!managedEntry($('#grid'))}

export function gridTaken() { return catalogState.controller.taken(gridPainted()) }

export function pushGridPage(patch){updateManagedRoute($('#grid'),patch)}

export function paintGridPage(page,propsFor,surface,options={}) {
    const grid=$('#grid');
    if(catalogState.controller.page&&catalogState.controller.page!==page)clearCatalogGrid();
    const render=catalogState.controller.begin(page,gridPainted());
    const props=propsFor();
    if(!render.mount){pushGridPage(props);return render.settled}
    releaseHoverPreviews(grid);
    // The cancel signal revokes the actual managed prefetch; it is not enough to merely stop the late callback from painting.
    const abort=()=>releaseManagedRoute(grid);
    render.signal.addEventListener('abort',abort,{once:true});
    const painting=openManagedRoute(page,props,{...options,container:grid,isCurrent:()=>navigationState.surfaceCurrent(surface)&&render.isCurrent()});
    painting.catch(error=>console.error(error)).finally(()=>{
      render.signal.removeEventListener('abort',abort);render.finish(gridPainted());
    });
    return render.settled;
  }

export function catalogGridLayout(){
  const home=homeLayoutActive();
  return gridLayout({active:javActive()||home,home,portrait:state.orient==='Portrait'});
}

export function catalogSkeletonHtml(label='Loading videos'){
  return catalogContentSkeletonHtml(label,catalogCardRatio());
}

export function catalogCardRatio(){
  if(!state)return 16/9;
  return cardRatio(catalogGridLayout());
}

export function repaintCatalogGrid(){
  if(gridTaken()){
    releaseHoverPreviews($('#grid'));
    pushGridPage({layout:catalogGridLayout(),seekSeconds:preferencesState.appSettings.seekSeconds});
  }
  if(!entityState.entityPageCurrent())return;
  releaseHoverPreviews($('#index [data-entity-hero]'));
  pushEntityPage({layout:catalogGridLayout(),seekSeconds:preferencesState.appSettings.seekSeconds});
}

export function catalogGridProps(){
  const path=decodeURIComponent(location.pathname),home=isCatalogPath(path),trash=state.state==='trash';
  return {
    mode:'catalog',helpers:catalogState.gridHelpers,actions:catalogState.gridActions,layout:catalogGridLayout(),
    wall:path==='/wall',
    restoreNavigation:restoringPage(),
    selectMode,selected:new Set(selected),seekSeconds:preferencesState.appSettings.seekSeconds,revision:catalogState.controller.revision,
    wireDrag,settled:settleCatalog,
    skeletonHtml:()=>catalogSkeletonHtml(),
    filters:{...state},batchSize:preferencesState.appSettings.batchSize,groupCollapse:preferencesState.appSettings.groupCollapse,
    /* Only the home page's default list excludes verticals, because a separate vertical strip there catches them. Search must reach vertical videos,
       otherwise finding a vertical video by name returns 0 results. JAV mode never includes verticals: code releases are landscape by nature. */
    excludeVertical:(home&&path!=='/wall'&&!state.q&&!state.orient&&state.browse!=='folders')||state.jav==='1',
    mix:home&&path!=='/wall'&&!trash&&state.browse!=='folders',
    /* JAV mode does not insert the vertical strip: the main list's exclude_vertical does not govern it; it is a separate request, inserted separately. */
    shorts:home&&path!=='/wall'&&!javActive()&&state.orient!=='Portrait'&&!trash&&state.browse!=='folders',
    countRow:$('#count'),onCount:paintCatalogCount,onCountFailed:()=>paintCatalogFilter({count:false}),
    emptyHtml:({trash:inTrash,libraryEmpty})=>inTrash
      ?preferencesState.emptyState('trash','Trash is empty','Deleted content lands here first; empty it only after confirming it is no longer needed.')
      :catalogEmptyHtml({jav:javActive()&&!libraryEmpty,configurable:runtimeConfigurable,filtered:!libraryEmpty}),
    canLoadMore:()=>$('#stats').hidden&&$('#index').hidden,
  };
}

export function loadJunk(surface){
  const count=$('#count');
  const live=catalogState.controller.page==='/junk-files'&&gridPainted()&&!catalogState.controller.pending
    &&count.querySelector(':scope > .peach-react:not([data-junk-count-skeleton])');
  if(!live){clearCatalogGrid();renderCatalogLoading('Reading junk files')}
  showHomeSurfaces();
  renderCombo();
  // Junk files are a one-by-one disposition queue; the count only describes the current queue, it is not a sorting tool to browse along.
  count.classList.add('manage-static','junkcount');
  count.classList.remove('is-stuck');
  return paintJunkQueue(surface);
}

export async function runJunkOperation(it,operation){
  const ids=[it.id],disposed=operation==='dispose',reconsidered=operation==='reconsider-junk';
  try{
    await api('/api/batch',{method:'POST',body:JSON.stringify({ids,operation,
      ...(disposed?{disposal_reason:'junk'}:{})})});
    await loadCatalog();
    const inverse=disposed?'restore':reconsidered?'dismiss-junk':'reconsider-junk';
    receiptsState.actionReceipt(disposed?'Moved to trash':reconsidered?'Re-added to junk detection':'Marked as not junk',{undo:async()=>{
      await api('/api/batch',{method:'POST',body:JSON.stringify({ids,operation:inverse})});
      await loadCatalog();
    }});
  }catch(error){receiptsState.actionFailure('Actions',error);throw error}
}

export function junkQueueProps(){
  return {
    ...junkRoute(location.search),helpers:catalogState.junkQueueHelpers,actions:catalogState.junkQueueActions,
    batchSize:preferencesState.appSettings.batchSize,revision:catalogState.controller.revision,selectMode,selected:new Set(selected),
    countRow:$('#count'),settled:settleCatalog,
    skeletonHtml:()=>pageSkeletonHtml('Reading junk files',{cards:true,className:'catalog-skeleton postercard-skeleton'}),
    canLoadMore:()=>$('#stats').hidden&&$('#index').hidden,
  };
}

export function installCatalog7() {
    catalogState.initialParams = new URLSearchParams(location.search);
    catalogState.resolveSort = (sort,dir,fallback=preferencesState.appSettings.defaultSort)=>resolveSort(sort,dir,preferencesState.appSettings,fallback);
    writeShell(homeCatalogState(initialCatalogFilters(location,preferencesState.appSettings,receiptsState.rollSeed)));
    catalogState.searchValueSnapshot={text:'',scrollLeft:0};
    catalogState.cancelSearchDissolve=()=>{};
    catalogState.rememberSearchValue=(input=$('#q'))=>{catalogState.searchValueSnapshot={text:input?.value||'',scrollLeft:input?.scrollLeft||0}};
    catalogState.clearSearchField=(snapshot=null)=>{
      const input=$('#q');if(!input)return;
      const live={text:input.value,scrollLeft:input.scrollLeft||0};
      const previous=snapshot||(live.text?live:catalogState.searchValueSnapshot);
      catalogState.cancelSearchDissolve();
      catalogState.cancelSearchDissolve=dissolveValue(input,input.parentElement,previous);
      catalogState.searchValueSnapshot={text:'',scrollLeft:0};
    };
  }

export function installCatalog12() {
applicationEffects.handler($('#wallBtn'), 'onclick', ()=>{
  setSelectMode(false,true);
  const context=currentBarsContext(),filters={...entityState.activeFilterState(),jav:javActive()?'1':''};
  if(context.type==='entity'&&context.kind!=='tag')filters[context.kind]=context.name;
  navigationState.navigatePath(wallAddress(undefined,filters));
});
catalogState.mixRelatedCache = new Map();
catalogState.reduceMotion = ()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
catalogState.tagList = (value=state.tag)=>String(value||'').split(',').filter(Boolean);
catalogState.tagPressed = (value,tag)=>catalogState.tagList(value).includes(String(tag));
catalogState.withTagToggled = (value,tag)=>{const cur=catalogState.tagList(value);const index=cur.indexOf(tag);
  if(index>=0)cur.splice(index,1);else cur.push(tag);return cur.join(',')};
catalogState.gridHelpers = {
  badgeHtml:(location,cost)=>preferencesState.srcBadge(location,cost),
  titleHtml:(it,raw)=>javTitleHtml(it,raw),
  displayName:(it,raw)=>javDisplayName(it,raw),
  tagLabel:tag=>tagLabel(tag),
};
catalogState.gridActions = {
  wallPlayer:async(it,frame,signal)=>{
    const stage=await loadStage(mediaState.stageHost);
    signal.throwIfAborted();
    return stage.mountWallPlayer(it,frame,signal);
  },
  wallDetails:openCardDetails,
  open:(it,anchor)=>openGridCard(it,anchor),
  openResource:(it,anchor)=>stageApi()?.miniplayerTakesCard(it)?stageApi().miniplayerPlay(it.id):openResourceCard(it,anchor),
  openShort:it=>stageApi()?.miniplayerTakesCard(it)?stageApi().miniplayerPlay(it.id):openTok(it.id),
  openShorts:()=>openTok(),
  openMix:(seedId,anchor)=>openMix(seedId,seedId,true,anchor),
  openEntity:(kind,name)=>openEntity(kind,name),
  openUnowned:()=>goHome({owner:'none'}),
  /* A card's tag means "only this tag", and tapping again cancels it when already filtering. It takes effect on whichever screen it was tapped on. */
  toggleTag:tag=>{
    commitContextFilter(filters=>{filters.tag=catalogState.tagPressed(filters.tag,tag)?'':tag});
  },
  toggleSelection:(id,range)=>toggleSelection(id,range),
  watchLater:(it,onChange)=>toggleWatchLater(it,onChange),
  rate:(it,star,onChange,signal)=>rateCatalogItem(it,star,onChange,signal),
  resourceOperation:(it,operation)=>runResourceOperation(it,operation),
  mixRelated:seedId=>mixRelated(seedId),
  canFlip:()=>!selectMode&&!censorOn()&&!window.__scrolling&&!catalogState.reduceMotion(),
};
catalogState.topsQueryParams = (context,page=0)=>{
  const params=new URLSearchParams({n:'60',seed:state.seed||''});
  if(page)params.set('page',String(page));
  if(javActive())params.set('jav','1');
  if(context.type==='home'&&state.state)params.set('state',state.state);
  if(context.type==='home'&&state.folder){params.set('folder',state.folder);if(state.folder_recursive)params.set('folder_recursive',state.folder_recursive)}
  return params;
};
catalogState.facetCountsSeq = 0;
catalogState.VIEW_PILLS = [{k:'',label:'All'},{k:'fresh',label:'Not watched'},
                  {k:'later',label:'Watch later'},{k:'flagged',label:'Marked'}];
catalogState.catalogViews = ()=>catalogState.VIEW_PILLS.map(v=>({...v,href:v.k?STATE_ROUTES[v.k]:'/'}));
catalogState.TAGS_FIRST = 26;
applicationEffects.listen($('#catalogFilter'), 'click', event=>{
  const view=event.target.closest?.('[data-catalog-view]');
  if(!view||event.defaultPrevented)return;
  event.preventDefault();catalogFilterActions().setView(view.dataset.catalogView);
});
catalogState.catalogOnScreen = ()=>$('#index').hidden&&$('#stats').hidden;
catalogState.COMBO_LABELS = {creator:'Creators',studio:'Labels',owner:'Attribution'};
catalogState.hideCatalogCombo = ()=>{if(catalogState.catalogFilterProps)paintCatalogFilter({comboHidden:true})};
}

export function installCatalog19() {
catalogState.junkQueueHelpers = {badgeHtml:(location,cost)=>preferencesState.srcBadge(location,cost)};
catalogState.junkQueueActions = {
  /* Switch category, switch view: collapse multi-select first, then change the address, and the catalog element re-reads. */
  navigate:path=>{if(selectMode)setSelectMode(false,true);navigationState.route(path)},
  toggleSelection:(id,range)=>toggleSelection(id,range),
  open:(it,anchor)=>it.junk_kind==='image'
    ?window.open('/photo?id='+it.id,'_blank','noopener'):openItem(it.id,true,null,anchor),
  /* A successful locate is reported by Toast and the card's status line stays empty; failure writes the reason back to the status line. */
  reveal:async it=>{
    try{await api('/api/reveal',{method:'POST',body:JSON.stringify({id:it.id})});receiptsState.toast({text:'Revealed in File Explorer'});return ''}
    catch(error){return entityState.sourceHint(error.message)}
  },
  operate:(it,operation)=>runJunkOperation(it,operation),
};
}

catalogState.controller = new CatalogController();
