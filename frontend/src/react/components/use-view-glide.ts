/* The sliding glass beneath a row of "where am I" keys (the React side; the home and follows pages' rows belong to the shell's
 * `GLIDE_ROWS`).
 *
 * The glass is a resident node: rendered by the component on the overlay root and built once; filter and view changes only
 * move it, never rebuild. Swap the element and the animation starts over, all you see is a teleport. Translation and
 * stretching go to the legacy layer's `moveGlidePane`, the only such motion site-wide; this module only decides "which key it
 * sits on right now":
 *
 * - Pressing slides it to that key immediately (the shell pushes the new pressed state on the spot, and this follows
 *   `pressed`);
 * - Hovering slides it to the key under the pointer, and leaving the row returns it to the pressed one (touch does not
 *   follow);
 * - When the row scrolls horizontally or the window resizes, it only remeasures, no animation;
 * - When the row measures zero width (collapsed by `hidden`, an ancestor `display:none`) or the target scrolled out of view,
 *   the glass collapses.
 *
 * Coordinates take the overlay root (the glass's parent) as origin and subtract each intermediate layer's scroll, same as the
 * shell's `viewGlideGeometry`: the glass lives outside the scrolling layer, so vertical overscroll bounce is not clipped flat
 * by the horizontal-scroll container.
 *
 * The default is a horizontal row of keys; `axis: 'y'` gives a vertical column (sidebar navigation): the translation's bounce
 * moves to the vertical axis, and the scrolled-out-of-view criterion switches to vertical as well. */
import { useCallback, useEffect, useLayoutEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { cancelGlide, moveGlidePane } from '@peach/legacy/ui';

interface Box { x: number; y: number; w: number; h: number }

type Axis = 'x' | 'y';

const sameBox = (first: Box, second: Box) =>
  (['x', 'y', 'w', 'h'] as const).every((side) => first[side] === second[side]);

function geometry(pill: HTMLElement, host: HTMLElement, axis: Axis): Box | null {
  if (!host.contains(pill)) return null;
  let x = 0;
  let y = 0;
  for (let node: HTMLElement | null = pill; node && node !== host; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  const rect = pill.getBoundingClientRect();
  for (let node = pill.parentElement; node && node !== host; node = node.parentElement) {
    x -= node.scrollLeft;
    y -= node.scrollTop;
    const viewport = () => node.getBoundingClientRect();
    if (axis === 'x' && node.scrollWidth > node.clientWidth && getComputedStyle(node).overflowX !== 'visible') {
      const edge = viewport();
      if (rect.right <= edge.left || rect.left >= edge.right) return null;
    }
    if (axis === 'y' && node.scrollHeight > node.clientHeight && getComputedStyle(node).overflowY !== 'visible') {
      const edge = viewport();
      if (rect.bottom <= edge.top || rect.top >= edge.bottom) return null;
    }
  }
  return { x, y, w: pill.offsetWidth, h: pill.offsetHeight };
}

/** `pane` is the glass node, `row` is this row; `pressed` is the selector for the pressed key in this row. When `key` changes
 *  (pressed state changed, the row appeared or collapsed), it animates onto the newly pressed item. The two returned handlers attach to keys and rows;
 *  `sync` covers layout changes this row knows about itself (host resized, something inserted above): it cancels an in-flight glide and re-measures in place. */
export function useViewGlide(
  pane: RefObject<HTMLElement | null>, row: RefObject<HTMLElement | null>, pressed: string, key: unknown,
  { axis = 'x' }: { axis?: Axis } = {},
) {
  const last = useRef<Box | null>(null);
  const place = useCallback((target: HTMLElement | null, animate: boolean) => {
    const glass = pane.current;
    const line = row.current;
    /* The glass is a direct child of the overlay root, and the root is sticky positioned, so the root is its positioning baseline. Do not read `offsetParent`:
       it is null for the collapsed glass item. */
    const host = glass?.parentElement;
    if (!glass) return;
    const active = line && line.offsetWidth ? target ?? line.querySelector<HTMLElement>(pressed) : null;
    const box = active && host ? geometry(active, host, axis) : null;
    if (!box || !box.w || !box.h) {
      cancelGlide(glass);
      glass.hidden = true;
      last.current = null;
      return;
    }
    /* The move from collapsed to visible is the first placement; it does not fly in from the previous stale coordinates. */
    const from = glass.hidden ? null : last.current;
    glass.hidden = false;
    last.current = box;
    /* The same landing point can be reported again during a page-switch fetch, preserving the displacement it is still completing. */
    if (animate && from && sameBox(from, box)) return;
    moveGlidePane(glass, animate ? from : null, box, axis);
  }, [pane, row, pressed, axis]);

  /* No animation on first placement; afterwards it slides whenever the pressed state changes. Runs during layout: the glass is already in position on the first painted frame. */
  const placed = useRef(false);
  useLayoutEffect(() => {
    const glass = pane.current;
    if (glass && !placed.current) glass.hidden = true;
    place(null, placed.current);
    placed.current = true;
  }, [place, key]);

  /* Horizontal scrolling and resizing only re-measure. Scroll events do not bubble, so the overlay root catches scrolling from any layer in this row during the capture phase. */
  useEffect(() => {
    const host = pane.current?.parentElement;
    let frame = 0;
    const remeasure = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; place(null, false) });
    };
    host?.addEventListener('scroll', remeasure, { capture: true, passive: true });
    addEventListener('resize', remeasure, { passive: true });
    /* The overlay can collapse with the page, or gain another set of controls after the fetch. Both size restoration and a neighboring group growing change the landing point. */
    const observer = new ResizeObserver(() => {
      const line = row.current;
      const active = line?.offsetWidth ? line.querySelector<HTMLElement>(pressed) : null;
      const box = active && host ? geometry(active, host, axis) : null;
      const previous = last.current;
      if (!box || !previous || !sameBox(box, previous)) {
        remeasure();
      }
    });
    const line = row.current;
    if (line && host) {
      observer.observe(line);
      for (let node = line.parentElement; node; node = node.parentElement) {
        observer.observe(node);
        for (const child of node.children) {
          if (!child.hasAttribute('data-view-glide')) observer.observe(child);
        }
        if (node === host) break;
      }
    }
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      host?.removeEventListener('scroll', remeasure, { capture: true });
      removeEventListener('resize', remeasure);
    };
  }, [pane, row, place, key]);

  const hover = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') place(event.currentTarget, true);
  }, [place]);
  const leave = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'touch') place(null, true);
  }, [place]);
  const sync = useCallback(() => {
    cancelGlide(pane.current);
    place(null, false);
  }, [pane, place]);
  return { hover, leave, sync };
}
