/* The "SFW shortcut" row. Normally it uses a BoardUI Kbd pill to show the current binding; after clicking "Change" it swaps to a row of skeuomorphic keycaps: the pressed key
 * sinks down and lights up, not-yet-pressed slots are held by dashed empty spaces, a stroke that didn't register turns the error color, a recorded one turns the success color, and after a moment it retracts back to the pill.
 *
 * During recording it swallows every keypress at the window capture phase: the same press can no longer fall through to the shell's global listener to toggle SFW, close the settings overlay,
 * or trigger a player shortcut. Esc cancels, and focus leaving the button also cancels. Rules and display are in `../../keyboard-shortcut.ts`. */
import { useEffect, useState } from 'react';
import { Button } from '@/components/base/buttons/button';
import { Kbd } from '@/components/base/kbd/kbd';
import { Keycaps, type KeycapItem } from '../components/keycap';
import {
  DEFAULT_SFW_SHORTCUT, formatShortcut, isApplePlatform, isModifierCode, recordShortcut, serializeShortcut, shortcutKeys,
  type Modifiers, type Shortcut,
} from '../../keyboard-shortcut';

/** After a recording, how long the keycap stays before collapsing back into the capsule. */
const SETTLE_MS = 600;
const NONE: Modifiers = { ctrl: false, alt: false, shift: false, meta: false };
const heldModifiers = (event: KeyboardEvent): Modifiers =>
  ({ ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey });

export function ShortcutSetting({ current, onChange }: { current: Shortcut; onChange(shortcut: Shortcut | null): void }) {
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState('');
  /** The key being held during recording: when only a modifier is pressed, code is null; an unusable main key stays here, with a reason. */
  const [pressed, setPressed] = useState<{ modifiers: Modifiers; code: string | null }>({ modifiers: NONE, code: null });
  /** The just-recorded group: the keycap flashes briefly before collapsing into the capsule. */
  const [saved, setSaved] = useState<Shortcut | null>(null);
  const stop = () => { setRecording(false); setProblem(''); setPressed({ modifiers: NONE, code: null }) };
  useEffect(() => {
    if (!recording) return undefined;
    const keydown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey) { stop(); return }
      const modifier = isModifierCode(event.code);
      setPressed({ modifiers: heldModifiers(event), code: modifier ? null : event.code });
      setProblem('');
      const result = recordShortcut(event);
      if (result.state === 'invalid') setProblem(result.problem);
      if (result.state === 'done') { onChange(result.shortcut); setSaved(result.shortcut); stop() }
    };
    // Sync the keycap on modifier release; keep the group that already pressed the main key, so it's clear which press didn't go through.
    const keyup = (event: KeyboardEvent) => {
      event.stopPropagation();
      setPressed((last) => (last.code === null ? { modifiers: heldModifiers(event), code: null } : last));
    };
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('keyup', keyup, true);
    return () => { window.removeEventListener('keydown', keydown, true); window.removeEventListener('keyup', keyup, true) };
  }, [recording, onChange]);
  useEffect(() => {
    if (!saved) return undefined;
    const timer = window.setTimeout(() => setSaved(null), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const apple = isApplePlatform();
  const caps = (modifiers: Modifiers, code: string | null, state: KeycapItem['state']): KeycapItem[] =>
    shortcutKeys(modifiers, code, apple).map((label) => ({ label, state }));
  const slot = (label: string): KeycapItem => ({ label, state: 'slot' });
  const held = pressed.modifiers.ctrl || pressed.modifiers.alt || pressed.modifiers.shift || pressed.modifiers.meta;
  const keys: KeycapItem[] | null = saved ? caps(saved, saved.code, 'done')
    : !recording ? null
      : pressed.code ? caps(pressed.modifiers, pressed.code, problem ? 'invalid' : 'down')
        : held ? [...caps(pressed.modifiers, null, 'down'), slot('键')] : [slot('Modifier key'), slot('键')];
  const custom = serializeShortcut(current) !== DEFAULT_SFW_SHORTCUT;
  const hint = saved ? `Changed to ${formatShortcut(saved, apple)}`
    : recording ? (problem || 'Press a new key combo, Esc to cancel') : 'Toggle anytime outside the input box.';
  return (
    <div data-setting-row="">
      <span><b>SFW shortcut</b><small id="sfwShortcutDescription" aria-live="polite">{hint}</small></span>
      <div data-setting-shortcut="" className="peach-react">
        {keys ? <Keycaps keys={keys} plus={!apple} />
          : <Kbd data-shortcut-keys="" aria-label={`Current shortcut ${formatShortcut(current, apple)}`}>{formatShortcut(current, apple)}</Kbd>}
        {custom && !recording && !saved ? (
          <Button variant="secondary" size="small" onClick={() => onChange(null)}>Restore defaults</Button>
        ) : null}
        <Button variant={recording ? 'secondary' : 'primary'} size="small" aria-describedby="sfwShortcutDescription"
          onClick={() => { if (recording) stop(); else { setSaved(null); setRecording(true) } }}
          onBlur={stop}>
          {recording ? 'Cancel' : 'Change'}
        </Button>
      </div>
    </div>
  );
}
