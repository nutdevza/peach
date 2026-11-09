/* The playlists page's data contract and its three write operations.
 *
 * Reads `/api/playlists` (`q_playlists` in `src/peach/web_playlists.py`, sorted by last change); writes always POST
 * `/api/playlist`. The write endpoint returns the whole list with `items`, not the list page's row shape, and renaming also
 * touches `updated_at` and changes the sort, so after any write the list key refetches; the response is never assembled into
 * cache.
 *
 * Saving a Mix on home and coming back must show it: the first screen's `prefetch` refetches from the server every time and
 * never reads the previous copy from cache. */
import { apiGet, apiSend } from '../../api';
import { queryClient } from '../query';

export const PLAYLISTS_URL = '/api/playlists';
export const PLAYLIST_URL = '/api/playlist';
export const PLAYLISTS_KEY = ['playlists'] as const;

/** The list card's credits: the most featured performers in the list (the server sends at most three). */
export interface PlaylistFace {
  kind: string;
  id: number;
  name: string;
  has_image: boolean;
  image_version?: string;
  avatar_focus?: unknown;
}

/** One row of `/api/playlists`. */
export interface PlaylistRow {
  id: number;
  name: string;
  /** `mix` was saved from Mix; the rest were built by hand. */
  source_kind: string;
  source_seed_asset_id: number | null;
  current_asset_id: number | null;
  created_at: string;
  updated_at: string;
  item_count: number;
  /** Static cover: the resume point's one, or the first when there is no resume point. Empty list is null. */
  preview_asset_id: number | null;
  /** The covers flipped through on hover, the resume-point frame first, at most five. */
  preview_ids: number[];
  faces: PlaylistFace[];
}

export interface PlaylistsData { items: PlaylistRow[] }

/** The full list as returned by `/api/playlist?id=` and the write endpoints' replies. This page only uses the fields below. */
export interface PlaylistDetail {
  id: number;
  name: string;
  source_kind: string;
  source_seed_asset_id: number | null;
  current_asset_id: number | null;
  items: { id: number; name?: string; title?: string }[];
}

export const fetchPlaylists = (signal?: AbortSignal) => apiGet<PlaylistsData>(PLAYLISTS_URL, signal);

/** First screen. `staleTime: 0` makes it explicit: refetch even when the cache still holds the previous list. */
export async function prefetchPlaylists(signal: AbortSignal): Promise<void> {
  await queryClient.fetchQuery({ queryKey: PLAYLISTS_KEY, queryFn: () => fetchPlaylists(signal), staleTime: 0 });
}

/** Re-read the list after writing. */
export const refreshPlaylists = () => queryClient.invalidateQueries({ queryKey: PLAYLISTS_KEY, exact: true });

/** Which item clicking a card resumes from: the resume point, or the first if none. An empty list has nowhere to go. */
export const resumeAssetId = (row: PlaylistRow) => row.current_asset_id || row.preview_asset_id || null;

export const posterUrl = (id: number) => `/poster?id=${id}&c=4`;

type Written = { ok: true; playlist: PlaylistDetail };

export const createPlaylist = (name: string) =>
  apiSend<Written>(PLAYLIST_URL, { action: 'create', name, asset_ids: [] });

export const renamePlaylist = (id: number, name: string) =>
  apiSend<Written>(PLAYLIST_URL, { action: 'rename', id, name });

export const deletePlaylist = (id: number) =>
  apiSend<{ ok: true; deleted: number }>(PLAYLIST_URL, { action: 'delete', id });

export const fetchPlaylist = (id: number, signal?: AbortSignal) => apiGet<PlaylistDetail>(`${PLAYLIST_URL}?id=${id}`, signal);
export const reorderPlaylist = (id: number, ids: number[]) =>
  apiSend<Written>(PLAYLIST_URL, { action: 'reorder', id, asset_ids: ids });

/** Fetch the contents before deleting: `delete` clears the playlist_item rows too, and afterwards nothing can tell you which videos the list held.
 *  If they cannot be fetched it is null, and that delete gets no undo. */
export const keepPlaylist = (id: number): Promise<PlaylistDetail | null> =>
  apiGet<PlaylistDetail>(`${PLAYLIST_URL}?id=${id}`).catch(() => null);

/** Undo delete: rebuild a new record holding the same batch of videos and the same source. If the Mix seed is no longer in the list, omit it;
 *  the server requires the seed to be in the list. */
export function recreatePlaylist(kept: PlaylistDetail) {
  const ids = (kept.items || []).map((entry) => entry.id);
  const seed = kept.source_seed_asset_id;
  return apiSend<Written>(PLAYLIST_URL, {
    action: 'create', name: kept.name, asset_ids: ids, source_kind: kept.source_kind,
    source_seed_asset_id: seed !== null && ids.includes(seed) ? seed : null,
  });
}
