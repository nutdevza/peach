/* One glyph from the sprite sheet (`#i-*` symbols in `web/index.html`), written like the legacy layer's `icon()`: size and stroke
 * are given by `./entity-hero.css` per position. Horizontal site logos (JavDB's is 326:111) let the viewBox follow the
 * symbol's ratio, with the slot sized by height. */
import { iconGeometry } from '../../core/icon-geometry';

export function Glyph({ name }: { name: string }) {
  const {wide,viewBox} = iconGeometry(name);
  return (
    <svg viewBox={viewBox} aria-hidden="true"
      data-glyph={wide ? 'wide' : undefined}>
      <use href={`#i-${name}`} />
    </svg>
  );
}
