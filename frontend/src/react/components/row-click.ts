/* Rows selectable as a whole: clicking a row's blank selects that row, while clicking a control, link or input inside does
 * not.
 *
 * The checkbox already sits at the row start, but it is only 16px, and if the rest of the row did nothing, selecting a few
 * entries would take that many careful aims. "Blank" is judged by walking up from the clicked element for an interactive
 * ancestor, stopping at the row: ancestors beyond the row do not count, otherwise a whole table wrapped in a `label` would
 * make every click "on a control". */
import type { MouseEvent, SyntheticEvent } from 'react';

const INTERACTIVE = [
  'a', 'button', 'input', 'select', 'textarea', 'label',
  '[role="checkbox"]', '[role="switch"]', '[role="button"]', '[role="link"]', '[role="menu"]',
].join(',');

/** Whether this click landed on blank space of `row`. `row` is the whole row element, and the event can bubble up from any of its descendants. */
export function clickedBlank(event: SyntheticEvent | Event, row: Element): boolean {
  const target = event.target;
  if (!(target instanceof Element) || !row.contains(target)) return false;
  const control = target.closest(INTERACTIVE);
  return !control || !row.contains(control) || control === row;
}

/** The card grid's `onMouseDown`: Shift-clicking a card is a range selection, and this keeps the browser from painting the text between the two clicks as a selection.
 *  Only the press is intercepted; `click` still bubbles up to the selection logic. */
export function suppressShiftTextSelection(event: MouseEvent): void {
  if (event.shiftKey) event.preventDefault();
}
