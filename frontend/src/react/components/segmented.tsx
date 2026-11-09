/* The segmented control's selected face moves independently; text, focus and business state update at once. */
import { RadioGroup, TabList, type RadioGroupProps, type TabListProps } from 'react-aria-components';
import { useMovingSurface } from './use-moving-surface';
import { useHorizontalScroller } from './use-horizontal-scroller';

export function SegmentedTabList<T extends object>(props: TabListProps<T>) {
  const ref = useHorizontalScroller(useMovingSurface('selection'));
  return <TabList {...props} ref={ref} />;
}

export function SegmentedRadioGroup(props: RadioGroupProps) {
  const ref = useHorizontalScroller(useMovingSurface('selection'));
  return <RadioGroup {...props} ref={ref} />;
}

/** The track. Its width hugs the content and it scrolls horizontally itself on narrow screens, never widening the page into a scrollbar. */
export const SEGMENTED_TRACK = 'inline-flex w-max max-w-full items-center gap-0.5 overflow-x-auto'
  + ' overscroll-x-contain rounded-2lg bg-background-tertiary-default p-1';

/* In dark mode the selected face uses `background-primary-hover`: dark's `background-primary-default` and the track
 * (`background-tertiary-default`) are the same neutral-800 tier, invisible when painted. */
/* At phone width each cell gives up 2px on both sides: the four tabs fit exactly in a 320-wide track without the last character clipped by the track. */
export const SEGMENT = 'flex min-h-7 flex-none cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 max-sm:px-2'
  + ' text-body-medium whitespace-nowrap text-text-secondary outline-none transition-colors'
  + ' hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring'
  + ' data-focus-visible:ring-2 data-focus-visible:ring-border-focus-ring'
  + ' data-selected:bg-background-primary-default data-selected:text-text-primary data-selected:shadow-card'
  + ' dark:data-selected:bg-background-primary-hover';

/** Hosts using `aria-selected` instead of `data-selected` (a hand-written `<button role="tab">`) use this string. */
export const SEGMENT_ARIA = 'flex min-h-7 flex-none cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 max-sm:px-2'
  + ' text-body-medium whitespace-nowrap text-text-secondary outline-none transition-colors'
  + ' hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring'
  + ' aria-selected:bg-background-primary-default aria-selected:text-text-primary aria-selected:shadow-card'
  + ' dark:aria-selected:bg-background-primary-hover';

/** The glyph-only tier (layouts, large/compact): square cells, 16px glyphs, paired with the `SEGMENTED_TRACK` above. */
export const SEGMENT_ICON = 'flex size-7 flex-none cursor-pointer items-center justify-center rounded-md'
  + ' text-text-secondary outline-none transition-colors'
  + ' hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus-ring'
  + ' data-focus-visible:ring-2 data-focus-visible:ring-border-focus-ring'
  + ' data-selected:bg-background-primary-default data-selected:text-text-primary data-selected:shadow-card'
  + ' dark:data-selected:bg-background-primary-hover';

/* The tier on the glass overlay. The flat surface's look (gray track backing an opaque white thumb) placed on an overlay becomes the only solid
 * face in the whole strip and reads like another control stuck on: remove the track, drop the text color to sixty percent of this glass's own text color, and
 * swap the selected cell to the overlay-selected glass (`[data-glass-segment]` in `../styles.css`). */
export const SEGMENTED_GLASS_TRACK = 'inline-flex w-max max-w-full flex-none items-center gap-0.5 rounded-lg';

export const SEGMENT_GLASS = 'relative flex size-8 flex-none cursor-pointer items-center justify-center rounded-lg'
  + ' text-(--glass-text)/62 outline-none transition-colors hover:text-(--glass-text)'
  + ' focus-visible:ring-2 focus-visible:ring-border-focus-ring data-selected:text-(--glass-text)';
