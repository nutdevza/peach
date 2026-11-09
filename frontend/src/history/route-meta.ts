/* Route metadata (ADR-0031, "React Router shell-stage takeover"): title, sidebar key, management identity and the "Shuffle"
 * behavior, registered by path, the only such table site-wide. The shell's readers (title, sidebar highlight and jumps,
 * management identity, shuffle) all look up here.
 *
 * Application startup and the route tree both read this module directly via `@peach/history`; the management header and the
 * title share the same metadata.
 *
 * Fields: `title` is the label used for document.title; `nav` is the key for the sidebar's `data-nav`; `section` is the
 * management identity, with the first registered entry of the same identity serving as the entry point (data management
 * ranks before duplicates and before sources and credentials); `refresh` is the behavior of the list bar's "Shuffle" on that
 * page: `reopen` reopens itself, `skip` does not participate, and when unset it falls back to the stats page; `reload` is the
 * in-place refetch after a batch write-back, while `reopen` makes the page reopen fully from the current address (index and
 * profile pages). The first registered entry per sidebar key serves as the entry point: the playlists page ranks before the
 * playlists queue.
 *
 * Profile pages register by pattern (`/performers/*`, same as `ENTITY_ROUTES`) with the title taken from the name on the
 * address; the six overlay entries register following `OVERLAY_PATHS` and only accept numeric parameters. `routeMetaOf`
 * checks exact paths first, then overlay paths, then falls back to matching segments after dropping empty ones: a single
 * segment checks that segment's exact path (`/performers/`), more than one finds the pattern by the first segment and the
 * name is the rest joined (readers pass in decoded paths; slashes in the name consume all remaining segments, empty trailing
 * segments do not count). */
import { overlayMatch } from './overlay';
import { entityLinkName } from '../core/entity-links';
import { entityDisplayName } from '../core/entity-names';
import { t } from '../i18n';
import { CLEANUP_CRUMB_PAGES, type CleanupToolPath } from '../cleanup-tools';
import { PREFERENCE_SECTIONS, CONFIGURATION_SECTIONS, REPAIR_CENTER_PATH } from './settings-route';

export interface RouteMeta {
  readonly title?: string;
  readonly nav?: string;
  readonly section?: string;
  readonly refresh?: 'reopen' | 'skip';
  readonly reload?: 'reopen';
}

const ROUTE_ENTRIES = {
  '/settings': { title: 'Settings', refresh: 'skip' },
  ...Object.fromEntries(Object.entries(PREFERENCE_SECTIONS).map(([key, title]) => [`/settings/${key}`, { title, refresh: 'skip' }])),
  ...Object.fromEntries(Object.entries(CONFIGURATION_SECTIONS).map(([key, title]) => [`/settings/${key}`, { title, section: 'configuration', refresh: 'reopen' }])),
  [REPAIR_CENTER_PATH]: { title: 'Repairs and migrations', section: 'configuration', refresh: 'reopen' },
  '/jav': { nav: 'jav', title: 'JAV', refresh: 'reopen' },
  '/stats': { section: 'stats', title: 'Stats' },
  '/taste': { section: 'taste', title: 'Taste', refresh: 'reopen' },
  '/review': { section: 'review', title: 'Manual review', refresh: 'reopen' },
  '/data-cleanup': { section: 'cleanup', title: 'Data management' },
  ...Object.fromEntries(Object.entries(CLEANUP_CRUMB_PAGES).map(([path, title]) => [path, { section: 'cleanup', title, refresh: 'reopen' }])),
  '/duplicates': { section: 'cleanup', title: 'Duplicates', refresh: 'reopen' },
  '/quality-goals': { section: 'quality', title: 'HD version', refresh: 'reopen' },
  '/sources': { section: 'cleanup', title: 'Sources and credentials', refresh: 'reopen' },
  '/subscriptions': { section: 'follow', title: 'Manage follows', refresh: 'skip' },
  '/settings/library': { section: 'configuration', title: 'Peach configuration', refresh: 'reopen' },
  '/tasks': { section: 'activity', title: 'Task center', refresh: 'reopen' },
  // A legacy direct address, rewritten to the data management page's anchor; it has no admin identity of its own.
  '/resource-sync': { title: 'Data management' },
  '/performers': { nav: 'performers', title: 'Artists', reload: 'reopen' },
  '/creators': { title: 'Sellers', reload: 'reopen' },
  '/studios': { nav: 'studios', title: 'Labels', reload: 'reopen' },
  '/agencies': { title: 'Agency', reload: 'reopen' },
  '/series': { nav: 'studios', title: 'Series', reload: 'reopen' },
  '/tags': { nav: 'tags', title: 'Tags', reload: 'reopen' },
  '/performers/*': { reload: 'reopen' },
  '/studios/*': { reload: 'reopen' },
  '/creators/*': { reload: 'reopen' },
  '/series/*': { reload: 'reopen' },
  '/agencies/*': { reload: 'reopen' },
  '/tags/*': { reload: 'reopen' },
  '/playlists': { nav: 'playlists', title: 'Playlists', refresh: 'reopen' },
  // Redrawing the follows page fetches card faces online; 'shuffle' is triggered only by the page's own button.
  '/follow': { nav: 'follow', title: 'Follows', refresh: 'skip' },
  // 目录：首页的标签按栏目取（`homeRouteLabel`），三个筛选态与垃圾文件的侧栏键与标签同 `STATE_ROUTES`、`STATE_LABELS`。
  '/': {},
  '/unseen': { nav: 'fresh', title: 'Not watched' },
  '/watch-later': { nav: 'later', title: 'Watch later' },
  '/flagged': { nav: 'flagged', title: 'Marked' },
  '/junk-files': { nav: 'ads', title: 'Junk files' },
  '/trash': { section: 'trash', title: t('navigation:manage.trash') },
  // Coverage: details, the four queues and follows details. The volume and edition queues have no tabs of their own.
  '/assets/:id': { title: 'Media records' },
  '/works/:code': { nav: 'jav', title: 'JAV videos' },
  '/posts/:id': { title: 'Follows' },
  // Immersive mode joins the page group; it does not count as an overlay.
  '/immerse': { nav: 'immerse', title: 'Immersive mode' },
  '/wall': { nav: 'wall', title: 'Playback wall' },
} satisfies Readonly<Record<string, RouteMeta>>;

export type RegisteredRoutePath = keyof typeof ROUTE_ENTRIES
  | `/settings/${keyof typeof PREFERENCE_SECTIONS | keyof typeof CONFIGURATION_SECTIONS}`
  | CleanupToolPath;
export const ROUTE_META: Readonly<Record<string, RouteMeta>> = ROUTE_ENTRIES;

/** Metadata registered for this path; `null` when nothing is registered. */
export function routeMetaOf(path: string): RouteMeta | null {
  if (Object.hasOwn(ROUTE_META, path)) return ROUTE_META[path]!;
  const overlay = overlayMatch(path);
  if (overlay) return ROUTE_META[overlay.path]!;
  const [segment, ...rest] = path.split('/').filter(Boolean);
  if (!segment) return null;
  if (!rest.length) return Object.hasOwn(ROUTE_META, `/${segment}`) ? ROUTE_META[`/${segment}`]! : null;
  const pattern = `/${segment}/*`;
  const kinds: Record<string, string> = { performers: 'performer', studios: 'studio', creators: 'creator', agencies: 'agency', series: 'series', tags: 'tag' };
  const name = /^\d+$/.test(rest.join('/')) ? entityLinkName(kinds[segment] || '', Number(rest[0])) : rest.join('/');
  return Object.hasOwn(ROUTE_META, pattern) ? { ...ROUTE_META[pattern], title: name ? entityDisplayName(kinds[segment] || '', name) : 'Profile' } : null;
}
