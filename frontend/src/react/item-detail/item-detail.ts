/* Data and criteria for video details `/assets/:id` and the four queues (Mix, volumes, editions, playlists) (ADR-0031).
 *
 * This block is a child of the stage island's (`../stage/`) tree; the stage itself, enter/exit, mini player and Video.js
 * belong to the stage island, and follow details use the same set. Entries belong here: cards from `/api/items` lack
 * `entity_refs` and their tags are just strings, so using one as details would render the identity and tag areas once and
 * then jump; everything is fetched singly with `GET /api/item?id=`.
 *
 * Queues also belong to the island, fetched by `{kind, seedId|playlistId}` with both in the key: switching entries inside the
 * same queue hits cache, and only re-entering from outside (`fresh`) refetches. The shell only remembers which queue is open
 * right now, used to judge exactly this. */
import type { QueryKey } from '@tanstack/react-query';
import { esc, foldName } from '@peach/legacy/core';
import { mixLabel, type FaceRef } from '@peach/card-art';

import { apiGet } from '../../api';
import type { MediaCardActions, MediaCardHelpers, MediaCardLayout, MediaItem } from '../catalog-grid/types';
import { queryClient } from '../query';
import type { PendingWorkItem } from '../components/pending-work';

/* ── API shape (`q_item` in `src/peach/web_catalog.py`) ── */

/** A tag in the details: `cat` is the category, `official` means it came from the source site. */
export interface DetailTag { k: string; cat?: string; official?: boolean }

/** An entity in the identity block. The cell that came from flat-field fallback has no `id`; it renders but is not clickable. */
export interface DetailEntityRef extends FaceRef {
  id: number | null;
  name: string;
  has_logo?: boolean;
  /** The logo file's content version, spliced into the `/logo` URL's `&v=`. */
  logo_version?: string;
  /** When the label belongs to a studio (ADR-0049), the chain of parent studios from nearest to farthest. */
  makers?: DetailEntityRef[];
}

/** The fields declared on card entries. `MediaItem` carries `[field: string]: unknown`, and a direct `Omit` would wipe the declared keys too
 *  (`keyof` becoming `string`), so strip the index signature first, then pick. */
type CardFields = { [K in keyof MediaItem as string extends K ? never : K]: MediaItem[K] };

/** One `/api/item` entry. Only the fields the details read are listed; the rest come through as-is, since the shell's cache needs the whole entry. */
export interface DetailItem extends Omit<CardFields, 'tags'> {
  [field: string]: unknown;
  error?: string;
  /** 刚入库还在补资料：扫描与采集或云下载后处理还没走完。 */
  pending_work?: PendingWorkItem[];
  title?: string;
  width?: number | null;
  height?: number | null;
  release_date?: string | null;
  region?: string | null;
  region_label?: string | null;
  region_settled?: boolean;
  rating?: number | null;
  liked?: boolean | number;
  like_reason?: string;
  o_count?: number;
  better_version?: boolean | number;
  better_version_reason?: string;
  has_studio_logo?: boolean;
  studio_logo_version?: string;
  poster_box?: { x0: number; y0: number; x1: number; y1: number; px: number[] } | null;
  part_label?: string;
  tags?: DetailTag[];
  entity_refs?: Partial<Record<'performer' | 'studio' | 'creator' | 'series', DetailEntityRef[]>>;
  sample_images?: { n: number }[];
}

/** One entry in the queue: the card's copy plus edition and volume labels. */
export interface QueueItem extends MediaItem { edition_label?: string; part_label?: string; version_id?: number }

export type QueueKind = 'mix' | 'parts' | 'editions' | 'playlist';

/** The queue reference the shell passes in. `fresh` true means this arrival comes from outside the queue and refetches; switching entries
 *  within the same queue is false and reads the cache. Playlists refetch every time: their order and contents change elsewhere too. */
export interface QueueRef { kind: QueueKind; seedId?: number; playlistId?: number; fresh?: boolean; autoplay?: boolean }

export interface DetailQueue {
  kind: QueueKind;
  seedId?: number;
  playlistId?: number;
  title: string;
  items: QueueItem[];
  /** The resume position recorded by the playlist. */
  currentAssetId?: number | null;
  versionCount?: number;
}

/** Write operations on `/api/playlist` all return the whole list (`web_playlists.w_playlist`). */
export interface PlaylistPayload {
  id: number;
  name: string;
  items: QueueItem[];
  current_asset_id: number | null;
}

/* ── Fetching ── */

export const itemKey = (id: number): QueryKey => ['item', id];
export const queueKey = (ref: QueueRef): QueryKey => ['item-queue', ref.kind, ref.kind === 'playlist' ? ref.playlistId : ref.seedId];
export const relatedKey = (id: number, limit: number): QueryKey => ['item-related', id, limit];

export const ITEM_URL = (id: number) => `/api/item?id=${id}`;
export const RELATED_URL = (id: number, limit: number) => `/api/related?id=${id}&limit=${limit}`;
export const PLAYLIST_URL = '/api/playlist';
export const FEEDBACK_URL = '/api/feedback';
export const ITEM_TAG_URL = '/api/item-tag';
export const WATCH_LATER_URL = '/api/watch-later';
export const QUALITY_GOAL_URL = '/api/quality-goal';
export const PREFERENCE_URL = '/api/preference';

/** The entry is no longer in the database: the server returns `{error}`, not a failed request. */
export class ItemGone extends Error {}

export async function fetchItem(id: number, signal?: AbortSignal): Promise<DetailItem> {
  const item = await apiGet<DetailItem>(ITEM_URL(id), signal);
  if (item.error) throw new ItemGone(item.error);
  return item;
}

interface GroupPayload { error?: string; title?: string; items?: QueueItem[]; count?: number }

/** All entries of one queue. Mix is the seed plus its related videos (the related set is fetched once per seed, shared with the Mix card's hover paging in the catalog);
 *  volumes and editions are the playable entries under one code; playlists follow their own order. */
export async function fetchQueue(ref: QueueRef, helpers: Pick<ItemDetailHelpers, 'mixRelated' | 'tagLabel'>, signal?: AbortSignal): Promise<DetailQueue> {
  if (ref.kind === 'mix') {
    const seedId = ref.seedId!;
    const [seed, related] = await Promise.all([fetchItem(seedId, signal), helpers.mixRelated(seedId)]);
    queryClient.setQueryData(itemKey(seed.id), seed);
    return {
      kind: 'mix', seedId, title: `Mix · ${mixLabel(seed as unknown as QueueItem, helpers.tagLabel)}`,
      items: [seed as unknown as QueueItem, ...related.filter((item) => item.id !== seed.id)],
    };
  }
  if (ref.kind === 'playlist') {
    const playlist = await apiGet<PlaylistPayload>(`${PLAYLIST_URL}?id=${ref.playlistId}`, signal);
    return playlistQueue(playlist);
  }
  const group = await apiGet<GroupPayload>(`/api/${ref.kind}?id=${ref.seedId}`, signal);
  if (group.error || !group.items?.length) throw new Error(group.error || 'This group no longer exists');
  return {
    kind: ref.kind, seedId: ref.seedId!, title: `${ref.kind === 'parts' ? 'Volumes' : 'Editions'} · ${group.title || ''}`,
    items: group.items,
    versionCount: ref.kind === 'editions' ? group.count : undefined,
  };
}

export const playlistQueue = (playlist: PlaylistPayload): DetailQueue => ({
  kind: 'playlist', playlistId: playlist.id, title: playlist.name, items: playlist.items || [],
  currentAssetId: playlist.current_asset_id,
});

/** Items marked "vanished" in the playlist: the files are not on disk, so they are listed and flagged but never opened for playback (ADR-0087). */
export const isVanished = (item: QueueItem) => item.disposal === 'vanished';

/** Which queue entry to stop on. For Mix it is the clicked one; for volumes and editions, if the clicked one is not in the group (deep link wrong, group changed)
 *  fall back to the first; playlists fall back to their recorded resume position, skipping vanished entries to the first playable.
 *  Nothing to stop on is null. */
export function chooseItem(queue: DetailQueue, requested: number | null): number | null {
  if (queue.kind === 'mix') return requested;
  const items = queue.kind === 'playlist' ? queue.items.filter((item) => !isVanished(item)) : queue.items;
  if (!items.length) return null;
  if (requested != null && items.some((item) => item.id === requested)) return requested;
  if (queue.kind === 'playlist' && items.some((item) => item.id === queue.currentAssetId)) return queue.currentAssetId!;
  return items[0]!.id;
}

/** Only the volumes queue knows the volume label: `/api/item` is a single-item view and cannot answer "which volume is this". Without the patch the
 *  volume number in the title bar is missing both on deep links and when opening another queue entry. */
export function withPartLabel(item: DetailItem, queue: DetailQueue | null): DetailItem {
  if (queue?.kind !== 'parts' && queue?.kind !== 'editions') return item;
  const part_label = queue.items.find((part) => part.id === item.id)?.part_label || '';
  return item.part_label === part_label ? item : { ...item, part_label };
}

/** After finishing a volume, only the next volume of the same edition plays; picking another edition is user-initiated. */
export function nextPart(queue: DetailQueue | null, id: number): QueueItem | null {
  if (!queue || (queue.kind !== 'parts' && queue.kind !== 'editions')) return null;
  const index = queue.items.findIndex((row) => row.id === id);
  const current = queue.items[index];
  const next = queue.items[index + 1];
  if (!current?.part_label || !next?.part_label) return null;
  return queue.kind === 'parts' || (current.version_id != null && current.version_id === next.version_id) ? next : null;
}

/** First screen: first settle the queue (whether this refetches is the shell's call), then settle which entry to stop on, and finally fetch that entry. The redirect cases
 *  (online video to follows details, queue unavailable falls back to normal details, empty playlist returns to the list page, item gone) go to the shell;
 *  once the shell swaps the stage, this mount is void and never paints. */
export async function prefetchItemDetail(props: ItemDetailProps, signal: AbortSignal): Promise<void> {
  const { queue: ref, actions } = props;
  let queue: DetailQueue | null = null;
  let seeded = false;
  if (ref) {
    const key = queueKey(ref);
    try {
      const cached = ref.fresh ? undefined : queryClient.getQueryData<DetailQueue>(key);
      seeded = !cached && ref.kind === 'mix';
      queue = cached || await queryClient.fetchQuery({ queryKey: key, queryFn: () => fetchQueue(ref, props.helpers, signal), staleTime: 0 });
    } catch (error) {
      if (signal.aborted) throw error;
      if (props.id != null) actions.redirect({ kind: 'item', id: props.id });
      else actions.redirect({ kind: 'gone' });
      return;
    }
  }
  const id = queue ? chooseItem(queue, props.id) : props.id;
  if (id == null) {
    actions.redirect(queue?.kind === 'playlist' ? { kind: 'playlists' } : { kind: 'gone' });
    return;
  }
  let item: DetailItem;
  /* Reopening the same entry also refetches: the cached copy is from the last open, and covers, rating and tags may have changed elsewhere since,
     while mounting alone does not refetch (`query.ts`). Only the Mix seed is not refetched, since the queue fetch just wrote it into the cache. */
  const cachedItem = seeded && id === queue?.seedId ? queryClient.getQueryData<DetailItem>(itemKey(id)) : undefined;
  try {
    item = cachedItem
      || await queryClient.fetchQuery({ queryKey: itemKey(id), queryFn: () => fetchItem(id, signal), staleTime: 0 });
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof ItemGone) { actions.redirect({ kind: 'gone' }); return }
    throw error;
  }
  if (!signal.aborted && item.location === 'online' && item.follow_item_id) actions.redirect({ kind: 'follow', id: Number(item.follow_item_id) });
}

/* ── The pieces the shell hands in ── */

/** One candidate in the tag selector: how many videos in the library carry this tag. */
export interface TagCount { k: string; n?: number; cat?: string }

/** The HTML fragments and readouts in details still assembled by the legacy layer. Each is the only implementation of a site-wide semantic contract, so no second copy is written here.
 *  Images, avatars and bylines for identity cells and queue rows come straight from `@peach/card-art`. */
export interface ItemDetailHelpers {
  /** The source corner badge (legacy layer `srcBadge`); `cls` is a size tier like `srcbig`. */
  badgeHtml(location: string, cost: string, cls?: string): string;
  /** Code + edition badge + title (legacy layer `javTitleHtml`). */
  titleHtml(item: DetailItem): string;
  /** Plain text of the same title (the legacy layer's `javDisplayName`). */
  displayName(item: QueueItem): string;
  /** The 'JAV default cover' setting, read fresh each time: the queue row's thumbnail picks the sleeve or preview image by it. */
  javImage(): string;
  tagLabel(tag: string): string;
  /** The duration-tier tags: derived from the duration, never listed in details. */
  isDurationTag(tag: string): boolean;
  /** All candidates in the tag selector (the catalog's tag counts). */
  tagCandidates(): TagCount[];
  /** Whether the source is currently unmounted. */
  sourceOffline(location: string): boolean;
  offlineReason(location: string): string;
  /** The skeleton for the "keep watching" row (legacy layer `pageSkeletonHtml`), the same copy used elsewhere in the shell. */
  relatedSkeletonHtml(): string;
  /** Mix related videos, fetched once per seed, shared with the Mix card's hover paging in the catalog. */
  mixRelated(seedId: number): Promise<QueueItem[]>;
  /** Horizontal rows get drag scrolling wired in (legacy `wireDrag`). */
  wireDrag(el: HTMLElement): void;
  /** Drag-to-reorder for the playlist column (legacy `wireDragReorder`): while dragging it puts `dragging` and
   *  `drop-before`/`drop-after` on rows, and calls back with the new position on drop. */
  wireDragReorder(root: HTMLElement, options: {
    selector: string; attribute: string; onMove(from: string, target: string, after: boolean): Promise<void> | void;
  }): void;
}

/** The cases the shell hands off. */
export type ItemDetailRedirect =
  | { kind: 'follow'; id: number }
  | { kind: 'item'; id: number }
  | { kind: 'playlists' }
  | { kind: 'gone' };

export interface ItemDetailActions {
  /** Closes the detail back to where it came from (the shell's `closeItemDetail`: exit animation, tear down the stage, push back the list URL and filters). */
  close(): void;
  /** This entry has rendered: the shell updates mini player metadata, the top bar's entity context, ambient light, and theater mode from this, and pushes the queue address
   *  at this point too (which entry it pauses on awaits the island settling). */
  present(item: DetailItem, queue: DetailQueue | null): void;
  redirect(to: ItemDetailRedirect): void;
  /** Clicking another item in the queue: the stage's player must be torn down first and the address swapped, remounting through the shell. When `push` is false the address is not pushed. */
  openQueueItem(queue: QueueRef, id: number, push?: boolean): void;
  /** Hands the media frame to the stage to mount a player: the `<video>` is built by the stage inside the frame and handed to
 *  Video.js, never entering this React tree, because on expand from the mini player the same instance must move wholesale
 *  into this frame. The returned cleanup runs when this media area unmounts. The signature matches follow details: video
 *  details have no "which media", so `media` passes null; without `autoplay` it follows settings, and the metered-source
 *  intercept click passes true. */
  mountPlayer(frame: HTMLElement, item: DetailItem, media: null, options?: { autoplay?: boolean }): () => void;
  /** The drive is back: reopen this entry through the normal path without mounting the player midway. */
  reopen(): void;
  /** Re-check whether a source is mounted. */
  checkSource(location: string): Promise<boolean>;
  /** The exit when an online video cannot be traced back to a follows entry: open the follows page's "Saved" tier. */
  openSavedFollow(): void;
  openEntity(kind: string, name: string): void;
  openUnowned(): void;
  openRegion(region: string): void;
  /** Click a tag: back to the list filtered to it. */
  openTag(tag: string): void;
  /** The add-to-playlist screen (the shell's form popover: the stage is a native dialog opened with `showModal()`, so the popover has to join that same layer). */
  addToPlaylist(item: DetailItem): void;
  /** The save-Mix screen: the shell pops the form and calls `save(name)` on confirm; once saved, the shell moves to that playlist and offers undo. */
  saveMix(options: { title: string; count: number; save(name: string): Promise<PlaylistPayload> }): void;
  /** Edit the playlist: go to the playlist page. */
  editPlaylist(): void;
  /** The playlist was emptied: go back to the playlist page. */
  openPlaylists(): void;
  /** Locates the source file; returns the failure reason, an empty string on success (success receipts go through the site-wide Toast). */
  reveal(id: number): Promise<string>;
  /** Verify the directory this entry lives in; it returns one status line plus the entries moved into trash. */
  sync(id: number): Promise<{ text: string; removed: number[] }>;
  /** The catalog's "Junk files" tier lists by trash state: after moving to trash (`undo` false) and after undoing any feedback (`undo` true),
   *  the shell decides whether to re-read the list. */
  trashChanged(disposal: string | null, undo: boolean): Promise<void>;
  /** Action receipt; when `undo` is given it carries an undo button. Failures go through `failure`. */
  toast(message: string, options?: { undo?: () => Promise<void> }): void;
  failure(action: string, error: unknown): void;
}

export interface ItemDetailProps {
  /** The clicked entry; it can be absent when the playlist opens from a list page, falling back to the resume position. */
  id: number | null;
  queue: QueueRef | null;
  /** How many entries the 'Keep watching' row takes; 0 turns it off. The row is omitted when a queue exists. */
  relatedLimit: number;
  helpers: ItemDetailHelpers;
  actions: ItemDetailActions;
  /** Cards in the 'Keep watching' row: the same helpers and actions as the catalog grid. */
  grid: { helpers: MediaCardHelpers; actions: MediaCardActions };
  layout: MediaCardLayout;
  selectMode: boolean;
  selected: ReadonlySet<number>;
  seekSeconds: number;
}

/* ── Identity area ── */

/** Collapse past this many performers on screen: a BEST compilation measured 41 of them, and laying them all out pushes the tags and feedback buttons out of view. */
export const CAST_SHOWN = 8;

export interface IdentityGroups {
  cast: DetailEntityRef[];
  studios: DetailEntityRef[];
  makers: DetailEntityRef[];
  creators: DetailEntityRef[];
  series: DetailEntityRef[];
  /** Same criteria as the `owner=none` SQL: no cast member, no creator entity, and flat creator also empty. Studio and series do not count as ownership;
   *  both sides must speak of the same videos, otherwise a card marked "unowned" clicking into the collection would not contain it. */
  unowned: boolean;
}

/** Identities grouped by category, each name appearing once (the first category to claim it keeps it). Performers on co-starred videos are listed individually;
 *  non-canonical labels only have a flat `studio` field, and their logo availability ships separately in `has_studio_logo`. */
export function identityGroups(item: DetailItem): IdentityGroups {
  const refs = item.entity_refs || {};
  const seen = new Set<string>();
  const fresh = (ref: DetailEntityRef) => {
    const key = foldName(ref.name);
    if (!ref.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  const performers: DetailEntityRef[] = refs.performer?.length
    ? refs.performer : (item.performers || []).map((name) => ({ id: null, name }));
  const cast = performers.filter(fresh);
  const studioRef = refs.studio?.[0];
  const studioFallback: DetailEntityRef[] = studioRef || !item.studio
    ? [] : [{ id: null, name: item.studio, has_logo: !!item.has_studio_logo,
      ...(item.studio_logo_version ? { logo_version: item.studio_logo_version } : {}) }];
  const studios = [...(refs.studio || []), ...studioFallback].filter(fresh);
  const makers = studios.flatMap((ref) => ref.makers || []).filter(fresh);
  const creators = (refs.creator || []).filter(fresh);
  const series = (refs.series || []).filter(fresh);
  return { cast, studios, makers, creators, series, unowned: !cast.length && !creators.length && !String(item.creator || '').trim() };
}

/* Rating.
   Ratings live on `asset.rating` on a 0-100 scale: this column is imported straight from Stash's rating100, and
   taste_history also reduces to 0-5 by rating/20. So the n-th star sends n*20, not n. Clicking the current star again means
 * undo, sending 0, and the backend writes NULL back: "never rated" and "rated one star" must be two different things in
 * sorting. */
export { RATING_STEP, clampRating, ratingStars, ratingText, nextRating } from '../components/rating-values';

/* ── Tags ── */

/** Tags listed in details: drop duration tiers, dedupe by display name (a renamed one may collide with another, prefer keeping the one whose display name is
 *  already canonical), at most 40. */
export function detailTags(item: DetailItem, helpers: Pick<ItemDetailHelpers, 'tagLabel' | 'isDurationTag'>): DetailTag[] {
  const byDisplay = new Map<string, DetailTag>();
  (item.tags || []).filter((tag) => !helpers.isDurationTag(tag.k)).forEach((tag) => {
    const key = foldName(helpers.tagLabel(tag.k));
    const previous = byDisplay.get(key);
    if (!previous || (foldName(tag.k) === key && foldName(previous.k) !== key)) byDisplay.set(key, tag);
  });
  return [...byDisplay.values()].slice(0, 40);
}

export const hasTag = (item: DetailItem, tag: string) => (item.tags || []).some((own) => foldName(own.k) === foldName(tag));
export const withoutTag = (item: DetailItem, tag: string): DetailItem =>
  ({ ...item, tags: (item.tags || []).filter((own) => foldName(own.k) !== foldName(tag)) });
export const withTag = (item: DetailItem, tag: DetailTag): DetailItem =>
  (hasTag(item, tag.k) ? item : { ...item, tags: [...(item.tags || []), tag] });

const RECENT_TAGS = 'peach.recentTags';
export function recentTags(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_TAGS) || '[]');
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}
export function rememberTag(tag: string): void {
  try {
    const rest = recentTags().filter((name) => foldName(name) !== foldName(tag));
    localStorage.setItem(RECENT_TAGS, JSON.stringify([tag, ...rest].slice(0, 12)));
  } catch {
    // Storage full or disabled: recent items are a convenience only and do not affect adding itself.
  }
}

export interface PickerSections { recent: TagCount[]; results: TagCount[]; create: string }

/** What the tag selector lists at this moment: with no input, recent plus all (first 120); with input, the matching ones;
 *  when the typed word has no exact match, a "New" cell is appended at the end. */
export function pickerSections(query: string, candidates: readonly TagCount[], recent: readonly string[]): PickerSections {
  const q = foldName(query);
  const byName = new Map(candidates.map((tag) => [foldName(tag.k), tag]));
  const results = candidates.filter((tag) => !q || foldName(tag.k).includes(q)).slice(0, 120);
  const recentRows = q ? [] : recent.map((name) => byName.get(foldName(name)) || { k: name, n: 0 })
    .filter((tag, index, all) => all.findIndex((other) => foldName(other.k) === foldName(tag.k)) === index).slice(0, 12);
  const exact = results.some((tag) => foldName(tag.k) === q);
  return { recent: recentRows, results, create: q && !exact ? query.trim() : '' };
}

/* ── Queue ── */

/** Edition badge colors follow the set on card titles. One addition, `Censored`: on cards, the main feature correctly carries no badge (no badge means the main feature),
 *  but with two entries side by side in the queue, writing nothing leaves people guessing which is which. */
export const EDITION_TONE: Record<string, string> = { 中字: 'subtitle', 无码: 'uncensored', 无码流出: 'leaked', 无码破解: 'cracked', 有码: 'censored' };

const QUEUE_LABEL: Record<QueueKind, string> = { mix: 'Mix', parts: 'Volumes', editions: 'Editions', playlist: 'Playlists' };

/** The queue header's two lines: category and summary. The edition queue's title is "Editions · code", but the code is printed in the details title directly above,
 *  and the title bar already says "Editions"; three places saying one thing, so only the count stays here. Other queues' titles carry real information (playlist name,
 *  Mix seed) and cannot be cut along with it. */
export function queueCopy(queue: DetailQueue): { title: string; summary: string } {
  const n = queue.kind === 'editions' ? queue.versionCount ?? queue.items.length : queue.items.length;
  const count = n.toLocaleString();
  const unit = (one: string, many: string) => `${count} ${n === 1 ? one : many}`;
  const countLabel = queue.kind === 'parts' ? unit('volume', 'volumes')
    : queue.kind === 'editions' ? unit('edition', 'editions') : unit('video', 'videos');
  return { title: QUEUE_LABEL[queue.kind], summary: queue.kind === 'editions' ? countLabel : `${queue.title} · ${countLabel}` };
}

/** Several volumes of one film share a filename, with title, performer, and studio identical verbatim: without the volume number in the details title, switching volumes in the queue
 *  leaves the whole right column looking unmoved. The volume number says "which file", not which edition, in neutral gray. Numeric volumes write "Volume 2";
 *  letter volumes follow the code's volume-suffix style, capitalized as "Volume A". */
export const partLabel = (label = '') => /^\d+$/.test(label) ? `Volume ${label}`
  : /^[a-h]$/i.test(label) ? `${label.toUpperCase()} volumes` : label;
export const partLabelHtml = (item: DetailItem, queue: DetailQueue | null) =>
  ((queue?.kind === 'parts' || queue?.kind === 'editions') && item.part_label ? `<small class="javedition partlabel">${esc(partLabel(item.part_label))}</small>` : '');

/** The new order after dragging: `from` moves before or after `target`. */
export function movedOrder(ids: readonly number[], from: number, target: number, after: boolean): number[] {
  const rest = ids.filter((id) => id !== from);
  const at = rest.indexOf(target);
  rest.splice(at + (after ? 1 : 0), 0, from);
  return rest;
}

export const sameOrder = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((id, index) => id === b[index]);

/* ── Playback area ── */

export type MediaGate = 'offline' | 'online' | 'metered' | 'disc' | '';

/** Which explanation currently covers the video in the playback area: source not mounted, an online video with no matching follow entry, or a metered source that needs
 *  a click to start streaming. Saved online videos play normally (the shell already routes them to follow details during fetching). */
export function mediaGate(item: DetailItem, offline: boolean): MediaGate {
  if (offline) return 'offline';
  if (String(item.name || '').toLowerCase().endsWith('.iso')) return 'disc';
  if (item.location === 'online' && !item.follow_item_id) return 'online';
  if (item.cost === 'metered' && item.location !== 'online') return 'metered';
  return '';
}

/** The real watch entry's initial value: watched seconds over duration. Not drawn when duration is unknown (0 or the -1 sentinel). */
export function realWatched(item: DetailItem): number | null {
  const duration = Number(item.duration) > 0 ? Number(item.duration) : 0;
  if (!item.play_seconds || !duration) return null;
  return Math.min(Number(item.play_seconds) / duration, 1) * 100;
}

/* ── After writing ── */

/** The feedback button's acknowledgment. */
export function feedbackReceipt(kind: string, result: { feedback?: string | null; disposal?: string | null }): string {
  if (kind === 'dislike') return result.feedback === 'dislike' ? 'Marked as not my taste' : 'Not my taste cleared';
  if (kind === 'seen') return result.feedback === 'seen' ? 'Marked as watched' : 'Unmarked as watched';
  if (kind === 'dispose') return result.disposal === 'trash' ? 'Moved to trash' : 'Restored out of trash';
  return 'Climax recorded';
}
