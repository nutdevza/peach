/* 首页筛选栏与侧栏读的那两份聚合：`/api/facets`（侧栏各组与标签条）和 `/api/tops`（女优、厂牌两排）。
 * 存在全站那一个 `QueryClient` 里（`@peach/query`），壳启动时直接取，不等 React 包。
 *
 * 两个键，参数串都由壳按当前语境算好递进来，查询函数不读壳的变量：
 * - `['facets', 口径串, 代次]`：口径是 JAV、资料页或详情的范围、状态页与那一组筛选。
 * - `['tops', 参数串, 口径串, 代次]`：参数串是请求方传的那一份（条数、种子、JAV、状态页），回退到全库口径
 *   之后键也不变。键里另带口径串：两份是一对，口径一变两份一起重取，侧栏刷新计数时上面那两排也照样取一次。
 * - `['tops', 参数串, 代次]`：续页（参数串带 `page`）。回包只由参数串决定，两排同时要同一页只发一次。
 *
 * 同一标签页内复用同一份口径，同时要同一份只发一次请求。写操作与主动换一批由壳调 `dropBars()`：
 * 代次加一，下一次一定真的发请求；路上那一趟照样交给正在等它的调用方。 */
import { api } from '@peach/legacy/core';

import { queryClient } from './query';

/** Keep the aggregate within the same tab; writes and manual refreshes invalidate it by generation. */
export const BARS_STALE_MS = Infinity;

let revision = 0;

export const facetsKey = (scope: string, generation = revision) => ['facets', scope, generation] as const;
export const topsKey = (params: string, scope: string, generation = revision) =>
  ['tops', params, scope, generation] as const;
export const topsPageKey = (params: string, generation = revision) => ['tops', params, generation] as const;

export interface TopsData { performers: unknown[]; studios: unknown[]; [field: string]: unknown }
export type FacetsData = Record<string, unknown>;

/* Status pages narrow the top two rows to this page's basis, so as not to list people and labels with not one video here.
   But when the set narrows until the aggregate is empty ("Marked" often holds only a few entries), narrowing takes the whole
   row with it: switching one cell on the same filter bar would suddenly remove two layers from the page top, reading as having
   jumped to another page rather than changed a filter. When empty it falls back to the library-wide basis. This row's clicks
   open entity pages, which already means leaving the current status; what it answers was never "who is on this page" but
   "who to look at next". Continuation pages (the shell's `moreTops`) also go through here. */
export async function loadTops(params: string | URLSearchParams): Promise<TopsData> {
  const query = String(params);
  const scoped = await api(`/api/tops?${query}`) as TopsData;
  const wide = new URLSearchParams(query);
  if (scoped.performers.length || scoped.studios.length || !wide.has('state')) return scoped;
  wide.delete('state');
  return await api(`/api/tops?${wide}`) as TopsData;
}

/** Both are fetched together, each hitting its own cache; the shell waits for both and paints once. */
export function fetchBars(scope: string, topsParams: string): Promise<[FacetsData, TopsData]> {
  return Promise.all([
    queryClient.fetchQuery({
      queryKey: facetsKey(scope),
      queryFn: () => api(`/api/facets${scope ? `?${scope}` : ''}`) as Promise<FacetsData>,
      staleTime: BARS_STALE_MS,
    }),
    queryClient.fetchQuery({
      queryKey: topsKey(topsParams, scope),
      queryFn: () => loadTops(topsParams),
      staleTime: BARS_STALE_MS,
    }),
  ]);
}

/** The next page of the top row. Both rows keep their own page numbers; landing on the same page produces identical query strings and shares one request. */
export function fetchTopsPage(params: string): Promise<TopsData> {
  return queryClient.fetchQuery({
    queryKey: topsPageKey(params),
    queryFn: () => loadTops(params),
    staleTime: BARS_STALE_MS,
  });
}

/** Invalidate everything already fetched in both families: the generation increments, and the next `fetchBars` changes keys
 *  and refetches.
 *
 *  Neither family is removed wholesale: removal would silently cancel the trip in flight and hand its waiter a
 *  `CancelledError`. `invalidateQueries` is not used either: after invalidating a query with no observers, the trip in flight
 *  gets reused by the next `fetchQuery`, so a manual refresh would not really send. Settled entries of old generations are
 *  removed as a courtesy; nobody reads them once they return, and `gcTime` reclaims them. */
export function dropBars(): void {
  revision += 1;
  const settled = (query: { state: { fetchStatus: string } }) => query.state.fetchStatus === 'idle';
  queryClient.removeQueries({ queryKey: ['facets'], predicate: settled });
  queryClient.removeQueries({ queryKey: ['tops'], predicate: settled });
}
