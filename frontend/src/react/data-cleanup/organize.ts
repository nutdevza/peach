/* Organize's (ADR-0039) data contract: media stays in its directory by default, and this block is the only entry that
 * touches file names and directories. Two templates, one preview, one run, plus reverting the last batch as it was.
 *
 * `/api/organize` returns everything the card needs in one response: the job snapshot spread at the top level, beside the
 * optional sources, stored templates, presets and placeholder docs. So the background-job cell needs `jobOf`/`withJob`: a new
 * snapshot only swaps the job fields, leaving sources and templates untouched. Run and rollback are real ledger writes, and
 * the caller must pass a confirmation dialog first. */
import { apiGet, apiSend } from '../../api';
import { queryClient } from '../query';
import { t } from '../../i18n';
import { PICK_FOLDER_URL } from '../../configuration-endpoints';
/* Templates follow the database (`organizeTemplates` in `SYNCED_SETTING_KEYS`) and write through the same endpoint as the settings panel. */
import { SETTINGS_URL } from '../settings-panel/settings-data';

export const ORGANIZE_URL = '/api/organize';
export const ORGANIZE_PREVIEW_URL = '/api/organize/preview';
export const ORGANIZE_APPLY_URL = '/api/organize/apply';
export const ORGANIZE_ROLLBACK_URL = '/api/organize/rollback';

export const ORGANIZE_KEY = ['organize'] as const;
export const ORGANIZE_EXAMPLE_URL = '/api/organize/example';

export interface OrganizeExample { ok: boolean; example?: string; error?: string; field?: 'file' | 'dir' }
export const fetchOrganizeExample = (file: string, dir: string, signal?: AbortSignal) =>
  apiGet<OrganizeExample>(`${ORGANIZE_EXAMPLE_URL}?${new URLSearchParams({ file_template: file, dir_template: dir })}`, signal);

export interface OrganizeTemplate { file: string; dir: string }

export interface OrganizeJob {
  status: 'idle' | 'running' | 'complete' | 'failed';
  job_id?: string;
  stage?: string;
  message?: string;
  checked?: number;
  total?: number;
  /** The readouts recorded by the executing run. The rollback run has no `moved`, only `restored`. */
  moved?: number;
  restored?: number;
  failed?: number;
  error?: string;
}

export interface OrganizeData extends OrganizeJob {
  locations: { location: string; roots: string[] }[];
  templates: Record<string, OrganizeTemplate>;
  presets: ({ label: string; example?: string } & OrganizeTemplate)[];
  placeholders: { key: string; label: string }[];
  last_batch: string;
}

export interface OrganizePlanRow { current_path: string; target_path: string; action: string }

export interface OrganizePlan {
  path?: string;
  counts: { change?: number; unchanged?: number; [key: string]: number | undefined };
  reasons: Record<string, number>;
  rows: OrganizePlanRow[];
  truncated: boolean;
  plan_csv?: string;
}

/** What gets organized this time: the source and the two templates. */
export interface OrganizeRequest { location: string; file_template: string; dir_template: string; path: string }

/** Execute or roll back. Both paths start the same background task, and the result lands in the same cell. */
export type OrganizeCommand = { kind: 'apply'; request: OrganizeRequest } | { kind: 'rollback' };

export const fetchOrganize = (signal?: AbortSignal) => apiGet<OrganizeData>(ORGANIZE_URL, signal);

export async function prefetchOrganize(signal: AbortSignal): Promise<void> {
  await queryClient.fetchQuery({ queryKey: ORGANIZE_KEY, queryFn: () => fetchOrganize(signal) });
}

export const previewOrganize = (request: OrganizeRequest) =>
  apiSend<OrganizePlan>(ORGANIZE_PREVIEW_URL, request);

export const pickOrganizeFolder = (initial: string) => apiSend<{ path: string | null }>(PICK_FOLDER_URL, { initial });

export const startOrganize = (command: OrganizeCommand) => command.kind === 'apply'
  ? apiSend<OrganizeJob>(ORGANIZE_APPLY_URL, { ...command.request, confirm: true })
  : apiSend<OrganizeJob>(ORGANIZE_ROLLBACK_URL, { confirm: true });

/** Save the template at the moment of confirming: the next visit to this page shows the two lines used last time, not another
 *  empty form. Previews are not saved, so a template tried and abandoned does not displace the previous one. A failed save must not block an organize run already under way, so failures are silent. */
export async function rememberTemplates(templates: Record<string, OrganizeTemplate>): Promise<void> {
  queryClient.setQueryData<OrganizeData>(ORGANIZE_KEY, (data) => (data ? { ...data, templates } : data));
  try {
    await apiSend(SETTINGS_URL, { organizeTemplates: templates });
  } catch {
    /* The read-only side: the template stays only in this run's cache. */
  }
}

/** The task snapshot is swapped into the whole card: only the task cells change; source, template and the previous batch stay as they were. */
export const withOrganizeJob = (data: OrganizeData | undefined, job: OrganizeJob) =>
  (data ? { ...data, ...job } : data);

/** When a template is invalid the error is in one of the two boxes: besides the reason, say which one. */
export const DIRECTORY_TEMPLATE_ERROR = /目录模板|分隔符|盘符|`\.`/;

/** The last segment of the path. The preview lists file names only; the full path goes in the hover tooltip. */
export function baseName(path: string): string {
  const text = String(path || '');
  return text.slice(Math.max(text.lastIndexOf('\\'), text.lastIndexOf('/')) + 1);
}

const count = (value: number | undefined) => Number(value || 0).toLocaleString();

/** The preview results line. Only rows that will change are listed: the tens of thousands of library rows that will not change are background, not results. */
export function planSummary(plan: OrganizePlan): string {
  const skipped = Object.entries(plan.reasons || {}).sort((a, b) => b[1] - a[1])
    .map(([reason, value]) => `${reason} ${count(value)}`).join(' · ');
  if (!Number(plan.counts?.change || 0)) {
    return [t('cleanup:organize.planNothing'), ...(skipped ? [t('cleanup:organize.planSkipped', { reasons: skipped })] : [])]
      .join(t('cleanup:shared.sentenceGap'));
  }
  return t('cleanup:organize.planChanges', { count: Number(plan.counts.change), unchanged: count(plan.counts.unchanged) })
    + (skipped ? t('cleanup:organize.planChangesSkipped', { reasons: skipped }) : '') + t('cleanup:shared.sentenceEnd');
}

/** How the finished run is described. The rollback run has `restored`. */
export function organizeOutcome(job: OrganizeJob): { text: string; failed: number; rollback: boolean } {
  const rollback = job.restored !== undefined;
  const failed = Number(job.failed || 0);
  const done = Number(rollback ? job.restored : job.moved || 0);
  const text = t(rollback ? 'cleanup:organize.rolledBack' : 'cleanup:organize.organized', { count: done })
    + (failed ? t(rollback ? 'cleanup:organize.rollbackFailedRows' : 'cleanup:organize.organizeFailedRows', { count: failed }) : '')
    + t('cleanup:shared.sentenceEnd');
  return { text, failed, rollback };
}
