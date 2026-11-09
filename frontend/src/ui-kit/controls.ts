/* The shared interactive controls: action busy states, the Geist Switch, custom sliders, the supplementary info card and drag-to-reorder.
   Referenced directly from shared source and shipped with `peach-app.js`; the root that already handles busy-state interception is module-level state, one instance only. */
import { esc, icon } from '../core';

import { wireAnchoredMenu } from './anchored-menu';

/**
 * Geist loading action: visually unavailable and inert without using native
 * `disabled`, so the trigger keeps keyboard focus while its request is running.
 */
export function setActionBusy(control:Element|null|undefined,busy=true):void{
  if(!control)return;
  if(busy){
    control.setAttribute('aria-busy','true');
    control.setAttribute('aria-disabled','true');
  }else{
    control.removeAttribute('aria-busy');
    control.removeAttribute('aria-disabled');
  }
}

const busyActionRoots=new WeakSet<Node>();

/** Block repeat pointer and keyboard activation for every shared busy action. */
export function wireBusyActions(root:Node=document):void{
  if(busyActionRoots.has(root))return;
  busyActionRoots.add(root);
  root.addEventListener('click',event=>{
    const control=(event.target as Element).closest?.('button[aria-busy="true"],[role="button"][aria-busy="true"]');
    if(!control||!root.contains(control))return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },true);
}

/**
 * Geist Switch: 2-3 mutually exclusive views use a radio group with a shared name, not Toggle.
 *
 * The JAV card layout and the follows list layout are the same control, differing only in name, options, and current value, so the template
 * and `.iconswitch` styles share one copy; each caller's placement is still handled by its own classes.
 */
export function iconSwitchHtml(name:string,legend:string,options:readonly (readonly any[])[],current:unknown,{attr='',className='',text=false}={}):string{
  const items=options.map(([value,label,symbol])=>
    `<label title="${esc(label)}"><input type="radio" name="${esc(name)}" value="${esc(value)}" ${attr}
      ${value===current?'checked':''}><span aria-hidden="true">${text?(symbol?icon(symbol):'')+esc(label):icon(symbol)}</span><span class="sr-only">${esc(label)}</span></label>`).join('');
  return `<fieldset class="iconswitch${text?' iconswitch-text':''}${className?` ${esc(className)}`:''}"><legend class="sr-only">${esc(legend)}</legend>${items}</fieldset>`;
}

/** Wire a group of radios rendered from iconSwitchHtml up to apply(value). */
export function wireIconSwitch(root:ParentNode|null|undefined,attr:string,apply:(value:string)=>void):void{
  root?.querySelectorAll<HTMLInputElement>(`[${attr}]`).forEach(input=>{
    input.onchange=()=>{if(input.checked)apply(input.value)};
  });
}

/* Self-drawn single-value slider. A native `input[type=range]` splits track, thumb and ticks across three sets of
   vendor-prefixed pseudo-elements; the current value cannot be read and hover-only ticks cannot be attached. Moving to a
   `role="slider"` container puts geometry, state and keyboard in one place. The shape comes from feralui.dev/gradients'
   `.dial-slider`, measured in
   `docs/reference-snapshots/feralui-studio-boardui-accent-measured.md`: 30px tall, 20px track, a tick every 10%, a 3×20px
   round-headed thumb; ticks and thumb are transparent by default and appear on hover or drag.
   Colors all derive from `--ink` via color-mix; the focus ring stays on the site's `--tungsten`.
   The current position is written as `--dial-at` for CSS: fill width and thumb position are the same number, and writing
   them in two places would drift. */
const DIAL_TICKS=9;
export function dialSliderHtml({value=0,min=0,max=100,step=1,label='',suffix='%',attr='',className=''}={}):string{
  const at=max>min?(value-min)/(max-min)*100:0;
  const text=`${value}${suffix}`;
  return `<div class="ui-dial${className?` ${esc(className)}`:''}" ${attr}>
    <div class="ui-dial-slider" data-dial-slider role="slider" tabindex="0" aria-label="${esc(label)}"
      aria-valuemin="${min}" aria-valuemax="${max}" aria-valuenow="${value}" aria-valuetext="${esc(text)}"
      data-dial-step="${step}" style="--dial-at:${at}%">
      <span class="ui-dial-track" aria-hidden="true"><span class="ui-dial-fill"></span></span>
      <span class="ui-dial-ticks" aria-hidden="true">${'<span></span>'.repeat(DIAL_TICKS)}</span>
      <span class="ui-dial-handle" aria-hidden="true"></span>
    </div><b class="ui-dial-value mono" data-dial-value>${esc(text)}</b></div>`;
}

/**
 * Wires a slider drawn by dialSliderHtml.
 *
 * `onInput` fires on every drag and keyboard step, and the caller merges into one frame itself; `onChange` fires once on
 * release, keyboard landing and touch cancel, and persistence belongs to it. Keeping the two apart is this slider's only
 * performance contract: writing localStorage on every drag step would turn one 60-step drag into 60 synchronous serializations.
 */
export function wireDialSlider(root:ParentNode,{onInput=()=>{},onChange=()=>{},suffix='%'}:{
  onInput?: (value:number)=>void; onChange?: (value:number)=>void; suffix?: string;
}={}):{readonly value:number;set(next:number):void}{
  const slider:any=root.querySelector('[data-dial-slider]'),readout=root.querySelector('[data-dial-value]');
  const track:any=root.querySelector('.ui-dial-track');
  const min=+slider.getAttribute('aria-valuemin'),max=+slider.getAttribute('aria-valuemax');
  const step=+slider.dataset.dialStep||1;
  let value=+slider.getAttribute('aria-valuenow');
  const clamp=(raw:number)=>Math.min(max,Math.max(min,Math.round(raw/step)*step));
  const paint=()=>{
    const text=`${value}${suffix}`;
    slider.style.setProperty('--dial-at',`${max>min?(value-min)/(max-min)*100:0}%`);
    slider.setAttribute('aria-valuenow',String(value));
    slider.setAttribute('aria-valuetext',text);
    if(readout)readout.textContent=text;
  };
  const set=(raw:number,notify:boolean)=>{
    const next=clamp(raw);
    if(next===value)return false;
    value=next;paint();if(notify)onInput(value);return true;
  };
  /* Track geometry measured once at pointer-down is enough; every pointermove afterwards reads the cache. During pointer capture this
     track cannot run away, while `getBoundingClientRect()` forces a synchronous style-and-layout pass; inside every
     pointermove, one drag becomes hundreds of forced layouts, measured to take up most of this path's time. */
  let trackBox:DOMRect|null=null;
  const fromPointer=(event:PointerEvent)=>{
    const rect=trackBox||track.getBoundingClientRect();
    const ratio=rect.width?(event.clientX-rect.left)/rect.width:0;
    set(min+(max-min)*Math.min(1,Math.max(0,ratio)),true);
  };
  slider.addEventListener('pointerdown',(event:PointerEvent)=>{
    if(event.pointerType==='mouse'&&event.button!==0)return;
    event.preventDefault();slider.focus();
    trackBox=track.getBoundingClientRect();
    slider.dataset.dragging='true';
    /* If pointer capture cannot be acquired, let it go: a synthetic pointerdown (automation, assistive tech) carries an id
       that matches no active pointer, `setPointerCapture` throws, and an uncaught throw would break the whole drag at step one. */
    try{slider.setPointerCapture(event.pointerId)}catch{}
    fromPointer(event);
  });
  slider.addEventListener('pointermove',(event:PointerEvent)=>{if(slider.dataset.dragging==='true')fromPointer(event)});
  const release=(event:PointerEvent)=>{
    if(slider.dataset.dragging!=='true')return;
    delete slider.dataset.dragging;trackBox=null;
    try{if(slider.hasPointerCapture(event.pointerId))slider.releasePointerCapture(event.pointerId)}catch{}
    onChange(value);
  };
  slider.addEventListener('pointerup',release);
  slider.addEventListener('pointercancel',release);
  /* A keyboard press is one step; with Shift it moves 10. Home/End jump straight to the ends: on a 0-100 slider, walking from one end to the other with arrow keys takes a hundred presses,
     and that is not usable. */
  slider.addEventListener('keydown',(event:KeyboardEvent)=>{
    const span=event.shiftKey?10:step;
    const moves:Record<string,number>={ArrowLeft:-span,ArrowDown:-span,ArrowRight:span,ArrowUp:span};
    let next:number|null=null;
    if(event.key in moves)next=value+moves[event.key]!;
    else if(event.key==='Home')next=min;
    else if(event.key==='End')next=max;
    if(next===null)return;
    event.preventDefault();
    if(set(next,true))onChange(value);
  });
  return {get value(){return value},set(next:number){set(next,false)}};
}

/** Complex supplementary info reuses the top-level overlay and viewport avoidance; the body is focusable and scrolls independently.
 *  `panel` goes into the top layer anchored beside `trigger`, opens after a 150ms hover or a click, and closes on Escape handled in `mount`. */
export function wireContextCard(mount:HTMLElement,trigger:HTMLElement,panel:HTMLElement):{
  setOpen(open:boolean):void; isOpen():boolean; hide():void;
}{
  panel.classList.add('context-card');panel.setAttribute('popover','manual');
  panel.setAttribute('role','dialog');panel.tabIndex=-1;
  trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',panel.id);
  const floating=wireAnchoredMenu(mount,trigger,panel);
  let timer:ReturnType<typeof setTimeout>|undefined;
  const hide=()=>{clearTimeout(timer);floating.setOpen(false)};
  const enter=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(trigger.isConnected)floating.setOpen(true)},150)};
  const leave=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!panel.matches(':hover')&&!trigger.matches(':hover')&&!panel.contains(document.activeElement)&&document.activeElement!==trigger)hide()},150)};
  trigger.addEventListener('pointerenter',enter);trigger.addEventListener('pointerleave',leave);
  panel.addEventListener('pointerenter',()=>clearTimeout(timer));panel.addEventListener('pointerleave',leave);
  trigger.addEventListener('focus',enter);trigger.addEventListener('blur',leave);
  trigger.addEventListener('click',()=>clearTimeout(timer));
  mount.addEventListener('keydown',event=>{if(event.key==='Escape')hide()});
  panel.addEventListener('focusout',leave);
  trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'&&floating.isOpen()){event.preventDefault();(panel.querySelector<HTMLElement>('a,button,[tabindex="0"]')||panel).focus()}});
  return {...floating,hide};
}

/* Drag reorder: a column of rows with keys; drop on a row's upper or lower half and it inserts there.
 *
 * The site previously had two nearly identical implementations (sidebar order, nav buttons); copying a third would let the
 * drop criteria, the drag dimming and the insertion line evolve separately. This module takes only "a column of rows": the
 * dragged row gets `dragging`, the drop row gets `drop-before` / `drop-after`, and styles come from the caller's class names.
 *
 * `onMove(key,target,after)` receives two keys and a side; reordering is the caller's job, since where order is stored and
 * what refreshes after saving differ everywhere. */
export function wireDragReorder(root:ParentNode,{selector,attribute,onMove}:{
  selector?: any; attribute?: any; onMove?: any;
}={}):void{
  const rows=():HTMLElement[]=>[...root.querySelectorAll<HTMLElement>(selector)];
  const clear=()=>rows().forEach(row=>row.classList.remove('dragging','drop-before','drop-after'));
  let dragging:string|null=null;
  rows().forEach(row=>{
    const key=row.getAttribute(attribute);
    row.draggable=true;
    row.addEventListener('dragstart',event=>{
      dragging=key;row.classList.add('dragging');
      event.dataTransfer!.effectAllowed='move';
      // Without writing dataTransfer Firefox does not recognize this as a drag at all; the home item's key is an empty string,
      // An empty string counts as unwritten, so give it a placeholder. The anchor rule looks only at the key itself, never at the text written here.
      event.dataTransfer!.setData('text/plain',key||'peach-row');
    });
    row.addEventListener('dragover',event=>{
      if(dragging===null||dragging===key)return;
      event.preventDefault();event.dataTransfer!.dropEffect='move';
      const after=event.clientY>row.getBoundingClientRect().top+row.offsetHeight/2;
      rows().forEach(item=>item.classList.remove('drop-before','drop-after'));
      row.classList.add(after?'drop-after':'drop-before');
    });
    row.addEventListener('drop',event=>{
      event.preventDefault();
      const after=row.classList.contains('drop-after'),from=dragging;
      dragging=null;clear();
      if(from!==null&&from!==key)onMove(from,key,after);
    });
    row.addEventListener('dragend',()=>{dragging=null;clear()});
  });
}
