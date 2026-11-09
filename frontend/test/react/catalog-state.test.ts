import { describe, expect, it } from 'vitest';

import {
  defaultCatalogLoc, homeCatalogState, homePath, initialCatalogFilters, onlineDefaultLoc,
  resetCatalogFilters, resolveSort,
} from '../../src/react/catalog-grid/catalog-state';

const preferences = { defaultSort: 'new', defaultSortDirection: 'asc' };
const seed = () => 'fresh-seed';
const initial = (pathname = '/', search = '') => initialCatalogFilters({ pathname, search }, preferences, seed);

describe('Catalog URL and default scope', () => {
  it('Release-year multi-select restores from share addresses, and reset clears years', () => {
    const filters = initial('/', '?loc=115&year=2024,none&q=video');
    const address = new URL(homePath(filters), 'https://peach.test');
    expect(initial(address.pathname, address.search).year).toBe('2024,none');
    expect(resetCatalogFilters(filters, preferences, seed).year).toBe('');
    expect(initial('/follow', '?year=2024').year).toBe('');
  });
  it('Filters read only from catalog addresses, while non-catalog addresses can still specify a source range', () => {
    expect(initial('/follow', '?loc=115&tag=blender&owner=none&q=other&sort=rating&seed=foreign')).toMatchObject({
      loc: '115', tag: '', owner: '', q: '', sort: 'new', dir: 'asc', seed: 'fresh-seed',
    });
    expect(initial('/unseen', '?state=later&owner=none&tag=blender&tag_match=any')).toMatchObject({
      state: 'fresh', owner: 'none', tag: 'blender', tag_match: 'any',
    });
    expect(initial('/', '?owner=someone&tag_match=bad')).toMatchObject({ owner: '', tag_match: 'all' });
  });

  it('Catalog addresses override sort preferences, and legacy sort keys plus random direction use the existing parser', () => {
    expect(resolveSort(null, null, preferences)).toEqual({ sort: 'new', dir: 'asc' });
    expect(resolveSort('short', null, preferences)).toEqual({ sort: 'dur', dir: 'asc' });
    expect(resolveSort('short', 'desc', preferences)).toEqual({ sort: 'dur', dir: 'desc' });
    expect(resolveSort('seed', 'asc', preferences)).toEqual({ sort: 'seed', dir: '' });
    expect(resolveSort('unknown', null, preferences, 'rating')).toEqual({ sort: 'rating', dir: 'desc' });
  });

  it('The share URL includes owner=none and a non-default direction, and omits the seed and thumbnail switches', () => {
    const filters = initial('/watch-later', '?loc=115&owner=none&sort=new&dir=asc&seed=old&thumb=1&tag_match=all');
    const path = homePath(filters);
    const address = new URL(path, 'https://peach.test');
    expect(address.pathname).toBe('/watch-later');
    expect(Object.fromEntries(address.searchParams)).toEqual({ loc: '115', owner: 'none', sort: 'new', dir: 'asc' });
    expect(initial(address.pathname, address.search)).toMatchObject({ ...filters, seed: 'fresh-seed', thumb: '0' });
  });

  it('States without their own path use query params, while junk files get a dedicated path', () => {
    expect(homePath({ state: 'trash', sort: 'seed', dir: '', seed: 'private' })).toBe('/?sort=seed&state=trash');
    expect(homePath({ state: 'ads', tag_match: 'all' })).toBe('/junk-files');
    expect(homePath({ state: 'fresh', sort: 'new', dir: 'desc', tag_match: 'any' }))
      .toBe('/unseen?tag_match=any&sort=new');
  });

  it('The default range excludes explicitly offline sources, keeping the original range when everything is offline', () => {
    expect(onlineDefaultLoc('local,115,pikpak', { local: true, '115': false })).toBe('local,pikpak');
    expect(onlineDefaultLoc('local,115', { local: false, '115': false })).toBe('local,115');
    expect(onlineDefaultLoc('', { local: true })).toBe('');
    expect(defaultCatalogLoc('local,115', '?loc=', { '115': false })).toBe('local,115');
    expect(defaultCatalogLoc('', '?loc=', { '115': false })).toBe('');
    expect(defaultCatalogLoc('local,115', '?q=test', { '115': false })).toBe('local');
  });

  it('Reset keeps sources and updates the seed, with the home filter bar and catalog state sharing one object', () => {
    const previous = initial('/flagged', '?loc=pikpak&owner=none&creator=x&region=CN&jav=1&thumb=1');
    const state = resetCatalogFilters(previous, preferences, seed);
    expect(state).toEqual({
      loc: 'pikpak', creator: '', studio: '', owner: '', tag: '', tag_match: 'all', len: '',
      dur_min: '', dur_max: '', orient: '', region: '', year: '', state: '', sort: 'new', dir: 'asc',
      seed: 'fresh-seed', q: '', jav: '', thumb: '0',
      browse: '', folder: '', folder_recursive: '',
    });
    const patch = homeCatalogState(state);
    expect(patch.state).toBe(state);
    expect(patch.barsContext.filters).toBe(state);
    expect(patch.detailReturnBarsContext).toBeNull();
    state.q = 'same-object';
    expect(patch.barsContext.filters.q).toBe('same-object');
    expect(previous.owner).toBe('none');
  });
});
