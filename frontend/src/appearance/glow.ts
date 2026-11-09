/* Painting glow, glass surfaces and the accent color onto the page, plus the few color-scheme clicks.
 *
 * How glow is computed and painted lives in `./home-glow.ts`: that file knows nothing of the preferences object; this module
 * passes in the current settings and the target element. The sidebar's layer writes to the empty `.glowlayer` div rather than
 * <html>: custom properties inherit, so writing at the root recalculates styles for the whole tree, measured at around 15ms
 * per frame, which blows the frame budget during drags; the measurement and numbers are recorded above that rule in
 * web/css/01-base.css. One write per frame: a pointer drag can emit hundreds of pointermove events a second; queued into
 * requestAnimationFrame, what gets written is the copy this frame actually paints.
 *
 * The other glass panes (search box, top bar icon buttons, filter overlays, the settings card's section nav, media library and
 * color popovers, narrow rail, selection toolbar) are scattered across the tree with no common host, so their two reflections'
 * hues can only be written at the root. One root write is a whole-tree style recalc, so that path only takes preset changes,
 * color picks and toggles. Same for the accent color: one click writes one attribute and, in exchange, every button, focus
 * ring and link on the page follows along. */
import {
  ACCENTS, DEFAULT_ACCENT, DEFAULT_HOME_GLOW, HOME_GLOW_PRESETS, HOME_GLOW_SPOTS, glowAccent, glowChipFill, glowPalette,
  isNativeGlass, normalizeAccent, paintGlassFaces, paintHomeGlow, type HomeGlow,
} from './home-glow';

import type { SettingsStore } from '../settings-store';
import { appSettingsStore } from './settings';

/** The two items this layer reads and writes; the store has other fields. */
export interface GlowSettings { homeGlow: HomeGlow; accent: string }
type GlowStore = SettingsStore<GlowSettings>;

/** The sidebar glow layer is written once on the spot. Startup takes this path before the first frame. */
export function paintHomeGlowNow(store: GlowStore = appSettingsStore()): void {
  paintHomeGlow(document.querySelector<HTMLElement>('.glowlayer'), store.value.homeGlow);
}

let glowFrame = 0;
/** Schedules one frame to redraw the sidebar's glow layer; another call within the same frame schedules nothing extra. It reads the settings as of that frame. */
export function applyHomeGlow(store: GlowStore = appSettingsStore()): void {
  if (glowFrame) return;
  glowFrame = requestAnimationFrame(() => { glowFrame = 0; paintHomeGlowNow(store) });
}

export function applyGlassFaces(store: GlowStore = appSettingsStore()): void {
  paintGlassFaces(document.documentElement, store.value.homeGlow);
}

export function applyAccent(store: GlowStore = appSettingsStore()): void {
  document.documentElement.dataset.accent = store.value.accent;
}

/** One swatch in the preset palette. The `native` swatch carries no color; the ball color comes from the stylesheet per current theme. */
export interface GlowChip { key: string; label: string; native: boolean; fill: string }

const chip = (key: string, label: string, colors: readonly string[]): GlowChip =>
  ({ key, label, native: isNativeGlass(key), fill: isNativeGlass(key) ? '' : glowChipFill(colors) });

/* Preset swatches follow feralui's preset chips: three glow colors equally divide a conic-gradient, then BoardUI's three white highlight layers stack on top.
   "Custom" only occupies a slot after the user really hand-tuned colors: before that, the slot holds a ball identical to the default tier, and clicking it
   changes nothing yet reads like an untried tier. */
export function glowChips(glow: HomeGlow): GlowChip[] {
  const chips = HOME_GLOW_PRESETS.map(([key, label, palette]) => chip(key, label, HOME_GLOW_SPOTS.map((spot) => palette[spot].color)));
  if (glow.preset === 'custom') chips.push(chip('custom', 'Custom', HOME_GLOW_SPOTS.map((spot) => glow[spot].color)));
  return chips;
}

/** The accent color row: `[key, name]`. The ball color is picked by the stylesheet via `data-accent-ball`, taking that tier's 400 and 600 shades. */
export const ACCENT_CHOICES = ACCENTS;

/* Picking a glow tier switches the accent color with it: one tier is one face, and a warm glow with buttons still blue reads as two skins stacked.
   The accent row can be used on its own; picking there changes only the accent and leaves the glow alone. Ship one matched pair first, but keep them separable. */
export function chooseGlowPreset(key: string, store: GlowStore = appSettingsStore()): void {
  if (key === 'custom') return;
  const glow = store.value.homeGlow;
  glow.preset = key;
  Object.assign(glow, glowPalette(key));
  store.value.accent = glowAccent(key);
  store.save();
  applyHomeGlow(store); applyGlassFaces(store); applyAccent(store);
}

export function chooseAccent(key: string, store: GlowStore = appSettingsStore()): void {
  store.value.accent = normalizeAccent(key);
  store.save();
  applyAccent(store);
}

/* What resets is the color scheme, not the whole glow: the title says "Glow" and "Accent color", and wiping intensity and grain along with it would read as a mis-press.
   Full restore to defaults lives on the advanced settings screen. */
export function resetGlowColors(store: GlowStore = appSettingsStore()): void {
  const glow = store.value.homeGlow;
  glow.preset = DEFAULT_HOME_GLOW.preset;
  Object.assign(glow, glowPalette(glow.preset));
  store.value.accent = DEFAULT_ACCENT;
  store.save();
  applyHomeGlow(store); applyGlassFaces(store); applyAccent(store);
}

/* The two small dots at the bottom right of the palette button at the sidebar's bottom: the upper one reports the current preset's first glow color, the lower one the accent color. After glow is turned off
   the upper one retracts, leaving only the accent dot; BoardUI's original button dot was the accent color anyway. The "glass native" tier has no glow color
   to report, so it shows the glass's own two reflection colors, half each; the stylesheet picks by `data-glow-native`. */
export function paintGlowButton(button: HTMLElement, glow: HomeGlow): void {
  button.style.setProperty('--glow-swatch', glow.on ? glow.spot1.color : 'var(--color-accent-500)');
  button.toggleAttribute('data-glow-native', glow.on && isNativeGlass(glow.preset));
  button.toggleAttribute('data-glow-off', !glow.on);
}

/** Paints the button once right away, then follows every persist: the button lives in the shell and must stay aligned with whichever control changed the color scheme. */
export function wireGlowButton(button: HTMLElement, store: GlowStore = appSettingsStore()): () => void {
  paintGlowButton(button, store.value.homeGlow);
  return store.subscribe(() => paintGlowButton(button, store.value.homeGlow));
}
