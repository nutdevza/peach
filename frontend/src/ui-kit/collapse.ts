/**
 * Geist Collapse: a native `<details>` does not transition height, so everything but the summary is wrapped in
 * `.ui-fcollapse`, and open/close measures `scrollHeight` and writes an inline `height` to make it transition.
 * (`::details-content` was tried; that path swallows the content and was abandoned.)
 *
 * The same `details` is wired only once, and calling again after a re-render is safe.
 */
export function wireCollapse(
  root: ParentNode | null | undefined, selector: string, idPrefix: string, triggerSelector = 'summary',
): void {
  root?.querySelectorAll<HTMLDetailsElement>(selector).forEach((details,index)=>{
    if(details.querySelector(':scope > .ui-fcollapse'))return;
    const body=document.createElement('div');body.className='ui-fcollapse';
    /* Padding goes on the inner .fcollapsebody: .ui-fcollapse itself carries no padding so height can truly
       transition to 0, otherwise border-box would catch on the padding and the collapse end would jump. */
    const inner=document.createElement('div');inner.className='fcollapsebody';
    [...details.children].forEach(child=>{
      if(child.tagName==='SUMMARY')return;
      inner.appendChild(child);
    });
    body.appendChild(inner);details.appendChild(body);
    const summary=details.querySelector(triggerSelector)!;
    if(triggerSelector!=='summary')details.querySelector('summary')!.addEventListener('click',event=>event.preventDefault());
    let expanded=details.open;
    body.id=`${idPrefix}-${index}`;
    body.inert=!expanded;
    /* Height transitions need `overflow:hidden`, yet while expanded and idle it still clips; the last row of cards' shadow
       lands just past the bottom edge and gets half-cut, reading as an unfinished column. Once the transition ends (or it started expanded),
       remove the clip; on collapse, put it back first, otherwise content stays exposed while the height goes to 0. */
    if(expanded)body.classList.add('ui-fcollapse-settled');
    summary.setAttribute('aria-controls',body.id);
    summary.setAttribute('aria-expanded',String(expanded));
    summary.addEventListener('click',event=>{
      event.preventDefault();
      expanded=!expanded;
      summary.setAttribute('aria-expanded',String(expanded));
      setCollapseOpen(details,body,expanded);
    });
  });
}

/**
 * Open a Collapse to or collapse it to `expanded`; `body` is the container after summary, and `.ui-fcollapse` is attached here.
 * Shared by `wireCollapse`, the React settings page's `Disclosure`, and sidebar groups; when re-clicked in the opposite direction mid-transition, the previous finish is skipped.
 */
const collapseRuns=new WeakMap<HTMLElement,number>();
export function setCollapseOpen(details: HTMLDetailsElement, body: HTMLElement, expanded: boolean): void {
  transitionCollapse(body,expanded,()=>details.open,open=>{details.open=open});
}

/** The collapsible body driven by an external button shares the height transition and reverse-click protection with the native details element. */
export function setCollapseRegionOpen(body: HTMLElement, expanded: boolean): void {
  transitionCollapse(body,expanded,()=>!body.hidden,open=>{body.hidden=!open});
}

function transitionCollapse(body: HTMLElement, expanded: boolean, visible: () => boolean, show: (open: boolean) => void): void {
  body.classList.add('ui-fcollapse');
  const run=(collapseRuns.get(body)||0)+1;collapseRuns.set(body,run);
  const isCurrent=()=>collapseRuns.get(body)===run;
  if(expanded){
    body.inert=false;
    const start=visible()?body.getBoundingClientRect().height:0;
    show(true);
    growCollapse(body,start,isCurrent);
  }else{
    body.inert=true;body.classList.remove('ui-fcollapse-settled');
    body.style.height=body.getBoundingClientRect().height+'px';body.getBoundingClientRect();
    body.style.height='0px';
    settleHeight(body,()=>{if(isCurrent()){show(false);body.style.height=''}});
  }
}

/* Finalize only after the height transition completes; with reduced motion there is no transitionend, hence the 260 ms fallback. */
function settleHeight(body: HTMLElement, fn: () => void): void {
  let done=false,timer:ReturnType<typeof setTimeout>|undefined;
  const finish=(e?:TransitionEvent)=>{
    if(e&&e.propertyName!=='height')return;
    if(done)return;done=true;
    body.removeEventListener('transitionend',finish);clearTimeout(timer);
    fn();
  };
  body.addEventListener('transitionend',finish);
  timer=setTimeout(finish,260);
}

/**
 * `.ui-fcollapse` grows from `start` to the content's current height, then hands back `auto` and removes the clip on completion. Shared by Collapse expansion and
 * the sidebar list's unfold. `isCurrent` returning false means it was collapsed again mid-way, and the finish is skipped.
 */
export function growCollapse(body: HTMLElement, start: number, isCurrent: () => boolean = ()=>true): void {
  body.classList.remove('ui-fcollapse-settled');
  body.style.height=start+'px';body.getBoundingClientRect();
  body.style.height=body.scrollHeight+'px';
  settleHeight(body,()=>{if(isCurrent()){body.style.height='auto';body.classList.add('ui-fcollapse-settled')}});
}
