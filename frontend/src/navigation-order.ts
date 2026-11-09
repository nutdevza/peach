/** 导航保存稳定 ID；显示名称、默认次序与固定首项集中维护。 */
export const NAVIGATION_GROUPS = {
  review: { label: 'Review classification', items: [
    ['metadata_fields', 'Metadata fields'], ['creator_tags', 'Creator tags'], ['code_creators', 'Code directory questionable'],
    ['western_identity', 'Western identity backfill'], ['performer_avatars', 'Performer avatars'], ['studio_logos', 'Label logo'],
    ['fc2_markings', 'FC2 comment marks'], ['fc2_similarity', 'FC2 cross-code similarity'], ['video_endcards', 'End credits / source evidence'],
  ] },
  configuration: { label: 'Peach configuration', items: [
    ['library', 'Library and imports'], ['sources', 'Sources and subscriptions'], ['downloads', 'Download channels'],
    ['network', 'Network & access'], ['maintenance', 'App and maintenance'], ['diagnostics', 'System diagnostics'],
  ] },
  favorites: { label: 'My favorites', items: [
    ['all', 'All'], ['filters', 'Saved filters'], ['performer', 'Artists'], ['creator', 'Creators'],
    ['tag', 'Tags'], ['series', 'Series'], ['studio', 'Studios and labels'], ['agency', 'Agency'],
  ] },
  jav: { label: 'JAV section', items: [['library', 'Library'], ['wants', 'Want'], ['releases', 'New work'], ['discover', 'Discover']] },
  follow: { label: 'Manage follows', items: [['list', 'Follows list'], ['add', 'Add follow'], ['tags', 'Manage tags']] },
  tags: { label: 'Tag vocabulary', items: [['local', 'Local'], ['online', 'Online']] },
  preferences: { label: 'Personal settings', items: [
    ['appearance', 'Appearance & navigation'], ['browsing', 'Browsing & playback'], ['jav', 'JAV & new releases'],
    ['search', 'Search & recommendations'], ['content', 'Content display'],
  ] },
} as const;

export type NavigationGroup = keyof typeof NAVIGATION_GROUPS;
export type NavigationOrders = Partial<Record<NavigationGroup, string[]>>;
export const navigationDefaults = (group: NavigationGroup): string[] => NAVIGATION_GROUPS[group].items.map(([key]) => key);
export const navigationFixedKeys = (group: NavigationGroup | undefined): readonly string[] => group === 'favorites' ? ['all'] : [];

export function normalizeNavigationOrder(group: NavigationGroup, value: unknown): string[] {
  const defaults = navigationDefaults(group);
  const keys = Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string' && defaults.includes(key)) : [];
  return [...new Set([...navigationFixedKeys(group), ...keys, ...defaults])];
}

export function normalizeNavigationOrders(raw: unknown): NavigationOrders {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const saved = raw as Record<string, unknown>;
  return Object.fromEntries((Object.keys(NAVIGATION_GROUPS) as NavigationGroup[])
    .filter(group => Array.isArray(saved[group]))
    .map(group => [group, normalizeNavigationOrder(group, saved[group])]));
}
