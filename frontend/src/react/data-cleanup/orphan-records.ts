/* Orphan records' data contract: videos whose files are no longer on disk but carry personal records (ADR-0087).
 *
 * One read endpoint, one write endpoint. The list carries each entry's record counts across six tables, the row's rating and count, and in-library candidates;
 * adoption moves records onto the chosen file and deletes the old row, recording a batch that can be reverted whole. Permanent delete goes through the batch API's `delete`. */
import { apiGet, apiSend } from '../../api';
import { BATCH_URL } from '../duplicates/duplicates';
import { t } from '../../i18n';

export const ORPHAN_RECORDS_URL = '/api/orphan-records';
export const ORPHAN_ATTACH_URL = '/api/orphan-records/attach';
export const ORPHAN_RECORDS_KEY = ['orphan-records'] as const;

/** The file in the library that may be its newer edition. */
export interface OrphanCandidate {
  id: number;
  location: string;
  name: string;
  duration: number | null;
  size: number | null;
}

export interface OrphanRecord {
  id: number;
  name: string;
  code: string;
  location: string;
  duration: number | null;
  size: number | null;
  vanished_at: number | null;
  has_thumb: boolean;
  /** How many rows each of the six tables has, plus the ratings, climaxes, and play counts on the rows; a set `last_played` counts as 1. Absent ones do not appear. */
  records: Partial<Record<RecordKey, number>>;
  candidates: OrphanCandidate[];
}

export interface OrphanRecordsData { total: number; items: OrphanRecord[] }

export type RecordTable = 'asset_preference' | 'watch_queue' | 'playlist_item'
  | 'asset_quality_goal' | 'activity_event' | 'asset_tag_preference';

/** The row's own four columns of personal records. */
export type RowRecord = 'rating' | 'o_count' | 'play_count' | 'last_played';

export type RecordKey = RecordTable | RowRecord;

/** The six tables' names in this block; the order is the display order. */
export const RECORD_LABELS: ReadonlyArray<readonly [RecordTable, string]> = [
  ['asset_preference', t('cleanup:orphans.recordLikes')],
  ['watch_queue', t('cleanup:orphans.recordWatchLater')],
  ['playlist_item', t('cleanup:orphans.recordPlaylists')],
  ['asset_quality_goal', t('cleanup:orphans.recordBetterVersion')],
  ['activity_event', t('cleanup:orphans.recordWatchHistory')],
  ['asset_tag_preference', t('cleanup:orphans.recordHiddenTags')],
];

export const fetchOrphanRecords = (signal?: AbortSignal) =>
  apiGet<OrphanRecordsData>(ORPHAN_RECORDS_URL, signal);

/** Attaches an orphan record to a library file. A real ledger write, with the old row deleted along with it. */
export const attachOrphan = (id: number, target: number) =>
  apiSend<{ ok: boolean; batch: string }>(ORPHAN_ATTACH_URL, { id, target });

/** Permanently deletes this entry and its records. Irreversible; callers must pass the danger-tier confirmation popover first.
 *  An entry whose file is back on disk lands in `blocked` and is not deleted; the next scan round reconnects it to the library. */
export const purgeOrphan = (id: number | number[]) =>
  apiSend<{ ok: boolean; purged: number; blocked: unknown[] }>(BATCH_URL, { ids: Array.isArray(id) ? id : [id], operation: 'delete' });

/** How the row's four columns are written: score and count as recorded; when only a last-played exists with no play count, write "played". */
const rowRecordsText = (records: OrphanRecord['records']) => [
  records.rating ? t('cleanup:orphans.recordRating', { rating: records.rating }) : '',
  records.play_count ? t('cleanup:orphans.recordPlays', { count: Number(records.play_count) })
    : records.last_played ? t('cleanup:orphans.recordPlayed') : '',
  records.o_count ? t('cleanup:orphans.recordOCount', { count: Number(records.o_count) }) : '',
];

/** One band's records arranged into a line: "likes and reasons 1 · watch history 3 · rating 4 · played 2 times". */
export const recordsText = (records: OrphanRecord['records']) => [
  ...RECORD_LABELS
    .filter(([table]) => records[table])
    .map(([table, label]) => `${label} ${Number(records[table]).toLocaleString()}`),
  ...rowRecordsText(records),
].filter(Boolean).join(' · ');

const minutes = (seconds: number | null) => (seconds ? t('cleanup:orphans.candidateMinutes', { count: Math.round(seconds / 60) }) : '');

/** One candidate file row in the dropdown. */
export const candidateText = (item: OrphanCandidate) =>
  [item.name, minutes(item.duration)].filter(Boolean).join(' · ');
