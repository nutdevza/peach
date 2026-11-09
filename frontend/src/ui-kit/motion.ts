/* A set of in-place state helpers: glyph swap, text re-wrap, staggered readouts, clearing inputs, count badges and the
   title's line-by-line reveal.
   Imported from shared source and shipped with `peach-app.js`; the count badge's previous value is module-level state with
   one copy.
 *
 * Shapes and CSS live in the same directory's `motion.css` (the text re-wrap rule in `web/css/25-motion.css`), which also
 * records each one's origin and values. This layer only decides "when to swap": the animation itself always goes to CSS, and
 * JS neither reads nor writes concrete millisecond numbers. */
import { esc, icon } from '../core';

/**
 * Two glyphs stacked in one cell; state changes only touch the container's `data-icon-state`.
 *
 * Anywhere doing `innerHTML=icon(...)` can switch to this: rewriting innerHTML throws away the old glyph together with its running
 * animation, and the new glyph has no starting point either; it reads as a hard cut.
 */
export function iconSwapHtml(a:string,b:string,state:'a'|'b'|(string&{})='a',{className='',iconClass='',label=''}={}):string{
  return `<span class="iconswap${className?' '+esc(className):''}" data-icon-swap data-icon-state="${state==='b'?'b':'a'}"${
    label?` aria-label="${esc(label)}"`:''}><span data-icon="a">${icon(a,iconClass)}</span><span data-icon="b">${icon(b,iconClass)}</span></span>`;
}
/** Switches the icon painted by `iconSwapHtml` to a or b; `root` may be the icon itself or one of its ancestors. */
export function setIconSwap(root:any,state:'a'|'b'|boolean|(string&{})):any{
  const el=root&&(root.matches?.('[data-icon-swap]')?root:root.querySelector?.('[data-icon-swap]'));
  if(el)el.dataset.iconState=state==='b'||state===true?'b':'a';
  return el;
}

/**
 * One line of text swapped for another: the old text blurs upward, the new returns to place from below.
 *
 * An unchanged value does nothing; rewriting the same text within one repaint is normal, and jittering along would make the page look
 * perpetually changing. The first write (the cell still empty) also skips the animation: that is content's first appearance, belonging to the skeleton phase.
 */
export function swapText(el:any,text:unknown,{html=false}={}):void{
  if(!el)return;
  const next=String(text??''),write=()=>{if(html)el.innerHTML=next;else el.textContent=next};
  const previous=el.dataset.swapText;
  if(previous===next&&(el.textContent||'').length)return;
  el.dataset.swapText=next;
  el.classList.add('textswap');
  if(previous===undefined||previous===next||window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    el.classList.remove('leaving','entering');write();return;
  }
  el.classList.remove('entering');
  el.classList.add('leaving');
  const enter=()=>{
    if(el.dataset.swapText!==next)return;
    el.classList.remove('leaving');
    write();
    el.classList.add('entering');
    el.getBoundingClientRect();
    el.classList.remove('entering');
  };
  const done=(event:Event)=>{if(event.target!==el)return;el.removeEventListener('transitionend',done);enter()};
  el.addEventListener('transitionend',done);
  /* Fallback: when `--motion-swap` is zero or the element is invisible at the moment, `transitionend` never fires;
     without the fallback this row would stay transparent forever. */
  setTimeout(()=>{if(el.classList.contains('leaving')){el.removeEventListener('transitionend',done);enter()}},400);
}

/**
 * Readouts grow in staggered steps per position. `text` is split into characters, digits each get a delay tier, separators follow the previous tier.
 *
 * Like `swapText`, it only triggers when the value actually changes; the first write does not animate.
 */
export function popCount(el:any,text:unknown):void{
  if(!el)return;
  const next=String(text??''),previous=el.dataset.popCount;
  if(previous===next&&el.firstElementChild)return;
  el.dataset.popCount=next;
  let at=-1;
  el.innerHTML=`<span class="digits">${[...next].map(ch=>{
    if(/\d/.test(ch))at+=1;
    return `<span style="--digit-at:${Math.max(at,0)}">${esc(ch)}</span>`;
  }).join('')}</span>`;
  /* If the previous value was never recorded (first appearance of this cell) or has not changed at all, just write the text. When the caller repaints the whole block,
     it writes the last readout back into `dataset.popCount` before calling, so this cell knows whether its value changed or it was just created. */
  if(previous===undefined||previous===next)return;
  const group=el.firstElementChild;
  group.getBoundingClientRect();
  group.classList.add('popping');
}

/**
 * Clear the input box while its text floats up and blurs away.
 *
 * The input's value disappears in an instant, so the animation must hang elsewhere: this lays out an identical copy of the text at its current
 * position and font and lets that copy float, while the real input empties on the spot, cursor and IME not waiting a moment. `host` defaults to
 * the input's parent, which must be the positioned ancestor, otherwise this layer floats to the page's top-left.
 */
export function dissolveValue(input:any,host:any=input&&input.parentElement,
  {text=input&&input.value,scrollLeft=input&&input.scrollLeft||0}:{text?:string;scrollLeft?:number}={}):()=>void{
  if(!input||!host)return ()=>{};
  host.querySelectorAll(':scope > .cleardissolve').forEach((node:Element)=>node.remove());
  input.classList.remove('dissolving');
  input.value='';
  if(!text||!input.isConnected)return ()=>{};
  const ghost=inputGhost(input,host,'cleardissolve');
  if(!ghost)return ()=>{};
  const value=document.createElement('span');
  value.dataset.dissolveValue='';
  value.textContent=text;
  value.style.transform=`translateX(-${Math.max(0,scrollLeft)}px)`;
  ghost.append(value);
  input.classList.add('dissolving');
  host.append(ghost);
  let active=true,timer:ReturnType<typeof setTimeout>|null=null;
  const drop=()=>{
    if(!active)return;
    active=false;
    if(timer!==null)clearTimeout(timer);
    ghost.removeEventListener('animationend',drop);
    ghost.remove();
    if(!host.querySelector(':scope > .cleardissolve'))input.classList.remove('dissolving');
  };
  ghost.addEventListener('animationend',drop);
  /* Fallback: when `--motion-reveal` is zero or the element is not visible at this moment, `animationend` never fires;
     without the fallback this copy would sit over the input forever. */
  timer=setTimeout(drop,1000);
  return drop;
}

/** Lay an empty overlay following the input box's current position, padding, and font, so the text lands at the same spot in the box; it's null when the box is invisible. */
function inputGhost(input:any,host:any,className:string):HTMLSpanElement|null{
  const box=input.getBoundingClientRect(),frame=host.getBoundingClientRect();
  if(!box.width)return null;
  const ghost=document.createElement('span');
  ghost.className=className;
  ghost.setAttribute('aria-hidden','true');
  const style=getComputedStyle(input);
  Object.assign(ghost.style,{left:`${box.left-frame.left-host.clientLeft}px`,
    top:`${box.top-frame.top-host.clientTop}px`,width:`${box.width}px`,height:`${box.height}px`,
    boxSizing:'border-box',padding:style.padding,font:style.font,lineHeight:style.lineHeight,
    letterSpacing:style.letterSpacing,textAlign:style.textAlign,direction:style.direction});
  return ghost;
}

/**
 * Swap the input box's placeholder text: the old text blurs away upward, the new text returns from below to its position, like `swapText`.
 *
 * The placeholder is drawn by the input itself, so it can't be animated: here a layer is placed over it matching its position and color, and that layer is swapped; during the swap
 * the placeholder inside the box is hidden, and the layer is removed after. `placeholder` is changed to the new value immediately, so screen readers and the Enter key reads all get it.
 * When the box has text, is invisible, or reduced motion is requested, change it directly with no animation. Returns an undo function: if typing starts mid-animation, cancel it.
 */
export function rollPlaceholder(input:any,next:string,host:any=input&&input.parentElement):()=>void{
  if(!input)return ()=>{};
  const previous=input.placeholder;
  host?.querySelectorAll(':scope > .placeholderroll').forEach((node:Element)=>node.remove());
  input.classList.remove('placeholderrolling');
  input.placeholder=next;
  if(!host||!previous||previous===next||input.value||!input.isConnected
    ||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return ()=>{};
  const ghost=inputGhost(input,host,'placeholderroll');
  if(!ghost)return ()=>{};
  ghost.style.color=getComputedStyle(input,'::placeholder').color;
  const line=document.createElement('span');
  ghost.append(line);
  input.classList.add('placeholderrolling');
  host.append(ghost);
  swapText(line,previous);
  line.getBoundingClientRect();
  swapText(line,next);
  let active=true;
  const drop=()=>{
    if(!active)return;
    active=false;
    clearTimeout(timer);
    ghost.remove();
    if(!host.querySelector(':scope > .placeholderroll'))input.classList.remove('placeholderrolling');
  };
  /* Exit and entry each get a --motion-swap; swapText's own fallback is 400ms; here allow a full two segments before closing. */
  const timer=setTimeout(drop,900);
  return drop;
}

/* What the count badge was last time. The row holding the badge repaints wholesale on every filter change, and the node itself cannot keep the previous value,
   so it is recorded here; the key is the caller's scope plus the badge's own key. */
const badgeCounts=new Map<string,string>();
/**
 * Only the count badges whose values really changed pop; the rest stay still.
 *
 * First sight of a badge does not pop: that is its first appearance in this scope, and the whole row popping at once is fireworks on a screen, while what it must
 * say is "this one just changed". `scope` distinguishes the same key's counts in different rows (top filter bar and drawer each have one).
 */
export function popBadges(root:any,scope=''):void{
  if(!root)return;
  root.querySelectorAll('[data-count-badge]').forEach((el:HTMLElement)=>{
    const key=`${scope}\u0000${el.dataset.countBadge}`,next=el.textContent||'';
    const previous=badgeCounts.get(key);
    badgeCounts.set(key,next);
    el.classList.add('countbadge');
    if(previous===undefined||previous===next)return;
    el.classList.add('popped');
    el.getBoundingClientRect();
    el.classList.remove('popped');
  });
}

/**
 * A heading revealed line by line out of blur.
 *
 * By line, not by word: per-word would split the sentence into a string of `<span>`s, and copied text would fall apart, and these headings
 * are exactly the most-copied text. On completion the classes and line order are removed together, leaving no `filter` on the final frame.
 */
export function revealTexts(root:any,selector='[data-reveal-line]'):void{
  if(!root)return;
  const lines:HTMLElement[]=[...root.querySelectorAll(selector)];
  if(!lines.length)return;
  /* Both the start and end states hang on the rows themselves, not on an outer layer: one pair of these headings are direct children of `<body>`
     (the page title and its description line), and their only common ancestor is body itself. */
  lines.forEach((el,i)=>{el.classList.remove('revealing');el.classList.add('revealline');
    el.style.setProperty('--reveal-at',String(i))});
  lines[0]!.getBoundingClientRect();
  lines.forEach(el=>el.classList.add('revealing'));
  const drop=()=>lines.forEach(el=>{el.classList.remove('revealline','revealing');
    el.style.removeProperty('--reveal-at')});
  const last=lines[lines.length-1]!;
  const done=(event:Event)=>{if(event.target!==last)return;last.removeEventListener('transitionend',done);drop()};
  last.addEventListener('transitionend',done);
  setTimeout(()=>{if(last.classList.contains('revealline')){last.removeEventListener('transitionend',done);drop()}},1200);
}
