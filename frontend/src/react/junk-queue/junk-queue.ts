/* The junk files queue's (`CATALOG_ROUTES['/junk-files']`) data and external contract.
 *
 * The queue fetches 200 at a time (`/api/ads?limit=200&status=...[&kind=...]`, scored fresh by `q_ads` in `src/peach/web_batch.py`);
 * the client reveals them batch by batch per "items per batch"; changing category or view changes the query key. Write
 * operations are only three kinds, all through `/api/batch` and executed by the shell (receipt, undo and reread belong to the
 * shell); when done the shell advances `revision`, and the query changes keys and refetches. */
import { apiGet } from '../../api';
import type { JunkKind, JunkRoute, JunkView } from '../../junk-queue';
import { t } from '../../i18n';

export type { JunkKind, JunkRoute, JunkView };

/** How many rows the queue fetches at once. Same number as the legacy layer: ratings are computed on the fly, so bigger pages are slower. */
export const JUNK_LIMIT = 200;

/** One entry from `/api/ads`. Only the fields the card reads are listed; the rest ride along untouched, since the shell cache wants the whole entry. */
export interface JunkItem {
  id: number;
  name?: string;
  junk_kind?: string;
  why?: string;
  size?: number | null;
  location?: string;
  cost?: string;
  [field: string]: unknown;
}

/** The `/api/ads` response: `total` is this view, this category's count, `all_total` is this view's cross-category total,
 *  `counts` counts per category, and `dismissed_total` feeds the badge at the category bar's end. */
export interface JunkPage {
  items: JunkItem[];
  total?: number;
  all_total?: number;
  pending_total?: number;
  dismissed_total?: number;
  counts?: Partial<Record<string, number>>;
}

export type JunkOperation = 'dismiss-junk' | 'reconsider-junk' | 'dispose';

/** The type name and glyph on the card. The URL kind writes the full name on the card. */
export const JUNK_KIND_META: Record<string, readonly [string, string]> = {
  video: [t('cleanup:junk.kindVideos'), 'play'], image: [t('cleanup:junk.kindImages'), 'pics'], archive: [t('cleanup:junk.kindArchives'), 'file-archive'],
  audio: [t('cleanup:junk.kindAudio'), 'file-audio'], url: [t('cleanup:junk.kindUrlShortcuts'), 'globe'], other: [t('cleanup:junk.kindOtherFiles'), 'hard-drive'],
};
export const junkKindMeta = (item: JunkItem) => JUNK_KIND_META[item.junk_kind || 'other'] || JUNK_KIND_META.other!;

/** The middle judgment button: 'not junk' in the pending view, 're-judge' in the excluded view. */
export function junkDecision(view: JunkView): { operation: JunkOperation; label: string; glyph: string } {
  return view === 'dismissed'
    ? { operation: 'reconsider-junk', label: t('cleanup:junk.reconsider'), glyph: 'rotate-ccw' }
    : { operation: 'dismiss-junk', label: t('cleanup:junk.notJunk'), glyph: 'check' };
}

/** A category bar item's count: "All" reads this view's total, the rest read their own category. */
export const junkCount = (page: JunkPage, kind: JunkKind): number =>
  Number((kind ? page.counts?.[kind] : page.all_total) || 0);

export const junkQueryKey = (route: JunkRoute, revision: number) =>
  ['junk-queue', route.view, route.kind, revision] as const;

export function junkQueryString({ kind, view }: JunkRoute): string {
  const params = new URLSearchParams({ limit: String(JUNK_LIMIT), status: view });
  if (kind) params.set('kind', kind);
  return params.toString();
}

export async function fetchJunkPage(route: JunkRoute, signal: AbortSignal): Promise<JunkPage> {
  const page = await apiGet<JunkPage>(`/api/ads?${junkQueryString(route)}`, signal);
  return { ...page, items: page.items || [] };
}

/** The card section still assembled by the legacy layer: the source badge (legacy layer `srcBadge`). */
export interface JunkQueueHelpers {
  badgeHtml(location: string, cost: string): string;
}

/** Actions on the card and the category bar. Ledger writes, opening details, and paging all belong to the shell. */
export interface JunkQueueActions {
  /** A category bar item was clicked (plain left click): the shell collapses multi-select, changes the address, and re-reads. Modifier keys and the middle button follow browser defaults. */
  navigate(path: string): void;
  /** Toggles one card's selection; `range` is a Shift-held range select. */
  toggleSelection(id: number, range: boolean): void;
  /** Click the title to open: videos go to details, local images open the original in a new tab. */
  open(item: JunkItem, anchor: HTMLElement): void;
  /** "Reveal location": show in file explorer. The reply is one line meant for the card's status row, empty on success. */
  reveal(item: JunkItem): Promise<string>;
  /** The three disposition buttons. They write the ledger, then refetch the queue and offer undo; failures are reported by the shell and rethrown. */
  operate(item: JunkItem, operation: JunkOperation): Promise<void>;
}

export interface JunkQueueProps extends JunkRoute {
  helpers: JunkQueueHelpers;
  actions: JunkQueueActions;
  /** How many items each segment shows (the "items per batch" setting). */
  batchSize: number;
  /** Refresh epoch: incremented when the shell requests a re-read, re-keying the query to refetch. On rotation the old copy stays on screen and the skeleton is not re-laid. */
  revision: number;
  selectMode: boolean;
  selected: ReadonlySet<number>;
  /** The count row (`#count`). The row itself belongs to the shell (cleared by the shell on page change), while the summary and category bar inside belong to this page. */
  countRow: HTMLElement | null;
  /** The grid skeleton's HTML (legacy layer `pageSkeletonHtml`), the same copy the shell lays on the first screen. */
  skeletonHtml(): string;
  /** One fetch settled (success, empty, or failure): `revision` is that run's epoch, and the shell releases the callers waiting on it based on this. */
  settled?(revision: number): void;
  /** Whether the next segment may be revealed now: not while admin or an index page sits on top. */
  canLoadMore?(): boolean;
}
