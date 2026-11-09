/* Page section tabs: neutral-filled selected state, with arrow key support and horizontal scrolling on narrow screens. */
import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { PillTabList } from './pill-tabs';

import { spriteGlyph } from './sprite-glyph';
import { useHorizontalScroller } from './use-horizontal-scroller';
import type { useSidebarReorder } from '../sidebar/use-sidebar-reorder';
import type { NavigationGroup } from '../../navigation-order';

export interface BoardTab<V extends string> {
  value: V;
  label: string;
  /** A glyph name from the legacy sprite sheet, given only when it points at an object (label, agency, local, subscription feed). */
  symbol?: string;
  badge?: ReactNode;
}

export interface BoardTabsProps<V extends string> {
  tabs: readonly BoardTab<V>[];
  value: V;
  label: string;
  onChange(value: V): void;
  className?: string;
  itemClassName?: string;
  orientation?: 'horizontal' | 'vertical';
  disabled?: boolean;
  panelPrefix?: string;
  sectionItems?: boolean;
  listRef?: RefObject<HTMLDivElement | null>;
  reorder?: ReturnType<typeof useSidebarReorder>;
  orderGroup?: NavigationGroup;
}

/** The count badge hanging after tab and group titles (the legacy layer's `.ui-board-tab-count` twin): 12/16 semi-bold, primary text at 10%
 *  backing, the whole block at fifty percent; a footnote, not a reading. The criteria come from the caller; the badge does not count by itself. */
export function TabCount({ value }: { value: number }) {
  return (
    <span data-tab-count=""
      className="ml-1.5 inline-block rounded-sm bg-text-primary/10 px-1 py-px text-caption-1-medium text-text-primary opacity-50">
      {value.toLocaleString()}
    </span>
  );
}

const TAB = 'relative flex flex-none cursor-pointer items-center whitespace-nowrap rounded-md'
  + ' px-3 py-2 text-body-regular text-text-secondary outline-none'
  + ' focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-border-focus-ring'
  + ' hover:text-text-primary aria-selected:bg-background-tertiary-default aria-selected:text-text-primary'
  + ' max-board-narrow:px-2.25 max-board-narrow:text-body-2-regular';

export function BoardTabs<V extends string>(
  { tabs, value, label, onChange, className = 'mb-5.5', itemClassName = TAB, orientation = 'horizontal',
    disabled = false, panelPrefix, sectionItems, listRef, reorder, orderGroup }: BoardTabsProps<V>,
) {
  const ownList = useRef<HTMLDivElement>(null);
  const list = listRef ?? ownList;
  const scrollRef = useHorizontalScroller(list, orientation === 'horizontal');

  useLayoutEffect(() => {
    const host = list.current;
    if (!host) return;
    const measure = () => {
      const selected = host.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!selected || !selected.offsetWidth) return;
      /* On narrow screens this row scrolls horizontally: when the selected chip falls outside the visible area the row shifts to reveal it fully, moving only the row, never the page. */
      const left = selected.offsetLeft, right = left + selected.offsetWidth;
      if (left < host.scrollLeft) host.scrollLeft = left;
      else if (right > host.scrollLeft + host.clientWidth) host.scrollLeft = right - host.clientWidth;
    };
    measure();
  }, [value]);

  /* Left and right arrows move within the row, Home/End jump to the ends, and landing on a key selects it: every key in this row is a URL,
     and where focus rests is where the page goes, the same rule as sidebar navigation. */
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
    const focused = (event.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab ?? value;
    const at = tabs.findIndex((tab) => tab.value === focused);
    const next = ['ArrowDown', 'ArrowRight'].includes(event.key) ? at + 1
      : ['ArrowUp', 'ArrowLeft'].includes(event.key) ? at - 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -2;
    if (next === -2) return;
    event.preventDefault();
    const target = tabs[(next + tabs.length) % tabs.length];
    list.current?.querySelector<HTMLElement>(`[data-tab="${target.value}"]`)?.focus();
    if (target.value !== value) onChange(target.value);
  };

  return (
    <PillTabList ref={scrollRef} role="tablist" aria-label={label} aria-orientation={orientation}
      data-board-tab-list="" data-pill-nav="" data-section-items={sectionItems ? '' : undefined}
      data-navigation-order={orderGroup} data-navigation-axis={orientation === 'vertical' ? 'y' : 'x'}
      data-reordering={reorder?.picked ? '' : undefined} onClickCapture={reorder?.clickCapture} onKeyDown={onKeyDown}
      className={`relative flex flex-none gap-1 ${orientation === 'vertical' ? 'flex-col items-stretch' : 'overflow-x-auto max-board-narrow:gap-0'} ${className}`}>
      {tabs.map((tab) => {
        const Glyph = tab.symbol ? spriteGlyph(tab.symbol) : null;
        const selected = tab.value === value;
        return (
          <button key={tab.value} type="button" role="tab" data-tab={tab.value} aria-selected={selected}
            id={panelPrefix ? `${panelPrefix}-tab-${tab.value}` : undefined}
            aria-controls={panelPrefix ? `${panelPrefix}-panel-${tab.value}` : undefined}
            aria-label={tab.label} disabled={disabled} data-disabled={disabled ? '' : undefined}
            aria-keyshortcuts={reorder ? orientation === 'vertical' ? 'Alt+ArrowUp Alt+ArrowDown' : 'Alt+ArrowLeft Alt+ArrowRight' : undefined}
            data-pill-selected={selected ? '' : undefined} data-pill-variant="gray"
            data-dragging={reorder?.picked?.key === tab.value ? '' : undefined}
            style={{ '--navigation-picked-left': `${reorder?.picked?.bounds.left || 0}px`,
              '--navigation-picked-top': `${reorder?.picked?.bounds.top || 0}px`,
              '--navigation-picked-width': `${reorder?.picked?.bounds.width || 0}px`,
              '--navigation-picked-offset': `${reorder?.picked?.offset || 0}px`,
              '--sidebar-nudge': `${reorder?.nudge(tab.value)?.distance || 0}px`,
              '--sidebar-delay': `${reorder?.nudge(tab.value)?.delay || 0}ms` } as CSSProperties}
            {...reorder?.bindings(tab.value)}
            tabIndex={selected ? 0 : -1} className={itemClassName}
            onClick={() => { if (!selected) onChange(tab.value) }}>
            {Glyph ? <Glyph className="mr-1.5 size-(--icon-inline)" /> : null}
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
      {reorder?.hint ? <span data-navigation-drop-line="" aria-hidden="true"
        style={{ '--navigation-line': `${reorder.linePosition}px` } as CSSProperties}><span /></span> : null}
    </PillTabList>
  );
}
