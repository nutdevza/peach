/* Management header: the view model and startup skeleton for the manage bar, breadcrumbs, page title and trash explainer row.
 *
 * The header belongs to the resident component `manage-header` (`react/manage-header/`). At startup the shell synchronously
 * writes the skeleton here into the host `[data-manage-header]`, and the moment the React bundle loads and the route tree
 * renders this surface it is swapped wholesale; the skeleton and the component render the same structure, and the criteria
 * (which name the title takes, which pages show breadcrumbs, which tier the title collapses to on narrow screens) are written
 * once here and shared by both.
 *
 * Which management section is current, what the menu lists, and the trash readout are computed by the shell and pushed in:
 * the route table, `/healthz`'s `configurable` and the catalog counts all still live in the shell. */

/** `[key, name, glyph]`, same as the shell's `MANAGE_SECTIONS`. */
import { CLEANUP_CRUMB_PAGES } from './cleanup-tools';
import { REPAIR_CENTER_PATH } from './history/settings-route';
import { MANAGE_MENU_SECTIONS, normalizeManageOrder } from './application/navigation-items';

export type ManageEntry = readonly [key: string, label: string, glyph: string];

/** The trash explainer row's count: reported once per page the catalog grid appends. */
export interface TrashCount {
  total: number;
  shown: number;
}

export interface ManageHeaderProps {
  /** The current admin section; an empty string renders no page header at all (home, catalog, follows pages). */
  section: string;
  /** The decoded `location.pathname`. */
  path: string;
  /** All admin sections, titled from here by `section`. */
  sections: readonly ManageEntry[];
  /** The items listed on the manage bar (the shell's `manageMenuSections()`; "configuration" is listed only on the local machine). */
  menu: readonly ManageEntry[];
  /** The trash's most recent readout since this page entry; null until read, in which case the description row lays a same-shaped placeholder. */
  trash: TrashCount | null;
}

/* The subpages the several data-management cards lead to (vercel.com/geist/breadcrumbs: breadcrumbs only appear on subpages that have a parent page).
   Manual review, trash, and high-quality version keep sidebar quick entries; each maintenance tool has its own independent second-level page.
   Subpage titles take the names here; "Data management" shows up as the previous level in the breadcrumbs. */
export const MANAGE_CRUMB_PAGES: Readonly<Record<string, string>> = {
  ...CLEANUP_CRUMB_PAGES,
  '/junk-files': 'Junk files',
  '/duplicates': 'Duplicates',
  '/review': 'Manual review',
  '/trash': 'Trash',
  '/quality-goals': 'HD version',
  '/sources': 'Sources and credentials',
  [REPAIR_CENTER_PATH]: 'Repairs and migrations',
};

/** 面包屑的上一级：`key` 是管理条上按下的那一项。没写的子页都从数据管理进。 */
export interface CrumbParent { key: string; label: string; href: string }
const CLEANUP_PARENT: CrumbParent = { key: 'cleanup', label: 'Data management', href: '/data-cleanup' };
const CRUMB_PARENTS: Readonly<Record<string, CrumbParent>> = {
  [REPAIR_CENTER_PATH]: { key: 'configuration', label: 'App and maintenance', href: '/settings/maintenance' },
};
export const crumbParent = (path: string): CrumbParent => CRUMB_PARENTS[path] ?? CLEANUP_PARENT;

/* Pages whose title steps down to 22px on narrow screens (≤760px): the data management hub, sources and credentials, and the configuration page, whose body is an 812px narrow column.
   The other managed pages follow the site-wide page title at 24px. */
const COMPACT_TITLE_PATHS = new Set(['/data-cleanup', '/sources']);

/** 管理条上按下哪一项。子页按上一级（多数是数据管理）；
 *  别的页按自己的管理区，管理条上没有这一项时就没有按下项。 */
export function pressedManageKey(props: Pick<ManageHeaderProps, 'section' | 'path' | 'menu'>): string {
  const key = MANAGE_CRUMB_PAGES[props.path] ? crumbParent(props.path).key : props.section;
  return props.menu.some(([entry]) => entry === key) ? key : '';
}

export interface ManageHeaderView {
  title: string;
  /** The item pressed on the admin bar; an empty string means nothing is pressed. */
  pressed: string;
  /** The name of the breadcrumb's current item; an empty string means no breadcrumb. */
  crumb: string;
  parent: CrumbParent;
  compact: boolean;
  /** Only trash has a description line. */
  lede: { kind: 'none' } | { kind: 'skeleton' } | { kind: 'count'; text: string; total: number };
}

export const trashLedeText = ({ total, shown }: TrashCount) =>
  `${total.toLocaleString()} matches · showing ${shown.toLocaleString()}`;

/** What the page header renders in this spot; null outside the admin area. */
export function manageHeaderView(props: ManageHeaderProps): ManageHeaderView | null {
  const entry = props.sections.find(([key]) => key === props.section);
  if (!entry) return null;
  const crumb = MANAGE_CRUMB_PAGES[props.path] ?? '';
  return {
    title: (props.section === crumbParent(props.path).key && crumb) || entry[1],
    pressed: pressedManageKey(props),
    crumb,
    parent: crumbParent(props.path),
    compact: COMPACT_TITLE_PATHS.has(props.path) || props.section === 'configuration',
    lede: props.section !== 'trash' ? { kind: 'none' }
      : props.trash ? { kind: 'count', text: trashLedeText(props.trash), total: props.trash.total }
        : { kind: 'skeleton' },
  };
}

const escape = (value: string) => value.replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const glyph = (name: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${escape(name)}"/></svg>`;

/** The trash explainer row's same-shaped placeholder until the readout arrives: the left cell sized to the readout, the right end sized to the "Empty trash" key.
 *  The skeleton and the island share this piece, and the sweep animation follows the site-wide `.skeleton`. */
export const TRASH_LEDE_SKELETON_HTML = '<span class="skeleton" data-trash-lede-skeleton="text" aria-hidden="true"></span>'
  + '<span class="skeleton" data-trash-lede-skeleton="action" aria-hidden="true"></span>';

/** The startup skeleton: same structure as the island, swapped out wholesale when the island takes over. */
export function manageHeaderSkeletonHtml(props: ManageHeaderProps): string {
  const view = manageHeaderView(props);
  if (!view) return '';
  const menu = props.menu.map(([key, label, mark]) => {
    const on = key === view.pressed;
    return `<button type="button" data-manage="${escape(key)}" aria-label="${escape(label)}" aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight" data-pill-variant="gray" aria-pressed="${on}"${on ? ' aria-current="page" data-pill-selected=""' : ''}>`
      + `${glyph(mark)}<span>${escape(label)}</span></button>`;
  }).join('');
  const crumb = view.crumb
    ? `<nav data-manage-crumb="" aria-label="Breadcrumb"><ol><li><a href="${escape(view.parent.href)}">${escape(view.parent.label)}</a>${glyph('chevron-right')}</li>`
      + `<li aria-current="true"><span>${escape(view.crumb)}</span></li></ol></nav>`
    : '';
  const lede = view.lede.kind === 'none' ? ''
    : `<p class="mono" data-manage-lede="">${view.lede.kind === 'skeleton' ? TRASH_LEDE_SKELETON_HTML
      : `<span data-lede-text="">${escape(view.lede.text)}</span>${view.lede.total ? EMPTY_TRASH_HTML : ''}`}</p>`;
  const keys = props.menu.map(([key]) => key);
  const reset = normalizeManageOrder(keys).join(',') === MANAGE_MENU_SECTIONS.join(',') ? ''
    : `<button type="button" disabled data-navigation-menu="" aria-label="Manage menu order settings" aria-haspopup="dialog" aria-expanded="false">${glyph('ellipsis')}</button>`;
  return `<nav data-manage-bar="" aria-label="Manage"><div data-manage-menu="" data-pill-nav="" role="group">${menu}</div>${reset}<span data-manage-order-status="" role="status" aria-live="polite"></span></nav>`
    + crumb
    + `<h2 data-manage-title=""${view.compact ? ' data-compact=""' : ''}>${escape(view.title)}</h2>`
    + lede;
}

const EMPTY_TRASH_HTML = '<button type="button" data-empty-trash="" title="Permanently delete trash contents">Empty trash</button>';
