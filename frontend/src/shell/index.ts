/* The shell's own in-memory state (ADR-0031, "the shell's own in-memory state is also a single instance").
 *
 * The catalog basis, the selection set and selection mode, where details and follow details return to when closed, jumps to a
 * configuration page section, and one-shot requests like the activity page prefill: one instance for the whole app.
 * Application and the React pages import the shared source directly and ship with `peach-app.js`. Reading is ES module live
 * binding: importers always read the current value here; importers must not assign to the binding, and replacing a value
 * wholesale goes through `writeShell`.
 *
 * Object semantics stay as the shell had them: write sites that rebuild wholesale swap the reference via `writeShell`, the
 * rest mutate the same object's fields in place and then call `notifyShell`. Whether `barsContext.filters` aliases `state` is
 * decided by the write sites themselves; this module fixes nothing on anyone's behalf: `writeShell({state})` only swaps
 * `state`, and `barsContext.filters` keeps pointing at the old object until a write site points `barsContext` back. The
 * selection set is two resident `Set`s, mutated in place.
 *
 * After every write, subscribers are notified and the version number increases monotonically; React readers subscribe via
 * `useSyncExternalStore(subscribeShell, shellVersion)`. Server facts (source online state, catalog totals, aggregates, entity
 * shapes, trash counts) do not live here; they belong to TanStack Query. Neither does the shell's staleness generation
 * counter. */

/** Catalog filter terms: keys share names with the query parameters on the address bar (`loc`, `creator`, `tag`, `state`, `sort`, `seed`…). */
export type CatalogFilters = Record<string, string>;

/** Which set of filters the top three tiers and the filter bar are currently rendering: the home page's `state`, a specific profile page, or video details. */
export interface BarsContext {
  type: 'home' | 'entity' | 'item';
  filters: CatalogFilters;
  kind?: string;
  name?: string;
  id?: number;
}

/** The queue currently open, used only to tell 'switching items within the same queue'; the queue's entries belong to the detail island. */
export interface ActiveQueue {
  kind: string;
  seedId?: number;
  playlistId?: number;
}

/** The one video the detail island hands back; the shell only trusts `id` and keeps the other fields as they are. */
export interface PresentedItem {
  id: number;
  [key: string]: unknown;
}

/** Catalog filter state. Written by the shell at startup from the startup address and saved settings; undefined until then. */
export let state: CatalogFilters | undefined;
/** The context for the top three layers and the filter bar; at startup the shell points it at the home page's `state`. */
export let barsContext: BarsContext | undefined;
/** The context from before the video detail opened, restored when the detail closes. */
export let detailReturnBarsContext: BarsContext | null = null;

/** One selection set each for the catalog (profile pages, trash and junk files included) and the follows page, persistent for the whole page and edited in place. */
export const selected = new Set<number>();
export const followSelected = new Set<number>();
export let selectMode = false;
/** The anchor for Shift range selection: one for the catalog, one for the follows page. */
export let lastSelectedId: number | null = null;
export let followLastSelectedId: number | null = null;
/** The kind of page selection mode was entered on (`catalog`, `follow`, `junk`); moving to another kind exits selection. */
export let selectSurface = '';

/** The address returned to when video details close. */
export let detailReturnPath = '/';
/** The card that opened the detail, and whether it sat in the lower or upper half of the viewport; later detail opens without a card reuse this. */
export let detailOriginAnchor: Element | null = null;
export let detailOriginAbove = false;
/** Whether closing the detail rebuilds the origin from the address: a detail entered via deep link has never had a list below it. */
export let detailReturnNeedsRestore = false;
export let activeQueue: ActiveQueue | null = null;
/** The queue address's prefix: which entry it stops on waits for the detail island to settle, and is pushed only at render time. */
export let pendingQueueRoute: string | null = null;
/** The entry the details island last rendered. */
export let presentedItem: PresentedItem | null = null;
/** The address returned to when follow details close. */
export let followDetailReturnPath = '/follow';

/** The tab group the config page should select on its next open, cleared once selected. */
export let configurationRequestedSection = '';
/** Whether this machine may change configuration (`configurable` from `/healthz`): null means not asked yet, and treated as no until asked. */
export let runtimeConfigurable: boolean | null = null;
/** Whether this visit came from the setup-complete page (or the tutorial card): taken when the taste page opens, cleared after one read. */
export let cameFromSetup = false;

/** How many times the shell asked the route tree to open a page by address. The shell starting to route counts 1: before
 *  that, sources, settings and shape lists are not fully read, and the page elements mounted by match in the route tree only
 *  hang, not opening. After that, each time the shell asks for "reopen this page from the current address" (after a batch
 *  write-back, when settings changed and a refetch is due, or when the opened person is the one already rendered) it
 *  increments. Back/forward and cross-page moves are governed by the page-open epoch (`openEpoch` in `@peach/history`) and
 *  never pass through here. */
export let pageOpens = 0;
/** The epoch of the queue-open intent: the real entries are not fully fetched yet, and the address is settled by the detail's first screen. */
export let queueOpens = 0;
/** JAV context inferred from the first page of videos on the profile page (read through the shell's `javActive`): the page pushes it up, and the profile page clears it first on every open. */
export let entityJavLayout = false;
/** The sampling seed for this visit to the follows page: it decides which creators, genres, and tags the three rows show, and the list samples by it. Rerolled on re-entry and on "another batch". */
export let followDiscoverySeed = Math.floor(Math.random() * 0xffffffff);
/** The follow page's refresh epoch: a re-read requested while it is rendered (returning to this page, after batch marking) pushes a new epoch so the list refetches without remounting. */
export let followRevision = 0;
/** Where the follows list was left: jotted down while scrolling on `/follow`, used to scroll back when the list has to redraw from scratch, and reset to zero on re-entry. */
export let followScrollY = 0;
/** The playlist page's refresh epoch: a re-read requested while the page is up (top bar "shuffle") pushes a new epoch, and the page refetches without remounting. */
export let playlistsRevision = 0;

/** The pieces `writeShell` can swap wholesale. The two selection sets are persistent instances and are not among them. */
export interface ShellFields {
  state: CatalogFilters | undefined;
  barsContext: BarsContext | undefined;
  detailReturnBarsContext: BarsContext | null;
  selectMode: boolean;
  lastSelectedId: number | null;
  followLastSelectedId: number | null;
  selectSurface: string;
  detailReturnPath: string;
  detailOriginAnchor: Element | null;
  detailOriginAbove: boolean;
  detailReturnNeedsRestore: boolean;
  activeQueue: ActiveQueue | null;
  pendingQueueRoute: string | null;
  presentedItem: PresentedItem | null;
  followDetailReturnPath: string;
  configurationRequestedSection: string;
  pageOpens: number;
  queueOpens: number;
  entityJavLayout: boolean;
  followDiscoverySeed: number;
  followRevision: number;
  followScrollY: number;
  playlistsRevision: number;
  runtimeConfigurable: boolean | null;
  cameFromSetup: boolean;
}

type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

/** Replaces wholesale the keys that appear in the patch (writing even undefined values), then notifies once. Only the bound keys change; no other key is touched. */
export function writeShell(patch: Partial<ShellFields>): void {
  const has = (key: keyof ShellFields) => Object.prototype.hasOwnProperty.call(patch, key);
  if (has('state')) state = patch.state;
  if (has('barsContext')) barsContext = patch.barsContext;
  if (has('detailReturnBarsContext')) detailReturnBarsContext = patch.detailReturnBarsContext!;
  if (has('selectMode')) selectMode = patch.selectMode!;
  if (has('lastSelectedId')) lastSelectedId = patch.lastSelectedId!;
  if (has('followLastSelectedId')) followLastSelectedId = patch.followLastSelectedId!;
  if (has('selectSurface')) selectSurface = patch.selectSurface!;
  if (has('detailReturnPath')) detailReturnPath = patch.detailReturnPath!;
  if (has('detailOriginAnchor')) detailOriginAnchor = patch.detailOriginAnchor!;
  if (has('detailOriginAbove')) detailOriginAbove = patch.detailOriginAbove!;
  if (has('detailReturnNeedsRestore')) detailReturnNeedsRestore = patch.detailReturnNeedsRestore!;
  if (has('activeQueue')) activeQueue = patch.activeQueue!;
  if (has('pendingQueueRoute')) pendingQueueRoute = patch.pendingQueueRoute!;
  if (has('presentedItem')) presentedItem = patch.presentedItem!;
  if (has('followDetailReturnPath')) followDetailReturnPath = patch.followDetailReturnPath!;
  if (has('configurationRequestedSection')) configurationRequestedSection = patch.configurationRequestedSection!;
  if (has('pageOpens')) pageOpens = patch.pageOpens!;
  if (has('queueOpens')) queueOpens = patch.queueOpens!;
  if (has('entityJavLayout')) entityJavLayout = patch.entityJavLayout!;
  if (has('followDiscoverySeed')) followDiscoverySeed = patch.followDiscoverySeed!;
  if (has('followRevision')) followRevision = patch.followRevision!;
  if (has('followScrollY')) followScrollY = patch.followScrollY!;
  if (has('playlistsRevision')) playlistsRevision = patch.playlistsRevision!;
  if (has('runtimeConfigurable')) runtimeConfigurable = patch.runtimeConfigurable!;
  if (has('cameFromSetup')) cameFromSetup = patch.cameFromSetup!;
  notifyShell();
}

/** Call it after mutating `state`, `barsContext` fields, or the selection in place: the version goes up by one and every subscriber is notified. */
export function notifyShell(): void {
  version += 1;
  for (const listener of [...listeners]) listener();
}

/** Subscribe to every write; returns an unsubscribe function. */
export function subscribeShell(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener) };
}

/** Monotonically increasing version number, incremented on every write. */
export const shellVersion = (): number => version;
