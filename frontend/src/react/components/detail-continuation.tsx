import type { ReactNode } from 'react';

/** Details bottom: the current video's episode queue and the recommendations after it share one row. */
export function DetailContinuation({ queue, children, queueCards }: { queue: ReactNode; children: ReactNode; queueCards?: number }) {
  return <div data-detail-continuation="" data-queue-cards={queueCards == null ? undefined : Math.min(3, queueCards)}>{queue}{children}</div>;
}
