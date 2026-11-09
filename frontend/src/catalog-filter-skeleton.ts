/* The skeleton laid before the home filter bar (`catalog-filter` island) mounts.
 *
 * On cold start the two avatar rows and the tag bar wait on `/api/facets` and `/api/tops`, about a second; the React bundle is
 * also still in flight. During that time the shell lays this HTML into the host and the island swaps it wholesale on mount.
 * Structure and attributes follow the static state rendered by `react/catalog-filter/catalog-filter-page.tsx` (the overlay
 * geometry is `FilterGlassRows`'s merged classes), and geometry is defined in one place,
 * `react/catalog-filter/catalog-filter.css`, so the swap does not jump.
 *
 * The four view keys are decided by state and unaffected by this fetch, so they render in final form now: `href` is a real
 * address and the shell catches clicks by delegation on the host. Avatars and tags render only placeholders, and the readout
 * is one fixed-width shimmer. */
import { rememberedTiers, type CatalogFilterProps, type CatalogView } from './react/catalog-filter/catalog-filter';
import { islandShortcutsEntry } from './island-skeleton';
import { filterControlsSkeletonHtml } from './filter-controls-skeleton';

/** Cells per row, same as the island's `EMPTY_SLOTS` for empty-library placeholders, clamped to the available width by the container. */
const EMPTY_SLOTS = 64;

const esc = (value: string): string => value.replace(/[&<>"]/g, (ch) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string);

const slots = (html: string): string => html.repeat(EMPTY_SLOTS);

/** The placeholder cells for the actress or label row; the two rows in the JAV New Releases section also use this while waiting for data. */
export const tierPlaceholdersHtml = (kind: 'performer' | 'studio'): string =>
  slots(`<span data-catalog-placeholder="${kind}" aria-hidden="true"><span></span><span>&nbsp;</span></span>`);

export function catalogFilterSkeletonHtml(views: readonly CatalogView[], state: string, head?: Pick<CatalogFilterProps, 'sorts' | 'layout'>): string {
  const viewHtml = views.map((view) => `<a href="${esc(view.href)}" data-catalog-view="${esc(view.k)}"`
    + ` data-entity-press="" aria-pressed="${state === view.k}">${esc(view.label)}</a>`).join('');
  /* Both rows follow the structure from this machine's last render: the row that was empty last time stays collapsed after its fetch. */
  const shape = rememberedTiers();
  return `<div class="peach-react"><div class="contents" data-catalog-root="" data-loading="">`
    + `<div data-catalog-tiers="" aria-busy="true"${shape.performers || shape.studios ? '' : ' hidden'}>`
    + (shape.performers ? `<div data-catalog-tier="performers" data-skeleton="tiers">${tierPlaceholdersHtml('performer')}</div>` : '')
    + (shape.studios ? `<div data-catalog-tier="studios">${tierPlaceholdersHtml('studio')}</div>` : '')
    + `</div>`
    + `<div role="group" aria-label="Filter and sort" data-filter-glass="" data-glass-pane="" data-filter-frame=""`
    + ` data-catalog-frame="" class="sticky top-topbar z-10 mb-5.5 flex flex-col mx-4">`
    + `<div role="group" aria-label="Views and tags" data-filter-row="top"`
    + ` class="flex h-12 min-w-0 items-center overscroll-x-contain px-3 py-2 gap-1.5 overflow-visible">`
    + `<div data-catalog-scroll=""><div role="group" aria-label="Views" data-catalog-views="">${viewHtml}`
    + `<span data-entity-sep="" aria-hidden="true"></span></div>`
    + `<div data-catalog-tags=""><span data-catalog-placeholder="tag" aria-hidden="true">`
    + '<span></span>'.repeat(EMPTY_SLOTS) + `</span></div></div></div>`
    + `<div data-filter-row="bottom" aria-busy="true" class="flex min-w-0 items-center gap-3 px-3 py-2 min-h-12">`
    + `<span data-catalog-summary=""><span data-catalog-readout=""><span data-skeleton="count" aria-hidden="true"`
    + ` class="relative inline-block h-3.5 w-37.5 rounded-md align-middle skeleton-sheen"></span></span>${islandShortcutsEntry()}</span>`
    + (head ? filterControlsSkeletonHtml(head.sorts, head.layout) : '')
    + `</div></div></div></div>`;
}
