/* Adds a light prefix to BoardUI dropdowns. Dropdowns in toolbars and repeated blocks have no field label, and the selected
 * value alone cannot say what is being chosen, so the prefix is written before the value inside the box ("Sort", "Source",
 * "Media library"), while screen readers still read `aria-label`. The upstream copy is unchanged; the prefix enters the value
 * area via `renderValue`; the value area carries 5px (4px at `sm`) spacing, and the prefix adds its own, leaving 8px (6px at
 * `sm`) between prefix and value. */
import type { ReactNode } from 'react';
import type { SelectValueRenderProps } from 'react-aria-components';
import { Select as BoardSelect, type SelectProps as BoardSelectProps } from '@/components/base/select/select';

export { SelectItem } from '@/components/base/select/select';

export interface SelectProps<T extends object> extends BoardSelectProps<T> {
  /** The muted label before the value inside the box, for sighted users only and excluded from the accessible name. */
  prefix?: ReactNode;
}

export function Select<T extends object>({ prefix, renderValue, size, ...props }: SelectProps<T>) {
  if (prefix === undefined || prefix === null) return <BoardSelect {...props} size={size} renderValue={renderValue} />;
  const gap = size === 'sm' ? 'me-0.5' : 'me-0.75';
  // React Aria calls the value area's render function with `defaultChildren` (the selected item's own content), which the upstream parameter type omits.
  const value = (values: SelectValueRenderProps<T>): ReactNode => (
    <>
      <span aria-hidden className={`shrink-0 text-text-tertiary ${gap}`}>{prefix}</span>
      {typeof renderValue === 'function' ? renderValue(values)
        : renderValue ?? (values as SelectValueRenderProps<T> & { defaultChildren?: ReactNode }).defaultChildren}
    </>
  );
  return <BoardSelect {...props} size={size} renderValue={value} />;
}
