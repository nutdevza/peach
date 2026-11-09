/* 管理区各页（连同播放列表页）的加载态只有一份定义：壳在深链冷启动时铺它，路由树的页面元素挂上时也铺它。
 * 两处各写各的时，整页刷新会连播两段动画：先一张通用大布局骨架，再各页自己的加载态。取同一份，
 * `data-skeleton` 的键就相同，后铺的那一处认出是同一张后不再重画（`paintManagementPlaceholder`）。
 *
 * 版式照 `boardPageSkeleton` 画的那几页之外，数据管理首页与各个维护工具（`cleanup-tool-skeletons.ts`）、复核和
 * 采集来源各有一张，其余路径落到通用面板。 */
import { esc } from '@peach/legacy/core';
import { fitSkeleton, skeletonHtml } from '@peach/legacy/ui';

import { boardPageSkeleton } from './board-skeleton';
import { cleanupToolSkeletonHtml } from './cleanup-tool-skeletons';
import { CLEANUP_TOOLS } from './cleanup-tools';
import { cleanupSkeletonHtml } from './management';
import { appSettingsStore } from './appearance/settings';
import { NAVIGATION_GROUPS, normalizeNavigationOrder } from './navigation-order';

export interface PageSkeletonOptions {
  cards?: boolean;
  className?: string;
  variant?: string;
  count?: number;
  fill?: boolean;
  cardRatio?: number;
  gridClass?: string;
  gridSize?: string;
}

/** Full-page skeleton: `cards` renders a card grid, otherwise a panel; only the given items are passed down, and the rest fall back to `skeletonHtml`'s own defaults. */
export const pageSkeletonHtml = (
  label: string,
  { cards = false, className = '', variant = '', count, fill, cardRatio, gridClass = '', gridSize = '' }: PageSkeletonOptions = {},
): string => skeletonHtml(label, {
  variant: variant || (cards ? 'cards' : 'panel'), className, gridClass, gridSize,
  ...(count ? { count } : {}), ...(fill === undefined ? {} : { fill }), ...(cardRatio ? { cardRatio } : {}),
});

/* Category names are static copy written straight into the skeleton; the order is the tab order, matching the review page's list. */
const reviewLabels = () => normalizeNavigationOrder('review', appSettingsStore().value.navigationOrders.review)
  .map(key => NAVIGATION_GROUPS.review.items.find(([id]) => id === key)![1]);
/* The review page is categories in a column on the left with a toolbar and Fieldsets cell by cell on the right, so the
   skeleton uses the final containers' class names; column split, column widths and card heights all come from the page's own
   rules, so finishing is only swapping placeholders for content and not one cell of layout moves.
   The category names and "Review categories" are data-independent and written out directly; what waits is how many each
   category holds, so only the count is a placeholder. The three toolbar pieces, grouping, category filter and select all on
   this page, need the queue back to know options and counts, three placeholders matched one to one. */
const reviewSkeletonHtml = (label = 'Reading the review queue'): string => `<div class="review review-workspace review-skeleton" data-skeleton="review" aria-busy="true" aria-label="${esc(label)}">
  <div class="reviewcontrols" data-section-nav><h2 class="review-category-title">Review categories</h2>
    <div class="reviewtabs" data-section-items>${reviewLabels().map((text, i) =>
      `<button type="button" disabled aria-selected="${i === 0}">${esc(text)}<span class="skeleton reviewcountskeleton" aria-hidden="true"></span></button>`).join('')}</div></div>
  <div class="reviewbulkbar reviewbulktoolbar" aria-hidden="true">${'<span class="skeleton reviewtoolskeleton"></span>'.repeat(3)}</div>
  <section class="reviewsection"><div class="reviewlist">${
    '<div class="skeletoncard" aria-hidden="true"><i></i><b></b><em></em></div>'.repeat(6)}</div></section></div>`;

const PLACEHOLDERS: Record<string, () => string> = {
  '/data-cleanup': () => cleanupSkeletonHtml(),
  /* Every maintenance tool has its own page skeleton; newly added tools don't fall back to the generic panel below. */
  ...Object.fromEntries(CLEANUP_TOOLS.map(tool => [tool.path, () => cleanupToolSkeletonHtml(tool.key)])),
  // The old address /resource-sync, once opened, routes to the resource-sync second-level page; the placeholder is first drawn as that page, and when transitioning, the same key isn't redrawn.
  '/resource-sync': () => cleanupToolSkeletonHtml('resource-sync'),
  '/review': () => reviewSkeletonHtml(),
  /* 采集来源是 812px 窄列里一叠同宽的 Fieldset：连接检查、高清封面，再接各个来源。骨架画四块，
     那是首屏装得下的张数；说明那一句是静态文案，与数据无关，立刻显示。 */
  '/sources': () => `<div class="scraping-page"><p>HD images may need a proxy to download; check the connection first.</p>
    ${pageSkeletonHtml('Loading scraping sources', { cards: true, count: 4, fill: false, className: 'cleanup-skeleton' })}</div>`,
};

/** The follows-management skeleton draws in the view this browser chose last time, with the sort box and direction key matching the URL's tier: if the wait draws
 *  as cards and the table only appears once data lands, the layout flips wholesale within a single visit. */
export interface FollowSkeletonState {
  followLayout: string;
  followSort: string;
  followDir: string;
}

/** This page's loading-state HTML. */
export function managementSkeletonHtml(path: string, { followLayout, followSort, followDir }: FollowSkeletonState): string {
  return boardPageSkeleton(path, { followLayout, ...(path === '/subscriptions' ? { followSort, followDir } : {}) })
    || (PLACEHOLDERS[path] ?? (() => pageSkeletonHtml('Loading page')))();
}

/** The skeleton's key: the same key means the same skeleton, no redraw needed. */
export const skeletonKeyOf = (html: string): string => String(html).match(/data-skeleton="([^"]*)"/)?.[1] || '';

/** Lays the loading state into the container. If the same skeleton is already inside, leave it: swapping new nodes via innerHTML replays the shimmer from the top,
 *  and a full page refresh would show the same animation flash twice. */
export function paintManagementPlaceholder(container: HTMLElement, placeholder: string): void {
  const painted = container.querySelector<HTMLElement>('[data-skeleton]')?.dataset.skeleton || '';
  const next = skeletonKeyOf(placeholder);
  if (!next || next !== painted) {
    container.innerHTML = placeholder;
    fitSkeleton(container);
  }
}
