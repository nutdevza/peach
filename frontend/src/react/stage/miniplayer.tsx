/* Mini player: the floating block inside the stage surface, outside the `<dialog>`. The player instance is moved in and out
 * by `stage-player.ts`, which also writes play state, time and ratio onto the node directly from player events; this module
 * only renders the skeleton structure once and wires the keys and dragging.
 * The component does not re-render with the stage (`memo` with no props): `hidden`, `data-corner` and `transform` are all
 * changed imperatively, and a re-render would write them back to their initial values. */
import { memo, useEffect, useLayoutEffect, useRef, type MouseEvent } from 'react';

import {
  expandMiniplayer, closeMiniplayer, playMiniplayer, registerMiniplayer, seekMiniplayer,
} from './stage-player';

const Glyph = ({ name }: { name: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><use href={`#i-${name}`} /></svg>
);

/* One icon inside the play key is swapped for two stacked glyphs by `stage-player.ts`, so this cell's children do not belong to React. */
const PLAY_GLYPH = { __html: '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-player-pause"/></svg>' };

const pressed = (run: () => void) => (event: MouseEvent) => { event.stopPropagation(); run() };

export const Miniplayer = memo(function Miniplayer() {
  const root = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const play = useRef<HTMLButtonElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const ahead = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLSpanElement>(null);
  const sub = useRef<HTMLSpanElement>(null);
  const info = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    registerMiniplayer({
      root: root.current!, frame: frame.current!, play: play.current!, time: time.current!, back: back.current!,
      ahead: ahead.current!, title: title.current!, sub: sub.current!, info: info.current!,
    });
    return () => registerMiniplayer(null);
  }, []);

  useEffect(() => wireDrag(root.current!, card.current!), []);
  useEffect(() => publishBottomSpace(root.current!), []);

  return (
    <aside ref={root} data-miniplayer="" id="miniplayer" data-corner="br" aria-label="Mini player" hidden>
      <div ref={card} data-miniplayer-card="" id="miniplayerCard">
        <div ref={frame} data-miniplayer-frame="" id="miniplayerFrame">
          <div data-miniplayer-scrim="">
            <button type="button" data-miniplayer-button="expand" id="miniplayerExpand" aria-label="Expand to details"
              aria-keyshortcuts="i" onClick={pressed(expandMiniplayer)}><Glyph name="maximize-2" /></button>
            <button type="button" data-miniplayer-button="close" id="miniplayerClose" aria-label="Close the mini window"
              onClick={pressed(closeMiniplayer)}><Glyph name="x" /></button>
            <button ref={back} type="button" data-miniplayer-seek="" id="miniplayerBack"
              onClick={pressed(() => seekMiniplayer(-1))}><Glyph name="rotate-ccw" /></button>
            <button ref={play} type="button" data-miniplayer-play="" id="miniplayerPlay" aria-label="Paused" aria-keyshortcuts="k"
              onClick={pressed(playMiniplayer)} dangerouslySetInnerHTML={PLAY_GLYPH} />
            <button ref={ahead} type="button" data-miniplayer-seek="" id="miniplayerAhead"
              onClick={pressed(() => seekMiniplayer(1))}><Glyph name="rotate-cw" /></button>
            <span ref={time} className="mono" data-miniplayer-time="" id="miniplayerTime">0:00 / 0:00</span>
          </div>
        </div>
        <button ref={info} type="button" data-miniplayer-info="" id="miniplayerInfo" aria-label="Expand to details"
          onClick={() => expandMiniplayer()}>
          <span ref={title} data-miniplayer-title="" id="miniplayerTitle" />
          <span ref={sub} data-miniplayer-sub="" id="miniplayerSub" />
        </button>
      </div>
    </aside>
  );
});

/* When the mini player sits in one of the bottom corners and is on the same side as the bottom-right notification stack, it writes its occupied height into `--miniplayer-space`,
   so the notification stack (`../toaster.tsx`) lands above its top edge, not covering the picture. On phones the notification stack fills the whole row, so both bottom corners count.
   `hidden` and `data-corner` are changed imperatively, so watch the attribute changes rather than relying on repaints. */
function publishBottomSpace(root: HTMLElement): () => void {
  const measure = () => {
    const corner = root.dataset.corner || '';
    const below = !root.hidden && corner.startsWith('b') && (corner === 'br' || innerWidth <= 600);
    if (below) document.documentElement.style.setProperty('--miniplayer-space', `${Math.ceil(root.offsetHeight + 16 + 12)}px`);
    else document.documentElement.style.removeProperty('--miniplayer-space');
  };
  const attributes = new MutationObserver(measure);
  attributes.observe(root, { attributes: true, attributeFilter: ['hidden', 'data-corner'] });
  const size = new ResizeObserver(measure);
  size.observe(root);
  window.addEventListener('resize', measure);
  measure();
  return () => {
    attributes.disconnect(); size.disconnect();
    window.removeEventListener('resize', measure);
    document.documentElement.style.removeProperty('--miniplayer-space');
  };
}

/* Dragging only changes transform; on release, pick the corner by which quadrant the mini player's center landed in, then snap over with a .5s transform transition, and after the transition
   swap data-corner to the new corner and clear the transform; upstream AnimatingSnap settles back to its anchor the same way. */
function snap(root: HTMLElement, dx: number, dy: number): void {
  const rect = root.getBoundingClientRect();
  const corner = (rect.top + rect.height / 2 < innerHeight / 2 ? 't' : 'b') + (rect.left + rect.width / 2 < innerWidth / 2 ? 'l' : 'r');
  const topInset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--topH')) || 56;
  const base = { left: rect.left - dx, top: rect.top - dy };
  const target = {
    left: corner.endsWith('l') ? 16 : innerWidth - 16 - rect.width,
    top: corner.startsWith('t') ? topInset + 16 : innerHeight - 16 - rect.height,
  };
  root.removeAttribute('data-miniplayer-drag');
  const finish = () => {
    root.removeAttribute('data-miniplayer-snap');
    root.style.transition = 'none'; root.dataset.corner = corner; root.style.transform = '';
    root.getBoundingClientRect(); root.style.transition = '';
  };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return }
  root.setAttribute('data-miniplayer-snap', '');
  root.style.transform = `translate(${target.left - base.left}px,${target.top - base.top}px)`;
  let done = false;
  const once = () => { if (done) return; done = true; root.removeEventListener('transitionend', once); finish() };
  root.addEventListener('transitionend', once);
  setTimeout(once, 600);
}

function wireDrag(root: HTMLElement, card: HTMLElement): () => void {
  let drag: { id: number; x: number; y: number; dx: number; dy: number; moved: boolean } | null = null;
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || (event.target as Element).closest('[data-miniplayer-button],[data-miniplayer-play],[data-miniplayer-seek],.vjs-control-bar')) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, moved: false };
    try { card.setPointerCapture(event.pointerId) } catch { /* The pointer is already gone */ }
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag.dx = event.clientX - drag.x; drag.dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(drag.dx, drag.dy) < 4) return;
    if (!drag.moved) { drag.moved = true; root.setAttribute('data-miniplayer-drag', ''); root.removeAttribute('data-miniplayer-snap') }
    root.style.transform = `translate(${drag.dx}px,${drag.dy}px)`;
  };
  const release = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const done = drag; drag = null;
    try { card.releasePointerCapture(event.pointerId) } catch { /* The pointer is already gone */ }
    if (!done.moved) return;
    // Release after a drag is followed by a click that would land on the info bar as "expand"; this one does not count.
    root.dataset.dragged = '1'; setTimeout(() => { delete root.dataset.dragged }, 0);
    snap(root, done.dx, done.dy);
  };
  const click = (event: Event) => { if (root.dataset.dragged) { event.stopPropagation(); event.preventDefault() } };
  /* The initial mousedown does not take the browser default: otherwise by the second frame Chrome starts a native drag from the cover image of the card under the mini player,
     then fires pointercancel and the mini player stays where it was. */
  const hold = (event: Event) => { if (drag) event.preventDefault() };
  card.addEventListener('pointerdown', down);
  card.addEventListener('mousedown', hold);
  card.addEventListener('pointermove', move);
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);
  card.addEventListener('click', click, true);
  return () => {
    card.removeEventListener('pointerdown', down);
    card.removeEventListener('mousedown', hold);
    card.removeEventListener('pointermove', move);
    card.removeEventListener('pointerup', release);
    card.removeEventListener('pointercancel', release);
    card.removeEventListener('click', click, true);
  };
}
