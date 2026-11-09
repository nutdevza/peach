/* The manual review page's data contract, group/page pure functions and write operations. The three endpoints are each
 * declared once in `frontend/src`, here only (`tests/test_frontend_build.py` watches this).
 *
 * `['review']` is the whole review queue. The endpoint returns reviewable rows for all categories at once, without repeating
 * the candidate CSV's JSON string; all categories arrive in one response, so one `queryKey` suffices: switching category is
 * paging through different sections of this copy, not another truth. When judgments write back, only those rows are plucked
 * from the cache (`dropReviewRows`); one judgment does not refetch the whole queue.
 *
 * Grouping, filtering and pagination are pure functions: the toolbar's counts describe the whole queue while cards render
 * only the current page; both must be computed by the same criteria, and writing them separately would drift sooner or
 * later. */
import { apiGet, apiSend } from '../../api';
import { clampPage, pageCount } from '../../pagination';
import { selectRange } from '../../selection';
import { queryClient } from '../query';
import { localTime } from '../time';

export const REVIEW_URL = '/api/review';
export const REVIEW_DECISION_URL = '/api/review/decision';
export const REVIEW_GENRE_URL = '/api/review/genre';

/** The whole review queue. */
export const REVIEW_KEY = ['review'] as const;

/** The review categories and their on-screen names. The order is the tab order. */
export const REVIEW_LABELS = {
  metadata_fields: 'Metadata fields',
  creator_tags: 'Creator tags',
  code_creators: 'Code directory questionable',
  western_identity: 'Western identity backfill',
  performer_avatars: 'Performer avatars',
  studio_logos: 'Label logo',
  fc2_markings: 'FC2 comment marks',
  fc2_similarity: 'FC2 cross-code similarity',
  video_endcards: 'End credits / source evidence',
} as const;

export type ReviewCategory = keyof typeof REVIEW_LABELS;

export const REVIEW_CATEGORIES = Object.keys(REVIEW_LABELS) as ReviewCategory[];

export const DEFAULT_CATEGORY: ReviewCategory = 'metadata_fields';

export const isReviewCategory = (value: unknown): value is ReviewCategory =>
  typeof value === 'string' && Object.hasOwn(REVIEW_LABELS, value);

/** Categories whose subject is an entity rather than a single video; the value is the entity kind. This table and `web_review.py`'s
 *  `ENTITY_REVIEW_KINDS` must match verbatim: if this side judges creator but images are fetched by performer,
 *  the flag says images exist while the request still 404s. */
export const ENTITY_REVIEW_KINDS: Partial<Record<ReviewCategory, string>> = {
  creator_tags: 'creator', western_identity: 'creator',
};

/** 默认每页 20 张；接口读取整条队列，页面按所选数量挂载候选表单。 */
export const REVIEW_PAGE_SIZE = 20;

export interface CatalogEvidence { display_value?: string; warnings?: string[] }

/** A candidate value from one source. Choosing it writes `display_value` into the database. */
export interface ReviewCandidate {
  candidate_key: string;
  source?: string;
  official?: boolean;
  content_id?: string;
  provider_id?: string;
  display_value?: string;
  warnings?: string[];
  /** Other fields the same source returned along the way, used only for decisions. */
  catalog_evidence?: Record<string, CatalogEvidence>;
  /** A genre not yet in the static vocabulary. */
  unmapped_genres?: string[];
}

/** The videos behind the images on the card. */
export interface ReviewAsset {
  id: number;
  name?: string;
  code?: string;
  preview_url?: string;
  has_preview?: boolean;
}

/** One row of the queue. Fields follow `_review_rows` in `src/peach/web_review.py`; all categories share this
 *  shape, and inapplicable fields are simply absent. */
export interface ReviewRow {
  item_key: string;
  queue_order?: number;
  decision?: string;
  status?: string;
  candidates?: ReviewCandidate[];
  field?: string;
  field_label?: string;
  current_value?: string;
  current_owner?: string;
  query?: string;
  code?: string;
  creator?: string;
  studio?: string;
  current_name?: string;
  name?: string;
  board?: string;
  source?: string;
  /** When the database canonical name serves as the title, the source's own spelling is kept here. */
  source_name?: string;
  /** Candidate tags separated by vertical bars. */
  tags?: string;
  reason?: string;
  evidence?: string;
  note?: string;
  decision_note?: string;
  japanese_name?: string;
  path?: string;
  suggested_query?: string;
  preview_url?: string;
  preview_assets?: ReviewAsset[];
  comparison_assets?: ReviewAsset[];
  asset_id?: number;
  asset_name?: string;
  asset_preview_url?: string;
  asset_path?: string;
  asset_mutation_revision?: number | null;
  entity_id?: number;
  has_image?: boolean;
  image_version?: string;
  avatar_focus?: unknown;
  avatar_url?: string;
  video_count?: number;
  videos?: number | string;
  assets?: number;
  babepedia_name?: string;
  profile_url?: string;
}

/** What the reader side sees is a mirror of the writer's queue, and the page must say whether this copy is live or cached. */
export interface ReviewMirror {
  state?: string;
  origin?: string | null;
  fetched_at?: string | null;
  error?: string | null;
  read_only?: boolean;
}

export const REVIEW_QUEUES = ['pending', 'later', 'ignored'] as const;
export type ReviewQueue = typeof REVIEW_QUEUES[number];
export const REVIEW_QUEUE_LABELS: Record<ReviewQueue, string> = {
  pending: 'Pending', later: 'Handle later', ignored: 'Ignored',
};
export const REVIEW_DECISION_LABELS: Record<string, string> = {
  approved: 'Approved', rejected: 'Ignored', skipped: 'Handle later',
};
export const reviewQueueOf = (value: unknown): ReviewQueue =>
  value === 'later' || value === 'ignored' ? value : 'pending';

export interface ReviewQueueData {
  sections: Partial<Record<ReviewCategory, ReviewRow[]>>;
  counts: Partial<Record<ReviewCategory, number>>;
}

export interface ReviewData extends ReviewQueueData {
  queues: Record<Exclude<ReviewQueue, 'pending'>, ReviewQueueData>;
  /** Candidate terms when including a genre: the content tags the static table has already projected. */
  genre_tags?: string[];
  mirror?: ReviewMirror | null;
}

export const reviewQueueData = (data: ReviewData, queue: ReviewQueue): ReviewQueueData =>
  queue === 'pending' ? { sections: data.sections, counts: data.counts } : data.queues[queue];

function mapReviewQueues(data: ReviewData, transform: (snapshot: ReviewQueueData) => ReviewQueueData): ReviewData {
  return { ...data, ...transform(reviewQueueData(data, 'pending')),
    queues: { later: transform(data.queues.later), ignored: transform(data.queues.ignored) } };
}

/* ── Grouping, filtering, paging ── */

export type ReviewGrouping = 'candidates' | 'source' | 'field';

export interface ReviewGroup { key: string; title: string; rows: ReviewRow[] }

/** What this queue batch can group by. The by-source and by-field tiers only appear when the queue actually holds such entries. */
export function reviewGroupingOptions(rows: ReviewRow[], metadata: boolean): [ReviewGrouping, string][] {
  const options: [ReviewGrouping, string][] = [
    ['candidates', metadata ? 'By source count' : 'No grouping'],
  ];
  if (rows.some((row) => row.source || row.candidates?.some((candidate) => candidate.source))) {
    options.push(['source', 'By source']);
  }
  if (rows.some((row) => row.field)) options.push(['field', 'By field']);
  return options;
}

/** Grouped by source combination, with each video field appearing only once. */
export function groupReviewRows(rows: ReviewRow[], by: ReviewGrouping): ReviewGroup[] {
  const groups = new Map<string, ReviewGroup>();
  for (const row of rows) {
    let key: string;
    let title: string;
    if (by === 'field') {
      key = row.field || '__unspecified_field';
      title = row.field_label || row.field || 'Field not labeled';
    } else if (by === 'source') {
      const sources = [...new Set((row.candidates?.map((candidate) => candidate.source || '')
        || [row.source || '']).filter(Boolean))].sort();
      key = JSON.stringify(sources);
      title = sources.join(' / ') || 'Source not labeled';
    } else {
      key = row.candidates ? (row.candidates.length === 1 ? 'single' : 'multiple') : 'pending';
      title = key === 'single' ? 'Single source' : key === 'multiple' ? 'Select a source' : 'Profile';
    }
    if (!groups.has(key)) groups.set(key, { key, title, rows: [] });
    groups.get(key)!.rows.push(row);
  }
  return [...groups.values()];
}

/** Filter by group first, then paginate. Reversed, the filter would mean "the matching few on this screen". */
export function filterReviewRows(
  rows: ReviewRow[], by: ReviewGrouping, filter: string,
): ReviewRow[] {
  if (!filter) return rows;
  return groupReviewRows(rows, by).find((group) => group.key === filter)?.rows || rows;
}

export interface ReviewWindow { page: number; pages: number; rows: ReviewRow[] }

/** 按每页数量切片，页码越界时收回到最后一页。 */
export function reviewWindow(rows: ReviewRow[], page: number, pageSize = REVIEW_PAGE_SIZE): ReviewWindow {
  const pages = pageCount(rows.length, pageSize);
  const current = clampPage(page, pages);
  return {
    page: current,
    pages,
    rows: rows.slice((current - 1) * pageSize, current * pageSize),
  };
}

/** Sources that every selected item has and that appear only once per item. Setting a uniform source can only pick from these: when the same source gives two values in one row,
 *  "uniformly choose javdb" has no unique answer. */
export function commonReviewSources(rows: ReviewRow[]): string[] {
  if (!rows.length) return [];
  return [...new Set(rows.flatMap((row) => row.candidates?.map((candidate) => candidate.source || '') || []))]
    .filter((source) => source && rows.every(
      (row) => row.candidates?.filter((candidate) => candidate.source === source).length === 1));
}

/** Shift extends the selection in current display order, same semantics as the library page. Returns the new anchor. */
export function selectReviewRange(
  selected: Set<string>, keys: string[], anchor: string | null,
  key: string, range: boolean, checked: boolean,
): string {
  return selectRange(selected, keys, anchor, key, range, checked);
}

/* ── What a row can do ── */

/** Whether this row can pass. Metadata fields need candidates; creator tags only judge the ones in the `candidate` state. */
export function canApprove(category: ReviewCategory, row: ReviewRow): boolean {
  if (category === 'metadata_fields') return (row.candidates?.length || 0) > 0;
  if (category === 'creator_tags') return String(row.status || '').trim() === 'candidate';
  return true;
}

/** This row's title reads as 'what is being asked'. The field name is the question itself; the video id is only what it asks about. */
export function rowSubject(category: ReviewCategory, row: ReviewRow): string {
  if (category === 'metadata_fields') return String(row.query || row.code || '');
  return String(row.creator || row.studio || row.current_name || row.name || row.item_key);
}

export const rowFieldName = (category: ReviewCategory, row: ReviewRow): string =>
  (category === 'metadata_fields' ? String(row.field_label || row.field || '').trim() : '');

export function rowTitle(category: ReviewCategory, row: ReviewRow): string {
  const subject = rowSubject(category, row);
  const field = rowFieldName(category, row);
  return field ? `${subject} · ${field}` : subject;
}

export const rowEvidence = (row: ReviewRow): string =>
  row.reason || row.evidence || row.note || row.decision_note || '';

export const rowTags = (row: ReviewRow): string[] =>
  String(row.tags || '').split('|').filter(Boolean);

/** A genre on this row waiting to be added. When the same word shows up once in several sources, it is asked only once. */
export const pendingGenres = (row: ReviewRow): string[] =>
  [...new Set((row.candidates || []).flatMap((candidate) => candidate.unmapped_genres || []))];

/** The row's current selection: which source value is picked and which videos are checked. */
export interface RowChoice { candidateKey: string; assets: number[] }

/** Untouched rows count as their defaults: with a single candidate that one is selected, and video samples are all checked by default. */
export function defaultChoice(row: ReviewRow): RowChoice {
  const candidates = row.candidates || [];
  return {
    candidateKey: candidates.length === 1 ? candidates[0]!.candidate_key : '',
    assets: (row.preview_assets || []).map((asset) => asset.id),
  };
}

export type DecisionStatus = 'approved' | 'rejected' | 'skipped' | 'restore';

/** The payload handed to `/api/review/decision`.
 *
 *  Optimistic concurrency is attached only when this row pins down one asset: a group matched by code across multiple entries has no single revision to report,
 *  and forcing one only buys a string of fake conflicts across same-code volumes. */
export function decisionPayload(
  category: ReviewCategory, row: ReviewRow, status: DecisionStatus, choice: RowChoice,
): Record<string, unknown> {
  const pinned = !!row.asset_path && row.asset_mutation_revision != null;
  return {
    category,
    item_key: row.item_key,
    status,
    candidate_key: choice.candidateKey,
    creator: row.creator,
    tags: row.tags,
    studio: row.studio,
    entity_id: row.entity_id,
    avatar_url: row.avatar_url,
    selected_ids: choice.assets,
    ...(pinned ? { expected_revision: row.asset_mutation_revision } : {}),
  };
}

export const decisionReceipt = (status: DecisionStatus): string => ({
  approved: 'Profile approved', rejected: 'Profile ignored', skipped: 'Moved to handle later', restore: 'Restored to pending',
})[status];

/* ── Fetches and writes ── */

export async function fetchReview(signal?: AbortSignal): Promise<ReviewData> {
  const data = await apiGet<ReviewData>(REVIEW_URL, signal);
  for (const key of ['later', 'ignored'] as const) {
    if (!data.queues?.[key]?.sections || !data.queues[key].counts) {
      throw new Error(`${REVIEW_QUEUE_LABELS[key]} status not obtained; refresh or update the writer`);
    }
  }
  return data;
}

export interface DecisionResult {
  ok: boolean;
  error?: string;
  asset_revisions?: Record<string, { before: number; after: number }>;
}

export async function submitDecision(payload: Record<string, unknown>): Promise<DecisionResult> {
  const result = await apiSend<DecisionResult>(REVIEW_DECISION_URL, payload);
  if (result.ok && result.asset_revisions) {
    const revisions = result.asset_revisions;
    queryClient.setQueryData<ReviewData>(REVIEW_KEY, (data) => data && mapReviewQueues(data, snapshot => ({
      ...snapshot,
      sections: {
        ...snapshot.sections,
        metadata_fields: snapshot.sections.metadata_fields?.map((row) => {
          const change = revisions[String(row.asset_id)];
          return row.asset_path && change && row.asset_mutation_revision === change.before
            ? { ...row, asset_mutation_revision: change.after } : row;
        }),
      },
    })));
  }
  return result;
}

/** The batch queue preserves row identity; concurrent credentials come from the latest receipt in the shared cache. */
export function currentReviewRow(category: ReviewCategory, row: ReviewRow): ReviewRow {
  const data = queryClient.getQueryData<ReviewData>(REVIEW_KEY);
  return data ? REVIEW_QUEUES.flatMap(key => reviewQueueData(data, key).sections[category] || [])
    .find(item => item.item_key === row.item_key) || row : row;
}

/** Adds a genre (provide the Chinese name) or judges it non-content (leave `tag` empty). */
export const recordGenre = (genre: string, tag: string) =>
  apiSend<DecisionResult>(REVIEW_GENRE_URL, { genre, tag });

/** The first screen reads only the review queue. Candidates matching ADR-0018 were already written to the database when scanning and profile processing ended. */
export async function prefetchReview(signal: AbortSignal): Promise<void> {
  await queryClient.fetchQuery({ queryKey: REVIEW_KEY, queryFn: () => fetchReview(signal) });
}

/** Reviewed rows are pulled from the cache and the counts synced. Leaving them in the queue would look like the review never took effect.
 *
 *  Failed rows stay untouched: they remain on screen for retry. */
export function dropReviewRows(category: ReviewCategory, keys: string[]): void {
  settleReviewRows(category, keys, 'approved');
}

/** Move state within one response: rows and counts of all three queues update together; failed rows keep their position. */
export function settleReviewRows(category: ReviewCategory, keys: string[], status: DecisionStatus): void {
  const gone = new Set(keys);
  if (!gone.size) return;
  queryClient.setQueryData<ReviewData>(REVIEW_KEY, (data) => {
    if (!data) return data;
    const moved = REVIEW_QUEUES.flatMap(key => reviewQueueData(data, key).sections[category] || [])
      .filter(row => gone.has(row.item_key));
    if (!moved.length) return data;
    const target = { skipped: 'later', rejected: 'ignored', restore: 'pending', approved: null }[status];
    const snapshots = Object.fromEntries(REVIEW_QUEUES.map(key => {
      const snapshot = reviewQueueData(data, key);
      const kept = (snapshot.sections[category] || []).filter(row => !gone.has(row.item_key));
      const rows = target === key ? [...kept, ...moved.map(row => ({ ...row,
        decision: status === 'restore' ? 'pending' : status, decision_note: '' }))] : kept;
      rows.sort((a, b) => (a.queue_order ?? 0) - (b.queue_order ?? 0));
      return [key, { ...snapshot, sections: { ...snapshot.sections, [category]: rows },
        counts: { ...snapshot.counts, [category]: rows.length } }];
    })) as Record<ReviewQueue, ReviewQueueData>;
    return { ...data, ...snapshots.pending, queues: { later: snapshots.later, ignored: snapshots.ignored } };
  });
}

/** Including a genre changes the vocabulary, not one candidate: the server refolds the whole queue against the new vocabulary
 *  (`_fold_genre_decisions`), so refetch the queue here rather than folding client-side. Writing the same criteria twice
 *  will eventually disagree, and the disagreement shows as "one more tag on the page while the approved write still used the old one". */
export const reloadReview = (): Promise<void> =>
  queryClient.invalidateQueries({ queryKey: REVIEW_KEY, exact: true });

/** The read-only side's line: a live mirror, a cached snapshot, or no mirror fetched at all. */
export function mirrorText(
  mirror: ReviewMirror | null | undefined, readOnlyMessage: string,
): string {
  if (mirror?.state === 'live') return 'Showing the writer\'s live review queue';
  if (mirror?.state === 'cached') return `The writer is temporarily unreachable, showing the cache from ${localTime(mirror.fetched_at)}`;
  return mirror?.error || readOnlyMessage;
}
