/* Glyphs from the legacy sprite (`#i-*` symbols in `web/index.html`), wrapped as components shaped like the Remix icons.
 *
 * First-screen skeletons are rendered by the legacy layer, so their glyphs come from the sprite; on takeover they switch to
 * the closest-shaped Remix icons, and that row would jump at the swap (square check to round check, one file stack to two
 * pages). So any glyph that appeared in the skeleton keeps the same one after takeover. Size is given by the host (BoardUI
 * `Button` passes `size-*` per tier).
 *
 * Wide glyphs ("Aa" is 1.4:1) take their viewBox from the symbol's ratio, the same shared geometry as the legacy layer's
 * `icon()`; the host decides height and the glyph's ratio decides width. */
import type { ComponentType } from 'react';
import { iconGeometry } from '../../core/icon-geometry';

export type Glyph = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

const cache = new Map<string, Glyph>();

export function spriteGlyph(name: string): Glyph {
  const known = cache.get(name);
  if (known) return known;
  const {wide,viewBox} = iconGeometry(name);
  const Sprite: Glyph = wide
    ? ({ className }) => (
      <svg aria-hidden viewBox={viewBox}
        className={`iconwide shrink-0 fill-current ${className ?? 'h-4 w-auto'}`}>
        <use href={`#i-${name}`} />
      </svg>
    )
    : ({ className }) => (
      <svg aria-hidden viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round"
        className={`shrink-0 stroke-current stroke-2 ${className ?? 'size-4'}`}>
        <use href={`#i-${name}`} />
      </svg>
    );
  Sprite.displayName = `SpriteGlyph(${name})`;
  cache.set(name, Sprite);
  return Sprite;
}
