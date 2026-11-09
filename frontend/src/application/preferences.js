/* preferences domain controller: this domain's state and actions, installed at startup by Application's lifecycle. */
import { loadMediaSources } from './../query/media-sources';
import { buildBars, catalogState, dropOfflineFromDefaultLoc, homePath, loadCatalog, paintCatalogFilter, repaintCatalogGrid } from './catalog.js';
import { appSettingsStore } from './../appearance/settings';
import { interfaceLanguage, storedInterfaceLanguage } from '../i18n';
import { entityDisplayName, setNameLanguage } from '../core/entity-names';
import { playUiSound, setUiSoundsEnabled, wireUiSounds } from '../ui-kit/sounds';
import { applyTheme, watchSystemTheme } from './../appearance/theme';
import { applyAccent, applyGlassFaces, applyHomeGlow, paintHomeGlowNow } from './../appearance/glow';
import { navigationState } from './navigation.js';
import { $, LOC, esc, icon, isCatalogPath } from '../core';
import { peachHistory, shellNavigate } from './../history/index';
import { notifyShell, selectMode, selected, state } from './../shell/index';
import { preferredDirection } from './../sort-preferences';
import { releaseHoverPreviews, setHoverState } from './../card-art/hover';
import { reloadCurrentSurface } from './layout.js';
import { refreshPageNavigation } from '../history/page-navigation';
import { refreshFeedRows, syncFeedAutoScroll } from './feed.js';
import { stageApi } from '../react/application-residents';
import { syncJavImages } from './../jav-artwork';
import { coverAnchor } from './../card-art/framing';
import { DEFAULT_SFW_SHORTCUT, SFW_SHORTCUT_KEY, parseShortcut, serializeShortcut } from './../keyboard-shortcut';
import { mediaState, repaintDetailPoster } from './media.js';
import { loadingState } from './loading.js';
import { updateManagedRoute } from './../history/managed';
import { MEDIA_SOURCE_ICONS, emptyStateHtml, wireHorizontalScroller } from '../ui-kit';
import { tagLabel } from '../core/tags';
import { rereadPlaylists } from './playlists.js';
import { receiptsState } from './receipts.js';
import { dropBars } from './../catalog-bars';
import { applicationEffects } from './effects';
export const preferencesState = { sourceOnline: undefined, sourceProblems: undefined, sourceOffline: undefined, OFFLINE_HINT: undefined, OFFLINE_REASON: undefined, offlineReason: undefined, settingsStore: undefined, appSettings: undefined, saveSettings: undefined, catalogLoadWaiters: undefined, nextCatalogLoad: undefined, handOff: undefined, settingsEffects: undefined, syncGlassOptics: undefined, placeSidebarHead: undefined, SRCICON: undefined, srcBadge: undefined, emptyState: undefined, CENSOR_KEY: undefined };

export async function loadSourceStatus(){
  const effects=applicationEffects;
  try{
    const d=await loadMediaSources(effects.signal);
    if(!effects.isActive)return preferencesState.sourceOnline;
    const roots=(d.sources||[]).flatMap(s=>s.roots||[]).filter(r=>r.root_id);
    preferencesState.sourceOnline=Object.fromEntries([...(d.sources||[]).map(s=>[s.location,s.online]),...roots.map(r=>[r.root_id,r.online])]);
    preferencesState.sourceProblems=Object.fromEntries([...(d.sources||[]).map(s=>[s.location,s.message||'']),...roots.map(r=>[r.root_id,r.message||''])]);
  }catch{if(!effects.isActive)return preferencesState.sourceOnline;preferencesState.sourceOnline={};preferencesState.sourceProblems={}}
  document.body.classList.toggle('offline-source',Object.values(preferencesState.sourceOnline).includes(false));
  dropOfflineFromDefaultLoc();
  return preferencesState.sourceOnline;
}

export function replaceCatalogAddress(){
  const path=navigationState.surfacePath();
  if(!isCatalogPath(path)||path==='/junk-files')return loadCatalog();
  const loading=preferencesState.nextCatalogLoad();
  shellNavigate(homePath(),{replace:true,state:peachHistory.navigation.location.state});
  return loading;
}

export function sidebarDot(loc){
  if(loc==='local')return {kind:'glyph',name:'hard-drive'};
  if(loc==='online')return {kind:'glyph',name:'rss'};
  const mark=MEDIA_SOURCE_ICONS[loc];
  if(mark)return mark.startsWith('data:')?{kind:'image',src:mark}:{kind:'glyph',name:mark};
  // Registered billing sources use their own identifier.
  return {kind:'cost',cost:'free'};
}

export function sidebarFacets(facetData,context){
  const rows=(items,named=row=>row.label||tagLabel(row.k))=>(items||[]).map(row=>({value:String(row.k),label:named(row),n:row.n??null}));
  const creators=context.type==='entity'&&context.kind==='creator'
    ?(facetData.creators||[]).filter(row=>row.k!==context.name):facetData.creators;
  return {
    locations:(facetData.locations||[]).map(row=>({value:row.k,label:LOC[row.k]||row.k,n:row.n??null,dot:sidebarDot(row.k),
      ...(preferencesState.sourceOffline(row.k)?{offline:preferencesState.OFFLINE_HINT}:{})})),
    regions:rows(facetData.regions),orientations:rows(facetData.orientations),years:rows(facetData.years),
    creators:rows(creators,row=>entityDisplayName('creator',row.k)),tags:rows(facetData.tags),tech:rows(facetData.tech),
    followTags:rows(facetData.follow_tags,row=>tagLabel(row.k)),
    duration:!!facetData.stats?.duration,
  };
}

export async function refreshAll(automatic=false){
  if(automatic&&(document.hidden||!isCatalogPath(decodeURIComponent(location.pathname))||
      mediaState.stageOpen()||mediaState.immerseOpen()||selectMode||selected.size||document.activeElement===$('#q')))return false;
  if(!$('#stats').hidden){
    /* The management area's shuffle behavior is written on the route metadata's `refresh`: `reopen` reopens itself,
       `skip` does not participate (the updates page's re-render needs the network and can only be triggered by its own
       button), and unwritten pages (stats, data management, resource sync) fall to the stats page. With the playlists page
       rendered it only rereads (`rereadPlaylists`); other pages rewrite an unclaimed address in place, take a new page-open
       epoch, their page element changes key once and reopens, and the history entry count stays the same. */
    const path=decodeURIComponent(location.pathname),refresh=navigationState.routeMeta(path)?.route.refresh;
    if(refresh==='skip')return;
    if(path==='/playlists'){rereadPlaylists();return}
    const target=refresh==='reopen'?path:'/stats';
    refreshPageNavigation();
    if(target===path)navigationState.navigatePath(location.pathname+location.search+location.hash,true,peachHistory.navigation.location.state);
    else navigationState.navigatePath(target);
    return;
  }
  if(!$('#index').hidden){return}
  state.sort='seed';state.dir='';state.seed=receiptsState.rollSeed();notifyShell();
  // The top three tiers (performer avatars, studios, tags) have a 30-second session cache, while refreshAll only reloads the grid:
  // Without clearing these two caches, the same people still show up after "Shuffle".
  dropBars();
  /* The grid and the top three layers swap together, each taking different time, so the spinner belongs to this layer: it spins until this Promise
     settles, and keeps going while the grid has arrived but the tag bar is still waiting. The top three layers and the tag bar get no skeleton; they have
     content on screen right now, and tearing it into gray strips to refill is more jarring than swapping directly; only a shimmer layer is laid, skeletons reserved for the first from-nothing screen. */
  paintCatalogFilter({refreshing:true});
  /* The catalog element starts its fetch in the microtask queued behind the address rewrite; let that beat pass so the grid claims the surface and lays its waiting state first, then the top three tiers fetch. */
  try{refreshPageNavigation();const loading=replaceCatalogAddress();await null;await Promise.all([loading,buildBars()])}
  finally{paintCatalogFilter({refreshing:false})}
  if(!automatic)window.scrollTo({top:0,behavior:'smooth'});
  return true;
}

export function censorOn(){return document.body.classList.contains('censor')}

export function applyCensor(on){
  document.body.classList.toggle('censor',on);
  preferencesState.settingsStore.notify();
}

export function setCensored(on){
  localStorage.setItem(preferencesState.CENSOR_KEY,on?'1':'0');
  applyCensor(on);
  if(on)releaseHoverPreviews();
}

/** SFW toggle key: when the locally stored one can't be read, fall back to the default Shift+S. */
export function sfwShortcut(){
  return parseShortcut(localStorage.getItem(SFW_SHORTCUT_KEY))||parseShortcut(DEFAULT_SFW_SHORTCUT);
}

/** Passing empty restores the default. Stored locally, not included in sync settings; see keyboard-shortcut.ts. */
export function setSfwShortcut(shortcut){
  if(shortcut)localStorage.setItem(SFW_SHORTCUT_KEY,serializeShortcut(shortcut));
  else localStorage.removeItem(SFW_SHORTCUT_KEY);
  preferencesState.settingsStore.notify();
}

export function setHighContrast(on){
  localStorage.setItem('peach.high-contrast',String(on));
  document.documentElement.classList.toggle('board-high-contrast',on);
  preferencesState.settingsStore.notify();
}

export function wireDrag(el){return wireHorizontalScroller(el,{drag:true})}

export function wireAllDrag(){['#nrow','#count'].forEach(s=>wireDrag($(s)));
  document.querySelectorAll('.tier,.srow').forEach(wireDrag)}

export function immerseStartId(){
  const id=new URLSearchParams(location.search).get('id');
  return /^\d+$/.test(id||'')?Number(id):undefined;
}

export function installPreferences5() {
preferencesState.sourceOnline = {};
preferencesState.sourceProblems = {};
preferencesState.sourceOffline = key=>preferencesState.sourceOnline[key]===false;
preferencesState.OFFLINE_HINT = 'The media folder is unreachable; check the folder, read permissions, and cloud drive mount state';
preferencesState.OFFLINE_REASON = {local:'Could not read the media folder. Check that it exists and is readable.',
  '115':'Could not read the 115 media folder. Check the folder permissions and that the cloud drive mount tool is running.',
  pikpak:'Cannot read the PikPak media directory; check the directory permissions and that the cloud drive mount tool is running.'};
preferencesState.offlineReason = key=>preferencesState.sourceProblems[key]||preferencesState.OFFLINE_REASON[key]||'Could not read this source\'s media folder. Check the folder permissions and mount state.';
preferencesState.settingsStore = appSettingsStore();
preferencesState.appSettings = preferencesState.settingsStore.value;
setNameLanguage(preferencesState.appSettings.performerNameLanguage);
preferencesState.saveSettings = ()=>preferencesState.settingsStore.save();
document.documentElement.style.setProperty('--hover-delay',`${preferencesState.appSettings.hoverDelaySeconds}s`);
setUiSoundsEnabled(preferencesState.appSettings.uiSounds);
wireUiSounds();
applyTheme();
watchSystemTheme();
paintHomeGlowNow();
applyGlassFaces();
applyAccent();
preferencesState.catalogLoadWaiters = [];
preferencesState.nextCatalogLoad = ()=>new Promise(resolve=>preferencesState.catalogLoadWaiters.push(resolve));
preferencesState.handOff = loading=>{preferencesState.catalogLoadWaiters.splice(0).forEach(resolve=>resolve(loading));return loading};
preferencesState.settingsEffects = {
  performerNameLanguage:()=>{
    setNameLanguage(preferencesState.appSettings.performerNameLanguage);
    loadingState.syncPageTitle(location.href);
    catalogState.barsRendered='';buildBars();
  },
  /* 按本地存下的那份重新算一遍：算出来和页面正在用的不同才重载。存储不可写时算出来还是旧语言，不会一直重载。 */
  interfaceLanguage:()=>{
    if(storedInterfaceLanguage()!==interfaceLanguage)location.reload();
  },
  theme:()=>applyTheme(),
  /* Play the toggle sound the instant this cell opens so people know it opened. The closing sound comes from the change listener on document:
     capture phase puts it ahead of this code, while the switch is not yet off, so that final sound still gets to play. */
  uiSounds:()=>{setUiSoundsEnabled(preferencesState.appSettings.uiSounds);if(preferencesState.appSettings.uiSounds)playUiSound('toggle-on')},
  glowFrame:()=>applyHomeGlow(),
  glow:()=>{applyHomeGlow();applyGlassFaces()},
  batchSize:()=>{if(location.pathname==='/')loadCatalog()},
  defaultSort:()=>{
    state.sort=preferencesState.appSettings.defaultSort;
    state.dir=preferredDirection(state.sort,preferencesState.appSettings.defaultSort,preferencesState.appSettings.defaultSortDirection);
    notifyShell();
    if(location.pathname==='/')replaceCatalogAddress();
  },
  sortDirection:()=>{
    state.dir=preferredDirection(state.sort,preferencesState.appSettings.defaultSort,preferencesState.appSettings.defaultSortDirection);
    notifyShell();
    if(location.pathname==='/')replaceCatalogAddress();
  },
  hoverDelay:()=>{
    if(!preferencesState.appSettings.hoverDelaySeconds)document.querySelectorAll('[data-previewing],[data-longhover]')
      .forEach(el=>{setHoverState(el,'previewing',false);setHoverState(el,'longhover',false)});
    document.documentElement.style.setProperty('--hover-delay',`${preferencesState.appSettings.hoverDelaySeconds}s`);
  },
  seekSeconds:()=>repaintCatalogGrid(),
  /* Collapsing happens at render time; without a refetch, cards already skipped will not reappear on their own. */
  groupCollapse:()=>reloadCurrentSurface(),
  feedAutoScroll:()=>syncFeedAutoScroll(),
  feedLimit:()=>refreshFeedRows(),
  feedCompilations:()=>refreshFeedRows(),
  /* The setting says 'leaving the details no longer enters the mini player'; keeping the already-open mini player around would make it look like the setting did nothing. */
  miniplayer:()=>{if(!preferencesState.appSettings.miniplayer)stageApi()?.closeMiniplayer()},
  javImage:()=>{
    syncJavImages(document,preferencesState.appSettings.javImage);repaintCatalogGrid();
    document.querySelectorAll('img[data-jav-image].cover').forEach(coverAnchor);
    repaintDetailPoster();
  },
  searchHistoryLimit:()=>updateManagedRoute($('#searchMenu'),{historyLimit:preferencesState.appSettings.searchHistoryLimit}),
};
preferencesState.syncGlassOptics = ()=>{};
preferencesState.placeSidebarHead = ()=>{};
preferencesState.SRCICON = {
  ...Object.fromEntries(Object.entries(MEDIA_SOURCE_ICONS).map(([location,mark])=>
    [location,mark.startsWith('data:')?`<img class="source-icon" src="${mark}" alt="">`:icon(mark)])),
  online:icon('rss'),
};
preferencesState.srcBadge = (loc,cost,cls)=>{const label=`${LOC[loc]||loc}${cost==='metered'?' · metered':''}`;
  return `<span class="${cls||'src'} ${cost==='metered'?'metered':'free'}" title="${esc(label)}" aria-label="${esc(label)}">`
    +(preferencesState.SRCICON[loc]||'')+'</span>'};
preferencesState.emptyState = emptyStateHtml;
}

export function installPreferences23() {
preferencesState.CENSOR_KEY = 'peach-censor';
applyCensor(localStorage.getItem(preferencesState.CENSOR_KEY)==='1');
}
