/* The skeleton's delayed reveal: requests under the threshold should not flash a placeholder.
 *
 * What this guards is "every placeholder of the same batch gets the marker". `fitSkeleton` is called repeatedly; grid row-fills and
 * container resizes re-enter, and the second pass always finds some already-armed ones. */
import { describe, expect, it, vi } from 'vitest';

import { fitSkeleton } from '../src/ui-kit';

const placeholder = (root: HTMLElement): HTMLElement => {
  const node = document.createElement('div');
  node.dataset.skeleton = '';
  root.append(node);
  return node;
};

describe('The skeleton appears on delay', () => {
  it('Backfilled placeholders get the waiting mark just like earlier arrivals', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const first = placeholder(root);
    fitSkeleton(root);
    const second = placeholder(root);
    fitSkeleton(root);
    for (const node of [first, second]) {
      expect(node.dataset.skeletonReveal).toBe('pending');
      expect(node.classList.contains('skeleton-awaiting')).toBe(true);
    }
    root.remove();
  });

  it('Past the wait threshold the whole batch appears at once', () => {
    vi.useFakeTimers();
    try {
      const root = document.createElement('div');
      document.body.append(root);
      const first = placeholder(root);
      fitSkeleton(root);
      const second = placeholder(root);
      fitSkeleton(root);
      vi.advanceTimersByTime(200);
      for (const node of [first, second]) {
        expect(node.dataset.skeletonReveal).toBe('shown');
        expect(node.classList.contains('skeleton-awaiting')).toBe(false);
      }
      root.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});
