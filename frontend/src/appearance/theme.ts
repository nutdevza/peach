/* Painting the light/dark theme onto the page.
 *
 * The theme writes only an attribute, never colors: both palettes live in web/css/01-base.css, and choosing follow-system
 * removes the attribute and hands back to `prefers-color-scheme`. The BoardUI source in the React subtree hangs dark tokens on
 * `.dark`, so the same call adds or removes the `dark` class on <html> per actual depth, counting the system tier when
 * following the system. The address bar color follows the same call: the two meta tags each represent a tier, the selected
 * one opens to `all` and the other closes to `not all`, otherwise a phone's address bar stays on the system tier.
 * `index.html`'s inline startup script does the same three things; it only handles the first frame, and everything after
 * comes from here. */
import { appSettingsStore } from './settings';

/** `[value, display name, glyph]`: the three-tier set in the settings panel. The monitor glyph reads "follow this display". */
export const THEME_OPTIONS: readonly (readonly [value: string, label: string, icon: string])[] = [
  ['system', 'Follow system', 'monitor'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon'],
];

let systemDark: MediaQueryList | null = null;
const prefersDark = (): MediaQueryList => (systemDark ??= matchMedia('(prefers-color-scheme: dark)'));

/* On theme change the whole page's color transitions play together, smearing the screen. Before writing properties, mount a style that turns all transitions off; after writing, force one style recalc,
 * the new colors land immediately, and removing it afterwards plays nothing back. The light/dark key's slider is exempt: its glide should follow this switch anyway.
 * Removal is queued to the next frame, with a timer as backstop: rAF does not run while the page is hidden, and the style must not stay mounted forever. */
let transitionBlock: HTMLStyleElement | null = null;
function suppressTransitions(): () => void {
  if (!transitionBlock) {
    transitionBlock = document.createElement('style');
    transitionBlock.textContent = '*:not(.board-theme-thumb),*::before,*::after{transition:none!important}';
  }
  if (!transitionBlock.isConnected) document.head.append(transitionBlock);
  return () => {
    void getComputedStyle(document.documentElement).opacity;
    const release = () => { cancelAnimationFrame(frame); clearTimeout(timer); transitionBlock?.remove() };
    const frame = requestAnimationFrame(release);
    const timer = setTimeout(release, 100);
  };
}

export function applyTheme(choice: string = appSettingsStore().value.theme): void {
  const restore = suppressTransitions();
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme; else root.dataset.theme = choice;
  const dark = choice === 'dark' || (choice === 'system' && prefersDark().matches);
  root.classList.toggle('dark', dark);
  document.querySelectorAll<HTMLElement>('[data-board-theme]').forEach((button) =>
    button.setAttribute('aria-pressed', String((button.dataset.boardTheme === 'dark') === dark)));
  document.querySelector('.board-theme-toggle')?.classList.toggle('is-dark', dark);
  document.querySelectorAll<HTMLMetaElement>('meta[data-theme-color]').forEach((meta) => {
    meta.media = (meta.dataset.themeColor === 'dark') === dark ? 'all' : 'not all';
  });
  restore();
}

/** The follow-system tier: when the system flips light or dark, the page follows immediately. Subscribed exactly once. */
let watching = false;
export function watchSystemTheme(): void {
  if (watching) return;
  watching = true;
  prefersDark().addEventListener('change', () => { if (appSettingsStore().value.theme === 'system') applyTheme() });
}
