/* The image in the card's cover cell (`[data-media-art]`).
 *
 * The image is an HTML fragment assembled by the legacy layer, and after load the shell re-frames and swaps the derived tier
 * for the original on the same `<img>` (see `../catalog-grid/artwork.ts`). The large-image and small-image fragments differ
 * only in framing class names, and rewriting by whole fragment would replace every image with a new element: the derived tier
 * re-decodes, framing waits for `load` to recompute, and the whole screen flashes at once. So images are recognized by
 * `identity` (the fragment the same video assembles from its small image): while identity holds, the previous fragment is
 * kept and layout is handed to `relayout` on the same image; only a changed image rewrites the fragment. */
import { useLayoutEffect, useRef, useState } from 'react';

/* 片段里的图不经 React，`onError` 挂不上；`onFailed` 在格子上按捕获阶段接住子图的 `error`，
   交出取失败的那个地址。 */
export function ArtSlot({ artwork, identity = artwork.html, relayout, onFailed }: {
  artwork: { kind: string; html: string };
  identity?: string;
  relayout?(root: HTMLElement): void;
  onFailed?(src: string): void;
}) {
  const [kept, keep] = useState({ identity, artwork });
  if (kept.identity !== identity) keep({ identity, artwork });
  const shown = kept.identity === identity ? kept.artwork : artwork;
  const slot = useRef<HTMLSpanElement>(null);
  const latest = useRef(relayout);
  latest.current = relayout;
  // Every segment change is handed to the shell for comparison: it judges by the layout it has recorded, and does nothing when the layout matches.
  useLayoutEffect(() => {
    if (slot.current) latest.current?.(slot.current);
  }, [artwork.html]);
  const failed = useRef(onFailed);
  failed.current = onFailed;
  useLayoutEffect(() => {
    const node = slot.current;
    if (!node) return;
    const listen = (event: Event) => {
      if (event.target instanceof HTMLImageElement) failed.current?.(event.target.getAttribute('src') || '');
    };
    node.addEventListener('error', listen, true);
    return () => node.removeEventListener('error', listen, true);
  }, []);
  return <span ref={slot} data-media-art={shown.kind} dangerouslySetInnerHTML={{ __html: shown.html }} />;
}
