/* Props for the pending-state button. Its own module: the first-run page's standalone page bundle needs it but must not drag in the request wrapper behind `use-action`. */

/** Buttons while waiting: set `aria-busy` and `aria-disabled`, stay focusable, and do not use native `disabled`. */
export function busyProps(busy: boolean) {
  return busy ? { 'aria-busy': true, 'aria-disabled': true } as const : {};
}
