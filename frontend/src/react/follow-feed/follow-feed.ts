/* The follows page `/follow` (ADR-0031 step 10g): data shapes, query keys and this page's own criteria.
 *
 * One island for the whole page, owning its fetching: both trips, `/api/follow` and `/api/follow/credentials`, live in
 * TanStack Query. The address bar is the single source of truth for filters and the shell owns it: the shell reads `view`
 * (status, media, creators, sources, tags, tag filter, sort, seed) from the URL and passes it as props; the island changes
 * filters only by calling `actions.route(view)`, the shell writes the address and pushes the new `view` back via
 * `updateManagedRoute`, and the island fetches by the new key.
 *
 * The two seeds are separate: `view.seed` is the server's random-order seed and lives in the address; `seed` is this visit's
 * sampling seed, deciding which creators, tags and tag rows are exposed in the three rows above. Re-entering (the shell's
 * `enterFollow`) and "Shuffle" change it; returning from another page keeps the seed from when you left, and island re-renders
 * never reshuffle.
 *
 * Details (`/posts/:id`) are a separate island (`../follow-detail/`); it first scans the pages cached here for the entry
 * (`findFollowItem`) and fetches on its own only if the scan misses. The sidebar still belongs to the shell: every time the
 * island fetches a new list it hands back, via `actions.loaded`, the tag counts of the entries visible in this view plus the
 * library-wide source and duration availability. */
import { keepPreviousData, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { seededRank } from '@peach/legacy/core';

import { apiGet } from '../../api';
import { FOLLOW_CREDENTIALS_URL, type CheckResult } from '../follow-manage/follow-manage';
import { queryClient } from '../query';

/* ── The address bar group ── */

/** The status row. The watched tier is left out: watched means archived, and digging it back out is the 'All' view's job. */
export const FOLLOW_FILTERS = [['', 'All'], ['new', 'Unwatched'], ['saved', 'Saved'], ['ignored', 'Ignored']] as const;
export type FollowStatus = (typeof FOLLOW_FILTERS)[number][0];

/** Sort keys and their direction labels; pressing 'shuffle' sends `rand`, which has no key of its own. */
export const FOLLOW_FEED_SORTS = [['new', 'Updated'], ['hot', 'Popularity'], ['dur', 'Duration']] as const;
export const FOLLOW_FEED_DIR_WORDS: Record<string, readonly [string, string]> = {
  new: ['Newest first', 'Oldest first'], hot: ['Highest first', 'Lowest first'], dur: ['Longest first', 'Shortest first'],
};
export const FOLLOW_RANDOM_SORT = 'rand';
export type FollowSort = (typeof FOLLOW_FEED_SORTS)[number][0] | typeof FOLLOW_RANDOM_SORT;
export type FollowMedia = 'videos' | 'images';

/** The follows page's filters on the address bar. Creator, source and genre each hold one (empty string means unfiltered), tags intersect. */
export interface FollowView {
  status: FollowStatus;
  media: FollowMedia;
  author: string;
  provider: string;
  work: string;
  tags: readonly string[];
  /** Duration bounds in seconds, same as the home page's `dur_min`/`dur_max`; 0 means unbounded on that end. */
  durMin: number;
  durMax: number;
  sort: FollowSort;
  dir: 'asc' | 'desc';
  /** The server's random-sort seed, sent with the request only when `sort` is `rand`. */
  seed: number;
}

/** The follows page fetches one screen at a time. `counts` is library-wide while `groups` is this page only, so the list bottom must support loading more.
 *  100 groups per page: each card is 30-40 nodes, and mounting several hundred at once would be a first-paint long task of over a second. */
export const FOLLOW_PAGE = 100;
/** Once this many groups are laid out, scrolling to the bottom no longer auto-appends the next page; "Load more" must be clicked: endless scrolling keeps weighing the page down,
 *  and one overshoot should not quietly mount several hundred more cards. */
export const FOLLOW_AUTO_LOAD_LIMIT = 500;

/** The request URL for this page starting at group `offset`, spelled like the shell's `followPageUrl`: the default tier is left out. */
export function followPageUrl(view: FollowView, offset: number): string {
  const csv = (values: readonly string[]) => encodeURIComponent(values.join(','));
  return `/api/follow?limit=${FOLLOW_PAGE}&offset=${offset}`
    + (view.status ? `&status=${view.status}` : '')
    + (view.author ? `&author=${csv([view.author])}` : '')
    + (view.provider ? `&provider=${csv([view.provider])}` : '')
    + (view.tags.length ? `&tag=${csv(view.tags)}` : '')
    + (view.work ? `&work=${csv([view.work])}` : '')
    + (view.durMin ? `&dur_min=${view.durMin}` : '')
    + (view.durMax ? `&dur_max=${view.durMax}` : '')
    + (view.sort !== 'new' ? `&sort=${view.sort}` : '')
    + (view.sort === FOLLOW_RANDOM_SORT ? `&seed=${view.seed}` : '')
    + (view.dir !== 'desc' ? `&dir=${view.dir}` : '');
}

/* ── API shape (`q_follow` in `src/peach/web_follow.py`) ── */

/** One piece of media embedded in an entry: each image or video of a multi-attachment post. */
export interface FollowMediaItem {
  index: number;
  media_kind?: string;
  thumb_url?: string;
  width?: number;
  height?: number;
  face?: unknown;
  resource_group?: unknown;
}

/** One fetched update. It lists only the fields this page reads; the rest are left intact for the detail. */
export interface FollowItem {
  id: number;
  title: string;
  status: string;
  provider: string;
  provider_label?: string;
  resource_provider?: string;
  source_id?: number;
  published_at?: string;
  duration?: number;
  thumb_url?: string;
  media_kind?: string;
  media_items?: FollowMediaItem[];
  width?: number;
  height?: number;
  face?: unknown;
  tags?: string[];
  tag_types?: Record<string, string>;
  playable?: boolean;
  [field: string]: unknown;
}

/** The server's stacked-cards verdict for a group (`peach.follow_faces`): the deduplicated media count, how many entries merged, and the flip-card view. */
export interface FollowStackInfo {
  media?: number;
  copies?: number;
  kind?: string;
  faces?: { thumb_url?: string; face?: unknown; media_kind?: string }[];
}

/** One card: the same video's primary entry, this site's alts and WIP, and cross-site see-alsos. */
export interface FollowGroup {
  primary: FollowItem;
  variants: FollowItem[];
  duplicates: FollowItem[];
  has_wip?: boolean;
  /** A forum post: each item in the group is a reply, and the body is the reply's content, not the thread title. */
  is_release?: boolean;
  stack?: FollowStackInfo | null;
}

/** A follow source. */
export interface FollowSource {
  id: number;
  provider: string;
  provider_label?: string;
  author_key?: string;
  entity_id?: number | null;
  entity_name?: string;
  last_status?: string;
  can_backfill?: boolean;
  backfill_page?: number;
  [field: string]: unknown;
}

/** One row in the genre strip: key, human-readable label, group count, whether a representative image can be picked, and that image's framing. */
export type FollowWorkRow = readonly [key: string, label: string, n: number, icon?: number, focus?: unknown];

export interface FollowFacets {
  authors?: string[];
  providers?: string[];
  tags?: [string, number][];
  works?: FollowWorkRow[];
  /** Whether the library has duration readings: the sidebar decides from it whether to show the duration slider. */
  duration?: boolean;
}

/** The copy handed to the shell for the sidebar: tag counts over visible items, library-wide sources (key, display name, favicon address), and whether durations exist. */
export interface FollowDrawer {
  tags: readonly (readonly [string, number])[];
  providers: readonly (readonly [key: string, label: string, icon: string])[];
  duration: boolean;
}

export interface FollowPage {
  groups: FollowGroup[];
  counts: Record<string, number>;
  sources: FollowSource[];
  author_aliases?: unknown[];
  facets: FollowFacets;
  /** When filtering by exactly one author, counts only that author's share of each filter option (read by the profile page's online view); otherwise empty. */
  author_facets?: FollowFacets;
  offset: number;
  limit?: number;
  has_more: boolean;
  [field: string]: unknown;
}

export interface FollowCredentials { providers?: { provider: string; present?: boolean }[] }

/* ── Fetch keys ── */

/** The same tab keeps the loaded follow content; a manual refresh still fetches a new generation. */
export const FOLLOW_FEED_GC_MS = Infinity;

/** The list's key. Media switching is pure frontend grouping and stays out of the key: switching views does not refetch. `revision` is the epoch of the shell's requested re-read. */
export function followFeedQuery(view: FollowView, revision: number) {
  const url = followPageUrl(view, 0);
  return {
    queryKey: ['follow-feed', url, revision] as QueryKey,
    queryFn: ({ pageParam, signal }: { pageParam: number; signal?: AbortSignal }) =>
      apiGet<FollowPage>(followPageUrl(view, pageParam), signal),
    initialPageParam: 0,
    /* The server groups the whole batch first, then pages by group: one video never spans pages, and the next page's groups continue right after. */
    getNextPageParam: (last: FollowPage) => (last.has_more ? (last.offset || 0) + FOLLOW_PAGE : undefined),
    placeholderData: keepPreviousData,
    gcTime: FOLLOW_FEED_GC_MS,
  };
}

export const FOLLOW_CREDENTIALS_KEY: QueryKey = ['follow-feed', 'credentials'];

/** 凭据独立读取；失败保存在查询状态里，不当作未配置。 */
export const fetchFollowCredentials = (signal?: AbortSignal) =>
  apiGet<FollowCredentials>(FOLLOW_CREDENTIALS_URL, signal);

/** 首屏条目与凭据并行，条目就绪即可显示。同一个键（同一份筛选、同一个代次）缓存里还有，就是离开前
 *  看着的那一份，原样拿来接着看，连同已经加载的几页；要重读由壳推一个新代次换键。凭据每次都重取：
 *  它在管理页上改，回到这里就该是新的。 */
export async function prefetchFollowFeed(props: { view: FollowView; revision: number }, signal: AbortSignal) {
  const query = followFeedQuery(props.view, props.revision);
  queryClient.removeQueries({ queryKey: FOLLOW_CREDENTIALS_KEY, exact: true });
  const kept = queryClient.getQueryData(query.queryKey) !== undefined;
  void queryClient.prefetchQuery({ queryKey: FOLLOW_CREDENTIALS_KEY, queryFn: () => fetchFollowCredentials(signal) });
  if (!kept) await queryClient.fetchInfiniteQuery({
      queryKey: query.queryKey,
      queryFn: ({ pageParam }) => query.queryFn({ pageParam: pageParam as number, signal }),
      initialPageParam: 0,
      getNextPageParam: query.getNextPageParam,
      gcTime: FOLLOW_FEED_GC_MS,
    });
}

/** Several pages merged into one, shaped like the shell's `followData`: groups are appended, everything else takes the last page (sources refresh with each page). */
export function mergedPage(data: InfiniteData<FollowPage> | undefined): FollowPage | null {
  if (!data?.pages.length) return null;
  const pages = data.pages;
  const last = pages[pages.length - 1]!;
  return { ...pages[0]!, ...last, groups: pages.flatMap((page) => page.groups || []) };
}

/* ── Sampling ── */

/** Shuffled by seed, ties ordered by key name, so the result changes only with the seed. Rank comes from the shell's `seededRank`; the same seed yields the same batch on both sides. */
export function randomOrder<T>(rows: readonly T[], key: (row: T) => string, seed: number): T[] {
  return [...rows].sort((a, b) =>
    seededRank(seed, key(a)) - seededRank(seed, key(b)) || String(key(a)).localeCompare(String(key(b))));
}

/** How many the genre strip reveals, same as the home page's label strip (the shell's `ROW_FIRST`). */
export const FOLLOW_WORKS_FIRST = 24;
/** How many tags are shown. */
export const FOLLOW_TAGS_FIRST = 20;

/* ── Media decisions ── */

/** All entries in a group, primary entry first, deduplicated by id. */
export function collectionItems(group: FollowGroup): FollowItem[] {
  const seen = new Set<number>();
  return [group.primary, ...group.variants, ...group.duplicates].filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** One entry in the list cache: the item itself, its group, and that edition's sources and aliases. */
export interface FollowItemHit {
  item: FollowItem;
  group: FollowGroup;
  sources: FollowSource[];
  aliases: unknown[];
}

/** Find an entry in every cached list version on this island (details scans here first). Source and alias come from that version's last page, same as `mergedPage`.
 *  The freshly fetched version is searched first: the previous generation's list remains cached, where the same entry is the marked, pre-save state. */
export function findFollowItem(id: number): FollowItemHit | null {
  const versions = queryClient.getQueryCache().findAll({ queryKey: ['follow-feed'] })
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  for (const version of versions) {
    const data = version.state.data as InfiniteData<FollowPage> | undefined;
    if (!Array.isArray(data?.pages) || !data.pages.length) continue;
    const last = data.pages[data.pages.length - 1]!;
    for (const page of data.pages) {
      for (const group of page.groups || []) {
        const item = collectionItems(group).find((member) => member.id === id);
        if (item) return { item, group, sources: last.sources || [], aliases: last.author_aliases || [] };
      }
    }
  }
  return null;
}

/** Replaces the same entry in every cached list version with `next` (after the detail hides or restores an image, the server projection hands back a new media list). */
export function replaceFollowItem(next: FollowItem): void {
  queryClient.setQueriesData<InfiniteData<FollowPage>>({
    queryKey: ['follow-feed'], predicate: (query) => Array.isArray((query.state.data as InfiniteData<FollowPage>)?.pages),
  }, (data) => data && {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      groups: (page.groups || []).map((group) => {
        const swap = (item: FollowItem) => (item.id === next.id ? next : item);
        if (!collectionItems(group).some((item) => item.id === next.id)) return group;
        return { ...group, primary: swap(group.primary), variants: group.variants.map(swap), duplicates: group.duplicates.map(swap) };
      }),
    })),
  });
}

/** Updates the same entry's state and moves the counts in every cached list version (save and mark from the detail). It is never moved out of the whole group: the detail does not know which tier each version filters to. */
export function setFollowItemStatus(id: number, to: string): void {
  queryClient.setQueriesData<InfiniteData<FollowPage>>({
    queryKey: ['follow-feed'], predicate: (query) => Array.isArray((query.state.data as InfiniteData<FollowPage>)?.pages),
  }, (data) => data && withStatus(data, null, id, to));
}

/** Same as above, by release time from newest to oldest. */
export function collectionItemsNewest(group: FollowGroup): FollowItem[] {
  return collectionItems(group).sort((a, b) => {
    const byTime = (Date.parse(b.published_at || '') || 0) - (Date.parse(a.published_at || '') || 0);
    return byTime || (+b.id || 0) - (+a.id || 0);
  });
}

/* Follow entries and profile-page videos are not the same DTO, but the media-switch semantics match: a card enters the matching view whenever it contains the matching media.
   external only means an external files page exists and cannot pose as a video; legacy rows with no verifiable media type enter neither view. */
export function itemMediaKinds(item: FollowItem): Set<string> {
  const kinds = new Set<string>();
  const embedded = item.media_items || [];
  if (embedded.length) {
    embedded.forEach((media) => {
      if (media.media_kind === 'image' || media.media_kind === 'video') kinds.add(media.media_kind);
    });
  } else if (item.media_kind === 'image' || item.media_kind === 'video') kinds.add(item.media_kind);
  return kinds;
}

export function groupMediaKinds(group: FollowGroup): Set<string> {
  const kinds = new Set<string>();
  collectionItems(group).forEach((item) => itemMediaKinds(item).forEach((kind) => kinds.add(kind)));
  return kinds;
}

/** Which entry the card face shows: the newest one in the group that contains the current view's media type, falling back to the primary entry. */
export function itemForMedia(group: FollowGroup, view: FollowMedia): FollowItem {
  const wanted = view === 'images' ? 'image' : 'video';
  return collectionItemsNewest(group).find((item) => itemMediaKinds(item).has(wanted)) || group.primary;
}

/** The query used by the profile page's online view: filtered by creator only, all statuses, newest to oldest by update time. */
export function entityFollowView(author: string): FollowView {
  return { status: '', media: 'videos', author, provider: '', work: '', tags: [], durMin: 0, durMax: 0,
    sort: 'new', dir: 'desc', seed: 0 };
}

/* F95's "8 updates" may be a single cloud drive page, or may contain no actual video at all. Mix is playback semantics and can only be triggered by videos that are resolved
   and playable inside Peach; reply counts or external link counts cannot stand in. */
export function videoItems(group: FollowGroup): FollowItem[] {
  return collectionItemsNewest(group).filter((item) => item.playable && item.media_kind === 'video');
}

/* Stacked cards.
   Which images are the same one is decided by the server (`peach.follow_faces`: file content hashes, thumbnail dHash, 8×8
   color blocks plus duration): each member and media carries `face`, and matching numbers mean the same image; the group's
   `stack` provides the deduplicated media count `media`, how many copies were merged `copies`, the media type `kind`, and the
   distinct flip images `faces`. This module only decides how to say it and which images to flip.

   The badge reports one number: how many distinct media this card merged. The same video uploaded on two sites is one media
   with two sources; when deduplication leaves one media, the source count is what is reported. The counter word follows the
   media type: videos count as "items", images as "images", the same set as the details page's "1 of 11 images"; when images
   and videos are mixed it says "media" and not "entries", because on the follows page "entries" counts update posts and would
   read like counting posts again. */
const UNITS: Record<string, string> = { video: 'videos', image: 'images', mixed: 'media items' };

export interface FollowStack {
  isMix: boolean;
  label: string;
  glyph: 'pics' | 'play';
  faces: string[];
}

export function followStack({ cover = '', coverFace = null, stack = null, imageView = false, limit = 9 }: {
  cover?: string; coverFace?: unknown; stack?: FollowStackInfo | null; imageView?: boolean; limit?: number;
} = {}): FollowStack {
  const media = stack?.media || 0;
  const copies = stack?.copies || 0;
  const kind = stack?.kind || '';
  const label = media > 1 ? `${media} ${UNITS[kind] || UNITS.mixed}`
    : copies > 1 ? `${copies} sources` : '';
  /* The glyph says what opens on click: play for videos, pics for images. When images and videos are mixed, which one opens is decided by
     the view, and the glyph follows the view. */
  const glyph = kind === 'image' || (kind !== 'video' && imageView) ? 'pics' : 'play';
  /* The image view pages through images only: this stack is exactly these pictures. The first is the static cover itself, otherwise paging would immediately expose crop differences;
     frames identical to the cover are not paged to. Frames identical to each other are merged server-side already. */
  const seen = new Set<unknown>([coverFace ?? cover]);
  const faces = cover ? [cover] : [];
  for (const face of stack?.faces || []) {
    if (imageView && face.media_kind !== 'image') continue;
    if (!face.thumb_url || face.thumb_url === cover || seen.has(face.face)) continue;
    seen.add(face.face);
    faces.push(face.thumb_url);
  }
  return { isMix: Boolean(label), label, glyph, faces: faces.length > 1 ? faces.slice(0, limit) : [] };
}

/* -- Backfill --
   How far the backfill has gotten. Without it, each click just makes the list a bit longer, and the user cannot tell which page they are on or how many
   clicks remain. The page number is a 0-based cursor (0 = only the first page fetched), displayed as a human-readable page number. */
export function backfillState(sources: readonly FollowSource[]): string {
  const pages = sources.filter((source) => source.can_backfill).map((source) => (source.backfill_page || 0) + 1);
  if (!pages.length) return '';
  const deepest = Math.max(...pages);
  const shallowest = Math.min(...pages);
  if (deepest <= 1) return 'Every source fetched only page 1';
  return shallowest === deepest ? `Every source was fetched through page ${deepest}` : `Fetched pages ${shallowest}–${deepest}`;
}

/* ── Sort keys ── */

/** Clicking an unselected item switches columns and takes that column's default direction; clicking the selected one flips direction; the same as the shell's `nextSortState` paired with this page's vocabulary. */
export function nextSort(key: string, current: string, dir: 'asc' | 'desc') {
  if (key !== current) return { sort: key as FollowSort, dir: 'desc' as const };
  if (!FOLLOW_FEED_DIR_WORDS[key]) return null;
  return { sort: key as FollowSort, dir: dir === 'asc' ? 'desc' as const : 'asc' as const };
}

/** The accessible name announces what pressing will get you, not the current state. */
export function sortAriaLabel(key: string, label: string, current: string, dir: 'asc' | 'desc'): string {
  const next = nextSort(key, current, dir);
  if (!next) return '';
  const words = FOLLOW_FEED_DIR_WORDS[next.sort];
  return `Sort by ${label}${words ? words[next.dir === 'asc' ? 1 : 0] : ''}`;
}

/* ── The pieces the shell hands in ── */

/** Attribution: the name, the avatar HTML inside the round frame, and the 'attribution includes' line. */
export interface FollowIdentity { author: string; avatar: string; credited: string; entityName: string }

/** This page's context: cards and both rows read identities and avatars from this copy of sources, aliases and credentials, not from the shell's globals. */
export interface FollowContext {
  sources: readonly FollowSource[];
  aliases: readonly unknown[];
  credentials: ReadonlySet<string>;
  credentialsReady?: boolean;
}

/** HTML and wiring still supplied by the legacy layer: details use the same copy, with one implementation. The byline, avatar, source icons and the bits of text around
 *  the title live in the island (`follow-marks.ts`). */
export interface FollowFeedHelpers {
  /** The content inside a genre roundel (an `<img>` when a representative image exists, otherwise two letters); framing and zoom reuse the profile page's two functions. */
  workMark(row: FollowWorkRow): string;
  /** The tag's UI name, read by follow details (the stage); the list page and cards import the same function directly from `@peach/legacy/tags`. */
  tagLabel(tag: string): string;
  /** Horizontal scroll rows get drag and wheel (`wireDrag`); wheel and edge fades only (`wireHorizontalScroller`). */
  wireDrag(row: Element | null): void;
  wireScroller(row: Element | null): void;
  /** Besides the full-page skeleton on entry (`followSkeletonHtml`), the list-area skeleton shown while filters change. */
  listSkeletonHtml(media: FollowMedia): string;
  /** The progress bar for the check-updates and back-crawl background run (`peach-ui`'s `followJobProgress`), with the job id recorded in
   *  `sessionStorage`'s `peach-follow-job`, so refresh or page change still reconnects. */
  jobProgress(options: FollowJobProgressOptions): void;
}

export interface FollowJobState { status?: string; job_id?: string; error?: string; results?: CheckResult[]; [field: string]: unknown }

export interface FollowJobProgressOptions {
  host: HTMLElement;
  active(): boolean;
  read(signal: AbortSignal): Promise<FollowJobState>;
  busy(running: boolean): void;
  complete(state: FollowJobState): void;
}

export interface FollowFeedActions {
  /** Changing filters or sorting: the shell writes it into the address bar, then pushes back a new `view`. */
  route(view: FollowView): void;
  /** Shuffle: the shell rolls a new seed; both rows' sampling and the list order change. */
  shuffle(): void;
  /** A list version the island fetched (first screen, next page, or after a write): the tag counts, sources, and duration availability the sidebar needs, handed to the shell to paint the sidebar. */
  loaded(drawer: FollowDrawer): void;
  openDetail(id: number): void;
  openAuthor(name: string): void;
  /** One selection in multi-select: `range` is a Shift range pick. */
  toggleSelection(id: number, range: boolean): void;
  /** The photo wall's 'images only' and image layout preferences; the shell stores them and pushes them back. */
  setImagesOnly(on: boolean): void;
  setPhotoLayout(layout: FollowPhotoLayout): void;
  /** Whether hover card flipping is allowed right now (returns false during multi-select, occlusion, reduced motion and scrolling). */
  canFlip(): boolean;
  /** Action receipt; when `undo` is given it carries an undo button. Failures go through `failure`. */
  toast(message: string, options?: { undo?: () => Promise<void> }): void;
  failure(action: string, error: unknown): void;
  /** The check-for-updates result (`followCheckToast`): newly added, nothing new and failure each stated clearly. */
  checkReport(report: unknown): void;
}

/** The payload the status write endpoint returns: which entry changed and what it became. */
export interface FollowStatusWrite { item: number; to: string }

/** After a write, patch the cache locally: the entry's state and the state counts, and when filtering by a tier the new state does not belong to, the whole group moves out.
 *  With `view` empty, only state and counts change and nothing moves out (write operations from details). */
export function withStatus(data: InfiniteData<FollowPage>, view: FollowView | null, id: number, to: string):
InfiniteData<FollowPage> {
  let before = '';
  const pages = data.pages.map((page) => ({
    ...page,
    groups: (page.groups || []).flatMap((group) => {
      let hit = false;
      const swap = (item: FollowItem) => {
        if (item.id !== id) return item;
        hit = true;
        before = before || item.status;
        return { ...item, status: to };
      };
      const next = { ...group, primary: swap(group.primary), variants: group.variants.map(swap), duplicates: group.duplicates.map(swap) };
      if (hit && view?.status && next.primary.id === id && to !== view.status) return [];
      return [next];
    }),
  }));
  if (!before || before === to) return { ...data, pages };
  return {
    ...data,
    pages: pages.map((page) => {
      const counts = { ...page.counts };
      if (counts[before] !== undefined) counts[before] = Math.max(0, (counts[before] || 0) - 1);
      counts[to] = (counts[to] || 0) + 1;
      return { ...page, counts };
    }),
  };
}

export type FollowPhotoSize = 'big' | 'small';
export type FollowPhotoLayout = 'fixed' | 'masonry';

export interface FollowFeedProps {
  view: FollowView;
  /** The sampling seed for this visit. */
  seed: number;
  /** The epoch the shell asks to reread (after bulk flagging, after a write returns from elsewhere); incrementing it refetches without remounting. */
  revision: number;
  selectMode: boolean;
  selected: ReadonlySet<number>;
  photoSize: FollowPhotoSize;
  photoLayout: FollowPhotoLayout;
  imagesOnly: boolean;
  helpers: FollowFeedHelpers;
  actions: FollowFeedActions;
}

/** The currently pressed filters, four dimensions gathered into one list, ordered coarse to fine like the filter bar: creator, source, genre, tag. */
export interface FollowCondition { kind: 'Creators' | 'Source' | 'Genres' | 'Tags'; key: string; label: string }

export function followConditions(view: FollowView, names: {
  authors: ReadonlyMap<string, string>; providers: ReadonlyMap<string, string>; works: ReadonlyMap<string, string>;
}): FollowCondition[] {
  const rows: FollowCondition[] = [];
  if (view.author) rows.push({ kind: 'Creators', key: view.author, label: names.authors.get(view.author) || view.author });
  if (view.provider) rows.push({ kind: 'Source', key: view.provider, label: names.providers.get(view.provider) || view.provider });
  if (view.work) rows.push({ kind: 'Genres', key: view.work, label: names.works.get(view.work) || view.work });
  view.tags.forEach((tag) => rows.push({ kind: 'Tags', key: tag, label: tag }));
  return rows;
}

/** Remove one entry: removal is per dimension, since the same string can appear in both dimensions. */
export function dropCondition(view: FollowView, row: FollowCondition): FollowView {
  if (row.kind === 'Creators') return { ...view, author: '' };
  if (row.kind === 'Source') return { ...view, provider: '' };
  if (row.kind === 'Genres') return { ...view, work: '' };
  return { ...view, tags: view.tags.filter((tag) => tag !== row.key) };
}

/** The tags' type on this page: take the first group with a recorded type, otherwise color as general. */
export function groupTagType(groups: readonly FollowGroup[], tag: string): string {
  for (const group of groups) {
    const type = group.primary?.tag_types?.[tag];
    if (type) return type;
  }
  return 'general';
}
