/* Card layout and photo wall sizing: which tier is stored, which tier is read back, and how a write persists.
 *
 * Home and JAV each store a card layout (`homeLayout` / `javLayout`). "Am I on home or JAV" is a criterion over routing and
 * catalog state, owned by the shell (`javActive` / `homeLayoutActive` in `application/layout.js`); this only receives the
 * booleans it computed. */
import { normalizeJavLayout, type JavLayout } from '../jav-artwork';
import type { SettingsStore } from '../settings-store';
import { allowedSetting, appSettingsStore, type AppSettings } from './settings';

/** `[value, display name, glyph]`: the layout toggle has one set in the settings panel and one in the filter bar's bottom row, both reading this table. */
export const JAV_LAYOUTS: readonly (readonly [value: string, label: string, icon: string])[] = [
  ['big', 'Large images', 'maximize'], ['small', 'Small images', 'layout-grid'],
];
/* The image wall is an equal-width grid; what changes is the column count. Small images by default: a set runs tens to hundreds of shots, so you see the whole set first and open one full size only after picking it. */
type Choice = readonly [value: string, label: string, icon: string];
export const PHOTO_SIZES: readonly [big: Choice, small: Choice] = [
  ['big', 'Large images', 'maximize'], ['small', 'Small images', 'layout-grid'],
];
export const PHOTO_LAYOUTS: readonly (readonly [value: string, label: string, icon: string])[] = [
  ['fixed', 'Fixed ratio', 'layout-grid'], ['masonry', 'Masonry', 'columns-2'],
];
/* Large image cards are fixed at 3:4; a traditional front cover centers in full, aspect gaps get a blur backing from the same image, and the full-size cover is framed on its subject. */
export const COVER_FRONT_RATIO = 0.75;

type LayoutSettings = Pick<AppSettings, 'javLayout' | 'homeLayout' | 'photoSize' | 'photoLayout' | 'javImage'>;
type LayoutStore = SettingsStore<LayoutSettings>;
const current = (): LayoutSettings => appSettingsStore().value;

export const javLayout = (settings: LayoutSettings = current()): JavLayout => normalizeJavLayout(settings.javLayout);
export const homeLayout = (settings: LayoutSettings = current()): JavLayout => normalizeJavLayout(settings.homeLayout);
/** The card layout for the current page: the home page reads the home one, everything else reads the JAV one. */
export const cardLayoutFor = (home: boolean, settings: LayoutSettings = current()): JavLayout =>
  home ? homeLayout(settings) : javLayout(settings);

const PHOTO_SIZE_KEYS = PHOTO_SIZES.map(([key]) => key);
const PHOTO_LAYOUT_KEYS = PHOTO_LAYOUTS.map(([key]) => key);
export const photoSize = (settings: LayoutSettings = current()): string => allowedSetting(settings.photoSize, PHOTO_SIZE_KEYS, 'small');
export const photoLayout = (settings: LayoutSettings = current()): string =>
  allowedSetting(settings.photoLayout, PHOTO_LAYOUT_KEYS, 'masonry');

/** The layout for a screen of cards. On paths where `active` is false (tabs, search results...), cards do not split into large and small. */
export interface GridLayout { active: boolean; size: JavLayout; portrait: boolean; javImage: string }

/* Swap in a new object only when it truly changed: cards compare by reference, and a layout object rebuilt every time would make selecting a single card rerender every card on screen. */
let gridLayoutValue: GridLayout | null = null;
export function gridLayout(
  context: { active: boolean; home: boolean; portrait: boolean }, settings: LayoutSettings = current(),
): GridLayout {
  const next: GridLayout = {
    active: context.active, size: cardLayoutFor(context.home, settings), portrait: context.portrait, javImage: settings.javImage,
  };
  const previous = gridLayoutValue;
  if (!previous || (Object.keys(next) as (keyof GridLayout)[]).some((key) => next[key] !== previous[key])) gridLayoutValue = next;
  return gridLayoutValue!;
}

/** The video grid's skeleton shares ratios with the real cards: explicit portrait is 9:16, large images use the front cover ratio, and the rest are 16:9. */
export function cardRatio(layout: GridLayout): number {
  if (layout.portrait) return 9 / 16;
  return layout.active && layout.size === 'big' ? COVER_FRONT_RATIO : 16 / 9;
}

/* Writes are always two steps: normalize, then persist. Which block to repaint after persisting (grid, filter bar, photo wall) is the shell's business: which islands are mounted
   and which page they rest on, only the shell knows. */
export function storeHomeLayout(value: unknown, store: LayoutStore = appSettingsStore()): void {
  store.value.homeLayout = normalizeJavLayout(value); store.save();
}
export function storeJavLayout(value: unknown, store: LayoutStore = appSettingsStore()): void {
  store.value.javLayout = normalizeJavLayout(value); store.save();
}
/** The settings panel's "Default video cover size" group: home and JAV change together. */
export function storeVideoLayout(value: unknown, store: LayoutStore = appSettingsStore()): void {
  store.value.homeLayout = store.value.javLayout = normalizeJavLayout(value); store.save();
}
export function storePhotoSize(value: unknown, store: LayoutStore = appSettingsStore()): void {
  store.value.photoSize = allowedSetting(value, PHOTO_SIZE_KEYS, 'small'); store.save();
}
export function storePhotoLayout(value: unknown, store: LayoutStore = appSettingsStore()): void {
  store.value.photoLayout = allowedSetting(value, PHOTO_LAYOUT_KEYS, 'masonry'); store.save();
}
