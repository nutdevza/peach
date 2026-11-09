/* Scan and collect's data contract, polling cadence and pure reductions.
 *
 * The data management page's card, the resident job surface and the missing-preview notice read the same `queryKey` and use
 * the same job snapshot.
 * Polling is likewise composed into one copy by Query, with progress, failure and completion states provided uniformly by the
 * server.
 * The endpoint is declared once in `frontend/src`, here only (`tests/test_frontend_build.py` watches this). */
import { apiGet } from '../../api';
import { elapsedText, progressText } from '../activity/tasks';
import { queryClient } from '../query';

export const LIBRARY_PROCESSING_URL = '/api/library-processing';

/** The card and the persistent task panel share this one key. */
export const LIBRARY_PROCESSING_KEY = ['library-processing'] as const;

/** One issue recorded during processing. When `asset_id` is empty it refers to the media source itself. */
export interface LibraryProcessingIssue {
  asset_id: number | null;
  title?: string;
  path?: string;
  message: string;
  /** `paused` means source throttling has not reached this item yet, and it will appear once the source frees up; `error` is something that went wrong with the item itself. */
  severity?: 'info' | 'error' | 'paused';
}

/** A snapshot of one scan-and-collect run. Fields follow `q_library_processing` (`src/peach/web_library_processing.py`). */
export interface LibraryProcessingData {
  library_id?: string | null;
  library_name?: string;
  metadata_only?: boolean;
  /** `idle` | `running` | `pausing` | `paused` | `stopping` | `cancelled` | `complete` | `failed`。 */
  status: string;
  /** Every stage of this round finished processing but left problems, or execution was interrupted. */
  outcome?: 'complete' | 'partial' | 'interrupted' | 'cancelled';
  archived?: boolean;
  new_asset_count?: number;
  /** The initiation method the task center records for this in-progress round: `manual` | `scheduled` | `startup` | `cli`. */
  trigger?: string;
  speed_mode?: ProcessingSpeed;
  eta_seconds_min?: number | null;
  eta_seconds_max?: number | null;
  eta_kind?: 'historical' | 'measured' | 'estimating';
  eta_scope?: string;
  eta_initial?: boolean;
  job_id?: string;
  stage?: string;
  requested_stage?: string;
  steps?: { id: string; label: string; status: 'pending' | 'current' | 'complete' }[];
  checked?: number;
  total?: number;
  scanned?: number;
  scanned_bytes?: number;
  identified?: number;
  candidates?: number;
  auto_applied?: number;
  covers?: number;
  previews?: number;
  /* Four readouts from the post-ingest performer details step: aliases, avatars, conflicts returned to a human, and avatars that could not be fetched. */
  performer_aliases?: number;
  performer_avatars?: number;
  performer_profile_conflicts?: number;
  performer_profile_failed?: number;
  error?: string;
  issue_count?: number;
  /** The part of `issue_count` stuck on source rate limits; one more run after the source opens up resolves them. */
  paused_count?: number;
  issue_preview?: LibraryProcessingIssue[];
  issues_log?: string;
  issues_truncated?: boolean;
  retryable_asset_ids?: number[];
  notes?: Record<string, number>;
  current_asset_id?: number | null;
  current_asset_name?: string;
  current_action?: string;
  current_started_at?: number;
  /** The external source the current item is waiting on; `network` is the route its request took this time. */
  current_source?: { key: string; label: string; network?: string };
  skip_requested?: boolean;
  last_progress_at?: number;
  stalled?: boolean;
  waited_seconds?: number;
  completed_at?: number;
  traffic?: ProcessingTraffic;
}

export interface TrafficWorkload {
  video_files: number; jav_files: number; jav_titles: number;
  pending_jav_titles?: number; metadata_average_bytes?: number;
}
export interface TrafficSource {
  connection?: 'direct' | 'proxy' | 'system' | 'unknown';
  workload?: TrafficWorkload;
  estimated_bytes?: number;
  key: string; label: string; root: string; location: string; metered: boolean;
  used_bytes: number; estimated_min_bytes: number; estimated_max_bytes: number;
  unobserved: string[];
}
export interface ProcessingTraffic {
  disk?: {
    estimated_bytes: number; temporary_bytes: number; can_fit: boolean | null; cache_unknown: boolean;
    volumes: { path: string; labels: string[]; free_bytes: number | null; estimated_bytes: number;
      temporary_bytes: number; reserve_bytes: number | null; required_bytes: number | null;
      shortfall_bytes: number | null; can_fit: boolean | null }[];
  };
  unknown_route_estimated_bytes?: number;
  workload?: TrafficWorkload;
  inventory?: { complete: boolean; errors: number; token?: string };
  estimated_bytes?: number; metered_estimated_bytes?: number;
  used_bytes: number; estimated_min_bytes: number; estimated_max_bytes: number;
  metered_used_bytes: number; metered_estimated_min_bytes: number; metered_estimated_max_bytes: number;
  sources: TrafficSource[]; partial: boolean; unknown_files: boolean;
}

export const fetchProcessingEstimate = (command: LibraryProcessingCommand, signal?: AbortSignal, inventory?: string) => {
  const params = new URLSearchParams({ estimate: '1', stage: command.stage || 'all' });
  if (command.asset_ids) params.set('asset_ids', JSON.stringify(command.asset_ids));
  if (command.scope) params.set('scope', command.scope);
  if (command.library_id) params.set('library_id', command.library_id);
  if (command.incremental) params.set('incremental', '1');
  if (inventory) params.set('inventory', inventory);
  return apiGet<{ traffic: ProcessingTraffic }>(`${LIBRARY_PROCESSING_URL}?${params}`, signal);
};

/** A write request body: specify a processing stage and videos, or retry failed items by task number. */
export type ProcessingSpeed = 'low' | 'standard' | 'high';
export interface LibraryProcessingCommand {
  library_id?: string;
  incremental?: boolean;
  scope?: 'new';
  stage?: 'scan' | 'collect' | 'previews' | 'metadata';
  asset_ids?: number[];
  job_id?: string;
  retry?: number[];
  speed_mode?: ProcessingSpeed;
}
export type ProcessingControlCommand =
  | { action: 'pause' | 'resume' | 'cancel' | 'archive' | 'unarchive'; job_id: string }
  | { action: 'set_speed'; speed_mode: ProcessingSpeed; job_id?: string }
  | { action: 'skip_current'; job_id: string; asset_id: number };

/** When one film has queried external sources longer than this, surface skip and switch to proxy. */
export const SLOW_ITEM_SECONDS = 120;
const SLOW_ACTIONS: Record<string, string> = { fetching_cover: 'Cover', querying_metadata: 'Profile' };

export interface SlowItem { what: string; source?: LibraryProcessingData['current_source'] }

/** The skip entry belongs to external profile and cover collection; scanning and preview generation have their own task controls. */
export function slowItem(state?: LibraryProcessingData): SlowItem | null {
  if (state?.status !== 'running' || state.current_asset_id == null) return null;
  const what = SLOW_ACTIONS[state.current_action || ''];
  if (!what || (state.waited_seconds || 0) < SLOW_ITEM_SECONDS) return null;
  return { what, source: state.current_source };
}

export function slowItemText({ what, source }: SlowItem): string {
  const who = `${source?.label ? `${source.label} ` : 'The external source'}is very slow to return ${what}`;
  return `${who} You can skip this one for now and retry after the task ends.`;
}

/** A paused task still holds the same processing scope; it can be resumed and its state keeps being readable. */
export const processingActive = (state?: LibraryProcessingData) =>
  !!state && ['running', 'pausing', 'paused', 'stopping'].includes(state.status);

export const processingHasPartialResult = (state?: LibraryProcessingData) =>
  state?.status === 'failed' && state.outcome === 'partial';

export const PARTIAL_RESULT_TEXT = 'Intaked videos browse under all content, and unfinished items can retry individually.';
export const ALL_CONTENT_URL = '/?loc=&thumb=0';

/** Times round to the minute; both ends of the range always use the same unit. */
export function remainingTime(state: LibraryProcessingData): string {
  if (!processingActive(state)) return '';
  if (state.status === 'stopping') return 'Cancelling, waiting for the current step to exit; results already obtained are kept';
  if (state.status === 'paused') return 'Paused; estimates update after resuming';
  if (state.status === 'pausing') return 'Pausing; it pauses once the current step ends';
  if (state.stalled) return 'Waiting on the current file\'s response; time remaining pending update';
  const low = state.eta_seconds_min, high = state.eta_seconds_max;
  if (low == null || high == null || !Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low)
    return 'Estimating remaining time…';
  if (high < 60) return 'Less than a minute remaining';
  const unit = high >= 86400 ? 86400 : high >= 3600 ? 3600 : 60;
  const label = unit === 86400 ? 'days' : unit === 3600 ? 'hours' : 'min';
  const precision = unit === 60 ? 1 : 10;
  const start = Math.max(1 / precision, Math.floor(low / unit * precision) / precision);
  const end = Math.max(start, Math.ceil(high / unit * precision) / precision);
  const span = start === end ? `${end}` : `${start}–${end}`;
  const rough = state.eta_initial || state.eta_kind !== 'measured' ? ' (rough)' : '';
  return `About ${span} ${label} remaining${rough}${state.eta_scope ? ` · ${state.eta_scope}` : ''}`;
}

export const fetchLibraryProcessing = (signal?: AbortSignal) =>
  apiGet<LibraryProcessingData>(LIBRARY_PROCESSING_URL, signal);

/** First screen. On abort, `fetchQuery` throws `AbortError` back to the caller, which gives up on this attempt. */
export async function prefetchLibraryProcessing(signal: AbortSignal): Promise<void> {
  await queryClient.fetchQuery({
    queryKey: LIBRARY_PROCESSING_KEY,
    queryFn: () => fetchLibraryProcessing(signal),
  });
}

/** While running, poll every two seconds, the same cadence as the other background tasks. */
export const RUNNING_POLL_MS = 2000;
/** Keep asking even when idle: the task starts on its own in the background, and both readers must recognize 'it is running now'. */
export const IDLE_POLL_MS = 10_000;

/** The sentence left on the page when a read fails. The previous data stays, and the next poll picks up on its own. */
export const DISCONNECTED_TEXT = 'Connection dropped; re-reading processing progress';

/** The way a task is triggered, phrased for use in a sentence; TRIGGER_LABELS are short labels for the task center list, which don't read well in a sentence. */
const TRIGGER_PHRASES: Record<string, string> = {
  manual: 'Start from the web page', scheduled: 'Start on a schedule', startup: 'Start automatically on service startup', cli: 'Started from the command line or tray',
};

/** Saving library settings restarts Peach: what happens to the running round depends on which process it runs in and whether it's paused — explained separately.
 * The command-line and tray launches are independent `peach process` instances; reload only stops the service; the service's tasks resume from boot and keep running,
 * while the round the user paused is skipped on resume. The run with "Scan after save" checked must wait for the full-library processing lock, so it goes last. */
export function restartEffectText(state: LibraryProcessingData, scanAfterSave: boolean): string {
  const effect = state.trigger === 'cli' ? 'This task is started from the command line or tray, runs in a separate process, and is unaffected by restart.'
    : state.status === 'paused' ? 'A paused task stays paused; after a restart, click continue to resume.'
    : 'Running tasks are interrupted by a restart and resume from the interruption afterward.';
  return `After saving, Peach will restart. ${effect}${scanAfterSave ? 'The checked "Scan after save and fill in metadata" will queue after the current task.' : ''}`;
}

/** The receipt when sync is clicked while a task is running, stating how this round was started. */
export function busyText(state: LibraryProcessingData): string {
  const origin = TRIGGER_PHRASES[state.trigger || ''];
  return `The current scan and collection task${origin ? `(${origin})` : ''} hasn't finished yet; wait for it to complete or be cancelled before starting a new sync`;
}

export function pollInterval(
  data: LibraryProcessingData | undefined, watching: boolean,
): number | false {
  if (processingActive(data)) return RUNNING_POLL_MS;
  return watching ? IDLE_POLL_MS : false;
}

const ACTION_LABELS: Record<string, string> = {
  scanning_files: 'Scan files',
  reading_local: 'Check companion files',
  reading_local_cover: 'Read companion images',
  querying_metadata: 'Query external details',
  fetching_cover: 'Scrape missing covers',
  skipped: 'Skipped',
  generating_preview: 'Generate video previews',
  writing_candidates: 'Save profiles pending confirmation',
};

/* Sources reporting "none" show one count by type and stay out of the issue list: many standalone resources and creator works in the library
   are invisible to any catalog site, so they are not pending work. Keys share a source with `library_processing.MISS_MESSAGES`. */
const NOTE_LABELS: Record<string, string> = {
  querying_metadata: 'No details',
  fetching_cover: 'No cover',
};

export function notesLine(notes: Record<string, number>): string {
  const parts = Object.entries(notes)
    .filter(([key, count]) => NOTE_LABELS[key] && count > 0)
    .map(([key, count]) => `${NOTE_LABELS[key]} ${count.toLocaleString()} videos`);
  return parts.length ? `External sources ${parts.join(', ')} will not be asked again for 7 days.` : '';
}

/** What it is doing right now: which file, which step, how long it has waited. */
export function currentLine(state: LibraryProcessingData): string {
  if (state.status === 'paused') return 'Paused';
  if (state.status === 'pausing') return 'Pausing';
  const action = ACTION_LABELS[state.current_action || ''] || state.stage || 'Processing';
  const waited = state.waited_seconds ? ` · waited ${elapsedText(state.waited_seconds)}` : '';
  return state.current_asset_name
    ? `Current: ${state.current_asset_name} · ${action}${waited}`
    : action + waited;
}

/** With a known total, show the actual completed count; while scanning a directory, show the count of files discovered so far. */
export function processingLine(state: LibraryProcessingData): string {
  const count = state.total ? `${progressText(state.checked, state.total)} items`
    : state.current_action === 'scanning_files' || state.stage === 'Scan files'
      ? `${(state.scanned || 0).toLocaleString()} files discovered` : '';
  return currentLine(state) + (count ? ` · ${count}` : '');
}

/** The collapsed problem list: one conclusion line + itemized details + the address of the full log. `null` when there are no problems. */
export interface IssueDetails {
  label: string;
  items: { key: string; label: string; href: string; note: string; hint: string }[];
  /** The full record's local path, one verbatim string: the prefix text and the open button belong to the page, which is the only place that knows where it sits. */
  log: string;
}

export function issueDetails(state: LibraryProcessingData): IssueDetails | null {
  const issues = state.issue_preview || [];
  if (!issues.length) return null;
  return {
    label: state.issues_truncated
      ? `Issue list: ${state.issue_count || 0} items; expand to view the first ${issues.length}`
      : `Issue list: ${state.issue_count || 0} items`,
    items: issues.map((issue, at) => ({
      key: `${issue.asset_id ?? 'source'}-${at}`,
      label: issue.title || (issue.asset_id ? `Video ${issue.asset_id}` : 'Media sources'),
      href: issue.asset_id ? `/assets/${issue.asset_id}` : '',
      note: issue.message,
      hint: issue.path || '',
    })),
    log: state.issues_log || '',
  };
}

/* Completion is announced once via a notification. The resident tasks surface and the data management card watch the same task; whoever sees the end first reports,
   and the other recognizes it by task number and stays quiet. The run after onboarding's first folder add often finishes before the jump to the catalog page
   (one file a second), so the tasks surface never saw "running"; a just-finished task is reported on first read too. */
const ANNOUNCED_KEY = 'peach.library-processing.announced';
const FRESH_COMPLETION_SECONDS = 120;

export function freshProcessingResult(state: LibraryProcessingData): boolean {
  const age = state.completed_at == null ? Infinity : Date.now() / 1000 - state.completed_at;
  return !!state.job_id && age >= 0 && age < FRESH_COMPLETION_SECONDS;
}

export function announceCompletion(
  state: LibraryProcessingData, toast: (message: string) => void, witnessed: boolean,
): void {
  if (state.status !== 'complete') return;
  if (!witnessed && !freshProcessingResult(state)) return;
  try {
    if (state.job_id && localStorage.getItem(ANNOUNCED_KEY) === state.job_id) return;
    if (state.job_id) localStorage.setItem(ANNOUNCED_KEY, state.job_id);
  } catch { /* When storage is unavailable, still show the toast, at most one repeat */ }
  if (state.requested_stage === 'previews') {
    toast(`Video previews generated: ${state.previews || 0}`);
    return;
  }
  toast(`Scan and profile collection finished: identified ${state.identified || 0} codes,`
    + `Fetched ${state.candidates || 0} sets of video details, auto-saved ${state.auto_applied || 0}`
    + (state.previews ? `, generating ${state.previews} video previews` : ''));
}
