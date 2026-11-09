/* Video details island: which queue entry it rests on, how identity and tags group, where the first screen navigates, what
 * is handed to the shell, and how cache and receipts change after writes.
 *
 * Entering and leaving from the catalog without refetch, the stage mounting Video.js in the media frame, offline notice, the
 * four queues, drag ordering, saving a Mix, Continue watching and phone layout need a real browser, measured in
 * `frontend/e2e/item-detail.test.ts`; sizes and palette in `e2e/design-*.test.ts`. */
import { notifyManager, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act } from 'react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { GridPage } from '../../src/react/catalog-grid/catalog-grid';
import type { MediaItem } from '../../src/react/catalog-grid/types';
import {
  chooseItem, detailTags, identityGroups, itemKey, mediaGate, movedOrder, nextRating, pickerSections, prefetchItemDetail,
  nextPart, queueCopy, queueKey, ratingText, withPartLabel,
  type DetailItem, type DetailQueue, type ItemDetailActions, type ItemDetailHelpers, type ItemDetailProps, type QueueItem,
} from '../../src/react/item-detail/item-detail';
import { ItemDetailPage } from '../../src/react/item-detail/item-detail-page';
import { tagLabel } from '../../src/core/tags';
import { queryClient } from '../../src/react/query';
import { click, mount, pending, settle, type } from './render';

afterEach(() => { queryClient.clear(); localStorage.removeItem('peach.recentTags') });
notifyManager.setScheduler((notify) => notify());

const item = (id: number, extra: Partial<DetailItem> = {}): DetailItem => ({
  id, name: `sample_${id}.mp4`, location: 'local', cost: 'free', size: 1024, duration: 3600, rating: 60,
  performers: ['七海ひな'], tags: [{ k: 'Drama' }, { k: 'High quality' }], ...extra,
} as DetailItem);
const row = (id: number, extra: Partial<QueueItem> = {}) => ({ id, name: `sample_${id}.mp4`, ...extra } as QueueItem);
const queue = (kind: DetailQueue['kind'], ids: number[], extra: Partial<DetailQueue> = {}): DetailQueue =>
  ({ kind, seedId: ids[0], title: 'Title', items: ids.map((id) => row(id)), ...extra });

function helpers(patch: Partial<ItemDetailHelpers> = {}): ItemDetailHelpers {
  return {
    badgeHtml: () => '', titleHtml: (shown) => String(shown.name), displayName: (shown) => String(shown.name),
    javImage: () => 'cover',
    tagLabel: (tag) => tag, isDurationTag: (tag) => tag.startsWith('Long videos'), tagCandidates: () => [], sourceOffline: () => false,
    offlineReason: () => 'The drive is not mounted', relatedSkeletonHtml: () => '', mixRelated: async () => [], wireDrag: vi.fn(),
    wireDragReorder: vi.fn(), ...patch,
  };
}

type ActionMocks = { [K in keyof ItemDetailActions]: Mock<ItemDetailActions[K]> };
function actions(): ActionMocks {
  return {
    close: vi.fn(), present: vi.fn(), redirect: vi.fn(), openQueueItem: vi.fn(), mountPlayer: vi.fn(() => vi.fn()), reopen: vi.fn(),
    checkSource: vi.fn(async () => false), openSavedFollow: vi.fn(), openEntity: vi.fn(), openUnowned: vi.fn(), openRegion: vi.fn(),
    openTag: vi.fn(), addToPlaylist: vi.fn(), saveMix: vi.fn(), editPlaylist: vi.fn(), openPlaylists: vi.fn(),
    reveal: vi.fn(async () => ''), sync: vi.fn(async () => ({ text: '', removed: [] })), trashChanged: vi.fn(async () => {}),
    toast: vi.fn(), failure: vi.fn(),
  };
}

function props(patch: Partial<ItemDetailProps> = {}): ItemDetailProps {
  return {
    id: 1, queue: null, relatedLimit: 0, helpers: helpers(), actions: actions(),
    grid: { helpers: {} as ItemDetailProps['grid']['helpers'], actions: {} as ItemDetailProps['grid']['actions'] },
    layout: {} as ItemDetailProps['layout'], selectMode: false, selected: new Set(), seekSeconds: 10, ...patch,
  };
}

/** A fake server: write endpoints reply per `answer`, read endpoints return the copy given in `reads`. */
function serve(answer: (url: string, body: Record<string, unknown>) => unknown = () => ({ ok: true }),
  reads: Record<string, unknown> = {}) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      return { ok: true, status: 200, json: async () => answer(url, body) };
    }
    const found = Object.entries(reads).find(([prefix]) => url.startsWith(prefix));
    return found ? { ok: true, status: 200, json: async () => structuredClone(found[1]) } : { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
const posts = (fetcher: ReturnType<typeof serve>) => fetcher.mock.calls
  .filter(([, init]) => init?.method === 'POST').map(([url, init]) => [url, JSON.parse(String(init!.body))]);

/** The entry is already cached (clicked in from a card, fetched on first screen), so draw right away. */
async function show(shown: DetailItem, patch: Partial<ItemDetailProps> = {}) {
  queryClient.setQueryData(itemKey(shown.id), shown);
  const given = props({ id: shown.id, ...patch });
  const host = await mount(<QueryClientProvider client={queryClient}><ItemDetailPage {...given} /></QueryClientProvider>);
  await settle();
  return { host, props: given, actions: given.actions as ActionMocks };
}

describe('Completing', () => {
  it('While a just-added work is still completing profiles it marks the running item; once a refetch shows completion it collapses', async () => {
    const fetcher = serve(() => ({ ok: true }), { '/api/item?id=1': item(1) });
    const busy = [{ task_key: 'download-postprocess', label: 'Cloud download post-processing', status: 'running' }];
    const { host } = await show(item(1, { pending_work: busy }));
    expect(host.querySelector('[data-pending-work]')?.textContent).toBe('Completing: Cloud download post-processing');
    await act(async () => { await queryClient.refetchQueries({ queryKey: itemKey(1) }) });
    await settle();
    expect(fetcher.mock.calls.some(([url]) => String(url).startsWith('/api/item?id=1'))).toBe(true);
    expect(host.querySelector('[data-pending-work]')).toBeNull();
  });
});

describe('Tag identity', () => {
  it('Details show the full costume and character names', async () => {
    serve();
    const { host } = await show(item(1, { tags: [{ k: 'OL uniform' }, { k: 'Secretary OL' }] }),
      { helpers: helpers({ tagLabel }) });
    expect([...host.querySelectorAll('[data-detail-tag] [data-tag]')].map((node) => node.textContent))
      .toEqual(['OL uniform', 'Secretary OL']);
  });

  it('Adding a synonym to an existing canonical tag keeps one tag and never un-tags the original', async () => {
    const fetcher = serve((_url, body) => ({ ok: true, tag: body.operation === 'add' ? 'Secretary OL' : body.tag }));
    const { host, actions: given } = await show(item(1, { tags: [{ k: 'Secretary OL' }] }));
    await click(host.querySelector('#tagPlus'));
    await type(host.querySelector('#tagPickSearch') as HTMLInputElement, 'OL');
    await click(host.querySelector('[data-pick="OL"]'));
    await settle();
    expect([...host.querySelectorAll('[data-detail-tag] [data-tag]')].map((node) => node.textContent))
      .toEqual(['Secretary OL']);
    expect(given.toast.mock.calls.at(-1)?.[1]?.undo).toBeUndefined();
    expect(posts(fetcher).map(([, body]) => [body.operation, body.tag])).toEqual([['add', 'OL']]);
  });

  it('Adding a synonym tag uses the server canonical name and undoes with the same identity', async () => {
    const fetcher = serve((_url, body) => ({ ok: true, tag: body.operation === 'add' ? 'Secretary OL' : body.tag }));
    const { host, actions: given } = await show(item(1, { tags: [] }));
    await click(host.querySelector('#tagPlus'));
    await type(host.querySelector('#tagPickSearch') as HTMLInputElement, 'OL');
    await click(host.querySelector('[data-pick="OL"]'));
    await settle();
    expect([...host.querySelectorAll('[data-detail-tag] [data-tag]')].map((node) => node.textContent))
      .toEqual(['Secretary OL']);
    const undo = given.toast.mock.calls.at(-1)?.[1]?.undo;
    expect(undo).toBeTypeOf('function');
    await act(async () => { await undo?.() });
    expect(posts(fetcher).map(([, body]) => [body.operation, body.tag]))
      .toEqual([['add', 'OL'], ['remove', 'Secretary OL']]);
  });
});

describe('Which queue entry it stopped on', () => {
  it('Volumes continue onto the next volume of the same edition, holding at edition boundaries', async () => {
    const versions = queue('editions', [1, 2, 3], {
      versionCount: 2,
      items: [row(1, { version_id: 1 }), row(2, { version_id: 2, part_label: '1' }),
        row(3, { version_id: 2, part_label: '2' })],
    });
    expect(nextPart(versions, 1)).toBeNull();
    expect(nextPart(versions, 2)?.id).toBe(3);
    expect(nextPart(versions, 3)).toBeNull();
    queryClient.setQueryData(queueKey({ kind: 'editions', seedId: 1 }), versions);
    const { host, actions: acts } = await show(item(2), { queue: { kind: 'editions', seedId: 1 } });
    const media = host.querySelector('[data-item-media]')!;
    media.dispatchEvent(new Event('ended', { bubbles: false }));
    expect(acts.openQueueItem).toHaveBeenCalledWith({ kind: 'editions', seedId: 1, autoplay: true }, 3);
  });
  it('Mix plays exactly the clicked item; volumes and editions fall back to the first item when the clicked one is not in the group; playlists fall back to the resume position', () => {
    expect(chooseItem(queue('mix', [1, 2]), 9)).toBe(9);
    expect(chooseItem(queue('parts', [1, 2]), 2)).toBe(2);
    expect(chooseItem(queue('editions', [1, 2]), 9)).toBe(1);
    expect(chooseItem(queue('playlist', [1, 2], { currentAssetId: 2 }), null)).toBe(2);
    expect(chooseItem(queue('playlist', [1, 2]), null)).toBe(1);
    expect(chooseItem(queue('playlist', []), null)).toBeNull();
  });

  it('The playlist skips vanished items: if the resume position or the clicked item is gone, fall back to the first playable one', () => {
    const items = [row(1, { disposal: 'vanished' }), row(2), row(3)];
    expect(chooseItem(queue('playlist', [], { items, currentAssetId: 1 }), null)).toBe(2);
    expect(chooseItem(queue('playlist', [], { items }), 1)).toBe(2);
    expect(chooseItem(queue('playlist', [], { items, currentAssetId: 3 }), null)).toBe(3);
    expect(chooseItem(queue('playlist', [], { items: [row(1, { disposal: 'vanished' })] }), null)).toBeNull();
  });

  it('Volume tags are patched into the title only from the volumes queue; other queues do not touch this entry', () => {
    const parts = queue('parts', [1, 2], { items: [row(1, { part_label: '1' }), row(2, { part_label: '2' })] });
    expect(withPartLabel(item(2), parts).part_label).toBe('2');
    const plain = item(2);
    expect(withPartLabel(plain, queue('mix', [2]))).toBe(plain);
  });

  it('Features and extras use full labels in titles and queues, and numbered volumes keep their index', async () => {
    serve();
    const ref = { kind: 'parts', seedId: 1 } as const;
    queryClient.setQueryData(queueKey(ref), queue('parts', [1, 2, 3], {
      items: [row(1, { part_label: 'Feature' }), row(2, { part_label: 'Extra 1' }), row(3, { part_label: '0' })],
    }));
    const { host } = await show(item(2), { queue: ref });
    expect(host.querySelector('.partlabel')?.textContent).toBe('Extra 1');
    expect(host.querySelector('[data-queue-item="1"]')?.textContent).toContain('Feature');
    expect(host.querySelector('[data-queue-item="2"]')?.textContent).toContain('Extra 1');
    expect(host.querySelector('[data-queue-item="3"]')?.textContent).toContain('Volume 0');
    expect(host.textContent).not.toContain(' Extra ');
  });

  it('Letter volumes read "Volume A" per the capitalized code suffix', async () => {
    serve();
    const ref = { kind: 'parts', seedId: 1 } as const;
    queryClient.setQueryData(queueKey(ref), queue('parts', [1, 2], {
      items: [row(1, { part_label: 'a' }), row(2, { part_label: 'B' })],
    }));
    const { host } = await show(item(1), { queue: ref });
    expect(host.querySelector('[data-queue-item="1"]')?.textContent).toContain('No preview—Usample_1.mp4A volumes');
    expect(host.querySelector('[data-queue-item="2"]')?.textContent).toContain('No preview—Usample_2.mp4B volumes');
    expect(host.textContent).not.toContain('Volume a');
  });

  it('Queue heads: edition queues write counts only, the rest carry titles', () => {
    expect(queueCopy(queue('editions', [1, 2]))).toEqual({ title: 'Editions', summary: '2 editions' });
    const versions = queue('editions', [1, 2, 3], {
      versionCount: 2,
      items: [row(1, { version_id: 1 }), row(2, { version_id: 2, part_label: '1' }),
        row(3, { version_id: 2, part_label: '2' })],
    });
    expect(queueCopy(versions).summary).toBe('2 editions');
    expect(withPartLabel(item(3), versions).part_label).toBe('2');
    expect(queueCopy(queue('parts', [1, 2, 3], { title: 'Volumes · PCH-021' }))).toEqual({ title: 'Volumes', summary: 'Volumes · PCH-021 · 3 volumes' });
    expect(queueCopy(queue('playlist', [1], { title: 'Weekend playlist' }))).toEqual({ title: 'Playlists', summary: 'Weekend playlist · 1 video' });
    const many = Array.from({ length: 1284 }, (_, i) => i + 1);
    expect(queueCopy(queue('parts', many, { title: 'Volumes' })).summary).toBe('Volumes · 1,284');
  });

  it('The new order after dragging: placed before or after the target', () => {
    expect(movedOrder([1, 2, 3, 4], 4, 2, false)).toEqual([1, 4, 2, 3]);
    expect(movedOrder([1, 2, 3, 4], 1, 3, true)).toEqual([2, 3, 1, 4]);
  });
});

describe('Identity and tags', () => {
  it('Same names appear once; a flat label carries its mark availability; labels and series do not count as attribution', () => {
    const groups = identityGroups(item(1, {
      performers: ['A'], studio: 'S', has_studio_logo: true, studio_logo_version: '9a',
      entity_refs: { performer: [{ id: 1, name: 'A' }, { id: 2, name: 'a' }], series: [{ id: 3, name: 'A' }] },
    }));
    expect(groups.cast.map((ref) => ref.name)).toEqual(['A']);
    expect(groups.studios).toEqual([{ id: null, name: 'S', has_logo: true, logo_version: '9a' }]);
    expect(groups.series).toEqual([]);
    expect(identityGroups(item(2, { performers: [], studio: 'S', creator: '' })).unowned).toBe(true);
    expect(identityGroups(item(3, { performers: [], creator: 'Someone' })).unowned).toBe(false);
  });

  it('Tags drop duration tiers, and deduping by display name keeps the entry that is itself the canonical name', () => {
    const tags = detailTags(item(1, { tags: [{ k: 'Long - over 30 min' }, { k: 'Old name' }, { k: 'Canonical name' }, { k: 'Drama' }] }),
      { tagLabel: (tag) => (tag === 'Old name' ? 'Canonical name' : tag), isDurationTag: (tag) => tag.startsWith('Long videos') });
    expect(tags.map((tag) => tag.k)).toEqual(['Canonical name', 'Drama']);
  });

  it('Tag picker: with no input it lists recent plus all; "Create" appears only when the typed word has no exact match', () => {
    const candidates = [{ k: 'Drama', n: 3 }, { k: 'Story-driven', n: 1 }];
    expect(pickerSections('', candidates, ['Drama', 'Old tag'])).toEqual({
      recent: [{ k: 'Drama', n: 3 }, { k: 'Old tag', n: 0 }], results: candidates, create: '',
    });
    expect(pickerSections('Drama', candidates, []).create).toBe('');
    expect(pickerSections('', candidates, []).create).toBe('');
  });

  it('Rating: star n sends n×20, and clicking the current star again sends 0', () => {
    expect([nextRating(60, 3), nextRating(60, 4), nextRating(null, 1)]).toEqual([0, 80, 20]);
    expect([nextRating(65, 3), nextRating(85, 4)]).toEqual([0, 0]);
    expect([ratingText(60), ratingText(0), ratingText(null)]).toEqual(['3 stars', 'Unrated', 'Unrated']);
  });

  it('The explainer in front of the playback area: not mounted, online video cannot be looked up, or a paid source', () => {
    expect(mediaGate(item(1), true)).toBe('offline');
    expect(mediaGate(item(1, { location: 'online' }), false)).toBe('online');
    expect(mediaGate(item(1, { location: 'online', follow_item_id: 5 } as Partial<DetailItem>), false)).toBe('');
    expect(mediaGate(item(1, { cost: 'metered' }), false)).toBe('metered');
    expect(mediaGate(item(1), false)).toBe('');
    expect(mediaGate(item(1, { name: 'ABC-123.ISO' }), false)).toBe('disc');
  });
});

describe('First-screen fetch', () => {
  const signal = new AbortController().signal;

  it('Saved online videos convert to follow details; entries no longer present collapse the stage', async () => {
    serve(undefined, { '/api/item?id=1': item(1, { location: 'online', follow_item_id: 9 } as Partial<DetailItem>),
      '/api/item?id=2': { error: 'gone' } });
    const first = props({ id: 1 });
    await prefetchItemDetail(first, signal);
    expect(first.actions.redirect).toHaveBeenCalledWith({ kind: 'follow', id: 9 });
    const second = props({ id: 2 });
    await prefetchItemDetail(second, signal);
    expect(second.actions.redirect).toHaveBeenCalledWith({ kind: 'gone' });
  });

  it('If the queue is unavailable, fall back to normal details; if the playlist empties, return to the list page', async () => {
    serve(undefined, { '/api/parts?id=1': { error: 'This group no longer exists' },
      '/api/playlist?id=7': { id: 7, name: 'empty', items: [], current_asset_id: null } });
    const parts = props({ id: 1, queue: { kind: 'parts', seedId: 1, fresh: true } });
    await prefetchItemDetail(parts, signal);
    expect(parts.actions.redirect).toHaveBeenCalledWith({ kind: 'item', id: 1 });
    const playlist = props({ id: null, queue: { kind: 'playlist', playlistId: 7, fresh: true } });
    await prefetchItemDetail(playlist, signal);
    expect(playlist.actions.redirect).toHaveBeenCalledWith({ kind: 'playlists' });
  });

  it('Switching items within one queue reads cache without refetching; only entering from outside refetches', async () => {
    const fetcher = serve(undefined, { '/api/parts?id=1': { title: 'PCH', items: [row(1), row(2)] }, '/api/item?id=2': item(2) });
    queryClient.setQueryData(queueKey({ kind: 'parts', seedId: 1 }), queue('parts', [1, 2]));
    await prefetchItemDetail(props({ id: 2, queue: { kind: 'parts', seedId: 1, fresh: false } }), signal);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/item?id=2']);
    await prefetchItemDetail(props({ id: 2, queue: { kind: 'parts', seedId: 1, fresh: true } }), signal);
    expect(fetcher.mock.calls.map(([url]) => url)).toContain('/api/parts?id=1');
  });

  it('Reopening the same item refetches: the cached copy is from the last open; the Mix seed was just fetched with the queue and is not fetched twice', async () => {
    const fetcher = serve(undefined, { '/api/item?id=1': item(1, { rating: 100 }) });
    queryClient.setQueryData(itemKey(1), item(1, { rating: 20 }));
    await prefetchItemDetail(props({ id: 1 }), signal);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/item?id=1']);
    expect(queryClient.getQueryData<DetailItem>(itemKey(1))?.rating).toBe(100);
    fetcher.mockClear();
    await prefetchItemDetail(props({ id: 1, queue: { kind: 'mix', seedId: 1, fresh: true } }), signal);
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/item?id=1']);
  });
});

describe('Handed to the shell', () => {
  it('Reports present once painted; the media box of the playback area goes to mountPlayer, and without autoplay no autoplay is passed', async () => {
    serve();
    const { host, actions: done } = await show(item(1));
    expect(done.present).toHaveBeenCalledTimes(1);
    const frame = host.querySelector('[data-item-media="video"]');
    expect(done.mountPlayer).toHaveBeenCalledWith(frame, expect.objectContaining({ id: 1 }), null, undefined);
    expect(host.querySelector('video')).toBeNull();
  });

  it('Unmounted and online-blocked states mount no player; metered sources mount one with autoplay only after the note is clicked', async () => {
    serve();
    const offline = await show(item(1), { helpers: helpers({ sourceOffline: () => true }) });
    expect(offline.host.querySelector('[data-item-gate="offline"]')?.textContent).toContain('The drive is not mounted');
    expect(offline.actions.mountPlayer).not.toHaveBeenCalled();
    queryClient.clear();
    const metered = await show(item(2, { cost: 'metered' }));
    expect(metered.actions.mountPlayer).not.toHaveBeenCalled();
    await click(metered.host.querySelector('[data-item-gate="metered"]'));
    expect(metered.actions.mountPlayer).toHaveBeenCalledWith(metered.host.querySelector('[data-item-media="metered"]'), expect.objectContaining({ id: 2 }), null,
      { autoplay: true });
  });

  it('Clicking another item in the queue hands the switch to the shell with the queue reference', async () => {
    serve();
    queryClient.setQueryData(queueKey({ kind: 'mix', seedId: 1 }), queue('mix', [1, 2, 3]));
    const { host, actions: done } = await show(item(1), { queue: { kind: 'mix', seedId: 1 } });
    expect(host.querySelector('[data-queue-item="1"]')?.getAttribute('aria-current')).toBe('true');
    await click(host.querySelector('[data-queue-item="3"]'));
    expect(done.openQueueItem).toHaveBeenCalledWith({ kind: 'mix', seedId: 1, playlistId: undefined }, 3);
  });

  it('Vanished playlist rows mark themselves and never open', async () => {
    serve();
    queryClient.setQueryData(queueKey({ kind: 'playlist', playlistId: 7 }), queue('playlist', [], {
      playlistId: 7, items: [row(2), row(3, { disposal: 'vanished' })],
    }));
    const { host, actions: done } = await show(item(2), { queue: { kind: 'playlist', playlistId: 7 } });
    const gone = host.querySelector<HTMLButtonElement>('[data-queue-item="3"]');
    expect(gone?.disabled).toBe(true);
    expect(gone?.hasAttribute('data-queue-vanished')).toBe(true);
    expect(gone?.textContent).toContain('Vanished · file no longer on disk');
    expect(host.querySelector<HTMLButtonElement>('[data-queue-item="2"]')?.disabled).toBe(false);
    await click(gone);
    expect(done.openQueueItem).not.toHaveBeenCalled();
  });
});

describe('After the write', () => {
  it('Ratings write into the details cache and the same catalog card; the receipt\'s undo restores the original score', async () => {
    const fetcher = serve((_url, body) => ({ rating: body.value || null }));
    const page: InfiniteData<GridPage> = { pages: [{ items: [{ id: 1, rating: 60 } as MediaItem], offset: 0 } as GridPage], pageParams: [0] };
    queryClient.setQueryData(['catalog-grid', 'catalog', '', 0], page);
    const { host, actions: done } = await show(item(1));
    await click(host.querySelector('[data-rate="3"]'));
    await settle();
    expect(host.querySelector('[data-rating-value]')?.textContent).toBe('Unrated');
    expect(queryClient.getQueryData<DetailItem>(itemKey(1))?.rating).toBeNull();
    expect(queryClient.getQueryData<InfiniteData<GridPage>>(['catalog-grid', 'catalog', '', 0])?.pages[0]?.items[0]?.rating).toBeNull();
    const [message, options] = done.toast.mock.calls[0]!;
    expect(message).toBe('Rating removed');
    await options!.undo!();
    await settle();
    expect(host.querySelector('[data-rating-value]')?.textContent).toBe('3 stars');
    expect(posts(fetcher).map(([, body]) => body.value)).toEqual([0, 60]);
  });

  it('The feedback undo toggles back once, then the shell decides whether the junk files tier needs a refetch', async () => {
    const fetcher = serve((_url, body) => ({ feedback: body.kind === 'dislike' ? 'dislike' : null, disposal: null }));
    const { host, actions: done } = await show(item(1));
    await click(host.querySelector('[data-kind="dislike"]'));
    await settle();
    expect(host.querySelector('[data-kind="dislike"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(done.toast.mock.calls[0]![0]).toBe('Marked as not my taste');
    await done.toast.mock.calls[0]![1]!.undo!();
    expect(posts(fetcher).map(([, body]) => body.kind)).toEqual(['dislike', 'dislike']);
    expect(done.trashChanged).toHaveBeenCalledWith(null, true);
  });

  it('After moving to trash it hands over to the shell: this tier may need it removed from the list', async () => {
    serve(() => ({ feedback: null, disposal: 'trash' }));
    const { host, actions: done } = await show(item(1));
    await click(host.querySelector('[data-kind="dispose"]'));
    await settle();
    expect(done.trashChanged).toHaveBeenCalledWith('trash', false);
    expect(done.toast.mock.calls[0]![0]).toBe('Moved to trash');
  });

  it('Tag deletion writes to cache; undo adds it back', async () => {
    const fetcher = serve(() => ({ ok: true }));
    const { host, actions: done } = await show(item(1));
    await click(host.querySelector('[data-remove-tag="plot"]'));
    await settle();
    expect(host.querySelector('[data-tag="Drama"]')).toBeNull();
    expect(done.toast.mock.calls[0]![0]).toBe('Deleted tag "Story"');
    await done.toast.mock.calls[0]![1]!.undo!();
    await settle();
    expect(host.querySelector('[data-tag="Drama"]')).not.toBeNull();
    expect(posts(fetcher).map(([, body]) => [body.operation, body.tag])).toEqual([['remove', 'Drama'], ['add', 'Drama']]);
  });

  it('Write failures report through the shell with key states unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({ detail: 'Write failed' }) })));
    const { host, actions: done } = await show(item(1));
    await click(host.querySelector('#stageLater'));
    await settle();
    expect(done.failure).toHaveBeenCalledWith('Update Watch later', expect.anything());
    expect(host.querySelector('#stageLater')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('Find better version and record a climax: each receipt\'s undo writes back separately', async () => {
    const fetcher = serve((url, body) => (url === '/api/quality-goal'
      ? { better_version: !!body.wanted, better_version_reason: '' }
      : { feedback: null, disposal: null, o_count: body.kind === 'o' ? 2 : 1 }));
    const { host, actions: done } = await show(item(1, { o_count: 1 }));
    await click(host.querySelector('#betterVersion'));
    await settle();
    expect(host.querySelector('#betterVersion')?.getAttribute('aria-pressed')).toBe('true');
    expect(done.toast.mock.calls[0]![0]).toBe('Marked to find a better edition');
    await done.toast.mock.calls[0]![1]!.undo!();
    await settle();
    expect(host.querySelector('#betterVersion')?.getAttribute('aria-pressed')).toBe('false');
    await click(host.querySelector('[data-kind="o"]'));
    await settle();
    expect(host.querySelector('#oCount')?.textContent).toBe('2');
    await done.toast.mock.calls[1]![1]!.undo!();
    await settle();
    expect(host.querySelector('#oCount')?.textContent).toBe('1');
    expect(posts(fetcher).map(([url, body]) => [url, body.wanted ?? body.kind])).toEqual([
      ['/api/quality-goal', true], ['/api/quality-goal', false], ['/api/feedback', 'o'], ['/api/feedback', 'o-undo'],
    ]);
  });

  it('Favorite reason: the icon key opens the reason box; the key spins while submitting and a receipt lands when done', async () => {
    const reply = pending<unknown>();
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => ({ ok: true, status: 200,
      json: async () => url === '/api/local-players' ? { players: [] } : reply.answer }));
    vi.stubGlobal('fetch', fetcher);
    const { host, actions: done } = await show(item(1));
    const panel = host.querySelector<HTMLElement>('#preferencePanel')!;
    const toggle = host.querySelector('#preferenceToggle')!;
    expect(panel.hidden).toBe(true);
    await click(toggle);
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await typeText(host.querySelector('#likeReason'), 'Good shots');
    await click(host.querySelector('#savePreference'));
    const save = host.querySelector('#savePreference')!;
    expect(save.getAttribute('aria-busy')).toBe('true');
    expect(save.querySelector('[role="status"]')?.getAttribute('aria-label')).toBe('Submitting favorite reason');
    await reply.release({ liked: true, like_reason: 'Good shots' });
    await settle();
    expect(save.getAttribute('aria-busy')).toBeNull();
    expect(save.textContent).toBe('Submit');
    expect(done.toast.mock.calls[0]![0]).toBe('Liked preferences saved');
    expect(posts(fetcher)).toEqual([['/api/preference', { id: 1, liked: true, reason: 'Good shots' }]]);
    await click(toggle);
    expect(panel.hidden).toBe(true);
  });
});

/** The order of two nodes in the document: `a` comes before `b`. */
const before = (a: Element | null, b: Element | null) =>
  !!a && !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
const glyph = (el: Element | null | undefined) => el?.querySelector('use')?.getAttribute('href');

async function typeText(field: HTMLTextAreaElement | null, value: string) {
  if (!field) throw new Error('The input never painted');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('How the sidebar reads', () => {
  it('The rating sits between the title and the specs row; the current star\'s screen reader name says undo; each spec item leads with an icon', async () => {
    serve();
    const { host } = await show(item(1, { width: 1920, height: 1080, release_date: '2026-08-01' }));
    const rating = host.querySelector('#detailRating');
    expect(before(host.querySelector('[data-detail-title]'), rating)).toBe(true);
    expect(before(rating, host.querySelector('[data-stage-meta]'))).toBe(true);
    expect(host.querySelector('[data-rate="3"]')?.getAttribute('aria-label')).toBe('Clear rating (currently 3 stars)');
    expect(host.querySelector('[data-rate="4"]')?.getAttribute('aria-label')).toBe('Rate 4 stars');
    expect([...host.querySelectorAll('[data-stage-meta] [data-spec-item]')].map(glyph)).toEqual(['#i-monitor', '#i-hard-drive', '#i-calendar']);
    expect(host.querySelector('[data-stage-meta]')?.textContent).not.toContain('Release');
    expect(host.querySelector('#ratioTxt')?.textContent).toBe('0%');
  });

  it('Without dimensions the specs row writes no resolution, and an unrecorded size reads "Size unknown"', async () => {
    serve();
    const { host } = await show(item(1, { width: null, height: null, size: 0 } as Partial<DetailItem>));
    expect([...host.querySelectorAll('[data-stage-meta] [data-spec-item]')].map(glyph)).toEqual(['#i-hard-drive']);
    expect(host.querySelector('[data-stage-meta]')?.textContent).toBe('Unknown size');
  });

  it('Identity groups by kind with group titles on top; entries without an entity id show the name only; labels ask for the icon variant only when a mark is installed; series are icon links', async () => {
    serve();
    const { host, actions: done } = await show(item(1, {
      is_jav: true, performers: ['七海ひな', '桜井まい'],
      entity_refs: {
        performer: [{ id: 1, name: '七海ひな' }, { id: null, name: '桜井まい' }],
        studio: [{ id: 5, name: 'Peach Studio', has_logo: true }],
        series: [{ id: 7, name: 'Summer series' }],
      },
    } as Partial<DetailItem>));
    const groups = [...host.querySelectorAll('[data-item-identity] [data-id-group]')];
    expect(groups.map((group) => group.querySelector('[data-id-label]')?.textContent)).toEqual(['Performers', 'Labels', 'Series']);
    expect(host.querySelector('[data-entity-name="七海ひな"]')?.tagName).toBe('BUTTON');
    const bare = [...host.querySelectorAll('[data-id-cell]')].find((cell) => cell.textContent?.includes('桜井まい'));
    expect(bare?.tagName).toBe('SPAN');
    expect(bare?.hasAttribute('data-entity-kind')).toBe(false);
    expect(host.querySelector('[data-id-cell="studio"] img')?.getAttribute('src')).toBe('/logo?studio=Peach%20Studio&variant=icon');
    const series = host.querySelector('[data-series-link]');
    expect(glyph(series)).toBe('#i-tags');
    await click(series);
    expect(done.openEntity).toHaveBeenCalledWith('series', 'Summer series');
  });

  it('The cast group writes performer for coded videos and artist for the rest; cells with an entity image render by the framing and version on the ref, and cells without show only an initial', async () => {
    serve();
    const { host } = await show(item(1, {
      performers: ['Alpha', 'Beta'],
      entity_refs: { performer: [
        { id: 3, name: 'Alpha', has_image: true, image_version: '9', avatar_focus: { axis: 'x', pct: 30 } }, { id: 4, name: 'Beta' },
      ] },
    } as Partial<DetailItem>));
    expect(host.querySelector('[data-id-group="performer"] [data-id-label]')?.textContent).toBe('Artists');
    const framed = host.querySelector<HTMLImageElement>('[data-entity-name="Alpha"] img');
    expect([framed?.getAttribute('src'), framed?.style.objectPosition]).toEqual(['/entity-image?kind=performer&id=3&thumb=1&v=9', '30% 50%']);
    expect(framed?.parentElement).toBe(host.querySelector('[data-entity-name="Alpha"] [data-id-face]'));
    expect(host.querySelector('[data-entity-name="Beta"] img')).toBeNull();
    expect(host.querySelector('[data-entity-name="Beta"]')?.textContent).toContain('Beta');
  });

  it('When nobody is credited, the attribution group is the "Unattributed" entry', async () => {
    serve();
    const { host, actions: done } = await show(item(1, { performers: [], creator: '', entity_refs: {} } as Partial<DetailItem>));
    const group = host.querySelector('[data-id-group="unowned"]');
    expect(group?.querySelector('[data-id-label]')?.textContent).toBe('Attribution');
    await click(group?.querySelector('[data-open-unowned]'));
    expect(done.openUnowned).toHaveBeenCalled();
  });

  it('Actions in video details belong to the current video', async () => {
    serve();
    const shown = item(1, { code: 'ABC-123' } as Partial<DetailItem>);
    const { host } = await show(shown);
    expect(host.querySelector('[data-fb="cloud-download"]')).toBeNull();
    expect(host.querySelector('#addPlaylist')?.getAttribute('aria-label')).toBe('Add to playlist');
  });

  it('Every key\'s glyph describes only what sits beside it', async () => {
    serve();
    queryClient.setQueryData(queueKey({ kind: 'mix', seedId: 1 }), queue('mix', [1, 2]));
    const mix = await show(item(1, { liked: true }), { queue: { kind: 'mix', seedId: 1 } });
    expect(glyph(mix.host.querySelector('#preferenceToggle'))).toBe('#i-notebook-pen');
    expect(mix.host.querySelector('#likeBtn')?.getAttribute('aria-label')).toBe('Unfavorite');
    expect(glyph(mix.host.querySelector('#addPlaylist'))).toBe('#i-playlist');
    expect(glyph(mix.host.querySelector('[data-save-mix]'))).toBe('#i-playlist');
    expect(glyph(mix.host.querySelector('[data-kind="o"]'))).toBe('#i-sperm');
    expect(glyph(mix.host.querySelector('[data-rate="1"]'))).toBe('#i-star');
    queryClient.clear();
    queryClient.setQueryData(queueKey({ kind: 'playlist', playlistId: 7 }), queue('playlist', [2, 3], { playlistId: 7 }));
    const playlist = await show(item(2), { queue: { kind: 'playlist', playlistId: 7 } });
    expect(glyph(playlist.host.querySelector('[data-edit-playlist]'))).toBe('#i-playlist');
  });

  it('Each edition queue row carries an edition badge colored by edition', async () => {
    serve();
    queryClient.setQueryData(queueKey({ kind: 'editions', seedId: 1 }), queue('editions', [1, 2], {
      items: [row(1, { edition_label: 'Chinese subs' }), row(2, { edition_label: 'Uncensored' })],
    }));
    const { host } = await show(item(1), { queue: { kind: 'editions', seedId: 1 } });
    expect([...host.querySelectorAll('[data-queue-edition]')].map((badge) => [badge.textContent, badge.className])).toEqual([
      ['Chinese subs', 'javedition subtitle'], ['Uncensored', 'javedition uncensored'],
    ]);
  });

  it('Continue watching shows an explainer when empty; closing recommendations and the Mix queue hides the recommendations area', async () => {
    serve(undefined, { '/api/related': { items: [] } });
    const off = await show(item(1), { relatedLimit: 0 });
    expect(off.host.querySelector('[data-item-related]')).toBeNull();
    queryClient.setQueryData(queueKey({ kind: 'mix', seedId: 2 }), queue('mix', [2, 3]));
    const queued = await show(item(2), { relatedLimit: 12, queue: { kind: 'mix', seedId: 2 } });
    expect(queued.host.querySelector('[data-item-related]')).toBeNull();
    const empty = await show(item(3), { relatedLimit: 12 });
    await settle();
    expect(empty.host.querySelector('[data-item-related] [data-empty-state] h3')?.textContent).toBe('Nothing to continue watching yet');
    expect(empty.host.querySelector('[data-item-related] [data-empty-state] p')?.textContent).toBe('You can go back to the list to pick another video.');
  });

  it('Tag picker: no filtering during composition; arrow keys pick and Enter adds; Escape collapses; clicking outside collapses too', async () => {
    Element.prototype.scrollIntoView ??= () => {};
    const fetcher = serve(() => ({ ok: true }));
    const candidates = [{ k: 'Big breasts', n: 3 }, { k: 'Creampie', n: 2 }];
    const { host } = await show(item(1), { helpers: helpers({ tagCandidates: () => candidates }) });
    const picker = host.querySelector<HTMLElement>('#tagPicker')!;
    const input = host.querySelector<HTMLInputElement>('#tagPickSearch')!;
    const names = () => [...picker.querySelectorAll('[data-pick]')].map((pick) => pick.getAttribute('data-pick'));
    const key = (name: string) => act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true })) });
    await click(host.querySelector('#tagPlus'));
    expect(picker.hidden).toBe(false);
    await act(async () => { input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })) });
    await type(input, 'zhon');
    expect(names()).toEqual(['Big breasts', 'Creampie']);
    await type(input, 'medium');
    await act(async () => { input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })) });
    expect(names()).toEqual(['Creampie', 'medium']);
    await key('ArrowDown');
    await key('Enter');
    await settle();
    await vi.waitFor(() => expect(picker.hidden).toBe(true));
    expect(posts(fetcher).map(([, body]) => [body.operation, body.tag])).toEqual([['add', 'Creampie']]);
    await click(host.querySelector('#tagPlus'));
    await key('Escape');
    await vi.waitFor(() => expect(picker.hidden).toBe(true));
    expect(document.activeElement).toBe(host.querySelector('#tagPlus'));
    await click(host.querySelector('#tagPlus'));
    await act(async () => { await new Promise((done) => setTimeout(done, 0)) });
    await act(async () => { document.body.dispatchEvent(new MouseEvent('click', { bubbles: true })) });
    await vi.waitFor(() => expect(picker.hidden).toBe(true));
  });
});
