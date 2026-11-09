import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchFollowRelated, followRelatedGroups, followRelatedReasons } from '../../src/react/follow-detail/follow-related';
import type { FollowDetailData, FollowDetailItem } from '../../src/react/follow-detail/follow-detail';
import type { FollowGroup, FollowItem, FollowPage } from '../../src/react/follow-feed/follow-feed';

afterEach(() => { vi.unstubAllGlobals() });
const item = (id: number, patch: Partial<FollowDetailItem> = {}): FollowDetailItem => ({
  id, title: String(id), status: 'new', provider: 'kemono', source_id: 1, media_kind: 'video', tags: [], ...patch,
});
const group = (shown: FollowItem, duplicates: FollowItem[] = []): FollowGroup =>
  ({ primary: shown, variants: [], duplicates, has_wip: false });
const sources = [{ id: 1, provider: 'kemono', author_key: 'name:kou' }, { id: 2, provider: 'kemono', author_key: 'name:mira' }];
const current: FollowDetailData = { item: item(1, { tags: ['solo'] }), group: group(item(1), [item(2)]), sources, aliases: [] };
const page = (groups: FollowGroup[], extra: Partial<FollowPage> = {}): FollowPage => ({
  groups, sources, counts: {}, facets: {}, offset: 0, has_more: false, ...extra,
});

describe('Follows Continue watching', () => {
  it('Excludes the entire current compilation, duplicate groups, watched, ignored, and different media', () => {
    const rows = [group(item(2)), group(item(3)), group(item(3)), group(item(4, { status: 'seen' })),
      group(item(5, { status: 'ignored' })), group(item(6, { media_kind: 'image' }))];
    expect(followRelatedGroups([page(rows)], current, 'videos', 20).map(row => row.primary.id)).toEqual([3]);
    expect(followRelatedGroups([page(rows)], current, 'images', 20).map(row => row.primary.id)).toEqual([6]);
  });
  it('Same creator first, then sorted by shared tags, honoring the count', () => {
    const rows = [group(item(3, { source_id: 2, tags: ['solo'] })), group(item(4)), group(item(5, { tags: ['solo'] }))];
    expect(followRelatedGroups([page(rows)], current, 'videos', 2).map(row => row.primary.id)).toEqual([5, 4]);
  });
  it('Recommendation reasons cite the same creator and shared tags; rarer tags come first, and author and metadata tags don\'t count', () => {
    const shown: FollowDetailData = { ...current, item: item(1, { tags: ['solo', 'rare', 'pov', 'kou', 'tagme'] }) };
    const rows = [group(item(3, { tags: ['solo', 'pov', 'rare', 'kou', 'tagme'], tag_types: { kou: 'artist', tagme: 'metadata' } })),
      group(item(4, { source_id: 2, tags: ['solo', 'pov'] })),
      group(item(5, { source_id: 2, tags: ['solo'] }))];
    const reason = followRelatedReasons([page(rows)], shown, 'videos');
    expect(rows.map(reason)).toEqual([
      { reasons: ['Same creator'], tags: ['rare', 'pov', 'solo'] },
      { reasons: [], tags: ['pov', 'solo'] },
      { reasons: [], tags: ['solo'] },
    ]);
  });
  it('Mixed media picks its card face by the current view, and watched faces never enter recommendations', () => {
    const mixed = group(item(7, { media_kind: 'image' }), [item(8, { published_at: '2026-10-10', status: 'seen' })]);
    expect(followRelatedGroups([page([mixed])], current, 'videos', 20)).toEqual([]);
    expect(followRelatedGroups([page([mixed])], current, 'images', 20).map(row => row.primary.id)).toEqual([7]);
  });
  it('With enough results for a creator it sends one read carrying the original abort signal', async () => {
    const signal = new AbortController().signal;
    const read = vi.fn(async () => ({ ok: true, json: async () => page([group(item(3))]) }));
    vi.stubGlobal('fetch', read);
    const result = await fetchFollowRelated(current, 'videos', 1, signal);
    expect(result.pages).toHaveLength(1);
    expect(read).toHaveBeenCalledTimes(1);
    const [url, init] = read.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url, 'https://example.invalid').searchParams.get('author')).toBe('name:kou');
    expect(init.signal).toBe(signal);
  });
  it('When one page still lacks same-author results it backfills the library with a read cap', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      return { ok: true, json: async () => page([group(item(1))], { has_more: true }) };
    }));
    await fetchFollowRelated(current, 'videos', 20, new AbortController().signal);
    expect(urls.map(url => new URL(url, 'https://example.invalid').searchParams.get('author'))).toEqual(['name:kou', 'name:kou', null]);
    expect(new URL(urls[1]!, 'https://example.invalid').searchParams.get('offset')).toBe('100');
  });
});
