import { expect, it } from 'vitest';

import {
  DEFAULT_SFW_SHORTCUT, formatShortcut, isApplePlatform, matchesShortcut, parseShortcut, recordShortcut, serializeShortcut,
  shortcutKeys,
} from '../src/keyboard-shortcut';

const press = (code: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}) =>
  ({ code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });

it('The default Shift+S round-trip is unchanged; unreadable text returns null', () => {
  const shortcut = parseShortcut(DEFAULT_SFW_SHORTCUT)!;
  expect(shortcut).toEqual({ code: 'KeyS', ctrl: false, alt: false, shift: true, meta: false });
  expect(serializeShortcut(shortcut)).toBe(DEFAULT_SFW_SHORTCUT);
  expect(serializeShortcut(parseShortcut('Meta+Alt+Ctrl+Shift+Digit1')!)).toBe('Ctrl+Alt+Shift+Meta+Digit1');
  for (const text of ['', 'KeyS', 'Shift+ArrowLeft', 'Hyper+KeyS', 'Ctrl+KeyW', null]) {
    expect(parseShortcut(text)).toBeNull();
  }
});

it('Mac uses the ⌃⌥⇧⌘ glyphs in Apple\'s order, written together; other platforms write Ctrl+Alt+Shift+Win', () => {
  const all = parseShortcut('Ctrl+Alt+Shift+Meta+KeyS')!;
  expect(formatShortcut(all, true)).toBe('⌃⌥⇧⌘S');
  expect(formatShortcut(all, false)).toBe('Ctrl+Alt+Shift+Win+S');
  expect(formatShortcut(parseShortcut('Shift+KeyS')!, true)).toBe('⇧S');
  expect(formatShortcut(parseShortcut('Alt+F5')!, false)).toBe('Alt+F5');
});

it('Match by physical key: Option+S that types “ß” also counts; one more or one fewer modifier key is rejected', () => {
  const shortcut = parseShortcut('Alt+KeyS')!;
  expect(matchesShortcut({ ...press('KeyS', { altKey: true }), key: 'ß' } as KeyboardEvent, shortcut)).toBe(true);
  expect(matchesShortcut(press('KeyS', { altKey: true, shiftKey: true }), shortcut)).toBe(false);
  expect(matchesShortcut(press('KeyS'), shortcut)).toBe(false);
  expect(matchesShortcut(press('KeyD', { altKey: true }), shortcut)).toBe(false);
});

it('Recording: modifier-only is still waiting; a single key, arrow keys, and browser-taken combos each get a reason', () => {
  expect(recordShortcut(press('ShiftLeft', { shiftKey: true }))).toEqual({ state: 'waiting' });
  expect(recordShortcut(press('MetaRight', { metaKey: true }))).toEqual({ state: 'waiting' });
  expect(recordShortcut(press('KeyS'))).toMatchObject({ state: 'invalid', problem: expect.stringContaining('Modifier key') });
  expect(recordShortcut(press('ArrowLeft', { shiftKey: true }))).toMatchObject({ state: 'invalid' });
  expect(recordShortcut(press('KeyW', { metaKey: true }))).toMatchObject({ state: 'invalid', problem: expect.stringContaining('Browser') });
  expect(recordShortcut(press('KeyH', { metaKey: true, shiftKey: true })))
    .toEqual({ state: 'done', shortcut: { code: 'KeyH', ctrl: false, alt: false, shift: true, meta: true } });
});

it('Platform detection checks Client Hints first, then navigator.platform', () => {
  expect(isApplePlatform({ platform: 'Win32', userAgentData: { platform: 'macOS' } })).toBe(true);
  expect(isApplePlatform({ platform: 'MacIntel' })).toBe(true);
  expect(isApplePlatform({ platform: 'Win32', userAgentData: { platform: 'Windows' } })).toBe(false);
});

it('One keycap per key: modifier first, main key after; a modifier-only press has no main key', () => {
  const held = { ctrl: true, alt: false, shift: true, meta: false };
  expect(shortcutKeys(held, 'KeyK', false)).toEqual(['Ctrl', 'Shift', 'K']);
  expect(shortcutKeys(held, 'KeyK', true)).toEqual(['⌃', '⇧', 'K']);
  expect(shortcutKeys(held, null, false)).toEqual(['Ctrl', 'Shift']);
  expect(shortcutKeys({ ctrl: false, alt: false, shift: false, meta: false }, 'ArrowLeft', false)).toEqual(['←']);
});
