/* The five server-side datasets of UI preferences and Peach configuration, one Query key each.
 *
 * - `['settings']`: the items that follow the database and are the same for every client (`/api/settings`,
 *   `src/peach/web_settings.py`). The panel refetches on every open and hands the result to the shell for reconciliation
 *   (`host.syncRemote`): the truth for UI preferences is still the shell's `appSettings`; this key is only the database's
 *   snapshot. Writes also go through this endpoint, and the returned whole payload is written back into this key.
 * - `['follow-schedule']`: the tier and last-run state of automatic follow updates on this machine.
 * - `['feed-schedule']`: the tier and last-run state of scheduled feed pulls, same shape as above, read-only.
 * - `['thumbnail-jobs']`: the tier and state of video thumbnail collection. The tier follows the machine and is not stored in
 *   the browser.
 * - `['media-processing']`: this machine's preview generation switch plus the codecs for frame extraction and transcoding.
 *   The configuration page's "Video preview" and "Video playback" cards read and write the same one.
 *
 * The panel stays resident and unmounted never; it refetches settings on every open; Peach configuration refetches its
 * datasets on mount. */
import type { InterfaceLanguageChoice } from '../../i18n';
import { useMutation, type QueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '../../api';
import { queryClient } from '../query';
import type { NavigationOrders } from '../../navigation-order';

export const SETTINGS_URL = '/api/settings';
export const FOLLOW_SCHEDULE_URL = '/api/follow/schedule';
export const FEED_SCHEDULE_URL = '/api/feeds/schedule';
export const THUMBNAIL_JOBS_URL = '/api/thumbnail-jobs';

export const SETTINGS_KEY = ['settings'] as const;
export const FOLLOW_SCHEDULE_KEY = ['follow-schedule'] as const;
export const FEED_SCHEDULE_KEY = ['feed-schedule'] as const;
export const THUMBNAIL_JOBS_KEY = ['thumbnail-jobs'] as const;
export const MEDIA_PROCESSING_URL = '/api/media-processing';
export const MEDIA_PROCESSING_KEY = ['media-processing'] as const;

/** The full `/api/media-processing` payload; a write sends only the changed entry and the response is still the full payload. */
export interface MediaProcessingPolicy {
  metadata_only: boolean;
  preview_acceleration?: 'auto' | 'software';
  playback_acceleration?: 'auto' | 'software';
}
export const fetchMediaProcessing = (signal?: AbortSignal) =>
  apiGet<MediaProcessingPolicy>(MEDIA_PROCESSING_URL, signal);

/** The whole payload `q_settings` returns; a write sends only the changed keys, and what comes back is still the whole. */
export interface SyncedSettings {
  taskSpeedMode?: 'low' | 'standard' | 'high';
  performerNameLanguage?: 'zh-CN' | 'ja';
  interfaceLanguage?: InterfaceLanguageChoice;
  systemLanguage?: string | null;
  sidebarOrder?: string[];
  manageOrder?: string[];
  navigationOrders?: NavigationOrders;
  libraryOrder?: string[];
  followInitialDays?: number;
  postSetupTutorialDone?: boolean;
  feedHideGroupCompilations?: boolean;
  feedHideSoloCompilations?: boolean;
  feedHideExcerpts?: boolean;
  /** null when nothing is stored in the database yet: this device's local number sets the value for every client that visits. */
  searchHistoryLimit?: number | null;
  /** Code recognition rules, one regex each; edited in the settings page's "Media library and ingestion". */
  codePatterns?: string[];
}

export interface FollowScheduleStatus {
  available: boolean;
  enabled: boolean;
  interval_minutes: number;
  running?: boolean;
  last_error?: string | null;
  last_finished_at?: string | null;
  last_added?: number | null;
  next_run_at?: string | null;
  /** The number of consecutive failed rounds; from the second failure on, the next round is pushed back by a multiple. */
  consecutive_failures?: number;
}

export interface ThumbnailJobStatus {
  mode: string;
  status: 'idle' | 'running' | 'failed' | 'complete' | string;
  stopped?: string;
}

export const fetchSettings = (signal?: AbortSignal) => apiGet<SyncedSettings>(SETTINGS_URL, signal);
export const fetchFollowSchedule = (signal?: AbortSignal) =>
  apiGet<FollowScheduleStatus>(FOLLOW_SCHEDULE_URL, signal);
export const fetchFeedSchedule = (signal?: AbortSignal) =>
  apiGet<FollowScheduleStatus>(FEED_SCHEDULE_URL, signal);
export const fetchThumbnailJobs = (signal?: AbortSignal) =>
  apiGet<ThumbnailJobStatus>(THUMBNAIL_JOBS_URL, signal);

/** Refetch shared settings when the preferences dialog opens; collection status is read by the control in Peach's config. */
export function refreshPanelData(client: QueryClient = queryClient): Promise<SyncedSettings | null> {
  return client.fetchQuery({
    queryKey: SETTINGS_KEY, queryFn: ({ signal }) => fetchSettings(signal), staleTime: 0,
  }).catch(() => null);
}

/** Writes the items that follow the database. What comes back is the merged whole, written back to `['settings']`. */
export function useSaveSettings(scope?: string) {
  return useMutation({
    scope: scope ? { id: scope } : undefined,
    mutationFn: (patch: SyncedSettings) => apiSend<SyncedSettings>(SETTINGS_URL, patch),
    onSuccess: (saved) => queryClient.setQueryData(SETTINGS_KEY, saved),
  }, queryClient);
}

export function useSaveFollowSchedule() {
  return useMutation({
    mutationFn: (minutes: number) => apiSend<FollowScheduleStatus>(FOLLOW_SCHEDULE_URL,
      { enabled: minutes > 0, interval_minutes: minutes || 60 }),
    onSuccess: (status) => queryClient.setQueryData(FOLLOW_SCHEDULE_KEY, status),
  });
}

/** Each scheduler's "rerun now": the server pulls the next round up to now, and the returned status already reads as running. */
export const SCHEDULE_RUNS = {
  follow: { url: `${FOLLOW_SCHEDULE_URL}/run`, key: FOLLOW_SCHEDULE_KEY },
  feed: { url: `${FEED_SCHEDULE_URL}/run`, key: FEED_SCHEDULE_KEY },
} as const;

export function useRunSchedule(kind: keyof typeof SCHEDULE_RUNS) {
  const { url, key } = SCHEDULE_RUNS[kind];
  return useMutation({
    mutationFn: () => apiSend<FollowScheduleStatus>(url, {}),
    onSuccess: (status) => queryClient.setQueryData(key, status),
  });
}

/** While a run is active, refetch every three seconds and stop when it ends; the failure reason appears or clears with it. */
export const schedulePollInterval = (data: FollowScheduleStatus | undefined) => data?.running ? 3_000 : false;

export function useSaveThumbnailMode() {
  return useMutation({
    mutationFn: (mode: string) => apiSend<ThumbnailJobStatus>(THUMBNAIL_JOBS_URL, { mode }),
    onSuccess: (status) => queryClient.setQueryData(THUMBNAIL_JOBS_KEY, status),
  });
}
