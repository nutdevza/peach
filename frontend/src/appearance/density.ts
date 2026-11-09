/* Card density: large images first, dense as the alternative. The value lives on its own key (`density`), not in the
 * preferences object.
 *
 * It writes `--tile` (one cell's module width) on <html> and `data-density` on <body>, plus the top bar's size key's
 * (`#density`) pressed state, tooltip and glyph. The shell calls `applyDensity()` synchronously in the module body, so it is
 * written before the first frame. */
import { iconSwapHtml, setIconSwap } from '@peach/legacy/ui';

import { PHOTO_SIZES } from './layout';

export type Density = 'big' | 'dense';
const DENSITY_KEY = 'density';
/** 168px is the module unit; a large image takes two cells. */
export const TILES: Readonly<Record<Density, string>> = { big: '336px', dense: '168px' };

/** When the stored value is not one of the two known tiers, treat it as large images. */
export const currentDensity = (): Density => (localStorage.getItem(DENSITY_KEY) === 'dense' ? 'dense' : 'big');

/* The top bar key and the layout switch in the filter box ask the same question, "which layout is active", so the glyph draws from the same mapping
   (the third element of PHOTO_SIZES), and pressing swaps in the icon for the current state. */
function paintSizeGlyph(button: HTMLElement, size: string): void {
  const [big, small] = PHOTO_SIZES;
  if (!button.querySelector('[data-icon-swap]')) {
    // The drifting light patch layer on the top bar glass (`[data-glass-drift]`) is a child of this key; keep it when swapping the glyph.
    const drift = button.querySelector(':scope > [data-glass-drift]');
    button.innerHTML = iconSwapHtml(big[2], small[2], size === small[0] ? 'b' : 'a');
    if (drift) button.append(drift);
  } else setIconSwap(button, size === small[0] ? 'b' : 'a');
  setAttribute(button, 'aria-label', size === 'big' ? 'Switch to small thumbnails' : 'Switch to large thumbnails');
}

/* Do not rewrite an unchanged value: while the video wall scrolls these run a dozen times a second, and one attribute write on `<body>` re-matches styles across the whole tree. */
function setAttribute(node: HTMLElement, name: string, value: string): void {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

const densityButton = (): HTMLElement | null => document.querySelector<HTMLElement>('#density');

export function applyDensity(density: Density = currentDensity()): void {
  const root = document.documentElement;
  if (root.style.getPropertyValue('--tile') !== TILES[density]) root.style.setProperty('--tile', TILES[density]);
  setAttribute(document.body, 'data-density', density);
  const button = densityButton();
  if (!button) return;
  setAttribute(button, 'aria-pressed', String(density === 'dense'));
  setAttribute(button, 'title', 'Current:' + (density === 'big' ? 'Large images' : 'Dense'));
  paintSizeGlyph(button, density === 'big' ? 'big' : 'small');
}

/** Switch density step, persist it, and apply it on the spot. */
export function toggleDensity(): void {
  const next: Density = currentDensity() === 'big' ? 'dense' : 'big';
  localStorage.setItem(DENSITY_KEY, next);
  applyDensity(next);
}

/** While parked on the photo wall, the same key reports the photo's dimensions. */
export function paintPhotoSizeButton(size: string): void {
  const button = densityButton();
  if (!button) return;
  setAttribute(button, 'aria-pressed', String(size === 'small'));
  setAttribute(button, 'title', 'Current:' + (size === 'big' ? 'Large images' : 'Small images'));
  paintSizeGlyph(button, size);
}
