import { JAV_RELEASE_SORT } from '../../sort-preferences';

export const DISCOVERY_SORTS = [
  ['taste', 'Taste', 'Sort by taste match'],
  ['release_date', JAV_RELEASE_SORT[1], 'Sort by release date'],
  ['source_score', 'Source rating', 'Sort by source rating'],
  ['duration', 'Duration', 'Sort by duration'],
  ['code', 'Code', 'Sort by code'],
] as const;
export type DiscoverySort = typeof DISCOVERY_SORTS[number][0];
/** The sort of the new-releases section: release time first (default), the rest same as 'Discover'; random is 'new batch', with no corresponding sort key. */
export const RELEASE_SORTS = [
  ['release_date', JAV_RELEASE_SORT[1], 'Sort by release date'],
  ['source_score', 'Source rating', 'Sort by source rating'],
  ['duration', 'Duration', 'Sort by duration'],
  ['code', 'Code', 'Sort by code'],
  ['taste', 'Taste', 'Sort by taste match'],
] as const;
export type ReleaseSort = typeof RELEASE_SORTS[number][0] | 'random';
export type DiscoveryDirection = 'asc' | 'desc';

export function discoveryScore(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '—';
}

/** Taste relevance uses a fixed 100-point scale; unknown readings keep an empty value. */
export function recommendationScore(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { score: '—', label: 'Profile not fetched', color: 'neutral' as const };
  const score = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const tier = score >= 75 ? { label: 'Strongly recommended', color: 'lime' as const }
    : score >= 50 ? { label: 'Recommended', color: 'blue' as const }
    : score >= 25 ? { label: 'Worth a look', color: 'yellow' as const }
    : { label: 'Explore', color: 'neutral' as const };
  return { score: String(score), ...tier };
}
