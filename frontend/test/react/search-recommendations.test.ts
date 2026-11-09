import { describe, expect, it, vi } from 'vitest';
import { pendingRecommendations, searchRecommendations } from '../../src/react/search/recommendations';

describe('Search image recommendations', () => {
  it('One request fetches all groups: work sources keep their own detail addresses, follow avatars and bylines use the actual publisher', async () => {
    const source = { id: 8, author_key: 'name:author', label: 'Author', ref: 'Author', provider: 'pixiv',
      entity_id: 20, entity_name: 'Author', official_avatar_url: '/avatar-fixture' };
    const request = vi.fn(async (_url: string) => ({
      items: { items: [{ id: 11, name: 'Local video' }] },
      jav: { items: [{ id: 12, asset_id: 12, code: 'ABW-101', performer_refs: [{ id: 15, name: 'Performers', has_image: true }] }] },
      feeds: { items: [{ id: 12, code: 'ABW-102', cover_url: '/release-cover' }] },
      authors: { items: [{ k: 'Author', key: source.author_key, entity_id: 20,
        avatar: '/author-avatar', avatar_fallback: '/author-mirror', latest: '2025-03-04T05:06:07Z' }] },
      latest: { 15: { id: 30, code: 'ABW-099', release_date: '2025-02-01' } },
      words: ['ABW-101', 'Performers'],
      follow: { sources: [source], groups: [{
        primary: { id: 12, source_id: 8, title: 'Followed videos', thumb_url: '/post-cover', media_kind: 'video', status: 'saved' },
        variants: [{ id: 13, source_id: 8, title: 'Image videos', status: 'seen', media_kind: 'image',
          media_items: [{ index: 2, media_kind: 'image', thumb_url: '/photo-cover' }] }], duplicates: [],
      }] },
    }));
    const { groups, words } = await searchRecommendations(request);
    expect(request.mock.calls).toEqual([['/api/search/recommendations']]);
    expect(words).toEqual(['ABW-101', 'Performers']);
    const entry = (kind: string) => groups.find(group => group.kind === kind)!.items[0]!;
    expect(entry('asset').id).toBe(11);
    expect(entry('jav').href).toBe('/assets/12');
    expect(entry('jav').who).toBe('Performers');
    expect(entry('release').href).toBe('/works/ABW-102');
    expect(entry('release').card?.sourceWork).toBe(true);
    expect(entry('post').href).toBe('/posts/12');
    expect(entry('post').who).toBe('Author');
    expect(entry('post').whoAvatarHtml).toContain('/avatar-fixture');
    expect(entry('post').card?.thumb_url).toBe('/post-cover');
    expect(entry('photo').href).toBe('/posts/13');
    expect(entry('photo').mediaIndex).toBe(2);
    expect(entry('photo').followMedia).toBe('images');
    expect(entry('photo').card?.thumb_url).toBe('/photo-cover');
    expect(entry('author').href).toBe('/creators/20');
    expect(entry('author').avatarHtml).toContain('/author-avatar');
    expect(entry('author').avatarHtml).toContain('/author-mirror');
    expect(entry('author').subtitle).toBe('Latest updated at 2025-03-04');
    expect(entry('performer').entity_id).toBe(15);
    expect(entry('performer').subtitle).toBe('Latest release ABW-099 · 2025-02-01');
    // Each group carries its whole pool; “Swap in new picks” pages through the pool.
    expect(groups.find(group => group.kind === 'jav')).toMatchObject({ offset: 0, size: 5 });
    expect(groups.map(group => group.kind)).toEqual(pendingRecommendations().map(group => group.kind));
  });

  it('If the server misses one, only that group is missing; a source without an entity enters its own follow filter', async () => {
    const { groups } = await searchRecommendations(async () => ({
      items: { items: [{ id: 11, name: 'Local video' }] }, jav: null, follow: null, feeds: null,
      authors: { items: [{ k: 'Author', key: 'name:author' }] }, latest: {}, words: [],
    }));
    expect(groups.find(group => group.kind === 'asset')!.items).toHaveLength(1);
    expect(groups.find(group => group.kind === 'jav')!.items).toEqual([]);
    expect(groups.find(group => group.kind === 'post')!.items).toEqual([]);
    expect(groups.find(group => group.kind === 'author')!.items[0]!.href).toBe('/follow?author=name%3Aauthor');
    expect(groups.find(group => group.kind === 'author')!.items[0]!.subtitle).toBe('Updated at unavailable');
    expect(groups.find(group => group.kind === 'performer')!.action).toBe('Subscribe to new releases');
    expect(groups.some(group => group.pending)).toBe(false);
  });
});
