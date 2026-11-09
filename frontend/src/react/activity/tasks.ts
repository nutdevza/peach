/* Task center's data contract and folding: one `/api/tasks` request serves all three sections of the page.
 *
 * Three fetches would produce a self-contradictory screen where "the running section is new, the finished section is old", so there is only one
 * queryKey. First screen is written into the Query cache by `prefetchTasks`; components read exactly that on mount. */
import { apiGet, apiSend } from '../../api';
import { fmtSize } from '@peach/legacy/core';
import { requestErrorMessage } from '../../core/request-error';
import { queryClient } from '../query';
import type { ProcessingSpeed } from '../library-processing/library-processing';

export const TASKS_URL = '/api/tasks';
/** The whole page shares this one key: the three segments are three fields of the same response. */
export const TASKS_KEY = ['tasks'] as const;

export type TaskControlAction = 'pause' | 'resume' | 'cancel';
export type TaskControlState = 'running' | 'pausing' | 'paused' | 'cancelling';
export type TaskResourceState = 'ready' | 'sampling' | 'unavailable';
/** via only appears on not-yet-fetched network readings: cloud is read from a network-drive mount, and network speed can't be metered per task. */
export interface TaskResourceMetric { state: TaskResourceState; high: boolean; reason?: string; via?: 'cloud' }
export interface TaskPercentMetric extends TaskResourceMetric { percent: number | null }
export interface TaskResourcesPayload {
  cpu: TaskPercentMetric;
  gpu: TaskPercentMetric;
  network: TaskResourceMetric & { bytes_per_second: number | null };
  sampled_at: string;
}

export interface TaskRunPayload {
  id: number;
  task_key: string;
  task_label: string;
  trigger: string;
  status: string;
  host: string;
  started_at: string | null;
  finished_at: string | null;
  elapsed_seconds: number | null;
  progress_current: number | null;
  progress_total: number | null;
  progress_label: string;
  result_summary: Record<string, unknown>;
  error: string;
  /** The parent task that dispatched this round; null when it is not a successor (ADR-0040). */
  parent_run_id: number | null;
  root_run_id: number | null;
  /** The full name of what this successor will do. Empty string when it is not a successor; the UI uses that to decide whether it hangs under the parent card. */
  followup_key: string;
  followup_depth: number;
  /** The server provides the current control state and available actions; the UI doesn't infer from the task type. */
  control?: { state: TaskControlState; actions: (TaskControlAction | 'set_speed')[]; speed_mode?: ProcessingSpeed };
  /** Only project attributable measured readings; a missing field means that snapshot provided no resource sampling. */
  resources?: TaskResourcesPayload;
}

export interface ActivityData {
  finished_total?: number;
  finished_page?: number;
  available: boolean;
  result_versions?: Record<string, string>;
  message?: string;
  running: TaskRunPayload[];
  skipped: TaskRunPayload[];
  finished: TaskRunPayload[];
  /** There are earlier ones beyond the "Recently completed" page. */
  finished_has_more?: boolean;
  /** Parent tasks that finished themselves while successors are queued or running, minus the ones on the `running` and `finished` page. */
  working_parents?: TaskRunPayload[];
  /** Parent task id → how many of its directly dispatched successors are in each state. The dispatched successors are only a part; progress and "still running or not" read from this. */
  followup_counts?: FollowupCounts;
  /** 逐部到来的入库通知：云下载整理完成、推送发现登记的新影片。`epoch` 换了表示服务重启过。 */
  ingest_notices?: { epoch: string; items: IngestNotice[] };
}

export interface IngestNotice { id: number; kind: 'download' | 'discovered'; asset_id: number; label: string; at: number }

export type FollowupCounts = Record<string, Record<string, number>>;

/** Successors from several rounds counted together: how many in total, how many finished, how many still queued or running. */
export function followupTally(counts: FollowupCounts | undefined, runs: TaskRunPayload[]) {
  let total = 0, active = 0, failed = 0, cancelled = 0;
  for (const run of runs) {
    for (const [status, count] of Object.entries(counts?.[String(run.id)] || {})) {
      total += count;
      if (status === 'pending' || status === 'running') active += count;
      if (status === 'failed' || status === 'interrupted') failed += count;
      if (status === 'cancelled') cancelled += count;
    }
  }
  return { total, active, failed, cancelled, settled: total - active };
}

/** 同一种任务连着派出的几轮合成一件事：自动修复每分钟派一批，一屏十几张「已完成」卡说的是同一件事。
 *  每组按最新那一轮排在前面，`runs[0]` 是最新那一轮。`split` 再按它的值分组，同一种任务值不同的分开。 */
export function foldByKind(rows: TaskRunPayload[], split: (run: TaskRunPayload) => string = () => ''): RunFold[] {
  const folds = new Map<string, RunFold>();
  for (const run of rows) {
    const key = `${run.task_key}\u0000${split(run)}`;
    const fold = folds.get(key);
    if (fold) fold.runs.push(run);
    else folds.set(key, { run, runs: [run] });
  }
  return [...folds.values()];
}

/** Every two seconds while something is running (the same number as the progress-write throttle), every ten seconds when everything is terminal. */
export const RUNNING_POLL_MS = 2000;
export const SETTLED_POLL_MS = 10000;
export const pollInterval = (data: ActivityData | undefined): number =>
  data?.running?.length ? RUNNING_POLL_MS : SETTLED_POLL_MS;

export const fetchTasks = (signal?: AbortSignal, page = 1, limit = 20) =>
  apiGet<ActivityData>(page === 1 && limit === 20 ? TASKS_URL : `${TASKS_URL}?page=${page}&limit=${limit}`, signal);

/** 每个页面常驻轮询的那一小份：结果版本、入库通知与有没有任务在排或在跑。完整任务列表只给任务中心。 */
export const RESULT_UPDATES_KEY = ['result-updates'] as const;
export type ResultUpdatesData = Pick<ActivityData, 'result_versions' | 'ingest_notices'> & { busy?: boolean };
export const fetchResultUpdates = (signal?: AbortSignal) =>
  apiGet<ResultUpdatesData>('/api/result-updates', signal);

export const controlTask = (id: number, action: TaskControlAction, signal?: AbortSignal) =>
  apiSend(`${TASKS_URL}/${id}/control`, { action }, 'POST', signal);

export const setTaskSpeed = (id: number, speed: ProcessingSpeed) =>
  apiSend(`${TASKS_URL}/${id}/control`, { action: 'set_speed', speed_mode: speed }, 'POST');

/** First screen: paint only after the fetch completes. On abort, `fetchQuery` throws `AbortError` back to the mounting party, which gives up on this attempt. */
export async function prefetchTasks(signal: AbortSignal): Promise<void> {
  await queryClient.fetchQuery({ queryKey: TASKS_KEY, queryFn: () => fetchTasks(signal) });
}

export const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual', scheduled: 'Scheduled', startup: 'Start', cli: 'Command line',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Queued', running: 'In progress', succeeded: 'Completed',
  failed: 'Failed', cancelled: 'Canceled', interrupted: 'Interrupted unexpectedly',
};

/** The status's display name. The status set in the table is closed; an unrecognized value can only mean the table changed first, so it is shown as-is. */
export const statusLabel = (status: string): string => STATUS_LABELS[status] || status;

/* The main summary uses the defined Chinese-language field; the raw status dictionary is preserved by technical details. */
const SUMMARY_LABELS: Record<string, string> = {
  checked: 'Checked', total: 'Total', scanned: 'Scanned', identified: 'Identified',
  candidates: 'Video details', covers: 'Cover', changed: 'Changed', operation: 'Actions',
  ok: 'Fetched', miss: 'Not fetched', kept: 'Keep', planned: 'Planned', done: 'Processed', added: 'New',
  written: 'Saved', removed: 'Removed', issue_count: 'Needs attention',
  followups_duplicate: 'The backfill task is already queued', followups_truncated: 'Backfill tasks exceed the count cap',
  followups_depth_exceeded: 'Backfill tasks exceed the depth cap', name: 'Name',
  matched: 'Matches', size: 'Size', source: 'Source', cover_network: 'Connecting to the cover image failed',
  probed: 'Media info read', previews: 'Preview image', paused_count: 'Waiting for the source to recover',
  auto_applied: 'Saved automatically', auto_rejected: 'Not adopted', performer_avatars: 'Performer avatars',
  performer_profile_failed: 'Performer detail scraping failed', performer_aliases: 'Performer aliases',
  performer_profile_conflicts: 'Performer details pending review', conflicts: 'Conflicts pending review',
  gone_count: 'Link expired', unclear_count: 'Failed to access link',
  source_failed: 'Source check failed', source_warning: 'Source recheck failed',
  resolve_failed: 'Lookup failed', sources_found: 'Sources found',
  warning_count: 'Worth noting', profiles_checked: 'Browser data read',
  missing: 'File missing', purge: 'Record deletable', vanish: 'Personal records must be kept',
  empty: 'Empty directory', unreadable: 'Could not read', cache_files: 'Cleanable cache files',
  cache_bytes: 'Cleanable cache size', bytes_reclaimed: 'Space freed',
  cache_removed: 'Cache files cleaned', cache_blocked_count: 'Cache cleanup failed', files_removed: 'Deleted files',
  purged: 'Record deleted', vanished: 'Marked as missing files', reattached: 'Record moved',
  blocked_count: 'Failed to delete record', dirs_removed: 'Deleted empty directories', dir_errors: 'Directory cleanup failed',
  marked: 'Marked dead', recovered: 'Accessible after recheck', entities: 'Details affected',
  found: 'Files needing repair found', repaired: 'Fixed', failed: 'Failed', missing_tool: 'Repair tool missing',
  moved: 'Files organized', restored: 'Restored', skipped: 'Skipped', made: 'Preview image generated',
  fetched: 'Profile fetched', updated: 'Updated', discovered: 'Videos discovered', without_code: 'Unrecognized code',
  incomplete: 'Details or cover unfetched',
  result: 'Results',
};

const PROBLEM_COUNTS = [
  'gone_count', 'unclear_count', 'source_failed', 'source_warning', 'resolve_failed',
  'warning_count', 'missing', 'unreadable', 'cache_blocked_count', 'blocked_count', 'dir_errors',
  'failed', 'missing_tool', 'issue_count', 'cover_network', 'performer_profile_failed',
  'performer_profile_conflicts', 'conflicts', 'paused_count', 'miss', 'incomplete',
];

/** This round was missing one capability, so the conclusion came from the older criteria it fell back to. A count of 0 still counts as a problem: what did not get done is not those few steps but the whole thing. */
const PROBLEM_FLAGS = ['face_match_unavailable'];

/** Finishing a check and finding problems in its results are two different things; problems must not be hidden by routine collapsing. */
export const hasResultProblems = (run: TaskRunPayload): boolean => run.result_summary?.ok === false
  || Boolean(run.result_summary?.error)
  || PROBLEM_FLAGS.some((key) => run.result_summary?.[key] === true)
  || PROBLEM_COUNTS.some((key) => Number(run.result_summary?.[key]) > 0);

export interface TaskIssue { source: number; label: string; provider: string; kind: string; error: string }

/** Issue details bind to this round's snapshot; current source state is viewed on the matching admin page. */
export function taskIssues(run: TaskRunPayload): TaskIssue[] {
  const issues = run.result_summary?.issues;
  return Array.isArray(issues) ? issues.filter((item): item is TaskIssue => !!item
    && typeof item === 'object' && typeof item.error === 'string' && typeof item.label === 'string') : [];
}

/** Processing entry points only make sense for tasks where only the latest round matters: the target page shows the latest round, and earlier failures were superseded by later results.
 *  The issue list and "Retry unfinished items" on the scan-and-collect card only recognize the latest round's failure set. */
const LATEST_ONLY = new Set(['library-processing']);

export function problemDestination(run: TaskRunPayload, latest = true): { href: string; label: string } | null {
  if (!hasResultProblems(run) && run.status !== 'failed') return null;
  if (LATEST_ONLY.has(run.task_key) && !latest) return null;
  const targets: Record<string, [string, string]> = {
    'link-check': ['/data-cleanup#link-manager', 'View problematic links'],
    'link-prune': ['/data-cleanup#link-manager', 'View problematic links'],
    // 'Needs attention' does not take this page's retryable items: the issue list has hundreds of entries, so review the list first and retry on that card.
    'library-processing': ['/data-cleanup#libraryProcessing', 'View unfinished items'],
    'follow-check': ['/subscriptions', 'View followed sources'],
    'feed-check': ['/subscriptions', 'View feed'],
    'follow-resolve': ['/subscriptions?tab=add', 'View source lookup'],
    'resource-scan': ['/data-cleanup#resource-sync', 'View resource sync'],
    'resource-apply': ['/data-cleanup#resource-sync', 'View resource sync'],
    'media-repair': ['/data-cleanup#mediaRepair', 'View media repair'],
    'taste-refresh': ['/taste', 'View taste data sources'],
    'follow-evidence-reclaim': ['/settings/maintenance/repairs', 'View repairs and migrations'],
  };
  const target = targets[run.task_key];
  return target ? { href: target[0], label: target[1] } : null;
}

/** When this round processes only one work, the summary carries its asset_id and filename, and the task card links to the work's detail based on this. */
export function taskSubject(run: TaskRunPayload): { href: string; label: string } | null {
  const id = run.result_summary?.asset_id;
  const name = run.result_summary?.name;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 && typeof name === 'string' && name
    ? { href: `/assets/${id}`, label: name } : null;
}

/** The id of each task type's latest round in `LATEST_ONLY`. Successors do not count: they hang under a parent task, not a round of this type. */
export function latestOfKind(rows: TaskRunPayload[]): Set<number> {
  const newest = new Map<string, number>();
  for (const row of rows) {
    if (LATEST_ONLY.has(row.task_key) && !row.followup_key
        && row.id > (newest.get(row.task_key) ?? 0)) newest.set(row.task_key, row.id);
  }
  return new Set(newest.values());
}

/** Groups a batch of tasks under their parent tasks by `parent_run_id`. Those without a parent stay outside. */
export function groupFollowups(rows: TaskRunPayload[]): Map<number, TaskRunPayload[]> {
  const grouped = new Map<number, TaskRunPayload[]>();
  for (const row of rows) {
    if (!row.followup_key || row.parent_run_id == null) continue;
    const siblings = grouped.get(row.parent_run_id);
    if (siblings) siblings.push(row);
    else grouped.set(row.parent_run_id, [row]);
  }
  return grouped;
}

/** Consecutive rounds collapse into one card: `runs[0]` is the latest round. */
export interface RunFold { run: TaskRunPayload; runs: TaskRunPayload[] }

/** "Recently completed" folds in time order: within a stretch of consecutive routine rounds, same-kind tasks merge into one card, placed at their
 *  latest round's position. Any non-routine round (manual, failed, with additions, or with successors) truncates the stretch;
 *  folding only collects "ran on schedule, nothing happened", and a round with events must stay individually visible. */
export function foldRoutine(rows: TaskRunPayload[],
                            routine: (run: TaskRunPayload) => boolean): RunFold[] {
  const folds: RunFold[] = [];
  let open = new Map<string, RunFold>();
  for (const run of rows) {
    if (!routine(run)) {
      open = new Map();
      folds.push({ run, runs: [run] });
      continue;
    }
    const fold = open.get(run.task_key);
    if (fold) fold.runs.push(run);
    else {
      const started = { run, runs: [run] };
      open.set(run.task_key, started);
      folds.push(started);
    }
  }
  return folds;
}

/** A round that ran on schedule and did nothing: timer-fired, successful, nothing added and no successors dispatched. */
export const isRoutine = (run: TaskRunPayload) => run.trigger === 'scheduled'
  && run.status === 'succeeded' && !run.error
  && !hasResultProblems(run)
  && !(Number(run.result_summary?.added) > 0) && !(Number(run.result_summary?.followups) > 0);

export const isActive = (run: TaskRunPayload) => run.status === 'pending' || run.status === 'running';

/** The line under the follow-up: which item it is working on (the label with the prefix that duplicates the task name stripped off), which item it is on, or what the result was.
 * The title is already the task name, so writing "New release metadata collection:" here again would read as the same sentence said twice. */
export function followupDetail(row: TaskRunPayload): string {
  const prefix = `${row.task_label}: `;
  const label = row.progress_label || '';
  const item = String(row.result_summary?.name || '')
    || (label.startsWith(prefix) ? label.slice(prefix.length) : label === row.task_label ? '' : label);
  const total = row.progress_total || 0;
  const { name: _name, ...result } = row.result_summary || {};
  const tail = readableErrorHeadline(row.error) || summaryText(result)
    || (isActive(row) && total > 0 ? `${progressText(row.progress_current, total)} items` : '');
  return [item, tail].filter(Boolean).join(' · ');
}

/** Seconds are spoken as "minutes and seconds". Batch runs of several hours must still read at a glance: at 48 hours or more, speak in days. */
export function elapsedText(seconds: number | null | undefined): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return '';
  const whole = Math.floor(seconds);
  if (whole < 60) return `${whole} sec`;
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) return `${minutes} min ${whole % 60} sec`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hr ${minutes % 60} min`;
  return `${Math.floor(hours / 24).toLocaleString()} days ${hours % 24} hours`;
}

/** Progress readout 'done / total': the server occasionally reports a done count above the total, so cap it at the total. */
export function progressText(current: number | null | undefined, total: number | null | undefined): string {
  const all = Math.max(0, Number(total) || 0);
  const done = Math.min(all, Math.max(0, Number(current) || 0));
  return `${done.toLocaleString()} / ${all.toLocaleString()}`;
}

/** The one line an error entry shows in a list. A Python traceback's first line is always "Traceback (most recent call
 *  last):", saying nothing, so take the last line's exception type and message; otherwise take the first non-empty line. */
export function errorHeadline(text: string | null | undefined): string {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return '';
  return /^Traceback \(most recent call last\)/.test(lines[0]!) ? lines[lines.length - 1]! : lines[0]!;
}

/** The exception type and raw stack are kept in details; the summary states the actual cause. */
export function readableErrorHeadline(text: string | null | undefined): string {
  const head = errorHeadline(text);
  const technical = head.match(/^(?:[\w.]*Error|Exception):\s*(.*)$/);
  if (!technical) return head;
  return requestErrorMessage(technical[1]);
}

const OUTCOME_LABELS: Record<string, string> = {
  partial: 'Processing ended, some items still need work', complete: 'Processing finished', interrupted: 'Processing interrupted',
  cancelled: 'Canceled',
  '没有新写法': 'No new aliases found', '已装上': 'Details image saved',
  '已装着认得准的小图': 'Small images that passed identity checks were kept',
  '档案已不存在': 'The detail record no longer exists', '资料未过期': 'Existing details are still within their validity',
  '图太小': 'The image resolution is too low', '官网未取得': 'Label website info not available',
  '两站都没有作品一览': 'Neither source provides a video list',
  '哪一站都没对上她': 'No profile page matches this person',
  '两站都没对上她': 'Neither source found a profile matching this person',
  '三站都没对上她': 'None of the three sources found a profile matching this person',
  '已有身份': 'Creator categories already exist', '已变': 'The details were changed by another operation; this save did not go through',
};
const SOURCE_NAMES: Record<string, string> = { avwikidb: 'AVWikiDB', javdb: 'JavDB', 'minnano-av': 'みんなのAV' };
const OPERATION_LABELS: Record<string, string> = {
  like: 'Mark favorite', seen: 'Mark watched', later: 'Add to Watch later', dispose: 'Move to trash',
  restore: 'Restore', delete: 'Delete permanently', 'empty-trash': 'Empty trash',
  'dismiss-junk': 'Confirm not junk', 'reconsider-junk': 'Reclassify as junk', region: 'Decide origin',
};
const outcomeText = (text: string): string => OUTCOME_LABELS[text] || text
  .replace(/(avwikidb|javdb|minnano-av) (绑定|写入)/gi, (_, site: string, action: string) =>
    action === 'Binding' ? `Linked to the ${SOURCE_NAMES[site.toLowerCase()]} profile page`
      : `Saved the profile from ${SOURCE_NAMES[site.toLowerCase()]}`);

/** Timestamps are spoken as a local "month-day hour:minute". The database stores UTC; the UI always reads them in the machine's time zone. */
export function momentText(stamp: string | null | undefined): string {
  if (!stamp) return '';
  const moment = new Date(stamp);
  if (Number.isNaN(moment.getTime())) return '';
  return moment.toLocaleString(undefined,
    { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/* Keys left out of the summary: "who blocked it" is already in the error sentence; the rest is bookkeeping from the domain status dictionary, such as state,
   start and end timestamps, request ids and task ids, all already covered by the card title, badge and time row; laid out raw they are just a string of
   English keys and epoch seconds. */
const SUMMARY_HIDDEN = new Set([
  'blocked_by', 'status', 'run_id', 'request_id', 'started_at', 'completed_at', 'finished_at',
]);

/** Task results show only the user-facing fields. */
export function summaryItems(summary: Record<string, unknown>): string[] {
  const items = fieldItems(summary);
  // "Problems found" must be able to say what the problem is. When the cause is already written into the conclusion ("face model unavailable: ...", "portrait gate not effective ..."), do not say it a second time.
  if (summary?.face_match_unavailable === true && !items.some((line) => /不可用|未生效/.test(line))) {
    items.push('The face model is unavailable, so no face verification ran');
  }
  return items;
}

function fieldItems(summary: Record<string, unknown>): string[] {
  return Object.entries(summary || {})
    .filter(([key, value]) => !SUMMARY_HIDDEN.has(key)
      && (key in SUMMARY_LABELS || key === 'outcome' || key === 'followups' || key === 'error')
      && (typeof value === 'number' || typeof value === 'string')
      && String(value) !== '' && (value !== 0 || key === 'checked' || key === 'total'))
    .map(([key, value]) => {
      if (key === 'followups') return `${Number(value).toLocaleString()} backfill tasks scheduled`;
      if (key === 'error') return readableErrorHeadline(String(value));
      if (key === 'outcome' || key === 'result') return outcomeText(String(value));
      if (key === 'cache_bytes' || key === 'bytes_reclaimed') return `${SUMMARY_LABELS[key]} ${fmtSize(Number(value))}`;
      if (key === 'operation') return `Action: ${OPERATION_LABELS[String(value)] || 'Batch operation'}`;
      return `${SUMMARY_LABELS[key]} ${typeof value === 'number' ? value.toLocaleString() : value}`;
    });
}

export const summaryText = (summary: Record<string, unknown>): string => summaryItems(summary).join(' · ');
