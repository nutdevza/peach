import { esc, icon } from '../core';

import { wireAnchoredMenu } from './anchored-menu';

/** One item: value, display text, and an optional site icon (a sprite glyph name or a data URL with an embedded PNG). */
export type SelectOption = readonly [value: string, text: string, mark?: string | undefined];
/** The root element wired by `wireSelectField`: `value` and `disabled` read and write like a native select. */
export type SelectField = HTMLElement & { value: string; disabled: boolean };

/* Geist Select: every dropdown on the site is this one; none uses the browser's native select control.
 *
 * A native dropdown's popup is drawn by the operating system and ignores the site palette: in the light theme it either
 * follows the system into a different gray-white, or can only be forced back to dark wholesale with `color-scheme`. The seven
 * in the settings panel were exactly that, seven black blocks on white pages. Measured on vercel.com on 2026-09-04: the site
 * has no native dropdowns anywhere; triggers are buttons, panels are self-drawn listboxes, the panel background is the page
 * background (pure white --ds-background-100 in light mode), row height 36px, radius 6px, row padding 0 8px, hover and
 * selected are both 5% neutral fills, and the selected item has no check. Peach's rows use the site's existing --control-h
 * (36px), and the panel and positioning reuse .popmenu and wireAnchoredMenu.
 *
 * The selected state is fill only, so no check needs a slot in the row: the freed leading cell lets each item's site icon line
 * up in the same column as the one in the trigger. The panel's left padding (.popmenu's 6px plus the row's 6px) is sized to
 * the trigger's 12px, so the two icons align to the pixel.
 *
 * `value`, `disabled` and `change` stay on the root element, written like a native select: callers read and write it as they
 * would a native dropdown; only the drawing changes. */
export function selectOptionIconHtml(mark?: string): string {
  return !mark?'':mark.startsWith('data:image/png;base64,')
    ?`<img class="gselectmark" src="${esc(mark)}" alt="" width="16" height="16">`:icon(mark,'gselectmark');
}
export function selectFieldHtml(
  options: readonly SelectOption[], current: string,
  { label = '', attr = '', className = '' }: { label?: string; attr?: string; className?: string } = {},
): string {
  const chosen:SelectOption=options.find(([value])=>String(value)===String(current))||options[0]||['',''];
  const content=([,text,mark]:SelectOption)=>`${selectOptionIconHtml(mark)}${esc(text)}`;
  const rows=options.map(([value,text,mark])=>
    `<button type="button" role="option" data-select-option="${esc(value)}"
      aria-selected="${String(value)===String(chosen[0])}" tabindex="-1"><span data-select-content>${content([value,text,mark])}</span></button>`).join('');
  return `<div class="ui-gselect${className?` ${esc(className)}`:''}" ${attr}>
    <button type="button" class="gselectfield" data-select-trigger aria-haspopup="listbox"
      aria-expanded="false" aria-label="${esc(label)}"><span data-select-label>${content(chosen)}</span>${icon('chevron-down')}</button>
    <div class="popmenu gselectmenu" role="listbox" aria-label="${esc(label)}" popover="manual" data-select-menu hidden>${rows}</div></div>`;
}

/** Wires up a dropdown painted by selectFieldHtml; returns the root element itself, with value / disabled. */
export function wireSelectField(root: HTMLElement): SelectField {
  const trigger=root.querySelector<HTMLButtonElement>('[data-select-trigger]')!;
  const menu=root.querySelector<HTMLElement>('[data-select-menu]')!,label=root.querySelector('[data-select-label]')!;
  const options=()=>[...menu.querySelectorAll<HTMLElement>('[data-select-option]')];
  const current=()=>menu.querySelector<HTMLElement>('[aria-selected="true"]');
  /* The panel is at least as wide as the trigger. The menu is fixed, so its width does not follow the trigger on its own, and a panel narrower than the trigger
     does not read as the same control. This must run before wireAnchoredMenu: it positions by the current width. */
  trigger.addEventListener('click',()=>{
    const width=`${trigger.getBoundingClientRect().width}px`;
    menu.style.minWidth=width;
    if(root.hasAttribute('data-fixed-width'))menu.style.width=width;
  });
  const anchored=wireAnchoredMenu(root,trigger,menu);
  trigger.addEventListener('click',()=>{if(anchored.isOpen())current()?.focus()});
  const choose=(value:string|undefined)=>{
    const picked=options().find(option=>option.dataset.selectOption===String(value));
    if(!picked)return;
    options().forEach(option=>{
      option.setAttribute('aria-selected',String(option===picked));option.tabIndex=option===picked?0:-1});
    label.innerHTML=picked.querySelector('[data-select-content]')!.innerHTML;
  };
  options().forEach(option=>{
    option.onclick=()=>{
      const changed=option.getAttribute('aria-selected')!=='true';
      choose(option.dataset.selectOption);anchored.setOpen(false);trigger.focus();
      if(changed)root.dispatchEvent(new Event('change',{bubbles:true}));
    };
    option.onkeydown=event=>{
      if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
      event.preventDefault();
      const all=options(),at=all.indexOf(option);
      all[(at+(event.key==='ArrowDown'?1:-1)+all.length)%all.length]!.focus();
    };
  });
  if(current())current()!.tabIndex=0;
  Object.defineProperty(root,'value',{configurable:true,
    get:()=>current()?.dataset.selectOption??'',set:(value:string)=>{choose(value)}});
  Object.defineProperty(root,'disabled',{configurable:true,
    get:()=>trigger.disabled,set:(value:unknown)=>{trigger.disabled=!!value;if(value)anchored.setOpen(false)}});
  return root as SelectField;
}
