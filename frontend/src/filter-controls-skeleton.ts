import { esc } from './core';
import { islandGlyph } from './island-skeleton';
import type { EntitySortKey, SegmentOption } from './react/entity-filter/entity-filter';
import { SEGMENTED_GLASS_TRACK, SEGMENT_GLASS } from './react/components/segmented';
import { catalogView } from './react/catalog-grid/catalog-view';

interface Layout { name: string; label: string; value: string; options: readonly SegmentOption[] }
const icon = (name: string) => name.startsWith('ri-')
  ? `<svg class="size-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><use href="#${name}"/></svg>`
  : islandGlyph(name, 'size-4 shrink-0');
export const FILTER_WAITING = 'inert aria-disabled="true" tabindex="-1" data-skeleton-control';
const segments = (label: string, value: string, options: readonly SegmentOption[]) =>
  `<span data-entity-layout="" class="${SEGMENTED_GLASS_TRACK}" role="radiogroup" aria-label="${esc(label)}">${options.map(([key, text, glyph]) =>
    `<span class="${SEGMENT_GLASS}" role="radio" aria-label="${esc(text)}" aria-checked="${key === value}" data-glass-segment=""${key === value ? ' data-selected=""' : ''} ${FILTER_WAITING}>${icon(glyph)}</span>`).join('')}</span>`;

/** Known controls keep their text, glyphs, and pressed state; while waiting to wire up, they cannot perform actions. When `folders` is false, do not draw the folder toggle
 *  (the JAV new-releases section has no folder browsing; the rest — refresh, card layout, card/list, and sort key — are drawn as usual). */
export function filterControlsSkeletonHtml(sorts: readonly EntitySortKey[], layout: Layout | null, { folders = true } = {}): string {
  const view = catalogView();
  const params = new URLSearchParams(location.search);
  const sizes = layout && view === 'cards' ? segments(layout.label, layout.value, layout.options) : '';
  const folder = folders ? `<button type="button" data-folder-mode-toggle="" aria-label="Folder mode" aria-pressed="${params.get('browse') === 'folders' || !!params.get('folder')}" ${FILTER_WAITING}>${icon('ri-folder-3-line')}</button>` : '';
  return `<span data-entity-sorts=""><button type="button" data-entity-batch="" data-filter-action="" aria-label="Shuffle" ${FILTER_WAITING}>${icon('shuffle')}</button>${sizes}${segments('Library display', view, [['cards','Cards','ri-layout-grid-line'],['list','List','ri-list-unordered']])}${folder}${sorts.map(sort =>
    `<button type="button" data-entity-sort="${esc(sort.key)}" aria-pressed="${sort.pressed}" ${FILTER_WAITING}>${esc(sort.label)}${sort.dir ? icon(sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') : ''}</button>`).join('')}</span>`;
}
