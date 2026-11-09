/* feed domain controller: this domain's state and actions; startup installs them together through Application's lifecycle. */
import { coverImage, remoteCoverUrl } from './../card-art/markup';
import { feedIdentity } from './../card-art/feed-identity';
import { coverStateHtml } from './../card-art/cover-state';
import { $, api, esc, foldName, icon, isCatalogPath } from '../core';
import { javTitleHtml } from '../core/jav-title';
import { COVER_FRONT_RATIO } from './../appearance/layout';
import { catalogState } from './catalog.js';
import { feedNewSkeletonHtml } from '../feed-new-skeleton';
import { managedTaken, openManagedRoute, updateManagedRoute } from './../history/managed';
import { noteHtml, stopAutoScroll, wireAutoScroll } from '../ui-kit';
import { preferencesState, wireDrag } from './preferences.js';
import { pushEntityPage } from './entity.js';
import { applicationEffects } from './effects';
export const feedState = { FEED_SKELETON_CARDS: undefined, feedNewSkeletonHtml: undefined, entityShapes: undefined, entityShapesComplete: false, hasEntityShape: undefined, hasEntityPart: undefined, feedNewSkeletonSection: undefined, COSTAR_SKELETON_PEOPLE: undefined, costarSkeletonFoot: undefined, factsSkeleton: undefined, feedRevision: undefined, feedNewHelpers: undefined, feedNewActions: undefined, HERO_WIDE_PX: undefined };

export function feedNewCoverHtml(item){
  if(item.has_cover)return coverImage(item,'big');
  // 还没有封面：说清在等什么、为什么没有，排队的可以当场先取（后台那条队可能被存量补修占着几个小时）。
  if(!item.cover_url||!item.code)return coverStateHtml(item);
  // Official art is fetched through the Peach proxy; on disconnection or upstream failure it falls back to the "Cover unavailable" placeholder.
  return coverImage(item,'big').replace(/ src="[^"]*"/,
    ` src="${esc(remoteCoverUrl(item))}" data-panel-prior="1"`)
    .replace('data-drop="self"', 'data-drop="initial" data-initial="No cover available" data-drop-class="nopic"');
}

export function feedNewCardHtml(item){
  // Byline and date each take a row; cast members overflowing the list are viewable in the hover tooltip.
  const label=[item.performers&&`<span class="feednewperformers" title="${esc(item.performers)}">${esc(item.performers)}</span>`,
    item.release_date&&`<time class="feednewdate" datetime="${esc(item.release_date)}">${esc(item.release_date)}</time>`].filter(Boolean)
    .join('');
  const cover=feedNewCoverHtml(item);
  // Code and title sit in the same two-line title block as the asset card: the bold code leads and the title follows, truncated.
  const name=item.code||String(item.title||'').trim()||'Untitled new release';
  const heading=item.code
    ?javTitleHtml({is_jav:true,code:item.code,name:item.code,display_title:item.title||''})
    :esc(name);
  const open=item.code
    ?`<a class="feednewopen" href="/works/${encodeURIComponent(item.code)}" aria-label="Open ${esc(name)}'s video details"></a>`:'';
  return `<article class="card feednewcard${item.read?' isread':''}" data-feed-id="${item.id}">
    ${open}<div class="pic" style="--card-ratio:${COVER_FRONT_RATIO}">${cover}
      <div class="hovertools feednewtools">
        <button type="button" data-feed-action="${item.wanted?'unwant':'want'}" aria-pressed="${!!item.wanted}" title="${item.wanted?'Unwant':'Want'}" aria-label="Want ${esc(name)}">${icon('star')}</button>
        <button type="button" data-feed-action="ignore" title="Not interested" aria-label="Not interested ${esc(name)}">${icon('x')}</button>
        <button type="button" data-feed-action="read" title="Mark as watched" aria-label="Mark as watched ${esc(name)}">${icon('check')}</button></div></div>
    <div class="meta">${feedIdentity(item)}<div class="mtext"><span class="t">${heading}</span>
      <div class="s mono">${label||(item.title?'':'Profile not fetched yet')}</div></div></div></article>`;
}

export function installEntityShapeBootstrap(){
  const script=document.getElementById('peach-entity-shape');
  if(!script)return;
  try{
    const shape=JSON.parse(script.textContent||'null');
    if(!shape?.id||typeof shape.kind!=='string'||!Array.isArray(shape.names)||!Array.isArray(shape.parts))return;
    feedState.entityShapes=new Map([String(shape.id),...shape.names]
      .map(name=>[`${shape.kind}/${foldName(name)}`,shape.parts]));
  }catch{/* Invalid first-screen shapes are handled by the async roster. */}
}

export async function loadEntityShapes(){
  const effects=applicationEffects;
  const data=await api('/api/entity/shapes',{signal:effects.signal}).catch(()=>null);
  if(!effects.isActive)return feedState.entityShapes;
  if(data&&!data.error){
    feedState.entityShapesComplete=true;
    feedState.entityShapes=new Map((data.entities||[])
      .flatMap(entity=>[String(entity.id),...entity.names].map(name=>[`${entity.kind}/${foldName(name)}`,entity.parts])));
    if(typeof data.home?.feed==='boolean')rememberHomeFeed(data.home.feed);
    if(isFeedNewPath(location.pathname))prepareHomeFeed($('#feedNew'));
  }
  return feedState.entityShapes;
}

/* Whether the home page has "new releases not added to library" is stored locally: the first-screen skeleton lays this row by the last conclusion instead of waiting for the shape endpoint and inserting it,
   which would push the catalog below down with a jolt. The endpoint or the finished row records the new conclusion. */
const HOME_FEED_KEY='peach.home-feed.v1';
export function rememberHomeFeed(has){
  catalogState.homeHasFeed=has;
  try{localStorage.setItem(HOME_FEED_KEY,has?'1':'0')}catch{/* Next time, wait for the API as usual. */}
}
export function recalledHomeFeed(){
  try{const value=localStorage.getItem(HOME_FEED_KEY);return value==='1'?true:value==='0'?false:null}catch{return null}
}

export function prepareHomeFeed(host){
  // From the moment it opens, the host belongs to the route tree: the skeleton is laid only before opening, after which the rendered row, or nothing, does the talking.
  if(!host||managedTaken(host)||host.querySelector('[data-feed-id]'))return;
  host.hidden=catalogState.homeHasFeed!==true;
  if(catalogState.homeHasFeed!==true)return;
  host.setAttribute('aria-busy','true');
  if(!host.querySelector('.feednewskeleton'))host.innerHTML=feedState.feedNewSkeletonHtml();
}

export function feedNetworkNote(unreachable,items){
  if(!(unreachable>0)||!items.some(item=>!item.has_cover))return '';
  return noteHtml(`Covers for ${unreachable} new releases cannot reach the DMM image host, common on China Mobile broadband. Set the DMM / FANZA connection to the Peach proxy and the next round will refetch automatically.`,
    {variant:'warning',className:'feednetwork',actionLabel:'Configure connection method',actionHref:'/sources'});
}

/* When allHref is given, add a 'View all new releases' card at the row's end, jumping to the JAV page's new-releases section; the home page row gives it, the resources page row doesn't. */
export function feedRowHtml(data,allHref=''){
  const items=data&&!data.error?(data.items||[]):[];
  const all=allHref&&items.length
    ?`<a class="feednewall" href="${esc(allHref)}" style="--card-ratio:${COVER_FRONT_RATIO}"><span>View all new releases</span>${icon('chevron-right')}</a>`:'';
  return feedNetworkNote(data?.cover_network,items)
    +`<div class="feednewrow srow">${items.map(feedNewCardHtml).join('')}${all}</div>`;
}

export function wireFeedNewRow(row){
  if(!row)return;
  wireDrag(row);
  if(preferencesState.appSettings.feedAutoScroll)wireAutoScroll(row);
}

export function isFeedNewPath(path){return isCatalogPath(path)&&path!=='/junk-files'}


export function renderHomeFeed(){
  const host=$('#feedNew');
  if(managedTaken(host)){host.hidden=catalogState.homeHasFeed!==true;return}
  prepareHomeFeed(host);
  /* This row does not change with filters; presence is judged by path alone: a filter change rotates the catalog's epoch and must not void this pass. */
  void openManagedRoute('feed-new',{host,revision:feedState.feedRevision,helpers:feedState.feedNewHelpers,actions:feedState.feedNewActions},
    {container:host,isCurrent:()=>isFeedNewPath(location.pathname)});
}

export function clearHomeFeed(){
  const host=$('#feedNew');
  host.querySelectorAll('.feednewrow').forEach(stopAutoScroll);
  host.hidden=true;
}

export function refreshFeedRows(){
  feedState.feedRevision+=1;
  // The home row renders only while the catalog page is up; when the user is elsewhere `updateManagedRoute` is a no-op, so it never pops up on other pages.
  updateManagedRoute($('#feedNew'),{revision:feedState.feedRevision});
  pushEntityPage({feedRevision: feedState.feedRevision});
}

export function syncFeedAutoScroll(){
  document.querySelectorAll('.feednewrow').forEach(row=>
    preferencesState.appSettings.feedAutoScroll?wireAutoScroll(row):stopAutoScroll(row));
}

/* The switch is written on the next frame: the moment it flips, the profile card swaps columns and the page grows taller, and the whole-page overlay scrollbar is watching `<body>`. Writing it inside the size observer
   callback means `<body>`'s shallow change cannot be delivered this round, so the browser reports a ResizeObserver loop error,
   and every profile page open enters the error report. */
let heroWideFrame=0;
export function syncHeroWide([entry]){
  const wide=entry.contentRect.width>=feedState.HERO_WIDE_PX;
  cancelAnimationFrame(heroWideFrame);
  heroWideFrame=requestAnimationFrame(()=>{heroWideFrame=0;$('#index')?.toggleAttribute('data-hero-wide',wide)});
}

export function installFeed13() {
feedState.FEED_SKELETON_CARDS = 8;
feedState.feedNewSkeletonHtml = ()=>feedNewSkeletonHtml(feedState.FEED_SKELETON_CARDS);
feedState.entityShapes = null;
feedState.entityShapesComplete = false;
feedState.hasEntityShape = (kind,name)=>feedState.entityShapesComplete||!!feedState.entityShapes?.has(`${kind}/${foldName(name)}`);
feedState.hasEntityPart = (kind,name,part)=>!!name&&!!feedState.entityShapes?.get(`${kind}/${foldName(name)}`)?.includes(part);
feedState.feedNewSkeletonSection = ()=>`<section class="feednew">${feedState.feedNewSkeletonHtml()}</section>`;
feedState.COSTAR_SKELETON_PEOPLE = 12;
feedState.costarSkeletonFoot = ()=>`<div class="entityfoot" data-entity-foot><div class="relatedpeople" data-related-people>${
  '<button type="button" disabled tabindex="-1"><span class="skeleton" data-hero-ring></span><span class="skeleton" data-hero-costar-name>&#8203;</span></button>'
    .repeat(feedState.COSTAR_SKELETON_PEOPLE)}</div></div>`;
feedState.factsSkeleton = ()=>`<dl class="entityfacts" data-entity-facts>${
  '<dt><span class="skeleton"></span></dt><dd><span class="skeleton"></span></dd>'.repeat(5)}</dl>`;
feedState.feedRevision = 0;
feedState.feedNewHelpers = {feedRowHtml,wireFeedRow:row=>wireFeedNewRow(row)};
feedState.feedNewActions = {settled:hasItems=>rememberHomeFeed(hasItems)};
feedState.HERO_WIDE_PX = 900;
applicationEffects.resize(syncHeroWide).observe($('#index'));
}
