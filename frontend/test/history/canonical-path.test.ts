import { expect, it } from 'vitest';
import { canonicalPath } from '../../src/history/canonical-path';
import { overlayTarget } from '../../src/history/overlay';
import { entityLinkId, entityLinkName, registerResponseEntities } from '../../src/core/entity-links';

it('The three object kinds and queue-compatible addresses keep filters and playback positions', () => {
  expect(canonicalPath('/item/12?t=93')).toBe('/assets/12?t=93');
  expect(canonicalPath('/follow/item/7?media=images')).toBe('/posts/7?media=images');
  expect(canonicalPath('/jav/movie/abp-968?q=x')).toBe('/works/ABP-968?q=x');
  for (const [source, key] of [['mix', 'mix'], ['parts', 'parts'], ['editions', 'editions'], ['playlists', 'playlist']]) {
    expect(canonicalPath(`/${source}/21/22?t=42`)).toBe(`/assets/22?t=42&${key}=21`);
    expect(overlayTarget('/assets/22', `?${key}=21&t=42`)).toEqual({ kind: 'queue', queue: key, key: 21, item: 22 });
  }
  expect(canonicalPath('/api/item?id=12')).toBe('/api/item?id=12');
  expect(canonicalPath('/data-cleanup?edit#resource-sync')).toBe('/data-cleanup/resource-sync?edit');
  expect(canonicalPath('/data-cleanup#libraryProcessing')).toBe('/data-cleanup#libraryProcessing');
  for (const [source, target] of [['activity', 'tasks'], ['scraping', 'sources'],
    ['follow-manage', 'subscriptions'], ['configuration', 'settings/library'], ['diagnostics', 'settings/diagnostics']]) {
    expect(canonicalPath(`/${source}?tab=x`)).toBe(`/${target}?tab=x`);
  }
});

it('Canonical names take precedence over same-named aliases; ambiguous aliases are left to the server', () => {
  registerResponseEntities('/api/entity/shapes', { entities: [
    { kind: 'performer', id: 801, names: ['Canonical Alice', 'Shared Alias'] },
    { kind: 'performer', id: 802, names: ['Canonical Bob', 'Canonical Alice', 'Shared Alias'] },
  ] });
  expect(entityLinkId('performer', 'Canonical Alice')).toBe(801);
  expect(entityLinkId('performer', 'Shared Alias')).toBeUndefined();
  expect(entityLinkName('performer', 802)).toBe('Canonical Bob');
});

it('Entity aliases and renames keep the same ID; non-entity responses take no part in URL registration', () => {
  registerResponseEntities('/api/entity?kind=studio&id=91', { id: 91, kind: 'studio', canonical_name: 'New label', aliases: ['Old label'] });
  expect(entityLinkId('studio', 'Old label')).toBe(91);
  expect(entityLinkName('studio', 91)).toBe('New label');
  expect(() => registerResponseEntities('/api/links', { entities: 210, total: 719 })).not.toThrow();
  expect(entityLinkId('studio', 'Does not exist')).toBeUndefined();
});

it('Invalid and conflicting queue params use plain asset details', () => {
  for (const query of ['?parts=bad', '?parts=0', '?parts=2&playlist=3']) {
    expect(overlayTarget('/assets/22', query)).toEqual({ kind: 'item', id: 22 });
  }
  expect(overlayTarget('/assets/0')).toBeNull();
});

it('The avatar strip, filters, and search completion reuse the entity ID already fetched', () => {
  registerResponseEntities('/api/tops', { performers: [{ id: 991, k: 'Avatar strip people' }] });
  registerResponseEntities('/api/facets', { studios: [{ entity_id: 992, k: 'Filter labels' }] });
  registerResponseEntities('/api/suggest?q=test', { groups: [
    { kind: 'creator', items: [{ entity_id: 993, value: 'Complete the author' }] },
    { kind: 'asset', items: [{ id: 1, value: 'Example video' }] },
  ] });
  expect(entityLinkId('performer', 'Avatar strip people')).toBe(991);
  expect(entityLinkId('studio', 'Filter labels')).toBe(992);
  expect(entityLinkId('creator', 'Complete the author')).toBe(993);
  expect(entityLinkId('asset', 'Example video')).toBeUndefined();
});
