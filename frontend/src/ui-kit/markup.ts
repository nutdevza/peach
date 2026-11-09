/* The Geist controls that emit only HTML strings: collection page header, Note, project banner, Gauge, Progress, Spinner,
 * Search Input, Loading Dots, Board Tabs, Empty State, badges and checkboxes.
 *
 * Imported from shared source and shipped with `peach-app.js`; islands insert them with `dangerouslySetInnerHTML`.
 * They escape text internally and are Peach's only Geist control implementation; rendering an empty state or Note again
 * inside an island would be a second implementation of the same semantics, which the `peach-web-ui` gate does not allow. */
import { esc, icon, requestErrorMessage } from '../core';
import { islandShortcutsEntry } from '../island-skeleton';

const NOTE_VARIANTS=new Set(['secondary','warning','error','success']);

/* `filterRow` serves the two-row overlay block in the skeleton: the slot marker is generated along with the HTML, otherwise this one would render itself as
   a second overlay block. */
export function collectionHeaderHtml({readout='',controls='',before='',className='',loading=false,filterRow=''}={}){
  return `<div class="entitycollectionhead${className?' '+esc(className):''}"${filterRow?` data-filter-row="${esc(filterRow)}"`:''}>${before}<h3${loading?' class="skeleton"':''}>${readout}</h3>${loading && filterRow === 'bottom' ? islandShortcutsEntry() : ''}${controls}</div>`;
}

/* Per-item details live in Note's own <details>, collapsed by default: a one-sentence conclusion followed by thousands of list lines
   pushes everything below away, and that conclusion is what should be read first. Each item gets three segments: title, description, and path;
   with only a "View video" link, finding which file means opening each one. */
interface NoteDetailItem { label?: string; href?: string; note?: string; hint?: string }
interface NoteDetails { label?: string; items?: NoteDetailItem[]; footnote?: string }
function noteDetailsHtml({label='',items=[],footnote=''}:NoteDetails={}){
  const line=(item:NoteDetailItem)=>`<li>${item.href?`<a href="${esc(item.href)}">${esc(item.label||'')}</a>`
    :`<b>${esc(item.label||'')}</b>`}<span>${esc(item.note||'')}</span>${
    item.hint?`<code>${esc(item.hint)}</code>`:''}</li>`;
  return `<details class="geist-note-details"><summary>${esc(label)}</summary>
    <ul>${items.map(line).join('')}</ul>${footnote?`<p>${esc(footnote)}</p>`:''}</details>`;
}

/* Inline, persistent context beside the field/card/section it describes.
   Recovery actions come in two forms: ones that run on this page are buttons, ones that require leaving this page are links.
   Both share the same cell and the same `data-note-action`, and the Note's layout does not change for being an <a>;
   both are secondary styles, matching React `Note`'s `action`, leaving the primary action to the region the Note sits in. */
/** Geist Note: persistent feedback next to fields, cards and sections. */
export function noteHtml(message:any,{variant='secondary',label='',className='',size='medium',filled=false,actionLabel='',actionHref='',details=null}:{
  variant?: 'secondary' | 'warning' | 'error' | 'success' | (string & {});
  label?: string;
  className?: string;
  size?: 'small' | 'medium' | (string & {});
  actionLabel?: string; filled?: boolean;
  /** When a recovery action only works off this page, give the target address and swap the button for a link in the same cell. */
  actionHref?: string;
  /** Itemized details, a details element inside a Note and collapsed by default; `hint` holds secondary annotations such as paths. */
  details?: NoteDetails | null;
}={}):string{
  const kind=NOTE_VARIANTS.has(variant)?variant:'secondary';
  const symbol=kind==='secondary'?'info':kind==='success'?'check':'alert';
  const role=kind==='error'?' role="alert"':' role="note"';
  const action=!actionLabel?''
    :actionHref?`<a class="geist-button" href="${esc(actionHref)}" data-note-action>${esc(actionLabel)}</a>`
    :`<button type="button" class="geist-button" data-note-action>${esc(actionLabel)}</button>`;
  return `<div class="geist-note geist-note-${kind}${className?` ${esc(className)}`:''}${size==='small'?' geist-note-small':''}${filled?' geist-note-filled':''}"${role}>
    ${icon(symbol)}<p>${label?`<b>${esc(label)}</b>`:''}<span>${esc(kind==='error'?requestErrorMessage(message):message)}</span></p>${action}${details?noteDetailsHtml(details):''}</div>`;
}

const PROJECT_BANNER_CLASSES:Record<string,string>={gray:'project-banner-gray',success:'ui-project-banner-success',warning:'ui-project-banner-warning',error:'ui-project-banner-error'};
export function projectBannerHtml(message:unknown,{variant='gray',href,label,value,max}:{
  variant?: string; href?: string; label?: string; value?: unknown; max?: unknown;
}={}):string{
  const kind=['gray','success','warning','error'].includes(variant)?variant:'gray';
  return `<aside class="ui-project-banner ${PROJECT_BANNER_CLASSES[kind]}" role="${kind==='error'?'alert':'status'}"><div>${Number(max)>0?gaugeHtml('Task completion',value,max):icon(kind==='error'||kind==='warning'?'alert':'info')}<p>${esc(message)}</p></div><a href="${esc(href)}">${esc(label)}</a></aside>`;
}

/** Geist Gauge。`indeterminate` 是 Geist 的不定档：一次请求这种说不出完成了几成的等待，画一段转动的弧，
 *  不报 `aria-valuenow`；旁边要有一句说明在等什么（Geist：别让人把它读成 0）。 */
export function gaugeHtml(label:string,value:unknown,max:unknown=100,{usage=false,compact=false,indeterminate=false}={}):string{
  if(indeterminate)return `<span class="ui-geist-gauge" data-indeterminate role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13"/><circle cx="16" cy="16" r="13" pathLength="100" stroke-dasharray="25 100"/></svg></span>`;
  const ceiling=Number(max), current=Number(value);
  if(!Number.isFinite(ceiling)||ceiling<=0||!Number.isFinite(current))return `<span>${esc(label)}: not obtained</span>`;
  const percent=Math.max(0,Math.min(100,current/ceiling*100));
  const level=usage?(percent>=95?'error':percent>=80?'warning':'normal'):'normal';
  const status=usage?(level==='error'?'Space is almost full':level==='warning'?'Space usage is high':'Plenty of space'):'';
  return `<span class="ui-geist-gauge" data-level="${level}" role="progressbar" aria-label="${esc(label+(status?': '+status:''))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="13"/><circle cx="16" cy="16" r="13" pathLength="100" stroke-dasharray="${percent} 100"/></svg></span>${status&&!compact?`<span class="ui-gauge-status">${status}</span>`:''}`;
}

/** Determinate progress only. Callers supply real units instead of a decorative width. */
export function progressHtml(label:string,value:unknown,max:unknown=100,{variant='active',stops=[]}:{
  variant?: 'active' | 'warning' | 'error' | (string & {}); stops?: { value: unknown; label: string }[];
}={}):string{
  const ceiling=Math.max(0,Number(max)||0);
  const current=Math.max(0,Math.min(Number(value)||0,ceiling));
  const percent=ceiling?current/ceiling*100:0;
  return `<div class="ui-geist-progress" role="progressbar" aria-label="${esc(label)}"
    aria-valuemin="0" aria-valuemax="${ceiling}" aria-valuenow="${current}"
    style="--progress-value:${percent}%;--progress-color:var(${variant==='error'?'--drop':variant==='warning'?'--meter':'--feedback-success'})"><i></i>${stops.filter(stop=>Number(stop.value)>0&&Number(stop.value)<ceiling&&stop.label).map(stop=>`<span class="ui-geist-progress-stop" style="left:${Number(stop.value)/ceiling*100}%" role="img" aria-label="${esc(stop.label)}"></span>`).join('')}</div>`;
}

/**
 * Geist Spinner: immediate feedback for a user-triggered action. Geist names
 * "inline icon refresh" as one of its three cases, so an icon-only key that
 * swaps its glyph for these ten bars is the prescribed shape, not a fallback.
 *
 * `label` names the work in flight ("shuffling a new batch"), never the action
 * the button already carries. This span is a `role=status` region sitting inside
 * a button that has its own accessible name: repeating that name announces the
 * same words twice and tells the reader nothing changed.
 */
export function spinnerHtml(label='Loading'):string{
  const bars=Array.from({length:10},(_,index)=>
    `<i aria-hidden="true" style="--spinner-angle:${index*36}deg;--spinner-delay:${index*100-900}ms"></i>`).join('');
  return `<span class="ui-geist-spinner" role="status" aria-label="${esc(label)}">${bars}</span>`;
}

/**
 * Geist Search Input: search icon as a prefix, swapped in place for a Spinner
 * while the query runs, and the input geometry never changes. Read-only queries
 * carry no submit button, so the accessible name lives in `aria-label` — a
 * placeholder is not a label, it disappears the moment there is text to read.
 */
export function searchInputHtml({label,id='',name='',value='',placeholder='',attrs=''}:{
  label?: string; id?: string; name?: string; value?: unknown; placeholder?: string; attrs?: string;
}={}):string{
  const parts=[
    'type="search" enterkeyhint="search"',
    id?`id="${esc(id)}"`:'',
    name?`name="${esc(name)}"`:'',
    placeholder?`placeholder="${esc(placeholder)}"`:'',
    `value="${esc(value)}"`,
    `aria-label="${esc(label)}"`,
    'spellcheck="false" autocomplete="off"',
    attrs,
  ].filter(Boolean).join(' ');
  return `<div class="geist-search" data-search-input>
    <span class="geist-search-prefix" data-search-prefix>${icon('search')}</span>
    <input ${parts}></div>`;
}

/**
 * The line next to Loading Dots while a list pages in: shared by the catalog sentinel, the junk files queue, and other infinite-scroll lists. The three dots are already animating,
 * so the text carries no ellipsis.
 */
export const LOAD_MORE_STATUS = 'Loading';

/** Geist Loading Dots: indeterminate work continuing in the background. The dots already say
 *  "still going", so the label never ends in an ellipsis. */
export function loadingDotsHtml(label='Processing', {className=''}={}):string{
  return `<span class="ui-geist-loading${className?` ${esc(className)}`:''}" role="status">
    <span class="ui-geist-loading-dots" aria-hidden="true"><i></i><i></i><i></i></span>
    <span>${esc(label)}</span></span>`;
}

/**
 * Page section Tabs: one mutually exclusive row of "which group of things this page currently shows".
 *
 * The index page uses it to switch label/agency and local/online, two vocabularies where each tier is an address. It answers
 * the page-level "which page am I on", not adding a filter to the current batch; filtering belongs to the pills on the glass
 * bar.
 * Each one is `role=tab` with `aria-selected` on the current one; the selected look is provided by `ui-board-local-nav`'s
 * neutral fill styles, and this only emits DOM. The count is an optional trailing badge whose basis the caller provides:
 * Tabs does no counting itself. A leading glyph is also optional, appearing only when it points at an object (labels,
 * agencies, local, feeds).
 */
export function boardTabsHtml(items:{value:unknown;label:unknown;count?:unknown;symbol?:string}[],
  {active='',attr='data-tab',label='Page views',className='',panel=''}:{
    active?: unknown; attr?: string; label?: string; className?: string; panel?: string;
  }={}):string{
  const tabs=items.map(({value,label:text,count,symbol})=>{
    const selected=String(value)===String(active);
    const badge=count==null?'':`<span class="ui-board-tab-count">${esc(Number(count).toLocaleString())}</span>`;
    return `<button type="button" role="tab" ${attr}="${esc(value)}" aria-selected="${selected}"${
      panel?` aria-controls="${esc(panel)}"`:''}>${symbol?icon(symbol):''}${esc(text)}${badge}</button>`;
  }).join('');
  return `<div class="ui-board-local-nav ui-board-tabs${className?` ${esc(className)}`:''}" role="tablist" aria-label="${esc(label)}">${tabs}</div>`;
}

/** Geist Empty State: icon tile, title and explanatory copy stay one semantic unit. */
/** Geist Empty State: icon, title and description live in one component. */
export function emptyStateHtml(iconName:string,title:unknown,description:unknown,{className='',actions=''}={}):string{
  return `<div class="ui-emptystate${className?` ${esc(className)}`:''}" data-geist-empty-state role="status">
    <div class="ui-es-icon" aria-hidden="true">${icon(iconName)}</div>
    <div class="ui-es-copy"><h3>${esc(title)}</h3><p>${esc(description)}</p></div>
    ${actions?`<div class="ui-es-actions">${actions}</div>`:''}
  </div>`;
}

/**
 * Shared checkbox. Native checkboxes in dark mode are browser-drawn, speaking a different language from the site's other controls;
 * `accent-color` can only change the checked color, and the unchecked state gets no hover feedback at all. So one is drawn by hand, shared by the
 * follows list, source filters, candidate lists, tag matching, and settings rows.
 */
export function badgeHtml(text:unknown):string{return `<span class="ui-geist-badge">${esc(text)}</span>`}

export function checkboxHtml(inputAttrs=''):string{
  return `<span class="ui-pcheck"><input type="checkbox" ${inputAttrs}><span aria-hidden="true">${icon('check')}</span></span>`;
}
