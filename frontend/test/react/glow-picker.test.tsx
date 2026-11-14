/* The sidebar color card and the color button under it: what the two ball groups paint and what clicks write, what remains
 * on the card once glow is off, the settings panel's group following on the spot when the scheme changes here, and the card
 * as a resident component (`RESIDENT_ROUTES['glow-picker']`) rendered by the route tree directly as `#boardGlowMenu`'s child.
 * The card's anchoring, open/close, glass material and the balls' pixels are measured in a real browser
 * (`e2e/design-*.test.ts`). */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCENTS, DEFAULT_ACCENT, glowAccent, glowPalette, normalizeHomeGlow } from '@peach/appearance';

import { chooseGlowPreset, wireGlowButton, type GlowSettings } from '../../src/appearance/glow';
import { SETTINGS_KEY } from '../../src/appearance/settings';
import type { ShellActions } from '../../src/react/router/shell-actions';
import { createSettingsStore } from '../../src/settings-store';
import { click } from './render';

// The first import compiles the whole page subtree the route table pulls in, and the compile wait uses its own bounded window.
const REACT_IMPORT_TIMEOUT_MS = 30_000;

async function load() {
  const [history, router, routes, island] = await Promise.all([
    import('../../src/history'), import('../../src/react/router/router'), import('../../src/react/router/managed-routes'),
    import('../../src/react/glow-picker/glow-picker-island'),
  ]);
  return { ...history, ...router, ...routes, ...island };
}
let r: Awaited<ReturnType<typeof load>>;

/* Shell startup order: paint the route tree first, then wire up fetching. The whole file shares this tree; each case opens its own card and closes it at the end. */
beforeAll(async () => {
  r = await load();
  const root = createRoot(document.createElement('div'), r.ROUTER_ROOT_OPTIONS);
  await act(async () => { root.render(<r.RouterRoot actions={{} as ShellActions} />) });
  await act(async () => { r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute)) });
}, REACT_IMPORT_TIMEOUT_MS);

const opened: HTMLElement[] = [];
afterEach(() => {
  for (const menu of opened.splice(0)) act(() => { r.releaseManagedRoute(menu) });
});

/** Wire up along the shell's `loadGlowPicker`: the card the shell builds is handed in, and the route tree renders the content as its children. */
async function setup(patch: Partial<GlowSettings['homeGlow']> = {}, accent = 'blue') {
  document.body.innerHTML = '<div class="glowlayer"></div><button id="boardGlowBtn"></button>';
  const root = document.createElement('div');
  root.id = 'boardGlowMenu';
  document.body.append(root);
  const store = createSettingsStore<GlowSettings>(SETTINGS_KEY, { homeGlow: { ...normalizeHomeGlow(null), ...patch }, accent });
  const openDetails = vi.fn();
  r.configureGlowPicker({ root, store, openDetails });
  await act(async () => { expect(await r.openResidentSurface('glow-picker', root)).toBe(true) });
  opened.push(root);
  return { root, store, openDetails };
}

const pressed = (root: ParentNode, selector: string) =>
  [...root.querySelectorAll(`${selector}[aria-pressed="true"]`)].map((chip) => chip.getAttribute('aria-label'));

beforeEach(() => {
  localStorage.clear();
  /* Run that frame on the spot; it returns 0, which also clears the module's "frame already scheduled" flag. */
  vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => { run(0); return 0 });
});

describe('Resident components', () => {
  it('The content is a direct child of #boardGlowMenu with no .peach-react wrapper; collapsing unmounts only the content and the card stays in the document', async () => {
    const { root } = await setup();
    expect([...root.children].map((child) => child.tagName.toLowerCase())).toEqual(['header', 'div', 'p', 'div', 'footer']);
    expect(root.querySelector('.peach-react')).toBeNull();
    expect(r.managedEntry(root)?.path).toBe('glow-picker');
    act(() => { r.releaseManagedRoute(root) });
    expect([root.isConnected, root.childNodes.length, r.managedTaken(root)]).toEqual([true, 0, false]);
  });
});

describe('Two sets of balls', () => {
  it('The top group is glow presets and the bottom group is twelve accent colors, each pressing the currently active one', async () => {
    const { root } = await setup({ preset: 'ash' }, 'teal');
    const grids = [...root.querySelectorAll('[role="group"]')].map((grid) => grid.getAttribute('aria-label'));
    expect(grids).toEqual(['Glow', 'Accent color']);
    expect([...root.querySelectorAll('[data-glow-head]')].map((head) => head.textContent)).toEqual(['GlowReset', 'Accent color']);
    expect(pressed(root, '[data-glow-preset]')).toEqual(['Mist gray']);
    expect([...root.querySelectorAll('[data-accent]')].map((chip) => chip.getAttribute('data-accent')))
      .toEqual(ACCENTS.map(([key]) => key));
    expect(root.querySelector('[data-accent="teal"] [data-accent-ball="teal"]')).not.toBeNull();
    expect(pressed(root, '[data-accent]')).toEqual([ACCENTS.find(([key]) => key === 'teal')![1]]);
  });

  it('The ball in the "glass original color" cell carries no color and lets the stylesheet pick per theme; every other cell carries a conic fill', async () => {
    const { root } = await setup();
    const native = root.querySelector<HTMLElement>('[data-glow-preset="native"] [data-glow-ball]')!;
    expect([native.hasAttribute('data-glow-native'), native.style.getPropertyValue('--glow-chip')]).toEqual([true, '']);
    const ash = root.querySelector<HTMLElement>('[data-glow-preset="ash"] [data-glow-ball]')!;
    expect(ash.style.getPropertyValue('--glow-chip')).toMatch(/^conic-gradient\(/);
  });

  it('"Custom" takes a slot only after colors were genuinely hand-tuned', async () => {
    expect((await setup()).root.querySelector('[data-glow-preset="custom"]')).toBeNull();
    expect((await setup({ preset: 'custom' })).root.querySelector('[data-glow-preset="custom"]')).not.toBeNull();
  });
});

describe('What pressing writes', () => {
  it('Switching a glow tier also switches the accent color and writes the glow, glass surface, and accent onto the page', async () => {
    const { root, store } = await setup({ preset: 'ash' });
    await click(root.querySelector('[data-glow-preset="amber"]'));
    expect(store.value.homeGlow).toMatchObject({ preset: 'amber', ...glowPalette('amber') });
    expect(store.value.accent).toBe(glowAccent('amber'));
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)!).homeGlow.preset).toBe('amber');
    expect(document.documentElement.dataset.accent).toBe(glowAccent('amber'));
    expect(document.querySelector<HTMLElement>('.glowlayer')!.style.getPropertyValue('--glow-strength')).not.toBe('');
    expect(pressed(root, '[data-glow-preset]')).toEqual(['Filament warmth']);
  });

  it('A single accent pick changes only the accent, never the glow', async () => {
    const { root, store } = await setup({ preset: 'ash' });
    await click(root.querySelector('[data-accent="rose"]'));
    expect([store.value.accent, store.value.homeGlow.preset, document.documentElement.dataset.accent]).toEqual(['rose', 'ash', 'rose']);
  });

  it('"Reset" returns palette and accent to defaults while parameters like intensity stay put', async () => {
    const { root, store } = await setup({ preset: 'amber', strength: 40 }, 'rose');
    await click(root.querySelector('[data-glow-preset-reset]'));
    expect(store.value.homeGlow).toMatchObject({ preset: 'ash', strength: 40, ...glowPalette('ash') });
    expect(store.value.accent).toBe(DEFAULT_ACCENT);
  });

  it('Detailed settings hands back to the shell to open the settings panel', async () => {
    const { root, openDetails } = await setup();
    await click(root.querySelector('[data-glow-detail]'));
    expect(openDetails).toHaveBeenCalledTimes(1);
  });
});

describe('Synced with elsewhere', () => {
  it('With glow off only the accent group remains, and the title collapses together with "Reset"', async () => {
    const { root } = await setup({ on: false });
    expect([root.querySelector<HTMLElement>('[data-glow-presets]')!.hidden, root.querySelector<HTMLElement>('[data-glow-grid]')!.hidden,
      root.querySelector<HTMLElement>('[data-accent-grid]')!.hidden]).toEqual([true, true, false]);
  });

  it('Choosing a tier in the settings panel presses the same one in the card on the spot, and the focused one is still the same node', async () => {
    const { root, store } = await setup({ preset: 'ash' });
    const amber = root.querySelector('[data-glow-preset="amber"]');
    act(() => chooseGlowPreset('amber', store));
    expect(pressed(root, '[data-glow-preset]')).toEqual(['Filament warmth']);
    expect(root.querySelector('[data-glow-preset="amber"]')).toBe(amber);
  });

  it('The dot on the palette button reports the first glow color, the native tier adds a marker, and after glow is off it reports the accent color', async () => {
    const { store } = await setup({ preset: 'ash' });
    const button = document.querySelector<HTMLElement>('#boardGlowBtn')!;
    wireGlowButton(button, store);
    const paint = () => [button.style.getPropertyValue('--glow-swatch'), button.hasAttribute('data-glow-native'), button.hasAttribute('data-glow-off')];
    expect(paint()).toEqual([store.value.homeGlow.spot1.color, false, false]);
    act(() => chooseGlowPreset('native', store));
    expect(paint()).toEqual([store.value.homeGlow.spot1.color, true, false]);
    store.value.homeGlow.on = false; store.save();
    expect(paint()).toEqual(['var(--color-accent-500)', false, true]);
  });
});
