import { describe, expect, it } from 'vitest';
import { unfilteredWallAddress, wallAddress } from '../../src/react/video-wall/wall-route';
import { registerEntityLink } from '../../src/core/entity-links';

describe('Standalone entry for the play wall', () => {
  it('Clears the video condition while keeping the browsing context, sorting, and return URL', () => {
    const filters = new URLSearchParams({ q:'Alice', performer:'Alice', studio:'Studio', tag:'Scenery', tag_match:'all',
      state:'fresh', orient:'vertical', dur_min:'600', region:'jp', jav:'1', loc:'local,115', sort:'new', returnTo:'/performers/71?tag=landscape' });
    const target = new URL(unfilteredWallAddress(`/wall?${filters}`), location.origin);
    expect(Object.fromEntries(target.searchParams)).toEqual({ jav:'1', loc:'local,115', sort:'new', returnTo:'/performers/71?tag=landscape' });
    expect(unfilteredWallAddress('/wall?q=test')).toBe('/wall');
  });
  it('The global entry keeps the return URL; non-video pages use the library scope', () => {
    for (const path of ['/stats?tab=creators','/trash?q=cleanup','/junk-files','/follow?q=posts','/performers?q=name']) {
      const target = new URL(wallAddress(path, { state:'trash',q:'Clean',jav:'1',loc:'local' }), location.origin);
      expect(target.searchParams.get('state')).toBeNull();
      expect(target.searchParams.get('q')).toBeNull();
      expect(target.searchParams.get('tab')).toBeNull();
      expect(target.searchParams.get('jav')).toBe('1');
      expect(target.searchParams.get('loc')).toBe('local');
      const source = new URL(path, location.origin);
      expect(target.searchParams.get('returnTo')).toBe(source.pathname + source.search);
    }
  });
  it('Inherits search and filters while keeping the return address', () => {
    const target = new URL(wallAddress('/?q=test&tag=landscape&loc=local'), location.origin);
    expect(target.pathname).toBe('/wall');
    expect(target.searchParams.get('q')).toBe('test');
    expect(target.searchParams.get('tag')).toBe('landscape');
    expect(target.searchParams.get('returnTo')).toBe('/?q=test&tag=landscape&loc=local');
  });
  it('The entity profile converts to that entity\'s video range', () => {
    for (const [section, kind] of [['performers','performer'],['studios','studio'],['creators','creator'],['series','series']]) {
      const target = new URL(wallAddress(`/${section}/Alice?jav=1`), location.origin);
      expect(target.searchParams.get(kind!)).toBe('Alice');
      expect(target.searchParams.get('jav')).toBe('1');
    }
  });
  it('Keep the state path and the current video filter', () => {
    const target = new URL(wallAddress('/unseen', { loc:'local', tag:'Scenery', jav:'1' }), location.origin);
    expect(target.searchParams.get('state')).toBe('fresh');
    expect(target.searchParams.get('tag')).toBe('Scenery');
    expect(target.searchParams.get('jav')).toBe('1');
  });
  it('Numeric entity URLs are converted to canonical names, and explicit context keeps priority', () => {
    registerEntityLink('performer', 'Alice', 71);
    const target = new URL(wallAddress('/performers/71?jav=1', { tag: 'Scenery' }), location.origin);
    expect(target.searchParams.get('performer')).toBe('Alice');
    expect(target.searchParams.get('returnTo')).toBe('/performers/71?jav=1');
    expect(new URL(wallAddress('/performers/71', { performer: 'Current canonical name' }), location.origin)
      .searchParams.get('performer')).toBe('Current canonical name');
  });
  it('Tag details entering the video wall reuse the tag intersection', () => {
    registerEntityLink('tag', 'Big breasts', 72);
    const target = new URL(wallAddress('/tags/72?tag=cunnilingus'), location.origin);
    expect(target.searchParams.get('tag')).toBe('Big breasts,cunnilingus');
    expect(target.searchParams.get('tag_match')).toBe('all');
  });
});
