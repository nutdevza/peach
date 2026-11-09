import { resolveFollowSort, SORT_OPTIONS, type SortDir, type SortKey } from './follow-sort';
import { islandButton, islandSelect } from './island-skeleton';
import { configurationSkeleton } from './configuration-skeleton';
import { javPageSkeleton } from './jav-skeleton';
import { javTab } from './react/jav/jav-navigation';
import { duplicatesSkeleton, qualityGoalsSkeleton, repairCenterSkeleton, statsSkeleton, tasteSkeleton } from './management-skeletons';
import { CONFIGURATION_SECTIONS, isSettingsSectionPath } from './history/settings-route';
import { FOLLOW_MANAGE_NAV as FOLLOW_TABS } from './react/follow-manage/manage-route';

/** The waiting state reuses the page container; only async content uses a placeholder. */
const line = (width = '60%') => `<span class="skeleton" style="width:${width}"></span>`;
const lines = () => `${line('80%')}${line('48%')}`;
const repeat = (html: string, count: number) => html.repeat(count);
/* Follow management's whole page is React and the skeleton renders wholesale inside `.peach-react`, with container and keys
   taking the same class strings React renders (`react/follow-manage/`, `react/components/` and `island-skeleton.ts`): the
   page column, readout band, segmented control, the follows list's filled card, creator cards, source rows and the table's
   outer frame. Only readouts waiting on data render placeholder bars.
   The skeleton is wholly `inert`, blocking focus and clicks; keys that need data to act (check, remove, select all, collapse)
   also carry native `disabled` and `data-skeleton-action`, dressed in the site-wide skeleton's shared disabled face.
   Preference controls like view switching and sorting have local answers and keep their post-takeover look. */
const WAITING = 'disabled data-skeleton-action';
const text = (width: string) => `<span class="skeleton skeleton-text" style="width:${width}"></span>`;
const block = (width: number, height: number, round = false) =>
  `<span class="skeleton" style="width:${width}px;height:${height}px;flex:none${round ? ';border-radius:50%' : ''}"></span>`;
const STAT = 'min-w-0 bg-background-secondary-default rounded-2xl shadow-card flex flex-col gap-3 px-6 py-5 max-sm:gap-2 max-sm:p-4';
const followReadings = () => `<div class="inline-grid w-full grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">${['Followed creators', 'Sources enabled', 'Failed checks', 'Unseen updates', 'JAV subscriptions', 'Unseen new releases'].map(term => `<div class="${STAT}"><span class="text-body-medium text-text-secondary">${term}</span><b class="text-title-1-medium tabular-nums text-text-primary">${text('3em')}</b></div>`).join('')}</div>`;
/** Tabs come from the follows management's canonical list; the selected one is taken from the address bar. */
const followTabKey = (tab = '') => (FOLLOW_TABS.some(([key]) => key === tab) ? tab : 'list');
const followTabs = (tab: string) => `<div data-section-nav data-section-items class="flex max-w-full flex-nowrap overflow-x-auto">${FOLLOW_TABS.map(([key, name]) => `<span class="whitespace-nowrap" aria-selected="${key === tab}">${name}</span>`).join('')}</div>`;
/** Board UI `Checkbox` unchecked rest state; with text it becomes a labeled one like "select all on this page". */
export const followCheck = (label = '') => `<span class="group inline-flex items-center select-none gap-2"><span class="flex shrink-0 items-center justify-center rounded-sm size-4 border bg-background-primary-default shadow-xs border-border-checkbox-default"></span>${label ? `<span class="text-body-medium text-text-primary">${label}</span>` : ''}</span>`;

/* Toolbar row: "check all" is the primary button; view switching is a pair of ghost icon-only keys with the selected one marked by `aria-pressed`;
   the sort box names the address bar's tier, and the direction arrow points at the same end. Below 740px wide, React collapses the labeled keys to
   icon-only, and the skeleton collapses along the same line via `09-skeleton.css` container queries. */
interface FollowToolbar { table: boolean; sort: SortKey; dir: SortDir }
const followToolbar = ({ table, sort, dir }: FollowToolbar) => {
  const name = SORT_OPTIONS.find(([key]) => key === sort)![1];
  return `<div data-responsive-toolbar class="ui-follow-skeleton-toolbar"><span data-follow-toolbar-heading data-toolbar-heading><h3 class="text-title-2-medium text-text-primary">Follow list</h3><span class="text-body-2-regular text-text-secondary">${text('132px')}</span></span><div data-follow-toolbar-actions data-toolbar-actions>${islandButton({ glyph: 'refresh-cw', label: 'Check all', compact: true, attrs: WAITING })}<span data-follow-toolbar-controls class="contents"><span data-button-group role="group">${islandButton({ variant: 'ghost', glyph: 'layout-grid', attrs: `aria-pressed="${!table}"` })}${islandButton({ variant: 'ghost', glyph: 'table', attrs: `aria-pressed="${table}"` })}</span><span class="flex flex-none items-center gap-2">${islandSelect(name, { prefix: 'Sort' })}${islandButton({ variant: 'secondary', glyph: dir === 'asc' ? 'arrow-up' : 'arrow-down' })}</span>${table ? '' : islandButton({ variant: 'secondary', glyph: 'chevron-up', label: 'Collapse all', compact: true, attrs: WAITING })}</span></div></div>`;
};
/** The action pair at the end of a row: check this source for updates, remove this source, both small secondary icon-only keys like the React `SourceRow`. */
const followRowActions = () => `<span class="flex shrink-0 items-center gap-1">${islandButton({ variant: 'secondary', size: 'small', glyph: 'refresh-cw', attrs: WAITING })}${islandButton({ variant: 'secondary', size: 'small', glyph: 'trash', attrs: WAITING })}</span>`;
/** One source: checkbox, name, site icon, status badge, last check, actions, with the same class string as the React `SourceRow`. */
const followRow = () => `<div class="flex min-h-16 flex-wrap items-center gap-3 px-2 py-3 max-sm:gap-x-2 follow-skeleton-source">${followCheck()}<span class="flex min-w-0 grow basis-0 flex-col gap-0.5"><span class="text-body-medium">${text('8em')}</span></span><span class="flex shrink-0 items-center gap-1.5">${block(14, 14)}</span>${block(48, 24)}<span data-follow-source-controls class="flex w-max max-w-full flex-none flex-wrap items-center gap-1.5 max-sm:w-full"><span class="shrink-0 text-body-2-regular whitespace-nowrap text-text-secondary max-sm:mr-auto max-sm:text-caption-1-regular">${text('113px')}</span>${followRowActions()}</span></div>`;
/** One raised card per creator: the header row holds avatar, name, check, site icons, select all, and collapse, with the source row underneath. */
const followAuthor = (rows: number) => `<section class="min-w-0 bg-background-primary-default rounded-2xl shadow-card flex flex-col gap-3 p-3 follow-skeleton-author"><div class="flex flex-wrap items-center gap-3 px-2 py-2.5" data-follow-author-header data-open>${block(32, 32, true)}<b class="min-w-0 grow text-body-medium wrap-anywhere text-text-primary max-sm:basis-0">${text('92px')}</b><span data-follow-author-controls class="flex w-max max-w-full flex-none flex-wrap items-center gap-2 max-sm:w-full">${islandButton({ variant: 'secondary', size: 'small', glyph: 'refresh-cw', attrs: WAITING })}<span class="flex shrink-0 items-center gap-1 max-sm:mr-auto">${block(14, 14)}${block(14, 14)}</span><span class="flex flex-none items-center gap-2">${islandButton({ variant: 'secondary', size: 'small', glyph: 'check-check', label: 'Select all', attrs: WAITING })}${islandButton({ variant: 'secondary', size: 'small', glyph: 'chevron-up', label: 'Collapse', attrs: WAITING })}</span></span></div><div data-source-divider>${repeat(followRow(), rows)}</div></section>`;
/** How many rows the table skeleton paints comes from the page size; a hardcoded number leaves one screen too many or too few at other page sizes.
 *  The preference lives in the legacy layer's `peach.settings.v1`, read directly: the skeleton runs before the island mounts,
 *  when the page's own state does not exist yet. */
const followPageSize = (): number => {
  try {
    return Number(JSON.parse(localStorage.getItem('peach.settings.v1')||'{}').followPageSize)||20;
  } catch { return 20 }
};
/* The table's columns, names and sort indicators follow the React Board UI `Table`: the "Select" and "Actions" column names are for screen readers only,
   and whichever column sorts currently points its indicator that way. */
const TABLE_COLUMNS = [['select', ''], ['author', 'Creators'], ['source', 'Source'], ['provider', 'Site'], ['status', 'State'], ['checked', 'Last check'], ['actions', '']] as const;
const COLUMN_OF: Partial<Record<SortKey, string>> = { name: 'author', source: 'source', provider: 'provider', status: 'status', checked: 'checked' };
export const SORT_MARK = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12.7071 15.2929C12.3166 15.6834 11.6834 15.6834 11.2929 15.2929L7.70711 11.7071C7.07714 11.0771 7.52331 10 8.41421 10H15.5858C16.4767 10 16.9229 11.0771 16.2929 11.7071L12.7071 15.2929Z" fill="currentColor"/></svg>';
const followTable = (rows: number, { sort, dir }: { sort: SortKey; dir: SortDir }) => {
  const head = TABLE_COLUMNS.map(([id, name]) => {
    if (!name) return '<th></th>';
    const direction = COLUMN_OF[sort] === id ? ` data-direction="${dir === 'asc' ? 'ascending' : 'descending'}"` : '';
    return `<th><span class="flex items-center gap-0.5">${name}<span data-sort-indicator${direction}>${SORT_MARK}</span></span></th>`;
  }).join('');
  const row = `<tr>${[followCheck(), `<span class="flex min-w-0 items-center gap-2">${block(32, 32, true)}${text('5em')}</span>`, text('10em'), `<span class="flex items-center gap-1.5">${block(14, 14)}${text('4em')}</span>`, block(48, 24), text('113px'), followRowActions()].map(cell => `<td>${cell}</td>`).join('')}</tr>`;
  return `<div data-board-data-table data-follow-table class="follow-skeleton-table"><div class="w-full overflow-x-auto"><table class="bui-table bui-table-sm"><thead><tr>${head}</tr></thead><tbody>${repeat(row, rows)}</tbody></table></div></div>`;
};
/** The pagination row: item counts and page numbers wait for data, while per-page size is this browser's preference and is written out with its final wording. */
const followPager = (table: boolean, size: number) => `<div class="flex flex-wrap items-center justify-between gap-3"><span class="mr-auto text-body-2-regular text-text-secondary">${text('111px')}</span><div data-toolbar-actions>${islandSelect(`Per page ${size} ${table ? 'items' : 'people'}`, { size: 'sm' })}${block(204, 32)}</div></div>`;
/** Tabs other than the follow list: each has different content whose shape is unknown until the data arrives, so only the filled card and a few placeholder rows are drawn. */
const followPanel = () => `<div class="min-w-0 bg-background-secondary-default rounded-2xl shadow-card flex flex-col gap-4 px-6 py-5 max-sm:px-4 ui-follow-skeleton-surface"><h3 class="text-title-2-medium text-text-primary">${text('120px')}</h3>${['72%', '56%', '64%', '40%'].map((width) => `<span class="text-body-medium">${text(width)}</span>`).join('')}</div>`;
type FollowSkeletonOptions = { followLayout?: string; followPageSize?: number; followSort?: string; followDir?: string; followTab?: string };
const followList = (options: FollowSkeletonOptions) => {
  const tab = followTabKey(options.followTab);
  if (tab !== 'list') return `<div class="peach-react"><div class="mx-auto flex w-full max-w-board flex-col gap-8">${followReadings()}<div class="flex flex-col gap-6">${followTabs(tab)}<div class="flex flex-col gap-4">${followPanel()}</div></div></div></div>`;
  const table = options.followLayout === 'table';
  const order = resolveFollowSort(options.followSort, options.followDir);
  const size = options.followPageSize || followPageSize();
  const content = table
    ? followTable(size, order)
    : `${followCheck('Select this page')}<div class="flex flex-col gap-3">${followAuthor(3)}${followAuthor(4)}${followAuthor(3)}</div>`;
  return `<div class="peach-react"><div class="mx-auto flex w-full max-w-board flex-col gap-8">${followReadings()}<div class="flex flex-col gap-6">${followTabs(tab)}<div class="flex flex-col gap-4"><div class="min-w-0 bg-background-secondary-default rounded-2xl shadow-card flex flex-col gap-4 px-6 py-5 max-sm:px-4 ui-follow-skeleton-surface" data-layout="${table ? 'table' : 'default'}">${followToolbar({ table, ...order })}${content}${followPager(table, size)}</div></div></div></div></div>`;
};

/** The cell inside the details skeleton's outer `[data-skeleton="detail"]`: the stage island paints the outer layer itself; the inside follows this copy. The geometry of cells and details columns
 *  is the stage's (`react/stage/stage.css`); the skeleton's background and row spacing are the shell's `skeleton` family. */
export function detailSkeletonBody(): string {
  return `<div data-stage-grid="" aria-hidden="true"><div data-stage-media="" class="ui-skeleton-detail-media skeleton"></div><aside data-stage-side=""><div data-stage-side-content="" class="ui-skeleton-lines">${line('85%')}${line('65%')}${repeat(lines(), 4)}</div></aside></div>`;
}

export function boardPageSkeleton(
  path: string, options: FollowSkeletonOptions = {},
): string {
  let body = '';
  if (path === '/stats') {
    body = statsSkeleton();
  } else if (path === '/jav') {
    const tab = javTab(new URLSearchParams(location.search).get('tab'));
    body = javPageSkeleton(tab === 'library' ? 'discover' : tab);
  } else if (path === '/taste') {
    body = tasteSkeleton();
  } else if (path === '/subscriptions') {
    body = followList(options);
  } else if (isSettingsSectionPath(path) && path.split('/')[2]! in CONFIGURATION_SECTIONS) {
    body = configurationSkeleton(CONFIGURATION_SECTIONS[path.split('/')[2] as keyof typeof CONFIGURATION_SECTIONS]);
  } else if (path === '/tasks') {
    body = `<div class="peach-react"><div class="mx-auto flex w-full max-w-board flex-col gap-8">${['In progress', 'Not run this time', 'Recently completed'].map(title => `<section class="activitysection flex min-w-0 flex-col gap-3"><h3 class="text-title-2-medium text-text-primary">${title}</h3><div class="min-w-0 rounded-2xl shadow-card bg-background-secondary-default"><div class="flex flex-col gap-1.5 px-5 pt-5 pb-4"><span class="text-title-1-medium">${text('8em')}</span><span class="text-caption-1-regular">${text('14em')}</span>${text('60%')}${text('40%')}</div><div class="border-t border-separator-border px-5 py-2.5">${text('6em')}</div></div></section>`).join('')}</div></div>`;
  } else if (path === '/settings/maintenance/repairs') {
    body = repairCenterSkeleton();
  } else if (path === '/duplicates') {
    body = duplicatesSkeleton();
  } else if (path === '/quality-goals') {
    body = qualityGoalsSkeleton();
  } else if (path === '/playlists') {
    body = `<div class="peach-react"><section class="w-full pt-1 pb-10.5"><header class="mb-4 flex items-start justify-between gap-4.5 max-board-narrow:flex-col max-board-narrow:items-stretch"><div><h2 class="mb-1 text-display-4-medium! text-text-primary">Playlists</h2><p class="text-body-2-regular text-text-secondary">Save Mixes and keep playing in your own order.</p></div><div class="flex flex-wrap items-end gap-2"><div class="min-w-50 max-w-80 flex-1 basis-50 max-board-narrow:min-w-0 max-board-narrow:max-w-none"><span class="text-body-medium">New playlist</span><span class="skeleton ui-configuration-skeleton-input mt-1.5"></span></div>${islandButton({ label: 'New', attrs: WAITING })}</div></header><div class="mx-auto w-full max-w-board"><div class="ui-playlistcards card-grid-cover gap-4.5">${repeat(`<article class="playlistcard skeletoncard"><i></i><b></b><em></em></article>`, 6)}</div></div></section></div>`;
  } else return '';
  return `<div class="board-page-skeleton" data-skeleton="board${path}" role="status" aria-label="Loading page"><div aria-hidden="true" inert>${body}</div></div>`;
}
