/* The glass action bar stuck under the top bar: a small heading followed by a row of capsule keys, or a two-row filter
 * overlay.
 *
 * The material (the two drift blobs, slanted light, inset edge and drop shadow) is provided in one place by
 * `[data-glass-pane]` in `web/board.css`; geometry, saturation and text color in `../styles.css`'s `[data-filter-glass]`,
 * with high-contrast and reduced-transparency fallbacks on that same rule. The moment it sticks under the top bar,
 * `use-stuck.ts` marks `data-stuck` and the shadow switches to the raised tier. Capsule keys take the compact tier (32px),
 * transparent base, one `--glass-low` ring, switching on hover to a `--glass-rim` border over a `--glass-pick-fill` fill;
 * keys on glass are not BoardUI's solid buttons. */
import { useRef, type ReactNode, type RefObject } from 'react';
import { cx } from '@/utils/cx';
import { IconButton, type IconButtonProps } from '@/components/base/buttons/icon-button';
import { spinnerHtml } from '@peach/legacy/ui';

import { GlassDrift } from './glass-drift';
import { useStuck } from './use-stuck';
import { useHorizontalScroller } from './use-horizontal-scroller';
import './filter-glass.css';

const BusyIcon = ({ className }: { className?: string }) => <span aria-hidden className={className}
  dangerouslySetInnerHTML={{ __html: spinnerHtml('Processing') }} />;

/** Filter bar actions use the compact tier (`size="small"`, 32px) and the blue action surface. */
export function FilterIconButton({ label, icon, busy = false, busyStyle = 'spinner', onPress, ...props }:
  Omit<IconButtonProps, 'aria-label' | 'size' | 'onClick'> & { label: string; busy?: boolean; busyStyle?: 'spinner' | 'strand'; onPress(): void }) {
  return <IconButton {...props} data-filter-action="" size="small" icon={busy && busyStyle === 'spinner' ? BusyIcon : icon}
    aria-label={label} title={props.title || label} aria-busy={busy || undefined} aria-disabled={busy || undefined}
    onClick={() => { if (!busy) onPress() }} />;
}

export function FilterGlass({ title, children }: { title: string; children: ReactNode }) {
  const glass = useRef<HTMLDivElement>(null);
  useStuck(glass);
  return (
    <div ref={glass} role="group" aria-label={title} data-filter-glass data-glass-pane=""
      className="sticky top-topbar z-10 mb-5.5 flex flex-wrap items-center gap-x-2.5 gap-y-2 px-4 py-2.5">
      <h3 className="mr-1 text-body-medium">{title}</h3>
      {children}
      <GlassDrift />
    </div>
  );
}

/** The two-row pair: the filter overlays of the home, tags and entity pages. The top row is a horizontally scrolling line of
 *  filter pills; the bottom row is readouts and this screen's view controls. Geometry matches the shell's
 *  `.board-filter-frame`: top row 48px tall with 8px/12px padding, bottom row minimum 46px with 12px between cells. The whole
 *  block sticks under the top bar and remains the same pane of glass while stuck.
 *
 *  The entity page's pair differs slightly (top row 6px between cells, bottom row minimum 48px), and the top row does not
 *  scroll as a whole: the media keys at the left end are pinned and only the cell inside scrolls. Callers override these via
 *  `className`/`topClassName`/`bottomClassName`, with the later write winning through `cx`. `panes` are the sliding glass panes
 *  hung directly on the overlay root (`use-view-glide.ts`); `attrs` adds to the root the markers the shell recognizes
 *  (narrow-screen yielding looks for `data-filter-frame`). `busy` marks the bottom row: the readouts are waiting on this
 *  fetch, and motion in the bottom row that honors it (the shuffle key's stroke draw) runs along. When the top row has nothing
 *  to show, `top` is `null`, the whole row is not emitted, and the glass is bottom row only. */
export function FilterGlassRows(
  { label, topLabel, top, bottom, className, topClassName, bottomClassName, panes, attrs, busy, bottomRef }: {
    label: string;
    topLabel: string;
    top: ReactNode;
    bottom: ReactNode;
    className?: string;
    topClassName?: string;
    bottomClassName?: string;
    panes?: ReactNode;
    attrs?: Record<`data-${string}`, string>;
    busy?: boolean;
    bottomRef?: RefObject<HTMLDivElement | null>;
  },
) {
  const glass = useRef<HTMLDivElement>(null);
  const topScroll = useHorizontalScroller<HTMLDivElement>();
  const bottomScroll = useHorizontalScroller<HTMLDivElement>(bottomRef);
  useStuck(glass);
  return (
    <div ref={glass} role="group" aria-label={label} data-filter-glass data-glass-pane="" {...attrs}
      className={cx('sticky top-topbar z-10 mb-5.5 flex flex-col', className)}>
      {panes}
      {top === null ? null : (
        <div ref={topScroll} role="group" aria-label={topLabel} data-filter-row="top"
          className={cx('flex h-12 min-w-0 items-center gap-1.75 overflow-x-auto overscroll-x-contain px-3 py-2',
            topClassName)}>
          {top}
        </div>
      )}
      <div ref={bottomScroll} data-filter-row="bottom" aria-busy={busy || undefined}
        className={cx('flex min-h-11.5 min-w-0 items-center gap-3 px-3 py-2', bottomClassName)}>
        {bottom}
      </div>
      <GlassDrift />
    </div>
  );
}

/* Filter pills on the overlay: 8px radius, 13px text; unselected is a dashed `--glass-low` ring turning solid on hover; the selected
 * line and fill belong to the caller (tag-type pills take their own type color; see `../styles.css`'s `[data-tag-pill]`). */
const FILTER_PILL = 'flex h-8 flex-none cursor-pointer items-center gap-1.75 rounded-lg border border-dashed'
  + ' border-(--glass-low) bg-transparent px-2.5 text-body-2-regular leading-5 whitespace-nowrap text-inherit'
  + ' outline-none hover:border-solid focus-visible:ring-2 focus-visible:ring-border-focus-ring';

export function FilterPill(
  { children, pressed, onPress, className, ...data }:
  { children: ReactNode; pressed: boolean; onPress(): void; className?: string } & Record<`data-${string}`, string>,
) {
  return (
    <button type="button" {...data} aria-pressed={pressed} className={cx(FILTER_PILL, className)}
      onClick={onPress}>
      {children}
    </button>
  );
}

/* Action keys on the overlay: normally a thin `--glass-low` ring, hovering lifts a brightened glass like the home page's (material in `../styles.css`
 * `[data-glass-pill]`). Swapping only the fill would not read on light theme, where that white tier sits on an already whitish overlay. */
const PILL = 'h-8 cursor-pointer rounded-full border border-(--glass-low) bg-transparent px-3'
  + ' text-body-2-regular leading-none whitespace-nowrap text-inherit outline-none'
  + ' focus-visible:ring-2 focus-visible:ring-border-focus-ring'
  + ' aria-busy:cursor-wait aria-busy:opacity-55';

export function GlassPill(
  { children, onPress, busy = false }: { children: ReactNode; onPress(): void; busy?: boolean },
) {
  return (
    <button type="button" data-glass-pill="" className={PILL} aria-busy={busy || undefined} aria-disabled={busy || undefined}
      onClick={() => { if (!busy) onPress() }}>
      {children}
    </button>
  );
}
