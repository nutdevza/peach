/* The card grid's waiting and failure states: how the shell's skeleton exits and what a failed fetch leaves behind. Shared by the library card grid and the junk files queue. */
import { useEffect, useLayoutEffect, useRef, useState, type AnimationEvent, type MouseEvent } from 'react';
import { fitSkeleton, noteHtml } from '@peach/legacy/ui';

/** How far ahead of the next-page sentinel the next segment starts loading: one screen tall (percentages against an implicit root use the viewport). One catalog page is a 150-250ms
 *  request plus a few hundred ms of rendering; with only a few hundred pixels of lead, every page of continuous scrolling waits at the bottom. */
export const LOAD_MORE_MARGIN = '100% 0px';

/** The skeleton and its exit. The skeleton layer becomes a fading layer in place once data arrives: the same element, the
 *  same HTML, React does not rewrite it, and the cards `fitSkeleton` filled in stay too. A skeleton that has not reached its
 *  display threshold (`fitSkeleton` keeps `.skeleton-awaiting` on it) but whose data already arrived is removed directly,
 *  without playing an exit for a placeholder that was never seen.
 *
 *  `layer` sits in the first cell of the `[data-grid-reveal]` container, and the container carries that attribute while
 *  `fading` is true. */
export function useSkeletonReveal(pending: boolean, skeletonHtml: () => string) {
  const [phase, setPhase] = useState<'skeleton' | 'fade' | 'none'>(pending ? 'skeleton' : 'none');
  const [markup] = useState(() => (pending ? skeletonHtml() : ''));
  const node = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => { if (node.current) fitSkeleton(node.current) }, []);
  useLayoutEffect(() => {
    if (pending || phase !== 'skeleton') return;
    const seen = !!node.current && !node.current.querySelector('.skeleton-awaiting');
    setPhase(seen ? 'fade' : 'none');
  }, [pending]);
  /* Also tear down when the animation end event is lost (tab in the background, element taken over by another animation), the same 1 s fallback as the legacy layer. */
  useEffect(() => {
    if (phase !== 'fade') return undefined;
    const timer = setTimeout(() => setPhase('none'), 1000);
    return () => clearTimeout(timer);
  }, [phase]);
  const done = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) setPhase('none');
  };
  const layer = phase === 'none' ? null : (
    <div ref={node} data-grid-fade={phase === 'fade' ? '' : undefined} aria-hidden={pending ? undefined : true}
      hidden={!pending && phase === 'skeleton'} onAnimationEnd={done}
      dangerouslySetInnerHTML={{ __html: markup }} />
  );
  return { layer, fading: phase === 'fade' };
}

/** Failures stay in place with a retry chip. The Note is assembled by the legacy `noteHtml`, the same one as failure notices elsewhere in the shell. */
export function RetryNote({ message, onRetry }: { message: string; onRetry: () => void }) {
  const click = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('[data-note-action]')) onRetry();
  };
  return (
    <div data-media-error="" onClick={click}
      dangerouslySetInnerHTML={{ __html: noteHtml(message, { variant: 'error', actionLabel: 'Retry now' }) }} />
  );
}
