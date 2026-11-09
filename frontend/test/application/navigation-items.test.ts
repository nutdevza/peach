import { describe, expect, it } from 'vitest';
import { getManageMenuSections, NAV_CATALOG, SIDEBAR_ITEMS } from '../../src/application/navigation-items';
import { DEFAULT_SIDEBAR_ORDER, normalizeSidebarOrder } from '../../src/sidebar';

describe('Apply the nav vocabulary', () => {
  it('Follows\' next item is immersive mode, and optional entries never crowd the default visible order', () => {
    const keys = SIDEBAR_ITEMS.map(([key]) => key);
    expect(keys.slice(keys.indexOf('follow'), keys.indexOf('follow') + 2)).toEqual(['follow', 'immerse']);
    expect(normalizeSidebarOrder([])).toEqual(DEFAULT_SIDEBAR_ORDER);
    expect(DEFAULT_SIDEBAR_ORDER).not.toContain('immerse');
    expect(NAV_CATALOG.map(([key]) => key)).toContain('immerse');
  });

  it('Each navigation identity has one entry, and follow updates and follow management carry their own visible names', () => {
    const keys = NAV_CATALOG.map(([key]) => key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(NAV_CATALOG.find(([key]) => key === 'follow')?.[1]).toBe('关注');
    expect(NAV_CATALOG.find(([key]) => key === 'follow-manage')?.[1]).toBe('关注管理');
  });

  it('The configuration entry appears in the manage menu only on configurable machines, leaving every other entry\'s order alone', () => {
    const enabled = getManageMenuSections(true), locked = getManageMenuSections(false);
    expect(enabled.some(([key]) => key === 'configuration')).toBe(true);
    expect(locked.some(([key]) => key === 'configuration')).toBe(false);
    expect(enabled.filter(([key]) => key !== 'configuration')).toEqual(locked);
  });
});
