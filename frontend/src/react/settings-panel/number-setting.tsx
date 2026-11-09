/* Numeric settings with units, optional toggles, and field error feedback.
 *
 * The optional ones (hover zoom, related recommendations, search history, follow auto-update) have a toggle in front: off means 0 and
 * the number box collapses; turning it back on refills the value from before it was turned off. That value is stored in `peach.number.<id>`, kept with this browser.
 * Commit timing matches a native number box's `change`: blur or Enter, nothing commits while typing. */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { boundedPreference } from '../../number-setting';

export interface NumberSpec { min: number; max: number; unit: string; optional?: boolean; fallback: number }

export const NUMBER_SPECS = {
  batchSizeSetting: { min: 1, max: 200, unit: 'items', fallback: 60 },
  hoverDelaySetting: { min: 1, max: 60, unit: 'sec', optional: true, fallback: 5 },
  seekSecondsSetting: { min: 1, max: 300, unit: 'sec', fallback: 10 },
  relatedLimitSetting: { min: 1, max: 60, unit: 'items', optional: true, fallback: 20 },
  /* The cap matches `/api/feeds/discoveries`; even when the server has more than 100, it returns only 100 videos. */
  feedLimitSetting: { min: 1, max: 100, unit: 'videos', fallback: 12 },
  searchHistoryLimitSetting: { min: 1, max: 50, unit: 'items', optional: true, fallback: 10 },
  followScheduleSetting: { min: 15, max: 10080, unit: 'min', optional: true, fallback: 60 },
} as const satisfies Record<string, NumberSpec>;

export type NumberSettingId = keyof typeof NUMBER_SPECS;

const storageKey = (id: string) => `peach.number.${id}`;

/** When a minute-based interval reaches a day, also restate the days next to the unit: "10080 min" does not read as a week.
 *  Returns an empty string for readings under a day, non-integer, or not in minutes. */
export function dayReading(value: number, unit: string): string {
  if (unit !== 'min' || !Number.isInteger(value) || value < 1440) return '';
  const days = value / 1440;
  return Number.isInteger(days) ? `${days.toLocaleString()} days` : `~${days.toFixed(1)} days`;
}

export function NumberSetting({ id, label, value, disabled = false, onApply }: {
  id: NumberSettingId; label: string;
  /** Current value; null means not yet fetched (the follow auto-update item), in which case the whole block disables without changing the display. */
  value: number | null;
  disabled?: boolean;
  onApply(value: number): void;
}) {
  const spec: NumberSpec = NUMBER_SPECS[id];
  const { min, max, unit, fallback } = spec;
  const optional = spec.optional === true;
  const remembered = useRef(0);
  if (!remembered.current) {
    remembered.current = boundedPreference(Number(localStorage.getItem(storageKey(id))), min, max,
      value && value > 0 ? value : fallback);
  }
  const [shown, setShown] = useState(value ?? 0);
  const [draft, setDraft] = useState(String(value && value > 0 ? value : remembered.current));
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement | null>(null);
  const apply = useRef(onApply);
  apply.current = onApply;

  /* Follows when the value changes from outside (database reconciliation, an edit on another device, a response arriving); null only disables, never changes the display. */
  useLayoutEffect(() => {
    if (value === null) return;
    setShown(value);
    if (value > 0) setDraft(String(value));
  }, [value]);

  const commit = () => {
    const node = input.current;
    if (!node) return;
    if (!node.value || !node.checkValidity()) {
      node.setAttribute('aria-invalid', 'true');
      setError(`Enter a whole number from ${min} to ${max} (${unit})`);
      return;
    }
    node.removeAttribute('aria-invalid');
    setError('');
    remembered.current = Number(node.value);
    localStorage.setItem(storageKey(id), String(remembered.current));
    apply.current(remembered.current);
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  /* The native `change`: React's onChange is the `input` event of every keystroke. */
  useEffect(() => {
    const node = input.current;
    if (!node) return undefined;
    const listener = () => commitRef.current();
    node.addEventListener('change', listener);
    return () => node.removeEventListener('change', listener);
  }, []);

  const on = shown > 0;
  const toggle = () => {
    const node = input.current;
    node?.removeAttribute('aria-invalid');
    setError('');
    if (!on) {
      setShown(remembered.current);
      setDraft(String(remembered.current));
      apply.current(remembered.current);
      return;
    }
    if (node && node.value && node.checkValidity()) remembered.current = Number(node.value);
    localStorage.setItem(storageKey(id), String(remembered.current));
    setShown(0);
    apply.current(0);
  };

  const blocked = disabled || value === null;
  return (
    <div data-number-setting="">
      {optional
        ? <input type="checkbox" data-toggle="" role="switch" aria-label={`Enable ${label}`}
            checked={on} disabled={blocked} onChange={toggle} />
        : null}
      <div data-number-fields="" hidden={optional && !on}>
        <div data-number-control="">
          <input ref={input} type="number" inputMode="numeric" className="geist-input" min={min} max={max} step={1}
            value={draft} disabled={blocked} aria-label={label} aria-describedby={`${id}-error`}
            onChange={(event) => {
              setDraft(event.target.value);
              if (event.target.value && event.target.checkValidity()) {
                event.target.removeAttribute('aria-invalid');
                setError('');
              }
            }}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit() } }} />
          <span aria-hidden="true">{unit}{dayReading(Number(draft), unit) ? ` · ${dayReading(Number(draft), unit)}` : ''}</span>
        </div>
        <small id={`${id}-error`} data-number-error="" role="status" hidden={!error}>{error}</small>
      </div>
    </div>
  );
}
