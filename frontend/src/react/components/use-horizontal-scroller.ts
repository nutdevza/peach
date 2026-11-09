import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';
import { wireHorizontalScroller } from '../../ui-kit/scroll';

/** Horizontal navigation reuses the wheel handling, edge hints and unmount cleanup; refs bind along with the conditionally rendered node. */
export function useHorizontalScroller<T extends HTMLElement>(
  forward?: RefObject<T | null> | ((node: T | null) => void), enabled = true,
) {
  const [host, setHost] = useState<T | null>(null);
  const ref = useCallback((node: T | null) => {
    setHost(node);
    if (typeof forward === 'function') forward(node);
    else if (forward) forward.current = node;
  }, [forward]);
  useLayoutEffect(() => {
    if (!host || !enabled) return;
    host.dataset.horizontalScroll = '';
    const control = wireHorizontalScroller(host);
    return () => {
      control.destroy();
      delete host.dataset.horizontalScroll;
      delete host.dataset.overflowLeft;
      delete host.dataset.overflowRight;
    };
  }, [host, enabled]);
  return ref;
}
