interface Lane { axis: 'x' | 'y'; track: HTMLDivElement; thumb: HTMLDivElement; range: number; travel: number }
export interface OverlayScrollbar { (): void; destroy(): void; repair(): void }
const controls = new Map<HTMLElement, OverlayScrollbar>();

export function detachOverlayScrollbar(container:HTMLElement):void{controls.get(container)?.destroy()}

/** A scroll area moved out of the document releases its listeners, resize observer, and track. */
export function pruneOverlayScrollbars(): void {
  for (const [container, control] of controls) {
    if (!container.isConnected) control.destroy();
    else control.repair();
  }
}

export function releaseOverlayScrollbars(root:HTMLElement):void{
  for(const [container,control] of controls)if(container===root||root.contains(container))control.destroy();
}

/** When the layout mode changes, a display:contents subtree can change its content length without triggering the container's size observation. */
export function refreshOverlayScrollbars(root:HTMLElement):void{
  for(const [container,control] of controls)if(container===root||root.contains(container))control();
}

/**
 * Overlay scrollbar: the thumb floats over the content and costs no column width.
 *
 * The existing `.geist-scroller` solves the other half: it fades at both ends to say "there is more below", but has no thumb,
 * cannot convey how long the column is or where you stopped, and requires content wrapped in its own wrapper. This only hangs
 * a track on the parent of an existing scrolling container, leaving content structure alone, so the two can stack.
 *
 * For normal content areas the track is a sibling of the container. For overlays the track stays inside the overlay and
 * compensates for the content's scroll offset, keeping the same tier and visible edge. The host therefore must be a positioned
 * ancestor and is not necessarily the same size as the container (the settings panel's card also contains its title bar), so
 * the track's position is measured from the two rects every time, never assuming they share a frame. One track per axis, shown
 * for whichever axis overflows: the same container can switch axes across layouts (the queue list `[data-mix-list]` scrolls
 * horizontally inside the details cell that has a queue). The page-level one is the sole exception: `html` has no element
 * parent, so the track hangs in body and `.page` makes it fixed, positioned only against the viewport, never measured.
 * Geometry measured on vercel.com's sidebar on 2026-09-05:
 * thumb length = visible length / content length × track length; offset = scroll progress × (track length − thumb length).
 * Returns a manual recompute function for cases that change neither container size nor subtree (a reflow after a font swap,
 * for example).
 */
export function attachOverlayScrollbar(
  container: HTMLElement | null, { variant = '', axes: requestedAxes }: { variant?: string; axes?: readonly Lane['axis'][] } = {},
): OverlayScrollbar | null {
  if(!container)return null;
  if(container.dataset.overlayScrollbar){
    if(!requestedAxes||container.dataset.overlayAxes===requestedAxes.join(''))return null;
    detachOverlayScrollbar(container);
  }
  const root=container===document.documentElement;
  const axes=root?['y'] as const:requestedAxes??['y','x'] as const;
  const style=getComputedStyle(container);
  const internal=!root&&(style.position==='absolute'||style.position==='fixed'||container.matches('dialog,[popover]'));
  const host=root?document.body:internal?container:container.parentElement;
  if(!host)return null;
  container.dataset.overlayScrollbar='true';
  container.dataset.overlayAxes=axes.join('');
  const originalPosition=host.style.position;
  const events=new AbortController();
  let changedPosition=false;
  // Local vertical scrolling shows edge hints uniformly; the full page uses a sticky navigation hierarchy.
  const edges=root?null:document.createElement('div');
  if(edges){
    edges.className='ui-ov-edges';
    edges.hidden=true;
    edges.setAttribute('aria-hidden','true');
    edges.innerHTML='<span class="ui-ov-edge-top"></span><span class="ui-ov-edge-bottom"></span>';
    host.append(edges);
  }
  const lanes=axes.map((axis):Lane=>{
    const track=document.createElement('div');
    // Write both class names out in full, do not assemble `ov-${axis}`: stylesheet selectors need consumers findable in source.
    track.className=`ovtrack ${axis==='y'?'ov-y':'ov-x'}${variant?` ${variant}`:''}`;
    track.dataset.overlayTrack=axis;
    track.hidden=true;
    const thumb=document.createElement('div');
    thumb.className='ovthumb';
    thumb.dataset.overlayThumb='';
    track.append(thumb);
    host.append(track);
    return {axis,track,thumb,range:0,travel:0};
  });
  /* The container's offset within its host can only be measured from layout boxes. `getBoundingClientRect()` gives transformed
     geometry, and the result is about to be subtracted from layout values like `clientWidth`: during the 300ms the popover's
     open animation holds the card at `scale(.85)`, the two are in different coordinate systems, and the computed track
     position would land inside the container. Measured: the settings popover's first frame showed a 41px right margin
     (should be 0) that stayed until a scroll triggered recomputation and snapped it back to the right edge, looking like
     "the scrollbar ran from left to right". `offsetLeft`/`offsetTop` are unaffected by transforms and accumulate along the
     offsetParent chain up to the host; only when the host is unreachable (not a positioned ancestor) does it fall back to
     measuring rects. */
  const offsetWithin=()=>{
    let left=0,top=0,node:Element|null=container;
    while(node&&node!==host){
      const box=node as HTMLElement;left+=box.offsetLeft;top+=box.offsetTop;node=box.offsetParent}
    if(node===host)return {left,top};
    const hostRect=host.getBoundingClientRect(),rect=container.getBoundingClientRect();
    return {left:rect.left-hostRect.left-host.clientLeft,
      top:rect.top-hostRect.top-host.clientTop};
  };
  /* One recompute splits in two: first measure all the geometry to be used, then write track, thumbs, and edge hints uniformly. Measuring and writing interleaved means
     every write makes the next layout read reflow the whole document; the details page opens with several scroll areas mounted at once, measured to take the majority of the forced recompute when entering and leaving details. */
  interface Geometry { left:number; top:number; hostWidth:number; hostHeight:number;
    width:number; height:number; contentWidth:number; contentHeight:number; scrollTop:number; scrollLeft:number }
  // The track is positioned against the host's padding box, and a static host would fling it out to some outer ancestor. Compensate on the first measurement.
  let positioned=root;
  let destroyed=false;
  const measure=():Geometry=>{
    if(!positioned){positioned=true;if(getComputedStyle(host).position==='static'){host.style.position='relative';changedPosition=true}}
    const {left,top}=root||internal?{left:0,top:0}:offsetWithin();
    return {left,top,hostWidth:root?0:host.clientWidth,hostHeight:root?0:host.clientHeight,
      width:container.clientWidth,height:container.clientHeight,
      contentWidth:container.scrollWidth,contentHeight:container.scrollHeight,
      scrollTop:container.scrollTop,scrollLeft:container.scrollLeft};
  };
  const place=({axis,track}:Lane,g:Geometry)=>{
    if(root)return;
    if(axis==='y'){
      track.style.top=`${g.top+8}px`;
      track.style.height=`${Math.max(0,g.height-16)}px`;
      track.style.right=`${g.hostWidth-g.left-g.width}px`;
    }else{
      track.style.left=`${g.left+8}px`;
      track.style.width=`${Math.max(0,g.width-16)}px`;
      track.style.bottom=`${g.hostHeight-g.top-g.height}px`;
    }
  };
  let verticalRange=0,edgeState='';
  // Scrolling only reads position; container and track sizes refresh on resize, content changes and manual recalculation.
  const paintPosition=(top=container.scrollTop,left=container.scrollLeft)=>{
    if(internal){
      const transform=`translate(${left}px,${top}px)`;
      lanes.forEach(({track})=>{track.style.transform=transform});
      if(edges)edges.style.transform=transform;
    }
    if(edges){
      const above=verticalRange>1&&top>1;
      const below=verticalRange>1&&top<verticalRange-1;
      const state=`${above}:${below}`;
      if(state!==edgeState){
        edgeState=state;
        edges.hidden=!above&&!below;
        edges.classList.toggle('ui-can-scroll-top',above);
        edges.classList.toggle('ui-can-scroll-bottom',below);
        if(above||below){
          container.style.setProperty('--scroll-edge-top',above?'16px':'0px');
          container.style.setProperty('--scroll-edge-bottom',below?'16px':'0px');
        }else{
          container.style.removeProperty('--scroll-edge-top');
          container.style.removeProperty('--scroll-edge-bottom');
        }
        container.toggleAttribute('data-scroll-edges',!internal&&(above||below));
      }
    }
    lanes.forEach(({axis,thumb,range,travel})=>{
      if(range<=1)return;
      const offset=travel>0?Math.max(0,Math.min(1,(axis==='y'?top:left)/range))*travel:0;
      thumb.style.transform=`translate${axis==='y'?'Y':'X'}(${offset}px)`;
    });
  };
  let pendingFrame:number|null=null;
  const schedulePosition=()=>{
    if(pendingFrame!==null)return;
    pendingFrame=requestAnimationFrame(()=>{pendingFrame=null;paintPosition()});
  };
  const sync=()=>{
    if(destroyed)return;
    if(pendingSync!==null){cancelAnimationFrame(pendingSync);pendingSync=null}
    const g=measure();
    verticalRange=g.contentHeight-g.height;
    if(edges){
      edges.style.left=`${g.left}px`;
      edges.style.top=`${g.top}px`;
      edges.style.width=`${g.width}px`;
      edges.style.height=`${g.height}px`;
    }
    lanes.forEach(lane=>{
      const {axis,track,thumb}=lane,vertical=axis==='y';
      const size=vertical?g.height:g.width;
      const content=vertical?g.contentHeight:g.contentWidth;
      const range=content-size;
      lane.range=range;
      lane.travel=0;
      if(range<=1){track.hidden=true;return}
      track.hidden=false;
      place(lane,g);
      /* The local track's length is the number just written above and need not be read back; the full-page one is pinned to the viewport by the stylesheet,
         so show it before measuring: a hidden track's length is 0, and treating that as "unmeasurable" would lock it hidden forever. */
      const trackSize=root?(vertical?track.clientHeight:track.clientWidth):Math.max(0,size-16);
      if(!trackSize)return;
      // A thumb too short to grab is no thumb: very long content gets a minimum size, at the cost of thumb position and
      // Scroll progress is no longer strictly linear, but draggability matters more than clean math.
      const thumbSize=Math.min(trackSize,Math.max(24,size/content*trackSize));
      lane.travel=trackSize-thumbSize;
      thumb.style[vertical?'height':'width']=`${thumbSize}px`;
    });
    paintPosition(g.scrollTop,g.scrollLeft);
  };
  /* The resize observer's callback lands after this frame's layout, so measuring needs no forced reflow; scattered triggers like content changes and image arrivals
     coalesce into one computation on the next frame. Nothing is measured at attach time: the first callback fires before that same frame's
     paint, and the track stays hidden until then. */
  let pendingSync:number|null=null;
  const scheduleSync=()=>{if(pendingSync===null)pendingSync=requestAnimationFrame(()=>{pendingSync=null;sync()})};
  const scroller:EventTarget=root?document:container;
  scroller.addEventListener('scroll',schedulePosition,{passive:true,signal:events.signal});
  const resize=new ResizeObserver(sync);
  resize.observe(container);
  if(!root)container.addEventListener('load',scheduleSync,{capture:true,signal:events.signal});
  let contents:MutationObserver|undefined;
  // Content length changed but the container box did not (drawer rebuilt, section expanded), and the container's own ResizeObserver says nothing.
  // The full-page one watches body instead: its height is the content height, while attaching subtree on documentElement
  // A MutationObserver amounts to forcing a reflow for every card render.
  if(root)resize.observe(document.body);
  else{
    const observed=new Set<Element>();
    const contentChanged=()=>{
      const children=new Set([...container.children].filter(child=>!child.matches('.ovtrack,.ui-ov-edges')));
      observed.forEach(child=>{if(!children.has(child)){resize.unobserve(child);observed.delete(child)}});
      children.forEach(child=>{if(!observed.has(child)){resize.observe(child);observed.add(child)}});
    };
    /* The content's own height changes also refresh geometry, so collapse transitions and font reflows need not wait for scrolling: direct children are all in a
       size observer, which callbacks every frame while the transition changes height. `transitionend` is not listened for here: when the sidebar toggles, a column of buttons'
       text transitions bubble up a dozen-plus the moment they end, each forcing a re-measure next frame. */
    contentChanged();
    contents=new MutationObserver(()=>{contentChanged();scheduleSync()});
    contents.observe(container,{childList:true});
  }
  lanes.forEach(({axis,track,thumb})=>track.addEventListener('pointerdown',event=>{
    const vertical=axis==='y';
    const trackRect=track.getBoundingClientRect(),thumbRect=thumb.getBoundingClientRect();
    const travel=(vertical?trackRect.height-thumbRect.height:trackRect.width-thumbRect.width);
    const range=vertical?container.scrollHeight-container.clientHeight
      :container.scrollWidth-container.clientWidth;
    if(travel<=0||range<=0)return;
    const point=(moved:PointerEvent)=>vertical?moved.clientY:moved.clientX;
    const head=vertical?thumbRect.top:thumbRect.left,tail=vertical?thumbRect.bottom:thumbRect.right;
    // Pressing on the thumb keeps the grabbed point; pressing on empty track moves the thumb's center over.
    const grab=point(event)>=head&&point(event)<=tail?point(event)-head
      :(vertical?thumbRect.height:thumbRect.width)/2;
    const origin=vertical?trackRect.top:trackRect.left;
    const to=(moved:PointerEvent)=>{const at=Math.max(0,Math.min(range,(point(moved)-origin-grab)/travel*range));
      if(vertical)container.scrollTop=at;else container.scrollLeft=at};
    const stop=()=>{track.classList.remove('dragging');
      track.removeEventListener('pointermove',to);track.removeEventListener('pointerup',stop);
      track.removeEventListener('pointercancel',stop)};
    track.classList.add('dragging');
    track.setPointerCapture(event.pointerId);
    track.addEventListener('pointermove',to,{signal:events.signal});
    track.addEventListener('pointerup',stop,{signal:events.signal});
    track.addEventListener('pointercancel',stop,{signal:events.signal});
    to(event);
    event.preventDefault();
  },{signal:events.signal}));
  const control=Object.assign(sync,{repair(){
    let changed=false;
    for(const decoration of [...lanes.map(({track})=>track),...(edges?[edges]:[])]){
      if(decoration.parentElement!==host){host.append(decoration);changed=true}
    }
    if(changed)scheduleSync();
  },destroy(){
    if(controls.get(container)!==control)return;
    destroyed=true;
    controls.delete(container);
    events.abort();resize.disconnect();contents?.disconnect();
    if(pendingFrame!==null)cancelAnimationFrame(pendingFrame);
    if(pendingSync!==null)cancelAnimationFrame(pendingSync);
    lanes.forEach(({track})=>track.remove());edges?.remove();
    delete container.dataset.overlayScrollbar;
    delete container.dataset.overlayAxes;
    delete container.dataset.scrollEdges;
    container.style.removeProperty('--scroll-edge-top');container.style.removeProperty('--scroll-edge-bottom');
    if(changedPosition&&host.style.position==='relative'
      &&![...controls.keys()].some(node=>node.parentElement===host))host.style.position=originalPosition;
  }});
  controls.set(container,control);
  return control;
}
