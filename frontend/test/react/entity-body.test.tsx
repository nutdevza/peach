/* Entity page body island: what each of the three views draws, what clicks hand to the shell, and the handoff between skeleton and cards when filters change.
 *
 * The roster and the cards themselves have their own test files (`index-page.test.tsx`, `catalog-grid.test.tsx`); this only checks which layer of the body
 * wired what where. Skeleton fade-out geometry, continuation pages, and Shift multi-select are measured by e2e in a real browser. */
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { act, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  EntityBodyActions, EntityBodyHelpers, EntityBodyProps, EntityPhotos,
} from '../../src/react/entity-body/entity-body';
import { EntityBodyPage } from '../../src/react/entity-body/entity-body-page';
import type { MediaItem, MediaPage } from '../../src/react/catalog-grid/types';
import { openPhotoLightbox } from '../../src/react/photo-lightbox/photo-lightbox-dialog';
import { queryClient } from '../../src/react/query';
import { click, mount } from './render';

/* The lightbox's own open/close, paging, and zoom live in `photo-lightbox.test.tsx`; here we only check which column and which starting image the wall hands it. */
vi.mock('../../src/react/photo-lightbox/photo-lightbox-dialog', () => ({ openPhotoLightbox: vi.fn(async () => {}) }));

afterEach(() => { queryClient.clear() });
notifyManager.setScheduler((notify) => notify());

const item = (id: number): MediaItem => ({ id, name: `Video ${id}`, has_thumb: true });
const page = (ids: number[], total = ids.length): MediaPage => ({ items: ids.map(item), total });

function helpers(): EntityBodyHelpers {
  return {
    badgeHtml: () => '', titleHtml: (_it, raw) => raw, displayName: (_it, raw) => raw,
    tagLabel: (tag) => tag,
    personAvatar: vi.fn(() => ({ html: '<span class="ini">A</span>', face: '' })),
  };
}

function actions(): EntityBodyActions {
  return {
    open: vi.fn(), openResource: vi.fn(), openShort: vi.fn(), openShorts: vi.fn(), openMix: vi.fn(),
    openEntity: vi.fn(), openUnowned: vi.fn(), toggleTag: vi.fn(), toggleSelection: vi.fn(),
    watchLater: vi.fn(async () => {}), rate: vi.fn(async () => {}), resourceOperation: vi.fn(async () => {}), mixRelated: vi.fn(async () => []),
    canFlip: () => true, revealSource: vi.fn(async () => ''), loadMorePhotos: vi.fn(async () => {}),
  };
}

function props(patch: Partial<EntityBodyProps> = {}): EntityBodyProps {
  return {
    kind: 'performer', name: '篠田ゆう', view: 'videos', roster: null, items: page([1, 2, 3]), revision: 1,
    fetchPage: vi.fn(async () => page([])), photos: null, photoSize: 'small', photoLayout: 'masonry',
    helpers: helpers(), actions: actions(),
    layout: { active: false, size: 'small', portrait: false, javImage: 'cover' },
    selectMode: false, selected: new Set(), seekSeconds: 10, wireDrag: vi.fn(),
    skeletonHtml: () => '<div data-test-skeleton>skeleton</div>', groupCollapse: true, canLoadMore: () => false,
    ...patch,
  };
}

let push: (patch: Partial<EntityBodyProps>) => void = () => {};
/** The patch the shell pushes through `updateManagedRoute`, replaced here by a layer of state. */
function Shell(given: EntityBodyProps) {
  const [current, set] = useState(given);
  push = (patch) => set((value) => ({ ...value, ...patch }));
  return <EntityBodyPage {...current} />;
}
const open = (given: EntityBodyProps) =>
  mount(<QueryClientProvider client={queryClient}><Shell {...given} /></QueryClientProvider>);

const cards = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('[data-entity-grid] [data-media-grid] > [data-media-card]')]
    .map((card) => card.dataset.id);

describe('Roster', () => {
  it('The agency page lays out the same artist tiles as the index page, portraits framed on the detected face, and clicking one asks the shell to open that person', async () => {
    const given = props({
      kind: 'agency', view: 'people',
      roster: { kind: 'performers', people: [{ k: '河北彩花', n: 12 }, { k: '小湊よつ葉', n: 3 }], layout: 'big' },
      helpers: { ...helpers(), personAvatar: vi.fn(() => ({ html: '<img src="/entity-image?id=1" alt="">', face: '40% 20%' })) },
    });
    const host = await open(given);
    const grid = host.querySelector<HTMLElement>('[data-index-grid]');
    expect(grid?.dataset.cells).toBe('people');
    expect(grid?.dataset.layout).toBe('big');
    const ring = host.querySelector<HTMLElement>('[data-person-ring]');
    expect(ring?.dataset.fitNative).toBe('portrait');
    expect(ring?.style.getPropertyValue('--face')).toBe('40% 20%');
    expect([...host.querySelectorAll('[data-index-cell]')].map((cell) => cell.querySelector('[data-index-readout]')?.textContent))
      .toEqual(['12 videos', '3 videos']);
    await click(host.querySelector('[data-index-cell][data-k="小湊よつ葉"]'));
    expect(given.actions.openEntity).toHaveBeenCalledWith('performer', '小湊よつ葉');
    expect(host.querySelector('[data-entity-grid]')).toBeNull();
  });

  it('The studio page\'s roster is its labels, each cell a company\'s square mark', async () => {
    const given = props({
      kind: 'studio', view: 'people', roster: { kind: 'studios', people: [{ k: 'S1 NO.1 STYLE', n: 40 }], layout: 'compact' },
    });
    const host = await open(given);
    expect(host.querySelector<HTMLElement>('[data-index-grid]')?.dataset.cells).toBe('company');
    expect(host.querySelector<HTMLElement>('[data-person-ring]')?.dataset.fitNative).toBe('mark');
    expect(given.helpers.personAvatar).toHaveBeenCalledWith(expect.objectContaining({ k: 'S1 NO.1 STYLE' }), 'studio', false);
    await click(host.querySelector('[data-index-cell]'));
    expect(given.actions.openEntity).toHaveBeenCalledWith('studio', 'S1 NO.1 STYLE');
  });

  it('Rosters of thousands start with 120 cells; "Load more" appends 120 more each time and collapses once done', async () => {
    const people = Array.from({ length: 250 }, (_, at) => ({ k: `Performer${at}`, n: 1 }));
    const host = await open(props({ kind: 'agency', view: 'people', roster: { kind: 'performers', people, layout: 'big' } }));
    const count = () => host.querySelectorAll('[data-index-cell]').length;
    expect(count()).toBe(120);
    await click(host.querySelector('[data-entity-more]'));
    expect(count()).toBe(240);
    await click(host.querySelector('[data-entity-more]'));
    expect(count()).toBe(250);
    expect(host.querySelector('[data-entity-more]')).toBeNull();
  });
});

describe('Video grid', () => {
  it('Page one comes from the shell and mounts straight as cards without fetching again', async () => {
    const given = props();
    const host = await open(given);
    expect(cards(host)).toEqual(['1', '2', '3']);
    expect(host.querySelector('[data-content-transition]')?.getAttribute('aria-busy')).toBe('false');
    expect(host.querySelector('[data-content-skeleton]')?.getAttribute('aria-hidden')).toBe('true');
    expect(given.fetchPage).not.toHaveBeenCalled();
  });

  it('While waiting, the old content hides and disables; when the new list lands the busy state lifts and the new cards take over', async () => {
    const host = await open(props());
    await act(async () => push({ items: null, revision: 2 }));
    expect(cards(host)).toEqual(['1', '2', '3']);
    expect(host.querySelector('[data-content-current]')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('[data-content-current]')?.hasAttribute('inert')).toBe(true);
    expect(host.querySelector('[data-entity-grid] [data-test-skeleton]')).not.toBeNull();
    await act(async () => push({ items: page([7, 8]), revision: 2 }));
    expect(cards(host)).toEqual(['7', '8']);
    expect(host.querySelector('[data-content-current]')?.hasAttribute('inert')).toBe(false);
  });

  it('Selection state and layout are forwarded to the cards as is', async () => {
    const host = await open(props());
    await act(async () => push({ selectMode: true, selected: new Set([2]) }));
    expect(host.querySelector('[data-media-sections]')?.hasAttribute('data-select-mode')).toBe(true);
    expect([...host.querySelectorAll<HTMLElement>('[data-media-card][data-selected]')].map((card) => card.dataset.id))
      .toEqual(['2']);
  });
});

const SETS = [
  { code: 'SSIS-057', name: '雨の日', n: 3, release_date: '2021-05-18', site_label: 'DMM' },
  { code: 'SSIS-001', name: 'Early summer', n: 2, release_date: '2021-02-19', site_label: 'DMM' },
];
const photos = (patch: Partial<EntityPhotos> = {}): EntityPhotos => ({
  revision: 1, codeSets: SETS, items: [{ id: 101, name: '101.jpg' }, { id: 102, name: '102.jpg' }],
  total: 2, hasMore: false, ...patch,
});
const openPhotos = (patch: Partial<EntityBodyProps> = {}) => {
  const given = props({ view: 'photos', photos: photos(), ...patch });
  return open(given).then((host) => ({ host, given }));
};
/** Each section's header label and the cell count of the wall beneath it, in page order. */
const groups = (host: HTMLElement) => [...host.querySelectorAll('[data-photo-group]')].map((head) => [
  head.querySelector('b')?.textContent, head.nextElementSibling?.querySelectorAll('[data-photo-cell]').length,
]);
const indexes = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLElement>('[data-photo-cell]')].map((cell) => Number(cell.dataset.photoIndex));

describe('Photo wall', () => {
  it('Samples for each video come in one section per video ahead of local images, with section headers giving the code, title and "Source samples · release date · image count"', async () => {
    const { host } = await openPhotos();
    expect(groups(host)).toEqual([['SSIS-057', 3], ['SSIS-001', 2], ['Local images', 2]]);
    const head = host.querySelector('[data-photo-group]')!;
    expect(head.querySelector('[data-photo-group-title]')?.getAttribute('title')).toBe('雨の日');
    expect(head.querySelector('[data-photo-group-meta]')?.textContent).toBe('DMM samples · 2021-05-18 · 3 images');
    expect(host.querySelectorAll('[data-photo-group]')[2].querySelector('[data-photo-group-meta]')?.textContent)
      .toBe('2 images');
    expect(indexes(host)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(host.querySelectorAll('[data-local-wall] [data-photo-cell]').length).toBe(2);
  });

  it('Thumbnails go through the server cache; the full image belongs to the lightbox only, and the alt text is the file name until it arrives', async () => {
    const { host } = await openPhotos();
    const imgs = [...host.querySelectorAll('img')];
    expect(imgs[0].getAttribute('src')).toBe('/sample-thumb?code=SSIS-057&n=1');
    expect(imgs[5].getAttribute('src')).toBe('/photo-thumb?id=101');
    expect(imgs[5].getAttribute('alt')).toBe('101.jpg');
    expect(imgs.every((img) => img.getAttribute('loading') === 'lazy' && !img.hasAttribute('data-drop'))).toBe(true);
  });

  it('No section header when there are only local images; the directory gallery screen is the same', async () => {
    const { host } = await openPhotos({ photos: photos({ codeSets: [] }) });
    expect(host.querySelector('[data-photo-group]')).toBeNull();
    expect(indexes(host)).toEqual([0, 1]);
  });

  it('Clicking a cell hands the whole wall to the lightbox with a continuous index across segments; samples go by code and index, local images carry their locator', async () => {
    const { host, given } = await openPhotos();
    await click(host.querySelector('[data-photo-index="3"]'));
    const [index, slides, reveal] = vi.mocked(openPhotoLightbox).mock.calls.at(-1)!;
    expect(index).toBe(3);
    expect(slides).toHaveLength(7);
    expect(slides[3]).toEqual({
      src: '/sample-image?code=SSIS-001&n=1', thumb: '/sample-thumb?code=SSIS-001&n=1', name: 'SSIS-001 sample image 1',
      asset: null, source: 'DMM',
    });
    expect(slides[5]).toEqual({
      src: '/photo?id=101', thumb: '/photo-thumb?id=101', name: '101.jpg', asset: { id: 101, name: '101.jpg' },
    });
    await reveal!.revealSource(101);
    expect(given.actions.revealSource).toHaveBeenCalledWith(101);
  });

  it('When the local image fails the whole cell goes; when the sample fails only the image drops and the cell stays; other cells keep their numbering', async () => {
    const { host } = await openPhotos();
    await act(async () => {
      host.querySelector('[data-photo-index="5"] img')!.dispatchEvent(new Event('error'));
      host.querySelector('[data-photo-index="1"] img')!.dispatchEvent(new Event('error'));
    });
    expect(indexes(host)).toEqual([0, 1, 2, 3, 4, 6]);
    expect(host.querySelector('[data-photo-index="1"] img')).toBeNull();
  });

  it('Size tiers and layout only change wall attributes and never repaint thumbnails already fetched', async () => {
    const { host } = await openPhotos();
    const first = host.querySelector('[data-photo-cell] img');
    await act(async () => push({ photoSize: 'big', photoLayout: 'fixed' }));
    const walls = [...host.querySelectorAll<HTMLElement>('[data-photo-wall]')];
    expect(walls.map((wall) => `${wall.dataset.size}/${wall.dataset.layout}`)).toEqual(Array(3).fill('big/fixed'));
    expect(host.querySelector('[data-photo-cell] img')).toBe(first);
  });

  it('When another page exists, "Load more" appears and clicking it asks the shell to fetch; the appended page goes after the local images', async () => {
    const { host, given } = await openPhotos({ photos: photos({ hasMore: true }), canLoadMore: () => true });
    await click(host.querySelector('[data-entity-more]'));
    expect(given.actions.loadMorePhotos).toHaveBeenCalled();
    await act(async () => push({ photos: photos({ items: [...photos().items, { id: 103, name: '103.jpg' }] }) }));
    expect(indexes(host)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(host.querySelector('[data-entity-more]')).toBeNull();
  });
});
