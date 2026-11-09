import { useCallback, type ComponentPropsWithoutRef } from 'react';
import { fitSkeleton } from '@peach/legacy/ui';
import { RiVideoLine } from '@remixicon/react';
import { ButtonLink } from '@/components/base/buttons/button';
import { EmptyState } from './empty-state';
import { RetryNote } from './grid-reveal';

/** The recommendation band for both detail kinds: title, horizontal scroll, and skeleton placeholder share one implementation. */
export function RelatedSection({ children, wireDrag, busy, empty, error, onRetry, online = false, ...attrs }: ComponentPropsWithoutRef<'div'> & {
  wireDrag(row: Element): void; busy?: boolean; empty?: boolean; error?: string; onRetry?: () => void; online?: boolean;
}) {
  const row = useCallback((node: HTMLDivElement | null) => {
    if (node) { fitSkeleton(node); wireDrag(node) }
  }, [wireDrag]);
  return <div {...attrs} data-item-related="" aria-busy={busy || undefined}>
    <h3 className="font-semibold">Continue watching</h3>
    {error ? <div data-related-state=""><RetryNote message={error} onRetry={onRetry || (() => {})} /></div>
      : empty && !busy ? <div data-related-state=""><EmptyState size="compact" icon={RiVideoLine} title="Nothing to continue watching yet"
        actions={<ButtonLink size="small" href={online ? '/follow' : '/'}>{online ? 'Back to follows' : 'Browse library'}</ButtonLink>}>
        You can go back to the list to pick another video.
      </EmptyState></div>
      : <div ref={row} id="nrow" data-related-row="">{children}</div>}
  </div>;
}
