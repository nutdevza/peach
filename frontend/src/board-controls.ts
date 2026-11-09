import { moveGlidePane } from '@peach/legacy/ui';
import { initBoardTooltip } from './board-tooltip';

/** The shared presentation layer for Board controls; range inputs keep the browser's native keyboard semantics. */
export function syncBoardRange(input: HTMLInputElement) {
  const min=Number(input.min)||0,max=Number(input.max)||100,value=Number(input.value);
  const percent=max>min?Math.max(0,Math.min(100,(value-min)/(max-min)*100)):0;
  input.style.setProperty('--board-range-value',`${percent}%`);
}

const boardDocuments = new WeakSet<Document>();
export function initBoardControls() {
  if(boardDocuments.has(document))return;
  boardDocuments.add(document);
  const scan=(root:ParentNode)=>{root.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(syncBoardRange);wireBoardSegments(root);wireBoardTabs(root)};
  scan(document);
  const observer=new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element){if(node.matches('input[type=range]'))syncBoardRange(node as HTMLInputElement);scan(node)}});
  observer.observe(document.body,{subtree:true,childList:true});
  document.addEventListener('input',event=>{if(event.target instanceof HTMLInputElement&&event.target.type==='range')syncBoardRange(event.target)});
  initBoardTooltip();
}

/** Page navigation only syncs the visible position; the selected state is painted by the shared style. */
export function wireBoardTabs(root:ParentNode){
  const selector='.ui-board-local-nav:not([data-section-nav])';
  const groups=[...root.querySelectorAll<HTMLElement>(selector)];
  if(root instanceof HTMLElement&&root.matches(selector))groups.push(root);
  groups.forEach(group=>{
    if(group.hasAttribute('data-board-tabs'))return;group.dataset.boardTabs='true';
    const measure=()=>{const selected=group.querySelector<HTMLElement>('button[aria-selected=true],button[aria-pressed=true]');if(!selected||!selected.offsetWidth)return;const left=selected.offsetLeft,right=left+selected.offsetWidth;if(left<group.scrollLeft)group.scrollLeft=left;else if(right>group.scrollLeft+group.clientWidth)group.scrollLeft=right-group.clientWidth};
    measure();
    const mutation=new MutationObserver(measure);mutation.observe(group,{subtree:true,attributes:true,attributeFilter:['aria-selected','aria-pressed']});
    const resize=new ResizeObserver(()=>{if(!group.isConnected){resize.disconnect();mutation.disconnect();return}measure()});resize.observe(group);
  });
}

const segmentPositions=new Map<string,{x:number;y:number;w:number;h:number}>();
/** Native radios keep arrow-key semantics, and the selected backing slides by actual dimensions.
    The panel-switching groups are `role=tablist`: the slider finds the current item by `aria-selected` instead, keeping ARIA as Tabs
    controlling tabpanel, not rewritten as radiogroup just to look like a segmented control. */
export function wireBoardSegments(root:ParentNode) {
  const selector='.iconswitch,.insightswitch,.follow-workspace-switch';
  const groups=[...root.querySelectorAll<HTMLElement>(selector)];
  if(root instanceof HTMLElement&&root.matches(selector))groups.push(root);
  groups.forEach(group=>{
    if(group.hasAttribute('data-board-segments')||group.closest('[data-skeleton]'))return;
    group.dataset.boardSegments='true';
    const thumb=document.createElement('span');thumb.className='board-segment-thumb';thumb.setAttribute('aria-hidden','true');group.prepend(thumb);
    /* The panel swapping places is the same thing as the glass on the filter bar: "the current one" moving from one spot to
       another, so it takes the same motion: slide over, overshoot the landing, settle back.
       Where it last stopped is remembered by this group's identity, not by the node: a click often re-renders the whole
       block, and remembering by node would make every click a brand-new panel that places without animating, as if it had
       never moved.
       On a genuine first appearance there is no previous stop, so that one does not animate: a newly appearing panel should
       not fly in from somewhere else. */
    const key=group.className+(group.getAttribute('aria-label')??'');
    let from=segmentPositions.get(key)??null;
    const measure=()=>{
      const selected=group.querySelector<HTMLElement>('label:has(input:checked),button[aria-selected=true]');if(!selected||!selected.offsetWidth)return;
      const box={x:selected.offsetLeft,y:selected.offsetTop,w:selected.offsetWidth,h:selected.offsetHeight};
      moveGlidePane(thumb,from,box,'x');
      from=box;segmentPositions.set(key,box);
    };
    group.addEventListener('change',measure);
    const mutation=new MutationObserver(measure);mutation.observe(group,{subtree:true,attributes:true,attributeFilter:['aria-selected']});
    const resize=new ResizeObserver(()=>{if(!group.isConnected){resize.disconnect();mutation.disconnect();return}measure()});resize.observe(group);
    measure();requestAnimationFrame(()=>group.classList.add('board-segments-ready'));
  });
}
