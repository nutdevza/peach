/* Capabilities Application hands the route tree, delivered via Context to the pages it renders.
 *
 * Only two kinds of things live here: switching to screens still owned by the shell (catalog, profile page, details, follows,
 * junk files), and state or receipts only the shell has (Toast, preference store, one-shot context). Pure lookup helpers
 * (`tagLabel`, `javTitleHtml`) are imported by pages directly from `@peach/legacy/*`; values computable only per open
 * (read-only state, the category and tab on the address, onboarding flags) follow that open and stay out of here. */

import type { OverlayTarget } from '@peach/history';
import type { ConfigurationPath } from '@peach/history';

import type { LibraryProcessingProps } from '../bundle';
import type { CatalogFilterProps } from '../catalog-filter/catalog-filter';
import type { CatalogGridProps, MediaCardActions, MediaCardHelpers } from '../catalog-grid/types';
import type { EntityPageProps } from '../entity-page/entity-page';
import type { FeedNewProps } from '../feed-new/feed-new';
import type { OnlineAuthor } from '../follow/online-vocab';
import type { FollowFeedProps } from '../follow-feed/follow-feed';
import type { IndexKind, IndexPerson, IndexRoute, PeopleLayout, PersonAvatar } from '../index/index-data';
import type { JunkQueueProps } from '../junk-queue/junk-queue';
import type { SearchProps } from '../search/search';

export interface ShellActions {
  openSettings?(section: string): Promise<unknown>;
  closeSettings?(): void;
  /** Open video details (stage). */
  openItem(id: number): void;
  /** Opens an entity profile page. `kind` is `creator`/`performer` and so on. */
  openEntity(kind: string, name: string): void;
  /** Return to catalog filtered by this tag. */
  openTag(key: string): void;
  /** Clicking a rank on the taste page: a tag filters the catalog, a person's name opens their profile page. */
  openTasteSignal(kind: string, name: string): void;
  /** Moves to a path: pushes an unclaimed URL, draws a page open counter just like back and forward, and the page group opens the matching page by match. */
  navigate(path: string): void;
  /** Enter a screen by manage-area identity (the first route in the table whose `section` equals it; unrecognized identities fall to junk files). */
  openManage(section: string): void;
  /** The path matching an admin identity; an empty string when the route table has no such identity. */
  managePath(section: string): string;
  /** Go to the "view updates" page (`/follow`). */
  openFollow(): void;
  /** A past-tense receipt (`actionReceipt`); with `undo` given it carries an undo button. */
  receipt(message: string, options?: { undo?: () => Promise<void> }): void;
  /** The site-wide Toast as-is (`toast`): `sound` picks the alert tone. */
  toast(message: string | { text: string }, options?: { sound?: string }): void;
  /** A failure receipt (`actionFailure`): `action` is the thing that did not go through. */
  failure(action: string, error: unknown): void;
  /** Show this file in Explorer; on failure, return the reason. */
  revealSource(id: number): Promise<string>;
  /** Make the setup guide appear again. */
  reopenTutorial(): Promise<void>;
  /** The review page writes the category back to the address bar instead of reopening. */
  routeReview(params: { category: string; queue?: string }): void;
  /** The follows management page writes tab, page number, and sort back to the address bar without reopening. */
  routeFollowManage(params: { tab: string; page: number; sort: string; dir: string }): void;
  /** Preferences changed on the follows management page; storage is owned by the shell. */
  saveFollowPreference(patch: { pageSize?: number; layout?: string }): void;
  /** The HTML of the source badge (including the paid marker). */
  srcBadge(location: string, cost: string): string;
  /** The index page writes the filter term, scope, view, and type back to the URL bar without reopening. `replace` is for cases like typed filtering, where every step rewrites. */
  routeIndex(params: IndexRoute, options?: { replace?: boolean }): void;
  /** When the index page's layout preference changes, storage belongs to the shell (the profile page's roster reads it too). */
  savePeopleLayout(patch: { layout: PeopleLayout }): void;
  /** Exit top bar selection mode: keys go back to the shell. */
  exitSelectMode(): void;
  /** A local roster cell's avatar (the HTML inside the round frame and the face framing); the fallback chain lives in the shell, one copy. */
  personAvatar(item: IndexPerson, entityKind: string, big: boolean): PersonAvatar;
  /** The avatar HTML for an online creator cell: profile avatar first, archive as fallback, and the initial letter when neither exists. */
  authorAvatar(author: OnlineAuthor): string;
  /** Back to the catalog, filtered by this one or these local tags. */
  showIndexTags(tags: string[], match: 'any' | 'all'): void;
  /** Go to the follows page filtered to updates from this creator or this online tag only. */
  openFollowAuthor(key: string): void;
  openFollowTag(tag: string): void;
  /** Open a playlist's playback queue (the stage), resuming from the `resumeAssetId` one. */
  openPlaylist(id: number, resumeAssetId: number): void;
  /** Whether hover paging is allowed right now: returns false during shell multi-select, occlusion, reduced motion and scrolling. */
  canFlip(): boolean;
  /** The page group changed pages: reported once when the route tree's page element mounts, before it starts fetching. The shell retracts the previous page's surfaces (hover preview, in-flight read requests,
   *  the home new-releases row, that page in other containers), then expands by kind: admin, follows, and playlist pages lay out `#stats`; index, profile, and catalog lay out the home side. */
  surfaceChanged(kind: SurfaceKind, path: string): void;
  /** Clear the top bar search box (with a dispersing afterimage). */
  clearSearch(): void;
  /** Opens immersive mode starting at the `id` entry; from the top when omitted. The caller owns the address. */
  openImmerse(id?: number): void;
  /** Opens the item at the overlay address (video detail, a queue item, or follow detail); the address is already there and is not written again. */
  openOverlay(target: OverlayTarget): void;
  /** Consumes one queue-open intent: wait for the queue to settle its actual entries, then write the detail address only after the first screen is determined. */
  openQueueRequest?(): void;
  /** Collapse while the details stage is open (the playing video still goes to the mini player), without writing the address. */
  closeStage(): void;
  /** Helpers and actions for catalog grid cards: one each in the shell with stable identity (cards compare by reference), shared by the profile page's video section and the catalog. */
  readonly grid: { helpers: MediaCardHelpers; actions: MediaCardActions };

  // ── Element helpers for the index and profile pages (`pages/index-entity.tsx`): everything they read is state only the shell has ──
  /** Whether this machine can change settings: the value probed once at shell startup, handed from the index page to the page. */
  configurable?(): boolean;
  /** Reports once after the opened page's first screen has painted: index pages have the shell sync the sidebar and top bar and arrange stickiness; profile pages have the shell repaint the top
   *  three layers for this page's context. */
  surfaceShown?(kind: 'index' | 'entity', path: string): void;
  /** The profile page pieces that still live in the shell. */
  readonly entity?: EntityPageShell;

  // -- Used by follows and playlist (`pages/follow.tsx`) --
  /** The follows page pieces that still live in the shell. */
  readonly follow?: FollowFeedShell;

  // ── Catalog use (`pages/catalog.tsx`): the source online table, search box, top three tiers, and fetching all still live in the shell ──
  /** The steps that hand control back to the shell when the home page, three filter states, trash, and junk files open or refetch. */
  readonly catalog?: CatalogShell;
}

/** What the follows page element hands back to the shell on open. The filters copy is read from the address into the shell's own variables (used to write the address when returning to the follows page; the sidebar, tag
 *  drawer, and follows details read it too), and the selection sets, photo wall preference, and the helpers and actions the page borrows also live in the shell; the entry skeleton and cold start lay the same one. */
export interface FollowFeedShell {
  /** Read the filters from the address. If the follows page is still painted in `#stats` (only hidden when the profile page covers it), expand it, pushing over
 *  the filters, sampling seed, and a new refresh generation; the photo wall follows and returns to the top, returning true; if not painted, return false and the element opens the whole page. */
  refresh(restored?: Pick<FollowFeedProps, 'view' | 'seed' | 'revision'>): boolean;
  /** The page-entry skeleton. */
  skeleton(): string;
  /** Props handed to the page on a full-page open: filters, the sampling seed and refresh epoch, the selection set, the photo wall preference, and the shell's own copy of helpers and actions. */
  props(): FollowFeedProps;
  /** The layer under follows details (deep link, or back/forward landing on follows details while the list is not painted): if the stage's open surface is not follows details, retract it first, then expand
   *  the admin side; if the list is still painted in `#stats` leave it as is, otherwise clear `#stats`, and the list waits for details to close before opening. */
  ground(): void;
}

/** The steps by which the catalog element hands back to the shell. Filters are written by the element into `@peach/shell`'s `state` per the URL; everything after that belongs to the shell. */
export interface CatalogShell {
  /** Sources used when the address carries no `loc`: the defaults minus whichever are off disk right now (the snapshot the shell records at startup and on re-detection). */
  defaultLoc(): string;
  /** Open this page against the freshly written `state`: returning home from elsewhere (`entering`) first invalidates the top three layers' cache; trash clears the search box and expands the home
   *  side; other pages align the search box to `state.q`; then sync sidebar and top bar, repaint the top three layers, and fetch the catalog. `retitle`: the address was just rewritten by an element,
   *  so title and tutorial state are re-read along. */
  open(path: string, options?: { entering?: boolean; retitle?: boolean }): void | Promise<void>;
  /** Filters and address are already written by the shell: refetch the catalog from them. */
  load(): void | Promise<void>;
  /** Video details and queue URLs with no background (deep link, refresh) draw the catalog grid beneath: when the grid is unoccupied, and it is the startup entry or the catalog skeleton is still up,
   *  fetch once by the current URL (not the home-page scope, no filters written). */
  fill(): void;
  /** Leaving the catalog: collapse the `#grid` page and the home new releases row. */
  release(): void;
}

/** The steps that return to the shell when the profile page element opens. Optional skeleton blocks are drawn by a shape manifest; the manifest, catalog card ratios and the new-releases skeleton live in the shell;
 *  resolving filters from the URL needs the shell's sort preferences; pushing in place touches the shell's top three layers and sidebar. */
export interface EntityPageShell {
  missing(kind: string): void;
  /** Lay the page skeleton: if the shape roster is still in flight, wait for it, and skip laying when `current` comes back false; after laying, refetch the roster once and fill in the missing blocks
   *  of the skeleton when it returns. */
  loading(kind: string, name: string, current: () => boolean): Promise<void>;
  /** Props handed to the page for this open: filters and views resolved from the URL's query string (arrivals from elsewhere always start fresh), with display settings,
   *  helpers and write operations all the shell's own. Cards and hosts are filled in by the element. */
  props(kind: string, name: string, search: string): Omit<EntityPageProps, 'card' | 'hosts'>;
  /** Back/forward landing on another URL for the same person already on screen: push the URL's filters and views into the rendered page, with the top three layers and sidebar updated in place.
   *  Returns false when that page is not on screen, and the element reopens it as a full page. */
  refresh(kind: string, name: string, search: string): boolean;
}

/** A page's kind within the page group; the shell decides which side to lay by it (`surfaceChanged`). */
export type SurfaceKind = 'management' | 'index' | 'entity' | 'catalog' | 'follow' | 'playlists';

/** The values handed to the managed-area pages on each open, computed per page by the page element from the URL, preferences and shell state (`pages/managed.tsx`).
 *  The managed-area pages render into `#stats`. */
export interface ManagedOpenProps extends Record<ConfigurationPath, { section?: string }>,
  Record<import('../../cleanup-tools').CleanupToolPath, Record<string, never>> {
  '/jav': { tab: string; readOnly: boolean };
  '/stats': Record<string, never>;
  '/taste': { onboarding: boolean };
  '/review': { category: string; queue?: string; readOnly: boolean; readOnlyMessage: string; writerUrl: string };
  '/data-cleanup': Record<string, never>;
  '/duplicates': Record<string, never>;
  '/quality-goals': Record<string, never>;
  '/sources': Record<string, never>;
  /** `section`: the tab group selected on the first frame, taking the one recorded in the shell's `configurationRequestedSection` ("Network and access" when the URL carries `#peachProxy`). */
  '/settings/library': { section?: string };
  '/settings/maintenance/repairs': Record<string, never>;
  '/tasks': Record<string, never>;
  '/subscriptions': {
    tab: string; page: number; sort: string; dir: string; pageSize: number; layout: string;
    readOnly: boolean; readOnlyMessage: string; writerUrl: string;
  };
}

export type ManagedPath = keyof ManagedOpenProps;

/** The playlists and follows pages likewise render into `#stats`, but are not management: the route tree's elements open them
 *  on match (`pages/follow.tsx`); arriving from the shell, the shell claims the address write and then asks for a reopen (the
 *  follows page returns with the filters from when you left, and re-entering also rerolls the sample seed and returns to a
 *  clean `/follow`), so they stay out of `ManagedPath`. Values handed in on each open are likewise divided per page, and later
 *  toggles are pushed in via `updateManagedRoute`. The follows page's helpers and actions are single, identity-stable objects
 *  in the shell (cards compare by reference) and follow the open: the HTML they assemble, the DOM they touch and the addresses
 *  they write all still live in the shell. */
export interface BrowseOpenProps {
  '/playlists': { revision: number };
  '/follow': FollowFeedProps;
}

export type BrowseRoutePath = keyof BrowseOpenProps;

/** The catalog grid and junk queue render into `#grid` and likewise do not count as management: the catalog element
 *  (`pages/catalog.tsx`) writes filters into the shell's `state` per address, entering home also rerolls the seed, and trash
 *  pins the filter to `trash`; invalidating the top-three-tier cache, laying the search box and fetching go back to the shell
 *  via `ShellActions.catalog`. The table keys per page, not per address: the catalog's paths and trash all render the `/`
 *  page, and the grid going to `/` after opening at `/trash` is an in-place push; `/junk-files` is the junk queue page, and
 *  `?state=ads` landing on `/` renders it too. What is handed in on open is the shell's whole props (filter or category,
 *  layout, selection state, the cards' helpers and actions); later filter changes, layout changes, selection mode and refresh
 *  generation are pushed in via `updateManagedRoute`. The cards' helpers and actions are single, identity-stable objects in
 *  the shell (cards compare by reference); the profile page's video section and the details page's Continue watching reuse
 *  the catalog grid's copies, so they follow the open and stay out of `ShellActions`. */
export interface CatalogOpenProps {
  '/': CatalogGridProps;
  '/junk-files': JunkQueueProps;
}

export type CatalogPagePath = keyof CatalogOpenProps;

/** Values handed in each time an index page opens: the address bar items (read from the URL by the shell), this browser's layout preference, the current value of the top bar selection key,
 *  and whether configuration can be changed on this machine. Switches after the selection key are pushed in through `updateManagedRoute`. */
export interface IndexOpenProps extends IndexRoute {
  layout: PeopleLayout;
  selectMode: boolean;
  configurable: boolean;
}

/** The five index pages render into `#index`, one path per roster kind. */
export type IndexRoutePath = `/${IndexKind}`;
export type IndexOpenPropsTable = { [Path in IndexRoutePath]: IndexOpenProps };

/** Profile pages render into `#index`, one pattern per entity kind (the name may contain slashes and eats all remaining segments). Kind and name travel with the open,
 *  and the name is the one the shell decoded from the address. */
export type EntityRoutePath = '/performers/*' | '/studios/*' | '/creators/*' | '/series/*' | '/agencies/*' | '/tags/*';

/** In-page components, registered by name and each rendered into one of the shell's containers: home filter bar (`#catalogFilter`), home new-releases row (`#feedNew`),
 *  top bar search dropdown (`#searchMenu`). Props are computed by the shell and passed in whole,
 *  then patched via `updateManagedRoute`. */
export interface SurfaceOpenProps {
  'catalog-filter': CatalogFilterProps;
  'feed-new': FeedNewProps;
  'library-processing': LibraryProcessingProps;
  search: SearchProps;
}

export type SurfaceName = keyof SurfaceOpenProps;

/** Resident components, registered by name, the host being the resident node itself: bottom batch bar (`[data-batch-dock]`),
 *  sidebar color card (`#boardGlowMenu`), management header (`[data-manage-header]`), immersive mode (`[data-immerse-host]`
 *  at the end of body), settings panel (`[data-settings-host]`, placed at the end of body on first open), sidebar
 *  (`#drawerScroll`) and stage (`[data-stage-host]` at the end of body, placed there the first time details open). They open
 *  without props (`openResidentSurface`); content is pushed by the shell through each one's imperative handle into the
 *  component's own store. */
export interface ResidentOpenProps {
  'batch-dock': Record<string, never>;
  'glow-picker': Record<string, never>;
  'manage-header': Record<string, never>;
  immerse: Record<string, never>;
  'settings-panel': Record<string, never>;
  sidebar: Record<string, never>;
  stage: Record<string, never>;
}

export type ResidentName = keyof ResidentOpenProps;
