import { afterEach, expect, it, vi } from 'vitest';
import { wireTableScroller } from '../src/ui-kit/scroll';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); document.body.replaceChildren(); vi.restoreAllMocks() });

function fixture() {
  const viewport = document.createElement('div');
  viewport.innerHTML = '<table><tbody><tr><td>Content</td><td><button>Action</button><input type="checkbox"><a href="#">Link</a><label>Select</label><div class="react-aria-ColumnResizer"></div></td></tr></tbody></table>';
  document.body.append(viewport);
  Object.defineProperties(viewport, { clientWidth: { get: () => 200 }, scrollWidth: { get: () => 900 } });
  const control = wireTableScroller(viewport);
  cleanups.push(() => control.destroy());
  return viewport;
}

function mouse(target: EventTarget, type: string, clientX: number, extra: MouseEventInit = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX, ...extra });
  // happy-dom does not derive pageX from clientX; the fixture fills in the browser coordinates.
  Object.defineProperty(event, 'pageX', { value: clientX });
  target.dispatchEvent(event); return event;
}

it('Dragging scrolls the table and swallows the click the drag produces, while normal clicks are kept', () => {
  const viewport = fixture(), cell = viewport.querySelector('td')!;
  const clicked = vi.fn(); cell.addEventListener('click', clicked);
  mouse(cell, 'mousedown', 180); mouse(window, 'mousemove', 80); mouse(window, 'mouseup', 80);
  expect(viewport.scrollLeft).toBe(100);
  expect(mouse(cell, 'click', 80).defaultPrevented).toBe(true);
  expect(clicked).not.toHaveBeenCalled();
  mouse(cell, 'mousedown', 80); mouse(window, 'mouseup', 80); mouse(cell, 'click', 80);
  expect(clicked).toHaveBeenCalledOnce();
});

it('Table controls, column width handles, and modifier keys never trigger dragging; the wheel keeps browser default behavior', () => {
  const viewport = fixture();
  for (const target of viewport.querySelectorAll('button,input,a,label,.react-aria-ColumnResizer')) {
    mouse(target, 'mousedown', 180); mouse(window, 'mousemove', 80); mouse(window, 'mouseup', 80);
    expect(viewport.scrollLeft).toBe(0);
  }
  mouse(viewport.querySelector('td')!, 'mousedown', 180, { shiftKey: true });
  mouse(window, 'mousemove', 80); mouse(window, 'mouseup', 80);
  expect(viewport.scrollLeft).toBe(0);
  const wheel = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
  viewport.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
  expect(viewport.scrollLeft).toBe(0);
});

it('Both window blur and component teardown end the drag', () => {
  const viewport = fixture(), cell = viewport.querySelector('td')!;
  mouse(cell, 'mousedown', 180); mouse(window, 'mousemove', 150);
  window.dispatchEvent(new Event('blur'));
  mouse(window, 'mousemove', 80);
  expect(viewport.scrollLeft).toBe(30);
  cleanups.splice(0).forEach(cleanup => cleanup());
  mouse(cell, 'mousedown', 180); mouse(window, 'mousemove', 20);
  expect(viewport.scrollLeft).toBe(30);
});

it('After releasing outside the table, the next mouse or keyboard action can activate the control directly', () => {
  const viewport = fixture(), cell = viewport.querySelector('td')!, button = viewport.querySelector('button')!;
  const clicked = vi.fn(); button.addEventListener('click', clicked);
  const dragOutside = () => { mouse(cell, 'mousedown', 180); mouse(window, 'mousemove', 80); mouse(window, 'mouseup', 80) };
  dragOutside();
  mouse(button, 'mousedown', 80); mouse(window, 'mouseup', 80); mouse(button, 'click', 80);
  expect(clicked).toHaveBeenCalledTimes(1);
  dragOutside();
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  button.click();
  expect(clicked).toHaveBeenCalledTimes(2);
});
