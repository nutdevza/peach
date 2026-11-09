/* The entity profile page's intersection bar, glass filter overlay and content-area header (ADR-0031 step 10d): data shape.
 *
 * entity-page and the application domain controller provide filters, counts, readouts and sort items, and this module only
 * draws those props.
 * Filter addresses are written by the controller and pushed in as new values via updateManagedRoute, without remounting;
 * pressed states update ahead of the content request.
 * Actions are handed back through interfaces to the page and controller; this module assembles no requests. */

/** Which kind of content this page currently holds. */
export type EntityView = 'people' | 'videos' | 'photos' | 'online';

/** The view keys at the left end. The shell omits them (`null`) when only one kind of thing exists: a lone key has nothing to switch. */
export interface EntityViewKeys {
  /** The group's accessible name: "Page view" when it has a roster, otherwise "Media type". */
  label: string;
  /** Roster key: talents on the agency page, the maker's labels on the maker page. */
  people: { label: string; count: number; icon: string } | null;
  /** Omitted when there are no local videos and only followed sources: the video view would be empty anyway and the page lands on online. */
  videos: { count: number } | null;
  photos: { count: number } | null;
  /** Updates bound to this creator within follows (ADR-0096); `count` matches the profile card's "N updates" line. */
  online: { count: number } | null;
}

/** A tag pill. `label` is already translated through the shell's `tagLabel`, and `n` is the number of videos with this tag on this page. */
export interface EntityFilterTag {
  k: string;
  label: string;
  n: number;
  selected: boolean;
}

/** One chip on the intersection bar: `clear` removes the creator, studio, or attribution line, `untag` removes one tag. */
export interface EntityComboItem {
  kind: 'clear' | 'untag';
  key: string;
  label: string;
}

/** A sort key. `ariaLabel` announces what pressing it produces (same as the row on the home page); `dir` is set only on the selected key. */
export interface EntitySortKey {
  key: string;
  label: string;
  pressed: boolean;
  dir: 'asc' | 'desc' | '';
  ariaLabel: string;
}

/** One segment of a segmented toggle: value, name, and the sprite glyph. */
export type SegmentOption = readonly [value: string, label: string, symbol: string];

/** The video view's header: sort keys, plus an extra card layout set in the JAV context. */
export interface EntityVideoHead {
  sorts: EntitySortKey[];
  jav: { layout: string; options: readonly SegmentOption[] } | null;
}

/** The photo view header. `back` true means inside one album: an "all photos" key on the left, and two extra source file keys on the right. */
export interface EntityPhotoHead {
  back: boolean;
  /** How many local images there are; 0 with samples only, and the shuffle button is omitted. */
  shuffle: boolean;
  layout: string;
  layouts: readonly SegmentOption[];
  /** The gallery id, which locates the source file keys; 0 on the full-page photo wall. */
  setId: number;
}

/** The online view's pieces, same overlay as the follows page: video/image round keys, a status row, source marks and tags, the bottom row's batch change,
 *  the photo wall's layout and "images only", and the sort key. Sources and tags count only this person's items (`author_facets`). */
export interface EntityOnlineHead {
  media: 'videos' | 'images';
  /** How many groups each tier has; with no image groups at all, the two buttons are omitted, same as the follows page. */
  mediaCounts: { videos: number; images: number } | null;
  photoLayout: string;
  photoLayouts: readonly SegmentOption[];
  imagesOnly: boolean;
  status: string;
  statuses: readonly (readonly [key: string, label: string])[];
  provider: string;
  providers: readonly (readonly [key: string, label: string])[];
  /** `cat` is the tag category recorded by the source; the pill picks its category color from it (`data-tag-cat`). */
  tags: readonly { k: string; label: string; n: number; selected: boolean; cat: string }[];
  sorts: EntitySortKey[];
}

export interface EntityFilterActions {
  /** Switch view (roster / videos / photos). */
  setView(view: EntityView): void;
  /** One of the four watch states. */
  setState(state: string): void;
  toggleTag(tag: string): void;
  /** Removes one creator, label, or attribution chip from the intersection bar. */
  clearFilter(key: string): void;
  /** The "Clear all" at the end of the intersection bar. */
  clearAll(): void;
  setSort(key: string): void;
  /** Shuffle. The video view signals waiting through the stat skeleton; the photo view's key spins on its own until this Promise settles. */
  reshuffle(): Promise<void>;
  setJavLayout(layout: string): void;
  setPhotoLayout(layout: string): void;
  /** The "All photos" entry in the gallery. */
  photoBack(): void;
  /** Online view: switching media, switching status, pressing or releasing one source or one tag, changing sort, shuffling, and the two image wall preferences. */
  onlineMedia(media: 'videos' | 'images'): void;
  onlineShuffle(): void;
  onlineImagesOnly(on: boolean): void;
  onlineStatus(status: string): void;
  onlineProvider(provider: string): void;
  onlineTag(tag: string): void;
  onlineSort(key: string): void;
}

/** Wiring and HTML still handed over by the legacy layer. */
export interface EntityFilterHelpers {
  /** The horizontal scroll row wires up drag and mouse wheel (`wireDrag`). */
  wireDrag(row: Element | null): void;
  /** Wires only the wheel and the end fades, not dragging (`wireHorizontalScroller`): for outer rows that overflow only on narrow screens. */
  wireScroller(row: Element | null): void;
  /** The album's two source file keys (`sourceTools`): locate, and reconcile against the catalog; photo details reuse the same pair. */
  sourceToolsHtml(setId: number): string;
  /** Wire the two above to `revealSource`/`syncMissing`; `done` reopens it after reconciliation changed this group. */
  wireSourceTools(root: Element): void;
}

export interface EntityFilterProps {
  kind: string;
  name: string;
  view: EntityView;
  views: EntityViewKeys | null;
  /** The current watch state: '', fresh, later, flagged. */
  state: string;
  states: readonly { k: string; label: string }[];
  tags: EntityFilterTag[];
  combo: EntityComboItem[];
  /** The sentence on the left of the table header; swapped for a skeleton while `busy`. */
  readout: string;
  busy: boolean;
  video: EntityVideoHead | null;
  photo: EntityPhotoHead | null;
  online: EntityOnlineHead | null;
  actions: EntityFilterActions;
  helpers: EntityFilterHelpers;
}

/** The things that only hold on the video view (watch state, tags, intersection bar). On photos and the roster they all count videos,
 *  and clicking them flips the view back to videos, so those two levels keep only the view button. */
export const videoOnly = (view: EntityView): boolean => view === 'videos';
