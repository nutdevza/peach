/* One glyph from the sprite, written like the legacy layer's `icon()` (`src/core/index.ts`): size and stroke come from the stylesheet by position. */
import { iconGeometry } from '../../core/icon-geometry';

export function Icon({ name }: { name: string }) {
  const {wide,viewBox} = iconGeometry(name);
  return <svg viewBox={viewBox} className={wide ? 'iconwide' : undefined} aria-hidden="true"><use href={`#i-${name}`} /></svg>;
}

/* The settings section row is taken from Remix: its line condition draws with `fill`, not stroke. The site-wide default
   `stroke:currentColor;fill:none` would make it vanish entirely, so `settings-panel.css` writes the reverse for this left-column set. */
export function RemixIcon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><use href={`#${name}`} /></svg>;
}
