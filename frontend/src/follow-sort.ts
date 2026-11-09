/* The follows list's sort dimensions and their default directions. Both the React follows-management page and the legacy first-screen skeleton read this: the skeleton runs before the React bundle loads,
   and which option the sort box shows and which way the direction arrow points must give the same answer as after takeover. */

/** The sort dimensions in the toolbar dropdown. The first four compare creators, the last three compare individual sources. */
export const SORT_OPTIONS = [
  ['checked', 'Check time'], ['added', 'Date added'], ['name', 'Creator name'], ['sources', 'Source count'],
  ['source', 'Source name'], ['provider', 'Site'], ['status', 'State'],
] as const;
export type SortKey = (typeof SORT_OPTIONS)[number][0];
export const DEFAULT_SORT: SortKey = 'checked';

export type SortDir = 'asc' | 'desc';

/** What each column asks by default: time asks "most recent first", names ask "sort from the top". */
export const SORT_DEFAULT_DIR: Record<SortKey, SortDir> = {
  checked: 'desc', added: 'desc', name: 'asc', sources: 'desc',
  source: 'asc', provider: 'asc', status: 'asc',
};

export const isSortKey = (value: unknown): value is SortKey =>
  SORT_OPTIONS.some(([key]) => key === value);

/** Which tier the URL's `sort` / `dir` resolves to: an unrecognized sort falls back to the default, and a missing direction takes that tier's usual one. */
export function resolveFollowSort(sort: unknown, dir: unknown): { sort: SortKey; dir: SortDir } {
  const key = isSortKey(sort) ? sort : DEFAULT_SORT;
  return { sort: key, dir: dir === 'asc' || dir === 'desc' ? dir : SORT_DEFAULT_DIR[key] };
}
