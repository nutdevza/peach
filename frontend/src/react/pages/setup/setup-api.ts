/* The first-run page's three requests: fetch questions, submit, and pop the folder dialog on this computer.
 *
 * The pages bundle carries neither the main UI's request wrapper nor the Query cache, so this uses `fetch` directly. Shapes
 * are in docs/OPERATIONS.md, "first setup's internal flow": the error body is `{error, errors?}`, `errors` keyed by question,
 * the media directories entry a list matching rows, and for a wholly invalid form a list with one sentence. */
import { PICK_FOLDER_URL } from '../../../configuration-endpoints';

export const SETUP_QUESTIONS_URL = '/api/setup/questions';
export const SETUP_URL = '/api/setup';

export interface SetupOption { value: string; label: string }

export interface SetupQuestion {
  key: string;
  label: string;
  help: string[];
  default: string;
  required: boolean;
  advanced: boolean;
  input: 'folders' | 'folder' | 'choice' | 'text' | 'number';
  prefix: string;
  suffix: string;
  options?: SetupOption[];
  visible_when?: Record<string, string>;
}

export interface MountDependency { name: string; message: string; download_url: string; download_label: string }

export interface SetupQuestions {
  peach_proxy?: import('../../bundle').PeachProxyState;
  docker?: boolean;
  /** Docker 固定的数据目录（`/data`），不出题，只在确认页列出；其余部署为 `null`。 */
  data_root?: string | null;
  /** 容器启动时已按 `PEACH_ACCESS_PASSWORD` 写下访问密码，访问那一项不再出题。 */
  access_preset?: boolean;
  remote_reporting?: import('../../settings/remote-reporting-settings').RemoteReportingState;
  windows: boolean;
  standalone: boolean;
  questions: SetupQuestion[];
  media_sources: SetupOption[];
  media_source_default: string;
  media_root: { label: string; placeholder: string } | null;
  cloud: { help: string; link: { url: string; label: string }; dependencies: MountDependency[] };
  access_enabled: boolean;
  scan_now: boolean;
  history_guide: boolean;
}

export interface SetupFact { term: string; value: string; download_url?: string; download_label?: string; install_tool?: string }

export interface SetupDone {
  restored?: boolean;
  skip_media?: boolean;
  url: string;
  scan_requested: boolean;
  history_guide: boolean;
  standalone: boolean;
  redirect: string | null;
  facts: SetupFact[];
}

export type SetupErrors = Partial<Record<string, string | string[]>>;

export interface SetupFolder {
  path: string;
  location: string;
  root: string;
  library_id?: string;
  library?: string;
  library_icon?: string;
  library_color?: string;
  cost?: 'free' | 'metered' | '';
  library_policy?: import('../../settings/library-policy-settings').Preset;
  library_stages?: string;
}

export interface SetupSubmission {
  media_dir: SetupFolder[];
  skip_media: boolean;
  access_enabled: boolean;
  access_password?: string;
  access_confirm?: string;
  scan_now: boolean;
  history_guide?: boolean;
  [key: string]: unknown;
}

export class SetupRequestError extends Error {
  constructor(readonly status: number, message: string, readonly errors?: SetupErrors, readonly docker = false) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin', ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    });
  } catch (cause) {
    if (init.signal?.aborted) throw cause;
    throw new SetupRequestError(0, 'Cannot reach Peach; confirm it is still running, then retry');
  }
  const body = await response.json().catch(() => null) as { error?: string; errors?: SetupErrors; docker?: boolean } | null;
  if (!response.ok) throw new SetupRequestError(response.status, body?.error || fallback, body?.errors, body?.docker === true);
  return body as T;
}

export const fetchQuestions = (signal?: AbortSignal) =>
  request<SetupQuestions>(SETUP_QUESTIONS_URL, { signal }, 'The settings prompt could not be read');

export const submitSetup = (submission: SetupSubmission) =>
  request<SetupDone>(SETUP_URL, { method: 'POST', body: JSON.stringify(submission) }, 'Setup could not finish');

export const restoreSetup = (dataRoot: string) =>
  request<SetupDone>(`${SETUP_URL}/restore`, { method: 'POST', body: JSON.stringify({ data_root: dataRoot }) }, 'Could not use this data directory');

export const pickFolder = async (initial: string) =>
  (await request<{ path: string | null }>(PICK_FOLDER_URL,
    { method: 'POST', body: JSON.stringify({ initial }) }, 'The folder dialog could not open')).path;

export const describeFailure = (cause: unknown) => (cause instanceof Error && cause.message) || 'The request failed; retry';
