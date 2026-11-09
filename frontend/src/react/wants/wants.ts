/* Data contract for the "Wants" list (ADR-0090): `/api/wants` is declared exactly once here in `frontend/src`.
 *
 * Two keys: one for the whole list page (the "Wants" tab of follows management), and one per entry for asking follows details "was this one ever wanted".
 * After a write, invalidate both families: clicking want in details means the list must already contain it when returning to the tab; removing it in the tab must
 * bump the details key too. */
import { apiGet, apiSend } from '../../api';
import { queryClient } from '../query';

export const WANTS_URL = '/api/wants';

export const WANTS_KEY = ['wants'] as const;
export const wantFollowKey = (itemId: number) => ['wants', 'follow', itemId] as const;

/** The four segments on the list; their order is the order set in the tabs. */
export const PHASES = [
  ['searching', 'To find'], ['unreleased', 'Unreleased'], ['given_up', 'Given up for now'], ['acquired', 'In library'],
] as const;
export type Phase = (typeof PHASES)[number][0];

/** One want entry. Fields align with `_payload` in `src/peach/web_wants.py`. */
export interface Want {
  id: number;
  code: string | null;
  has_magnets?: boolean | null;
  origin: 'code' | 'feed' | 'follow';
  title: string | null;
  link: string | null;
  release_date: string | null;
  studio: string | null;
  performers: string | null;
  phase: Phase;
  fresh: boolean;
  search_count: number;
  last_search_at: string | null;
  last_search_outcome: 'found' | 'none' | 'error' | null;
  given_up_at: string | null;
  acquired_asset_id: number | null;
  acquired_at: string | null;
  follow_item_id: number | null;
  follow_provider: string | null;
  cover: string | null;
  /** The cover is still the remote URL the source gave: it must be fetched with `no-referrer`. */
  remote_cover: boolean;
  scraped: boolean;
  scrape_error: string | null;
  created_at: string;
}

export interface WantsData {
  items: Want[];
  counts: Record<Phase, number>;
  /** The profile fetch round is still running: the newly registered profiles have not come back yet. */
  scraping: boolean;
}

export const fetchWants = (signal?: AbortSignal) => apiGet<WantsData>(WANTS_URL, signal);

export function recordWantMagnets(id: number, available: boolean) {
  queryClient.setQueryData<WantsData>(WANTS_KEY, current => {
    if (!current?.items.some(want => want.id === id && want.has_magnets !== available)) return current;
    return { ...current, items: current.items.map(want => want.id === id ? { ...want, has_magnets: available } : want) };
  });
}

export const fetchFollowWant = (itemId: number, signal?: AbortSignal) =>
  apiGet<{ want: Want | null }>(`${WANTS_URL}?follow=${encodeURIComponent(itemId)}`, signal);

type AddTarget = { code: string } | { follow: number };

export const addWant = (target: AddTarget, signal?: AbortSignal) =>
  apiSend<{ created: boolean; want: Want }>(WANTS_URL, { action: 'add', ...target }, 'POST', signal);

export const removeWants = (ids: number[], signal?: AbortSignal) =>
  apiSend(WANTS_URL, { action: 'remove', ids }, 'POST', signal);

export const resetWants = (ids: number[], signal?: AbortSignal) =>
  apiSend(WANTS_URL, { action: 'reset', ids }, 'POST', signal);

/** After the write: the list and each follow detail's want status refetch together. */
export const invalidateWants = () => queryClient.invalidateQueries({ queryKey: WANTS_KEY });

/** What one wanted entry is called: the code leads, and follows entries without a code use the title. */
export const wantName = (want: Want) => want.code || want.title || `Follow entry ${want.follow_item_id ?? want.id}`;

/** The "to find" section's explainer: misses on new releases do not count; an old title is shelved after three full attempts. */
export function searchNote(want: Want): string {
  if (want.phase === 'acquired') return want.acquired_at ? `Added to library ${want.acquired_at.slice(0, 10)}` : 'In library';
  if (want.phase === 'unreleased') return want.release_date ? `Releases ${want.release_date}` : 'Not released yet';
  if (want.phase === 'given_up') return `Not found after ${want.search_count} searches`;
  if (want.fresh) return 'New titles stay in the pending list even when lookup fails';
  return want.search_count ? `Searched ${want.search_count} times` : 'Never checked';
}
