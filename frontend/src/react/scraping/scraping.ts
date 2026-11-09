/* 来源和凭证页的数据契约与折算。几条端点在 `frontend/src` 里都只在这里声明一次
 * （`tests/test_frontend_build.py` 盯着）。
 *
 * 来源配置、连接检查、封面任务、amane 桥和自定义来源各自缓存；后台任务按自己的节律读取状态，
 * 不重取正在编辑的来源配置。 */
import { apiGet } from '../../api';
import { queryClient } from '../query';
import { CUSTOM_SOURCES_KEY, fetchCustomSources } from './custom-source-data';

export const SCRAPING_URL = '/api/scraping';
export const SCRAPING_SETTINGS_URL = '/api/scraping/settings';
export const SCRAPING_CHECK_URL = '/api/scraping/check';
export const SCRAPING_CHECK_ALL_URL = '/api/scraping/check-all';
export const SCRAPING_COVER_URL = '/api/scraping/cover';
export const AMANE_BRIDGE_URL = '/api/scraping/amane-bridge';
export const AMANE_BRIDGE_CHECK_URL = '/api/scraping/amane-bridge/check';
export const AMANE_BRIDGE_REBUILD_URL = '/api/scraping/amane-bridge/rebuild';

/** The source list shares this one key. */
export const SCRAPING_KEY = ['scraping'] as const;
/** Status of the background task that fetches covers. */
export const COVER_JOB_KEY = ['scraping', 'cover'] as const;
/** 全部来源连接检查那一趟后台任务的状态。 */
export const CHECK_ALL_KEY = ['scraping', 'check-all'] as const;
/** Facts about the amane bridge and the rebuild task's state (`q_scraping_amane_bridge`). */
export const AMANE_BRIDGE_KEY = ['scraping', 'amane-bridge'] as const;

/** A scraping source. Fields follow `q_scraping` (`src/peach/web_scraping.py`). */
export interface Source {
  source: string;
  label: string;
  login: string;
  accepts_cookie: boolean;
  network: string;
  cookie_saved: boolean;
  /** On this machine, requests for this source are sent by the local browser and verification is passed by it directly (ADR-0065); when true, no Cookie is needed. */
  browser: boolean;
  cooldown_until?: number | null;
}

export interface ScrapingData {
  sources: Source[];
}

/** One result item from a connection check: the source page, plus the HD image URL some sources also have. */
export interface Check {
  label: string;
  ok: boolean;
  status?: number;
  message?: string;
  width?: number;
  height?: number;
  reason?: string;
  elapsed_s?: number;
  checked_at?: number;
}

/** 全部检查的报告口径，同 `peach check-sources`（`src/peach/source_preflight.py` 的 `OUTCOMES`）。 */
export type CheckOutcome = 'ok' | 'auth' | 'http' | 'cooldown' | 'network' | 'skipped';

/** 全部检查里的一项：比单项检查多了归类与它的中文名。 */
export interface ReportedCheck extends Check {
  outcome: CheckOutcome;
  outcome_label: string;
}

/** 全部检查里的一个来源。 */
export interface SourceReport {
  source: string;
  label: string;
  results: ReportedCheck[];
}

/** 全部检查的后台任务快照（`source_check_job`）。跑的时候 `results` 按完成先后追加，
 *  完成后换成按来源顺序排好的整份。`failed` 不计「未检查」。 */
export interface CheckAllJob {
  status: string;
  checked?: number;
  total?: number;
  results?: SourceReport[];
  failed?: number;
  elapsed_s?: number;
  completed_at?: number;
  error?: string;
}

/** Snapshot of the cover-fetching background job (`scraping_cover_job`). `status` is `idle|running|complete|failed`. */
export interface CoverJob {
  status: string;
  job_id?: string;
  result?: string;
  error?: string;
  width?: number;
  height?: number;
}

/** The amane bridge's card (ADR-0043). `revision` is the amane sha pinned in the manifest, `version` the version of the
 *  locked entry; `installed` is whether the venv has an interpreter; `sites` are the sites the bridge opens to the source
 *  chain. `job` is the rebuild job's snapshot with `status` like `CoverJob`. When the install package lacks the bridge's
 *  manifest or scripts, `bundled` is false, `problem` says why, and `revision` and `version` are empty. */
export interface AmaneBridge {
  repository: string;
  license: string;
  bundled: boolean;
  problem: string;
  revision: string;
  version: string;
  installed: boolean;
  installed_version: string;
  python: string;
  sites: { source: string; label: string }[];
  job: CoverJob;
}

/** The size cap for Netscape cookie files. Anything larger is probably not a cookie file, so it gets rejected up front. */
export const COOKIE_TEXT_LIMIT = 256 * 1024;

export const fetchSources = (signal?: AbortSignal) => apiGet<ScrapingData>(SCRAPING_URL, signal);
export const fetchCoverJob = (signal?: AbortSignal) => apiGet<CoverJob>(SCRAPING_COVER_URL, signal);
export const fetchCheckAllJob = (signal?: AbortSignal) => apiGet<CheckAllJob>(SCRAPING_CHECK_ALL_URL, signal);
export const fetchAmaneBridge = (signal?: AbortSignal) => apiGet<AmaneBridge>(AMANE_BRIDGE_URL, signal);

/** 首屏来源与任务快照并发取回，同一份缓存交给页面各分区。
 *
 * 抓封面与检查任务的状态用于确认操作是否可执行；amane 和自定义来源独立读取。
 * 中止时 `fetchQuery` 把 `AbortError` 抛回给挂载方，它据此
 * 放弃这一次。 */
export async function prefetchScraping(signal: AbortSignal): Promise<void> {
  void queryClient.prefetchQuery({ queryKey: AMANE_BRIDGE_KEY, queryFn: () => fetchAmaneBridge(signal) });
  void queryClient.prefetchQuery({ queryKey: CUSTOM_SOURCES_KEY, queryFn: () => fetchCustomSources(signal) });
  void queryClient.prefetchQuery({ queryKey: COVER_JOB_KEY, queryFn: () => fetchCoverJob(signal) });
  void queryClient.prefetchQuery({ queryKey: CHECK_ALL_KEY, queryFn: () => fetchCheckAllJob(signal) });
  await queryClient.fetchQuery({ queryKey: SCRAPING_KEY, queryFn: () => fetchSources(signal) });
}

/** One check result stated as one sentence: what it checked, whether it connected, how big the image is, what the server added.
 *
 * `label` in a result is what that hop queried; with a single hop it is the source page itself and the sentence need not repeat it. */
export function checkText(check: Check, sourceLabel: string): string {
  return `${sourceLabel}${check.label === 'source page' ? '' : ' HD images'}`
    + `: ${check.ok ? 'reachable' : 'unreachable'}`
    + (check.width ? ` · ${check.width} × ${check.height}` : '')
    + (check.elapsed_s !== undefined ? ` · ${check.elapsed_s.toFixed(2)} sec` : '')
    + (check.message ? `. ${check.message}` : '');
}
