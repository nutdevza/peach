/* Resource sync's data contract: per library record, look up the file on local disks and cloud drives (ADR-0080, ADR-0087).
 *
 * One check, one run. The check reports per source the records whose files are no longer on disk, empty folders and
 * unreadable directories, plus orphaned cache. Records whose files are gone come in two tiers: those with personal records are
 * marked vanished and the record stays; the rest are permanently deleted (including anything in trash). The run only accepts
 * this check's candidates, re-verifies each, handles both tiers, then deletes empty folders bottom-up and clears orphaned
 * cache.
 *
 * Two background jobs, two keys. The scan endpoint both starts the job and reads status (`status_only`); for the run, GET
 * reads the snapshot and POST starts it; both poll on the `running` switch and stay silent while idle.
 *
 * This block only appears when some source has a root configured (`hasResourceRoots`), so both states follow source
 * reachability: only with roots does it join first-screen prefetch, and machines without this block avoid two extra requests
 * when entering data management. */
import { apiGet, apiSend } from '../../api';
import { MEDIA_SOURCES_KEY, SCANNABLE_LOCATIONS, type MediaSourcesData } from '../media-sources';
import { queryClient } from '../query';
import { t } from '../../i18n';

export const RESOURCE_SCAN_URL = '/api/resource-sync/scan';
export const RESOURCE_APPLY_URL = '/api/resource-sync/apply';

export const RESOURCE_SCAN_KEY = ['resource-sync', 'scan'] as const;
export const RESOURCE_APPLY_KEY = ['resource-sync', 'apply'] as const;

/** One source's check result for this run. Offline sources are skipped and only report how many items the library holds. */
export interface ResourceSource {
  location: string;
  online: boolean;
  total: number;
  missing: number;
  /** The count of `missing` entries with personal records that get marked as vanished on execution. */
  vanish?: number;
  empty: number;
  unreadable: number;
}

export interface ResourceScanState {
  status: 'idle' | 'running' | 'complete' | 'failed';
  scan_id: string;
  sources?: ResourceSource[];
  completed_sources?: number;
  total_sources?: number;
  missing?: number;
  /** `missing` splits into two tiers: permanently deleted, and marked vanished with personal records kept. */
  purge?: number;
  vanish?: number;
  empty?: number;
  unreadable?: number;
  cache?: { files: number; bytes: number };
  /** This round has already been cleaned against: the numbers are the pre-cleanup ones, and the result area now draws the cleanup receipt. */
  applied?: boolean;
  error?: string;
}

/** Entries where review found the files actually still present at execution time: not deleted; report the names and the reason. */
export interface BlockedRecord { id: number; name: string; reason: string }

export interface ResourceApplyState {
  status: 'idle' | 'running' | 'complete' | 'failed';
  job_id?: string;
  message?: string;
  purged?: number;
  vanished?: number;
  /** Entries marked missing that match exactly one other edition in the library: the records handed over on the spot. */
  reattached?: number;
  blocked?: BlockedRecord[];
  dirs_removed?: number;
  dir_errors?: number;
  cache_removed?: number;
  bytes_reclaimed?: number;
  cache_blocked?: string[];
  error?: string;
}

export const fetchResourceScan = (signal?: AbortSignal) =>
  apiSend<ResourceScanState>(RESOURCE_SCAN_URL, { background: true, status_only: true }, 'POST', signal);

export const startResourceScan = () =>
  apiSend<ResourceScanState>(RESOURCE_SCAN_URL, { background: true, restart: true });

export const fetchResourceApply = (signal?: AbortSignal) =>
  apiGet<ResourceApplyState>(RESOURCE_APPLY_URL, signal);

/** Handles the dead records found by this check (permanent delete or mark as vanished) and empty folders, and cleans idle caches. Real ledger
 *  writes; the permanent-delete tier is irreversible, and callers must pass the danger-tier confirmation popover first. */
export const startResourceApply = (scanId: string) =>
  apiSend<ResourceApplyState>(RESOURCE_APPLY_URL,
    { confirm: true, clean_cache: true, scan_id: scanId, background: true });

/** Whether this section appears: there is something to reconcile only when a disk source has a root directory configured. */
export const hasResourceRoots = (data: MediaSourcesData | undefined) =>
  (data?.sources ?? []).some((source) => SCANNABLE_LOCATIONS.includes(source.location)
    && Array.isArray(source.roots) && source.roots.length > 0);

/** 来源可达性落进缓存之后，有根目录才独立预取检查与清理状态。 */
export async function prefetchResourceSync(signal: AbortSignal): Promise<void> {
  if (!hasResourceRoots(queryClient.getQueryData<MediaSourcesData>(MEDIA_SOURCES_KEY))) return;
  void queryClient.prefetchQuery({ queryKey: RESOURCE_SCAN_KEY, queryFn: () => fetchResourceScan(signal) });
  void queryClient.prefetchQuery({ queryKey: RESOURCE_APPLY_KEY, queryFn: () => fetchResourceApply(signal) });
}

/** Whether this pass has anything to clean. When nothing remains, the bottom bar reads "no records, empty folders or cache waiting to be cleaned". */
export const hasChanges = (scan: ResourceScanState | undefined) =>
  Boolean(scan?.missing || scan?.empty || scan?.cache?.files);

/** A source code's name within this section. Unrecognized sources are collectively called 'media source'. */
export { SOURCE_LABELS } from '../../core/media-sources';

const count = (value: number | undefined) => Number(value || 0).toLocaleString();

/** How far the scan has progressed. */
export const scanLine = (state: ResourceScanState) => (state.total_sources
  ? t('cleanup:resourceSync.scanProgress', { completed: state.completed_sources || 0, count: state.total_sources })
  : t('cleanup:resourceSync.scanningStorage'));

/** The count for the permanent-delete tier: `missing` minus those marked as vanished. */
export const purgeCount = (scan: ResourceScanState) =>
  scan.purge ?? Number(scan.missing || 0) - Number(scan.vanish || 0);

/** The sentence for the marked-as-vanished tier; an empty string when there is no such tier. */
const vanishText = (scan: ResourceScanState) => (scan.vanish
  ? t('cleanup:resourceSync.vanishNotice', { count: Number(scan.vanish || 0) })
  : '');

/** The irreversible line: when the 'marked as vanished' tier exists, it only names what gets deleted. */
const irreversible = (scan: ResourceScanState) => (scan.vanish ? t('cleanup:resourceSync.irreversiblePart') : t('cleanup:resourceSync.irreversible'));

/** The cleanup line in the results panel. */
export const applyPlanText = (scan: ResourceScanState) => [
  t('cleanup:resourceSync.applyPlan', { count: Number(purgeCount(scan) || 0), empty: count(scan.empty), cache: count(scan.cache?.files) }),
  irreversible(scan), vanishText(scan)].filter(Boolean).join(t('cleanup:shared.sentenceGap'));

/** The confirm dialog's body: it says more than the result panel, adding that items already in trash count and source roots are preserved. */
export const applyConfirmText = (scan: ResourceScanState) => [
  t('cleanup:resourceSync.applyConfirm', { count: Number(purgeCount(scan) || 0), empty: count(scan.empty), cache: count(scan.cache?.files) }),
  irreversible(scan), vanishText(scan)].filter(Boolean).join(t('cleanup:shared.sentenceGap'));

/** The footnote on a source's stats card. */
export const sourceMeta = (source: ResourceSource) => (source.online
  ? [t('cleanup:resourceSync.sourceMissing', { count: Number(source.total || 0) }),
    source.vanish ? t('cleanup:resourceSync.sourceWithActivity', { count: Number(source.vanish || 0) }) : '',
    source.empty ? t('cleanup:resourceSync.sourceEmptyDirs', { count: Number(source.empty || 0) }) : ''].filter(Boolean).join(' · ')
  : t('cleanup:resourceSync.sourceInCollection', { count: Number(source.total || 0) }));

/** What stays in place after the run finishes: the file is actually still there, the directory cannot be read right now, the cache is in use. */
export function applyLeftovers(out: ResourceApplyState) {
  const blocked = out.blocked ?? [];
  const dirErrors = Number(out.dir_errors || 0);
  const cacheBlocked = out.cache_blocked ?? [];
  const done = Number(out.purged || 0) + Number(out.vanished || 0) + Number(out.reattached || 0)
    + Number(out.dirs_removed || 0) + Number(out.cache_removed || 0);
  const left = blocked.length + dirErrors + cacheBlocked.length;
  const names = blocked.slice(0, 3).map((item) => t('cleanup:shared.quoted', { text: item.name })).join(t('cleanup:shared.listSeparator'))
    + (blocked.length > 3 ? t('cleanup:resourceSync.namesMore') : '');
  const rest = [
    blocked.length ? t('cleanup:resourceSync.recordsNotDeleted', { count: Number(blocked.length || 0), names }) : '',
    dirErrors ? t('cleanup:resourceSync.dirsNotDeleted', { count: Number(dirErrors || 0) }) : '',
    cacheBlocked.length ? t('cleanup:resourceSync.cacheNotCleaned', { count: Number(cacheBlocked.length || 0) }) : '',
  ].filter(Boolean).join(t('cleanup:shared.clauseSeparator'));
  return { done, left, rest };
}

/** The execution result sentence. When some items were not processed, it adds that a retry is possible after re-checking. */
export const applyText = (out: ResourceApplyState, formatSize: (bytes: number) => string) => {
  const { rest } = applyLeftovers(out);
  const summary = [
    t('cleanup:resourceSync.applyDone', { count: Number(out.purged || 0), dirs: count(out.dirs_removed),
      cache: count(out.cache_removed), size: formatSize(out.bytes_reclaimed || 0) }),
    ...(out.vanished ? [t('cleanup:resourceSync.vanishedNotice', { count: Number(out.vanished || 0) })] : []),
    ...(out.reattached ? [t('cleanup:resourceSync.reattachedNotice', { count: Number(out.reattached || 0) })] : []),
  ].join(t('cleanup:shared.sentenceGap'));
  return rest ? t('cleanup:resourceSync.applyWithLeftovers', { summary, rest }) : summary;
};
