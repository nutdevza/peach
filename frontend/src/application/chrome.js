/* chrome domain controller: this domain's state and actions; startup installs them together through Application's lifecycle. */
import { applicationEffects } from './effects';
import { MEDIA_SOURCE_ICONS, moveGlidePane, wireAnchoredMenu } from '../ui-kit';
import { api, esc, icon } from '../core';
import { publishLibraries, orderLibraries } from '../library-catalog';
import { appSettingsStore } from '../appearance/settings';
import { narrowShell, openDrawer, openSettings } from './layout.js';
import { openConfigurationSection } from './playlists.js';
import { transitionTheme } from './../theme-transition';
import { preferencesState } from './preferences.js';
import { applyTheme } from './../appearance/theme';
import { wireGlowButton } from './../appearance/glow';
import { loadGlowPicker } from '../react/application-residents';
export const chromeState = {  };



export function installChrome25() {
(()=>{
const effects=applicationEffects;
const nativeNodes=['#brandHome','#filterBtn','#settingsBtn'].map(selector=>{
  const node=document.querySelector(selector);
  return {node,parent:node.parentNode,next:node.nextSibling};
});
const drawer=document.querySelector('#drawer'),drawerInert=drawer.inert;
const previousPlace=preferencesState.placeSidebarHead,previousOptics=preferencesState.syncGlassOptics;
const nativeBrand=nativeNodes[0].node;
const brandAttributes=['aria-label','aria-haspopup','aria-controls','aria-expanded'].map(name=>[name,nativeBrand.getAttribute(name)]);
effects.own(()=>{
  for(const {node,parent,next} of [...nativeNodes].reverse()){
    const target=parent.isConnected?parent:document.querySelector('.top');
    target.insertBefore(node,next?.parentNode===target?next:null);
  }
  for(const [name,value] of brandAttributes){if(value===null)nativeBrand.removeAttribute(name);else nativeBrand.setAttribute(name,value)}
  drawer.inert=drawerInert;
  if(preferencesState.placeSidebarHead===placeBrand)preferencesState.placeSidebarHead=previousPlace;
});
/* Board shell: library selection, the sidebar footer, glass refraction. */
document.documentElement.classList.toggle('board-high-contrast',localStorage.getItem('peach.high-contrast')==='true');
const boardBrand=document.querySelector('#brandHome');
boardBrand.setAttribute('aria-label','Select library');
const libraryPicker=document.createElement('div');libraryPicker.className='board-library-menu';libraryPicker.id='boardLibraryMenu';libraryPicker.hidden=true;libraryPicker.setAttribute('popover','manual');libraryPicker.setAttribute('role','dialog');libraryPicker.setAttribute('aria-label','Media library');
document.body.append(libraryPicker);
effects.own(()=>libraryPicker.remove());
boardBrand.setAttribute('aria-haspopup','dialog');boardBrand.setAttribute('aria-controls',libraryPicker.id);
if(!boardBrand.querySelector('.board-library-chevron')){
  boardBrand.insertAdjacentHTML('beforeend','<svg class="board-library-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6 3-3 3 3M5 10l3 3 3-3"/></svg>');
  const brandChevron=boardBrand.lastElementChild;effects.own(()=>brandChevron.remove());
}
effects.handler(boardBrand, 'onclick', event=>{event.preventDefault()});
const libraryFloating=wireAnchoredMenu(document.querySelector('#drawer'),boardBrand,libraryPicker,{side:true});
effects.own(libraryFloating.dispose);
/* The media library column is the same thing as the sidebar's nav column and the filter bar's row: mark "which one is
   current", slide wherever it points, and slide back to the truly selected item when the pointer leaves the column. So it
   rides the same glass and the same translation, with no second selected-fill written here; otherwise this spot's feel would
   drift into a fourth kind.
   `aria-pressed` never moves: moving over is not selecting, and screen readers and the keyboard should not follow.
   When the menu is closed its size cannot be measured (`offsetHeight` is 0), so the glass collapses first and lands when it
   opens. */
let libraryGlide=null,libraryGlideBox=null;
function syncLibraryGlide(animate,target){
  const rows=libraryPicker.querySelector('.board-library-rows');
  const active=(target&&target.isConnected?target:null)
    ||rows?.querySelector('button[aria-pressed="true"]');
  if(!rows||!active?.offsetHeight){if(libraryGlide)libraryGlide.hidden=true;libraryGlideBox=null;return}
  if(!libraryGlide||libraryGlide.parentElement!==rows){
    libraryGlide=document.createElement('span');libraryGlide.className='viewglide';
    libraryGlide.setAttribute('aria-hidden','true');rows.prepend(libraryGlide);libraryGlideBox=null;
  }
  libraryGlide.hidden=false;
  const box={x:active.offsetLeft,y:active.offsetTop,w:active.offsetWidth,h:active.offsetHeight};
  const from=libraryGlideBox;libraryGlideBox=box;
  moveGlidePane(libraryGlide,animate?from:null,box,'y');
}
effects.listen(libraryPicker, 'toggle', event=>{if(event.newState==='open'){
  libraryPicker.querySelector('button')?.focus();syncLibraryGlide(false)}});
effects.listen(libraryPicker, 'keydown', event=>{if(event.key==='Escape'){event.stopPropagation();libraryFloating.setOpen(false);boardBrand.focus()}});
api('/api/libraries',{signal:effects.signal}).then(data=>{
  if(!effects.isActive)return;
  publishLibraries(data.libraries);
  const choices=[['','All libraries','database'],...data.libraries.map(row=>[row.id,row.name,row.icon||'database'])];
  const selected=sessionStorage.getItem('peach.library')||'';
  if(!choices.some(row=>row[0]===selected)){
    const matching=data.libraries.filter(row=>row.name===selected);
    if(matching.length===1)sessionStorage.setItem('peach.library',matching[0].id);
    else sessionStorage.removeItem('peach.library');
    sessionStorage.removeItem('peach.library-label');location.reload();return;
  }
  const current=sessionStorage.getItem('peach.library')||'';
  const currentName=choices.find(row=>row[0]===current)?.[1]||'All libraries';
  sessionStorage.setItem('peach.library-label',currentName);
  boardBrand.querySelector('h1').textContent=currentName;
  const libraryMark=glyph=>MEDIA_SOURCE_ICONS[glyph]?.startsWith('data:')?`<img src="${MEDIA_SOURCE_ICONS[glyph]}" alt="">`:icon(MEDIA_SOURCE_ICONS[glyph]||glyph);
  const mark=document.createElement('span');mark.className='mark';mark.setAttribute('aria-hidden','true');
  mark.innerHTML=libraryMark(choices.find(row=>row[0]===current)?.[2]||'database');boardBrand.querySelector('.mark').replaceWith(mark);
  libraryPicker.innerHTML=`<p>Media libraries</p><div class="board-library-rows">${choices.map(([id,name,glyph])=>`<button type="button" data-library="${esc(id)}" aria-pressed="${id===current}"><span class="board-library-avatar">${libraryMark(glyph)}</span><span>${esc(name)}</span></button>`).join('')}</div><footer><button type="button" class="geist-button primary" data-library-manage>Manage media libraries</button></footer>`;
  libraryPicker.querySelectorAll('[data-library]').forEach(button=>effects.handler(button, 'onclick', ()=>{sessionStorage.setItem('peach.library',button.dataset.library);sessionStorage.setItem('peach.library-label',choices.find(row=>row[0]===button.dataset.library)?.[1]||'All libraries');location.assign('/')}));
  effects.handler(libraryPicker.querySelector('[data-library-manage]'), 'onclick', ()=>{libraryFloating.setOpen(false);openDrawer(false);openConfigurationSection('Library and imports')});
  /* Delegated on the column, not on each button: the menu repaints wholesale every time the media library is fetched.
     `pointerover`/`pointerout` rather than enter/leave; the latter two do not bubble, so delegation never sees them. */
  const libraryRows=libraryPicker.querySelector('.board-library-rows');
  const libraryButtons=[...libraryRows.querySelectorAll('[data-library]')];
  const libraryStore=appSettingsStore();
  const arrangeLibraries=()=>{
    orderLibraries(libraryButtons,['',...libraryStore.value.libraryOrder],button=>button.dataset.library)
      .forEach(button=>libraryRows.append(button));
    syncLibraryGlide(false);
  };
  arrangeLibraries();
  effects.own(libraryStore.subscribe(arrangeLibraries));
  effects.listen(libraryRows, 'pointerover', event=>{
    if(event.pointerType==='touch')return;
    const button=event.target.closest?.('button[data-library]');
    if(button)syncLibraryGlide(true,button);
  });
  effects.listen(libraryRows, 'pointerout', event=>{
    if(event.pointerType==='touch')return;
    if(!libraryRows.contains(event.relatedTarget))syncLibraryGlide(true);
  });
  syncLibraryGlide(false);
}).catch(()=>{if(effects.isActive)libraryPicker.hidden=true});
const boardToggle=document.querySelector('#filterBtn'),toggleHome=document.createComment('sidebar toggle');
(document.querySelector('.top')||boardToggle.closest('header')).prepend(toggleHome);
effects.own(()=>toggleHome.remove());
const boardFoot=document.createElement('div');boardFoot.className='board-sidebar-foot';
effects.own(()=>boardFoot.remove());
boardFoot.innerHTML=`<div class="board-theme-toggle" role="group" aria-label="Light/dark theme"><span class="board-theme-thumb" aria-hidden="true"></span><button type="button" data-board-theme="light" aria-label="Light theme">${icon('sun')}</button><button type="button" data-board-theme="dark" aria-label="Dark theme">${icon('moon')}</button></div>`;
/* The glow color button and settings button form one group; the light/dark key stands alone. Both expanding left to right and
   collapsing top to bottom order by light/dark, color, settings, and keyboard focus follows the same order.
   The glyph references `#ri-palette-line` directly, not through `icon()`: that one is Remix's solid path, while `icon()`
 * assembles `#i-`-prefixed outline forms. It means the same as the settings section "Appearance" one: this button's popover
 * bottom "Detailed settings" opens exactly that page, both speak of appearance, and one meaning should carry one glyph. */
boardFoot.insertAdjacentHTML('beforeend',`<div class="board-foot-actions"><button type="button" class="board-glow-toggle" id="boardGlowBtn" aria-label="Glow color" aria-haspopup="dialog" aria-expanded="false" aria-controls="boardGlowMenu"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#ri-palette-line"/></svg><span class="board-glow-mark" aria-hidden="true"><span class="board-glow-mark-glow"></span><span class="board-glow-mark-accent"></span></span></button></div>`);
boardFoot.querySelector('.board-foot-actions').append(document.querySelector('#settingsBtn'));
document.querySelector('#drawer').append(boardFoot);
boardFoot.querySelectorAll('[data-board-theme]').forEach(button=>effects.handler(button, 'onclick', ()=>{if(button.getAttribute('aria-pressed')==='true')return;transitionTheme(button,()=>{preferencesState.appSettings.theme=button.dataset.boardTheme;preferencesState.saveSettings();applyTheme()})}));
applyTheme();
/* The sidebar's glow color card follows the "Accent color" button at boardui.com's bottom right: the button paints no glyph
   but the two things it manages, a glow-color circle upper-left and an accent-color circle layered on it lower-right
   (`appearance/glow.ts`'s `paintGlowButton`).
   The card's shell is built here, anchored and opened/closed by `wireAnchoredMenu`, with material on the same rule as the
   media library selection popover; the content inside belongs to the resident component `glow-picker`
   (`frontend/src/react/glow-picker/`), rendered in by the route tree. */
const glowPicker=document.createElement('div');
glowPicker.className='popmenu board-glow-menu';glowPicker.id='boardGlowMenu';glowPicker.hidden=true;
glowPicker.setAttribute('popover','manual');glowPicker.setAttribute('role','dialog');
glowPicker.setAttribute('aria-label','Palette');
document.body.append(glowPicker);
effects.own(()=>glowPicker.remove());
const glowButton=boardFoot.querySelector('#boardGlowBtn');
const glowFloating=wireAnchoredMenu(boardFoot,glowButton,glowPicker);
effects.own(glowFloating.dispose);
effects.own(wireGlowButton(glowButton));
void loadGlowPicker({root:glowPicker,store:preferencesState.settingsStore,openDetails:()=>{
  if(!effects.isActive)return;
  glowFloating.setOpen(false);openDrawer(false);
  void openSettings('Appearance & navigation').then(panel=>{if(effects.isActive)panel.reveal('#homeGlowControls')});
}}).catch(error=>{if(effects.isActive&&error?.name!=='AbortError')console.error(error)});
/* The brand (library select) and toggle keys are the shell overlay's anchors, moved into the empty slot in the sidebar's title row: once when the skeleton paints, and again when the route tree
   paints the sidebar and swaps the skeleton (`attached`). On phones with the drawer closed the toggle returns to the top bar's original spot, and the drawer block is entirely unfocusable. */
function placeBrand(){
  if(!effects.isActive)return;
  const head=document.querySelector('#drawerScroll > [data-sidebar-head]'),drawer=document.querySelector('#drawer');
  if(!head)return;
  boardBrand.setAttribute('aria-label','Select library');
  if(boardBrand.parentElement!==head)head.prepend(boardBrand);
  const expanded=drawer.classList.contains('open'),desktop=!narrowShell();
  if(desktop||expanded){if(boardToggle.parentElement!==head)head.append(boardToggle)}else if(boardToggle.parentElement!==toggleHome.parentElement)toggleHome.after(boardToggle);
  drawer.inert=!desktop&&!expanded;
}
preferencesState.placeSidebarHead=placeBrand;
placeBrand();
effects.listen(document, 'board:sidebar', placeBrand);
effects.listen.bind(applicationEffects, window)('resize',placeBrand);

let floatingScheduled=false;
function updateFloating(){
  floatingScheduled=false;
  document.body.classList.toggle('board-scrolled',scrollY>8);
}
effects.listen.bind(applicationEffects, window)('scroll',()=>{if(!floatingScheduled){floatingScheduled=true;effects.frame(updateFloating)}},{passive:true});effects.listen.bind(applicationEffects, window)('resize',updateFloating);updateFloating();

/* Generate an edge-normal displacement field; only the backdrop is refracted. */
if(/Chrome|Chromium|Edg\//.test(navigator.userAgent)){
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');svg.setAttribute('width','0');svg.setAttribute('height','0');svg.setAttribute('aria-hidden','true');svg.style.position='fixed';svg.style.pointerEvents='none';
  const defs=document.createElementNS(ns,'defs');svg.append(defs);document.body.append(svg);
  const attached=new Map();let sequence=0;
  effects.own(()=>{
    for(const [node,{optic,priority,flag}] of attached){
      if(optic)node.style.setProperty('--glass-optic',optic,priority);else node.style.removeProperty('--glass-optic');
      if(flag===undefined)delete node.dataset.opticGlass;else node.dataset.opticGlass=flag;
    }
    attached.clear();svg.remove();
    if(preferencesState.syncGlassOptics===sync)preferencesState.syncGlassOptics=previousOptics;
  });
  /* During the sidebar's 300ms open/close (with `body`'s `padding-left` and the drawer's `width` in transition), the glass
     widths in the drawer and main area change every frame, and the optics textures cannot keep up: one is a few milliseconds
     of JS plus a PNG encode per frame, and writing back `--glass-optic` makes the observers later in line force a reflow on
     every size read; measured on the follows page, one open/close painted ten to sixteen frames with observer callbacks
     totaling 95 to 126ms. The panes whose size changed during the transition first fall back to that tier's plain blur, and
     once everything stops, one repaint at final size. */
  let sizing=0;const stale=new Set();
  const sizingEvent=event=>(event.target===document.body&&event.propertyName==='padding-left')
    ||(attached.has(event.target)&&(event.propertyName==='width'||event.propertyName==='height'));
  effects.listen(document, 'transitionrun', event=>{if(sizingEvent(event))sizing++}, true);
  const settleSizing=event=>{
    if(!sizingEvent(event)||!sizing||--sizing)return;
    // The transition just ended, so the repaint does not wait for idle: the final frame should already carry the final-size texture.
    stale.forEach(node=>pendingOptics.add(node));stale.clear();flushOptics(null);
  };
  effects.listen(document, 'transitionend', settleSizing, true);effects.listen(document, 'transitioncancel', settleSizing, true);
  function attach(node){
    if(attached.has(node))return;
    const id=`peach-optic-${++sequence}`;const filter=document.createElementNS(ns,'filter');filter.id=id;filter.setAttribute('filterUnits','userSpaceOnUse');filter.setAttribute('color-interpolation-filters','sRGB');
    const map=document.createElementNS(ns,'feImage');map.setAttribute('result','edge-map');map.setAttribute('preserveAspectRatio','none');
    const displacement=document.createElementNS(ns,'feDisplacementMap');displacement.setAttribute('in','SourceGraphic');displacement.setAttribute('in2','edge-map');displacement.setAttribute('xChannelSelector','R');displacement.setAttribute('yChannelSelector','G');displacement.setAttribute('scale','24');filter.append(map,displacement);defs.append(filter);
    let previous='';
    const fallback=()=>{
      if(node.dataset.opticGlass&&node.style.getPropertyValue('--glass-optic')!=='blur(14px)')node.style.setProperty('--glass-optic','blur(14px)');
      previous='';stale.add(node);
    };
    const draw=()=>{if(sizing)fallback();else{pendingOptics.add(node);scheduleOptics()}};
    const paint=(width,height,radius)=>{
      const key=`${width}:${height}:${radius}`;if(previous===key)return;
      previous=key;
      map.setAttribute('href',edgeMap(width,height,radius));map.setAttribute('width',width);map.setAttribute('height',height);filter.setAttribute('x','0');filter.setAttribute('y','0');filter.setAttribute('width',width);filter.setAttribute('height',height);
      /* Blur comes before displacement: backdrop-filter is a pipeline, first blurring the content behind,
         then the edge normal field pushes the already-blurred pixels outward, so the stretched rim carries color with it.
         Displace first and blur second, and the refracted bright edge gets smoothed away by step two, leaving uniform frosted glass. */
      node.style.setProperty('--glass-optic',`blur(14px) url("#${id}")`);node.dataset.opticGlass='true';
    };
    const observer=effects.resize(draw);observer.observe(node);
    attached.set(node,{observer,filter,draw,paint,fallback,optic:node.style.getPropertyValue('--glass-optic'),priority:node.style.getPropertyPriority('--glass-optic'),flag:node.dataset.opticGlass});draw();
  }
  /* The displacement map depends only on width, height, and radius: the top bar's round buttons share one size, and the sidebar's open and close cycle between only two tiers,
     so painted ones are kept keyed by these three numbers for direct reuse. */
  const edgeMaps=new Map();
  function edgeMap(width,height,radius){
    const key=`${width}:${height}:${radius}`;const cached=edgeMaps.get(key);
    if(cached){edgeMaps.delete(key);edgeMaps.set(key,cached);return cached}
    const ratio=Math.min(1,600/width,600/height);const w=Math.max(2,Math.round(width*ratio)),h=Math.max(2,Math.round(height*ratio));
    /* The canvas is used only to write pixels once and read one PNG, so take the CPU kind: the default GPU canvas must read pixels back at toDataURL,
       and the first time also has to build a GPU context; cold start measured that alone at about a hundred milliseconds, and later
       repaints intermittently fight compositing for the GPU for tens of milliseconds. */
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});const pixels=ctx.createImageData(w,h);
    const distance=(x,y)=>{const qx=Math.abs(x-width/2)-(width/2-radius),qy=Math.abs(y-height/2)-(height/2-radius);return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-radius};
    const depth=Math.min(24,Math.min(width,height)/3);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const px=(x+.5)/ratio,py=(y+.5)/ratio,inside=-distance(px,py);let dx=0,dy=0;
      if(inside>0&&inside<depth){const gx=distance(px+.5,py)-distance(px-.5,py),gy=distance(px,py+.5)-distance(px,py-.5),length=Math.hypot(gx,gy)||1;const bend=Math.sin(Math.PI*inside/depth);dx=gx/length*bend;dy=gy/length*bend}
      const i=(y*w+x)*4;pixels.data[i]=128+dx*116;pixels.data[i+1]=128+dy*116;pixels.data[i+2]=128;pixels.data[i+3]=255;
    }
    ctx.putImageData(pixels,0,0);const href=canvas.toDataURL();
    edgeMaps.set(key,href);if(edgeMaps.size>24)edgeMaps.delete(edgeMaps.keys().next().value);
    return href;
  }
  /* Textures paint at idle: first measure the queued glass pieces' sizes together, then write uniformly; measuring and writing interleaved means a
     previous piece's `--glass-optic` write dirties styles and the next piece's radius read forces a whole-tree recompute on the spot. Whatever is left when
     idle time runs out waits for the next idle stretch; cap the wait at 300ms, before which the glass uses the stylesheet's plain blur. */
  const pendingOptics=new Set();let opticsHandle=0;
  const idle=typeof requestIdleCallback==='function';
  function scheduleOptics(){
    if(!opticsHandle)opticsHandle=idle?requestIdleCallback(flushOptics,{timeout:300}):setTimeout(flushOptics,50);
  }
  effects.own(()=>{if(opticsHandle){if(idle)cancelIdleCallback(opticsHandle);else clearTimeout(opticsHandle)}opticsHandle=0;pendingOptics.clear()});
  function flushOptics(deadline){
    if(deadline!==null)opticsHandle=0;
    if(!effects.isActive)return;
    const nodes=[...pendingOptics].filter(node=>node.isConnected&&attached.has(node));pendingOptics.clear();
    if(sizing){nodes.forEach(node=>attached.get(node).fallback());return}
    const sizes=nodes.map(node=>{
      const width=Math.round(node.clientWidth),height=Math.round(node.clientHeight);
      return {node,width,height,radius:width&&height?Math.min(parseFloat(getComputedStyle(node).borderRadius)||22,width/2,height/2):0};
    });
    for(const [index,{node,width,height,radius}] of sizes.entries()){
      if(index&&deadline&&!deadline.didTimeout&&deadline.timeRemaining()<=0){
        sizes.slice(index).forEach(rest=>pendingOptics.add(rest.node));scheduleOptics();return;
      }
      if(width&&height)attached.get(node).paint(width,height,radius);
    }
  }
  const sync=()=>{
    if(!effects.isActive)return;
    for(const [node,{observer,filter}] of attached){
      if(!node.isConnected){observer.disconnect();filter.remove();attached.delete(node)}
    }
    /* The settings panel's left column's `[data-glass-pane]` hangs on `<body>` and not inside `#main`, so the observer below
       cannot see it; the island's first panel render calls this through `syncGlassOptics` to scan again. While the panel is
 * closed its width and height are zero and `draw` returns directly, waiting for `ResizeObserver` to paint the optics once
 * more the frame it appears. */
    document.querySelectorAll('.board-filter-frame,.top>.ib,[data-sidebar-drawer],.reviewcontrols,.reviewgroupbar,[data-glass-pane]').forEach(attach);
  };
  preferencesState.syncGlassOptics=sync;
  const panes='.board-filter-frame,.top>.ib,[data-sidebar-drawer],.reviewcontrols,.reviewgroupbar,[data-glass-pane]';
  effects.mutation(records=>{
    if(records.some(record=>[...record.addedNodes,...record.removedNodes].some(node=>
      node instanceof Element&&(node.matches(panes)||node.querySelector(panes)))))sync();
  }).observe(document.body,{childList:true,subtree:true});sync();
}

})();
openDrawer(!narrowShell()&&sessionStorage.getItem('board.sidebar')!=='closed');
}
