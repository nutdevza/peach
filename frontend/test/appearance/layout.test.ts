/* Card layout, photo wall size, card density, and theme are written onto the page (`src/appearance/layout.ts`, `density.ts`, `theme.ts`). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { applyDensity, currentDensity, paintPhotoSizeButton, toggleDensity } from '../../src/appearance/density';
import {
  cardLayoutFor, cardRatio, COVER_FRONT_RATIO, gridLayout, photoLayout, photoSize, storePhotoLayout, storePhotoSize,
  storeVideoLayout,
} from '../../src/appearance/layout';
import { normalizeAppSettings, SETTINGS_KEY } from '../../src/appearance/settings';
import { applyTheme, THEME_OPTIONS } from '../../src/appearance/theme';
import { createSettingsStore } from '../../src/settings-store';

const settingsWith = (patch: Record<string, unknown> = {}) => ({ ...normalizeAppSettings({}).settings, ...patch });

describe('Card layout', () => {
  it('Home reads the home copy and everywhere else the JAV copy; legacy values merge into the two tiers', () => {
    const settings = settingsWith({ homeLayout: 'big', javLayout: 'sleeve' });
    expect([cardLayoutFor(true, settings), cardLayoutFor(false, settings)]).toEqual(['big', 'small']);
  });

  it('Layout objects are replaced only when genuinely changed: cards compare by reference', () => {
    const settings = settingsWith();
    const context = { active: true, home: true, portrait: false };
    const first = gridLayout(context, settings);
    expect(gridLayout({ ...context }, settings)).toBe(first);
    settings.homeLayout = 'big';
    const changed = gridLayout(context, settings);
    expect(changed).not.toBe(first);
    expect(changed).toEqual({ active: true, size: 'big', portrait: false, javImage: 'cover' });
  });

  it('The skeleton matches the real card aspect: portrait 9:16, on the split small and large path the large image takes the full cover ratio, the rest 16:9', () => {
    const at = (active: boolean, size: 'big' | 'small', portrait: boolean) => cardRatio({ active, size, portrait, javImage: 'cover' });
    expect([at(true, 'big', true), at(true, 'big', false), at(false, 'big', false), at(true, 'small', false)])
      .toEqual([9 / 16, COVER_FRONT_RATIO, 16 / 9, 16 / 9]);
    /* Slightly wider than the widest regular cover on this machine (0.749): the large view keeps the front cover whole, cropping not one from the left. */
    expect(COVER_FRONT_RATIO).toBe(0.75);
  });

  it('The settings panel group changes both home and JAV copies at once and persists them', () => {
    const store = createSettingsStore(SETTINGS_KEY, settingsWith());
    storeVideoLayout('preview', store);
    expect([store.value.homeLayout, store.value.javLayout, JSON.parse(localStorage.getItem(SETTINGS_KEY)!).homeLayout])
      .toEqual(['small', 'small', 'small']);
  });
});

describe('Photo wall', () => {
  it('Size defaults to small thumbnails and layout to masonry; writes go through the whitelist', () => {
    expect([photoSize(settingsWith()), photoLayout(settingsWith())]).toEqual(['small', 'masonry']);
    const store = createSettingsStore(SETTINGS_KEY, settingsWith());
    storePhotoSize('huge', store);
    storePhotoLayout('fixed', store);
    expect([store.value.photoSize, store.value.photoLayout]).toEqual(['small', 'fixed']);
    storePhotoSize('big', store);
    expect(photoSize(store.value)).toBe('big');
  });
});

describe('Card density and the top bar\'s image size key', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<button id="density" type="button"></button>';
  });

  it('Writes --tile, the data-density on body, the pressed state of that key, its tooltip and its glyph', () => {
    applyDensity();
    const button = document.querySelector('#density')!;
    expect([document.documentElement.style.getPropertyValue('--tile'), document.body.dataset.density,
      button.getAttribute('aria-pressed'), button.getAttribute('title'), button.getAttribute('aria-label'),
      button.querySelector('[data-icon-swap]')?.getAttribute('data-icon-state')])
      .toEqual(['336px', 'big', 'false', 'Current: large images', 'Switch to small thumbnails', 'a']);
    toggleDensity();
    expect([currentDensity(), localStorage.getItem('density'), document.documentElement.style.getPropertyValue('--tile'),
      document.body.dataset.density, button.getAttribute('aria-pressed'), button.getAttribute('title')])
      .toEqual(['dense', 'dense', '168px', 'dense', 'true', 'Current: dense']);
  });

  it('While on the photo wall the same key reports photo size', () => {
    paintPhotoSizeButton('small');
    const button = document.querySelector('#density')!;
    expect([button.getAttribute('aria-pressed'), button.getAttribute('title'), button.getAttribute('aria-label'),
      button.querySelector('[data-icon-swap]')?.getAttribute('data-icon-state')])
      .toEqual(['true', 'Current: small images', 'Switch to large thumbnails', 'b']);
  });
});

describe('Theme', () => {
  let systemDark = false;
  beforeEach(() => {
    /* The module creates the media query once and reads `matches` on every check after: the stub has to be live too. */
    vi.stubGlobal('matchMedia', (query: string) => ({
      get matches() { return query.includes('dark') && systemDark }, media: query,
      addEventListener: () => {}, removeEventListener: () => {},
    }));
    document.head.innerHTML = '<meta name="theme-color" data-theme-color="light"><meta name="theme-color" data-theme-color="dark">';
    document.body.innerHTML = `<div class="board-theme-toggle"><button data-board-theme="light"></button>
      <button data-board-theme="dark"></button></div>`;
  });
  afterEach(() => vi.unstubAllGlobals());

  const snapshot = () => {
    const root = document.documentElement;
    return {
      theme: root.dataset.theme ?? null, dark: root.classList.contains('dark'),
      pressed: [...document.querySelectorAll('[data-board-theme]')].map((button) => button.getAttribute('aria-pressed')),
      thumb: document.querySelector('.board-theme-toggle')!.classList.contains('is-dark'),
      meta: [...document.querySelectorAll<HTMLMetaElement>('meta[data-theme-color]')].map((meta) => meta.media),
    };
  };

  it('Choosing a tier writes data-theme, the dark class, the light/dark key, and the address bar swatch', () => {
    applyTheme('dark');
    expect(snapshot()).toEqual({ theme: 'dark', dark: true, pressed: ['false', 'true'], thumb: true, meta: ['not all', 'all'] });
    applyTheme('light');
    expect(snapshot()).toEqual({ theme: 'light', dark: false, pressed: ['true', 'false'], thumb: false, meta: ['all', 'not all'] });
  });

  it('One glyph per tier: follow-system speaks about the device, so it is a monitor', () => {
    expect(THEME_OPTIONS.map(([value, , icon]) => [value, icon])).toEqual([['system', 'monitor'], ['light', 'sun'], ['dark', 'moon']]);
  });

  it('Follow-system removes the attribute, computing light/dark from the system tier', () => {
    systemDark = true;
    applyTheme('system');
    expect(snapshot()).toMatchObject({ theme: null, dark: true, meta: ['not all', 'all'] });
  });
});
