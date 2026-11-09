/* Media repair's data layer: the task snapshot and optional libraries, both into the shared Query cache.
 *
 * One run takes tens of minutes to hours; the service records its own progress, and closing and returning to the page reconnects.
 * First screen fetches both together, and the card reads the cache directly on mount. */
import { apiGet } from '../../api';
import { queryClient } from '../query';
import { t } from '../../i18n';

export const MEDIA_REPAIR_URL = '/api/media-repair';
export const MEDIA_REPAIR_KEY = ['media-repair'] as const;
export const REPAIR_LIBRARIES_KEY = ['media-repair', 'libraries'] as const;

export interface MediaRepairState {
  status: string;
  library: string;
  stage: string;
  checked: number;
  total: number;
  found: number;
  repaired: number;
  failed: number;
  missing_tool: number;
  skipped: number;
  message: string;
  error?: string;
}

export interface RepairLibrary {
  id: string;
  name: string;
  /** Library icon: a source name (`115`, `pikpak`, `local`) or a sprite glyph name, the same copy as the sidebar's library switcher. */
  icon: string;
  metered: boolean;
}

export const IDLE_REPAIR: MediaRepairState = {
  status: 'idle', library: '', stage: '', checked: 0, total: 0, found: 0,
  repaired: 0, failed: 0, missing_tool: 0, skipped: 0, message: '',
};

export const fetchMediaRepair = (signal?: AbortSignal) => apiGet<MediaRepairState>(MEDIA_REPAIR_URL, signal);

export const fetchRepairLibraries = async (signal?: AbortSignal) =>
  (await apiGet<{ libraries?: RepairLibrary[] }>('/api/libraries', signal)).libraries || [];

export async function prefetchMediaRepair(signal: AbortSignal): Promise<void> {
  void queryClient.prefetchQuery({ queryKey: REPAIR_LIBRARIES_KEY, queryFn: () => fetchRepairLibraries(signal) });
  await queryClient.fetchQuery({ queryKey: MEDIA_REPAIR_KEY, queryFn: () => fetchMediaRepair(signal) });
}

const count = (value: number) => Number(value).toLocaleString();

/** One sentence saying what is happening now: scanning reports progress, repair reports progress plus the current title. */
export function statusLine(state: MediaRepairState): string {
  if (state.status === 'running') {
    // The server occasionally reports a checked count above the total; cap it at the total.
    const where = state.total ? `${count(Math.min(state.checked || 0, state.total))} / ${count(state.total)}` : t('cleanup:mediaRepair.preparing');
    return state.stage === 'Repair' && state.message
      ? t('cleanup:mediaRepair.repairingProgress', { progress: where, name: state.message })
      : `${state.stage || t('cleanup:mediaRepair.scanStage')} ${where}`;
  }
  if (state.status === 'complete' && (state.repaired || state.failed)) {
    return state.failed
      ? t('cleanup:mediaRepair.repairedWithFailures', { count: Number(state.repaired || 0), failed: count(state.failed) })
      : t('cleanup:mediaRepair.repairedDone', { count: Number(state.repaired || 0) });
  }
  return '';
}

export const missingToolText = (state: MediaRepairState) =>
  t('cleanup:mediaRepair.missingToolNotice', { count: Number(state.missing_tool || 0) });
