/* Frontend base layer: DOM lookup, requests, escaping, formatting, and route constants.
 * Application and React pages reference shared source directly, so LOC, fmtDur and other semantic contracts exist only once.
 * This layer imports no other frontend module, so the base layer referenced by every domain does not depend back on them.
 * route() stays in the app navigation domain because it also syncs the title and UI actions. */
import { entityLinkId, registerEntityLink, registerResponseEntities } from './entity-links';
import { SOURCE_LABELS } from './media-sources';
import { requestErrorMessage } from './request-error';
import { iconGeometry } from './icon-geometry';
import { libraryScopedPath } from './library-scope';
export { registerEntityLink, registerResponseEntities } from './entity-links';
export { requestErrorMessage } from './request-error';
const $=(s:string)=>document.querySelector(s);
/* A 1.4:1 glyph does not fit a square slot: aligned by width it comes out short, and next to full-bleed Lucide
   icons it just looks a size smaller. These glyphs have an outer viewBox matching the symbol's ratio, and CSS sizes the slot's width from its height. */
/** SVG fragment of a sprite glyph; `cls` is the class on the `<svg>` (such as `ui-externalmark`). */
const icon=(name:string,cls='')=>{
  const {wide,viewBox}=iconGeometry(name),classes=[wide?'iconwide':'',cls].filter(Boolean).join(' ');
  return `<svg${classes?` class="${classes}"`:''} viewBox="${viewBox}" aria-hidden="true"><use href="#i-${name}"/></svg>`};
/* `signal` is spelled out as an explicit entry, not smuggled through Object.assign: surface switches must be able to cancel requests from the previous screen
   that have not finished reading, and "this request can be cancelled" has to be visible in the signature. */
/** The legacy layer's fetch entry: JSON request body, throwing an Error with a human-readable reason on failure. */
const api=async(p:string,o?:RequestInit):Promise<unknown>=>{
  if(!o?.method||o.method.toUpperCase()==='GET')p=libraryScopedPath(p);
  const {signal=null,...rest}=o||{};
  const init:RequestInit={headers:{'Content-Type':'application/json'},...rest};
  if(signal)init.signal=signal;
  let response:Response;
  try{response=await fetch(p,init)}catch(error:any){if(error?.name==='AbortError')throw error;throw new Error(requestErrorMessage(error),{cause:error})}
  let payload:any=null;
  try{payload=await response.json()}catch{}
  if(!response.ok){
    const detail=payload&&(payload.message||payload.detail||payload.error);
    throw new Error(requestErrorMessage(detail,response.status));
  }
  registerResponseEntities(p,payload);
  return payload;
};
/* Cancellation is not failure. Abort can only come from a surface switch, and the call site already has an "expired" branch to walk,
   so it should not casually raise a "request failed" error toast. */
const isAbort=(error:any):boolean=>error?.name==='AbortError';
/* Batch requests with bounded concurrency. A thousand serial POSTs was the measured stall point (bulk-marking "watched"
   took minutes with the UI held the whole time), while firing everything at once is self-congestion: the browser allows only
   6 HTTP/1.1 connections per host, the extras queue, and normal browsing requests at the same time wait with them. So a few
   workers take tasks in order. Return order matches input order; one failure records its reason without interrupting the
   batch, since one failure in a bulk operation should not abandon the other few hundred. */
const mapLimit=async<T,R>(items:Iterable<T>,limit:number,run:(item:T,index:number)=>Promise<R>)
  :Promise<({ok:true;value:R}|{ok:false;error:unknown})[]>=>{
  const list=[...items],results=new Array<{ok:true;value:R}|{ok:false;error:unknown}>(list.length);
  let next=0;
  const worker=async()=>{
    while(next<list.length){
      const index=next++;
      try{results[index]={ok:true,value:await run(list[index] as T,index)}}
      catch(error){results[index]={ok:false,error}}
    }
  };
  const workers=Math.min(Math.max(1,limit),list.length);
  await Promise.all(Array.from({length:workers},worker));
  return results;
};
const STATE_ROUTES:Record<string,string>={fresh:'/unseen',later:'/watch-later',flagged:'/flagged',ads:'/junk-files'};
const ROUTE_STATES:Record<string,string>=Object.fromEntries(Object.entries(STATE_ROUTES).map(([state,path])=>[path,state]));
const STATE_LABELS:Record<string,string>={fresh:'Not watched',later:'Watch later',flagged:'Marked',ads:'Junk files'};
const isCatalogPath=(path:string)=>path==='/'||path==='/wall'||Object.prototype.hasOwnProperty.call(ROUTE_STATES,path);
const ENTITY_ROUTES:Record<string,string>={performer:'performers',studio:'studios',creator:'creators',series:'series',agency:'agencies',tag:'tags'};
const ROUTE_ENTITIES:Record<string,string>={performers:'performer',studios:'studio',creators:'creator',series:'series',agencies:'agency',tags:'tag'};
/** Entity profile pages use the stable identity already obtained. Name-based URLs are resolved to an ID by the profile router. */
const entityPath=(kind:string,name:string,id?:number|null)=>{
  if(id)registerEntityLink(kind,name,id);
  const target=id||entityLinkId(kind,name);
  return `/${ENTITY_ROUTES[kind]||kind}/${target||encodeURIComponent(name)}`;
};
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[c] as string);
/* External links carry the site's short name: agencies and labels are normally called NAX, T-POWERS, DMM, while the
   database's label is the full name copied at collection time (`New Actor eXperience`, `DMM Search`), and the domain makes
   you first pick out which part of `OFFICIAL.NAX-PRO.COM` is the name. Both are harder to read than the short name,
   especially in a row of links.

   The table is keyed by hostname, counting trailing suffixes too (`official.nax-pro.com` hits `nax-pro.com`). Sites missing
   from the table fall back to the database label: the table covers the frequently visited sites, and the long tail is not
   worth registering entry by entry, while a label is at least human-written. The database's label is untouched: it is
   collection evidence; display is a separate matter. */
const SITE_NAMES:[string,string][]=[['nax-pro.com','NAX'],['t-powers.co.jp','T-POWERS'],['dmm.co.jp','DMM'],
  ['mgstage.com','MGStage'],['av-event.jp','AV-EVENT'],['k-mib.com','K-MIB'],
  ['minnano-av.com','みんなのAV'],
  ['km-produce.com','KMP'],['mousouzoku-av.com','妄想族'],['mines-pro.jp','マインズ'],
  ['lightpro.jp','LIGHT'],['eltra.jp','ELTRA'],['linx.live','LINX'],['bambi.ne.jp','Bambi'],
  ['prestige-av.com','Prestige'],['cmore.jp','C-more'],['so-agent.jp','SO MODEL'],
  ['attractive-llc.net','Attractive'],['krone-web.jp','KRONE'],['actentertainment.jp','ACT'],
  ['crusegroup.net','Cruse'],['prime-recruit.com','Prime'],['life-promotion.com','Life'],
  ['8man.jp','Eightman'],['senzai.tv','Five'],['maxing.jp','MAXING'],['s1s1s1.com','S1'],
  ['ideapocket.com','Idea Pocket'],['faleno.jp','FALENO'],['capsule.bz','Capsule'],
  ['sod.co.jp','SOD'],['tokyo-hot.com','Tokyo-Hot'],['heyzo.com','HEYZO'],
  ['dogma.co.jp','DOGMA'],['naturalhigh.co.jp','Natural High'],['bangbros.com','BangBros'],
  ['dorcelclub.com','Dorcel']];
const bareHost=(host:unknown)=>String(host).replace(/^www\./,'').toLowerCase();
const linkHost=(url:unknown)=>{try{return bareHost(new URL(url as string).hostname)}catch{return ''}};
const siteName=(url:unknown)=>{
  const host=linkHost(url);
  return host&&SITE_NAMES.find(([domain])=>host===domain||host.endsWith('.'+domain))?.[1]||'';
};
/* Link icons processed by the server: a monochrome-glyph favicon becomes "brand-color base + white subject", or the original
   is converted out at 32 px when it cannot. Serving it server-side has three reasons: it must read other sites' images,
   it caches, and this way the browser no longer sends requests straight to the other site (so it stops leaking whose profile
 * page is being viewed).
 *
 * What is passed is the link's id, not the address. The same rule as `/follow-stream`: the server only takes addresses
 * already in the database and never fetches an arbitrary URL the frontend hands over, which would open a hole for fetching
 * arbitrary addresses. */
const linkMarkUrl=(link:{link_id?:number|null})=>`/link-mark?id=${encodeURIComponent(link.link_id ?? '')}`;
/* Round badges for the sites in scraping sources and the taste ranking, another entry into the same rule: what is passed is a key the server already
   knows, the scraping source key or a suffix from the taste domain whitelist, not an address. */
const siteMarkUrl=(params:{source:string}|{domain:string})=>`/site-mark?${new URLSearchParams(params)}`;
/* Common social platforms present in the icon library use inline brand marks; not even a favicon is fetched.
 *
 * A favicon is a small bitmap on someone else's server: X and Instagram block scraping outright, leaving only a globe on the
 * profile page; what can be fetched is mostly 16×16, guaranteed blurry inside a 32 px circle. The large images sites serve
 * fail differently: Threads and TikTok serve iOS-app-icon-style rounded squares whose highlight ring is drawn for square
 * corners, so cropping to a circle exposes a white rim along the arc, and that highlight is part of their design; `/link-mark`
 * cannot cut it out. Inline SVG has neither problem and saves a cross-site request, and the base is the brand's own color,
 * not theme-dependent.
 * The list follows the icon library's coverage, not link counts: Phosphor has glyphs for these seven, one each; the ones it
 * lacks (livedoor, ameblo, lit.link, pub.linx.live and the like) keep going through `/link-mark`, which composes a brand-color
 * circle from the site's own icon. */
const BRAND_ICONS:[string[],string][]=[[['x.com','twitter.com'],'brand-x'],[['instagram.com'],'brand-instagram'],
  [['threads.com','threads.net'],'brand-threads'],[['tiktok.com'],'brand-tiktok'],
  [['youtube.com','youtu.be'],'brand-youtube'],[['facebook.com','fb.com'],'brand-facebook'],
  [['linktr.ee','linktree.com'],'brand-linktree']];
const brandIcon=(url:unknown)=>{
  const host=linkHost(url);
  return host&&BRAND_ICONS.find(([hosts])=>hosts.some(d=>host===d||host.endsWith('.'+d)))?.[1]||'';
};
/** The fold used for name comparison: NFKC, trim, lowercase. */
const foldName=(s:unknown)=>String(s??'').normalize('NFKC').trim().toLocaleLowerCase();
/* The line of text on official-site links. Writes the site's short name (`siteName`), or the database label when the table
   has none.

   On label and agency pages, links back to the label's own site read "Official website": the page header already carries the
   company name, and writing S1 or LIGHT again on the link is just repetition. Person pages keep writing the name, because
   there the name says which company she belongs to, which is exactly the information wanted. A name belonging to another
   company (the Jackson page linking to Prestige's roster page) is kept too, since it speaks of the other company. "Own
   company" is judged by the short name or label mutually containing the canonical name or aliases: `C-more` against
   `C-more Entertainment`; when the short name is an abbreviation, look at the label (`NAX`'s entry has the label
   `New Actor eXperience`). A label that is only the link's own hostname (`www.ran-maru.com`) counts as unnamed and is
   therefore also "own company".

   Archived snapshots (`web.archive.org`) always render the label as-is: after a company closes, the official site survives
   only as that copy, and the label records which year it is from; rewriting it as "Official website" would hide that the
   click leads to an old page. */
const ARCHIVE_HOSTS=['web.archive.org'];
const isArchiveLink=(url:unknown)=>ARCHIVE_HOSTS.includes(linkHost(url));
const officialLinkText=(link:{url?:string;label?:string},kind:string,names:readonly string[]=[])=>{
  const text=siteName(link.url)||link.label||'';
  if((kind!=='studio'&&kind!=='agency')||isArchiveLink(link.url))return text;
  const said=[text,link.label].map(foldName).filter(Boolean);
  const own=!said.length||said.includes('Official site')||said.some(shown=>
    bareHost(shown)===linkHost(link.url)||names.some(name=>{
      const folded=foldName(name);
      return Boolean(folded)&&(folded.includes(shown)||shown.includes(folded));
    }));
  return own?'Official site':text;
};
/* What counts as a real duration: this is the only place that decides.
 *
 * In the database, `-1` is probe's "hard failure" sentinel (see scripts/probe.py: the frame-extraction duration>2 threshold
 * would strand failed entries forever, so hard failures are written as -1); it is not a duration. And a truthiness check
 * like `!s` does not stop negatives: `fmtDur(-1)` computes `0:-1`, and feeding it to the player is worse: Video.js's
 * duration() setter contains `parseFloat(e)<0 ? Infinity : e`, and the following `=== Infinity` adds `addClass("vjs-live")`,
 * so a local movie gets labeled live and the total duration shows NaN.
 *
 * So the criterion is "finite and greater than zero", not "truthy". */
const realDuration=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:0};
/** Seconds format as `h:mm:ss`/`m:ss`, and from 48 hours up as `N days N hours`; `0`, negatives and non-finite values are `-`
 *  (probe's hard-failure sentinel). */
const fmtDur:(seconds:number|null|undefined)=>string=(s:any)=>{s=realDuration(s);if(!s)return'—';s=Math.round(s);
  if(s>=48*3600){const d=Math.floor(s/86400),hours=Math.floor((s%86400)/3600);return hours?`${d} days ${hours} hours`:`${d} days`}
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),x=s%60;
  return h?`${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`:`${m}:${String(x).padStart(2,'0')}`};
/** Formats seconds into the player clock `h:mm:ss` / `m:ss`; non-numeric values count as 0. */
const fmtClock:(seconds:unknown)=>string=(s:any)=>{s=Math.max(0,Math.floor(Number(s)||0));const h=s/3600|0,m=(s%3600)/60|0,x=s%60;
  return h?`${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`:`${m}:${String(x).padStart(2,'0')}`};
/* Cloud drive capacities can reach PB: PikPak reports 10 PiB, which written as TB is "10240.00 TB". Below 1 MB write KB;
   the smallest nonzero value writes 1 KB, so 1 byte never reads as "0". Missing values, NaN, and negatives are "size unknown"; 0 is a real 0;
   reclaimable space and downloaded amounts can legitimately be 0, while a single file's 0 bytes is judged unknown by the caller. */
const fmtSize:(bytes:number|null|undefined)=>string=(value:any)=>{
  if(value===null||value===undefined||value==='')return 'Unknown size';
  const b=Number(value);
  if(!Number.isFinite(b)||b<0)return 'Unknown size';
  if(b===0)return '0 B';
  if(b<1048576)return `${Math.max(1,Math.round(b/1024))} KB`;
  return b>=1125899906842624?(b/1125899906842624).toFixed(2)+' PB':b>=1099511627776?(b/1099511627776).toFixed(2)+' TB':b>=1073741824?(b/1073741824).toFixed(1)+' GB':Math.floor(b/1048576)+' MB'};
/* The first grapheme of the name, used for the avatar backing and the initial-in-circle. Taking it by UTF-16 code unit splits emoji into half a surrogate pair,
   which renders as "�"; skin tones, ZWJ sequences and flags must also be taken whole. Empty names use `fallback`. */
const graphemeSegmenter=typeof Intl!=='undefined'&&typeof Intl.Segmenter==='function'
  ? new Intl.Segmenter(undefined,{granularity:'grapheme'})
  : null;
const graphemesOf=(value:string)=>graphemeSegmenter
  ? Array.from(graphemeSegmenter.segment(value),part=>part.segment)
  : Array.from(value);
/** The first `count` graphemes, no ellipsis added: used for the two characters backing a label without a logo. */
const leadingGraphemes=(value:unknown,count:number)=>{
  const text=String(value??'').trim(),parts:string[]=[];
  if(!text||count<=0)return '';
  if(!graphemeSegmenter)return Array.from(text).slice(0,count).join('');
  for(const part of graphemeSegmenter.segment(text)){parts.push(part.segment);if(parts.length>=count)break}
  return parts.join('');
};
const firstGrapheme=(value:unknown,fallback='?')=>leadingGraphemes(value,1)||fallback;
/** Truncates by grapheme: past `max` graphemes it keeps the first `max - 1` and appends "...". */
const clipGraphemes=(value:unknown,max:number)=>{
  const parts=graphemesOf(String(value??''));
  return parts.length>max?`${parts.slice(0,Math.max(0,max-1)).join('')}…`:parts.join('');
};
/** Source code to UI name: `local`→`Local`, `115`→`115`, `pikpak`→`PikPak`, `online`→`Online`. */
const LOC:Record<string,string>={...SOURCE_LABELS,local:'Local',online:'Online'};
/* Seed randomness: FNV-1a compresses "seed + key" into a 32-bit number as the sort key. Under one seed the order is stable;
   a different seed is a different order; the client need not store PRNG state nor make the backend carry an extra parameter. The home page's
   sampling and the follows page island's two rows share this copy; the same seed yields the same batch on both sides. */
const seededRank=(seed:number|string,value:string)=>{
  let hash=2166136261>>>0;
  for(const char of `${seed}\u0000${value}`){hash^=char.codePointAt(0) as number;hash=Math.imul(hash,16777619)>>>0}
  return hash;
};
/* Roll one sampling seed. The XOR result is signed 32-bit, so convert to unsigned before the modulo: the seed goes into the address and the backend only accepts non-negative integers. */
const newSeed=()=>String(((Date.now()^(Math.random()*1e9|0))>>>0)%99991);
/* The four duration tiers are duration segments on the filter bar, not content tags: the catalog's tag filter excludes them, and any arriving on the address are stripped too. */
const DURATION_TAGS:ReadonlySet<string>=new Set(['Short - under 2 min','Medium - under 10 min','Long - under 30 min','Extra long - 30 min and up']);
const cleanTagFilter=(value:unknown)=>String(value||'').split(',').filter(tag=>tag&&!DURATION_TAGS.has(tag)).join(',');

export {
  $,
  seededRank,
  newSeed,
  DURATION_TAGS,
  cleanTagFilter,
  realDuration,
  icon,
  api,
  isAbort,
  mapLimit,
  STATE_ROUTES,
  ROUTE_STATES,
  STATE_LABELS,
  isCatalogPath,
  ENTITY_ROUTES,
  ROUTE_ENTITIES,
  entityPath,
  esc,
  brandIcon,
  siteName,
  linkMarkUrl,
  siteMarkUrl,
  foldName,
  officialLinkText,
  fmtDur,
  fmtClock,
  fmtSize,
  firstGrapheme,
  leadingGraphemes,
  clipGraphemes,
  LOC,
};
