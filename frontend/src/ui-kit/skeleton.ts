/* Skeletons: whole-block, index and configuration-page placeholders; they fill in to actual size after entering the DOM, appear past the visibility threshold,
   and swap for real content when data arrives. Referenced directly from shared source and shipped with `peach-app.js`. */
import { esc } from '../core';
import { tagSkeletonHtml } from '../tag-skeleton';

/**
 * Swap the placeholder for real content: the old screen lifts into a layer over the container and fades out, while new content sharpens from blur.
 *
 * `write()` is responsible for writing new content into `container`. Without a skeleton in the container, write directly and skip this layer;
 * page changes and filtering, content-for-content swaps, do not belong to this effect, and wrapping them would blur the whole page on every filter change.
 */
export function revealSkeleton(container:any,write:()=>void):void{
  if(!container)return;
  /* The fetch finished before the visibility threshold was reached: drop the content in directly. A placeholder that was never seen should not get
     a "skeleton exit" animation; this also removes skeleton flicker entirely for fast local requests. */
  if(container.querySelector('.skeleton-awaiting')){write();return}
  const hasSkeleton=container.querySelector('.skeleton,[data-skeleton],.skeletoncard,.countskeleton');
  if(!hasSkeleton||!container.firstChild){write();return}
  const fade=document.createElement('div');
  fade.className='skelfade';
  fade.setAttribute('aria-hidden','true');
  while(container.firstChild)fade.append(container.firstChild);
  write();
  container.classList.add('skelreveal');
  container.prepend(fade);
  container.getBoundingClientRect();
  container.classList.add('revealing');
  const drop=()=>{fade.remove();container.classList.remove('skelreveal','revealing')};
  const done=(event:Event)=>{if(event.target!==fade)return;fade.removeEventListener('transitionend',done);drop()};
  fade.addEventListener('transitionend',done);
  setTimeout(()=>{if(fade.isConnected){fade.removeEventListener('transitionend',done);drop()}},1000);
}

export function configurationSkeletonHtml():string{
  const groups:[string,number][]=[['General',2],['Media',2],['Download',2],['Network & access',3],['Maintenance',3]];
  return `<div class="ui-configpage" data-skeleton="configuration" role="status" aria-label="Loading configuration">${groups.map(([label,count])=>`<h2 class="ui-configgroup" aria-hidden="true">${label}</h2>${Array.from({length:count},()=>`<div class="configfieldset config-skeleton-card" aria-hidden="true"><div class="geist-fieldset-content"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div><footer class="geist-fieldset-footer"><span class="skeleton"></span></footer></div>`).join('')}`).join('')}</div>`;
}

/** Geist Skeleton: reserve a large content region while its structure is loading. */
/* `count` only applies to cards: the block count is a structural promise the skeleton makes out loud; six blocks correspond to the poster grid,
   while admin screens often have only two or three large regions. Extra blocks vanish once loading finishes; that is not a placeholder but a false report.
   `cardRatio` is the card cover's aspect ratio, given by the caller to match the real card layout: the front cover in the large-image layout is portrait;
   if the skeleton lays out at 16:9, once content arrives every full-width card gets stretched taller. */
export function skeletonHtml(label='Loading content',{className='',variant='panel',count=6,fill=true,gridClass='',gridSize='',cardRatio=0}={}):string{
  const kind=new Set(['panel','cards','dashboard']).has(variant)?variant:'panel';
  const body=kind==='cards'
    ?Array.from({length:Math.max(1,count)},
      ()=>`<span class="skeletoncard"><i></i><s></s><b></b><em></em><u></u></span>`).join('')
    :kind==='dashboard'
      /* The metrics band is the real first-screen content of both the statistics and taste pages, with the four cells' positions and heights fixed.
         If the skeleton starts with the big sections and the 96px band squeezes in from the top when data arrives, the whole page jumps down once. */
      ?`<span class="ui-skeletondashstrip">${Array.from({length:4},
          ()=>`<span><i></i><b></b><em></em></span>`).join('')}</span>
        <span class="ui-skeletondashhero"><i></i><b></b></span>
        <span class="ui-skeletondashpanel"><i></i><b></b><em></em></span>
        <span class="ui-skeletondashpanel"><i></i><b></b><em></em></span>`
    :`<span class="skeleton" style="width:38%"></span>
      <span class="skeleton" style="width:100%"></span>
      <span class="skeleton" style="width:100%"></span>
      <span class="skeleton" style="width:72%"></span>`;
  /* data-skeleton is this skeleton's identity. A deep-link start draws one, then each page draws another once routing settles,
     so a full reload would flash two animations in a row; callers use this key to recognize "already the same one" and skip the redraw. */
  return `<div class="skeletonpanel skeleton-${kind}${className?` ${esc(className)}`:''}"
    data-skeleton="${esc(kind)}${className?`/${esc(className)}`:''}"${kind==='cards'&&fill?' data-fill=""':''}
    role="status" aria-label="${esc(label)}"><span class="sr-only">${esc(label)}</span>
    <div${gridClass?` class="${esc(gridClass)}"`:''}${gridSize?` data-size="${esc(gridSize)}"`:''}${
      kind==='cards'&&Number(cardRatio)>0?` style="--skeleton-card-ratio:${Number(cardRatio)}"`:''} aria-hidden="true">${body}</div></div>`;
}

/** The index placeholder reuses the sizes of the final grid, avatars, and word list. */
/** The index page placeholder: roster grid, alphabet, or tag cloud, sized to the final layout. The first screen and in-page switching share this one. */
export function indexSkeletonHtml({kind,layout='big',mode='alphabet'}:{kind?:string;layout?:string;mode?:string}={}):string{
  if(kind==='tags')return tagSkeletonHtml({ mode });
  const company=kind==='studios'||kind==='agencies'||kind==='series';
  const cell='<span class="icell"><span class="ring skeleton"></span><span class="nm skeleton">&nbsp;</span><span class="n skeleton">&nbsp;</span></span>';
  const body=`<div class="igrid" data-cells="${company?'company':'people'}" data-layout="${esc(layout)}">${cell.repeat(12)}</div>`;
  const label='Loading the index';
  return `<div class="skeletonpanel index-skeleton" data-skeleton="index/${esc(kind)}/${esc(layout)}/${esc(mode)}" data-fill=""
    role="status" aria-label="${label}"><span class="sr-only">${label}</span><section aria-hidden="true">${body}</section></div>`;
}

/* The skeleton's count is decided by the container's current width, not hardcoded: a horizontal row lays to the right edge, and the grid fills
   the whole row. Hardcoding would leave a gap in the last row on wide screens and a pile of placeholders on narrow screens and mobile that only appear by
   horizontal scrolling; computing it spares per-breakpoint variants. The width sequence only varies the pills' lengths, like real words. */
const SKELETON_SLOT:Record<string,(width:number)=>string>={
  av:()=>`<span class="av avskeleton"><span class="ring"></span><span class="nm">&nbsp;</span></span>`,
  brandpill:width=>`<span class="brandpill brandskeleton" style="width:${width}px"><span class="mk"></span></span>`,
  pill:width=>`<span class="pill tagskeleton" style="width:${width}px"></span>`,
  'filter-pill':width=>`<span class="skeleton" style="width:${width}px;height:var(--control-h-compact);border-radius:8px;flex:none"></span>`,
};
const SKELETON_SLOT_WIDTHS:Record<string,number[]>={
  av:[0],
  brandpill:[132,158,118,146,124,164,138],
  pill:[92,68,104,76,88,64,96,72,100,80,68,92,76,84],
  'filter-pill':[92,68,104,76,88,64,96,72,100,80,68,92,76,84],
};

/* Requests under this threshold show content directly. Peach's data is mostly local, and immediately painting a placeholder would make a tens-of-milliseconds
   normal read look like a flicker; past the threshold means the page truly needs to wait. Only the outermost placeholder hides; the inner structure still
   participates in layout and fit computation, so no reflow when it actually appears. */
export const SKELETON_REVEAL_DELAY=180;
const SKELETON_REVEAL_SELECTOR='[data-skeleton],[data-skeleton-tier],.countskeleton';
function armSkeletonReveal(root:any){
  if(!root)return;
  const all:HTMLElement[]=[...(root.matches?.(SKELETON_REVEAL_SELECTOR)?[root]:[]),
    ...root.querySelectorAll(SKELETON_REVEAL_SELECTOR)];
  const targets=all.filter(node=>!all.some(parent=>parent!==node&&parent.contains(node)));
  for(const target of targets){
    /* Active navigation gives instant feedback; cold start still uses the short-request no-skeleton-flash threshold. */
    if(target.closest('[data-page-navigation-pending]')){
      target.dataset.skeletonReveal='shown';
      target.classList.remove('skeleton-awaiting');
      continue;
    }
    /* For ones already armed, just skip this one. Writing `return` would leave every placeholder after it in the same batch
       without the delay marker, and the backfilled half screen of skeleton would flash straight in. */
    if(target.dataset.skeletonReveal)continue;
    target.dataset.skeletonReveal='pending';
    target.classList.add('skeleton-awaiting');
    setTimeout(()=>{
      if(!target.isConnected||target.dataset.skeletonReveal!=='pending')return;
      target.dataset.skeletonReveal='shown';
      target.classList.remove('skeleton-awaiting');
    },SKELETON_REVEAL_DELAY);
  }
}

const SKELETON_TIER_LIMIT=64;
/* Horizontal skeletons lay out only up to the overflow container's right edge. Every width measurement is a full page layout; appending and measuring one by one
   would lay out one row a dozen-plus times, and cold start measured over a hundred milliseconds per row. So go by rounds: lay out one round of width sequence,
   measure once, fill the missing stretch in one go using the measured average width, then measure once to confirm. Several rows share one round; measure-all then write-all,
   so only these few layouts happen in total. The cap is only a runaway-loop guard. */
function fillSkeletonTiers(jobs:any[]){
  /* The same row gets one more pass (the roster arrived, the container got wider): rows already past the right edge get no more appends. Empty rows skip measuring. */
  jobs=jobs.filter(job=>job.row&&SKELETON_SLOT[job.kind]&&(!job.row.children.length||job.row.scrollWidth<=job.row.clientWidth))
    .map(job=>({...job,start:job.row.children.length,added:0}));
  const add=(job:any,count:number)=>{
    const slot=SKELETON_SLOT[job.kind]!,widths=SKELETON_SLOT_WIDTHS[job.kind]!;
    let html='';
    for(const end=Math.min(SKELETON_TIER_LIMIT,job.added+count);job.added<end;job.added++)html+=slot(widths[job.added%widths.length]!);
    job.row.insertAdjacentHTML('beforeend',html);
  };
  for(const job of jobs)add(job,SKELETON_SLOT_WIDTHS[job.kind]!.length);
  for(let round=0;round<4;round++){
    const short=jobs.filter(job=>job.added<SKELETON_TIER_LIMIT&&job.row.scrollWidth<=job.row.clientWidth).map(job=>{
      const first=job.row.children[job.start].getBoundingClientRect(),last=job.row.lastElementChild.getBoundingClientRect();
      const each=Math.max(1,(last.right-first.left)/job.added);
      return [job,Math.ceil((job.row.getBoundingClientRect().right-last.right)/each)+1];
    });
    if(!short.length)break;
    for(const [job,count] of short)add(job,Math.max(1,count));
  }
  for(const job of jobs)armSkeletonReveal(job.row);
}
export function fillSkeletonTier(row:Element|null,kind:string):void{fillSkeletonTiers([{row,kind}])}

/** After the skeleton lands in the DOM it fills out to actual size: one full horizontal row, and the card grid extends to whole rows while covering the viewport remainder. */
export function fitSkeleton(root:any):void{
  if(!root)return;
  const scoped=(selector:string):HTMLElement[]=>[...(root.matches?.(selector)?[root]:[]),...root.querySelectorAll(selector)];
  fillSkeletonTiers(scoped('[data-skeleton-tier]').map(row=>({row,kind:row.dataset.skeletonTier})));
  for(const grid of scoped('.skeletonpanel[data-fill]>div,.index-skeleton[data-fill]>section>div')){
    const first=grid.firstElementChild,style=getComputedStyle(grid);
    /* The horizontal recommendation row is not a grid, so column count is meaningless; padding by whole rows would collapse it into a single one. */
    if(!first||style.display!=='grid')continue;
    const columns=style.gridTemplateColumns.split(' ').filter(Boolean).length;
    const rowGap=parseFloat(style.rowGap)||0,cardHeight=first.getBoundingClientRect().height;
    if(!columns||!cardHeight)continue;
    /* The skeleton's message is "this area will be filled shortly", so it lays down to the viewport's bottom edge; four rows are the guardrail,
       beyond that are invisible off-screen placeholders wasting animation. */
    const room=window.innerHeight-grid.getBoundingClientRect().top;
    const rows=Math.max(1,Math.min(4,Math.ceil((room+rowGap)/(cardHeight+rowGap))));
    const want=columns*rows;
    while(grid.children.length>want)grid.lastElementChild!.remove();
    while(grid.children.length<want)grid.appendChild(first.cloneNode(true));
  }
  armSkeletonReveal(root);
}
