import { describe, expect, it } from 'vitest';
import { DEFAULT_SIDEBAR_ORDER, normalizeSidebarOrder, sidebarTagCounts, sidebarHasCatalogContent } from '../src/sidebar';

describe('Sidebar order', () => {
  it('Accepts legacy keys, dedupes, and drops entries this version does not have', () => {
    expect(normalizeSidebarOrder(['', 'ads', 'dupes', 'tags', 'tags', 'nope', 'trash'])).toEqual(['', 'data-cleanup', 'tags', 'trash']);
  });
  it('An unreadable order or an empty one falls back to default, never sharing the default\'s array', () => {
    for (const value of [null, 'tags', [], ['nope'], [1, 2]]) expect(normalizeSidebarOrder(value)).toEqual(DEFAULT_SIDEBAR_ORDER);
    expect(normalizeSidebarOrder(null)).not.toBe(DEFAULT_SIDEBAR_ORDER);
  });
});

describe('Sidebar content range', () => {
  it('The video collection offers library filters; management and index pages offer only navigation', () => {
    for (const path of ['/', '/unseen', '/trash', '/assets/1', '/creators/Demo', '/assets/2?parts=1'])
      expect(sidebarHasCatalogContent(path)).toBe(true);
    for (const path of ['/subscriptions', '/stats', '/follow', '/tags', '/data-cleanup', '/creators'])
      expect(sidebarHasCatalogContent(path)).toBe(false);
  });

  it('Only the current content\'s tags count; empty content has none', () => {
    expect(sidebarTagCounts([{tags: ['a', 'a', 'b']}, {tags: ['b']}, {}]))
      .toEqual([['b', 2], ['a', 1]]);
    expect(sidebarTagCounts([])).toEqual([]);
  });
});
