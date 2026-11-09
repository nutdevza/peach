/* layout domain controller: this domain's state and actions; startup installs them together through Application's lifecycle. */
import { javCardPage } from '../jav-controls';
import { DIRECT_MANAGE_NAV, MANAGE_MENU_SECTIONS, MANAGE_SECTIONS, NAV_CATALOG, OPTIONAL_SIDEBAR_ITEMS, SIDEBAR_ITEMS, getManageMenuSections } from './navigation-items';
import { FOLLOW_INITIAL_RANGE_OPTIONS } from './initial-follow-ranges';
import { noteHtml, revealTexts } from '../ui-kit';
import { $, ROUTE_ENTITIES, STATE_LABELS, STATE_ROUTES, api, isCatalogPath } from '../core';
import { buildBars, catalogLayoutProp, catalogState, clearCatalogGrid, commitContextFilter, emptyTrash, goHome, homePath, loadCatalog, paintCatalogFilter, repaintCatalogGrid, syncCatalogFilterScreen } from './catalog.js';
import { rememberedSidebarPath, requestPageTop } from '../history/page-navigation';
import { navigationState, openRoutedPage, paintSidebar, syncNavigation } from './navigation.js';
import { paintManagementPlaceholder } from './../management-placeholder';
import { hideDiscoveryBars } from './loading.js';
import { releaseManagedRoute } from './../history/managed';
import { isFeedNewPath } from './feed.js';
import { tagLabel } from '../core/tags';
import { followFeedLive, followState, followView, followViewPath, routeFollowFeed } from './follow.js';
import { applicationEffects } from './effects';
import { entityJavLayout, notifyShell, pageOpens, runtimeConfigurable, selectMode, selectSurface, state, writeShell } from './../shell/index';
import { censorOn, preferencesState, setCensored, setHighContrast, setSfwShortcut, sfwShortcut } from './preferences.js';
import { playUiSound } from '../ui-kit/sounds';
import { THEME_OPTIONS } from './../appearance/theme';
import { JAV_LAYOUTS, cardLayoutFor, storeHomeLayout, storeJavLayout, storeVideoLayout } from './../appearance/layout';
import { receiptsState } from './receipts.js';
import { applySyncedSettings } from './../appearance/settings';
import { loadManageHeader, loadSettingsPanel, loadSidebar, manageHeaderApi, sidebarApi } from '../react/application-residents';
import { sidebarSkeletonHtml } from './../sidebar-skeleton';
import { selectionState, setSelectMode } from './selection.js';
import { manageHeaderSkeletonHtml, manageHeaderView } from './../manage-header';
import { junkPath } from './../junk-queue';
import { JAV_RELEASE_SORT, SORTS } from './../sort-preferences';
import { dropBars } from './../catalog-bars';
import { entityState, pushEntityPage, syncPhotoWalls } from './entity.js';
import { routeMetaOf } from './../history/route-meta';
import { peachHistory, shellNavigate, isPreferencePath, preferenceSection, settingsPath, settingsBackgroundOf } from '../history';
import { filterScrollState } from './filter-scroll.js';
import { releaseHoverPreviews } from './../card-art/hover';
export const layoutState = { sidebarProps: undefined, sidebarSurface: undefined, sidebarCatalog: undefined, sidebarContentSeq: undefined, SIDEBAR_ITEMS: undefined, MANAGE_SECTIONS: undefined, MANAGE_MENU_SECTIONS: undefined, manageMenuSections: undefined, OPTIONAL_SIDEBAR_ITEMS: undefined, NAV_CATALOG: undefined, DIRECT_MANAGE_NAV: undefined, settingsHost: undefined, lastManagePageLabel: undefined, manageHeaderSkeleton: undefined, manageHeaderRoot: undefined, scrollT: undefined, stickyFrame: undefined, mobileFilterScroll: undefined, mobileFilterHost: undefined, mobileFilterPath: undefined };

export function ledgerGateNote(runtime,message,actionLabel,actionHref){
  return noteHtml(message,{variant:runtime?.ledger_sync==='conflict'?'warning':'secondary',
    className:'runtimegate',actionLabel:actionHref?actionLabel:'',actionHref});
}

export function showManagementBody({manage=true,placeholder=''}={}){
  $('#stats').hidden=false;$('#index').hidden=true;clearCatalogGrid();
  $('#count').textContent='';$('#loadSentinel').hidden=true;
  if(manage)buildManageBar();
  else{paintManageHeader('');syncNavigation()}
  // If the same skeleton is already on screen, do not repaint (`paintManagementPlaceholder`).
  if(placeholder)paintManagementPlaceholder($('#stats'),placeholder);
}

export function enterManagementSurface(){
  $('#javLibraryHeader').hidden=true;
  catalogState.hideCatalogCombo();
  hideDiscoveryBars();
  document.body.classList.remove('entity-open','index-open');
}

export function showHomeSurfaces(){
  $('#javLibraryHeader').hidden=!isCatalogPath(location.pathname)||!javActive();
  // Both classes must be cleared: removing only entity-open leaves the top bar empty for good when going from the index page back home,
  // Also, the style.display='' line below cannot restore elements hidden by a class.
  document.body.classList.remove('entity-open','index-open');
  /* Both the index page and the profile page are rendered into #index by the route tree, and both paths pass through here before laying the skeleton: covering it outright would leave the previous page's
     React subtree unmounted, keeping a root managing nodes no longer on the page. This only reclaims the `#index` page; the admin
     `#stats` page is untouched (when the profile page covers it, it hides and stays alive). */
  releaseManagedRoute($('#index'));
  $('#stats').hidden=true;$('#index').hidden=true;
  if(!isFeedNewPath(location.pathname))$('#feedNew').hidden=true;
  $('#catalogFilter').style.display='';syncCatalogFilterScreen();
  buildManageBar();paintListTitle();   // Placed last: the admin area must cover the home banner restored just above
}

export function closeStats(){navigationState.route('/');showHomeSurfaces()}

export function renderFollowDrawer({tags=[],providers=[],duration=false}){
  const content=tags.length||providers.length||duration?{kind:'follow',
    tags:tags.map(([tag,n])=>({value:tag,label:tagLabel(tag),n})),selected:[...followState.followTags],
    providers:providers.map(([value,label,src])=>({value,label,n:null,...(src?{dot:{kind:'image',src}}:{})})),
    duration}:null;
  paintSidebar({content,filters:followState.followSidebarFilters()});
}

export function routeFollowFromSidebar(patch){
  routeFollowFeed({...followView(),...patch});
  paintSidebar({filters:followState.followSidebarFilters()});
}

export function narrowShell(){return matchMedia('(max-width:760px)').matches}

export function openDrawer(v){const drawer=$('#drawer'),restore=!v&&drawer.contains(document.activeElement);
  drawer.inert=!v&&narrowShell();
  drawer.classList.toggle('open',v);$('#scrim').classList.toggle('on',v);
  document.body.classList.toggle('drawer-open',!!v);document.dispatchEvent(new Event('board:sidebar'));
  $('#filterBtn').setAttribute('aria-expanded',String(!!v));$('#filterBtn').setAttribute('aria-controls','drawer');$('#filterBtn').setAttribute('aria-label',v?'Collapse the sidebar':'Expand the sidebar');
  if(restore)$('#filterBtn').focus();sessionStorage.setItem('board.sidebar',v?'open':'closed')}

export function closeDrawerAfterNav(){if(narrowShell())openDrawer(false)}

export function probeConfigurable(){
  if(runtimeConfigurable!==null)return;
  writeShell({runtimeConfigurable:false});
  api('/healthz').then(runtime=>{
    writeShell({runtimeConfigurable:!!runtime.configurable});
    if(runtimeConfigurable&&manageSection())buildManageBar();
  }).catch(()=>{});
}

export function openSettings(section='',fromRoute=false){
  if(!fromRoute&&!isPreferencePath(location.pathname)){
    const navigation=peachHistory.navigation;
    peachHistory.push(settingsPath(section),{settingsBackground:{pathname:location.pathname,search:location.search,state:navigation.location.state,seq:navigation.seq}});
  }else if(!fromRoute&&section){
    shellNavigate(settingsPath(section),{replace:true,state:peachHistory.navigation.location.state});
  }
  section=section||preferenceSection(location.pathname);
  return loadSettingsPanel(layoutState.settingsHost()).then(panel=>{panel.open(section);return panel});
}

export function closeSettingsRoute(){
  if(!isPreferencePath(location.pathname))return;
  if(settingsBackgroundOf(peachHistory.navigation.location.state))peachHistory.go(-1);
  else navigationState.navigatePath('/',true);
}

export function sidebarHost(){
  return {
    scroll:$('#drawerScroll'),store:preferencesState.settingsStore,navCatalog:layoutState.NAV_CATALOG,
    navOn,navTo,navToTop:()=>{closeDrawerAfterNav();requestPageTop()},
    toggleChip:(key,value,multi)=>commitContextFilter(filters=>{
      if(multi){const cur=String(filters[key]||'').split(',').filter(Boolean);
        const i=cur.indexOf(value);if(i>=0)cur.splice(i,1);else cur.push(value);filters[key]=cur.join(',')}
      else filters[key]=filters[key]===value?'':value
    }),
    setDuration:(lo,hi)=>commitContextFilter(filters=>{
      filters.len='';filters.dur_min=lo?String(lo*60):'';filters.dur_max=hi<180?String(hi*60):''}),
    openFollowTag:tag=>{
      followState.followAuthors=new Set();followState.followProviders=new Set();followState.followMediaView='videos';followState.followFilter='saved';
      followState.followDurMin=followState.followDurMax=0;followState.followTags=new Set([tag]);openDrawer(false);openRoutedPage(followViewPath())},
    selectFollowTag:tag=>{followState.followTags=new Set([tag]);openDrawer(false);openRoutedPage(followViewPath())},
    selectFollowProvider:provider=>routeFollowFromSidebar({provider:followState.followProviders.has(provider)?'':provider}),
    setFollowDuration:(lo,hi)=>routeFollowFromSidebar({durMin:lo?lo*60:0,durMax:hi<180?hi*60:0}),
    attached:()=>{preferencesState.placeSidebarHead();preferencesState.syncGlassOptics()},
  };
}

export function mountSidebar(){
  const scroll=$('#drawerScroll');
  const anchors=[...(scroll.querySelector('[data-sidebar-head]')?.children||[])];
  scroll.innerHTML=sidebarSkeletonHtml(preferencesState.appSettings.sidebarOrder,layoutState.NAV_CATALOG,navOn);
  scroll.querySelector('[data-sidebar-head]').append(...anchors);
  applicationEffects.listen(scroll, 'click', event=>{
    if(sidebarApi())return;
    const button=event.target.closest?.('[data-nav]');
    if(button)navTo(button.dataset.nav);
  });
  loadSidebar(sidebarHost()).then(sidebar=>sidebar.render(layoutState.sidebarProps)).catch(()=>{});
}

export async function loadSyncedSettings(){
  const effects=applicationEffects;
  let remote=null;
  try{remote=await api('/api/settings',{signal:effects.signal})}catch{return}
  if(!effects.isActive)return;
  applySyncedSettings(remote,effect=>preferencesState.settingsEffects[effect]?.());
}

export function manageSection(){
  const hit=navigationState.routeMeta(decodeURIComponent(location.pathname));
  return hit?.route.section||(state.state==='ads'?'cleanup':'');
}

export function buildManageBar(){
  const current=manageSection();
  probeConfigurable();
  // Admin is an administrative surface and should not carry the home page's people/label strips or tag filters.
  // While hiding the tagbar, sync the count bar's sticky offset: it reserves space for "top bar + filter bar" by default,
  // Without the filter bar that offset leaves a 58px gap, and scrolling content shows through it.
  if(current)hideDiscoveryBars();
  $('#count').classList.toggle('no-tagbar',!!current);
  syncNavigation();     // The top-level highlight follows the admin area; otherwise entering from the home page would leave it stuck on "Home"
  /* The trash readout is valid only for this visit to the page: leaving trash forgets it, and on the next visit the explainer row lays the same-shaped placeholder first,
     settling when the readout arrives; repaints within the same page (filters, finishing a batch, paging) keep the copy in hand and lay no placeholder. */
  if(current!=='trash')selectionState.trashCount=null;
  paintManageHeader(current);
}

export function manageHeaderProps(section){
  return {section,path:decodeURIComponent(location.pathname),sections:layoutState.MANAGE_SECTIONS,
    menu:section?layoutState.manageMenuSections():[],trash:selectionState.trashCount};
}

export function paintManageHeader(section=manageSection()){
  paintListTitle();
  const props=manageHeaderProps(section),header=manageHeaderApi();
  if(header)header.render(props);
  else{
    const html=manageHeaderSkeletonHtml(props);
    if(html!==layoutState.manageHeaderSkeleton){layoutState.manageHeaderSkeleton=html;layoutState.manageHeaderRoot().innerHTML=html}
  }
  /* Reveal once per page change. Every repaint within the same page (filters, finishing a review batch, paging) also goes through here;
     without comparing titles, the page title would wobble again on every fetch. The skeleton stage and after the router tree takes over share the same spot. */
  const label=manageHeaderView(props)?.title||'';
  if(label===layoutState.lastManagePageLabel)return;
  layoutState.lastManagePageLabel=label;
  if(label)revealTexts(layoutState.manageHeaderRoot(),'[data-manage-title],[data-manage-lede]');
}

export function mountManageHeader(){
  const root=layoutState.manageHeaderRoot();
  applicationEffects.listen(root, 'click', event=>{
    if(manageHeaderApi())return;
    const tab=event.target.closest?.('[data-manage]');
    if(tab){openManage(tab.dataset.manage);return}
    if(event.target.closest?.('[data-manage-crumb] a[href]')){
      if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||event.button)return;
      event.preventDefault();navigationState.navigatePath('/data-cleanup');return;
    }
    if(event.target.closest?.('[data-empty-trash]'))emptyTrash();
  });
  loadManageHeader({root,store:preferencesState.settingsStore,openManage,openPath:path=>navigationState.navigatePath(path),emptyTrash})
    .then(()=>paintManageHeader()).catch(()=>{});
}

export function paintListTitle(){
  const el=$('#listTitle');if(!el)return;
  const path=decodeURIComponent(location.pathname);
  const label=!manageSection()&&isCatalogPath(path)?STATE_LABELS[state.state]||'':'';
  el.hidden=!label;if(label)el.textContent=label;
  const heading=$('#catalogPageHeading');
  heading.hidden=!!manageSection()||!isCatalogPath(path)||!!label||state.jav==='1';
  paintCatalogPageTitle(heading,state.q);
}

/* The home page title follows the search term: this screen of search results is the term's results, no longer the home page. Clearing the search term returns to 'Home'. */
export function paintCatalogPageTitle(heading,query){
  const title=heading?.querySelector('[data-page-title]');if(!title)return;
  const words=String(query||'').trim();
  const next=words?`Search results: 「${words}」`:'Home';
  if(title.title===next||(!words&&title.textContent===next))return;
  if(!words){title.textContent=next;title.removeAttribute('title');return}
  const part=(text,full)=>{const span=document.createElement('span');span.textContent=text;if(full!==undefined)span.dataset.titleWords=full;return span};
  title.replaceChildren(part('Search results: 「'),part(words,words),part('」'));
  title.title=next;
  fitTitleWords(title);
  // When the box width changes, the observer re-screenshots; if the font arrives late, the box doesn't change but the text widens, so wait for the font to be ready and screenshot again.
  titleWidth??=new ResizeObserver(entries=>entries.forEach(entry=>fitTitleWords(entry.target)));
  titleWidth.observe(title);
  void document.fonts?.ready.then(()=>fitTitleWords(title));
}

/* A long word truncates only the tail of the search-term segment, with the ellipsis tight against the closing 「」」. CSS tail ellipsis cannot do this: the quote must sit outside the word,
   and the leftover whitespace after the word cell is truncated lands between the ellipsis and the quote. Binary-search the longest prefix that fits within the title's current width. */
let titleWidth=null;
function fitTitleWords(title){
  const span=title.querySelector('[data-title-words]');if(!span||!title.clientWidth)return;
  const full=span.dataset.titleWords;
  span.textContent=full;
  if(title.scrollWidth<=title.clientWidth)return;
  const parts=typeof Intl.Segmenter==='function'
    ?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(full)].map(part=>part.segment):Array.from(full);
  let low=0,high=parts.length-1,best=0;
  while(low<=high){
    const kept=(low+high)>>1;
    span.textContent=parts.slice(0,kept).join('')+'…';
    if(title.scrollWidth<=title.clientWidth){best=kept;low=kept+1}else high=kept-1;
  }
  span.textContent=parts.slice(0,best).join('')+'…';
}

export function openManage(section='stats'){
  const path=navigationState.routePathOf('section',section);
  if(path){navigationState.openRoutePath(path);return}
  /* Unrecognized sections fall through to junk files: the statistics page's "View junk files" passes `ads`,
     and junk files is a filter state of the catalog page, not a section of its own. */
  state.orient='';state.state='ads';notifyShell();navigationState.route(junkPath());
  showHomeSurfaces();syncNavigation();buildBars();
}

export function javActive(){
  const path=decodeURIComponent(location.pathname);
  if(path==='/')return state.jav==='1';
  if(path.startsWith('/performers/')||path.startsWith('/studios/'))
    return state.jav==='1'||entityJavLayout;
  return false;
}

export function sortOptions(jav=javActive()){
  const ordered=SORTS.filter(([key])=>key!=='seed');
  return jav?[JAV_RELEASE_SORT,...ordered]:ordered;
}

export function homeLayoutActive(){
  return decodeURIComponent(location.pathname)==='/'&&state.jav!=='1';
}

export function cardLayout(){return cardLayoutFor(homeLayoutActive())}

export function setHomeLayout(value){
  storeHomeLayout(value);
  syncVideoLayoutSetting();
  if(!$('#grid').hidden)repaintCatalogGrid();
}

export function setJavLayout(value){
  storeJavLayout(value);
  syncVideoLayoutSetting();
  // Redraws the cards only, no new requests: layout is purely a presentation concern. The profile page keeps its loaded pages.
  repaintCatalogGrid();
}

export function syncVideoLayoutSetting(){
  document.querySelectorAll('[data-video-layout]').forEach(input=>{input.checked=input.value===cardLayout()});
  if(catalogState.catalogFilterProps)paintCatalogFilter({layout:catalogLayoutProp()});
}

export function setVideoLayout(value){
  storeVideoLayout(value);
  syncVideoLayoutSetting();
  repaintCatalogGrid();
}

export function toggleJavMode(){
  state.jav=state.jav==='1'?'':'1';
  if(state.jav!=='1'&&state.sort==='release'){state.sort='seed';state.dir=''}
  state.state='';state.orient='';notifyShell();
  navigationState.route(homePath());
  showHomeSurfaces();syncNavigation();buildBars();
}

export async function reloadAfterWrite(){
  dropBars();catalogState.mixRelatedCache.clear();
  await Promise.all([reloadCurrentSurface(),buildBars()]);
}

export async function reloadCurrentSurface(){
  // The profile page advances an epoch and the island refetches videos by the address filters; photos and the roster are untouched by bulk operations.
  if(entityState.entityPageCurrent()&&!$('#index').hidden){pushEntityPage({revision:++entityState.entityPageRevision});return}
  const path=decodeURIComponent(location.pathname);
  // The index page the route tree opened by match and the profile page it has not drawn yet: the route tree must reopen from the address from scratch.
  if(routeMetaOf(path)?.reload==='reopen'){writeShell({pageOpens:pageOpens+1});return}
  // Follows page: the route tree's follows element pushes a new epoch, the list refetches and does not remount.
  if(path==='/follow'){writeShell({pageOpens:pageOpens+1});return}
  const hit=navigationState.routeMeta(path);
  if(hit?.route.reload){await hit.route.reload();return}
  await loadCatalog();
}

export function navOn(k){
  const path=decodeURIComponent(location.pathname);
  const nav=navigationState.routeMeta(path)?.route.nav||'';
  const directSection=layoutState.DIRECT_MANAGE_NAV[k];
  if(directSection)return manageSection()===directSection;
  if(k==='manage'){
    const current=manageSection();
    return !!current&&!preferencesState.appSettings.sidebarOrder.some(key=>layoutState.DIRECT_MANAGE_NAV[key]===current);
  }
  // The JAV section and the library's JAV filter share navigation state; portrait is decided by the in-memory filter toggle.
  if(k==='jav')return path==='/jav'||javActive();
  if(k==='shorts')return state.orient==='Portrait';
  // The home entry only lights up when actually sitting on the home list: admin, index pages and entity pages do not count,
  // Otherwise it would highlight at the same time as the entry you are on.
  if(k==='')return path==='/'&&!manageSection()&&!state.state&&!javActive()&&state.orient!=='Portrait';
  // The catalog page's four filter states share one screen, and portrait is another filter layer stacked on top.
  if(STATE_ROUTES[k])return nav===k&&state.orient!=='Portrait';
  if(nav)return nav===k;
  return path==='/'&&state.state===k&&state.orient!=='Portrait';
}

export function navTo(k){
  const remembered=rememberedSidebarPath(k);
  if(remembered===location.pathname+location.search+location.hash)return;
  // The current item stays in place to take a double-click; only switching sections collapses the drawer and briefly disables hover pop-back.
  closeDrawerAfterNav();
  if(remembered){
    navigationState.navigatePath(remembered);
    return;
  }
  if(layoutState.DIRECT_MANAGE_NAV[k]){openManage(layoutState.DIRECT_MANAGE_NAV[k]);return}
  if(k==='manage'){openManage();return}
  if(k==='jav'){navigationState.navigatePath('/jav');return}
  if(k===''){goHome();return}
  // Entries with their own addresses (update checking, playlist, immersive mode, index pages) find their path through the route metadata's `nav`.
  const path=STATE_ROUTES[k]?null:navigationState.routePathOf('nav',k);
  if(path){navigationState.openRoutePath(path);return}
  if(k==='shorts'){state.orient='Portrait';state.state=''}else{state.orient='';state.state=k}
  notifyShell();
  navigationState.route(homePath());
  syncNavigation();buildBars();
}

export function syncHeaderActions(){
  const path=decodeURIComponent(location.pathname),parts=path.split('/').filter(Boolean);
  if(selectMode&&selectSurface!==selectionState.currentSelectSurface())
    setSelectMode(false,true);
  const entity=parts.length>1&&Object.prototype.hasOwnProperty.call(ROUTE_ENTITIES,parts[0]);
  const catalog=isCatalogPath(path)||path==='/trash';
  const javCards=javCardPage(path,location.search);
  if(path==='/jav'&&selectMode)setSelectMode(false,true);
  const canSelect=catalog||entity||path==='/tags'||path==='/follow'||javCards;
  const canDensity=catalog||entity||path==='/follow'||javCards;
  $('#selectMode').hidden=!canSelect;$('#density').hidden=!canDensity;
  syncPhotoWalls();
  if(!canSelect&&selectMode)setSelectMode(false,true);
}

export function updateMobileFilterScroll(){
  const frames=[...document.querySelectorAll('[data-filter-frame]')];
  const active=frames.find(frame=>frame.offsetParent!==null);
  if(active!==layoutState.mobileFilterHost||location.pathname!==layoutState.mobileFilterPath)layoutState.mobileFilterScroll=null;
  layoutState.mobileFilterHost=active;layoutState.mobileFilterPath=location.pathname;
  const y=Math.max(0,Math.min(scrollY,document.documentElement.scrollHeight-innerHeight));
  const hold=!!active?.querySelector(':focus-visible,input:focus,select:focus,textarea:focus,[aria-expanded="true"]');
  layoutState.mobileFilterScroll=filterScrollState(layoutState.mobileFilterScroll,y,innerWidth<=760,hold);
  for(const frame of frames){
    const free=frame===active&&layoutState.mobileFilterScroll.free;
    if(free)frame.style.setProperty('--filter-free-top',`${-frame.offsetHeight-12}px`);
    /* The flag is written as an attribute, not a class: the profile page's overlay is painted by React, which owns className. */
    if(free===frame.hasAttribute('data-filter-free'))continue;
    /* `top` lands in one step, then translate slides from the measured start to the landing: changing `top` per frame reflows every frame, and a busy main thread
       during scrolling stutters, while translate runs on the compositor. The start measures the actual position continuing the previous slide, so a mid-way reversal still connects. */
    const from=frame.getBoundingClientRect().top;
    frame.getAnimations().forEach(a=>a.id==='filter-slide'&&a.cancel());
    frame.toggleAttribute('data-filter-free',free);
    const shift=from-frame.getBoundingClientRect().top;
    const [duration,easing]=getComputedStyle(document.documentElement).getPropertyValue('--board-motion').trim().split(' ');
    if(Math.abs(shift)>=1&&parseFloat(duration)>0)
      frame.animate([{translate:`0 ${shift}px`},{translate:'0 0'}],{id:'filter-slide',duration:parseFloat(duration)*1000,easing});
  }
}

export function updateStickySurfaces(){
  updateMobileFilterScroll();
  ['.board-filter-frame','#count'].forEach(selector=>{
    const el=$(selector),css=el&&getComputedStyle(el),top=css?parseFloat(css.top):NaN;
    const stuck=!!el&&css.position==='sticky'&&el.offsetParent!==null&&window.scrollY>0&&
      Number.isFinite(top)&&el.getBoundingClientRect().top-(parseFloat(css.translate.split(' ')[1])||0)<=top+1;
    if(el)el.classList.toggle('is-stuck',stuck);
    if(el?.matches('.board-filter-frame'))el.classList.toggle('board-is-stuck',stuck);
  });
}

export function scheduleStickySurfaces(){
  if(layoutState.stickyFrame)return;
  layoutState.stickyFrame=applicationEffects.frame(()=>{layoutState.stickyFrame=0;updateStickySurfaces()});
}

export function installLayout18() {
followState.followSidebarFilters = ()=>({provider:[...followState.followProviders][0]||'',
  dur_min:followState.followDurMin||'',dur_max:followState.followDurMax||''});
applicationEffects.handler($('#filterBtn'), 'onclick', ()=>openDrawer(!$('#drawer').classList.contains('open')));
layoutState.SIDEBAR_ITEMS = SIDEBAR_ITEMS;
layoutState.MANAGE_SECTIONS = MANAGE_SECTIONS;
layoutState.MANAGE_MENU_SECTIONS = MANAGE_MENU_SECTIONS;
layoutState.manageMenuSections = ()=>getManageMenuSections(runtimeConfigurable===true,preferencesState.appSettings.manageOrder);
layoutState.OPTIONAL_SIDEBAR_ITEMS = OPTIONAL_SIDEBAR_ITEMS;
layoutState.NAV_CATALOG = NAV_CATALOG;
layoutState.DIRECT_MANAGE_NAV = DIRECT_MANAGE_NAV;
layoutState.settingsHost = ()=>({
  selectSection:section=>shellNavigate(settingsPath(section),{replace:true,state:peachHistory.navigation.location.state}),
  closed:closeSettingsRoute,
  store:preferencesState.settingsStore,
  changed:effect=>preferencesState.settingsEffects[effect]?.(),
  sound:name=>playUiSound(name),
  navCatalog:layoutState.NAV_CATALOG,themeOptions:THEME_OPTIONS,videoLayouts:JAV_LAYOUTS,
  followInitialRanges:FOLLOW_INITIAL_RANGE_OPTIONS,
  videoLayout:()=>cardLayout(),setVideoLayout,
  censored:censorOn,setCensored,sfwShortcut,setSfwShortcut,
  highContrast:()=>document.documentElement.classList.contains('board-high-contrast'),setHighContrast,
  receipt:message=>receiptsState.actionReceipt(message),
  failure:receiptsState.actionFailure,
  syncRemote:remote=>applySyncedSettings(remote,effect=>preferencesState.settingsEffects[effect]?.()),
  openConfiguration:()=>navigationState.navigatePath('/settings/library'),
  attached:()=>preferencesState.syncGlassOptics(),
  /* The criteria for the "this computer" cell: service managed by the tray, configuration completed, and the request coming from this machine, all three at once. */
  configurable:()=>api('/healthz')
    .then(runtime=>{writeShell({runtimeConfigurable:!!runtime.configurable});return runtimeConfigurable})
    .catch(()=>null),
});
applicationEffects.handler($('#settingsBtn'), 'onclick', ()=>void openSettings());
layoutState.lastManagePageLabel = '';
layoutState.manageHeaderSkeleton = '';
layoutState.manageHeaderRoot = ()=>$('[data-manage-header]');
window.__scrolling=false;
layoutState.scrollT = null;
layoutState.stickyFrame = 0;
layoutState.mobileFilterScroll = null;
layoutState.mobileFilterHost = null;
layoutState.mobileFilterPath = '';
applicationEffects.listen(document, 'focusin', scheduleStickySurfaces);
applicationEffects.listen(document, 'focusout', scheduleStickySurfaces);
applicationEffects.listen(window, 'scroll', ()=>{
  scheduleStickySurfaces();
  if(location.pathname==='/follow'&&followFeedLive())writeShell({followScrollY:scrollY});
  window.__scrolling=true;
  // Hover previews are suspended while scrolling: content sliding under the mouse fires mouseenter continuously,
  // Each playback creates a new video element and a /stream request; a few dozen concurrent ones bring the page down
  releaseHoverPreviews();
  clearTimeout(layoutState.scrollT); layoutState.scrollT=applicationEffects.delay(()=>{window.__scrolling=false},180);
}, {passive:true});
applicationEffects.listen(window, 'resize', scheduleStickySurfaces, {passive:true});
applicationEffects.handler($('#scrim'), 'onclick', ()=>openDrawer(false));
}
