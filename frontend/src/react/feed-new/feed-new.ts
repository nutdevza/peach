/* The new-releases row not yet added to the library (ADR-0042): fetching, query keys and write operations shared by the home
 * row and the profile page row.
 *
 * Both rows read the same endpoint (`/api/feeds/discoveries`) with the profile page adding `entity`; the query keys are one
 * family (`['feed-new', entity id | 'home']`), so flipping the compilation switch in one place invalidates both rows in one
 * go by `['feed-new']`. Card HTML is still assembled by the shell (`feedRowHtml`): cover framing, the edition mark and the
 * connection-method Note are the legacy layer's copies, and the image-failure fallback chain mutates nodes directly. */
import { appSettingsStore } from '@peach/appearance';
import type { CoverState } from '@peach/card-art';
import { api } from '@peach/legacy/core';

import { queryClient } from '../query';

/** The reply from `/api/feeds/discoveries`: the items plus how many videos had their cover fetch dropped on the connection in the latest round. */
export interface FeedDiscoveries { items?: FeedNewItem[]; cover_network?: number; error?: string }

/** 一行里的一部：判有没有、哪几部的封面还在排队（这一行的一键插队只管这几部）。 */
export interface FeedNewItem { id: number; code?: string; has_cover?: boolean; cover_url?: string | null; cover_state?: CoverState | null }

/** 新作那一行取回来的样子：条目与壳拼好的整段 HTML。 */
export interface FeedNew {
  items: FeedNewItem[];
  html: string;
  fetching?: boolean;
}

/** The whole HTML assembled by the shell: the Note for when the image host is unreachable and a row of cards (`feedNewCardHtml`). */
export type FeedRowHtml = (data: FeedDiscoveries | null, allHref?: string) => string;

/** The profile page row keys by entity id; the home page row does not distinguish people. */
export const feedNewKey = (entityId: number | null) => ['feed-new', entityId ?? 'home'] as const;

/** 拉取由定时器做，页面只读已经发现的那些：进这一页顺手发一轮请求，等于把每次刷新都变成对别人
 *  服务器的一次拉取。条目返回后立即显示文字与操作，封面在各自的图片格里继续等待。
 *  一行取几部按设置弹窗「新作显示数量」（`feedLimit`），改了由壳作废两行的查询重取。 */
export async function fetchFeedNew(entityId: number | null, rowHtml: FeedRowHtml): Promise<FeedNew> {
  const query = new URLSearchParams({ limit: String(appSettingsStore().value.feedLimit) });
  if (entityId) query.set('entity', String(entityId));
  const data = await api(`/api/feeds/discoveries?${query}`) as FeedDiscoveries;
  if (data.error) throw new Error(data.error);
  const items = data.items || [];
  // The home-page row ends with “View all new releases”; the profile page row lists only this person's and doesn't have that.
  const html = rowHtml(data, entityId ? '' : '/jav?tab=releases');
  return { items, html, fetching: items.some(item => item.cover_state === 'fetching') };
}

export const feedNewOptions = (entityId: number | null, rowHtml: FeedRowHtml) => ({
  queryKey: feedNewKey(entityId),
  queryFn: () => fetchFeedNew(entityId, rowHtml),
  staleTime: Infinity,
  refetchInterval: (query: { state: { data?: FeedNew } }) => query.state.data?.fetching ? 2000 : false,
});

/** The three buttons on the card (Want, Not interested, Mark watched). All are marks; on write failure the card still changes look, since this row re-sorts by the server's
 *  actual state at the next fetch. */
export const postFeedAction = (feedId: number, action: string): Promise<void> =>
  (api('/api/feeds/discovery', { method: 'POST', body: JSON.stringify({ action, ids: [feedId] }) }) as Promise<unknown>)
    .then(() => undefined, () => undefined);

/** The home row (`feed-new` island). The host is `index.html`'s resident `#feedNew`: the island's root hangs on its
 *  `.peach-react`, cards portal back to the host itself, landing outside Preflight's scope. */
export interface FeedNewProps {
  host: HTMLElement;
  /** Changing the compilation switch issues a new epoch; this row refetches with the new filter. */
  revision: number;
  helpers: {
    feedRowHtml: FeedRowHtml;
    /** Drag, wheel, and auto-scroll wired up per settings. */
    wireFeedRow(row: Element | null): void;
  };
  actions: {
    /** Whether this row stalled: reported once when fetched, or when the last card is collapsed; the shell uses it to decide whether the next home page entry lays a skeleton. */
    settled(hasItems: boolean): void;
  };
}

/** 每次进入目录页读取最新条目；图片不阻挡条目返回。 */
export async function prefetchFeedNew(props: FeedNewProps): Promise<void> {
  queryClient.removeQueries({ queryKey: feedNewKey(null) });
  await queryClient.prefetchQuery(feedNewOptions(null, props.helpers.feedRowHtml));
}
