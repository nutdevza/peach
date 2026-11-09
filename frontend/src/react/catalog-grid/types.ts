/* The library card grid's external contract: props, card layout, and the helpers and actions the shell passes down.
 *  Entry and pagination shapes follow `/api/items` (`src/peach/web_router.py`). */

import type { FaceRef } from '@peach/card-art';
/** A reference to one entity on the card's attribution line: both the avatar image and its crop come from here. */
export interface MediaEntityRef extends FaceRef { id: number }

/** One `/api/items` entry. Only the fields the card reads are listed; the rest come through as-is, since the shell's cache needs the whole entry. */
export interface MediaItem {
  id: number;
  root_id?: string;
  library_id?: string;
  name?: string;
  code?: string;
  is_jav?: boolean;
  medium?: string;
  location?: string;
  cost?: string;
  size?: number | null;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  rating?: number | null;
  o_count?: number | null;
  /** The current profile has tapped "like": the list API gives 1, while the same entry written back by the detail page is `true`. */
  liked?: boolean | number | null;
  first_seen?: string | null;
  last_played?: string | number | null;
  release_date?: string | null;
  play_seconds?: number | null;
  play_count?: number | null;
  leave_ratio?: number | null;
  has_cover?: boolean;
  cover_key?: string;
  /** The cover file's content version, spliced into the cover address's `&v=`. */
  cover_version?: string;
  has_thumb?: boolean;
  has_local_poster?: boolean;
  follow_thumb_url?: string;
  follow_item_id?: number | null;
  follow_tags?: string[];
  tags?: string[];
  performers?: string[];
  performer_entities?: (MediaEntityRef | null)[];
  performer_total?: number;
  creator?: string;
  creator_entity?: MediaEntityRef | null;
  studio?: string;
  why?: string;
  /** Keep watching: tags shared with the current work, rarer ones first (`/api/related`). */
  why_tags?: string[];
  feedback?: string;
  disposal?: string;
  disposal_reason?: 'manual' | 'junk' | 'duplicate' | 'missing' | null;
  watch_later?: boolean;
  part_group?: {
    key: string; seed_id: number; count: number; title?: string; total_size?: number; total_duration?: number;
  } | null;
  edition_group?: { key: string; seed_id: number; count: number; editions: string[] } | null;
  [field: string]: unknown;
}

/** One page of `/api/items`. The first page carries the total; later pages only say whether more remain. */
export interface MediaPage { items: MediaItem[]; total?: number; work_total?: number; has_more?: boolean }

export interface MediaPageOptions { limit: number; sort?: string; dir?: string }

/** This screen's card layout. `active` means the code layout switch is in effect (JAV mode or home layout), `size` is large/small images,
 *  `portrait` means this screen's whole column is portrait (explicitly filtered), `javImage` is the "JAV default cover" setting. */
export interface MediaCardLayout { active: boolean; size: 'big' | 'small'; portrait: boolean; javImage: string }

/** The card's HTML segments still assembled by the legacy layer. Cover, avatar, and hover preview come straight from `@peach/card-art`. */
export interface MediaCardHelpers {
  /** The source badge (the legacy layer's `srcBadge`). */
  badgeHtml(location: string, cost: string): string;
  /** The title's HTML: code + edition badge + film name; non-coded videos use the escaped name (the legacy layer's `javTitleHtml`). */
  titleHtml(item: MediaItem, raw: string): string;
  /** Plain text of the same title, for the accessible name (the legacy layer's `javDisplayName`). */
  displayName(item: MediaItem, raw: string): string;
  /** Tag key to display name. */
  tagLabel(tag: string): string;
}

/** The card's actions. Opening and paging belong to the shell: detail, immersive mode and the mini player are the legacy layer's full-page views. */
export interface MediaCardActions {
  /** The play wall reuses the stage's single player; on exit the playing instance can be handed to the mini player. */
  wallPlayer?(item: MediaItem, frame: HTMLElement, signal: AbortSignal): Promise<(continuePlaying?: boolean) => void>;
  /** Opens details and claims the instance of the same video that is already playing. */
  wallDetails?(item: MediaItem, anchor: HTMLElement): void;
  /** Opens a video card: with the mini player open it swaps the video there, volume and edition groups go into their own queues, everything else opens detail. */
  open(item: MediaItem, anchor: HTMLElement): void;
  /** One card in the trash: videos open details, local images open the original in a new tab, everything else toggles selection. */
  openResource(item: MediaItem, anchor: HTMLElement): void;
  /** One card in the portrait band: immersive mode starts from it. */
  openShort(item: MediaItem): void;
  /** The button on the portrait band's title: enters immersive mode. */
  openShorts(): void;
  /** Open a Mix seeded with this entry. */
  openMix(seedId: number, anchor: HTMLElement): void;
  openEntity(kind: string, name: string): void;
  /** Open the "Unassigned" batch. */
  openUnowned(): void;
  /** A tag on the card: filter by just this tag, or cancel if it is already the active filter. It takes effect on whichever screen it was clicked on. */
  toggleTag(tag: string): void;
  /** Toggles one card's selection; `range` is a Shift-held range select. */
  toggleSelection(id: number, range: boolean): void;
  /** Toggle watch later. Writes the ledger; both success and undo pass the new value back to `onChange`, and failures are reported by the shell. */
  watchLater(item: MediaItem, onChange: (on: boolean) => void): Promise<void>;
  /** Sets the star rating; success and undo return the server's rating, while the busy state and inline errors are the caller's to render. */
  rate(item: MediaItem, star: number, onChange: (rating: number | null) => void, signal?: AbortSignal): Promise<void>;
  /** The key on the trash card: restore or move into trash. Writes the ledger, re-reads the catalog when done and offers undo; the shell reports failures, then the error rethrows. */
  resourceOperation(item: MediaItem, operation: 'restore' | 'dispose'): Promise<void>;
  /** Related videos needed by Mix paging, fetched once per seed and shared with the queue after opening. */
  mixRelated(seedId: number): Promise<MediaItem[]>;
  /** Whether hover paging is allowed right now: returns false during multi-select, occlusion, reduced motion and scrolling. */
  canFlip(): boolean;
}

/** Library card grid. Three data modes:
 *  - `catalog`: the catalog (`/` and filtered states, trash), the filter state passed along by the shell's `state`;
 *  - `entity`: the profile page's video section, data provided by the shell (`fetchPage`), the first page fetched together with the page header (`initial`);
 *  - `items`: a batch the shell already holds (Continue watching on the details page), no fetching. */
export interface CatalogGridProps {
  mode: 'catalog' | 'entity' | 'items';
  /** Standalone fullscreen playback wall. */
  wall?: boolean;
  /** On a history back, reuse the pagination the same collection already loaded. */
  restoreNavigation?: boolean;
  helpers: MediaCardHelpers;
  actions: MediaCardActions;
  layout: MediaCardLayout;
  selectMode: boolean;
  selected: ReadonlySet<number>;
  seekSeconds: number;
  /** Refresh epoch: incremented when the shell asks for a re-read; queries then change key and refetch without remounting. */
  revision: number;
  /** The skeleton's HTML (legacy layer `pageSkeletonHtml`), the same copy the shell lays on the first screen. */
  skeletonHtml(): string;
  /** Horizontal rows get drag scrolling wired in (legacy `wireDrag`). */
  wireDrag(el: HTMLElement): void;
  /** One fetch settled (success, empty, or failure): `revision` is that run's epoch, and the shell releases the callers waiting on it based on this. */
  settled?(revision: number): void;

  /* catalog mode */
  filters?: Readonly<Record<string, string>>;
  batchSize?: number;
  groupCollapse?: boolean;
  /** The home default list excludes portrait (the portrait strip covers it); the criterion belongs to the shell. */
  excludeVertical?: boolean;
  /** A Mix is inserted at position 8 on every page. */
  mix?: boolean;
  /** Insert one portrait strip with each page loaded. */
  shorts?: boolean;
  /** Reports once per appended page: total count and currently displayed card count (Mix and the portrait strip excluded). The shell updates the filter bar's count from this and repaints the batch bar,
   *  and trash writes the count onto its explainer line. */
  onCount?(total: number, shown: number): void;
  /** First-screen fetch failed: there is nothing to report, so the shell retires the filter bar's shimmer stat. */
  onCountFailed?(): void;
  /** Empty-state HTML. `libraryEmpty` means the library has no videos at all yet. */
  emptyHtml?(state: { trash: boolean; libraryEmpty: boolean }): string;
  /** Whether auto-pagination may run now: not while admin or an index page covers the catalog. */
  canLoadMore?(): boolean;

  /* entity mode */
  entityKey?: string;
  listScope?: string;
  initial?: MediaPage | null;
  fetchPage?(offset: number, signal: AbortSignal, options?: MediaPageOptions): Promise<MediaPage>;

  /* items mode */
  items?: MediaItem[];
  variant?: 'grid' | 'next';
}
