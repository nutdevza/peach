import { useLayoutEffect, useRef, useState } from 'react';

/** Show the expander against the real title row box. */
export function useFoldedTitle(textKey: string) {
  const text = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [foldable, setFoldable] = useState(false);
  useLayoutEffect(() => {
    const node = text.current;
    if (!node) return;
    const measure = () => { if (!node.hasAttribute('data-expanded')) setFoldable(node.scrollHeight > node.clientHeight + 1) };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [textKey]);
  return { text, expanded, foldable, toggle: () => setExpanded(open => !open) };
}
