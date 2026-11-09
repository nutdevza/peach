import type { ComponentType } from 'react';
import { useFocusVisible } from 'react-aria';
import { RiArrowDownLine, RiArrowUpLine } from '@remixicon/react';

type Icon = ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;

/** Both icons stay mounted and share ui-kit's state-change transition; the direct button's data-icon-state can drive them too. */
export function IconSwap({ a: First, b: Second, state, className }: {
  a: Icon; b: Icon; state?: 'a' | 'b'; className?: string;
}) {
  const { isFocusVisible } = useFocusVisible();
  return <span aria-hidden className={`iconswap ${className || ''}`} data-icon-swap="" data-icon-state={state}
    data-motion-instant={isFocusVisible || undefined}>
    <span data-icon="a"><First className="size-full" /></span>
    <span data-icon="b"><Second className="size-full" /></span>
  </span>;
}

/** The BoardUI button keeps the same leadingIcon; direction state belongs to the button. */
export function SortDirectionIcon({ className }: { className?: string }) {
  return <IconSwap a={RiArrowUpLine} b={RiArrowDownLine} className={className} />;
}
