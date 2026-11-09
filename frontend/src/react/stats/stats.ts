/* The stats page's data contract and reductions: `/api/stats` serves the whole page in one request.
 *
 * The endpoint is declared once in `frontend/src`, here only (`tests/test_frontend_build.py` watches this).
 * This page is a snapshot of the database right now, with no background jobs and no polling: the whole page has one
 * `queryKey`, and the four metrics on screen and the three panels below all read the same copy; fetching separately would
 * produce one fresh cell next to a stale one.
 *
 * Sizes go through `src/core/index.ts`'s `fmtSize`, the same basis as library, duplicates and quality upgrades; playback
 * duration, percentages and the charts' binning are this page's own reductions, written as pure functions here and verified
 * directly by vitest. */
import { apiGet } from '../../api';
import type { BarRow } from '../charts/bar-card';
import type { ActivityCounts } from '../charts/heat';
import { queryClient } from '../query';

export const STATS_URL = '/api/stats';
/** The whole page shares this one key. */
export const STATS_KEY = ['stats'] as const;

/** Stock by source. `k` is a source code like `local`, `115`, `pikpak`, `online`. */
export interface LocationCount { k: string; n: number; bytes: number; videos: number }

/** Stock broken down by library. `name` is the name the user gave this library. */
export interface LibraryCount { k: string; name: string; icon: string; videos: number; bytes: number }

/** One counter. When the server cannot get an item it returns null, and the page reads it as "not available". */
export type Count = number | null;

/** The videos' profile attribution: the denominator is `videos`, and the other items count entries that already have each. */
export interface Attribution {
  videos: number; creator: Count; code: Count; studio: Count; thumb: Count; duration: Count;
}

/** How many tags and how many videos one tag source covers. */
export interface TagSource { k: string; n: number; assets: number }

export interface TopTag { k: string; n: number; cat: string }

export interface Consumption {
  played: Count; library_played: Count; online_played: Count; play_seconds: Count;
  o_total: Count; liked: Count; dislike: Count; seen: Count; trash: Count; skimmed: Count;
}

/** Entry counts by file type. `k` is a media code like `video`, `image`, `archive`. */
export interface MediumCount { k: string; n: number; bytes: number }

/** One duration or quality tier for a video. */
export interface BandCount { k: string; n: number }

/** `n` videos have been played `k` times. */
export interface ReplayCount { k: number; n: number }

/** The latest play record. The library and online-updates sources are merged and sorted by time, and `kind` decides where a click goes. */
export interface RecentPlay {
  id: number; name: string; creator: string | null; play_seconds: number;
  duration: number | null; max_reached: number | null; o_count: number; kind: string;
}

/** One storage volume. Offline or unreadable capacity makes `total` null, and usage is not drawn then. */
export interface StorageVolume {
  kind: string; label: string; root: string | null; online: boolean;
  free: number | null; used: number | null; total: number | null;
}

export interface StorageSummary {
  volumes: number; online: number; measured: number; free: number; used: number; total: number;
}

/** The `/api/stats` response. Fields align with `web_stats.q_stats`. */
export interface StatsData {
  by_loc: LocationCount[];
  by_medium: MediumCount[];
  by_library: LibraryCount[];
  by_length: BandCount[];
  by_quality: BandCount[];
  play_activity: ActivityCounts;
  replays: ReplayCount[];
  attribution: Attribution;
  tag_source: TagSource[];
  tag_cov: Count;
  top_tags: TopTag[];
  consumption: Consumption;
  recent: RecentPlay[];
  storage_volumes: StorageVolume[];
  storage_summary: StorageSummary;
}

export const fetchStats = (signal?: AbortSignal) => apiGet<StatsData>(STATS_URL, signal);

/** First screen: render only after data arrives.
 *
 * No `staleTime`. This page reads the database as it is right now and should ask again on every visit; cached, the count seen after a scan batch would be the one from before the page was opened. */
export async function prefetchStats(signal: AbortSignal): Promise<void> {
  await queryClient.fetchQuery({ queryKey: STATS_KEY, queryFn: () => fetchStats(signal) });
}

/** A count that was actually obtained: null, NaN, and infinity do not qualify. */
export const known = (value: Count | undefined): value is number =>
  value != null && Number.isFinite(value);

/** How a count is rendered: thousands separators; when unavailable it reads "Not obtained". */
export const fmtCount = (value: Count | undefined): string =>
  (known(value) ? value.toLocaleString() : 'Not fetched');

/** Integer percentage clamped to 0-100. Reads 0, not NaN, when the denominator is 0 or unavailable. */
export const percentOf = (value: Count | undefined, total: Count | undefined): number =>
  (known(value) && known(total) && total > 0
    ? Math.min(100, Math.max(0, Math.round(value / total * 100))) : 0);

/** How to read percentages: with something present but under 0.5%, read '<1%', not 0%. */
export const percentText = (value: Count | undefined, total: Count | undefined): string => {
  const share = percentOf(value, total);
  return !share && known(value) && value > 0 && known(total) && total > 0 ? '<1%' : `${share}%`;
};

/** Total watch time: minutes under an hour, hours under 48, days beyond that. */
export const playedFor = (seconds: Count | undefined): string => {
  if (!known(seconds)) return 'Not fetched';
  const value = Math.max(0, seconds);
  if (value >= 48 * 3600) {
    return `${(value / 86_400).toLocaleString(undefined, { maximumFractionDigits: 1 })} days`;
  }
  return value >= 3600 ? `${(value / 3600).toFixed(1)} hr` : `${Math.round(value / 60)} min`;
};

/** The genuinely watched ratio: played seconds over duration, capped at 100%. Reads 0 when the duration is unknown. */
export const watchedShare = (row: RecentPlay): number =>
  row.duration ? Math.min(row.play_seconds / row.duration, 1) * 100 : 0;

/** The farthest position reached, as a percentage. */
export const reachedShare = (row: RecentPlay): number => (row.max_reached || 0) * 100;

/** Which kind of watching this entry records.
 *
 * When the actually-watched ratio sits far below the reached position, large stretches were scrubbed through, which is a different thing from watching start to finish;
 *  showing a single percentage per row leaves readers unable to tell them apart. */
export const watchNote = (row: RecentPlay): string => {
  if (row.kind === 'online') return 'Watch online directly';
  if (watchedShare(row) < reachedShare(row) - 25) return 'Seek-skipped';
  return row.o_count ? `Climaxes ${row.o_count}` : 'Normal watching';
};

/** Where a click leads. Online follow-up entries are not in the library and use their own detail route. */
export const playedItemUrl = (row: RecentPlay): string =>
  `${row.kind === 'online' ? '/posts/' : '/assets/'}${row.id}`;

/** One segment in the radial chart. `bytes` is the volume this segment takes, read as its size in the legend cell. */
export interface RadialSlice { name: string; value: number; bytes?: number; mark?: string }

/** How many rings one radial chart can draw at most: there are only six chart colors, so from the seventh ring on the colors repeat. */
export const RADIAL_MAX = 6;

/** The segments to draw on the radial chart. When segments exceed `RADIAL_MAX`, keep the top five and merge the rest into one "Other N items" segment.
 *  Negative and non-finite values are filtered out first. */
export function radialSlices(rows: RadialSlice[], max = RADIAL_MAX): RadialSlice[] {
  const slices = rows.filter((row) => Number.isFinite(row.value) && row.value >= 0);
  if (slices.length <= max) return slices;
  const ranked = [...slices].sort((a, b) => b.value - a.value);
  const rest = ranked.slice(max - 1);
  return [...ranked.slice(0, max - 1), {
    name: `${rest.length.toLocaleString()} other items`,
    value: rest.reduce((sum, row) => sum + row.value, 0),
    bytes: rest.reduce((sum, row) => sum + (row.bytes ?? 0), 0),
  }];
}

/** The number a full ring represents: the longest segment keeps a 10% margin so it reads as "at most", not "all". */
export const radialCeiling = (values: number[]): number => Math.max(1, ...values) * 1.1;

/** How long an arc each segment draws: nonzero segments draw at least 2% of the circle, so they stay visible even orders of magnitude below the longest.
 *  Zero stays zero, no padding up. */
export const radialArc = (value: number, ceiling: number): number =>
  (value > 0 ? Math.max(value, ceiling * 0.02) : 0);

/** Each ring's thickness in pixels. Thinner when there are more segments, so the innermost ring neither shrinks into the center nor overlaps its neighbor. */
export const radialBarSize = (count: number): number =>
  Math.max(4, Math.min(14, Math.round(90 / Math.max(1, count))));

/** Display names for file types. Same wording as the resource cards in the library. */
const MEDIUM_LABEL: Record<string, string> = {
  video: 'Videos', image: 'Images', illustration: 'Illustrations', archive: 'Archives',
  audio: 'Audio', account: 'Account', other: 'Other files',
};

/** Item counts by file type, largest first. */
export const mediumRows = (rows: MediumCount[]): BarRow[] =>
  rows.map((row) => ({ name: MEDIUM_LABEL[row.k] ?? row.k, value: row.n }))
    .sort((a, b) => b.value - a.value);

/** Display names for the duration buckets. Boundaries match `media_probe.context_fields`: 300, 900, 2400 seconds. */
const LENGTH_LABEL: Record<string, string> = {
  速食: '<5 min', 短: '5–15 min', 中: '15-40 min', 长: '40 min and up',
};

/** Duration and quality tiers, ordered by the server. Duration becomes minute ranges; quality stays as is. */
export const bandRows = (rows: BandCount[], labels: Record<string, string> = {}): BarRow[] =>
  rows.map((row) => ({ name: labels[row.k] ?? row.k, value: row.n }));

export const lengthRows = (rows: BandCount[]): BarRow[] => bandRows(rows, LENGTH_LABEL);

/** Play-count tiers: one tier per play up to five, then merged into two, so the long tail does not stretch the bars into a row of hairlines.
 *  Names state only the count, with the unit in the chart title: on a 320-wide phone, seven bars' category names must not squeeze each other out. */
const REPLAY_BANDS: readonly [number, number, string][] = [
  [1, 1, '1'], [2, 2, '2'], [3, 3, '3'], [4, 4, '4'], [5, 5, '5'],
  [6, 9, '6–9'], [10, Infinity, '≥10'],
];

export const replayRows = (rows: ReplayCount[]): BarRow[] =>
  REPLAY_BANDS.map(([low, high, name]) => ({
    name,
    value: rows.filter((row) => row.k >= low && row.k <= high).reduce((sum, row) => sum + row.n, 0),
  }));
