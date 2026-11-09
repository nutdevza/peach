/* When the glow layer writes (`src/appearance/glow.ts`). What a click writes is covered by `test/react/glow-picker.test.tsx`. */
import { beforeEach, expect, it, vi } from 'vitest';

import { applyHomeGlow, paintHomeGlowNow, type GlowSettings } from '../../src/appearance/glow';
import { normalizeHomeGlow } from '../../src/appearance/home-glow';
import { SETTINGS_KEY } from '../../src/appearance/settings';
import { createSettingsStore } from '../../src/settings-store';

const store = () => createSettingsStore<GlowSettings>(SETTINGS_KEY, { homeGlow: { ...normalizeHomeGlow(null), strength: 100 }, accent: 'blue' });
const strength = () => document.querySelector<HTMLElement>('.glowlayer')!.style.getPropertyValue('--glow-strength');

beforeEach(() => { document.body.innerHTML = '<div class="glowlayer"></div>' });

it('The startup pass writes into the sidebar layer on the spot without waiting a frame', () => {
  paintHomeGlowNow(store());
  expect(strength()).toBe('1');
});

it('Dragging writes once per frame with that frame\'s value', () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => frames.push(run));
  const current = store();
  for (const value of [80, 60, 40]) { current.value.homeGlow.strength = value; applyHomeGlow(current) }
  expect([frames.length, strength()]).toEqual([1, '']);
  frames.shift()!(0);
  expect(strength()).toBe('0.4');
  current.value.homeGlow.strength = 20; applyHomeGlow(current);
  expect(frames.length).toBe(1);
  vi.unstubAllGlobals();
});
