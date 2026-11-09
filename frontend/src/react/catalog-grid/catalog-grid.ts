/* The library card grid's data: catalog (`/` and the four filter states, trash), the profile page's video section, and the
 * two places the shell hands over a batch of entries directly (the details page's Continue watching).
 *
 * Catalog and video section each run one `useInfiniteQuery` per page; "load more" is fetching the next page.
 *
 * The layout of a screen of cards is fully computed here and rendering only follows:
 * - Volumes and editions each fold. A group keeps only its first appearance, across pages too (turned off by setting).
 * - When a catalog page has 8 or more visible cards, a Mix is inserted at position 8; the seed is searched starting one screen
 *   below the Mix position, so it cannot collide with same-screen cards.
 * - The portrait strip appears once per page taken, its landing spot randomly chosen among the row boundaries between the
 *   rows this page added. */
import type { InfiniteData, QueryKey } from '@tanstack/react-query';

import { apiGet } from '../../api';
import { javImageKind } from '../../jav-artwork';
import type { CatalogGridProps, MediaItem, MediaPage } from './types';
import { queryClient } from '../query';

/** How many images go in one portrait strip. */
export const SHORTS_BATCH = 18;
/** The Mix card slots into this position on every page, that is, 8th. */
export const MIX_SLOT = 7;

/** One page of results, plus, when the first page is empty, whether the whole library is empty: the empty state uses it to say "no videos yet" or
 *  "no matches". */
export interface GridPage extends MediaPage {
  offset: number;
  batch?: number;
  libraryEmpty?: boolean;
}

/** The catalog query string, without `limit`/`offset`. The `exclude_vertical` decision belongs to the shell: the home page's default list has its own
 *  vertical strip for verticals, and search and explicit vertical filters do not exclude. */
export function catalogParams(filters: Readonly<Record<string, string>>, excludeVertical: boolean): string {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  if (excludeVertical) params.set('exclude_vertical', '1');
  return params.toString();
}

export const catalogKey = (params: string, revision: number): QueryKey => ['catalog-grid', 'catalog', params, revision];
export const entityKey = (key: string, revision: number): QueryKey => ['catalog-grid', 'entity', key, revision];

/** One page of the catalog. When page one is empty and this is not the trash, ask once more whether the library holds anything at all. */
export async function fetchCatalogPage(
  params: string, offset: number, batch: number, trash: boolean, signal: AbortSignal, includeTotal = true,
): Promise<GridPage> {
  const query = new URLSearchParams(params);
  query.set('limit', String(batch));
  query.set('offset', String(offset));
  if (offset || !includeTotal) query.set('count', '0');
  const page = await apiGet<MediaPage>(`/api/items?${query}`, signal);
  const result: GridPage = { ...page, items: page.items || [], offset, batch };
  if (!offset && !result.items.length && !trash) {
    const library = await apiGet<MediaPage>('/api/items?limit=1&thumb=0', signal);
    result.libraryEmpty = library.total === 0;
  }
  return result;
}

/** Where the next page fetches from. The first page judges by total; later pages carry no total and go by `has_more`. */
export const nextOffset = (batch: number) => (last: GridPage): number | undefined => {
  const more = last.has_more ?? (last.items.length < (last.total || 0));
  return more ? last.offset + (last.batch ?? batch) : undefined;
};

/** 首批覆盖当前视口；后续仍按用户设置的每批条数补齐。 */
export function visibleCatalogBatch(columns: number, room: number, cardHeight: number, gap: number, maximum: number): number {
  return Math.max(1, Math.min(maximum, Math.max(1, columns) * Math.max(1, Math.ceil((room + gap) / (cardHeight + gap)))));
}

function firstCatalogBatch(maximum: number): number {
  const grid = document.querySelector<HTMLElement>('#grid .skeletonpanel[data-fill]>div, #grid [data-media-grid]');
  const first = grid?.firstElementChild;
  if (!grid || !first) return Math.min(maximum, 18);
  const style = getComputedStyle(grid);
  const height = first.getBoundingClientRect().height;
  if (!height || style.display !== 'grid') return Math.min(maximum, 18);
  return visibleCatalogBatch(style.gridTemplateColumns.split(' ').filter(Boolean).length,
    window.innerHeight - grid.getBoundingClientRect().top, height, parseFloat(style.rowGap) || 0, maximum);
}

export function catalogSummary(params: string, signal: AbortSignal): Promise<MediaPage> {
  const query = new URLSearchParams(params);
  query.set('summary_only', '1');
  return apiGet<MediaPage>(`/api/items?${query}`, signal);
}

/** The next page of the profile page's video area: the shell-provided first page may carry `has_more`, or only a total. */
export const nextEntityOffset = (last: GridPage, pages: GridPage[]): number | undefined => {
  const loaded = pages.reduce((sum, page) => sum + page.items.length, 0);
  const more = last.has_more == null ? loaded < (last.total || 0) : !!last.has_more;
  return more ? loaded : undefined;
};

export function catalogQuery(props: CatalogGridProps) {
  const params = catalogParams(props.filters || {}, !!props.excludeVertical);
  const batch = props.batchSize || 60;
  const trash = props.filters?.state === 'trash';
  const progressive = !trash && !props.wall;
  return {
    queryKey: catalogKey(params, props.revision || 0),
    queryFn: ({ pageParam, signal }: { pageParam: number; signal: AbortSignal }) =>
      fetchCatalogPage(params, pageParam, progressive && !pageParam ? firstCatalogBatch(batch) : batch, trash, signal, !progressive),
    initialPageParam: 0,
    getNextPageParam: nextOffset(batch),
  };
}

/** 目录卡片网格的首屏：取到第一页再挂，岛挂上就是最终样子，壳铺的骨架一直留到数据到，不再交接给岛自己的
 *  另一份骨架。同一个键缓存里还有（回到看过的筛选），或岛会认领上一代分页（恢复导航、沉浸墙）时不取，
 *  与 `GridBody` 的初值一致。列表视图与资料页各有自己的取数。 */
export async function prefetchCatalogGrid(props: CatalogGridProps, view: string, signal: AbortSignal): Promise<void> {
  if (props.mode === 'items' || props.mode === 'entity' || (view === 'list' && !props.wall)) return;
  const query = catalogQuery(props);
  if (queryClient.getQueryData(query.queryKey) !== undefined) return;
  if ((props.restoreNavigation || props.wall) && latestCatalogPages(query.queryKey)) return;
  await queryClient.fetchInfiniteQuery({
    queryKey: query.queryKey,
    queryFn: ({ pageParam }) => query.queryFn({ pageParam: pageParam as number, signal }),
    initialPageParam: 0,
    getNextPageParam: query.getNextPageParam,
  });
}

export function entityQuery(props: CatalogGridProps) {
  return {
    queryKey: entityKey(props.entityKey || '', props.revision || 0),
    queryFn: async ({ pageParam, signal }: { pageParam: number; signal: AbortSignal }) => {
      if (!props.fetchPage) return { items: [], total: 0, offset: pageParam } as GridPage;
      const page = await props.fetchPage(pageParam, signal);
      return { ...page, items: page.items || [], offset: pageParam } as GridPage;
    },
    initialPageParam: 0,
    getNextPageParam: nextEntityOffset,
  };
}

/** Pagination of the same collection lives in the Query; between refresh epochs the whole pagination is claimed, without copying videos into UI state. */
export function latestCatalogPages(key: QueryKey): InfiniteData<GridPage, number> | undefined {
  const exact = JSON.stringify(key);
  const cached = queryClient.getQueryCache().findAll({ queryKey: key.slice(0, -1) })
    .filter(query => JSON.stringify(query.queryKey) !== exact && !query.state.isInvalidated
      && Array.isArray((query.state.data as InfiniteData<GridPage> | undefined)?.pages))
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)[0];
  return cached?.state.data as InfiniteData<GridPage, number> | undefined;
}

/** Volumes and editions fold separately: volumes are segments one video was cut into, editions are several sources of the same video, and both can appear
 *  under one code at once, so the two sets of keys are stored apart. `seen` accumulates across pages; a group keeps only the first card that appeared. */
export function collapseGroups(
  items: readonly MediaItem[], seen: { parts: Set<string>; editions: Set<string> }, enabled: boolean,
): MediaItem[] {
  if (!enabled) return [...items];
  return items.filter((item) => {
    const part = item.part_group?.key;
    if (part) {
      if (seen.parts.has(part)) return false;
      seen.parts.add(part);
    }
    const edition = item.edition_group?.key;
    if (edition) {
      if (seen.editions.has(edition)) return false;
      seen.editions.add(edition);
    }
    return true;
  });
}

/** Can this entry actually render an image: match the card cover's branch; checking only `has_cover` would treat entries that have only the official cover but render by
 *  preview preference as having an image. */
export const mixHasPicture = (item: MediaItem | undefined, javImage: string) =>
  !!item && Boolean(javImageKind(item, javImage));

/** The seed decides the Mix's cover and byline. Start one screen below the Mix slot and look for something with an image and a byline; when nothing turns up, relax the criteria step by step. */
export function mixSeed(visible: readonly MediaItem[], javImage: string): MediaItem | undefined {
  const named = (item: MediaItem) => mixHasPicture(item, javImage)
    && Boolean(item.creator || (item.performers || []).length || item.studio);
  return visible.slice(MIX_SLOT + 8).find(named)
    || visible.slice(MIX_SLOT + 1).find(named)
    || visible.slice(MIX_SLOT + 1).find((item) => mixHasPicture(item, javImage))
    || visible[visible.length - 1];
}

/** One cell in the grid: a video card, or a Mix. */
export type Tile = { kind: 'card'; item: MediaItem } | { kind: 'mix'; seed: MediaItem };

/** 把已取回的各页排成一列格子。首枚 Mix 等累计够八张再插入，随后各页独立插入。
 *  `pageStarts[i]` 是第 i 页在这一列里的起点，竖屏带的落点要落在那一页新增的格子之间。 */
export function arrangeTiles(
  pages: readonly GridPage[], { collapse, mix, javImage }: { collapse: boolean; mix: boolean; javImage: string },
): { tiles: Tile[]; pageStarts: number[] } {
  const seen = { parts: new Set<string>(), editions: new Set<string>() };
  /* Videos added to the library mid-pagination shift all offsets, so the last few entries of the previous page can appear again on the next page.
     Render each entry only the first time: two identical cards on one screen prove nothing. */
  const ids = new Set<number>();
  const tiles: Tile[] = [];
  const pageStarts: number[] = [];
  for (const page of pages) {
    pageStarts.push(tiles.length);
    const fresh = page.items.filter((item) => !ids.has(item.id) && Boolean(ids.add(item.id)));
    const visible = collapseGroups(fresh, seen, collapse);
    const cards: Tile[] = visible.map((item) => ({ kind: 'card', item }));
    tiles.push(...cards);
    if (mix) {
      const firstMix = !tiles.some((tile) => tile.kind === 'mix');
      const pool = firstMix ? tiles.flatMap((tile) => tile.kind === 'card' ? [tile.item] : []) : visible;
      const seed = pool.length >= 8 ? mixSeed(pool, javImage) : undefined;
      if (seed) tiles.splice(firstMix ? MIX_SLOT : pageStarts.at(-1)! + MIX_SLOT, 0, { kind: 'mix', seed });
    }
  }
  return { tiles, pageStarts };
}

/** Drop point candidates for the vertical strip: starting from the rows this page added, one per row boundary; at least one row is reserved at each end, because cutting at
 *  the very top or bottom would be "pinned to top" or "pinned to bottom", not interleaving. `addedFrom` and `count` are counted from the last segment. */
export function shortsBoundaries(count: number, addedFrom: number, columns: number): number[] {
  const step = Math.max(1, columns);
  const boundaries: number[] = [];
  for (let at = Math.max(step, Math.ceil(Math.max(0, addedFrom) / step) * step); at < count; at += step) {
    boundaries.push(at);
  }
  return boundaries;
}

/** A portrait strip already inserted into the grid: `at` is where the segment below it starts within the full column of cells. */
export interface ShortsCut {
  at: number;
  total: number;
  items: MediaItem[];
}

/** The portrait strip's query string: it follows the main list's filters and sorting, and changes along with a shuffle. */
export function shortsParams(filters: Readonly<Record<string, string>>, offset: number): string {
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  params.set('orient', 'Portrait');
  params.set('limit', String(SHORTS_BATCH));
  params.set('offset', String(offset));
  return params.toString();
}

/** Splits a column of cells into segments by the portrait band, with a band inserted between segments. */
export function splitSections(tiles: readonly Tile[], cuts: readonly ShortsCut[]) {
  const ordered = [...cuts].sort((a, b) => a.at - b.at);
  const sections: { start: number; tiles: Tile[]; strip: ShortsCut | null }[] = [];
  let start = 0;
  for (const cut of ordered) {
    sections.push({ start, tiles: tiles.slice(start, cut.at), strip: cut });
    start = cut.at;
  }
  sections.push({ start, tiles: tiles.slice(start), strip: null });
  return sections;
}

/** Apply `patch` to the same card in every cached catalog version and in the video area (after rating, feedback or Watch later in details).
 *  Only fields change, no cards are added or removed: details does not know which tier each version filters by, so removal waits for the next fetch. */
export function replaceCatalogItem(id: number, patch: Partial<MediaItem>): void {
  patchCatalogItems((item) => item.id === id, patch);
}

/** Same as above, but swapping every card `match` recognizes: several segments and several editions of one code share the same cover. */
export function patchCatalogItems(match: (item: MediaItem) => boolean, patch: Partial<MediaItem>): void {
  queryClient.setQueriesData<{ cuts: ShortsCut[] }>({ queryKey: ['catalog-short-layout'] }, data => {
    if (!data || !data.cuts.some(cut => cut.items.some(match))) return data;
    return { ...data, cuts: data.cuts.map(cut => ({ ...cut,
      items: cut.items.map(item => match(item) ? { ...item, ...patch } : item),
    })) };
  });
  queryClient.setQueriesData<MediaPage>({ queryKey: ['catalog-grid', 'table'] }, data => {
    if (!data?.items.some(match)) return data;
    return { ...data, items: data.items.map(item => match(item) ? { ...item, ...patch } : item) };
  });
  queryClient.setQueriesData<InfiniteData<GridPage>>({
    queryKey: ['catalog-grid'], predicate: (query) => Array.isArray((query.state.data as InfiniteData<GridPage>)?.pages),
  }, (data) => {
    if (!data || !data.pages.some((page) => page.items.some(match))) return data;
    return {
      ...data,
      pages: data.pages.map((page) => (page.items.some(match)
        ? { ...page, items: page.items.map((item) => (match(item) ? { ...item, ...patch } : item)) } : page)),
    };
  });
}
