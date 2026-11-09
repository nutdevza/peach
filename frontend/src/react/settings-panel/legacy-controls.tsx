/* The three shared controls reused inside panels: Geist Switch (`iconSwitchHtml`), Geist Select (`selectFieldHtml`) and the
 * self-drawn slider (`dialSliderHtml`).
 *
 * Their templates, keyboard and motion live once in `src/ui-kit/`; the home filter bar, card layout and configuration page
 * use the same set. This module only gives each one a container; a helper writes the HTML in and wires it. The segmented
 * slider is auto-wired by the observer `board-controls.ts` keeps on body when it sees new nodes.
 *
 * React never enters these containers' subtrees: the containers hold only a `ref`, no JSX children, so reconciliation never
 * touches the DOM the helper wrote. */
import { useLayoutEffect, useRef } from 'react';

import {
  dialSliderHtml, iconSwitchHtml, selectFieldHtml, setActionBusy, wireDialSlider, wireIconSwitch, wireSelectField,
} from '@peach/legacy/ui';

import type { Choice } from './settings-panel-api';

const rows = (options: readonly Choice[]): Choice[] => options.map(([value, label, mark]) => mark ? [value, label, mark] : [value, label]);

/** A set of mutually exclusive views. When `value` differs from what was painted last, or the panel reopens (`epoch` changed), the whole block repaints:
 *  the slider re-measures its position against the new selection. A click itself does not repaint; the DOM is already in the clicked state. `variant` is the modifier class
 *  the legacy template `iconSwitchHtml` recognizes (the round knobs of the theme group, the text tiers of the two cover groups); styles live in the legacy sheet. */
export function IconSwitch({ id, name, legend, options, value, attr, variant, text = false, epoch, onChoose }: {
  id: string; name: string; legend: string; options: readonly Choice[]; value: string;
  attr: string; variant: string; text?: boolean; epoch: number; onChoose(value: string): void;
}) {
  const mount = useRef<HTMLDivElement | null>(null);
  const painted = useRef<{ value: string; epoch: number } | null>(null);
  const choose = useRef(onChoose);
  choose.current = onChoose;
  useLayoutEffect(() => {
    const node = mount.current;
    if (!node) return;
    if (painted.current && painted.current.value === value && painted.current.epoch === epoch) return;
    node.innerHTML = iconSwitchHtml(name, legend, rows(options), value, { attr, className: variant, text });
    wireIconSwitch(node, attr, (next) => {
      painted.current = { value: next, epoch };
      choose.current(next);
    });
    painted.current = { value, epoch };
  });
  return <div id={id} ref={mount} />;
}

/** A dropdown. The trigger cell's content can be rewritten by `decorate` (the sort direction cell stacks two arrows). */
export function SelectField({ id, label, options, value, disabled = false, busy = false, hidden, describedBy, epoch, onPick, decorate }: {
  id: string; label: string; options: readonly Choice[]; value: string; disabled?: boolean; busy?: boolean;
  hidden?: boolean; describedBy?: string; epoch: number; onPick(value: string): void;
  decorate?(field: HTMLElement): void;
}) {
  const mount = useRef<HTMLDivElement | null>(null);
  const field = useRef<(HTMLElement & { value: string; disabled: boolean }) | null>(null);
  const built = useRef(-1);
  const pick = useRef(onPick);
  pick.current = onPick;
  useLayoutEffect(() => {
    const node = mount.current;
    if (!node) return;
    if (built.current !== epoch || !field.current) {
      node.innerHTML = selectFieldHtml(rows(options), value, { label });
      const root = wireSelectField(node.firstElementChild as HTMLElement);
      root.addEventListener('change', () => pick.current(root.value));
      field.current = root;
      built.current = epoch;
    }
    const root = field.current;
    if (root.value !== value) root.value = value;
    if (root.disabled !== disabled) root.disabled = disabled;
    if ((root.getAttribute('aria-busy') === 'true') !== busy) setActionBusy(root, busy);
    decorate?.(root);
  });
  return <div id={id} ref={mount} hidden={hidden} aria-describedby={describedBy} />;
}

/** A row of "tag + 0-max slider". The slider attaches after the tag via the helper, a direct child of the row like the tag; React only owns
 *  the tag cell. While dragging, every step goes through `onStep`; release and keyboard landing go through `onSettle`. */
export function DialRow({ field, label, max, value, hidden, onStep, onSettle }: {
  field: string; label: string; max: number; value: number; hidden: boolean;
  onStep(value: number): void; onSettle(value: number): void;
}) {
  const row = useRef<HTMLDivElement | null>(null);
  const dial = useRef<{ value: number; set(next: number): void } | null>(null);
  const handlers = useRef({ onStep, onSettle });
  handlers.current = { onStep, onSettle };
  useLayoutEffect(() => {
    const node = row.current;
    if (!node || dial.current) return;
    node.insertAdjacentHTML('beforeend', dialSliderHtml({ value, min: 0, max, step: 1, label, attr: `data-glow-dial="${field}"` }));
    dial.current = wireDialSlider(node.lastElementChild as HTMLElement, {
      onInput: (next) => handlers.current.onStep(next),
      onChange: (next) => handlers.current.onSettle(next),
    });
  });
  useLayoutEffect(() => {
    if (dial.current && dial.current.value !== value) dial.current.set(value);
  }, [value]);
  return (
    <div data-glow-field={field} hidden={hidden} ref={row}>
      <span data-glow-field-label="">{label}</span>
    </div>
  );
}
