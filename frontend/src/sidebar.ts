/* The eight entries the sidebar gives by default and their order. After home comes follows first: it is the screen with
   something new every day; JAV is the main library's most-used browse mode and ranks before the three indexes (performers,
   tags, labels); marked is for coming back to find things, and management sits last. Playlists and immersive mode are off by
   default: both are actions started from a video or an index, and a resident cell would cost a skip every time. People who
   want them add them back in settings; the keys remain in the shell's `NAV_CATALOG`. The two lists are compared word for word
   against the same-named constants in `src/peach/web_settings.py` (test_web_settings.py). */
export const DEFAULT_SIDEBAR_ORDER: readonly string[] = ['', 'follow', 'jav', 'performers', 'tags', 'studios', 'flagged', 'manage'];
export const OPTIONAL_SIDEBAR_KEYS: readonly string[] = ['playlists', 'immerse', 'stats', 'review', 'data-cleanup', 'trash', 'follow-manage', 'quality'];
const KNOWN_SIDEBAR_KEYS = new Set([...DEFAULT_SIDEBAR_ORDER, ...OPTIONAL_SIDEBAR_KEYS]);
/* The junk files and duplicate files pages merged into data management; old saved keys are migrated to it. */
const sidebarKeyAlias = (key: string) => (key === 'ads' || key === 'dupes' ? 'data-cleanup' : key);

/** 当前可见入口按默认次序重排，额外入口接在其后。 */
export function resetSidebarOrder(order: readonly string[]): string[] {
  return [...DEFAULT_SIDEBAR_ORDER.filter(key => order.includes(key)),
    ...order.filter(key => !DEFAULT_SIDEBAR_ORDER.includes(key))];
}

/** The sidebar order read from this machine or the database: recognize old keys, deduplicate, drop entries this version does not have; when nothing remains, return to the default order. */
export function normalizeSidebarOrder(value: unknown): string[] {
  const keys = Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [];
  const order = [...new Set(keys.map(sidebarKeyAlias))].filter((key) => KNOWN_SIDEBAR_KEYS.has(key));
  return order.length ? order : [...DEFAULT_SIDEBAR_ORDER];
}

/** Sidebar filters belong to the content set the current address maps to; sidebars on other pages are navigation only. */
export function sidebarHasCatalogContent(path: string): boolean {
  return ['/', '/unseen', '/watch-later', '/flagged', '/trash', '/junk-files'].includes(path)
    || /^\/assets\//.test(path)
    || /^\/(performers|studios|creators|series|agencies|tags)\/.+/.test(path);
}

/** A content's same-named tag counts once. The caller passes in the media actually on display. */
export function sidebarTagCounts(items: { tags?: string[] }[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of new Set(item.tags || [])) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 30);
}
