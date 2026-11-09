/* Peach's native adapter over Geist MiddleTruncate.
 *
 * Only verified behavior is reused: keep head and tail by container width, use a single ellipsis, recompute on width change,
 * and still provide the full original for copy and accessible name. Callers only add data-middle-truncate to a file name,
 * path, URL or ID; titles and descriptions keep tail ellipsis. Shipped with `peach-app.js`, with Application's startup and
 * the document-wide single observer; attributes written by native hosts and the React subtree are all its business. */

interface TruncateState { full: string; rendered: string }

const ELLIPSIS='…';
const segmenter=typeof Intl.Segmenter==='function'
  ? new Intl.Segmenter(undefined,{granularity:'grapheme'})
  : null;
const states=new WeakMap<Element,TruncateState>();
const scheduled=new Set<HTMLElement>();
let frame=0;
let observed=new WeakSet<Element>();
let resizeObserver:ResizeObserver|null=null;
let disposeTruncation:(()=>void)|null=null;

const graphemes=(value:unknown)=>segmenter
  ? [...segmenter.segment(String(value??''))].map(part=>part.segment)
  : Array.from(String(value??''));

/* The display text when keeping kept glyphs, odd positions prefer keeping the start; when kept equals the total, it's the original text. */
const keptText=(parts:string[],kept:number)=>{
  if(kept>=parts.length)return parts.join('');
  const head=Math.ceil(kept/2),tail=Math.floor(kept/2);
  return parts.slice(0,head).join('')+ELLIPSIS+(tail?parts.slice(-tail).join(''):'');
};

/* Binary search for the longest head-tail combination that fits, returning the number of glyphs kept; when nothing fits, it's 0, leaving only the ellipsis. */
const longestKept=(parts:string[],fits:(candidate:string)=>boolean)=>{
  if(!parts.length||fits(parts.join('')))return parts.length;
  let low=0,high=parts.length-1,best=0;
  while(low<=high){
    const kept=(low+high)>>1;
    if(fits(keptText(parts,kept))){best=kept;low=kept+1}else high=kept-1;
  }
  return best;
};

/* The pure-algorithm boundary is exported separately so Node can test it directly, without faking a DOM. fits(candidate) is injected by the browser
   measurement layer. */
function middleTruncateText(value:unknown,fits:(candidate:string)=>boolean):string{
  const parts=graphemes(value);
  return keptText(parts,longestKept(parts,fits));
}

/* The page has text-autospace on: Chromium adds 1/8 em spacing where CJK characters, kana, and Latin letters and digits sit adjacent,
   and full-width punctuation is also squeezed by text-spacing-trim; Canvas measureText accounts for neither. Text containing these characters
   takes the Canvas reading (with estimated spacing added) as its starting point, then confirms each via an offscreen DOM probe; pure Latin text still uses Canvas only. */
const WIDE=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u;
const IDEOGRAPH=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const ALPHANUMERIC=/[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Nd}]/u;
const FULLWIDTH=/[＀-￯]/u;

const spacingClass=(char:string)=>IDEOGRAPH.test(char)?1:ALPHANUMERIC.test(char)&&!FULLWIDTH.test(char)?2:0;
const autospaceGaps=(value:string)=>{
  let gaps=0,previous=0;
  for(const char of value){
    const current=spacingClass(char);
    if(previous&&current&&previous!==current)gaps++;
    previous=current;
  }
  return gaps;
};

let canvas:HTMLCanvasElement|null=null;
const canvasWidth=(element:Element,mixed:boolean)=>{
  const style=getComputedStyle(element);
  const context=(canvas||(canvas=document.createElement('canvas'))).getContext('2d');
  if(!context)return ()=>Number.POSITIVE_INFINITY;
  /* Chromium returns the computed font shorthand as an empty string when font-variant-numeric's tabular figures are on;
     assigning it directly would make Canvas silently fall back to 10px sans-serif, underestimating CJK filename widths. */
  context.font=style.font||`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const letterSpacing=parseFloat(style.letterSpacing),wordSpacing=parseFloat(style.wordSpacing);
  const autospace=style.getPropertyValue('text-autospace');
  const gap=mixed&&autospace&&autospace!=='no-autospace'?(parseFloat(style.fontSize)||0)/8:0;
  return (value:string)=>{
    let width=context.measureText(value).width;
    if(Number.isFinite(letterSpacing))width+=Math.max(0,graphemes(value).length-1)*letterSpacing;
    if(Number.isFinite(wordSpacing))width+=(value.match(/\s/g)||[]).length*wordSpacing;
    if(gap)width+=autospaceGaps(value)*gap;
    return width;
  };
};

/* The probe sits under <html>, outside <body>, so measuring doesn't trip the body's MutationObserver; contain: strict
   means changing text only reflows itself. It can't inherit styles from the React container, so the layout-relevant computed values are copied over item by item; the same style
   measured repeatedly isn't reset. */
const PROBE_STYLE=['font-family','font-size','font-weight','font-style','font-stretch',
  'font-variant-ligatures','font-variant-caps','font-variant-numeric','font-variant-east-asian',
  'font-variant-alternates','font-variant-position','font-feature-settings','font-variation-settings',
  'font-kerning','font-optical-sizing','font-size-adjust','font-synthesis','letter-spacing','word-spacing',
  'text-transform','text-rendering','text-autospace','text-spacing-trim','white-space-collapse'];
let probe:{box:HTMLElement,groups:Map<string,HTMLElement>}|null=null;

const probeGroup=(element:Element)=>{
  if(!probe){
    const box=document.createElement('div');
    box.setAttribute('aria-hidden','true');box.dataset.middleTruncateProbe='';
    box.style.cssText='position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;contain:strict';
    probe={box,groups:new Map()};
  }
  if(!probe.box.isConnected)document.documentElement.append(probe.box);
  const style=getComputedStyle(element);
  const values=PROBE_STYLE.map(name=>style.getPropertyValue(name));
  const lang=element.closest('[lang]')?.getAttribute('lang')||'';
  const key=values.join('\n')+'\n'+lang;
  let group=probe.groups.get(key);
  if(!group){
    group=document.createElement('div');
    values.forEach((value,index)=>group!.style.setProperty(PROBE_STYLE[index]!,value));
    group.lang=lang;probe.box.append(group);probe.groups.set(key,group);
  }
  return group;
};

interface Fit { element:HTMLElement; state:TruncateState; available:number; parts:string[]; kept:number }
interface Probing { fit:Fit; group:HTMLElement; fits:number; fails:number; tries:number[] }

/* Only one probe pass per frame: the candidates for all pending elements go into the probe at once, read the width once, then narrow the interval by the result.
   fits is the largest confirmed-kept count (0 leaves only the ellipsis, always fits); fails is the smallest confirmed-unfit value.
   The first round tries the Canvas seed and its next; usually settled in one round; unsettled ones retry the interval's ends and middle, converging within a few rounds. */
const MAX_PROBE_ROUNDS=8;
const probeAll=(pending:Probing[])=>{
  for(let round=0;pending.length&&round<MAX_PROBE_ROUNDS;round++){
    const spans=pending.map(job=>job.tries.map(count=>{
      const span=document.createElement('span');
      span.style.cssText='display:block;width:max-content;text-wrap-mode:nowrap';
      span.textContent=keptText(job.fit.parts,count);job.group.append(span);
      return span;
    }));
    pending.forEach((job,index)=>job.tries.forEach((count,offset)=>{
      if(spans[index]![offset]!.getBoundingClientRect().width<=job.fit.available)job.fits=Math.max(job.fits,count);
      else job.fails=Math.min(job.fails,count);
    }));
    spans.flat().forEach(span=>span.remove());
    pending=pending.filter(job=>{
      job.fit.kept=job.fits;
      const open=job.fails-job.fits-1;
      if(open<=0)return false;
      const step=(job.fails-job.fits)/3;
      job.tries=[...new Set([job.fails-1,job.fits+1,Math.round(job.fits+step),Math.round(job.fits+2*step)])]
        .filter(count=>count>job.fits&&count<job.fails);
      return true;
    });
  }
};

/* First decide all elements' results by Canvas; those containing Chinese/Japanese are then batch-confirmed by the probe. */
const fitAll=(fits:Fit[])=>{
  const pending:Probing[]=[];
  for(const fit of fits){
    const full=fit.state.full,mixed=WIDE.test(full);
    const estimate=canvasWidth(fit.element,mixed);
    fit.kept=longestKept(fit.parts,candidate=>estimate(candidate)<=fit.available);
    if(!mixed)continue;
    const tries=[fit.kept,fit.kept+1].filter(count=>count>0&&count<=fit.parts.length);
    pending.push({fit,group:probeGroup(fit.element),fits:0,fails:fit.parts.length+1,tries});
  }
  probeAll(pending);
};

/* clientWidth rounds to an integer. When the box shrinks to its content (a name with max-width in the breadcrumbs), flooring makes it slightly narrower than the existing text,
   and the probe measures accurately — every round judges "doesn't fit" and trims one more character. Switch to the fractional width from the computed style, serializing to only
   six significant digits, adding a LayoutUnit; ceiling still uses clientWidth, so results that originally fit are unchanged. */
const clientWidth=(element:HTMLElement)=>{
  const style=getComputedStyle(element),width=parseFloat(style.width);
  if(!Number.isFinite(width))return element.clientWidth;
  const inner=style.boxSizing==='border-box'
    ? width-(parseFloat(style.borderLeftWidth)||0)-(parseFloat(style.borderRightWidth)||0)
    : width+(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0);
  return Math.max(element.clientWidth,inner+1/64);
};

/* Available width defaults to the element's own box. Elements with data-middle-truncate-within shrink to fit content (with
   something else right behind, like the "max" tag after a file name), so their own box is the current text's width; using it
   as the ceiling, the sub-pixel rounding loss in clientWidth would declare "does not fit" every round, truncating shorter
   each time. Such elements measure by the parent instead: the parent's content width minus all siblings and column gaps is
   what the text can take. */
const availableWidth=(element:HTMLElement)=>{
  if(element.dataset.middleTruncateWithin===undefined)return clientWidth(element);
  const box=element.parentElement;if(!box)return element.clientWidth;
  const style=getComputedStyle(box);
  const gap=parseFloat(style.columnGap)||0;
  let used=0,shown=0;
  for(const child of box.children){
    const width=child.getBoundingClientRect().width;
    if(child===element){shown++;continue}
    if(width>0){used+=width;shown++}
  }
  return box.getBoundingClientRect().width-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0)
    -used-gap*Math.max(0,shown-1);
};

/* In one frame, read all widths and measure all candidates first, then write back together at the end: interleaving reads and writes makes every element trigger a full-page reflow;
   with hundreds of filenames a single resize would reflow hundreds of times. */
const paint=()=>{
  frame=0;
  const fits:Fit[]=[];
  for(const element of scheduled){
    const state=states.get(element);
    if(!state||!element.isConnected)continue;
    fits.push({element,state,available:availableWidth(element),parts:graphemes(state.full),kept:0});
  }
  scheduled.clear();
  fitAll(fits.filter(fit=>fit.available>0));
  for(const {element,state,available,parts,kept} of fits){
    const rendered=available>0?keptText(parts,kept):state.full;
    state.rendered=rendered;
    if(element.textContent!==rendered)element.textContent=rendered;
    const truncated=rendered!==state.full;
    element.classList.toggle('middle-truncated',truncated);
    element.setAttribute('aria-label',state.full);
    if(!element.hasAttribute('title')||element.dataset.middleTitle==='true'){
      element.title=state.full;element.dataset.middleTitle='true';
    }
  }
};

const schedule=(element:Element)=>{
  if(!states.has(element))return;
  scheduled.add(element as HTMLElement);
  if(!frame)frame=requestAnimationFrame(paint);
};

const bind=(element:Element)=>{
  if(!(element instanceof HTMLElement))return;
  if(!states.has(element))states.set(element,{full:element.textContent||'',rendered:element.textContent||''});
  if(!observed.has(element)){
    observed.add(element);
    /* Elements measured against their parent recompute with the parent's size: their own box changes only with the text, never with the window. */
    if(element.dataset.middleTruncateWithin!==undefined&&element.parentElement)resizeObserver?.observe(element.parentElement);
    else resizeObserver?.observe(element);
  }
  schedule(element);
};

const scan=(node:Node)=>{
  if(node.nodeType!==Node.ELEMENT_NODE)return;
  const element=node as Element;
  if(element.matches('[data-middle-truncate]'))bind(element);
  element.querySelectorAll('[data-middle-truncate]').forEach(bind);
};

function initMiddleTruncate(root:Document|Element=document):()=>void{
  disposeTruncation?.();
  observed=new WeakSet<Element>();
  let live=true;
  resizeObserver=new ResizeObserver(entries=>entries.forEach(entry=>{
    if(!live)return;
    schedule(entry.target);
    entry.target.querySelectorAll?.(':scope>[data-middle-truncate-within]').forEach(schedule);
  }));
  const resize=resizeObserver;
  scan((root as Document).documentElement||root);
  const mutations=new MutationObserver(records=>records.forEach(record=>{
    if(!live)return;
    record.addedNodes.forEach(scan);
    const element=record.target.nodeType===Node.TEXT_NODE?record.target.parentElement:record.target as Element;
    const target=element?.closest?.('[data-middle-truncate]') as HTMLElement|null|undefined;
    if(!target)return;
    const state=states.get(target);
    if(state&&target.textContent!==state.rendered){
      state.full=target.textContent||'';
      if(target.dataset.middleTitle==='true')target.removeAttribute('title');
      schedule(target);
    }
  }));
  mutations.observe((root as Document).body||root,{childList:true,characterData:true,subtree:true});
  document.fonts?.ready?.then(()=>{if(live)root.querySelectorAll('[data-middle-truncate]').forEach(schedule)});
  const copy:EventListener=event=>{
    const selection=document.getSelection();
    if(!selection||selection.isCollapsed)return;
    const anchor=selection.anchorNode?.nodeType===Node.ELEMENT_NODE?selection.anchorNode as Element:selection.anchorNode?.parentElement;
    const target=anchor?.closest?.('[data-middle-truncate]');
    const state=target&&states.get(target);
    if(!state||!target.contains(selection.focusNode)||!(event as ClipboardEvent).clipboardData)return;
    (event as ClipboardEvent).clipboardData?.setData('text/plain',state.full);event.preventDefault();
  };
  root.addEventListener('copy',copy);
  const dispose=()=>{
    if(!live)return;live=false;
    resize.disconnect();mutations.disconnect();root.removeEventListener('copy',copy);probe?.box.remove();
    if(frame)cancelAnimationFrame(frame);
    frame=0;scheduled.clear();
    if(disposeTruncation===dispose){disposeTruncation=null;resizeObserver=null}
  };
  disposeTruncation=dispose;
  return dispose;
}

export { initMiddleTruncate, middleTruncateText };
