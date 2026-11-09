import { playUiSound } from './sounds';

interface OpenedMenu { mount: Element; menu: HTMLElement; toggle: HTMLElement; setOpen: (next: boolean) => void }

/* Menus anchored to their trigger button: no expand animation, fixed inside the viewport, content scrolls within the menu.

   Prefer opening leftward from the trigger's right edge, flipping above when there is no room below. The site-wide anchored menus share this positioning and
   toggle: how menus behave at viewport edges is the easiest thing to implement differently everywhere, and two implementations of one semantics means only one gets fixed. */
let openedMenu:OpenedMenu|null=null;
const peachGlobal=globalThis as typeof globalThis & { __peachMenuCloser?: boolean };
if(!peachGlobal.__peachMenuCloser){
  peachGlobal.__peachMenuCloser=true;
  /* The "elsewhere" of "click elsewhere to close" cannot be counted as simply "outside the mount". The mount is the positioned
     ancestor used for placement: the sidebar color popover gives `.board-sidebar-foot`, the media library popover gives the
     whole `#drawer`, and the settings key plus every other control in the sidebar live inside it; counting by mount, clicking
     them would all be "inside" and the popover would never close. Shrinking the mount to the trigger key alone fails too:
     placement is computed from it, and which side the menu opens on depends on this region.
     So the criterion becomes "was the click on this menu's own things": the menu's interior and the trigger key count as
     inside; other clickable controls inside the mount count as outside; blank space inside the mount stays inside (clicking
     blank space should do nothing anyway). */
  const clickable='a[href],button,input,select,textarea,summary,[role=button],[role=menuitem],[tabindex]';
  document.addEventListener('click',event=>{
    if(!openedMenu)return;
    const target=event.target as Node|null;
    if(openedMenu.menu.contains(target)||openedMenu.toggle.contains(target))return;
    if(openedMenu.mount.contains(target)&&!(target instanceof Element&&target.closest(clickable)))return;
    openedMenu.setOpen(false)},true);
}
export function closeAnchoredMenu(): void {if(openedMenu)openedMenu.setOpen(false)}
/* Menu panels' open/close motion comes from boardui's menu-styles.ts (registered in docs/BOARD_UI.md): 150ms ease-out, with
   opacity, scale .95 and 2px blur entering and leaving together. Entry starts from the Board layer's CSS per
   `:not([hidden])`; exit must wait for the animation to finish before `hidden`, because the moment display:none lands the
   animation is cut off. Which panels count as menus is decided by CSS: a read animation-name of none (legacy UI,
   prefers-reduced-motion) hides on the spot.
   Every menu site-wide enters and exits through these two doors, so `hidden` always means "not visible" and nobody writes
   their own 150ms. */
const leavingMenus=new WeakMap<HTMLElement,()=>void>();
export function presentMenu(menu: HTMLElement): void {
  leavingMenus.delete(menu);menu.classList.remove('leaving');
  if(menu.hidden)playUiSound('whoosh');
  menu.hidden=false;
}
export function dismissMenu(menu: HTMLElement, finish?: () => void): void {
  if(menu.hidden||leavingMenus.has(menu))return;
  const done=()=>{if(leavingMenus.get(menu)!==done)return;
    leavingMenus.delete(menu);menu.classList.remove('leaving');menu.hidden=true;if(finish)finish()};
  leavingMenus.set(menu,done);
  menu.classList.add('leaving');
  if(getComputedStyle(menu).animationName==='none'){done();return}
  menu.addEventListener('animationend',event=>{if(event.target===menu)done()},{once:true});
  // If another rule hides the panel before the animation ends (say, a tab switch) animationend never arrives, so allow one beat of slack.
  setTimeout(done,240);
}
/* The usable viewport's top edge is the bottom of the fixed top bar. On every page the top bar covers the topmost row; a menu flush at 8px
   gets half-covered by it, and the clipping is invisible, the first item simply vanishes. */
const viewportTop=()=>8+(parseFloat(getComputedStyle(document.documentElement)
  .getPropertyValue('--topH'))||0);
/**
 * Whether this scroll would carry `anchor` away: the page itself scrolling, or the scrolling container holding it.
 * Viewport-anchored overlays (anchored menus, player menus, tooltips) should dismiss only at such times. Scrolls elsewhere
 * cannot move the anchor: the home new-releases row scrolls horizontally by itself, firing one scroll event per frame and
 * received all the same in capture phase, so counting "outside the overlay" would dismiss it the moment it opens. The
 * overlay's own scrolling does not hold the anchor and naturally does not count.
 */
export function scrollMovesAnchor(event: Event, anchor: Node): boolean {
  return event.target instanceof Node&&event.target.contains(anchor);
}
/* `align:'start'` opens the menu rightward from the trigger's left edge. The default opens leftward because triggers usually sit at a row's
   right end; when the trigger follows content directly (the one right of the profile page's name), opening leftward would cover that content and the avatar further left. */
export function wireAnchoredMenu(
  mount: HTMLElement, toggle: HTMLElement, menu: HTMLElement,
  { side = false, align = 'end' }: { side?: boolean; align?: 'start' | 'end' } = {},
): { setOpen(next: boolean): void; isOpen(): boolean; dispose(): void } {
  let anchorPosition: { left:number; top:number } | null = null;
  const position=()=>{
    // Read width from offsetWidth: the enter animation starts at scale(.95), so getBoundingClientRect measures the scaled box.
    const anchor=toggle.getBoundingClientRect(),width=menu.offsetWidth;
    anchorPosition={left:anchor.left,top:anchor.top};
    if(side&&innerWidth>=640){
      menu.dataset.placement='right';
      menu.style.maxHeight=Math.max(0,innerHeight-32)+'px';
      /* Open hugging the trigger's right edge, allowed to cover the sidebar's remaining stretch. Measured from the sidebar's right edge instead, the expanded state leaves
         about two hundred pixels between trigger and sidebar edge, and the menu would sit across a blank gap from the control that opened it, unreadable as to whom it belongs. */
      menu.style.left=Math.max(16,Math.min(anchor.right+8,innerWidth-width-16))+'px';
      menu.style.top=Math.max(16,Math.min(anchor.top,innerHeight-menu.offsetHeight-16))+'px';return;
    }
    const top=viewportTop(),under=innerHeight-8-anchor.bottom-8,over=anchor.top-8-top;
    /* If it does not fit below, open above; when neither side fits, take the wider side and clamp the menu to that side's height,
       letting content scroll inside the menu. Without the clamp it spans across the trigger and covers itself, and after opening you cannot even see
       which name you are editing. */
    const naturalHeight=menu.scrollHeight+menu.offsetHeight-menu.clientHeight;
    const downward=under>=naturalHeight||under>=over;
    const height=Math.min(naturalHeight,Math.max(downward?under:over,0));
    menu.dataset.placement=downward?'bottom':'top';
    menu.style.maxHeight=height+'px';
    const preferredLeft=align==='start'||menu.classList.contains('context-card')?anchor.left:anchor.right-width;
    menu.style.left=Math.max(8,Math.min(preferredLeft,innerWidth-width-8))+'px';
    menu.style.top=(downward?anchor.bottom+8:anchor.top-8-height)+'px'};
  /* Close when the trigger button is scrolled away: the menu is fixed to the viewport while the anchor moves with content, and staying open leaves it hanging in midair.
     The menu's own scrolling does not count; when it overflows it must scroll internally, and closing on one scroll would make the items below unreachable;
     other rows' horizontal scrolling does not count either; see `scrollMovesAnchor` for the criterion. */
  const closeFromViewport=(event:Event)=>{
    // Whole-page scrolling collapses directly; partial scrolling verifies the anchor's position to dodge events queued before the menu opened.
    if(!scrollMovesAnchor(event,toggle)||!anchorPosition)return;
    const anchor=toggle.getBoundingClientRect();
    if(event.target===document||event.target===window
      ||Math.abs(anchor.left-anchorPosition.left)>.5||Math.abs(anchor.top-anchorPosition.top)>.5)setOpen(false);
  };
  /* Menus with popovers go top-layer. `position:fixed` is viewport-relative only when no ancestor has taken it over: one
     transform, filter or backdrop-filter on an ancestor makes it the containing block, so the computed viewport coordinates
     shift wholesale and the ancestor's overflow clips them too. The settings panel's card is exactly such an ancestor, with
     the entry animation's fill-mode keeping the transform hanging on it, so the menu opened somewhere invisible and read as
     "cannot be opened". */
  const inTopLayer=menu.hasAttribute('popover');
  /* Open or closed is tracked here, not via `hidden`: during the 150ms exit the panel is still there and hidden is still false,
     so judging by hidden would treat "closing" as "open", and clicking the trigger again would close something already closing. */
  let open=false,disposed=false;
  const setOpen=(next:boolean)=>{
    if(disposed)return;
    if(next){
      if(openedMenu&&openedMenu.mount!==mount)openedMenu.setOpen(false);
      open=true;presentMenu(menu);if(inTopLayer&&!menu.matches(':popover-open'))menu.showPopover();position();
      window.addEventListener('resize',position);
      window.addEventListener('scroll',closeFromViewport,{capture:true,passive:true});
    }else{
      open=false;
      window.removeEventListener('resize',position);
      window.removeEventListener('scroll',closeFromViewport,true);
      dismissMenu(menu,()=>{menu.style.left='';menu.style.top='';menu.style.maxHeight='';
        if(inTopLayer&&menu.matches(':popover-open'))menu.hidePopover()});
    }
    toggle.setAttribute('aria-expanded',String(next));
    openedMenu=next?{mount,menu,toggle,setOpen}:(openedMenu&&openedMenu.mount===mount?null:openedMenu)};
  const click=(event:MouseEvent)=>{event.stopPropagation();setOpen(!open)};
  const keydown=(event:KeyboardEvent)=>{
    if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);toggle.focus()}};
  toggle.addEventListener('click',click);
  mount.addEventListener('keydown',keydown);
  const dispose=()=>{
    if(disposed)return;
    disposed=true;open=false;
    toggle.removeEventListener('click',click);
    mount.removeEventListener('keydown',keydown);
    window.removeEventListener('resize',position);
    window.removeEventListener('scroll',closeFromViewport,true);
    if(openedMenu?.menu===menu)openedMenu=null;
    leavingMenus.delete(menu);menu.classList.remove('leaving');menu.hidden=true;
    if(inTopLayer&&menu.matches(':popover-open'))menu.hidePopover();
    menu.style.left='';menu.style.top='';menu.style.maxHeight='';
    toggle.setAttribute('aria-expanded','false');
  };
  return {setOpen,isOpen:()=>open,dispose};
}
