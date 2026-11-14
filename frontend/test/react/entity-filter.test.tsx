/* Entity page filter overlay island: which keys each of the three views lays out, what clicks hand to the shell, and the new-batch busy state for photos.
 *
 * Sliding glass positioning, sticky, narrow-screen horizontal scroll and yielding, and skeleton-takeover geometry are measured by `frontend/e2e/entity-filter.test.ts`
 * in a real browser; jsdom has no layout, so no glass assertions here. */
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { EntityFilterPage } from '../../src/react/entity-filter/entity-filter-page';
import {
  videoOnly, type EntityFilterActions, type EntityFilterHelpers, type EntityFilterProps, type EntityOnlineHead,
} from '../../src/react/entity-filter/entity-filter';
import { FOLLOW_FILTERS } from '../../src/react/follow-feed/follow-feed';
import { click, mount, settle } from './render';

const STATES = [{ k: '', label: 'All' }, { k: 'fresh', label: 'Not watched' }, { k: 'later', label: 'Watch later' }, { k: 'flagged', label: 'Marked' }];
const LAYOUTS = [['big', 'Large images', 'maximize'], ['small', 'Small images', 'layout-grid']] as const;

function actions(patch: Partial<EntityFilterActions> = {}): EntityFilterActions {
  return {
    setView: vi.fn(), setState: vi.fn(), toggleTag: vi.fn(), clearFilter: vi.fn(), clearAll: vi.fn(),
    setSort: vi.fn(), reshuffle: vi.fn(async () => {}), setJavLayout: vi.fn(), setPhotoLayout: vi.fn(),
    photoBack: vi.fn(), onlineMedia: vi.fn(), onlineShuffle: vi.fn(), onlineImagesOnly: vi.fn(), onlineStatus: vi.fn(),
    onlineProvider: vi.fn(), onlineTag: vi.fn(), onlineSort: vi.fn(), ...patch,
  };
}

function helpers(patch: Partial<EntityFilterHelpers> = {}): EntityFilterHelpers {
  return { wireDrag: vi.fn(), wireScroller: vi.fn(), sourceToolsHtml: () => '', wireSourceTools: vi.fn(), ...patch };
}

function props(patch: Partial<EntityFilterProps> = {}): EntityFilterProps {
  return {
    kind: 'performer', name: '篠田ゆう', view: 'videos',
    views: { label: 'Media kinds', people: null, videos: { count: 24 }, photos: { count: 18 }, online: null },
    state: '', states: STATES,
    tags: [{ k: 'Big breasts', label: 'Big breasts', n: 1200, selected: false }, { k: 'Creampie', label: 'Creampie', n: 36, selected: true }],
    combo: [{ kind: 'untag', key: 'Creampie', label: 'Creampie' }, { kind: 'clear', key: 'studio', label: 'Label S1' }],
    readout: 'Video · 24 · creampie', busy: false,
    video: {
      sorts: [
        { key: 'release', label: 'Release date', pressed: true, dir: 'desc', ariaLabel: 'Sort by release time, oldest first' },
        { key: 'rating', label: 'Rating', pressed: false, dir: '', ariaLabel: 'Sort by rating high to low' },
      ],
      jav: { layout: 'big', options: LAYOUTS },
    },
    photo: null, online: null, actions: actions(), helpers: helpers(), ...patch,
  };
}

const $ = (host: HTMLElement, selector: string) => host.querySelector<HTMLElement>(selector);
const $$ = (host: HTMLElement, selector: string) => [...host.querySelectorAll<HTMLElement>(selector)];

describe('The few checks that only hold on the video view', () => {
  it('Watch states, tags, and intersection chips follow only the video view', () => {
    expect(videoOnly('videos')).toBe(true);
    expect(videoOnly('photos')).toBe(false);
    expect(videoOnly('people')).toBe(false);
  });
});

describe('Video view', () => {
  it('View keys, watch state, tags and counts, intersection chip, sorting, and layout are all laid out; pressed states follow props', async () => {
    const host = await mount(<EntityFilterPage {...props()} />);
    expect($$(host, '[data-media-view]').map((key) => [key.dataset.mediaView, key.getAttribute('aria-pressed')]))
      .toEqual([['videos', 'true'], ['photos', 'false']]);
    expect($(host, '[data-media-view="photos"]')?.getAttribute('aria-label')).toBe('Photos 18');
    expect($(host, '[data-entity-states]')?.hidden).toBe(false);
    expect($(host, '[data-entity-state=""]')?.getAttribute('aria-pressed')).toBe('true');
    expect($$(host, '[data-entity-tag]').map((tag) => [tag.textContent, tag.getAttribute('aria-pressed')]))
      .toEqual([['Big breasts1,200', 'false'], ['Creampie36', 'true']]);
    expect($(host, '[data-entity-combo]')?.hidden).toBe(false);
    expect($$(host, '[data-combo-chip]').map((chip) => chip.firstChild?.textContent)).toEqual(['Creampie', 'Label S1']);
    expect($(host, '[data-entity-readout]')?.textContent).toBe('Video · 24 · creampie');
    expect($(host, '[data-entity-sort="release"]')?.querySelector('svg')).not.toBeNull();
    expect($(host, '[data-entity-sort="rating"]')?.querySelector('svg')).toBeNull();
    expect($(host, '[data-entity-sort="rating"]')?.getAttribute('aria-label')).toBe('Sort by rating high to low');
    expect($(host, '[data-entity-layout][aria-label="JAV card layout"]')).not.toBeNull();
    expect($(host, '[data-photo-back]')).toBeNull();
  });

  it('Every press goes back to the shell: view switch, state switch, tags, removing one intersection chip or clearing all, sort, and shuffle', async () => {
    const shell = actions();
    const host = await mount(<EntityFilterPage {...props({ actions: shell })} />);
    await click($(host, '[data-media-view="photos"]')!);
    await click($(host, '[data-entity-state="later"]')!);
    await click($(host, '[data-entity-state=""]')!);
    await click($(host, '[data-entity-tag="Big breasts"]')!);
    await click($(host, '[aria-label="Remove Creampie"]')!);
    await click($(host, '[aria-label="Remove Label S1"]')!);
    await click($(host, '[data-combo-clear]')!);
    await click($(host, '[data-entity-sort="rating"]')!);
    await click($(host, '[data-entity-batch]')!);
    expect(shell.setView).toHaveBeenCalledWith('photos');
    // Clicking the already-pressed button again sends no request.
    expect(shell.setState).toHaveBeenCalledTimes(1);
    expect(shell.setState).toHaveBeenCalledWith('later');
    expect(shell.toggleTag).toHaveBeenNthCalledWith(1, 'Big breasts');
    expect(shell.toggleTag).toHaveBeenNthCalledWith(2, 'Creampie');
    expect(shell.clearFilter).toHaveBeenCalledWith('studio');
    expect(shell.clearAll).toHaveBeenCalledTimes(1);
    expect(shell.setSort).toHaveBeenCalledWith('rating');
    expect(shell.reshuffle).toHaveBeenCalledTimes(1);
  });

  it('While this fetch runs the count becomes shimmer and the bottom row sets aria-busy', async () => {
    const host = await mount(<EntityFilterPage {...props({ busy: true })} />);
    expect($(host, '[data-entity-readout] [data-skeleton="count"]')).not.toBeNull();
    expect($(host, '[data-filter-row="bottom"]')?.getAttribute('aria-busy')).toBe('true');
  });

  it('The horizontal row registers dragging and wheel handling with the legacy layer', async () => {
    const wiring = helpers();
    const host = await mount(<EntityFilterPage {...props({ helpers: wiring })} />);
    expect(wiring.wireDrag).toHaveBeenCalledWith($(host, '[data-entity-tags]'));
    expect(wiring.wireDrag).toHaveBeenCalledWith($(host, '[data-filter-row="bottom"]'));
    expect(wiring.wireScroller).toHaveBeenCalledWith($(host, '[data-entity-scroll]'));
  });

  it('With one kind only there is no view key and no divider drawn after it', async () => {
    const host = await mount(<EntityFilterPage {...props({ views: null })} />);
    expect($(host, '[data-entity-media]')).toBeNull();
    expect($$(host, '[data-entity-filter-glass] [data-filter-row="top"] > [data-entity-sep]')).toHaveLength(0);
  });
});

describe('Photos and roster views', () => {
  it('Photo view collapses watch state, tags, and the intersection bar; the bottom row holds only shuffle and image layout', async () => {
    const host = await mount(<EntityFilterPage {...props({
      view: 'photos', readout: 'Photos · 18', video: null,
      photo: { back: false, shuffle: true, layout: 'masonry', layouts: [['fixed', 'Fixed ratio', 'layout-grid'], ['masonry', 'Masonry', 'columns-2']], setId: 0 },
    })} />);
    expect($(host, '[data-entity-states]')?.hidden).toBe(true);
    expect($$(host, '[data-entity-tag]')).toHaveLength(0);
    expect($(host, '[data-entity-combo]')?.hidden).toBe(true);
    expect($$(host, '[data-entity-sort]')).toHaveLength(0);
    expect($(host, '[data-entity-layout][aria-label="Image layout"]')).not.toBeNull();
    expect($$(host, '[data-entity-batch]')).toHaveLength(1);
    expect($(host, '[data-photo-back]')).toBeNull();
  });

  it('Photo shuffle: the button spins on its own, repeat presses do not resend, and it recovers only when the shell\'s Promise settles', async () => {
    let finish = () => {};
    const shell = actions({ reshuffle: vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })) });
    const host = await mount(<EntityFilterPage {...props({
      view: 'photos', video: null, actions: shell,
      photo: { back: false, shuffle: true, layout: 'fixed', layouts: [['fixed', 'Fixed ratio', 'layout-grid']], setId: 0 },
    })} />);
    // Shuffle swaps out this batch's members rather than refetching the same batch: the glyph is a card shuffle, not a spinning refresh.
    expect($(host, '[data-entity-batch] use')?.getAttribute('href')).toBe('#i-shuffle');
    await click($(host, '[data-entity-batch]')!);
    expect($(host, '[data-entity-batch]')?.getAttribute('aria-busy')).toBe('true');
    await click($(host, '[data-entity-batch]')!);
    expect(shell.reshuffle).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await settle();
    expect($(host, '[data-entity-batch]')?.hasAttribute('aria-busy')).toBe(false);
  });

  it('The gallery has "All photos" on the left and the source-file key after it; with samples only there is no shuffle', async () => {
    const shell = actions();
    const wiring = helpers({ sourceToolsHtml: (id) => `<button type="button" data-src="${id}">Locate</button>` });
    const host = await mount(<EntityFilterPage {...props({
      view: 'photos', video: null, actions: shell, helpers: wiring, readout: '夏の日 · 12 images',
      photo: { back: true, shuffle: false, layout: 'fixed', layouts: [['fixed', 'Fixed ratio', 'layout-grid']], setId: 42 },
    })} />);
    expect($$(host, '[data-entity-batch]')).toHaveLength(0);
    expect($(host, '[data-entity-srctools] [data-src="42"]')).not.toBeNull();
    expect(wiring.wireSourceTools).toHaveBeenCalledWith($(host, '[data-entity-srctools]'));
    await click($(host, '[data-photo-back]')!);
    expect(shell.photoBack).toHaveBeenCalledTimes(1);
  });

  it('In roster view the bottom row provides counts and a favorite entry, with the roster key leftmost', async () => {
    const shell = actions();
    const host = await mount(<EntityFilterPage {...props({
      kind: 'agency', view: 'people', readout: 'Performers · 3', video: null, actions: shell,
      views: { label: 'Page views', people: { label: 'Artists', count: 3, icon: 'user-round' }, videos: { count: 24 }, photos: null, online: null },
    })} />);
    expect($$(host, '[data-media-view]').map((key) => key.dataset.mediaView)).toEqual(['people', 'videos']);
    expect($(host, '[data-media-view="people"]')?.getAttribute('aria-pressed')).toBe('true');
    expect($(host, '[data-entity-media]')?.getAttribute('aria-label')).toBe('Page views');
    expect($$(host, '[data-filter-row="bottom"] > *').map((node) => node.tagName)).toEqual(['H3', 'SPAN']);
    expect($(host, '[data-filter-row="bottom"] [aria-label="My favorites"]')).not.toBeNull();
    await click($(host, '[data-media-view="videos"]')!);
    expect(shell.setView).toHaveBeenCalledWith('videos');
  });
});

describe('The online view', () => {
  const head = (patch: Partial<EntityOnlineHead> = {}): EntityOnlineHead => ({
    media: 'videos', mediaCounts: { videos: 4, images: 9 }, photoLayout: 'masonry',
    photoLayouts: [['fixed', 'Fixed ratio', 'layout-grid'], ['masonry', 'Masonry', 'columns-2']], imagesOnly: false,
    status: '', statuses: FOLLOW_FILTERS, provider: '', providers: [['rule34video', 'Rule34Video']],
    tags: [{ k: 'cum', label: 'cum', n: 3, selected: true, cat: 'general' }],
    sorts: [{ key: 'new', label: 'Updated', pressed: true, dir: 'desc', ariaLabel: 'Updated' }], ...patch,
  });
  const online = (patch: Partial<EntityFilterProps> = {}) => props({
    kind: 'creator', name: 'Jul3D', view: 'online', readout: 'Online · 13 updates', video: null, tags: [], combo: [],
    views: { label: 'Media kinds', people: null, videos: { count: 2 }, photos: null, online: { count: 13 } }, ...patch,
  });

  it('The online key goes last; status becomes the four follow tiers; source and tags belong to this person, and media and sorting each form their own group', async () => {
    const host = await mount(<EntityFilterPage {...online({ online: head() })} />);
    expect($$(host, '[data-entity-media]:not([data-online-media]) > [data-media-view]')
      .map((key) => key.dataset.mediaView)).toEqual(['videos', 'online']);
    expect($$(host, '[data-entity-state]').map((key) => key.dataset.entityState)).toEqual(['', 'new', 'saved', 'ignored']);
    expect($(host, '[data-entity-states]')?.hidden).toBe(false);
    expect($(host, '[data-follow-provider="rule34video"]')).not.toBeNull();
    expect($(host, '[data-follow-tag="cum"]')?.getAttribute('aria-pressed')).toBe('true');
    expect($$(host, '[data-online-media] > [data-media-view]').map((key) => key.dataset.mediaView)).toEqual(['videos', 'images']);
    expect($(host, '[data-follow-images-only]'), 'The video tier has no photo wall controls').toBeNull();
    expect($(host, '[data-entity-layout][aria-label="Image layout"]')).toBeNull();
  });

  it('Clicking invokes each one\'s own online action, not the video view flow', async () => {
    const shell = actions();
    const host = await mount(<EntityFilterPage {...online({ actions: shell, online: head() })} />);
    await click($(host, '[data-entity-state="new"]')!);
    await click($(host, '[data-follow-provider="rule34video"]')!);
    await click($(host, '[data-follow-tag="cum"]')!);
    await click($(host, '[data-online-media] [data-media-view="images"]')!);
    await click($(host, '[data-entity-sort="new"]')!);
    expect(shell.onlineStatus).toHaveBeenCalledWith('new');
    expect(shell.onlineProvider).toHaveBeenCalledWith('rule34video');
    expect(shell.onlineTag).toHaveBeenCalledWith('cum');
    expect(shell.onlineMedia).toHaveBeenCalledWith('images');
    expect(shell.onlineSort).toHaveBeenCalledWith('new');
    expect([shell.setState, shell.toggleTag, shell.setSort].every((fn) => vi.mocked(fn).mock.calls.length === 0)).toBe(true);
  });

  it('The images tier carries image layout and images-only, the same set as the follows page photo wall', async () => {
    const shell = actions();
    const host = await mount(<EntityFilterPage {...online({ actions: shell, online: head({ media: 'images', imagesOnly: true }) })} />);
    expect($(host, '[data-entity-layout][aria-label="Image layout"]')).not.toBeNull();
    expect($(host, '[data-follow-images-only]')?.getAttribute('aria-pressed')).toBe('true');
    await click($(host, '[data-follow-images-only]')!);
    expect(shell.onlineImagesOnly).toHaveBeenCalledWith(false);
  });

  it('With photos only and no other view key the top row never renders', async () => {
    const host = await mount(<EntityFilterPage {...props({
      view: 'photos', views: null, readout: 'Photos · 18', video: null,
      photo: { back: false, shuffle: true, layout: 'masonry', layouts: [['masonry', 'Masonry', 'columns-2']], setId: 0 },
    })} />);
    expect($(host, '[data-filter-row="top"]')).toBeNull();
    expect($(host, '[data-filter-row="bottom"]')).not.toBeNull();
  });
});
