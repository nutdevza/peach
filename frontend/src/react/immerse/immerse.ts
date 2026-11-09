/* Immersive mode's data and criteria: how the video list is drawn, which key details fetch by, how the byline reads, and whether the picture fills or fits.
 *  No DOM here; the controller and components in `immerse-island.tsx` both take from this. */
import type { QueryKey } from '@tanstack/react-query';

import { apiGet } from '../../api';
import { queryClient } from '../query';
import { fetchItem, itemKey, type DetailEntityRef, type DetailItem } from '../item-detail/item-detail';

/** One entry in the playlist (the card variant of `/api/items`). */
export interface ImmerseItem {
  id: number;
  name?: string;
  title?: string;
  location?: string;
  root_id?: string;
  cost?: string;
  duration?: number | null;
  width?: number | null;
  height?: number | null;
  ctx_orient?: string;
  [field: string]: unknown;
}

/** The playlist keys by "this open" and "which continuation": every open is a fresh random sample, and a continued batch
 *  must not read the previous batch's cache either. */
export const immerseListKey = (filters: string, seed: number, draw: number): QueryKey => ['immerse-list', filters, seed, draw];

/** The query string for sampling: the home filter minus aspect (both orientations in), taking 60 at random.
 *
 *  There is no offset to page through: `sort=rand` is an unseeded `RANDOM()` on the server (web_contract.py), so every
 *  request is a fresh random sample and a page offset is meaningless on top of it; carrying one would only randomly skip rows.
 *  Continuation relies on the call site deduplicating by id, not on an offset. */
export function immerseQuery(filters: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, String(value));
  params.delete('orient');
  params.set('sort', 'rand');
  params.set('limit', '60');
  params.set('offset', '0');
  params.set('thumb', '');
  return params.toString();
}

/** What can go straight into a playlist: not metered by traffic, has a duration, and its source is not off-disk. Videos from off-disk sources cannot pull a stream and would be
 *  a black loading screen in the playlist; the details page has a gate, so they can only be filtered out here at the entrance. */
export const playable = (item: ImmerseItem, offline: (location: string) => boolean): boolean =>
  item.cost !== 'metered' && !!item.duration && !offline(String(item.root_id || item.location || ''));

export function shuffle<T>(list: T[], random: () => number = Math.random): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

export async function fetchImmerseList(query: string, offline: (location: string) => boolean): Promise<ImmerseItem[]> {
  const page = await apiGet<{ items?: ImmerseItem[] }>(`/api/items?${query}`);
  return shuffle((page.items || []).filter((item) => playable(item, offline)));
}

/** This entry's details: same key as video details, so after action keys write back, details and the catalog card read the same copy. Already in the cache means no
 *  refetch (returning to a viewed entry, and the playback-starting entry, were already fetched on open). */
export const ensureDetail = (id: number): Promise<DetailItem> =>
  queryClient.ensureQueryData({ queryKey: itemKey(id), queryFn: ({ signal }) => fetchItem(id, signal) });

/** Append the newly drawn batch after the existing one, deduplicated by id. */
export function extendList(list: ImmerseItem[], more: ImmerseItem[]): ImmerseItem[] {
  const seen = new Set(list.map((item) => item.id));
  return list.concat(more.filter((item) => !seen.has(item.id)));
}

/** The author line: co-starred videos read out everyone on camera (up to three, beyond that print the count); clicking opens the first one's profile page; with no performers
 *  it is the creator, and failing that "Unattributed". */
export interface Owner {
  who: string;
  kind: 'performer' | 'creator' | '';
  name: string;
  ref: DetailEntityRef | null;
}

export function ownerOf(item: Pick<DetailItem, 'performers' | 'creator' | 'entity_refs'>): Owner {
  const cast = item.performers || [];
  const who = cast.length
    ? cast.slice(0, 3).join('、') + (cast.length > 3 ? ` and ${cast.length} people` : '')
    : (item.creator || 'Unassigned');
  const kind = cast.length ? 'performer' : (item.creator ? 'creator' : '');
  const name = cast.length ? cast[0]! : (item.creator || 'Unassigned');
  const ref = kind ? (item.entity_refs?.[kind]?.[0] || null) : null;
  return { who, kind, name, ref };
}

/** Immersive mode defaults to cover filling the frame, but that only holds when stream and viewport ratios are close.
 *
 *  The criterion is how far the two ratios differ, not "is the stream portrait": by that rule a 16:9 landscape in a portrait
 *  viewport would still cover, scaled to height and cropping most of both sides. The tolerance is deliberately tight (1.05):
 *  using contain for portrait streams is the intentional choice of "do not crop the picture being watched". Loosening to 1.25
 *  would also flip a 9:16 stream on a 9:19.5 phone to cover and crop about 18% of its height. Now only near-identical ratios
 *  cover (saving the 1px black bars rounding produces); everything else displays in full. The viewport ratio changes with
 *  rotation and window size, so it must be recomputed along, never only once at loadedmetadata. */
export const FIT_TOLERANCE = 1.05;

/** `null` means it cannot be measured yet (metadata not arrived or the frame has no size); the current state is left alone. */
export function fitMode(sourceWidth: number, sourceHeight: number, box: number): 'cover' | 'contain' | null {
  if (!sourceWidth || !sourceHeight || !box || !Number.isFinite(box)) return null;
  const source = sourceWidth / sourceHeight;
  const mismatch = source > box ? source / box : box / source;
  return mismatch > FIT_TOLERANCE ? 'contain' : 'cover';
}

/** Stage shape (portrait 9:16 or landscape 16:9): use the picture once metadata arrives, else the width and height registered on the item, else portrait. */
export function isWide(video: { videoWidth: number; videoHeight: number }, item: Pick<ImmerseItem, 'width' | 'height'>): boolean {
  if (video.videoWidth && video.videoHeight) return video.videoWidth >= video.videoHeight;
  return !!(item.width && item.height && item.width > 0 && item.height > 0 && item.width >= item.height);
}

/* ── Gesture numbers ── */
/** Two taps in the same half within this window count as a double click. */
export const DOUBLE_TAP_MS = 280;
/** The click the browser synthesizes after a touch release no longer toggles playback: that tap is already handled by the single/double tap logic. */
export const SYNTHETIC_CLICK_MS = 700;
/** Direction is only decided past this much displacement; once decided it never flips, otherwise a diagonal swipe would page and seek at the same time. */
export const AXIS_LOCK_PX = 12;
/** A vertical swipe beyond this threshold switches the entry. */
export const SWIPE_PX = 60;
/** Movement within this bound in both directions counts as one click. */
export const TAP_SLOP_PX = 14;
/** Throttle for wheel-based entry switching. */
export const WHEEL_GAP_MS = 260;
/** After a dislike, dwell this long before moving to the next one: the receipt lands first. */
export const DISLIKE_ADVANCE_MS = 260;
/** The slice animation's duration plus a one-frame margin; even when the animation frame never fires (page in the background), it settles at this moment. */
export const SLIDE_MS = 210;
/** The cap on waiting for a cell to enter the frame. */
export const READY_TIMEOUT_MS = 15_000;
