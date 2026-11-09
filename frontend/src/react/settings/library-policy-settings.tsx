/* Library-level source colors and handling, placed in each library's title row when "Media library and catalog" groups by library,
 * written into `media.library_catalog` (ADR-0116) along with "Save configuration". The three handling tiers are explained once above the group;
 * only libraries set to "Custom" expand the five steps. Source colors are uncolored by default; open the color ball to pick an accent tier. */
import { useRef, useState } from 'react';
import { Dialog, Popover, VisuallyHidden } from 'react-aria-components';
import { UNSAFE_PortalProvider } from 'react-aria';

import { Checkbox } from '@/components/base/checkbox/checkbox';
import { MENU_POPOVER_SURFACE } from '@/components/base/dropdown/menu-styles';
import { Select, SelectItem } from '../components/select';
import { ACCENTS as ACCENT_CHOICES } from '../../appearance/home-glow';
import { previewLibraryColor } from '../components/library-tint';
import { overlayHost } from '../components/overlay-host';
import { Disclosure, Help } from './section';
import { POLICY_COLUMNS, POLICY_COVER_NOTE, POLICY_MATRIX, POLICY_SUMMARY } from './library-policy-copy';
import '../components/glow-preset-grid.css';
import './library-policy-settings.css';

export type Preset = 'auto' | 'local' | 'custom';
export const STAGES = [
  ['probe', 'Read video info'],
  ['metadata', 'Fetch profiles online'],
  ['cover', 'Fetch covers online'],
  ['people', 'Fetch person images online'],
  ['preview', 'Generate 3x3 grid preview'],
] as const;
export type Stage = (typeof STAGES)[number][0];
export const AUTO_STAGES: readonly Stage[] = ['probe', 'metadata', 'cover', 'people', 'preview'];
const PRESETS: readonly (readonly [Preset, string, string])[] = [
  ['auto', 'Auto-complete', 'Fetches online only what is missing'],
  ['local', 'Use local profiles only', 'Never online; local NFO and images only'],
  ['custom', 'Custom', 'Pick the steps to run one by one'],
];

/** Description of the three handling modes, placed once above the groups: one sentence always visible, the differences folded into an expandable comparison table. */
export function PolicyLegend() {
  return (
    <div data-policy-legend="" className="flex flex-col gap-1">
      <Help>{POLICY_SUMMARY}</Help>
      <Disclosure summary="Comparing the three handling methods">
        <table data-policy-matrix="" className="text-body-2-regular">
          <thead><tr><th scope="col"><VisuallyHidden>Steps</VisuallyHidden></th>
            {POLICY_COLUMNS.map(name => <th key={name} scope="col">{name}</th>)}</tr></thead>
          <tbody>{POLICY_MATRIX.map(([step, ...cells]) => <tr key={step}><th scope="row">{step}</th>
            {cells.map((cell, index) => <td key={POLICY_COLUMNS[index]} data-policy-cell={cell === '✓' ? 'on' : cell === '—' ? 'off' : 'choice'}>
              {cell === '✓' ? <span aria-label="do">✓</span> : cell === '—' ? <span aria-label="Skip">—</span> : cell}</td>)}</tr>)}</tbody>
        </table>
        <Help>{POLICY_COVER_NOTE}</Help>
      </Disclosure>
    </div>
  );
}

/** The handling-mode dropdown in the title row: the popover top states what is being chosen, each tier carries one line, and collapsed only the tier name shows. */
export function PresetSelect({ name, value, onChange }: { name: string; value: Preset; onChange(value: Preset): void }) {
  return (
    <Select data-guide-target="library-policy" className="w-full" aria-label={`${name} handling`} selectedKey={value} prefix="Handling"
      renderValue={<span className="truncate">{PRESETS.find(([key]) => key === value)?.[1]}</span>}
      onSelectionChange={key => onChange(String(key) as Preset)}>
      {PRESETS.map(([key, label, hint]) => (
        <SelectItem key={key} id={key} textValue={label}>
          <span className="flex min-w-0 flex-col">
            <span>{label}</span>
            <span className="text-body-2-regular text-text-secondary whitespace-normal">{hint}</span>
          </span>
        </SelectItem>
      ))}
    </Select>
  );
}

export function StageChooser({ name, value, onChange }: { name: string; value: readonly Stage[]; onChange(value: readonly Stage[]): void }) {
  return (
    <Disclosure defaultOpen summary={`${name} processing steps (${value.length}/${STAGES.length})`}>
      <div className="flex flex-wrap gap-x-6 gap-y-2" role="group" aria-label={`${name} handling steps`}>
        {STAGES.map(([key, label]) => (
          <Checkbox key={key} isSelected={value.includes(key)}
            onChange={(on) => onChange(on ? [...value, key] : value.filter(stage => stage !== key))}>
            {label}
          </Checkbox>
        ))}
      </div>
    </Disclosure>
  );
}

/** A ball showing the current source color; opening it offers 'no color' plus twelve accent tiers. */
export function LibraryColorPicker({ id, name, value: color, onChange }: {
  id: string; name: string; value: string; onChange(color: string): void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const label = ACCENT_CHOICES.find(([key]) => key === color)?.[1] || 'No color';
  const choose = (next: string) => { onChange(next); previewLibraryColor(id, next); setOpen(false) };
  return <>
    <button ref={trigger} type="button" className="text-body-medium" data-glow-chip="" data-library-color-trigger="" aria-haspopup="dialog"
      aria-expanded={open} aria-label={`Source color of ${name || 'Unnamed library'}: ${label}`} title={label} onClick={() => setOpen(true)}>
      <span aria-hidden className="text-text-tertiary">Source color</span>
      {color
        ? <span data-glow-ball="" aria-hidden="true" data-accent-ball={color} />
        : <span data-glow-ball="" data-library-none="" aria-hidden="true" />}
      <span>{label}</span>
    </button>
    <UNSAFE_PortalProvider getContainer={() => overlayHost(trigger.current)}>
      <Popover triggerRef={trigger} isOpen={open} onOpenChange={setOpen} placement="bottom start" offset={8}
        containerPadding={12} className={MENU_POPOVER_SURFACE}>
        <Dialog aria-label={`Source color of ${name || 'Unnamed library'}`} className="outline-none">
          <p className="px-1 pb-2 text-body-medium text-text-primary">Pick source color</p>
          <div data-accent-grid="" data-library-colors="" role="group">
            <button type="button" data-glow-chip="" aria-pressed={!color} title="No color" aria-label="No color"
              onClick={() => choose('')}>
              <span data-glow-ball="" data-library-none="" aria-hidden="true" />
            </button>
            {ACCENT_CHOICES.map(([key, choice]) => (
              <button type="button" key={key} data-glow-chip="" aria-pressed={key === color} title={choice} aria-label={choice}
                onClick={() => choose(key)}>
                <span data-glow-ball="" aria-hidden="true" data-accent-ball={key} />
              </button>
            ))}
          </div>
        </Dialog>
      </Popover>
    </UNSAFE_PortalProvider>
  </>;
}
