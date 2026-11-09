/* The home filter bar (`catalog-filter` in-page component, ADR-0031 step 11b): data shape.
 *
 * The shell (Application's `buildBars` family) owns the catalog's filters, routing and fetching: both avatar rows, the tag
 * bar's members and pressed states, the four view keys, the readout, sort keys and layout are all computed by the shell and
 * passed as props; the island only renders. The moment filters change the shell pushes a new copy via `updateManagedRoute`
 * without remounting; pressed feedback (`aria-pressed` and the sliding glass) works because the shell pushes before sending
 * the request. All actions return to the shell and the island never assembles requests itself: sort, Shuffle and layout go
 * back to the shell and run through `loadCatalog`, which is `catalog-grid`'s existing refetch entry.
 *
 * The intersection bar, sort keys, Shuffle, the layout switch and the profile page's bar (`entity-filter`) are one list and
 * one set of components. */
import type { EntityComboItem, EntitySortKey, SegmentOption } from '../entity-filter/entity-filter';

export type { EntityComboItem, EntitySortKey, SegmentOption };

/** One performer in the avatar strip. The two layers inside the circle (initial and avatar image) are assembled by the legacy `entityFaceImg`: cropping,
 *  fallback image and async decoding all live there, and React does not own the nodes inside. */
export interface TierPerformer {
  name: string;
  ringHtml: string;
}

/** One entry in the labels row. `logo` is the square icon's address, empty when no logo is set, drawing only the first two characters. */
export interface TierStudio {
  name: string;
  logo: string;
  fallback: string;
}

export type TierKind = 'performers' | 'studios';

/** Two rows of avatars. Each row holds one full page the shell fetched this round; the island lays out one screen first, keeps going after you scroll to the right end, and when the held page runs out
 *  it asks for the next page through `actions.moreTops`. When `key` changes (different scope or a different batch) both rows start over. */
export interface CatalogTiers {
  key: string;
  performers: TierPerformer[];
  studios: TierStudio[];
}

/** One chip on the tag bar. An empty `n` means this active tag is not in this batch, so print no number: printing 0 would claim
 *  "nothing under this tag" while it is currently filtering a full screen of content. */
export interface CatalogTag {
  k: string;
  label: string;
  n: number | null;
  selected: boolean;
}

/** The four views on the left: All, Unwatched, Watch later, Marked. `href` is its own URL, and page changes still work before the React bundle arrives. */
export interface CatalogView {
  k: string;
  label: string;
  href: string;
}

/** The segmented controls to the right of the numbers: home and JAV each keep their own card layout. */
export interface CatalogLayout {
  name: 'home-layout' | 'jav-layout';
  label: string;
  value: string;
  options: readonly SegmentOption[];
}

export interface CatalogFilterActions {
  currentHref?(): string;
  /** One cell on the avatar strip: opens that person's profile page. */
  openEntity(kind: 'performer' | 'studio', name: string): void;
  /** One of the four views. */
  setView(view: string): void;
  toggleTag(tag: string): void;
  /** Removes one creator, label, or attribution chip from the intersection bar. */
  clearFilter(key: string): void;
  /** The "Clear all" at the end of the intersection bar. */
  clearAll(): void;
  setSort(key: string): void;
  /** Shuffle: the grid and all three tiers of members swap together, and the shuffle button spins until this Promise settles. */
  reshuffle(): Promise<void>;
  setLayout(value: string): void;
  /** A row has finished laying out its current batch and wants the next page. An empty array means the end. */
  moreTops(kind: TierKind): Promise<TierPerformer[] | TierStudio[]>;
}

/** Wiring still handed over by the legacy layer. */
export interface CatalogFilterHelpers {
  /** The horizontal scroll row wires up drag and mouse wheel (`wireDrag`). */
  wireDrag(row: Element | null): void;
  /** Wires only the wheel and the end fades, not dragging (`wireHorizontalScroller`): for outer rows that overflow only on narrow screens. */
  wireScroller(row: Element | null): void;
}

export interface CatalogFilterProps {
  /** Two avatar rows. Empty while the first screen is still waiting on the two aggregate queries: the rows and the tag bar hold placeholders with a faint shimmer, while the four view keys and the bottom row render as usual. */
  tiers: CatalogTiers | null;
  /** The shell has an avatar fetch in flight: only then do both rows carry the busy state. Pages that never fetch avatars keep `tiers` empty and do not count as waiting. */
  tiersPending: boolean;
  /** Empty library: the two rows and the tag bar collapse into one line of placeholder saying "content will live here". */
  empty: boolean;
  /** The tag bar's members, selected ones first; the first `tagFirst` are laid out up front, the rest continue after scrolling horizontally to the right end. */
  tags: CatalogTag[];
  tagFirst: number;
  views: readonly CatalogView[];
  /** Current view: '', fresh, later, flagged, trash. */
  state: string;
  /** The counts. Empty while fetching, replaced by a shimmer bar; `false` means this fetch failed, the counts collapse, and the grid's notice reports the failure and retry. */
  count: { total: number; shown: number } | null | false;
  /** Trash is a pending-cleanup queue: the numbers hang on the description line, and there is no bottom row here. */
  trash: boolean;
  sorts: EntitySortKey[];
  layout: CatalogLayout | null;
  /** A shuffle run: the three layers and the tags lay down a shimmer while the shuffle button spins. */
  refreshing: boolean;
  /** The filter bar is collapsed (profile, index and manage pages): the overlay's two rows do not render, leaving only the two avatar rows. */
  offscreen: boolean;
  combo: EntityComboItem[];
  /** The intersection bar only means something while the catalog covers the screen; it collapses when the index, profile or manage page covers the catalog. */
  comboHidden: boolean;
  /** The intersection bar's host (`#combo`): it lives in the body above the grid, not next to the filter bar. */
  comboHost: Element | null;
  actions: CatalogFilterActions;
  helpers: CatalogFilterHelpers;
}

/** How many to lay on the first screen and how many to append per pass. Every avatar in a row is an image to decode; rendering all in hand
 *  makes the first screen pay for someone who will probably never scroll that far. */
export const ROW_FIRST = 24;
export const ROW_BATCH = 12;
/** Fetch the next batch when this much is left before the right end: rendering begins only at that point, leaving a stretch of blank already under the hand. */
export const ROW_AHEAD = 320;
/** How many cells per row the empty library placeholder lays out, clipped by the container to the available width. */
export const EMPTY_SLOTS = 64;

/** Whether each of the two rows renders. Before the fetch returns, the placeholder follows the layout from the last time this machine rendered it: the empty row collapses after the fetch, so pre-rendering it
 *  means shifting a whole row. With no record or a broken record, render both rows. */
export interface TiersShape { performers: boolean; studios: boolean }

export const TIERS_SHAPE_KEY = 'peach.catalog.tiers.v1';

export function rememberedTiers(): TiersShape {
  try {
    const value = JSON.parse(localStorage.getItem(TIERS_SHAPE_KEY) || '{}') as Partial<TiersShape> | null;
    return { performers: value?.performers !== false, studios: value?.studios !== false };
  } catch { return { performers: true, studios: true } }
}

export function rememberTiers(shape: TiersShape): void {
  try {
    const value = JSON.stringify({ performers: shape.performers, studios: shape.studios });
    if (localStorage.getItem(TIERS_SHAPE_KEY) !== value) localStorage.setItem(TIERS_SHAPE_KEY, value);
  } catch { /* Next time, render both rows. */ }
}
