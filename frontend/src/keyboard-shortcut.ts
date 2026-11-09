/* The single user-editable shortcut (currently only the SFW toggle): record, store, match, and display.
 *
 * The main key is recorded by physical key position `KeyboardEvent.code`, not `key`: on Mac the `key` for Option+S is "ß",
 * and under Shift letters uppercase, and switching keyboard layouts changes the characters along with it; `code` is always `KeyS`. Stored as
 * text like `Ctrl+Alt+Shift+Meta+KeyS`, with a fixed modifier order; comparison only looks at `code` and the four modifier bits.
 *
 * Only one binding is handled, so no libraries like tinykeys or hotkeys-js are pulled in: all they could replace is the matching lines; recording and per-platform
 * display still have to be written by hand; and the global listener lives in the legacy `application/search.js`, so the React-only recording hook can't hook in.
 * The trade-off is recorded in `docs/REUSE.md` "Shortcuts". */

export interface Shortcut { code: string; ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }

/** Stored locally, not synced with settings: ⌘ is the Win key on Windows, so the same binding doesn't hold on another device. */
export const SFW_SHORTCUT_KEY = 'peach.sfw-shortcut';
export const DEFAULT_SFW_SHORTCUT = 'Shift+KeyS';

/** Keys that can act as the main key: letters, digits, and F1–F12. Arrow keys, Space, and Enter are reserved for the player and forms. */
const MAIN_KEY = /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/;
/** While the modifier key itself is down and still waiting for the main key, it does not count as a recording. */
const MODIFIER_CODES = /^(?:Shift|Control|Alt|Meta|OS)(?:Left|Right)?$/;
/** Ctrl (⌘ on Mac) plus these keys are the browser's own new/close/quit window; the page doesn't receive this keypress. */
const BROWSER_RESERVED = new Set(['KeyW', 'KeyT', 'KeyN', 'KeyQ']);

export function parseShortcut(text: string | null | undefined): Shortcut | null {
  const parts = String(text || '').split('+');
  const code = parts.pop() || '';
  const flags = new Set(parts);
  if (!MAIN_KEY.test(code) || [...flags].some((flag) => !['Ctrl', 'Alt', 'Shift', 'Meta'].includes(flag))) return null;
  const shortcut = { code, ctrl: flags.has('Ctrl'), alt: flags.has('Alt'), shift: flags.has('Shift'), meta: flags.has('Meta') };
  return problemWith(shortcut) ? null : shortcut;
}

export function serializeShortcut(shortcut: Shortcut): string {
  return [shortcut.ctrl && 'Ctrl', shortcut.alt && 'Alt', shortcut.shift && 'Shift', shortcut.meta && 'Meta', shortcut.code]
    .filter(Boolean).join('+');
}

/** Explain why a binding is unavailable; if it works, return an empty string. */
function problemWith(shortcut: Shortcut): string {
  if (!shortcut.ctrl && !shortcut.alt && !shortcut.shift && !shortcut.meta) {
    return 'Include at least one modifier key; a lone letter would clash with player shortcuts';
  }
  if ((shortcut.ctrl || shortcut.meta) && BROWSER_RESERVED.has(shortcut.code)) return 'This combo is taken by the browser; the page never receives it';
  return '';
}

export function isModifierCode(code: string): boolean {
  return MODIFIER_CODES.test(code);
}

export type Recorded = { state: 'waiting' } | { state: 'invalid'; problem: string } | { state: 'done'; shortcut: Shortcut };

/** A single keypress during recording: if only a modifier was pressed, still waiting; if the main key is unsupported or the combo can't be used, give the reason. */
export function recordShortcut(event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): Recorded {
  if (isModifierCode(event.code)) return { state: 'waiting' };
  if (!MAIN_KEY.test(event.code)) return { state: 'invalid', problem: 'Only letters, digits, and F1–F12 work as the main key' };
  const shortcut = { code: event.code, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey };
  const problem = problemWith(shortcut);
  return problem ? { state: 'invalid', problem } : { state: 'done', shortcut };
}

export function matchesShortcut(event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>,
                                shortcut: Shortcut): boolean {
  return event.code === shortcut.code && event.ctrlKey === shortcut.ctrl && event.altKey === shortcut.alt
    && event.shiftKey === shortcut.shift && event.metaKey === shortcut.meta;
}

/** Apple devices show the ⌘⌥ glyphs. Check User-Agent Client Hints first, then fall back to `navigator.platform` (same as `browser-diagnostics.ts`). */
export function isApplePlatform(source: Pick<Navigator, 'platform'> & { userAgentData?: { platform?: string } } = navigator): boolean {
  return /mac|iphone|ipad|ipod/i.test(source.userAgentData?.platform || source.platform || '');
}

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Space: 'Space', Enter: 'Enter', Escape: 'Esc',
  Backspace: 'Backspace', Tab: 'Tab',
};

function keyLabel(code: string): string {
  return KEY_LABELS[code] ?? code.replace(/^Key|^Digit|^Numpad/, '');
}

export type Modifiers = Pick<Shortcut, 'ctrl' | 'alt' | 'shift' | 'meta'>;

/** One key, one keycap: modifier keys go first in Apple's order — Control, Option, Shift, Command — with the main key last.
 * On Mac, modifiers render as the ⌃⌥⇧⌘ glyphs; other platforms write the name, where Meta is the Win key. When `code` is null there are only modifiers,
 * for that moment mid-recording before the main key is pressed. */
export function shortcutKeys(modifiers: Modifiers, code: string | null, apple = isApplePlatform()): string[] {
  const names = apple ? ['⌃', '⌥', '⇧', '⌘'] : ['Ctrl', 'Alt', 'Shift', 'Win'];
  const held = [modifiers.ctrl, modifiers.alt, modifiers.shift, modifiers.meta];
  return [...names.filter((_, index) => held[index]), ...(code ? [keyLabel(code)] : [])];
}

/** Written as a single string for screen readers and tooltips: Mac writes it together (⇧S); other platforms join with a plus (Shift+S). */
export function formatShortcut(shortcut: Shortcut, apple = isApplePlatform()): string {
  return shortcutKeys(shortcut, shortcut.code, apple).join(apple ? '' : '+');
}
