/* The scrolling group: horizontal rows' wheel direction, drag and rubber-banding, horizontal auto-scroll, the selection backing's glide, Geist Scroller,
   and the overlay scrollbars that take over scroll areas. Referenced from shared source directly and shipped with `peach-app.js`;
   bound rows, auto-scrolling rows, and spring values are module-level state with one copy. */
import { esc } from '../core';

import { attachOverlayScrollbar, detachOverlayScrollbar, pruneOverlayScrollbars, refreshOverlayScrollbars, releaseOverlayScrollbars } from './overlay-scrollbar';

const horizontalControls=new Map<Element,any>();
let horizontalCleanup:MutationObserver|null|undefined;
/* How long between wheel events still counts as the same gesture. A trackpad's inertia tail arrives notch by notch with tens of milliseconds between;
   when a person stops and scrolls again, the gap is much longer. */
const WHEEL_GESTURE_GAP=240;
/* A wheel notch must be at least this big to move smoothly. A mouse wheel notch is a whole segment (from 100px on Windows); setting `scrollLeft` directly
   jumps notch by notch, while the page's own scrolling animates every notch; a touchpad gives a few pixels tens of times a second, already
   continuous, and wrapping it in animation only slows the follow-through. */
const WHEEL_SMOOTH_STEP=50;
/* The smooth stretch is walked frame by frame by the row itself, not with `scrollTo({behavior:'smooth'})`: that animation restarts from zero speed for every cell
   it picks up, so continuous wheel turns stutter cell by cell, measured at two or three full stops between every two cells. Here each frame
   moves a fraction of the remaining distance toward the target (time constant 70ms); a new cell only moves the target forward, so speed carries through without interruption. */
const WHEEL_GLIDE_MS=70;
/* Pushing a horizontally scrolled row past its end lets the content travel a little further and bounce back.
   transitions.dev has no recipe for this, so the over-travel borrows UIScrollView's rubber-band formula
   `(1 - 1/(x*c/d + 1))*d` (c = 0.55; use-gesture's `rubberband` is the same one): the farther you push the harder it pushes
   back, and no pushing ever reaches the container's full width. The bounce rides the site's sampled spring `--spring-pane`,
   overshooting its origin and settling back, the same feel as the filter bar's panel. */
const RUBBER_BAND=.55;
/* The wheel has no "hand still holding" phase, so a push past the end springs back once at this cell's strength: one wheel notch counts as dragging it
   a third and a half by hand, computed against the up-to-480px rubber band. On wide screens a whole row is over a thousand pixels; computed against the whole row,
   one notch's push would look like the whole row slipping loose. */
const WHEEL_PULL=.35;
const WHEEL_PULL_SPAN=480;
export function rubberBand(distance:number,dimension:number):number{
  if(!distance||!(dimension>0))return 0;
  return Math.sign(distance)*(1-1/(Math.abs(distance)*RUBBER_BAND/dimension+1))*dimension;
}
/* The offset rides on this row's child elements (`.edgepull>*`, reading `--edge-pull`), not on the container itself: if the
   container moves, the fading mask hugging it and the outer layer's boundary move along, and rightward motion would also stretch the page into a horizontal scrollbar.
   The animation only attaches its class for the overshoot moment; normally the child elements carry nothing extra. */
function edgeBounce(el:HTMLElement){
  let spring:Animation|null=null,pulled=0;
  const idle=()=>typeof el.animate!=='function'||matchMedia('(prefers-reduced-motion:reduce)').matches;
  const settle=()=>{spring=null;if(!pulled)el.classList.remove('edgepull')};
  const play=(frames:Keyframe[],duration:number)=>{
    spring?.cancel();el.classList.add('edgepull');
    spring=el.animate(frames,{duration});
    spring.onfinish=settle;
  };
  return {
    /* Dragging tracks the finger: overshoot is compressed rubber-band style by the same amount, and on `release` it springs back. */
    drag(excess:number){
      if(idle())return;
      spring?.cancel();spring=null;
      pulled=-rubberBand(excess,el.clientWidth);
      el.classList.toggle('edgepull',!!pulled);
      if(pulled)el.style.setProperty('--edge-pull',`${pulled}px`);else el.style.removeProperty('--edge-pull');
    },
    release(){
      if(!pulled)return;
      const from=pulled,ease=glideEase();pulled=0;el.style.removeProperty('--edge-pull');
      play([{'--edge-pull':`${from}px`,easing:ease.easing},{'--edge-pull':'0px'}],ease.duration);
    },
    /* Scroll wheel at the edge: the overshoot decelerates, the swing back follows a spring. One gesture bounces once; the caller decides. */
    kick(delta:number){
      if(idle()||pulled)return;
      const peak=-rubberBand(delta*WHEEL_PULL,Math.min(el.clientWidth,WHEEL_PULL_SPAN));
      if(!peak)return;
      const ease=glideEase();
      play([{'--edge-pull':'0px',easing:'cubic-bezier(.2,.8,.4,1)'},
        {'--edge-pull':`${peak}px`,offset:.3,easing:ease.easing},{'--edge-pull':'0px'}],ease.duration*1.6);
    },
  };
}
/** Bound once per container. With the pointer over the row the wheel scrolls only the row, bouncing at the end instead of carrying the page along. */
/** A horizontally scrolling layer that can overflow: the ends fade by scroll position, the vertical wheel maps to horizontal, and it is draggable when `drag` is true. */
export function wireHorizontalScroller(el:any,{drag=false,fade=true,wheel=true,elastic=true,dragIgnore=''}={}):any{
  if(!el)return;
  if(fade)el.dataset.scrollGesture='';
  const existing=horizontalControls.get(el);
  if(existing){existing.options.drag ||= drag;existing.options.fade ||= fade;existing.update();return existing}
  const options={drag,fade,wheel,elastic,dragIgnore},abort=new AbortController(),bounce=edgeBounce(el);
  let start:{x:number;left:number}|null=null,moved=0,heldUntil=0,target=0,kicked=false,glide=0,glideAt=0,pos=0,pending=0;
  /* Do not write when the value is unchanged: auto scrolling fires `scroll` every frame, and rewriting the same value still forces a style recalculation. */
  const mark=(key:string,value:string)=>{if(el.dataset[key]!==value)el.dataset[key]=value};
  /* `overflow-x` is only re-read inside the size observer callback: styles and layout were just computed, so reading does not trigger recompute.
     Reading it fresh inside scrolling and wheel handlers would recompute the whole style tree dirtied by the last `data-overflow-*` write. */
  let overflowX='';
  const scrollable=()=>{if(!overflowX)overflowX=getComputedStyle(el).overflowX;return ['auto','scroll','hidden'].includes(overflowX)};
  const update=()=>{if(options.fade){const active=scrollable();mark('overflowLeft',String(active&&el.scrollLeft>1));mark('overflowRight',String(active&&el.scrollLeft+el.clientWidth<el.scrollWidth-1))}};
  /* Scroll events can arrive several times per frame, so the fade marker is coalesced and written once on the next frame. */
  let marking=0;
  const scheduleUpdate=()=>{if(!marking)marking=requestAnimationFrame(()=>{marking=0;update()})};
  const listen=(target:EventTarget,event:string,handler:(event:any)=>void,extra={})=>target.addEventListener(event,handler,{...extra,signal:abort.signal});
  listen(el,'scroll',scheduleUpdate,{passive:true});
  const kick=(delta:number)=>{if(options.elastic&&!kicked){kicked=true;bounce.kick(delta)}};
  const stopGlide=()=>{cancelAnimationFrame(glide);glide=0;pending=0};
  /* Keep a fractional copy of the position: when a frame moves less than a pixel, `scrollLeft` reads back rounded.
     The overshoot snap waits until the end is reached; snapping halfway looks like it bounced before arriving. */
  const frame=(now:number)=>{
    const dt=Math.min(Math.max(now-glideAt,0),64);glideAt=now;
    pos+=(target-pos)*(1-Math.exp(-dt/WHEEL_GLIDE_MS));
    if(Math.abs(target-pos)<.5)pos=target;
    el.scrollLeft=pos;
    if(pos!==target){glide=requestAnimationFrame(frame);return}
    glide=0;
    if(pending){const delta=pending;pending=0;kick(delta)}
  };
  /* Gestures the page started first cannot be intercepted: Chrome counts a run of wheel events as one gesture, and if the first
     one is not intercepted, none of the rest can be. When the page scrolls this row under the pointer, those events are left
     to the page as they are.
     A gesture started on this row belongs to it entirely: unfinished, or finished at the end, the remainder is never handed to
     the page; to scroll the whole page, move the pointer off the row. Pushing past the end bounces once, one bounce per
     gesture: a trackpad's inertia tail hits the edge step by step, and bouncing each step would be a string of jitters. */
  listen(el,'wheel',event=>{
    if(!options.wheel)return;
    const max=el.scrollWidth-el.clientWidth;
    if(event.defaultPrevented||!event.cancelable||Math.abs(event.deltaY)<=Math.abs(event.deltaX)||max<=0||!scrollable())return;
    event.preventDefault();
    const now=performance.now(),step=Math.abs(event.deltaY);
    if(now>heldUntil)kicked=false;
    heldUntil=now+WHEEL_GESTURE_GAP;
    // While the smoothing segment is still midway, the next cell computes from the previous one's endpoint.
    const from=glide?target:el.scrollLeft,want=from+event.deltaY;
    target=Math.min(max,Math.max(0,want));
    const over=want===target?0:event.deltaY;
    if(step<WHEEL_SMOOTH_STEP||target===from){
      if(target!==from){stopGlide();el.scrollLeft=target}
      if(over&&!glide)kick(over);else if(over)pending=over;
      return;
    }
    if(over)pending=over;
    if(!glide){pos=el.scrollLeft;glideAt=performance.now();glide=requestAnimationFrame(frame)}
  },{passive:false});
  listen(el,'mousedown',event=>{
    moved=0;
    if(!options.drag||event.button!==0||el.scrollWidth-el.clientWidth<=1)return;
    if(options.dragIgnore&&(event.shiftKey||event.ctrlKey||event.metaKey||event.altKey||event.target.closest?.(options.dragIgnore)))return;
    event.stopPropagation();stopGlide();start={x:event.pageX,left:el.scrollLeft};moved=0;document.documentElement.dataset.dragScrolling='';
  });
  listen(window,'mousemove',event=>{
    if(!start)return;
    const dx=event.pageX-start.x,want=start.left-dx,max=el.scrollWidth-el.clientWidth;
    moved=Math.max(moved,Math.abs(dx));el.scrollLeft=want;
    if(options.elastic)bounce.drag(want<0?want:want>max?want-max:0);
    event.preventDefault();
  });
  const endDrag=()=>{if(start&&options.elastic)bounce.release();if(start)delete document.documentElement.dataset.dragScrolling;start=null};
  listen(window,'mouseup',endDrag);
  listen(window,'blur',endDrag);
  listen(el,'keydown',()=>{moved=0});
  listen(el,'click',event=>{if(moved>6){event.stopPropagation();event.preventDefault();moved=0}},{capture:true});
  /* The size observer's first callback comes after this frame's layout, and the initial fade marker is written by it too: at mount the page has usually
     just inserted a batch of nodes, and measuring on the spot would recompute the whole style tree ahead of time. On content add/remove the observer remounts, and newly
     attached children callback once more; the remove-only kind is backfilled on the next frame. */
  const resize=new ResizeObserver(()=>{overflowX='';update()});
  const observe=()=>{resize.observe(el);for(const child of el.children)resize.observe(child)};
  const contents=new MutationObserver(()=>{resize.disconnect();observe();scheduleUpdate()});
  contents.observe(el,{childList:true,characterData:true,subtree:true});observe();
  // Manually triggered recomputes from outside (layout change, content change) reread `overflow-x` along with everything else.
  const control={options,update(){overflowX='';update()},destroy(){abort.abort();stopGlide();cancelAnimationFrame(marking);marking=0;resize.disconnect();contents.disconnect();horizontalControls.delete(el);delete el.dataset.scrollGesture;if(start)delete document.documentElement.dataset.dragScrolling;if(!horizontalControls.size){horizontalCleanup?.disconnect();horizontalCleanup=null}}};
  horizontalControls.set(el,control);
  if(!horizontalCleanup){horizontalCleanup=new MutationObserver(()=>{for(const [node,item] of horizontalControls)if(!node.isConnected)item.destroy()});horizontalCleanup.observe(document.body,{childList:true,subtree:true})}
  return control;
}

/** The table uses horizontal dragging; the wheel keeps browser behavior; controls, column-width handles, and the whole header row handle the pointer independently (even a mis-pressed header doesn't start a drag). */
export function wireTableScroller(el:HTMLElement|null):any{
  return wireHorizontalScroller(el,{drag:true,fade:false,wheel:false,elastic:false,
    dragIgnore:'a,button,input,select,textarea,label,[role="button"],[role="checkbox"],[role="slider"],.react-aria-ColumnResizer,thead'});
}

/* The row of horizontal cards drifts forward on its own, pauses at the end, and walks back. 24px per second is slow enough to read and visibly moving:
   a 168px card crosses in seven seconds. It pauses two seconds at each end, so the last and first cards both get a clear look. */
const AUTO_SCROLL_SPEED=24;
const AUTO_SCROLL_DWELL=2000;
/* How long after a manual interaction to resume moving: having just scrolled to the wanted card, the row immediately moving off again would fight the user for it. */
const AUTO_SCROLL_RESUME=3000;
const autoScrollers=new Map<Element,()=>void>();
const autoScrollWakeups=new Set<()=>void>();
let autoScrollVisibility:MutationObserver|null=null;
let autoScrollSight:IntersectionObserver|null=null;
const autoScrollSightings=new Map<Element,(visible:boolean)=>void>();
/**
 * Auto-scroll for a horizontal row. It stops when the pointer rests on it, focus is inside it, the row is off screen, or the page goes to the background;
 *  after the user scrolls or drags it, it resumes from where they left it. It does not move when the system asks for reduced motion.
 */
export function wireAutoScroll(el:any):void{
  if(!el||autoScrollers.has(el))return;
  if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  const abort=new AbortController();
  let pos=el.scrollLeft,dir=1,last=0,frame=0,hovered=false,focused=false,onscreen=true,holdUntil=0,max=-1,resync=false;
  const listen=(target:EventTarget,type:string,fn:()=>void)=>target.addEventListener(type,fn,{passive:true,signal:abort.signal});
  /* On-screen visibility is left to the shared intersection observer, which wakes the callback; the loop only reads state it recorded itself. Measuring
     `getBoundingClientRect()` every frame forces a full style tree recompute right after the previous frame wrote `scrollLeft`.
     The intersection observer does not look at `visibility`: when the playback wall covers the page, this row is still geometrically on screen; stop by page flag. */
  const covered=()=>(document.body.hasAttribute('data-detail-open')&&!el.closest('#stage'))
    ||(document.body.hasAttribute('data-wall-open')&&!el.closest('[data-video-wall]'));
  const running=()=>el.isConnected&&onscreen&&!hovered&&!focused&&!document.hidden&&!covered();
  const tick=(now:number)=>{
    frame=0;
    if(!el.isConnected){stop();return}
    if(!running())return;
    frame=requestAnimationFrame(tick);
    const dt=last?Math.min(now-last,64):0;last=now;
    if(now<holdUntil)return;
    /* The loop only writes, never reads: scrollable distance is remeasured when sizes change, and position is read back once after the user has moved it. Reading
       `scrollWidth` every frame, right after anything else touched styles (theme switch, hover, page scroll), forces a whole-tree recompute. */
    if(max<0)max=el.scrollWidth-el.clientWidth;
    if(resync){resync=false;pos=el.scrollLeft}
    if(max<=1)return;
    /* The position keeps its own fractional copy: a frame moves only a fraction of a pixel, and `scrollLeft` reads back as a rounded value,
       so adding onto it would never move at all. */
    pos=Math.min(max,Math.max(0,pos+dir*AUTO_SCROLL_SPEED*dt/1000));
    el.scrollLeft=pos;
    if(pos>=max||pos<=0){dir=pos>=max?-1:1;holdUntil=now+AUTO_SCROLL_DWELL}
  };
  // When a redraw replaces this row, the listeners attached to document must be removed at the next wake-up too.
  const wake=()=>{if(!el.isConnected)stop();else if(!frame&&running()){last=0;frame=requestAnimationFrame(tick)}};
  const hold=()=>{holdUntil=performance.now()+AUTO_SCROLL_RESUME};
  /* When a person can scroll this row, the pointer is over it or focus is inside it (wheel, drag, touch, arrow keys), and by then the loop has already stopped;
     on leave, record the position to resume from, and the next frame continue from where the person left it. */
  listen(el,'pointerenter',()=>{hovered=true});
  listen(el,'pointerleave',()=>{hovered=false;resync=true;hold();wake()});
  listen(el,'focusin',()=>{focused=true});
  listen(el,'focusout',()=>setTimeout(()=>{focused=el.contains(document.activeElement);resync=true;wake()},0));
  const sizes=new ResizeObserver(()=>{max=-1});
  sizes.observe(el);
  const contents=new MutationObserver(()=>{max=-1});
  contents.observe(el,{childList:true});
  listen(document,'visibilitychange',wake);
  wake();
  function stop(){cancelAnimationFrame(frame);frame=0;abort.abort();sizes.disconnect();contents.disconnect();autoScrollers.delete(el);autoScrollWakeups.delete(wake);
    autoScrollSight?.unobserve(el);autoScrollSightings.delete(el);
    if(!autoScrollers.size){autoScrollVisibility?.disconnect();autoScrollVisibility=null;autoScrollSight?.disconnect();autoScrollSight=null}}
  autoScrollers.set(el,stop);
  autoScrollWakeups.add(wake);
  if(!autoScrollVisibility){autoScrollVisibility=new MutationObserver(()=>autoScrollWakeups.forEach(resume=>resume()));
    autoScrollVisibility.observe(document.body,{attributes:true,attributeFilter:['data-detail-open','data-wall-open']})}
  if(typeof IntersectionObserver==='function'){
    autoScrollSight??=new IntersectionObserver(entries=>{for(const entry of entries)autoScrollSightings.get(entry.target)?.(entry.isIntersecting)});
    autoScrollSightings.set(el,visible=>{onscreen=visible;wake()});
    autoScrollSight.observe(el);
  }
}
export function stopAutoScroll(el:Element):void{autoScrollers.get(el)?.()}

/* The panel marking "which one is current" in a row has one motion site-wide: slide over, overshoot the landing, settle back.
   The glass on the filter bar, the drawer's column and the segmented control's white block are one thing to the eye, and
   writing each separately would drift into three feels.
   The spring curve and its duration are written on `board.css`'s `--spring-pane` and read here once: those numbers are one
   spring simulation's samples, and a second copy would be one nobody can change anymore. */
let paneSpring:{easing:string;duration:number}|null=null;
export function glideEase():{easing:string;duration:number}{
  if(!paneSpring){
    const css=getComputedStyle(document.documentElement);
    paneSpring={easing:css.getPropertyValue('--spring-pane').trim()||'ease',
      duration:parseFloat(css.getPropertyValue('--spring-pane-ms'))||300};
  }
  return paneSpring;
}
/* Translation rides `translate`, deformation rides `scale`, two independent properties each carrying one animation instead of
   crowding one `transform`: one property holds only one segment, and these two motions are not the same curve. The
   translation overshoots its landing and settles back; the stretch peaks mid-flight and returns to rest at both ends. Written
   separately, both segments still run on the compositor.
   Neither touches `width`: width is a layout property, and changing it per frame means relaying out the whole document,
   unreachable from the compositor, so the main thread's busyness would stall this whole board.
   `from` as null means place without animating: the first appearance should not fly in from somewhere else. */
export function moveGlidePane(
  pane:HTMLElement,
  from:{x:number;y:number;w:number;h:number}|null,
  box:{x:number;y:number;w:number;h:number},
  axis:'x'|'y'='x',
):void{
  /* Resetting in place must also cancel the running translation and transform; the animation must not keep painting over the new position. */
  cancelGlide(pane);
  pane.style.width=`${box.w}px`;pane.style.height=`${box.h}px`;
  const span=axis==='y'?'h':'w',head=axis==='y'?'y':'x';
  const settled=`${box.x}px ${box.y}px`;
  if(from&&from[head]!==box[head]&&!matchMedia('(prefers-reduced-motion:reduce)').matches){
    const ease=glideEase();
    const moving=[pane.animate([{translate:axis==='y'?`${box.x}px ${from.y}px`:`${from.x}px ${box.y}px`},
      {translate:settled}],{duration:ease.duration,easing:ease.easing,fill:'none'})];
    glides.set(pane,moving);
    /* A soft thing being dragged stretches along the direction of travel and gathers back when it stops. How much it stretches
       is computed by how many body-lengths this jump crossed, capped at half a body-length: farther should not be longer, or
       it would read not as the same block stretched but as a different block swapped in. The peak sits in the first thirty
       percent: acceleration is what can pull it.
       Deformation only along the row's layout direction: the other axis's size is given by the row, and stretching there
       would make it look like it does not belong in this row. */
    const reach=Math.min(Math.abs(box[head]-from[head])/box[span],1.5),grow=1+reach*.12;
    moving.push(pane.animate([{scale:'1 1',offset:0},
      {scale:axis==='y'?`1 ${grow}`:`${grow} 1`,offset:.3},{scale:'1 1',offset:1}],
      {duration:ease.duration,easing:'ease-in-out',fill:'none'}));
  }
  pane.style.translate=settled;
}
/* Only the two segments above run on the base layer, and each cleans up after itself: `getAnimations()` cannot answer until the full stylesheet is computed up to date,
   and the sidebar open/close moment leaves every page style dirty, so one read is one whole-tree recompute. */
const glides=new WeakMap<HTMLElement,Animation[]>();
export function cancelGlide(pane:HTMLElement|null|undefined):void{
  if(!pane)return;
  glides.get(pane)?.forEach(a=>a.cancel());
  glides.delete(pane);
}

/** Geist Scroller: one-axis overflow with edge fades as the scroll affordance. */
export function scrollerHtml(content:string,{className='',label='Scrollable content',overflow='y'}={}){
  const axis=new Set(['x','y','both']).has(overflow)?overflow:'y';
  return `<div class="ui-geist-scroller${className?` ${esc(className)}`:''}" data-geist-scroller>
    <div class="ui-geist-scroller-overlay" aria-hidden="true"></div>
    <div class="ui-geist-scroller-container" data-overflow="${axis}" tabindex="0" aria-label="${esc(label)}">${content}</div>
  </div>`;
}

function updateScroller(wrapper:Element){
  const container=wrapper.querySelector(':scope > .ui-geist-scroller-container');
  const overlay=wrapper.querySelector(':scope > .ui-geist-scroller-overlay');
  if(!container||!overlay)return;
  overlay.classList.toggle('ui-can-scroll-top',container.scrollTop>1);
  overlay.classList.toggle('ui-can-scroll-bottom',container.scrollTop+container.clientHeight<container.scrollHeight-1);
  overlay.classList.toggle('can-scroll-left',container.scrollLeft>1);
  overlay.classList.toggle('can-scroll-right',container.scrollLeft+container.clientWidth<container.scrollWidth-1);
}

/** Wire newly rendered scrollers without duplicating listeners after a rerender. */
export function wireScrollers(root:ParentNode=document):void{
  root.querySelectorAll('[data-geist-scroller]').forEach(wrapper=>{
    const container=wrapper.querySelector<HTMLElement>(':scope > .ui-geist-scroller-container');
    if(!container)return;
    if(!container.dataset.scrollerWired){
      container.dataset.scrollerWired='true';
      container.addEventListener('scroll',()=>updateScroller(wrapper),{passive:true});
      container.addEventListener('load',()=>updateScroller(wrapper),true);
    }
    requestAnimationFrame(()=>updateScroller(wrapper));
  });
}

/* Horizontally scrolling layers inside the Board layer that can overflow: both ends fade per scroll position to say "there is
   more that way", and a vertical wheel converts to horizontal while the pointer rests on them. Borders are left to the outer
   frame; the fade lands only on this layer.
   What is registered here are layers drawn by `frontend/` or board.css, which do not go through `wireAllDrag`'s by-id
   list; missing registration is "visible but untouchable": a row of sections overflowing two hundred pixels at 390px with
   neither fade nor wheel handling. Components measure their own overflow, so registering a layer that does not overflow is
   dead weight; register by layers that may overflow, not by any one breakpoint. React pages use `overflow-x-auto` themselves
   and stay out of this list. */
const BOARD_EDGE_SCROLLERS='.reviewtabs,.ftablewrap,.ui-board-local-nav,[data-manage-menu],'
  +'.follow-workspace-switch,.fmanagenav';

/** Takes over the scroll container based on actual overflow; horizontal gesture navigation keeps the existing fade feedback. */
export function wireOverlayScrollbars(root:ParentNode=document,subtree=true):void{
  const nodes=[...(root instanceof HTMLElement?[root]:[]),...(subtree?root.querySelectorAll<HTMLElement>('*'):[])];
  nodes.filter(el=>el instanceof HTMLElement&&el.matches(BOARD_EDGE_SCROLLERS)).forEach(el=>wireHorizontalScroller(el));
  const gesture=(el:HTMLElement)=>el.hasAttribute('data-horizontal-scroll')
    ||(horizontalControls.has(el)&&horizontalControls.get(el).options.fade!==false);
  // Style reads and track mounting are two passes, so inserting a track does not recompute styles for every node after it.
  const candidates=nodes.flatMap<{el:HTMLElement;axes:readonly ('x'|'y')[]}>(el=>{
    if(!(el instanceof HTMLElement)||el===document.body||el===document.documentElement
      ||el.closest('.ovtrack,.ui-ov-edges'))return [];
    if(el.closest('[data-skeleton],[data-skeleton-tier]')){detachOverlayScrollbar(el);return []}
    if(el.closest('[inert]'))return [];
    const horizontalGesture=gesture(el),axes=horizontalGesture?['y'] as const:['y','x'] as const;
    if(el.dataset.overlayScrollbar&&el.dataset.overlayAxes===axes.join(''))return [];
    const style=getComputedStyle(el);
    const vertical=/^(auto|scroll)$/.test(style.overflowY);
    if(vertical||(!horizontalGesture&&/^(auto|scroll)$/.test(style.overflowX)))return [{el,axes}];
    return horizontalGesture&&el.dataset.overlayScrollbar?[{el,axes:[] as const}]:[];
  });
  candidates.forEach(({el,axes})=>axes.length?attachOverlayScrollbar(el,{axes}):detachOverlayScrollbar(el));
}

/** Incrementally takes over scroll areas by new subtrees and style changes; refreshes the whole tree when responsive layout changes. */
export function observeScrollRegions(root:HTMLElement=document.body):()=>void{
  let frame=0;
  const pending=new Map<HTMLElement,boolean>();
  const decorative=(node:Element)=>!!node.closest('.ovtrack,.ui-ov-edges');
  const flush=()=>{
    frame=0;
    const trees=[...pending].filter(([node])=>node.isConnected);
    pending.clear();
    for(const [node,subtree] of trees)if(!trees.some(([parent,deep])=>deep&&parent!==node&&parent.contains(node)))wireOverlayScrollbars(node,subtree);
    pruneOverlayScrollbars();
  };
  const queue=(node:HTMLElement,subtree=true)=>{
    if(decorative(node))return;
    pending.set(node,(pending.get(node)??false)||subtree);
    if(!frame)frame=requestAnimationFrame(flush);
  };
  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='attributes'){
        if(record.target instanceof HTMLElement){
          if(record.attributeName==='data-theater')refreshOverlayScrollbars(record.target);
          queue(record.target,record.attributeName!=='style');
        }
      }else{
        for(const node of record.addedNodes)if(node instanceof HTMLElement)queue(node);
        if(record.removedNodes.length&&!frame)frame=requestAnimationFrame(flush);
      }
    }
  });
  observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','open','inert','data-skeleton','data-skeleton-tier','data-horizontal-scroll','data-theater']});
  const resize=()=>queue(root);
  window.addEventListener('resize',resize,{passive:true});
  queue(root);
  return ()=>{observer.disconnect();window.removeEventListener('resize',resize);cancelAnimationFrame(frame);pending.clear();releaseOverlayScrollbars(root);pruneOverlayScrollbars()};
}
