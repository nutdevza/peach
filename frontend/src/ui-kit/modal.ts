/* Geist Modal's two body types: one sentence to confirm (`confirmModal`) and a form to fill (`formModal`).
   Referenced from shared source directly and shipped with `peach-app.js`; the shell and the React subtree open the same copy,
   so title id numbering stays continuous page-wide. */
import { setActionBusy } from './controls';
import { noteHtml } from './markup';
import { playUiSound } from './sounds';
import { attachOverlayScrollbar } from './overlay-scrollbar';

/* Geist Modal's other body: a form to fill, not a sentence to confirm.
 *
 * The shell, mask, focus trap, Escape and returning focus to the trigger on close all come from the `.geist-modal` outfit
 * confirmModal uses; the only differences are the body and what the primary button does. So the popover's geometry has one
 * home: title a 20px/26px h3, body 20px padding, action bar stuck to the bottom justified between, primary button in the
 * bottom-right corner.
 *
 * The `dialog` in the return value lets the caller wire its own row events, and `done` resolves when the popover closes. */
let formModalSeq=0;
export function formModal({title,description='',body='',confirmLabel,cancelLabel='Cancel',
                           onConfirm=null,confirmDisabled=false}:{
  title?: string; description?: string; body?: string; confirmLabel?: string; cancelLabel?: string;
  onConfirm?: (()=>unknown)|null; confirmDisabled?: boolean;
}={}):{dialog:HTMLDialogElement;confirmButton:any;done:Promise<{confirmed:boolean;result?:unknown}>;close:()=>void}{
  const trigger=document.activeElement;
  const dialog=document.createElement('dialog');
  dialog.className='ui-geist-modal';
  const titleId=`geist-form-title-${++formModalSeq}`;
  dialog.setAttribute('aria-labelledby',titleId);
  dialog.innerHTML=`<form class="ui-geist-modal-form" novalidate>
      <header class="ui-geist-modal-header"><h3 id="${titleId}"></h3></header>
      <div class="ui-geist-modal-scroll"><div class="ui-geist-modal-body">${description?'<p></p>':''}
        <div class="ui-geist-modal-fields">${body}</div><div data-modal-error></div></div></div>
      <footer class="geist-modal-footer">
        <div><button type="button" class="geist-button" data-modal-cancel></button></div>
        <div><button type="submit" class="geist-button primary" data-modal-confirm></button></div>
      </footer></form>`;
  dialog.querySelector('h3')!.textContent=title as string;
  if(description)dialog.querySelector('.ui-geist-modal-body p')!.textContent=description;
  const cancel:any=dialog.querySelector('[data-modal-cancel]');
  const accept:any=dialog.querySelector('[data-modal-confirm]');
  const failure:any=dialog.querySelector('[data-modal-error]');
  cancel.textContent=cancelLabel;
  accept.textContent=confirmLabel;
  accept.disabled=!!confirmDisabled;
  document.body.append(dialog);
  let settled:{confirmed:boolean;result?:unknown}|null=null,busy=false;
  const done=new Promise<{confirmed:boolean;result?:unknown}>(resolve=>dialog.addEventListener('close',()=>{
    dialog.remove();
    if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus();
    resolve(settled||{confirmed:false});
  },{once:true}));
  cancel.onclick=()=>{if(!busy)dialog.close()};
  dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
  // Clicks on the backdrop land on the <dialog> itself; there is no irreversible action here, so clicking outside to close is allowed.
  dialog.addEventListener('click',event=>{if(event.target===dialog&&!busy)dialog.close()});
  dialog.querySelector('form')!.onsubmit=async event=>{
    event.preventDefault();
    if(busy||accept.disabled)return;
    if(!onConfirm){settled={confirmed:true};dialog.close();return}
    failure.innerHTML='';busy=true;setActionBusy(accept);
    try{
      settled={confirmed:true,result:await onConfirm()};
      dialog.close();
    }catch(error:any){
      failure.innerHTML=noteHtml(error.message||'Action not completed',{variant:'error'});
      setActionBusy(accept,false);
    }finally{busy=false}
  };
  dialog.showModal();
  attachOverlayScrollbar(dialog.querySelector<HTMLElement>('.ui-geist-modal-body'));
  playUiSound('pop');
  (dialog.querySelector<HTMLElement>('.ui-geist-modal-fields input:not([type="checkbox"])')||accept).focus();
  return {dialog,confirmButton:accept,done,close:()=>dialog.close()};
}

/* Geist Modal: confirmation before a write operation commits.
 *
 * Measured at https://vercel.com/geist/modal (2026-09-04): card 540px wide with 12px radius, 10px side margins on narrow
 * screens, body 20px padding at 14px/20px, title a 20px/26px 600-weight h3, bottom action bar 12px padding stuck to the
 * bottom and justified between, buttons 32px tall with 6px radius at 14px/500, and a pure black mask without blur.
 * The title is a statement, not a question; the primary button is "verb + noun" sharing the title's verb, and the cancel key
 * just says "Cancel"; the success Toast reuses that verb.
 *
 * Carried by a native <dialog>: focus trap, Escape, background inert, and returning focus to the trigger on close all come
 * from it; rebuilding them by hand would lose one or two. When onConfirm fails, the popover stays open with the reason left
 * in place for the retry. */
let modalSeq=0;
export function confirmModal(options:{
  title: string; body: string; confirmLabel: string; cancelLabel?: string; danger?: boolean;
  items?: readonly string[];
  onConfirm?: () => Promise<unknown>;
}):Promise<{confirmed:boolean;result?:unknown}>;
export function confirmModal({title,body,items=[],confirmLabel,cancelLabel='Cancel',onConfirm=null,danger=false}:{
  title?: string; body?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean;
  items?: readonly string[];
  onConfirm?: (()=>unknown)|null;
}={}):Promise<{confirmed:boolean;result?:unknown}>{
  const trigger=document.activeElement;
  const dialog=document.createElement('dialog');
  dialog.className='ui-geist-modal';
  const titleId=`geist-modal-title-${++modalSeq}`;
  dialog.setAttribute('aria-labelledby',titleId);
  dialog.setAttribute('aria-describedby',`${titleId}-body`);
  // An irreversible confirmation is read as an alertdialog: the screen reader announces the title and that consequence line on entry, instead of treating it as a plain dialog (same as BoardUI Modal).
  if(danger)dialog.setAttribute('role','alertdialog');
  dialog.innerHTML=`<header class="ui-geist-modal-header"><h3 id="${titleId}"></h3></header>
    <div class="ui-geist-modal-scroll"><div class="ui-geist-modal-body">
      <p id="${titleId}-body"></p><div data-modal-error></div></div></div>
    <footer class="geist-modal-footer">
      <div><button type="button" class="geist-button" data-modal-cancel></button></div>
      <div><button type="button" class="geist-button primary" data-modal-confirm></button></div>
    </footer>`;
  dialog.querySelector('h3')!.textContent=title as string;
  dialog.querySelector('.ui-geist-modal-body p')!.textContent=body as string;
  let list: HTMLUListElement | null = null;
  if(items.length){
    const host=document.createElement('div');
    host.className='ui-geist-modal-list';
    list=document.createElement('ul');
    list.setAttribute('aria-label','Selected records');
    list.tabIndex=0;
    for(const text of items){
      const item=document.createElement('li');
      item.textContent=text;
      list.append(item);
    }
    host.append(list);
    dialog.querySelector('[data-modal-error]')!.before(host);
  }
  const cancel:any=dialog.querySelector('[data-modal-cancel]');
  const accept:any=dialog.querySelector('[data-modal-confirm]');
  if(danger){accept.classList.remove('primary');accept.classList.add('danger')}
  const failure:any=dialog.querySelector('[data-modal-error]');
  cancel.textContent=cancelLabel;
  accept.textContent=confirmLabel;
  document.body.append(dialog);
  return new Promise(resolve=>{
    let settled:{confirmed:boolean;result?:unknown}|null=null;
    let busy=false;
    dialog.addEventListener('close',()=>{
      dialog.remove();
      if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus();
      resolve(settled||{confirmed:false});
    },{once:true});
    cancel.onclick=()=>{if(!busy)dialog.close()};
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault()});
    /* Clicks on the scrim land on the <dialog> itself, clicks in the card land on child elements. This action is undoable,
       and by Geist's criteria outside clicks may close it. */
    dialog.addEventListener('click',event=>{if(event.target===dialog&&!busy&&!danger)dialog.close()});
    accept.onclick=async()=>{
      if(busy)return;
      if(!onConfirm){settled={confirmed:true};dialog.close();return}
      failure.innerHTML='';
      busy=true;
      setActionBusy(accept);
      try{
        settled={confirmed:true,result:await onConfirm()};
        dialog.close();
      }catch(error:any){
        failure.innerHTML=noteHtml(error.message||'Action not completed',{variant:'error'});
        setActionBusy(accept,false);
      }finally{busy=false}
    };
    dialog.showModal();
    attachOverlayScrollbar(dialog.querySelector<HTMLElement>('.ui-geist-modal-body'));
    attachOverlayScrollbar(list);
    playUiSound('pop');
    (danger?cancel:accept).focus();
  });
}
