/* The entity profile page's body (ADR-0031 step 10e): the data shape of the whole block below the filter overlay.
 *
 * This block switches among three views: roster (agency performers, label studios), the video grid and the photo wall.
 * entity-page manages fetching and in-page views; the application domain controller writes the address through the single
 * history entry and pushes filter props.
 * The body renders from props and does not remount on view, filter or sort changes; actions return through the page interface
 * to the corresponding controller.
 *
 * The video grid is the library card grid's (`catalog-grid`) entity mode; the component is rendered directly here with the
 * cards' helpers, actions, layout and selection state passed through unchanged; the roster places the index page's cell
 * (`PeopleGrid`). */
import type { CatalogGridProps, MediaCardActions, MediaCardHelpers, MediaPage } from '../catalog-grid/types';
import type { IndexPerson, PeopleLayout, PersonAvatar } from '../index/index-data';

/** Which kind of thing this page currently shows, using the same vocabulary as the filter overlay's view buttons. */
export type EntityBodyView = 'people' | 'videos' | 'photos';

/** The roster: the batch that arrives with the profile. `kind` follows the index page's vocabulary: `performers` on the agency page,
 *  `studios` on the studio page; layout reads the same settings value as the index page. */
export interface EntityRoster {
  kind: 'performers' | 'studios';
  people: IndexPerson[];
  layout: PeopleLayout;
}

/** The card's legacy HTML segments, plus the image pick for a roster cell (the legacy `personRingHtml` fallback chain). */
export interface EntityBodyHelpers extends MediaCardHelpers {
  personAvatar(item: IndexPerson, entityKind: string, big: boolean): PersonAvatar;
}

/** Official samples for one of this person's videos (the `kind: code` sets in `/api/photos`). Sample URLs stay
 *  server-side; the wall and lightbox pass only the code and index. */
export interface EntityCodeSet {
  code: string;
  name?: string;
  n: number;
  release_date?: string;
  site_label?: string;
}

/** One local image (`items` of `/api/photos` and `/api/photo-set`). The whole entry is passed verbatim to the lightbox details. */
export interface EntityLocalPhoto { id: number; name?: string; [field: string]: unknown }

/** One sample cell. Large and thumbnail addresses are looked up server-side by code and index (`sampleQuery`). */
export interface EntitySamplePhoto {
  sample: true;
  code: string;
  position: number;
  total: number;
  name: string;
  source: string;
}

export type EntityWallPhoto = EntityLocalPhoto | EntitySamplePhoto;

/** The photo view screen. `codeSets` exists only for the full photo set (empty in catalog albums); segments sort before local images;
 *  `items` are the local images already fetched, with paging appended; `total` is the local image count, read by segment headers.
 *  `revision` is this screen's generation: incremented when the batch changes or when entering/leaving an album, the wall repaints from scratch, and continuation pages only append without bumping generation. */
export interface EntityPhotos {
  revision: number;
  codeSets: EntityCodeSet[];
  items: EntityLocalPhoto[];
  total: number;
  hasMore: boolean;
}

export type PhotoSize = 'small' | 'big';
export type PhotoLayout = 'fixed' | 'masonry';

/** The card actions plus the two from the photo wall. Opening a roster cell goes through its `openEntity`. */
export interface EntityBodyActions extends MediaCardActions {
  /** The lightbox's "show in file explorer" for local images. Success sends the receipt through the shell; failure returns a one-line reason. */
  revealSource(id: number): Promise<string>;
  /** The next page of local images. The shell pushes a longer `photos` in after fetching; on failure it throws and a retry appears under the key. */
  loadMorePhotos(): Promise<void>;
}

/** The pieces passed straight through from the card grid: layout, selection state, cache and skeleton are all the same instances the shell holds. */
type SharedGridProps = Pick<CatalogGridProps,
  'layout' | 'selectMode' | 'selected' | 'seekSeconds' | 'wireDrag' | 'skeletonHtml'
  | 'groupCollapse' | 'canLoadMore' | 'listScope' | 'restoreNavigation'>;

export interface EntityBodyProps extends SharedGridProps {
  kind: string;
  name: string;
  view: EntityBodyView;
  /** Only the agency and studio pages have it; `null` on other pages or when the batch is empty. */
  roster: EntityRoster | null;
  /** First page of the video view. `null` means the shell is fetching (filter, sort, or watch state changed): this cell lays a skeleton and waits,
   *  rather than leaving old cards on screen that disagree with the current filter. */
  items: MediaPage | null;
  /** The video list's epoch. The shell increments it for every new video request; the grid re-keys on it, and skeleton and continued pages start over. */
  revision: number;
  /** Continuation page. The shell carries filters and sort in its closure, matching the first page's terms exactly. */
  fetchPage: NonNullable<CatalogGridProps['fetchPage']>;
  /** The photo view screen; `null` before ever entering the photo view. */
  photos: EntityPhotos | null;
  /** Photo wall size tier and layout. The toggles render in the filter overlay and the top bar; this only reads them, stamped onto the wall's `data-size`/`data-layout`. */
  photoSize: PhotoSize;
  photoLayout: PhotoLayout;
  helpers: EntityBodyHelpers;
  actions: EntityBodyActions;
}
