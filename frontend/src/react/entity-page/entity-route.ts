import { entityPath } from '@peach/legacy/core';
import { defaultSortDir, sortFromAddress } from '../../sort-preferences';
import { ENTITY_FILTER_KEYS, type EntityFilters, type EntityMedia } from './entity-page';

export const emptyEntityFilters = (): Record<string, string> => Object.fromEntries(
  ENTITY_FILTER_KEYS.map(key => [key, key === 'sort' ? 'new' : key === 'dir' ? 'desc' : '']));

/** The sort preference only decides addresses without an explicit direction; the profile page's default column is still the time added to library. */
export function parseEntityFilters(search: string, preference: { sort: string; dir: string }): EntityFilters {
  const params = new URLSearchParams(search), filters = emptyEntityFilters();
  for (const key of ENTITY_FILTER_KEYS) if (key !== 'sort' && key !== 'dir') filters[key] = params.get(key) || '';
  return { ...filters, ...sortFromAddress(params.get('sort'), params.get('dir'), preference.sort, preference.dir, 'new') };
}

export function entityFilterSearch(filters: EntityFilters): string {
  const params = new URLSearchParams();
  for (const key of ENTITY_FILTER_KEYS) if (filters[key] && !(key === 'sort' && filters[key] === 'new')
    && !(key === 'dir' && filters[key] === defaultSortDir(filters.sort || ''))) params.set(key, filters[key]);
  return params.toString();
}

export function parseMediaView(search: string): EntityMedia {
  const params = new URLSearchParams(search), set = params.get('set') || '', media = params.get('media');
  return { media: media === 'photos' || media === 'online' ? media : 'videos',
    set: media === 'photos' && /^\d+$/.test(set) ? Number(set) : 0 };
}

export function entityViewSearch(filters: EntityFilters, media?: EntityMedia): string {
  const params = new URLSearchParams(entityFilterSearch(filters));
  if (media?.media === 'photos') {
    params.set('media', 'photos');
    if (media.set) params.set('set', String(media.set));
  } else if (media?.media === 'online') params.set('media', 'online');
  return params.toString();
}

export function entityViewPath(kind: string, name: string, filters: EntityFilters, media?: EntityMedia): string {
  const search = entityViewSearch(filters, media);
  return entityPath(kind, name) + (search ? `?${search}` : '');
}

/** Opening the same person via claim consumes an empty filter; deep links and POP always read the address. */
export function createEntityEntryState() {
  let freshPath = '';
  return {
    fresh(kind: string, name: string): string { freshPath = entityPath(kind, name); return freshPath },
    read(kind: string, name: string, search: string, preference: { sort: string; dir: string }) {
      const fresh = freshPath === entityPath(kind, name) && !search;
      freshPath = '';
      const filters = fresh ? emptyEntityFilters() : { ...parseEntityFilters(search, preference) };
      if (kind === 'creator') filters.creator = '';
      return { filters, media: fresh ? { media: 'videos' as const, set: 0 } : parseMediaView(search) };
    },
  };
}
