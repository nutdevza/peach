/* Skeleton shimmer sweeps only while visible.
 *
 * The shimmer is a `transform` animation on a `::after` (`skeleton-sweep` in `web/css/09-skeleton.css`). Lazy images that
 * never arrive offscreen keep the frame's shimmer sweeping: the home strip, people index, the dozens of offscreen cells on
 * the follows page, one animation style invalidation per frame each. A shared intersection observer marks frames
 * `data-sweep`: outside the viewport is `idle` (the stylesheet pauses the animation); after appearing, waiting a full
 * `SWEEP_STALL_MS` in the viewport with the image still missing is `stalled` (the stylesheet removes the animation and lays
 * only the static placeholder face). Callers call `releaseSweep` when the image arrives or fails. */

export const SWEEP_STALL_MS = 10_000;

const stallTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
let sight: IntersectionObserver | null = null;

function observer(): IntersectionObserver | null {
  if (sight || typeof IntersectionObserver !== 'function') return sight;
  sight = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!target.isConnected) { releaseSweep(target); continue; }
      const box = target as HTMLElement;
      if (box.dataset.sweep === 'stalled') continue;
      if (!isIntersecting) {
        box.dataset.sweep = 'idle';
        clearTimeout(stallTimers.get(box)); stallTimers.delete(box);
        continue;
      }
      delete box.dataset.sweep;
      // The clock starts only once it is visible: lazy images queued off screen have not started downloading, so they cannot count as timed out.
      if (!stallTimers.has(box)) stallTimers.set(box, setTimeout(() => {
        stallTimers.delete(box);
        if (box.isConnected) box.dataset.sweep = 'stalled';
      }, SWEEP_STALL_MS));
    }
  });
  return sight;
}

/** Start tending one shimmering box: paused while off screen, and after waiting too long once visible it becomes a static placeholder. */
export function gateSweep(box: Element): void {
  observer()?.observe(box);
}

/** The framed content arrived or is confirmed unreachable: stop watching and clear the marker. */
export function releaseSweep(box: Element): void {
  sight?.unobserve(box);
  clearTimeout(stallTimers.get(box));
  stallTimers.delete(box);
  if ((box as HTMLElement).dataset?.sweep) delete (box as HTMLElement).dataset.sweep;
}
