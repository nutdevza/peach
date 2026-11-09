/* Whether the stuck glass pane has reached the top bar's bottom edge. When it has, the element is marked `data-stuck`, and
 * the stylesheet swaps to the raised shadow tier by it (`[data-filter-glass][data-stuck]` in `../styles.css`).
 *
 * The criteria follow the shell's `updateStickySurfaces`: the page has scrolled and the element's top edge reached its own
 * `top` line. Scroll and resize each compose one frame before measuring; the attribute is written directly on the element,
 * not through React state: re-rendering the whole overlay every frame of scrolling is meaningless. */
import { useEffect, type RefObject } from 'react';

export function useStuck(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top = parseFloat(getComputedStyle(element).top);
      const stuck = window.scrollY > 0 && Number.isFinite(top)
        && element.getBoundingClientRect().top <= top + 1;
      element.toggleAttribute('data-stuck', stuck);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener('scroll', schedule);
      removeEventListener('resize', schedule);
    };
  }, [ref]);
}
