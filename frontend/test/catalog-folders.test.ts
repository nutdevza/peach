import { describe, expect, it } from 'vitest';
import { folderHref } from '../src/react/catalog-folders/catalog-folders';
import { homePath, initialCatalogFilters, resetCatalogFilters } from '../src/react/catalog-grid/catalog-state';

describe('Folder browse address', () => {
  it('The catalog range keeps home filters and can return to all videos', () => {
    const address = { pathname: '/watch-later', search: '?tag=Drama&sort=name&loc=local' };
    const selected = folderHref(address, { browse: 'folders', folder: 'directory-id' });
    const parsed = new URL(selected, 'https://example.test');
    expect(parsed.searchParams.get('tag')).toBe('Drama');
    expect(parsed.searchParams.get('sort')).toBe('name');
    expect(parsed.pathname).toBe('/watch-later');
    const exited = folderHref(parsed, { browse: null, folder: null });
    expect(new URL(exited, parsed).searchParams.has('folder')).toBe(false);
  });
  it('Deep links restore directory and subdirectory scopes; the home reset clears the directory', () => {
    const state = initialCatalogFilters({ pathname: '/', search: '?folder=directory-id&folder_recursive=0' }, { defaultSort: 'random' }, () => 'seed');
    expect(state.browse).toBe('folders');
    expect(state.folder_recursive).toBe('0');
    expect(homePath(state)).toContain('folder=directory-id');
    expect(resetCatalogFilters(state, { defaultSort: 'random' }, () => 'next').folder).toBe('');
  });
});
