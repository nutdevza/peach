/* Follow management's data contract, polling cadence and pure reductions. The nine endpoints are each declared once in
 * `frontend/src`, here only (`tests/test_frontend_build.py` watches this).
 *
 * This page has three truths on their own cadences, hence three keys:
 * - `['follow-manage']` is the source list, creator aliases and "Suggested for you", advanced by the user's writes. After a
 *   write, only the changed entry is swapped into the cache (`setQueryData`); one toggle does not refetch the whole page.
 * - `['follow-manage','credentials']` is credential state. It reports per site whether credentials are filled in and is
 *   independent of source-list changes; merging into one key would make every source toggle re-read every site's credential
 *   file as a side effect.
 * - `['follow-manage','check']` and `['follow-manage','resolve']` are snapshots of two background jobs, cadenced by the
 *   background: every two seconds while running, silent once stopped.
 * - `['follow-manage','feeds']` is the subscription feeds (ADR-0042). It and the follow sources are two tables; toggling and
 *   removing only refetch this one.
 *
 * Grouping, sorting and pagination are pure functions: the two views (creator cards and table) must produce the same order;
 * writing the comparator twice would make the same data order differently across views. */
import { apiGet, apiSend } from '../../api';
import {
  DEFAULT_SORT, isSortKey, SORT_DEFAULT_DIR, SORT_OPTIONS, type SortDir, type SortKey,
} from '../../follow-sort';
import { clampPage, pageCount } from '../../pagination';
import { queryClient } from '../query';
import { localTime } from '../time';

export const FOLLOW_URL = '/api/follow';
export const FOLLOW_CREDENTIALS_URL = '/api/follow/credentials';
export const FOLLOW_CHECK_URL = '/api/follow/check';
export const FOLLOW_SOURCE_URL = '/api/follow/source';
export const FOLLOW_RESOLVE_URL = '/api/follow/resolve';
export const FOLLOW_SUGGEST_URL = '/api/follow/suggest';
export const FOLLOW_ALIAS_URL = '/api/follow/author-alias';
export const FOLLOW_CREDENTIAL_URL = '/api/follow/credential';
export const FOLLOW_STATUS_URL = '/api/follow/status';
export const FEEDS_URL = '/api/feeds';
export const FEED_SOURCE_URL = '/api/feeds/source';
export const FEEDS_CHECK_URL = '/api/feeds/check';
export const FEEDS_LOOKUP_URL = '/api/feeds/lookup';

/** The source list, creator aliases, and recommendations share this one key. */
export const FOLLOW_MANAGE_KEY = ['follow-manage'] as const;
/** Credential state per site. */
export const FOLLOW_CREDENTIALS_KEY = ['follow-manage', 'credentials'] as const;
/** The background task that checks for updates. */
export const FOLLOW_CHECK_KEY = ['follow-manage', 'check'] as const;
/** The background task that looks up follow sources. */
export const FOLLOW_RESOLVE_KEY = ['follow-manage', 'resolve'] as const;
/** The subscription feed list and unread counts. */
export const FEEDS_KEY = ['follow-manage', 'feeds'] as const;
/** Typing suggestions are stored per term: retyping the same word does not hit the site's public completion again. */
export const followSuggestKey = (term: string) => ['follow-manage', 'suggest', term] as const;

/** One follow source. Fields follow `_source_payload` (`src/peach/web_follow.py`). */
export interface FollowSource {
  id: number;
  provider: string;
  provider_label: string;
  ref: string;
  label: string;
  url: string;
  enabled: boolean;
  author_name?: string;
  author_key?: string;
  official_avatar_url?: string;
  avatar_url?: string;
  entity_id?: number | null;
  entity_name?: string;
  created_at?: string;
  last_checked_at?: string | null;
  last_status?: string;
  last_error?: string;
  history_exhausted?: boolean;
}

/** A set of saved creator aliases. */
export interface AliasGroup {
  canonical_key: string;
  canonical_name: string;
  aliases: { key: string; name: string; source?: string }[];
}

/** One alias pending merge, with its evidence. A human always clicks the merge; the server never promotes automatically. */
export interface AliasSuggestion { canonical: string; alias: string; evidence: string }

/** A creator from 'Guess you like', drawn from the online records the user browsed themselves. */
export interface FollowGuess { name: string; visits: number; origin?: string }

export interface FollowCounts { new?: number; seen?: number; saved?: number; ignored?: number }

/** The items this page needs from the `/api/follow` response. */
export interface FollowData {
  sources: FollowSource[];
  author_aliases?: AliasGroup[];
  alias_suggestions?: AliasSuggestion[];
  suggestions?: FollowGuess[];
  counts?: FollowCounts;
}

/** One site's credential state. Reports only existence and where to configure it, never the credential value. */
export interface CredentialRow {
  provider: string;
  provider_label: string;
  followable: boolean;
  requirement: 'required' | 'optional' | 'none' | 'blocked';
  needs: string[];
  fields: string[];
  missing: string[];
  shared_fields?: string[];
  present?: boolean;
  world_readable?: boolean | null;
  why?: string;
  where?: string;
  howto?: string;
  path?: string;
}

export interface CredentialData { root: string; providers: CredentialRow[] }

/** One result from the update-check run. Full stats stay on the page; the short receipt goes through a Toast. */
export interface CheckResult {
  ok?: boolean;
  provider?: string;
  provider_label?: string;
  author?: string;
  label?: string;
  ref?: string;
  error?: string;
  evidence_error?: string;
  added?: number;
  updated?: number;
  skipped?: number;
  skipped_compilations?: number;
  history_skipped?: number;
  probed?: number;
  exhausted?: boolean;
}

/** The update-check task snapshot. `idle` when it has never run. */
export interface CheckJob {
  status: string;
  job_id?: string;
  checked?: number;
  total?: number;
  older?: boolean;
  message?: string;
  error?: string;
  results?: CheckResult[];
  current?: { label?: string; provider?: string; attempt?: number; max_attempts?: number; retry_in?: number };
}

/** One candidate in a find result. `known` marks already-followed ones, listed but not checkable again. */
export interface ResolveCandidate {
  provider: string;
  provider_label: string;
  url: string;
  label: string;
  author?: string;
  aliases?: string[];
  evidence?: string;
  known?: boolean;
}

export interface ResolveRow {
  kind?: string;
  line: string;
  error?: string;
  candidates?: ResolveCandidate[];
  external_searches?: { label: string; query: string; url: string; evidence: string }[];
  failures?: Record<string, string>;
}

export interface ResolveJob {
  status: string;
  job_id?: string;
  checked?: number;
  total?: number;
  message?: string;
  error?: string;
  results?: ResolveRow[];
}

/** Suggestions for the add box. Grouping, order and group names all come from the server; the page copies them. */
export interface SuggestGroup {
  kind: string;
  label: string;
  items: { value: string; matched?: string; n?: number }[];
}
export interface SuggestData { q: string; groups: SuggestGroup[] }

/* ── View and sort values ── */

/** Both views share the same source set, creator order and checks; the table view shows one source per row. */
export const LAYOUTS = [['default', 'Default view'], ['table', 'Table view']] as const;
export type Layout = (typeof LAYOUTS)[number][0];

export const PAGE_SIZES = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

/* The sort dimensions and default directions share one copy with the first-screen skeleton, see `frontend/src/follow-sort.ts`. */
export { DEFAULT_SORT, isSortKey, SORT_DEFAULT_DIR, SORT_OPTIONS, type SortDir, type SortKey };

const SORT_LABELS: Record<SortKey, string> = Object.fromEntries(SORT_OPTIONS) as Record<SortKey, string>;

/** Which toolbar sort tier each of the table's five columns maps to. Clicking a column header sets that same state. */
export const COLUMN_SORT = {
  author: 'name', source: 'source', provider: 'provider', status: 'status', checked: 'checked',
} as const satisfies Record<string, SortKey>;

export const isLayout = (value: unknown): value is Layout =>
  LAYOUTS.some(([key]) => key === value);

export const pageSizeOf = (value: unknown): number =>
  (PAGE_SIZES as readonly number[]).includes(Number(value)) ? Number(value) : DEFAULT_PAGE_SIZE;

/** Direction words differ per dimension: time speaks of near and far, counts of more and fewer; "ascending" makes no sense for a single timestamp.
 *  The first item is the end clicking ascending gives, the second is its opposite. */
const SORT_DIR_WORDS: Record<SortKey, readonly [string, string]> = {
  checked: ['Closest first', 'Farthest first'], added: ['Closest first', 'Farthest first'],
  name: ['Descending', 'Ascending'], sources: ['Most first', 'Fewest first'],
  source: ['Descending', 'Ascending'], provider: ['Descending', 'Ascending'], status: ['Descending', 'Ascending'],
};

/** The direction button's accessible name: it states what pressing will produce, so it takes the opposite direction's word. Copy the current direction instead and
 *  screen readers will assume pressing keeps this order. */
export const sortLabel = (sort: SortKey, dir: SortDir): string =>
  `Sort by ${SORT_LABELS[sort]} ${SORT_DIR_WORDS[sort][dir === 'asc' ? 0 : 1]}`;

/* ── Grouping, sorting, paging ── */

/** Status sort order: failures first, then paused, unchecked, and normal last. Ascending order means "attention first". */
export function statusRank(source: FollowSource): number {
  const state = source.last_status;
  if (state === 'error' || state === 'unauthorized') return 0;
  if (!source.enabled) return 1;
  return state === 'ok' ? 3 : 2;
}

/** What state this entry is in right now. Four renderings map to four badges. */
export function statusText(source: FollowSource): string {
  if (source.history_exhausted) return 'Nothing more';
  if (!source.enabled) return 'Paused';
  if (source.last_status === 'ok') return 'Normal';
  return source.last_status === 'error' || source.last_status === 'unauthorized' ? 'Check failed' : 'Unchecked';
}

export const isBroken = (source: FollowSource): boolean =>
  source.last_status === 'error' || source.last_status === 'unauthorized';

/** A subscription's fetch frequency: by the minute under an hour, by the hour under two days, by the day beyond that. */
export function feedIntervalText(minutes: number): string {
  const value = Number(minutes) || 0;
  if (value >= 2880) return `Every ${Math.round(value / 1440).toLocaleString()} days`;
  if (value >= 60) return `Every ${Math.round(value / 60)} hr`;
  return `Every ${value} min`;
}

/** The one line an error entry shows in a list. A Python traceback's first line is always "Traceback (most recent call
 *  last):", saying nothing, so take the last line's exception type and message; otherwise take the first non-empty line. */
export function errorHeadline(text: string): string {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return '';
  return /^Traceback \(most recent call last\)/.test(lines[0]!) ? lines[lines.length - 1]! : lines[0]!;
}

const byLabel = (a: FollowSource, b: FollowSource) =>
  String(a.label || '').localeCompare(String(b.label || ''), 'zh-CN', { numeric: true });

/** Three dimensions compared per source. */
const SOURCE_SORTS: Partial<Record<SortKey, (a: FollowSource, b: FollowSource) => number>> = {
  source: byLabel,
  provider: (a, b) => String(a.provider_label || '').localeCompare(
    String(b.provider_label || ''), 'zh-CN') || byLabel(a, b),
  status: (a, b) => statusRank(a) - statusRank(b) || byLabel(a, b),
};

const timeOf = (value: string | null | undefined): number => Date.parse(value || '') || 0;

/** Among spellings of the same name, take the one with the most capitals: `LazyProcrastinator` looks more like the creator's own
 *  spelling than `lazyprocrastinator`. */
const clean = (value: string | undefined): string => String(value || '')
  .replace(/\s*[·|]\s*[A-Za-z0-9_-]+\s*$/, '')
  .replace(/\s+collections?\s*$/i, '').trim();

/** Byline and avatar read only these columns from the source: both the follows management page and the follows page (`follow-feed/follow-marks.ts`) can produce them. */
export interface AuthorSource {
  author_key?: string | undefined;
  author_name?: string | undefined;
  label?: string | undefined;
  ref?: string | undefined;
  entity_name?: string | undefined;
  official_avatar_url?: string | undefined;
  avatar_url?: string | undefined;
}

/** Group headings use the creator's own name, not some source's tag. Which segment is the person's name is decided in one place on the server
 *  (`author_name`); here we only pick among the spellings of the same person. */
export function authorName(group: readonly AuthorSource[], aliases: readonly AliasGroup[] = []): string {
  if (!group.length) return '';
  const authored = (source: AuthorSource) => String(source.author_name || '').trim() || clean(source.label);
  const entity = group.find((source) => source.entity_name);
  if (entity) return entity.entity_name!;
  const aliasGroup = aliases.find((item) => `name:${item.canonical_key}` === group[0]?.author_key);
  if (aliasGroup) return clean(aliasGroup.canonical_name);
  /* The official homepage source takes priority not only for the avatar but also for the creator's name spelling; otherwise F95's thread title
     `Lazy Procrastinator Collection` would win the group heading just by having more capitals. */
  const official = group.find((source) => source.official_avatar_url);
  if (official && authored(official)) return authored(official);
  const names = group.map(authored).filter(Boolean);
  if (!names.length) return group[0]!.label || group[0]!.ref || '';
  const caps = (text: string) => (text.match(/[A-Z]/g) || []).length;
  return names.reduce((best, name) => (caps(name) > caps(best) ? name : best), names[0]!);
}

/** The text inside a round badge: look for a Latin letter or digit first, otherwise take the first character. */
export function authorInitial(name: string): string {
  const ascii = name.trim().match(/[A-Za-z0-9]/);
  return (ascii ? ascii[0] : Array.from(name.trim())[0] || '?').toUpperCase();
}

/** The creator's official sources supply the avatar first, archived sources only as fallback. When neither has one, use the initial. */
export function authorAvatar(group: readonly AuthorSource[]): { src: string; fallback: string } {
  const official = group.find((source) => source.official_avatar_url);
  const mirror = group.find((source) => source.avatar_url);
  const src = official?.official_avatar_url || mirror?.avatar_url || '';
  const fallback = official && mirror && mirror.avatar_url !== src ? mirror.avatar_url || '' : '';
  return { src, fallback };
}

/** This creator's identity. The same person is multiple sources across sites but one person; grouping uses the backend's
 *  `author_key`, an entity id or normalized name, and the frontend does not guess again. */
export const groupKey = (group: FollowSource[]): string =>
  String(group[0]?.author_key || group[0]?.id || '');

/** Grouped by creator, with original order inside each group. Sorting is separate; grouping itself ignores it. */
export function groupByAuthor(sources: FollowSource[]): FollowSource[][] {
  const order: string[] = [];
  const byKey = new Map<string, FollowSource[]>();
  for (const source of sources) {
    const key = source.author_key || `source:${source.id}`;
    if (!byKey.has(key)) { byKey.set(key, []); order.push(key) }
    byKey.get(key)!.push(source);
  }
  return order.map((key) => byKey.get(key)!);
}

/** Sorted creator groups.
 *
 * `flip` only inverts when the direction deviates from this column's default: writing "invert on asc" would be wrong because creator names are
 * ascending by default, and entering the page would flip them to descending. Same-value tie-breaks always stay ascending by name, not following the flip; otherwise in "source
 * count", the people with equal counts would re-sort descending on every direction change, looking like the list is jumping around. */
export function authorGroups(
  sources: FollowSource[], sort: SortKey, dir: SortDir, aliases: AliasGroup[] = [],
): FollowSource[][] {
  const groups = groupByAuthor(sources);
  const flip = dir === SORT_DEFAULT_DIR[sort] ? 1 : -1;
  const name = (group: FollowSource[]) => authorName(group, aliases);
  const byName = (a: FollowSource[], b: FollowSource[]) =>
    name(a).localeCompare(name(b), 'zh-CN', { numeric: true });
  const bySource = SOURCE_SORTS[sort];
  if (bySource) {
    // Sort the sources under each creator first, then compare creators by whichever of theirs ranks highest.
    for (const group of groups) group.sort((a, b) => flip * bySource(a, b));
    return groups.sort((a, b) => flip * bySource(a[0]!, b[0]!) || byName(a, b));
  }
  const checked = (group: FollowSource[]) => Math.max(...group.map((s) => timeOf(s.last_checked_at)));
  const added = (group: FollowSource[]) => Math.max(...group.map((s) => timeOf(s.created_at)));
  return groups.sort((a, b) => {
    if (sort === 'name') return flip * byName(a, b);
    if (sort === 'sources') return flip * (b.length - a.length) || byName(a, b);
    if (sort === 'added') return flip * (added(b) - added(a)) || byName(a, b);
    return flip * (checked(b) - checked(a)) || byName(a, b);
  });
}

/** Table view rows: one source per row, with the creator column written on every row.
 *
 * Row order comes from the same creator groups, and the three source-compared tiers flatten and reorder the whole table; then the table no longer
 * clusters by creator, which is exactly what clicking those three column heads wants. Sorting applies to all results; pagination only switches the last step. */
export interface TableRow { source: FollowSource; group: FollowSource[]; author: string }

export function tableRows(
  groups: FollowSource[][], sort: SortKey, dir: SortDir, aliases: AliasGroup[] = [],
): TableRow[] {
  const rows = groups.flatMap((group) => {
    const author = authorName(group, aliases);
    return group.map((source) => ({ source, group, author }));
  });
  const bySource = SOURCE_SORTS[sort];
  if (bySource) {
    const flip = dir === SORT_DEFAULT_DIR[sort] ? 1 : -1;
    rows.sort((a, b) => flip * bySource(a.source, b.source));
  }
  return rows;
}

/** One page's bounds. Total, page count and current page all compute from the same copy, so the footer readout and the slice never disagree. */
export interface PageWindow { page: number; pages: number; total: number; start: number; end: number }

export function pageWindow(total: number, size: number, page: number): PageWindow {
  const pages = pageCount(total, size);
  const current = clampPage(page, pages);
  const start = (current - 1) * size;
  return { page: current, pages, total, start, end: Math.min(start + size, total) };
}

/* ── Selection across pages and views ── */

/** The identity of a selection is the source ID, not the row number: after paging, changing views, or re-sorting, the same batch of sources stays selected.
 *  Drop IDs no longer in the list along the way; deleted sources should not keep holding the count. */
export function keepSelected(selected: ReadonlySet<number>, sources: FollowSource[]): Set<number> {
  const available = new Set(sources.map((source) => source.id));
  return new Set([...selected].filter((id) => available.has(id)));
}

/** How a group of sources stands in the current selection: all, some, or none. The header and creator-row select-all keys read it. */
export function selectionState(selected: ReadonlySet<number>, ids: number[]):
{ all: boolean; some: boolean } {
  const count = ids.filter((id) => selected.has(id)).length;
  return { all: ids.length > 0 && count === ids.length, some: count > 0 && count < ids.length };
}

export function toggleGroup(selected: ReadonlySet<number>, ids: number[], on: boolean): Set<number> {
  const next = new Set(selected);
  for (const id of ids) { if (on) next.add(id); else next.delete(id) }
  return next;
}

/* ── Fetches and writes ── */

/** The manage page needs only the source list, aliases, and counts; `summary=1` makes the server skip video grouping and filter options. */
export const fetchFollow = (signal?: AbortSignal) =>
  apiGet<FollowData>(`${FOLLOW_URL}?summary=1`, signal);

export const fetchCredentials = (signal?: AbortSignal) =>
  apiGet<CredentialData>(FOLLOW_CREDENTIALS_URL, signal);

export const fetchCheckJob = (signal?: AbortSignal) =>
  apiGet<CheckJob>(FOLLOW_CHECK_URL, signal);

export const fetchResolveJob = (signal?: AbortSignal) =>
  apiGet<ResolveJob>(FOLLOW_RESOLVE_URL, signal);

export const fetchSuggestions = (query: string, signal?: AbortSignal) =>
  apiGet<SuggestData>(`${FOLLOW_SUGGEST_URL}?q=${encodeURIComponent(query)}`, signal);

/** Starts a check pass. With `sources` given, only those are checked; with none, all of them. */
export const startCheck = (sources?: number[]) =>
  apiSend<CheckJob>(FOLLOW_CHECK_URL, { ...(sources?.length ? { sources } : {}), background: true });

/** Start a lookup. Results are laid out for human selection first; this step writes nothing. */
export const startResolve = (lines: string[]) =>
  apiSend<ResolveJob>(FOLLOW_RESOLVE_URL, { lines, background: true });

export const setSourceEnabled = (id: number, enabled: boolean) =>
  apiSend<{ source: number; enabled: boolean }>(FOLLOW_SOURCE_URL, { action: 'enabled', id, enabled });

export const removeSource = (id: number) =>
  apiSend<{ ok: boolean }>(FOLLOW_SOURCE_URL, { action: 'remove', id });

export const addSource = (candidate: ResolveCandidate) =>
  apiSend<{ source: number }>(FOLLOW_SOURCE_URL, {
    action: 'add', url: candidate.url, label: candidate.label,
    author: candidate.author || '', aliases: candidate.aliases || [], defer_check: true,
  });

export const addAlias = (canonical: string, alias: string) =>
  apiSend<{ ok: boolean }>(FOLLOW_ALIAS_URL, { action: 'add', canonical, alias });

export const removeAlias = (alias: string) =>
  apiSend<{ ok: boolean }>(FOLLOW_ALIAS_URL, { action: 'remove', alias });

export const renameAliasGroup = (key: string, name: string, signal?: AbortSignal) =>
  apiSend<{ ok: boolean }>(FOLLOW_ALIAS_URL, { action: 'rename', canonical_key: key, canonical: name }, 'POST', signal);

/** Saves or clears one site's credentials. An empty `values` means clear. */
export const saveCredential = (provider: string, values: Record<string, string>) =>
  apiSend<{ note?: string }>(FOLLOW_CREDENTIAL_URL, { provider, values });

/** 一次批量写最多几条，与 `w_follow_status` 收 `items` 的上限相同；一页待处理也最多这么多组。 */
export const MARK_BATCH = 1000;
/** 「全部标为」最多取几轮待处理清单：一轮最多标 `MARK_BATCH` 组，十万条以上的积压不在一次点击里收完。 */
const MARK_ROUNDS = 100;

export const markItems = (items: number[], to: string) =>
  apiSend<{ ok: boolean; items: number[] }>(FOLLOW_STATUS_URL, { items, to });

type PendingRow = { id: number; status: string };
/** 待处理的未看条目，最多 `MARK_BATCH` 组；`has_more` 说后面还有。 */
export const fetchPending = () =>
  apiGet<{ groups?: { primary: PendingRow; variants: PendingRow[]; duplicates: PendingRow[] }[]; has_more?: boolean }>(
    `${FOLLOW_URL}?status=new&limit=${MARK_BATCH}`);

/** 把未看条目全部标成 `to`：取一页待处理、按 `MARK_BATCH` 条一批写，写完再从第一页取，直到取不到为止。
 *  标过的离开 `status=new`，所以不按偏移翻页；写失败的那批不再重取，免得一直撞同一个错。 */
export async function markAllPending(to: string): Promise<{ total: number; failed: number; error?: unknown }> {
  const tried = new Set<number>();
  let failed = 0;
  let error: unknown;
  for (let round = 0; round < MARK_ROUNDS; round += 1) {
    const pending = await fetchPending();
    const ids = [...new Set((pending.groups || [])
      .flatMap((group) => [group.primary, ...group.variants, ...group.duplicates])
      .filter((item) => item.status === 'new' && !tried.has(item.id)).map((item) => item.id))];
    if (!ids.length) break;
    for (let start = 0; start < ids.length; start += MARK_BATCH) {
      const batch = ids.slice(start, start + MARK_BATCH);
      for (const id of batch) tried.add(id);
      try {
        await markItems(batch, to);
      } catch (cause) {
        failed += batch.length;
        error ??= cause;
      }
    }
    if (!pending.has_more) break;
  }
  return { total: tried.size, failed, error };
}

/** A feed source. Fields follow `feeds.sources` (`src/peach/feeds.py`). */
export interface FeedSource {
  id: number;
  kind: string;
  kind_label: string;
  /** When a person is attached, her umbrella name in the database; otherwise the stored name. */
  name: string;
  /** The name this page carried on the site at the last pull. It is how an old stage-name page is told apart from the same person's real-name page. */
  page_name?: string;
  url: string;
  entity_id: number | null;
  entity_name: string | null;
  /** Whether this person has a profile image: with one, draw the `/entity-image` round frame before the name; without, fall back to the initial letter. */
  has_image?: boolean;
  image_version?: string;
  /** The profile image's face framing, from the same identity reference as `has_image`. */
  avatar_focus?: unknown;
  enabled: boolean;
  interval_minutes: number;
  last_fetched_at: string | null;
  last_error: string | null;
  last_new_count: number;
  seen: number;
}

export interface FeedsData {
  sources: FeedSource[];
  unread: number;
}

/** An unrecognizable response counts as a read failure: the copy without sources is not feed data, and drawing it would only blow up on the first length read. */
export async function fetchFeeds(signal?: AbortSignal): Promise<FeedsData> {
  const payload = await apiGet<FeedsData>(FEEDS_URL, signal);
  if (!Array.isArray(payload?.sources)) throw new Error('No feeds loaded');
  return payload;
}

export const setFeedEnabled = (id: number, enabled: boolean, signal?: AbortSignal) =>
  apiSend(FEED_SOURCE_URL, { action: 'enabled', id, enabled }, 'POST', signal);

export const removeFeed = (id: number, signal?: AbortSignal) =>
  apiSend(FEED_SOURCE_URL, { action: 'remove', id }, 'POST', signal);

/** Pulls take the same path as the schedule: with no names, "all enabled sources"; with names, only those get pulled, disabled ones included. */
export const checkFeeds = (signal?: AbortSignal, ids?: number[]) =>
  apiSend(FEEDS_CHECK_URL, ids?.length ? { sources: ids } : { all: true }, 'POST', signal);

/** One performer card from a JavDB search. Fields follow `web_feeds.q_feed_lookup`. */
export interface FeedCandidate {
  /** The on-site id; it is what gets sent back on registration. */
  id: string;
  /** Every spelling this person uses on the site. */
  names: string[];
  /** Record type: the uncensored row carries `uncensored`; the censored row is an empty string. */
  record: string;
  url: string;
  /** Whose name this id is already under in the database. */
  held_by: { id: number; name: string } | null;
  /** Which people in the database the card's spelling matches, by canonical name or alias. */
  matched: { id: number; name: string }[];
}

export interface FeedLookup {
  q: string;
  url: string;
  candidates: FeedCandidate[];
  /** The cards whose name matches and resolves to exactly one person are pre-checked for the user; empty when several people share the name. */
  suggested: string[];
  /** 数据库里按这个名字认得出的那位；认不出是 null，登记时会新建。`subscribable` 是她已有
   *  JavDB 演员页或 DMM 编号、不经搜索就能订，`following` 是已经在订。 */
  known: { id: number; name: string; subscribable: boolean; following: boolean } | null;
  /** JavDB 这一趟没搜成的原因；只在库里的她能直接订时随结果一起回来，否则整次查找报错。 */
  unavailable?: string;
}

export const lookupFeedActor = (name: string, signal?: AbortSignal) =>
  apiGet<FeedLookup>(`${FEEDS_LOOKUP_URL}?q=${encodeURIComponent(name)}`, signal);

export interface FeedFollowed {
  entity_id: number;
  entity_name: string;
  /** This one was newly created in the database this time. */
  created: boolean;
  sources: number[];
}

/** Checking a performer card registers it under her and subscribes to her performer page. The address is still assembled server-side; the page sends only the id. */
export const followFeedByName = (name: string, ids: string[], signal?: AbortSignal) =>
  apiSend<FeedFollowed>(FEED_SOURCE_URL, { action: 'follow-name', name, ids }, 'POST', signal);

/** 按库里认出的这位直接订，和人物页「订阅新作」开关同一个动作。 */
export const followFeedEntity = (entityId: number, signal?: AbortSignal) =>
  apiSend<{ entity_id: number; following: boolean; sources: number[] }>(
    FEED_SOURCE_URL, { action: 'follow', entity_id: entityId, enabled: true }, 'POST', signal);

/** 创作者来源、JAV 订阅与凭据分别读取，页面按各区域的状态显示。
 *
 * 两趟后台任务不在首屏里：它们的快照常年躺着上一趟的回执，等它们只会让首屏多等一个
 * 往返，而它们自己的键挂上去就会读。中止时 `fetchQuery` 把 `AbortError` 抛回挂载方。 */
export async function prefetchFollowManage(signal: AbortSignal): Promise<void> {
  void queryClient.prefetchQuery({ queryKey: FOLLOW_CREDENTIALS_KEY, queryFn: () => fetchCredentials(signal) });
  void queryClient.prefetchQuery({ queryKey: FEEDS_KEY, queryFn: () => fetchFeeds(signal) });
  void queryClient.prefetchQuery({ queryKey: FOLLOW_MANAGE_KEY, queryFn: () => fetchFollow(signal) });
}

/** Swap the changed entry into the cache. A full-page refetch would repaint the form the user is filling and make the list visibly jump for anyone reading this screen;
 *  the server's response is the entry's new look, so swapping it in is enough. */
export function patchSource(id: number, patch: Partial<FollowSource>): void {
  queryClient.setQueryData<FollowData>(FOLLOW_MANAGE_KEY, (data) => (data ? {
    ...data,
    sources: data.sources.map((row) => (row.id === id ? { ...row, ...patch } : row)),
  } : data));
}

/** The deleted entries are removed from the cache directly. */
export function dropSources(ids: number[]): void {
  const gone = new Set(ids);
  queryClient.setQueryData<FollowData>(FOLLOW_MANAGE_KEY, (data) => (data ? {
    ...data, sources: data.sources.filter((row) => !gone.has(row.id)),
  } : data));
}

/* Write operations that restructure the whole list, like adding a source or merging aliases: swapping one entry in cannot derive the new groups and aliases,
 * so the only option is refetching this key.
 *
 * `exact` must not be dropped: the other three keys all start with `follow-manage`, and prefix invalidation would also topple the credentials and both runs'
 * snapshots; the run in progress would flash back to "no tasks" on the page and then jump back to progress. */
export const reloadFollowManage = (): Promise<void> =>
  queryClient.invalidateQueries({ queryKey: FOLLOW_MANAGE_KEY, exact: true });

/** Debounce for typeahead suggestions. This path hits the site's public completion endpoint once, and 250ms waits for a fast typist to stop before firing one shot. */
export const SUGGEST_DEBOUNCE_MS = 250;

/** The check receipt shows only content changes and failure counts; the full statistics are presented by the check results. */
export function checkReceipt(job: Pick<CheckJob, 'results'>): string {
  const rows = job.results || [];
  const added = rows.reduce((total, row) => total + (row.added || 0), 0);
  const updated = rows.reduce((total, row) => total + (row.updated || 0), 0);
  const failed = rows.filter((row) => !row.ok).length;
  const bits: string[] = [];
  if (added) bits.push(`${added} new ${added === 1 ? 'item' : 'items'}`);
  if (updated) bits.push(`Updated ${updated} entries`);
  if (!bits.length && failed < rows.length) bits.push('No updates');
  if (failed) bits.push(`${failed} failed`);
  if (!bits.length) bits.push('No updates');
  return `Checked ${rows.length} ${rows.length === 1 ? 'source' : 'sources'}: ${bits.join(' · ')}`;
}

/** Full statistics for one check run. */
export function checkSummary(job: CheckJob): string {
  const rows = job.results || [];
  const sum = (pick: (row: CheckResult) => number | undefined) =>
    rows.reduce((total, row) => total + (pick(row) || 0), 0);
  const added = sum((row) => row.added);
  const updated = sum((row) => row.updated);
  const compilations = sum((row) => row.skipped_compilations);
  const skipped = sum((row) => row.skipped) - compilations;
  const history = sum((row) => row.history_skipped);
  const probed = sum((row) => row.probed);
  const quiet = rows.filter((row) => row.ok && !row.added && !row.updated).length;
  const failed = rows.filter((row) => !row.ok).length;
  const bits: string[] = [];
  if (added) bits.push(`${added} new ${added === 1 ? 'item' : 'items'}`);
  if (updated) bits.push(`Updated ${updated} entries`);
  if (skipped) bits.push(`Skipped ${skipped} without resources`);
  if (compilations) bits.push(`Excluded ${compilations} oversized compilations`);
  if (history) bits.push(`Skipped ${history} historical items beyond the initial fetch range`);
  if (probed) bits.push(`Re-checked ${probed} entries`);
  if (quiet) bits.push(`${quiet} sources had no updates`);
  if (!bits.length) bits.push('No updates at all');
  /* A source having no more content and this run having no updates are counted separately. */
  const exhausted = rows.filter((row) => row.exhausted).length;
  if (exhausted) bits.push(`${exhausted} with nothing more to fetch`);
  if (failed) bits.push(`${failed} failed`);
  return `Checked ${rows.length} ${rows.length === 1 ? 'source' : 'sources'}: ${bits.join(' · ')}`;
}

/** The in-page persistent row holds only what needs handling: failures and missing evidence captures. With everything successful it does not exist. */
export const checkFailures = (job: CheckJob | null): CheckResult[] =>
  (job?.results || []).filter((row) => !row.ok);

export const checkEvidenceGap = (job: CheckJob | null): string =>
  (job?.results || []).find((row) => row.evidence_error)?.evidence_error || '';

export { localTime };

export const checkedText = (source: FollowSource): string =>
  (source.last_checked_at ? localTime(source.last_checked_at) : 'Unchecked');

/** Sources with site icons. The server fetches icons per `follow_assets.SOURCE_ICON_URLS` and stores them locally,
 *  and the page trusts only this list: unregistered sources render no `<img>` at all. */
export const SOURCE_ICON_PROVIDERS = new Set([
  'fanbox', 'patreon', 'subscribestar', 'iwara', 'kemono', 'coomer', 'pawchive',
  'rule34video', 'rule34xxx', 'rule34paheal', 'gofile', 'f95zone', 'simpcity',
]);

export const sourceIconUrl = (provider: string): string =>
  (SOURCE_ICON_PROVIDERS.has(provider) ? `/source-icon?provider=${encodeURIComponent(provider)}` : '');

/** Four credential states, four wordings: pending (missing credentials) and done (configured) must not share a color, since telling those two apart at a glance is exactly the point. */
export const CREDENTIAL_STATE: Record<string, string> = {
  required: 'Required', optional: 'Optional', none: 'Not needed', blocked: 'Cannot connect right now',
};

export const credentialDone = (row: CredentialRow): boolean =>
  !!row.present && !row.missing.length;
