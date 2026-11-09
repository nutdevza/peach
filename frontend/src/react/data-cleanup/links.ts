/* Link management's data contract.
 *
 * External links live on other people's servers and rot without notice: measured, 152 of 719 did not open, and on the profile
 * page they look identical to good links until clicked. So the check must be rerunnable at any time.
 *
 * Three truths, three keys, each on its own cadence:
 * - `['links']` is the current state of links in the library, a pure database read that loads with the page and never polls.
 * - `['links','check']` is the state of the networked check run, asked every two seconds while `running`.
 * - `['links','prune']` is the state of the deletion run, likewise on the `running` switch.
 * Merged into one key, every two-second poll round would re-render the read-only stats block above. */
import { apiGet, apiSend } from '../../api';
import { t } from '../../i18n';

export const LINKS_URL = '/api/links';
export const LINK_CHECK_URL = '/api/links/check';
export const LINK_PRUNE_URL = '/api/links/prune';

export const LINKS_KEY = ['links'] as const;
export const LINK_CHECK_KEY = ['links', 'check'] as const;
export const LINK_PRUNE_KEY = ['links', 'prune'] as const;

/** Link types and their on-screen names.
 *
 *  The interpunct in `Official site · Agency` collides with the "by type" row's separator dots, reading as
 *  "Social 373 · Official site · Agency 224"; impossible to tell which number belongs to which type, hence the slash. */
export const LINK_KINDS: Record<string, string> = {
  official: t('cleanup:links.kindOfficial'), social: t('cleanup:links.kindSocial'),
  catalog: t('cleanup:links.kindCatalog'), source_reference: t('cleanup:links.kindSourceReference'),
};

export interface LinkStats {
  total: number;
  entities: number;
  by_kind: Record<string, number>;
  top_hosts: [string, number][];
  top_host_link_ids: Record<string, number>;
}

/** One judged link. `note` is the result sentence the site returned. */
export interface LinkRow {
  id: number;
  entity: string;
  entity_id?: number;
  entity_kind?: string;
  face?: { id: number; name: string; has_image: boolean; image_version?: string; avatar_focus?: unknown };
  link_kind: string;
  label: string;
  url: string;
  note: string;
}

export interface LinkCheckState {
  status: 'idle' | 'running' | 'complete' | 'failed';
  check_id: string;
  checked: number;
  total: number;
  gone: LinkRow[];
  unclear: LinkRow[];
  /** `retry` re-verifies only the named entries. */
  scope: string;
  error?: string;
}

export interface LinkPruneState {
  status: 'idle' | 'running' | 'complete' | 'failed';
  job_id?: string;
  checked?: number;
  total?: number;
  message?: string;
  removed?: number;
  /** Links of retired performers are kept, as non-clickable records. */
  marked?: number;
  recovered?: number;
  error?: string;
}

/** These write endpoints reject with 200 plus `ok:false` (stale manifest, no retryable rows), not an error code. */
async function accepted<T>(request: Promise<T & { ok?: boolean; error?: string }>): Promise<T> {
  const result = await request;
  if (result.ok === false) throw new Error(result.error || t('cleanup:links.operationIncomplete'));
  return result;
}

export const fetchLinkStats = (signal?: AbortSignal) => apiGet<LinkStats>(LINKS_URL, signal);

/** Check status is read via POST: this endpoint also starts the run; only `status_only` asks without starting. */
export const fetchLinkCheck = (signal?: AbortSignal) =>
  apiSend<LinkCheckState>(LINK_CHECK_URL, { status_only: true }, 'POST', signal);

/** Start a check run. With `retry`, only the named entries are re-verified and other conclusions stay as they are: rerunning the whole batch takes several minutes. */
export const startLinkCheck = ({ retry, checkId }: { retry?: readonly number[]; checkId?: string }) =>
  accepted(apiSend<LinkCheckState>(LINK_CHECK_URL, retry
    ? { retry, check_id: checkId }
    : { restart: true }));

export const fetchLinkPrune = (signal?: AbortSignal) => apiGet<LinkPruneState>(LINK_PRUNE_URL, signal);

/** Deletes links judged dead. The server re-verifies each one before deleting, so this run goes through a background task; irreversible,
 *  the caller must go through the confirm popover first. */
export const startLinkPrune = ({ checkId, ids }: { checkId: string; ids?: number[] }) =>
  accepted(apiSend<LinkPruneState>(LINK_PRUNE_URL, { confirm: true, check_id: checkId, background: true, ...(ids ? { ids } : {}) }));

const count = (value: number | undefined) => Number(value || 0).toLocaleString();

/** The message once deletion completes. */
export const pruneText = (state: LinkPruneState) =>
  [t('cleanup:links.pruneRemoved', { count: Number(state.removed || 0) }),
    ...(state.marked ? [t('cleanup:links.pruneRetired', { count: Number(state.marked || 0) })] : []),
    t('cleanup:links.pruneKept', { count: Number(state.recovered || 0) })].join(t('cleanup:shared.sentenceGap'));

/** How far the check has progressed. While the total is not yet known, only say what it is doing. */
export function checkLine(state: LinkCheckState): string {
  const retrying = state.scope === 'retry';
  if (!state.total) return retrying ? t('cleanup:links.rechecking') : t('cleanup:links.checkingLinks');
  return t(retrying ? 'cleanup:links.progressRechecked' : 'cleanup:links.progressChecked',
    { checked: count(state.checked), count: Number(state.total || 0) });
}
