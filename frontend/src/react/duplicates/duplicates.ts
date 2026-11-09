/* Duplicates' data contract and reductions.
 *
 * The criterion is "same code + similar duration + matching volume marker", not same-code-means-duplicate: compilations,
 * volumes and mixed-in ads share one code, and keeping the largest by code alone would delete content. The server has already
 * judged by this rule; the frontend only picks who survives per group. Bulk operations always go through `dispose` into trash,
 * which is reversible; permanent deletion still only happens from trash, one at a time.
 *
 * The data management page's duplicates card reads the same truth's `total`/`files`/`reclaimable`, so it subscribes to the
 * `DUPLICATES_KEY` below instead of sending another `?limit=1`: the server must scan the whole table to group for either
 * limit, and the saved return bytes buy the risk of two readouts disagreeing. */
import { apiGet, apiSend } from '../../api';
import { prefetchMediaSources } from '../media-sources';
import { queryClient } from '../query';
import { t } from '../../i18n';

/** 120 groups are enough to fill this page; anything more is pushed behind by the 'reclaimable' sort. */
export const DUPLICATES_URL = '/api/duplicates?limit=120';
/** The whole page and the data management page's card share this one key. */
export const DUPLICATES_KEY = ['duplicates'] as const;
/** Batch re-verdicts. 200 per call at most; larger sets go out in batches. */
export const BATCH_URL = '/api/batch';
export const BATCH_LIMIT = 200;

/** A file in `/api/duplicates`. Fields align with `web_batch.q_duplicates`. */
export interface DuplicateFile {
  id: number;
  name: string;
  path: string | null;
  location: string;
  drive: string;
  size: number | null;
  duration: number | null;
  is_largest: boolean;
  is_longest: boolean;
}

export interface DuplicateGroup {
  code: string;
  files: DuplicateFile[];
  count: number;
  /** Confirmed byte identity only when every file has a sha1 and they all match exactly. */
  identical: boolean;
  /** `same_code_short_copy` is a copy under the same code that is clearly much shorter. */
  evidence?: string;
  drives: string[];
  cross_drive: boolean;
  reclaimable: number;
}

export interface DuplicatesData {
  total: number;
  files: number;
  reclaimable: number;
  groups: DuplicateGroup[];
  has_more?: boolean;
  /** 标过「都保留」、组员没变的组数，不计入上面各项。 */
  kept?: number;
}

/** 整组标记都保留，或撤销这个标记。服务端按组员 id 集合记，组员变了这组会自己回来。 */
export const keepGroup = (ids: readonly number[], keep: boolean) =>
  apiSend(BATCH_URL, { ids, operation: keep ? 'keep-duplicates' : 'reconsider-duplicates' });

export const fetchDuplicates = (signal?: AbortSignal) =>
  apiGet<DuplicatesData>(DUPLICATES_URL, signal);

/* What counts as a word boundary in a name: spaces, hyphens, underscores, dots, brackets and path separators. */
const NAME_BREAK = /[\s\-_.()[\]【】/\\]/;

/** The common prefix of a set of copies, backed off to the last word boundary: copies of the same video usually differ only mid-name (resolution,
 *  mirror site, index), and truncating the full name mid-string cuts away the only difference. Empty when the common part is under 8 characters or there is a single copy. */
export function sharedNamePrefix(names: readonly string[]): string {
  if (names.length < 2) return '';
  let end = 0;
  const first = names[0]!;
  while (end < first.length && names.every((name) => name[end] === first[end])) end += 1;
  // When the shared run extends to the end of one of the names, that whole name is the shared part; back off one segment to leave something displayable.
  if (names.some((name) => name.length <= end)) end = Math.max(0, end - 1);
  let cut = end;
  while (cut > 0 && !NAME_BREAK.test(first[cut - 1]!)) cut -= 1;
  return cut >= 8 ? first.slice(0, cut) : '';
}

/** The name shown within the group: strip the prefix shared across the group and replace it with '...'; the group header already carries the code. */
export const distinctName = (name: string, prefix: string) =>
  prefix && name.startsWith(prefix) && name.length > prefix.length ? `…${name.slice(prefix.length)}` : name;

/** 首屏分组就绪后显示；来源独立读取，供「留 115」等可选规则使用。不给 `staleTime`，
 *  `/duplicates` 是 `refresh:'reopen'`，进来就重取。 */
export async function prefetchDuplicates(signal: AbortSignal): Promise<void> {
  void prefetchMediaSources(signal).catch(() => {});
  await queryClient.fetchQuery({ queryKey: DUPLICATES_KEY, queryFn: () => fetchDuplicates(signal) });
}

/** Which one each group keeps. `all` keeps nothing, only useful when the whole group is ads. The rest are cloud drive codes. */
export type KeepRule = 'largest' | 'longest' | 'all' | (string & {});

/** The "keep per group..." half sentence in the confirmation popover. */
export const KEEP_LABELS: Record<string, string> = {
  largest: t('cleanup:duplicates.keepRuleLargest'), longest: t('cleanup:duplicates.keepRuleLongest'),
  '115': t('cleanup:duplicates.keepRule115'), pikpak: t('cleanup:duplicates.keepRulePikpak'), all: t('cleanup:duplicates.keepRuleNone'),
};

/** The cloud drive sources that actually appear among this batch of files. */
export const cloudPreferenceLocations = (
  files: readonly { location: string }[], configured: readonly string[],
) => configured.filter((location) => files.some((file) => file.location === location));

/** "Keep 115" only appears when this group has both 115 and files elsewhere: with the whole group on one cloud drive, keeping it and keeping the largest
 *  give the same result, and an extra button is just one more option to read. */
export const mixedCloudPreferences = (
  files: readonly { location: string }[], configured: readonly string[],
) => cloudPreferenceLocations(files, configured)
  .filter((location) => files.some((file) => file.location !== location));

/** Which 'prefer all' buttons the batch bar offers: at least one group must be worth picking this way. */
export const bulkCloudPreferences = (groups: readonly DuplicateGroup[], configured: readonly string[]) =>
  configured.filter((location) => groups.some((group) => mixedCloudPreferences(group.files, [location]).length));

/** Keep one per group, the rest to trash; return the ids to reclaim.
 *
 *  For a named cloud drive, first pick the largest within that source, and if it has none fall back to the group's largest: the criteria are written on the popover
 *  ("115 (otherwise keep the largest)"), and another wording would not match what the user just read. */
export function duplicateVictims(groups: readonly DuplicateGroup[], keep: KeepRule): number[] {
  const ids: number[] = [];
  for (const group of groups) {
    if (keep === 'all') {
      for (const file of group.files) ids.push(file.id);
      continue;
    }
    let keeper: DuplicateFile | undefined;
    if (keep === 'largest' || keep === 'longest') {
      const flag = keep === 'longest' ? 'is_longest' : 'is_largest';
      keeper = group.files.find((file) => file[flag]) ?? group.files[0];
    } else {
      const preferred = group.files.filter((file) => file.location === keep);
      const pool = preferred.length ? preferred : group.files;
      keeper = pool.reduce((best, file) => ((file.size || 0) > (best.size || 0) ? file : best), pool[0]!);
    }
    for (const file of group.files) if (file.id !== keeper?.id) ids.push(file.id);
  }
  return ids;
}

/** Total bytes across this batch of reclaimed files. The confirm popover has to name this number. */
export function victimBytes(groups: readonly DuplicateGroup[], ids: readonly number[]): number {
  const victims = new Set(ids);
  return groups.reduce((total, group) => total + group.files.reduce(
    (sum, file) => sum + (victims.has(file.id) ? file.size || 0 : 0), 0), 0);
}

/** Batch re-judgment. At most 200 per pass, sent serially in batches: firing them concurrently just makes the server queue them itself. */
export async function batchOperate(ids: readonly number[], operation: 'dispose' | 'restore'): Promise<void> {
  for (let offset = 0; offset < ids.length; offset += BATCH_LIMIT) {
    await apiSend(BATCH_URL, { ids: ids.slice(offset, offset + BATCH_LIMIT), operation,
      ...(operation === 'dispose' ? { disposal_reason: 'duplicate' } : {}) });
  }
}

/** The line used by both the header description and the summary block. */
export const duplicatesLede = (data: DuplicatesData, formatSize: (bytes: number) => string) =>
  t('cleanup:duplicates.lede', { count: data.total, files: data.files, size: formatSize(data.reclaimable) });
