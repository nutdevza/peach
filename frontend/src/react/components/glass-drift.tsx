/* The two drifting reflections on glass surfaces. Painting and path live in `web/board.css`'s `[data-glass-drift]`: a canvas
 * twice the size moves by `transform`, and the host's own two background light blobs fold away with it. It shows only inside
 * hosts carrying glass material like `[data-glass-pane]`; placed last among the host's children so it does not disturb the
 * earlier children's `:first-child`-style matches. */
export function GlassDrift() {
  return <span data-glass-drift="" aria-hidden="true"><span data-drift="b"><span /></span><span data-drift="a"><span /></span></span>;
}
