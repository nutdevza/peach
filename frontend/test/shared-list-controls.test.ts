import { afterEach, expect, it, vi } from 'vitest';
import { wireHorizontalScroller, rubberBand } from '../src/ui-kit';

afterEach(async () => {document.body.replaceChildren();await new Promise(resolve=>setTimeout(resolve,0));vi.unstubAllGlobals()});
function button(){const node=document.createElement('button');node.style.overflowX='auto';document.body.append(node);return node}

it('A wheel gesture that begins on the horizontal row belongs to the row for its whole life: the mouse walks frames one by one and keeps accumulating mid-gesture, anything it cannot claim goes to the page, and rebinding and removal both release resources', async () => {
  const node=button();let left=0,now=1000;const disconnect=vi.fn();
  vi.stubGlobal('ResizeObserver',class {observe(){}disconnect=disconnect});
  const frames:FrameRequestCallback[]=[];
  vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame',()=>{frames.length=0});
  const step=()=>{now+=16;frames.shift()!(now)};
  const flush=()=>{for(let i=0;i<200&&frames.length;i+=1)step()};
  const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);
  const clamp=(value:number)=>Math.max(0,Math.min(100,value));
  Object.defineProperties(node,{clientWidth:{value:100},scrollWidth:{value:200},scrollLeft:{get:()=>left,set:value=>{left=clamp(value)}}});
  node.animate=(()=>({cancel(){},onfinish:null})) as never;
  const control=wireHorizontalScroller(node,{drag:true});
  expect(wireHorizontalScroller(node)).toBe(control);
  const wheel=(deltaY=100,cancelable=true)=>new WheelEvent('wheel',{deltaY,cancelable});
  // Layouts whose content is directly visible do not block page scrolling and draw no horizontal hint.
  node.style.overflowX='visible';control.update();
  const pageWheel=wheel(60);node.dispatchEvent(pageWheel);
  expect(pageWheel.defaultPrevented).toBe(false);expect(node.dataset.overflowRight).toBe('false');
  node.style.overflowX='auto';control.update();
  // The mouse moves one cell frame by frame, not in one jump.
  const moving=wheel(60);node.dispatchEvent(moving);
  expect(moving.defaultPrevented).toBe(true);expect(left).toBe(0);
  step();expect(left).toBeGreaterThan(0);expect(left).toBeLessThan(60);
  // Add another cell midway and it computes from the previous cell's endpoint, continuing to the end and stopping there.
  now+=40;node.dispatchEvent(wheel(60));flush();
  expect(left).toBe(100);expect(frames).toHaveLength(0);
  // Several scroll events within one frame are coalesced into a single fade-marker write on the next frame.
  node.dispatchEvent(new Event('scroll'));node.dispatchEvent(new Event('scroll'));expect(frames).toHaveLength(1);
  step();expect(node.dataset.overflowRight).toBe('false');
  // Spinning past the end, or spinning again after a pause, is never handed to the page: scrolling the whole page requires moving the pointer out of this row.
  now+=40;const still=wheel(60);node.dispatchEvent(still);expect(still.defaultPrevented).toBe(true);
  now+=1000;const next=wheel(60);node.dispatchEvent(next);expect(next.defaultPrevented).toBe(true);
  expect(left).toBe(100);
  // Small trackpad steps follow the finger directly, with no animation wrapper.
  left=50;now+=1000;node.dispatchEvent(wheel(-10));
  expect(left).toBe(40);expect(frames).toHaveLength(0);
  // A gesture the page has already claimed cannot be stopped, and this row does not move with it.
  left=0;now+=1000;node.dispatchEvent(wheel(100,false));expect(left).toBe(0);
  clock.mockRestore();
  node.remove();await vi.waitFor(()=>expect(disconnect).toHaveBeenCalledOnce());
  left=0;node.dispatchEvent(wheel());expect(left).toBe(0);
});

it('Horizontal overscroll settles with rubber-banding, pushing against an edge bounces too, one wheel gesture bounces once, and dragging past the edge springs back on release', () => {
  expect(rubberBand(0,400)).toBe(0);
  expect(rubberBand(100,400)).toBeGreaterThan(0);expect(rubberBand(100,400)).toBeLessThan(100);
  expect(rubberBand(-100,400)).toBe(-rubberBand(100,400));
  expect(rubberBand(1e6,400)).toBeLessThan(400);
  const node=button();let left=100,now=1000;
  vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
  vi.stubGlobal('matchMedia',()=>({matches:false}));
  const clock=vi.spyOn(performance,'now').mockImplementation(()=>now);
  Object.defineProperties(node,{clientWidth:{value:100},scrollWidth:{value:200},
    scrollLeft:{get:()=>left,set:value=>{left=Math.max(0,Math.min(100,value))}}});
  const animate=vi.fn(()=>({cancel(){},onfinish:null}));node.animate=animate as never;
  wireHorizontalScroller(node,{drag:true});
  const wheel=(deltaY:number)=>new WheelEvent('wheel',{deltaY,cancelable:true});
  // Pushing forward when already at the far right: this cell belongs to the row too, so it nudges left.
  const push=wheel(30);node.dispatchEvent(push);
  expect(push.defaultPrevented).toBe(true);expect(animate).toHaveBeenCalledOnce();
  const [frames]=animate.mock.calls[0] as unknown as [Record<string,string>[]];
  expect(parseFloat(frames[1]!['--edge-pull']!)).toBeLessThan(0);
  // The momentum tail keeps hitting the edge; the same gesture does not bounce again.
  now+=40;node.dispatchEvent(wheel(20));now+=40;node.dispatchEvent(wheel(10));
  expect(animate).toHaveBeenCalledOnce();
  // The next gesture overshoots from mid-scroll and bounces once more.
  left=90;now+=1000;node.dispatchEvent(wheel(30));
  expect(left).toBe(100);expect(animate).toHaveBeenCalledTimes(2);
  // Dragged past the left end: the content follows the finger rightward but travels less; on release it springs back from there.
  // happy-dom's `pageX` is always 0, so it is patched to match the browser.
  const mouse=(type:string,pageX=0)=>Object.defineProperty(new MouseEvent(type,{button:0}),'pageX',{value:pageX});
  left=0;node.dispatchEvent(mouse('mousedown'));
  window.dispatchEvent(mouse('mousemove',80));
  const pulled=parseFloat(node.style.getPropertyValue('--edge-pull'));
  expect(pulled).toBeGreaterThan(0);expect(pulled).toBeLessThan(80);
  expect(node.classList.contains('edgepull')).toBe(true);
  window.dispatchEvent(new MouseEvent('mouseup'));
  expect(node.style.getPropertyValue('--edge-pull')).toBe('');
  expect(animate).toHaveBeenCalledTimes(3);
  clock.mockRestore();
});

it('When holding to drag a horizontal row, the whole page locks to a grabbing cursor; it\'s released on release or window blur; clicking on a control doesn\'t start a drag', () => {
  vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
  const node=document.createElement('div');document.body.append(node);
  const control=document.createElement('button');node.append(control);
  Object.defineProperties(node,{clientWidth:{value:100},scrollWidth:{value:200}});
  wireHorizontalScroller(node,{drag:true,dragIgnore:'button'});
  const dragging=()=>document.documentElement.hasAttribute('data-drag-scrolling');
  node.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));
  expect(dragging()).toBe(true);
  window.dispatchEvent(new MouseEvent('mouseup'));
  expect(dragging()).toBe(false);
  node.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));
  window.dispatchEvent(new Event('blur'));
  expect(dragging()).toBe(false);
  control.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));
  expect(dragging()).toBe(false);
});
