import { describe, expect, it, vi } from 'vitest';
import { createFollowController, entityFollowActions, type FollowControllerPorts, type FollowSession } from '../../src/react/follow-feed/follow-controller';
import { type FollowFeedActions, type FollowFeedHelpers, type FollowView } from '../../src/react/follow-feed/follow-feed';
import { followAuthorView, followTagView, followViewPath, readFollowView } from '../../src/react/follow-feed/follow-view';
import { followManageEntry, followManageParams, followManagePath } from '../../src/react/follow-manage/manage-route';
import { createFollowDetailActions } from '../../src/react/follow-detail/follow-detail-actions';
import { followWorkMark } from '../../src/react/follow-feed/follow-helpers';

const view = (patch: Partial<FollowView> = {}): FollowView => ({ status: '', media: 'videos', author: '', provider: '',
  work: '', tags: [], durMin: 0, durMax: 0, sort: 'new', dir: 'desc', seed: 7, ...patch });
const helpers: FollowFeedHelpers = { workMark: () => '', tagLabel: tag => tag, wireDrag: vi.fn(), wireScroller: vi.fn(),
  listSkeletonHtml: () => '', jobProgress: vi.fn() };
const delegated: Omit<FollowFeedActions, 'route' | 'shuffle'> = { loaded: vi.fn(), openDetail: vi.fn(), openAuthor: vi.fn(),
  toggleSelection: vi.fn(), setImagesOnly: vi.fn(), setPhotoLayout: vi.fn(), canFlip: () => true, toast: vi.fn(),
  failure: vi.fn(), checkReport: vi.fn() };

function setup() {
  let current = view(), pathname = '/follow', search = '', live = true;
  let session: FollowSession = { discoverySeed: 11, revision: 2, scrollY: 600 };
  const selected = new Set([13]);
  const ports: FollowControllerPorts = { location: () => ({ pathname, search }), view: () => current,
    adoptView: next => { current = next }, session: () => session,
    writeSession: patch => { session = { ...session, ...patch } },
    preferences: () => ({ selectMode: true, selected, photoSize: 'small', photoLayout: 'fixed', imagesOnly: false }),
    live: () => live, push: vi.fn(), route: vi.fn(), openPage: vi.fn(), rollSeed: () => 31, enterSeed: () => 41,
    revealFeed: vi.fn(), syncPhotoWalls: vi.fn(), scrollTop: vi.fn() };
  return { ports, selected, controller: createFollowController(ports, helpers, delegated),
    location: (path: string, query = '') => { pathname = path; search = query }, live: (value: boolean) => { live = value } };
}

describe('Follow domain URL and session control', () => {
  it('Single-value dimensions read the first item, tags dedupe, invalid states and durations become unbounded, and random seeds use unsigned values', () => {
    const roll = vi.fn(() => 29);
    const actual = readFollowView('?author=foo,bar&provider=a,b&work=w,x&tag=t,t,u&status=seen&dur_min=-1&dur_max=bad&sort=rand&seed=-1', 7, roll);
    expect(actual).toMatchObject({ author: 'foo', provider: 'a', work: 'w', tags: ['t', 'u'], status: '',
      durMin: 0, durMax: 0, sort: 'rand', seed: 4294967295 });
    expect(roll).not.toHaveBeenCalled();
    expect(readFollowView('', 0, roll).seed).toBe(29);
    expect(readFollowView('?seed=0&status=all&sort=bad', 17, roll)).toEqual(view({ seed: 17 }));
  });

  it('Default addresses compress down; Chinese, spaces, and slashes round-trip; and random addresses keep the seed', () => {
    expect(followViewPath(view())).toBe('/follow');
    const target = view({ author: 'A / B', tags: ['Chinese', 'a b'], work: 'set:1', media: 'images', status: 'saved',
      durMin: 30, sort: 'rand', seed: 91, dir: 'asc' });
    expect(readFollowView(followViewPath(target).split('?')[1]!, 0, () => 1)).toEqual(target);
  });

  it('Filter submits do not navigate early, the props action identity stays fixed, and the selection snapshot is independent', () => {
    const { controller, ports, selected } = setup();
    const first = controller.props();
    controller.route(view({ media: 'images' }));
    expect(ports.scrollTop).not.toHaveBeenCalled();
    controller.route(view({ media: 'images', tags: ['x'] }));
    expect(ports.scrollTop).not.toHaveBeenCalled();
    expect(controller.props().actions).toBe(first.actions);
    expect(controller.props().helpers).toBe(first.helpers);
    selected.add(14);
    expect([...first.selected]).toEqual([13]);
  });

  it('Refreshing advances both the list seed and the discovery seed; an unmounted host accepts no props', () => {
    const { controller, ports, live } = setup();
    controller.shuffle();
    expect(ports.view()).toEqual(view({ sort: 'rand', seed: 31 }));
    expect(ports.session().discoverySeed).toBe(31);
    expect(ports.push).toHaveBeenCalledWith({ seed: 31, view: ports.view() });
    live(false);
    vi.mocked(ports.push).mockClear();
    controller.route(view({ author: 'one' }));
    expect(ports.push).not.toHaveBeenCalled();
  });

  it('A normal entry keeps the session and scrolling; only an explicit re-entry swaps the seed and advances the generation', () => {
    const { controller, ports, location, live } = setup();
    controller.route(view({ author: 'one' }));
    location('/performers');
    controller.enter();
    expect(ports.openPage).toHaveBeenLastCalledWith('/follow?author=one');
    expect(ports.session()).toEqual({ discoverySeed: 11, revision: 2, scrollY: 600 });
    location('/follow');
    controller.enter();
    expect(ports.session()).toEqual({ discoverySeed: 11, revision: 2, scrollY: 600 });
    live(false);
    controller.enter(true);
    expect(ports.session().revision).toBe(3);
    expect(ports.session().discoverySeed).toBe(41);
    expect(ports.openPage).toHaveBeenLastCalledWith('/follow');
  });

  it('refresh restores filters from the URL and the current host reuses the original generation', () => {
    const { controller, ports, location, live } = setup();
    location('/follow', '?tag=one&media=images');
    live(false);
    expect(controller.refresh()).toBe(false);
    expect(ports.view().tags).toEqual(['one']);
    expect(ports.session().revision).toBe(2);
    live(true);
    expect(controller.refresh()).toBe(true);
    expect(ports.session().revision).toBe(2);
    expect(ports.revealFeed).toHaveBeenCalledOnce();
    expect(ports.scrollTop).not.toHaveBeenCalled();
  });

  it('Indexing the author resets genre, online tags keep genre, and the profile page online card never takes over page-level actions', () => {
    const selected = view({ work: 'topic', author: 'old', provider: 'old', tags: ['old'], durMin: 8 });
    expect(followAuthorView(selected, 'new')).toEqual(view({ author: 'new' }));
    expect(followTagView(selected, 'new')).toEqual(view({ work: 'topic', tags: ['new'] }));
    const { controller } = setup(), actions = entityFollowActions(controller.actions);
    actions.route(view()); actions.shuffle(); actions.loaded({ tags: [], providers: [], duration: false }); actions.toggleSelection(1, false);
    expect(actions.openDetail).toBe(controller.actions.openDetail);
    expect(actions.setPhotoLayout).toBe(controller.actions.setPhotoLayout);
  });

  it('Manage pages clamp bad page numbers and tabs to defaults; re-entry keeps the tab and clears sorting', () => {
    expect(followManageParams('?page=-4&tab=invalid')).toEqual({ tab: 'list', page: 1, sort: '', dir: '' });
    expect(followManageParams('?page=3.9&tab=feeds&sort=added&dir=asc')).toEqual({ tab: 'list', page: 3, sort: 'added', dir: 'asc' });
    expect(followManageEntry('?tab=feeds')).toBe('/subscriptions');
    expect(followManageParams('?tab=tags').tab).toBe('tags');
    expect(followManageEntry('?tab=tags')).toBe('/subscriptions?tab=tags');
    expect(followManagePath({ tab: 'list', page: 1, sort: '', dir: '' })).toBe('/subscriptions');
    expect(followManageEntry('?tab=wants&page=4&sort=x')).toBe('/jav?tab=wants');
    expect(followManageEntry('?tab=wants', 'add')).toBe('/subscriptions?tab=add');
  });

  it('Details tags write the return path before closing, switching items in a group keeps the origin, and genre marks render by availability', () => {
    let current = view({ tags: ['one'] });
    const calls: string[] = [];
    const ports = { view: () => current, adoptView: (next: FollowView) => { current = next },
      rememberReturn: (path: string) => { calls.push(path) }, close: () => { calls.push('close') },
      open: vi.fn(), openAuthor: vi.fn(), drawer: vi.fn(), presented: vi.fn() };
    const actions = createFollowDetailActions(ports, { toast: vi.fn(), failure: vi.fn(), canFlip: () => false });
    actions.openTag('two'); actions.openTag('one');
    expect(calls).toEqual(['/follow?tag=one%2Ctwo', 'close', '/follow?tag=two', 'close']);
    actions.openItem(17, 2);
    expect(ports.open).toHaveBeenCalledWith(17, 2, true);
    actions.openAuthor('Kou');
    expect(ports.openAuthor).toHaveBeenCalledWith('Kou');
    const item = { id: 3, title: 'New-release trailers', tags: [] } as unknown as Parameters<typeof actions.present>[0];
    actions.present(item, 'video');
    expect(ports.presented).toHaveBeenCalledWith(item);
    expect(followWorkMark(['none', 'A, B, C', 1])).toBe('A,');
    const host = document.createElement('div'); host.innerHTML = followWorkMark(['a/b', 'Alpha', 1, 11]);
    expect(new URL(host.querySelector('img')!.src).searchParams.get('work')).toBe('a/b');
  });
});
