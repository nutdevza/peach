/* The catalog sort vocabulary: which columns exist, how each column's directions are worded, and how old keys map to new keys. The shell's URL parsing, the filter bar's sort buttons, and
 *  startup settings normalization (`appearance/settings.ts`) all read this one source. */

/** `[key, display name]`. Random comes first: it is the factory default and has no direction. */
export const SORTS: readonly (readonly [key: string, label: string])[] = [
  ['seed', 'Random'], ['rating', 'Rating'], ['o', 'Climax count'], ['plays', 'Watch count'], ['dur', 'Duration'],
  ['size', 'Size'], ['new', 'Date added'], ['played', 'Watch time'],
];
/** The column that appears only in the JAV context. */
export const JAV_RELEASE_SORT: readonly [key: string, label: string] = ['release', 'Release date'];
export const SORT_KEYS: readonly string[] = [...SORTS, JAV_RELEASE_SORT].map(([key]) => key);

/** The two direction labels for `[desc, asc]`. */
export type SortDirWords = Readonly<Record<string, readonly [desc: string, asc: string]>>;

/* Direction words are defined per column: the same desc is "newest to oldest" on the date column and "longest to shortest" on duration;
   a generic "descending" makes the UI explain SQL. The array is [desc,asc], which in the table means this column is flippable. */
export const SORT_DIR_WORDS: SortDirWords = {
  rating: ['Highest first', 'Lowest first'], o: ['Most first', 'Fewest first'],
  plays: ['Most first', 'Fewest first'], dur: ['Longest first', 'Shortest first'], size: ['Largest first', 'Smallest first'],
  new: ['Newest first', 'Oldest first'], played: ['Closest first', 'Farthest first'], release: ['Newest first', 'Oldest first'],
};

/* Old keys are kept: the URL, bookmarks and settings store values with the direction baked into the key name. Direction is now expressed separately by `dir`,
   and the two duration keys collapse into one dur; an unrecognized old key does not error, it silently switches to a different sort. */
export const SORT_ALIASES: Readonly<Record<string, readonly [sort: string, dir: 'asc' | 'desc']>> = {
  big: ['size', 'desc'], short: ['dur', 'asc'], long: ['dur', 'desc'],
};

/* The vocabulary is swappable: the follows page sorts online updates with different columns (only it has the popularity column), but "click an unselected key to switch columns,
   click the selected one to flip direction" and how the arrow draws are identical on both pages. Passing the table in keeps these three functions from being written twice. */
export const sortDirWord = (key: string, dir: string, words: SortDirWords = SORT_DIR_WORDS): string =>
  (words[key] || [])[dir === 'asc' ? 1 : 0] || '';

/** A column's default direction: flippable columns start at desc, directionless columns like random are an empty string. */
export const defaultSortDir = (key: string, words: SortDirWords = SORT_DIR_WORDS): string => (words[key] ? 'desc' : '');

/* Clicking an unselected column switches to it with its default direction; clicking the selected one flips direction. Random has no direction, and clicking it again
   does nothing; shuffling belongs to the button beside it. */
export function nextSortState(
  key: string, current: string, dir: string, words: SortDirWords = SORT_DIR_WORDS,
): { sort: string; dir: string } | null {
  if (key !== current) return { sort: key, dir: defaultSortDir(key, words) };
  if (!words[key]) return null;
  return { sort: key, dir: dir === 'asc' ? 'desc' : 'asc' };
}

/** When the home page specifies no orientation, use the browse preference; an explicit URL always wins. */
export function preferredDirection(sort: string, preferredSort: string, direction: unknown): string {
  return sort === 'seed' ? '' : sort === preferredSort && direction === 'asc' ? 'asc' : 'desc';
}

/** The address's `sort` and `dir` resolve in one pass into column and direction. Legacy keys carry their own direction; an explicit `dir` wins; a column without a direction takes that column's
 *  default direction (exactly what catalog addresses omit); neither written follows the browsing preference. Random has no direction. Unrecognized columns become `fallback`. */
export function sortFromAddress(
  rawSort: string | null, rawDir: string | null, preferredSort: string, direction: unknown, fallback = preferredSort,
): { sort: string; dir: string } {
  const alias = rawSort ? SORT_ALIASES[rawSort] : undefined;
  const key = alias ? alias[0] : rawSort;
  const sort = key && SORT_KEYS.includes(key) ? key : fallback;
  if (!SORT_DIR_WORDS[sort]) return { sort, dir: '' };
  const dir = rawDir === 'asc' || rawDir === 'desc' ? rawDir
    : alias ? alias[1] : rawSort ? 'desc' : preferredDirection(sort, preferredSort, direction);
  return { sort, dir };
}
