/* receipts domain controller: this domain's state and actions; startup installs them together through Application's lifecycle. */
import { $, esc, icon, newSeed, seededRank } from '../core';
import { playUiSound } from '../ui-kit/sounds';
import { mountToaster, showToast } from '../react/application-residents';
import { setActionBusy } from '../ui-kit';
export const receiptsState = { toastBody: undefined, toastSeq: undefined, toast: undefined, actionReceipt: undefined, actionFailure: undefined, rollSeed: undefined, seededSample: undefined };



export function installReceipts6() {
mountToaster($('#toasts'),{success:icon('check'),error:icon('circle-alert')});
receiptsState.toastBody = message=>message&&typeof message==='object'&&'html' in message
  ? String(message.html)
  : esc(message&&typeof message==='object'?(message.text??''):message??'');
receiptsState.toastSeq = 0;
receiptsState.toast = (message,{timeout=6000,warn=false,action=null,sound=null}={})=>{
  const id=`toast-${++receiptsState.toastSeq}`;
  const show=(body,alert,duration,next)=>{
    playUiSound(sound||(alert?'error':'success'));
    showToast($('#toasts'),{success:icon('check'),error:icon('circle-alert')},id,{html:body,alert:!!alert,timeout:duration,
      action:next&&!alert?{label:next.label,run:button=>{setActionBusy(button);next.run()}}:null});
  };
  show(receiptsState.toastBody(message),warn,timeout,action);
  /* The result is written on the same toast (same id). "Dismiss the receipt and post another saying it was undone" would push one out as the other enters in the same
     bottom-aligned stack, which reads as the whole block jumping. */
  return {replaceMessage:(body,{warn:alert=false,timeout:next=4000}={})=>show(receiptsState.toastBody(body),alert,next,null)};
};
receiptsState.actionReceipt = (message,{undo=null,timeout=undo?8000:6000}={})=>{
  let item=null;
  item=receiptsState.toast({text:message},{
    timeout,
    action:undo?{label:'Undo',run:async()=>{
      try{await undo();item.replaceMessage({text:'Undone'})}
      catch(error){item.replaceMessage({text:`Undo failed: ${error.message||'Please retry'}`},{warn:true})}
    }}:null,
  });
  return item;
};
receiptsState.actionFailure = (message,error)=>receiptsState.toast(
  {text:`${message} failed: ${error?.message||'Please retry'}`},{warn:true});
receiptsState.rollSeed = ()=>newSeed();
receiptsState.seededSample = (rows,count,seed,key=row=>row.k)=>{
  if(rows.length<=count)return rows;
  const picked=new Set([...rows]
    .sort((a,b)=>seededRank(seed,key(a))-seededRank(seed,key(b)))
    .slice(0,count).map(key));
  return rows.filter(row=>picked.has(key(row)));
};
}
