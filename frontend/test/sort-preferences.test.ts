import { expect, it } from 'vitest';

import {
  defaultSortDir, JAV_RELEASE_SORT, nextSortState, preferredDirection, SORT_ALIASES, SORT_KEYS, sortDirWord, SORTS,
} from '../src/sort-preferences';

it('Random carries no direction, and home preference parses apart from other sorts', () => {
  expect(preferredDirection('seed', 'seed', 'asc')).toBe('');
  expect(preferredDirection('new', 'new', 'asc')).toBe('asc');
  expect(preferredDirection('rating', 'new', 'asc')).toBe('desc');
});

it('Flippable columns start from desc; random has no direction; release date appears only in JAV context but is still a valid key', () => {
  expect([defaultSortDir('new'), defaultSortDir('seed'), defaultSortDir('unknown')]).toEqual(['desc', '', '']);
  expect(SORT_KEYS).toEqual(['seed', 'rating', 'o', 'plays', 'dur', 'size', 'new', 'played', 'release']);
  expect([sortDirWord('dur', 'asc'), sortDirWord('dur', 'desc'), sortDirWord('seed', 'asc')]).toEqual(['Shortest first', 'Longest first', '']);
  /* Column names stay neutral and each column phrases direction in its own words: the same desc means "newest to oldest" on the date column and "longest to shortest" on duration. */
  expect([...SORTS.map(([, label]) => label), JAV_RELEASE_SORT[1]])
    .toEqual(['Random', 'Rating', 'Climax count', 'Watch count', 'Duration', 'Size', 'Date added', 'Watch time', 'Release date']);
  expect(['new', 'played'].map((key) => [sortDirWord(key, 'desc'), sortDirWord(key, 'asc')]))
    .toEqual([['Newest first', 'Oldest first'], ['Closest first', 'Farthest first']]);
});

it('Legacy keys that baked direction into the key name still read from addresses and bookmarks', () => {
  expect(SORT_ALIASES).toEqual({ big: ['size', 'desc'], short: ['dur', 'asc'], long: ['dur', 'desc'] });
});

it('Clicking an unselected item switches the column with the default direction, clicking the selected item flips the direction, and under random sort repeated clicks do nothing', () => {
  expect(nextSortState('rating', 'new', 'asc')).toEqual({ sort: 'rating', dir: 'desc' });
  expect(nextSortState('new', 'new', 'desc')).toEqual({ sort: 'new', dir: 'asc' });
  expect(nextSortState('new', 'new', 'asc')).toEqual({ sort: 'new', dir: 'desc' });
  expect(nextSortState('seed', 'seed', '')).toBeNull();
  /* A different word list means another page's sort: the heat column is only toggleable on the follows page. */
  const words = { heat: ['Hot to cold', 'Cold to hot'] } as const;
  expect(nextSortState('heat', 'heat', 'desc', words)).toEqual({ sort: 'heat', dir: 'asc' });
  expect(nextSortState('new', 'heat', 'desc', words)).toEqual({ sort: 'new', dir: '' });
});
