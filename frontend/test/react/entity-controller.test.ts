import { describe, expect, it, vi } from 'vitest';
import { createEntityController, type EntityContext, type EntityControllerPorts } from '../../src/react/entity-page/entity-controller';
import { createEntityLoading } from '../../src/react/entity-page/entity-loading';
import type { EntityPageHelpers } from '../../src/react/entity-page/entity-page';
import { entityPortraitImg } from '../../src/react/entity-page/entity-portrait';
import { createEntityEntryState, emptyEntityFilters, entityFilterSearch, entityViewPath, parseEntityFilters, parseMediaView } from '../../src/react/entity-page/entity-route';
import { createPhotoSurfaceController, photoViewActive } from '../../src/react/entity-page/photo-surface';
import { createIndexController, indexPath, personAvatar } from '../../src/react/index/index-controller';
import type { FollowFeedActions, FollowFeedHelpers } from '../../src/react/follow-feed/follow-feed';

const followHelpers: FollowFeedHelpers = { workMark: () => '', tagLabel: tag => tag, wireDrag: vi.fn(), wireScroller: vi.fn(),
  listSkeletonHtml: () => '', jobProgress: vi.fn() };
const followActions: FollowFeedActions = { route: vi.fn(), shuffle: vi.fn(), loaded: vi.fn(), openDetail: vi.fn(), openAuthor: vi.fn(),
  toggleSelection: vi.fn(), setImagesOnly: vi.fn(), setPhotoLayout: vi.fn(), canFlip: () => true, toast: vi.fn(),
  failure: vi.fn(), checkReport: vi.fn() };
const helpers: EntityPageHelpers = { portraitImg: entityPortraitImg, wireDrag: vi.fn(), wireScroller: vi.fn(), wireFeedRow: vi.fn(),
  feedRowHtml: () => '', receipt: vi.fn(), failure: vi.fn(), aliasForm: async () => {}, sourceToolsHtml: () => '',
  wireSourceTools: vi.fn(), comboItems: () => [], sortKeys: () => [] };
const preference = { sort: 'rating', dir: 'asc' };

function setup() {
  let context: EntityContext | null = { kind: 'creator', name: 'Alpha', filters: { ...emptyEntityFilters(), tag: 'one' } };
  let seed = '7', live = true, current = true, photos = false;
  const ports: EntityControllerPorts = {
    context: () => context, live: () => live, current: () => current, route: vi.fn(), suffix: () => '?media=online#works',
    restoreHomeContext: vi.fn(), releaseBodyPreviews: vi.fn(), push: vi.fn(), state: () => ({ seed, jav: false }),
    preferences: () => ({ revision: 3, feedRevision: 2, photoSize: 'small', photoLayout: 'fixed', followImagesOnly: false,
      javLayout: 'cover', javLayouts: [], photoLayouts: [], states: [], peopleLayout: 'compact',
      layout: { active: true, size: 'small', portrait: false, javImage: 'cover' }, selectMode: true, selected: new Set([11]),
      seekSeconds: 6, groupCollapse: false, wireDrag: vi.fn(), skeletonHtml: () => '', canLoadMore: () => true,
      follow: { helpers: followHelpers, actions: followActions } }),
    changeFilter: change => { const filters = { ...context?.filters }; change(filters); if (context) context = { ...context, filters } },
    rollSeed: () => '31', writeSeed: value => { seed = value }, setJavLayout: vi.fn(), javLayout: () => 'poster',
    setPhotoLayout: vi.fn(), syncPhotoWalls: vi.fn(), openEntity: vi.fn(), photoViewActive: () => photos,
    recordPainted: (_view, wall) => { photos = wall }, syncDensity: vi.fn(), scheduleSticky: vi.fn(),
    releasePage: vi.fn(), showMissing: vi.fn(), dropBars: vi.fn(),
  };
  const delegated = { toggleTag: vi.fn(), openFollowAuthor: vi.fn(), javContext: vi.fn() };
  return { ports, controller: createEntityController(ports, helpers, delegated),
    context: (value: EntityContext | null) => { context = value },
    live: (value: boolean) => { live = value }, current: (value: boolean) => { current = value } };
}

describe('Entity and index domain control', () => {
  it('Sort parses from address and preference with the default omitted, and galleries accept a numeric set only in photo view', () => {
    expect(parseEntityFilters('?sort=short', preference)).toMatchObject({ sort: 'dur', dir: 'asc' });
    expect(parseEntityFilters('', { sort: 'new', dir: 'asc' })).toMatchObject({ sort: 'new', dir: 'asc' });
    expect(entityFilterSearch(emptyEntityFilters())).toBe('');
    expect(parseMediaView('?media=photos&set=12')).toEqual({ media: 'photos', set: 12 });
    expect(parseMediaView('?media=photos&set=-1')).toEqual({ media: 'photos', set: 0 });
    expect(parseMediaView('?media=online&set=12')).toEqual({ media: 'online', set: 0 });
    expect(entityViewPath('creator', 'A/B', emptyEntityFilters(), { media: 'photos', set: 12 }))
      .toBe('/creators/A%2FB?media=photos&set=12');
  });

  it('Entering with an empty filter consumes the marker once; back and deep links read the URL; a creator page does not stack a creator filter on itself', () => {
    const entry = createEntityEntryState();
    expect(entry.fresh('creator', 'Alpha')).toBe('/creators/Alpha');
    expect(entry.read('creator', 'Alpha', '', preference).filters).toEqual(emptyEntityFilters());
    expect(entry.read('creator', 'Alpha', '?creator=Beta&tag=one&media=online', preference))
      .toMatchObject({ filters: { creator: '', tag: 'one' }, media: { media: 'online', set: 0 } });
    entry.fresh('performer', 'Alpha');
    entry.read('performer', 'Beta', '', preference);
    expect(entry.read('performer', 'Alpha', '?sort=short', preference).filters.sort).toBe('dur');
  });

  it('route pushes only the current entity, POP does not write the URL, and props use the current seed and preferences', () => {
    const { controller, ports, live } = setup(), filters = emptyEntityFilters();
    expect(controller.route('creator', 'Alpha', filters, { media: 'online', set: 0 }, { push: false })).toBe(true);
    expect(ports.route).not.toHaveBeenCalled();
    expect(ports.push).toHaveBeenCalledWith({ filters, media: { media: 'online', set: 0 }, seed: '7', jav: false });
    live(false);
    vi.mocked(ports.push).mockClear();
    expect(controller.route('creator', 'Alpha', filters)).toBe(false);
    expect(ports.route).toHaveBeenCalledWith('/creators/Alpha');
    expect(ports.push).not.toHaveBeenCalled();
    const props = controller.props('creator', 'Alpha', filters, { media: 'videos', set: 0 });
    expect(props).toMatchObject({ revision: 3, photoSize: 'small', seed: '7', jav: false, filters });
  });

  it('The same action object reads filters live; shuffle writes the seed; rename keeps the query; avatar refresh invalidates the top bar cache', () => {
    const { controller, ports, context } = setup(), actions = controller.actions('creator', 'Alpha');
    expect(controller.actions('creator', 'Alpha')).toBe(actions);
    context({ kind: 'creator', name: 'Alpha', filters: { ...emptyEntityFilters(), sort: 'rating', dir: 'desc', tag: 'two' } });
    actions.setSort('rating');
    expect(ports.push).toHaveBeenLastCalledWith(expect.objectContaining({ filters: expect.objectContaining({ dir: 'asc', tag: 'two' }) }));
    expect(actions.reshuffleVideos()).toBe('31');
    expect(ports.push).toHaveBeenLastCalledWith(expect.objectContaining({ seed: '31' }));
    actions.openEntity('creator', 'Beta', true);
    expect(ports.route).toHaveBeenLastCalledWith('/creators/Beta?media=online#works', true);
    actions.avatarChanged();
    expect(ports.dropBars).toHaveBeenCalledOnce();
  });

  it('Density syncs only when entering and leaving photo view, and the missing microtask for unmounted hosts is a no-op', async () => {
    const { controller, ports, current } = setup(), actions = controller.actions('creator', 'Alpha');
    actions.painted('photos', true); actions.painted('photos', true); actions.painted('videos', false);
    expect(ports.syncDensity).toHaveBeenCalledTimes(2);
    expect(ports.scheduleSticky).toHaveBeenCalledTimes(3);
    actions.missing(); current(false);
    await Promise.resolve();
    expect(ports.releasePage).not.toHaveBeenCalled();
    current(true); actions.missing();
    await Promise.resolve();
    expect(ports.showMissing).toHaveBeenCalledWith('creator');
  });

  it('The target skeleton shows immediately, while async rosters and reread receipts respect the page\'s right to cancel', async () => {
    let resolveWait = () => {}, resolveLoad = () => {}, current = true;
    const wait = new Promise<void>(resolve => { resolveWait = resolve });
    const load = new Promise<void>(resolve => { resolveLoad = resolve });
    const ports = { shapesReady: () => false, waitShapes: () => wait, paintSkeleton: vi.fn(), resetView: vi.fn(),
      loadShapes: () => load, syncParts: vi.fn() };
    const loading = createEntityLoading(ports);
    const first = loading('creator', 'Alpha', () => current);
    expect(ports.paintSkeleton).toHaveBeenCalledWith('creator', 'Alpha');
    current = false; resolveWait(); await first;
    expect(ports.syncParts).not.toHaveBeenCalled();
    current = true; await loading('creator', 'Beta', () => current);
    expect(ports.paintSkeleton).toHaveBeenCalledWith('creator', 'Beta');
    expect(ports.syncParts).toHaveBeenCalledExactlyOnceWith('creator', 'Beta');
    current = false; resolveLoad(); await Promise.resolve();
    expect(ports.syncParts).toHaveBeenCalledTimes(1);
  });

  it('Index addresses write only applicable dimensions, and online author jumps collapse the index before writing the follow target', () => {
    expect(indexPath({ kind: 'studios', q: 'A / B', scope: 'online', view: 'cloud', category: 'all' }))
      .toBe('/studios?q=A+%2F+B');
    expect(indexPath({ kind: 'tags', q: '', scope: 'online', view: 'alphabet', category: 'artist' }))
      .toBe('/tags?view=alphabet&scope=online&category=artist');
    const calls: string[] = [];
    const ports = { route: vi.fn(), followView: () => ({ status: '' as const, media: 'videos' as const, author: '', provider: '',
      work: 'old', tags: [], durMin: 0, durMax: 0, sort: 'new' as const, dir: 'desc' as const, seed: 7 }),
    adoptFollowView: vi.fn(), hideIndex: () => { calls.push('hide') }, openPage: (path: string) => { calls.push(path) } };
    createIndexController(ports).openFollowAuthor('Alpha');
    expect(calls).toEqual(['hide', '/follow?author=Alpha']);
    expect(ports.adoptFollowView).toHaveBeenCalledWith(expect.objectContaining({ work: '' }));
  });

  it('Companies do not use a representative work as avatar; the person placeholder note and edition stay, and creators fall back to follow avatars', () => {
    const person = { k: 'Alpha', n: 1, id: 3, has_avatar: true, rep: 9, avatar_stand_in: true };
    expect(personAvatar(person, 'studio', true).html).not.toContain('/avatar');
    expect(personAvatar(person, 'creator', false).html).toContain('Representative work, not the performer');
    const host = document.createElement('div');
    host.innerHTML = personAvatar({ ...person, has_image: true, image_version: 'v 2' }, 'creator', false).html;
    expect(new URL(host.querySelector('img')!.src).searchParams.get('v')).toBe('v 2');
    const entity = { id: 3, canonical_name: 'Alpha', asset_count: 0, has_avatar: true, representative_asset_id: 9 };
    expect(entityPortraitImg('studio', entity)).toBe('');
    expect(entityPortraitImg('creator', { ...entity, has_avatar: false,
      follow: { key: 'k', n: 1, providers: [], avatar: 'https://example.test/a', avatar_fallback: 'https://example.test/b', held: [] } }))
      .toContain('referrerpolicy="no-referrer"');
  });

  it('The async photo wall keeps photo density before entering the DOM, and size sync only pushes the preference without replacing nodes', () => {
    const fallback = vi.fn(() => false);
    expect(photoViewActive({ entityWall: true, entityCurrent: true, indexVisible: true, pathname: '/creators/Alpha',
      followMedia: 'videos', statsVisible: false }, fallback)).toBe(true);
    expect(fallback).not.toHaveBeenCalled();
    const wall = document.createElement('div'), child = document.createElement('img'); wall.append(child);
    const ports = { preferences: () => ({ size: 'big' as const, layout: 'masonry' as const, imagesOnly: true }),
      walls: () => [wall], pushEntity: vi.fn(), pushFollow: vi.fn(), syncDensity: vi.fn(), storeSize: vi.fn() };
    createPhotoSurfaceController(ports).setSize('big');
    expect(wall.firstChild).toBe(child);
    expect(wall.dataset).toMatchObject({ size: 'big', layout: 'fixed', imagesOnly: 'true' });
    expect(ports.pushEntity).toHaveBeenCalledWith({ photoSize: 'big', photoLayout: 'masonry', followImagesOnly: true });
    expect(ports.pushFollow).toHaveBeenCalledWith({ photoSize: 'big', photoLayout: 'masonry', imagesOnly: true });
  });

  it('The studio large slot and circle use large and ring respectively; the logo can fall back to the entity image but not to featured works', () => {
    const company = { k: 'Peach & Co', n: 3, entity_id: 41, has_logo: true, logo_version: 'logo 2',
      has_image: true, image_version: 'face 2', has_avatar: true, rep: 91,
      avatar_focus: { axis: 'y', pct: 20 }, avatar_stand_in: true };
    for (const big of [true, false]) {
      const host = document.createElement('div');
      host.innerHTML = personAvatar(company, 'studio', big).html;
      const image = host.querySelector('img')!, url = new URL(image.src);
      expect(url.pathname).toBe('/logo');
      expect(url.searchParams.get('studio')).toBe(company.k);
      expect(url.searchParams.get('variant')).toBe(big ? 'large' : 'ring');
      expect(url.searchParams.get('v')).toBe('logo 2');
      expect(image.getAttribute('data-fallbacks')).toContain('/entity-image?kind=studio');
      expect(image.getAttribute('data-fallbacks')).not.toContain('/avatar');
      expect(image.getAttribute('data-fallback-note')).toBeNull();
      expect(image.style.objectPosition).toBe('');
    }
    const host = document.createElement('div');
    host.innerHTML = entityPortraitImg('studio', { id: 41, canonical_name: company.k, asset_count: 3,
      has_logo: true, logo_version: 'logo 2', has_image: true, image_version: 'face 2',
      has_avatar: true, representative_asset_id: 91, avatar_stand_in: true });
    const portrait = host.querySelector('img')!;
    expect(new URL(portrait.src).searchParams.get('variant')).toBe('large');
    expect(portrait.getAttribute('data-fallbacks')).not.toContain('/avatar');
  });
});
