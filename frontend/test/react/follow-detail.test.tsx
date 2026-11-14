/* Follow detail island: single-entry fetching, the sidebar's order and copy, how key states change after writes, where it
 * falls back when media cannot be fetched, and what is handed to the shell and the lightbox.
 *
 * Entering and leaving from the list without refetch, the stage mounting Video.js in the media frame, carousel dots, the
 * restore band, tags returning to the list and phone layout need a real browser, measured in
 * `frontend/e2e/follow-detail.test.ts`; sizes and palette in `e2e/design-*.test.ts`. */
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  collectionCopy, detailTags, followItemKey, tagCategory,
  type FollowDetailActions, type FollowDetailData, type FollowDetailItem, type FollowDetailProps,
} from '../../src/react/follow-detail/follow-detail';
import { FollowDetailPage } from '../../src/react/follow-detail/follow-detail-page';
import { followRelatedKey } from '../../src/react/follow-detail/follow-related';
import { FOLLOW_CREDENTIALS_KEY, setFollowItemStatus, type FollowFeedHelpers, type FollowGroup } from '../../src/react/follow-feed/follow-feed';
import { openPhotoLightbox } from '../../src/react/photo-lightbox/photo-lightbox-dialog';
import { queryClient } from '../../src/react/query';
import { wantFollowKey } from '../../src/react/wants/wants';
import { buttonNamed, click, mount, pending, settle, type } from './render';

/* The lightbox's own open/close and paging live in `photo-lightbox.test.tsx`; this only checks which group and which starting index the detail hands over. */
vi.mock('../../src/react/photo-lightbox/photo-lightbox-dialog', () => ({ openPhotoLightbox: vi.fn(async () => {}) }));

afterEach(() => { queryClient.clear() });
notifyManager.setScheduler((notify) => notify());

const item = (id: number, extra: Partial<FollowDetailItem> = {}): FollowDetailItem => ({
  id, title: `Update ${id}`, status: 'new', provider: 'kemono', provider_label: 'Kemono', source_id: 1,
  published_at: `2026-09-${String(10 + (id % 10)).padStart(2, '0')}T08:00:00Z`, media_kind: 'video', playable: true,
  thumb_url: `/thumb/${id}`, tags: [], media_items: [], ...extra,
});
const group = (primary: FollowDetailItem, extra: Partial<FollowGroup> = {}): FollowGroup =>
  ({ primary, variants: [], duplicates: [], stack: null, ...extra });
const image = (index: number, extra: Record<string, unknown> = {}) => ({
  index, media_kind: 'image', thumb_url: `/thumb/m${index}`, name: `${index}.jpg`, width: 600, height: 800, ...extra,
});

function helpers(patch: Partial<FollowFeedHelpers> = {}): FollowFeedHelpers {
  return {
    workMark: () => '', tagLabel: (tag) => tag,
    wireDrag: vi.fn(), wireScroller: vi.fn(), listSkeletonHtml: () => '', jobProgress: vi.fn(),
    ...patch,
  };
}

type ActionMocks = { [K in keyof FollowDetailActions]: Mock<FollowDetailActions[K]> };

function actions(): ActionMocks {
  return {
    close: vi.fn(), openItem: vi.fn(), openAuthor: vi.fn(), openTag: vi.fn(), present: vi.fn(), mountPlayer: vi.fn(() => vi.fn()),
    toast: vi.fn(), failure: vi.fn(), canFlip: vi.fn(() => false),
  };
}

const data = (shown: FollowDetailItem, row: FollowGroup | null = group(shown)): FollowDetailData =>
  ({ item: shown, group: row, sources: [], aliases: [] });

/** Fake server: credentials empty and never requested, write endpoints answer by `status`; single fetches return the given page. */
function serve({ page = null as unknown, status = 200 } = {}) {
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/follow/credentials')) return { ok: true, status: 200, json: async () => ({ providers: [] }) };
    if (url.startsWith('/api/tag-management')) return { ok: true, status: 200, json: async () => ({ items: [], duplicate_groups: [] }) };
    if (url.startsWith('/api/follow?item=')) return { ok: true, status: 200, json: async () => structuredClone(page) };
    if (url.startsWith('/api/wants?follow=')) return { ok: true, status: 200, json: async () => ({ want: null }) };
    if (init?.method === 'POST') return { ok: status < 400, status, json: async () => (status < 400 ? { ok: true } : { detail: 'Write failed' }) };
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
const posts = (fetcher: ReturnType<typeof serve>) => fetcher.mock.calls
  .filter(([, init]) => init?.method === 'POST').map(([url, init]) => [url, JSON.parse(String(init!.body))]);

/** Entry, credentials and wanted state are already in the cache (the arrived-from-list case), so render directly without a request. */
async function show(given: FollowDetailData, patch: Partial<FollowDetailProps> = {}) {
  queryClient.setQueryData(followItemKey(given.item.id), given);
  queryClient.setQueryData(FOLLOW_CREDENTIALS_KEY, { providers: [] });
  queryClient.setQueryData(wantFollowKey(given.item.id), { want: null });
  const props: FollowDetailProps = {
    id: given.item.id, mediaIndex: null, mediaView: 'videos', relatedLimit: 0, helpers: helpers(), actions: actions(), ...patch,
  };
  const host = await mount(<QueryClientProvider client={queryClient}><FollowDetailPage {...props} /></QueryClientProvider>);
  await settle();
  return { host, props, actions: props.actions as ActionMocks };
}

describe('Fetching', () => {
  it('Tag candidates keep the source category and show the selected check mark by canonical name', async () => {
    const fallback = serve();
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url.startsWith('/api/tag-management')
      ? Promise.resolve({ ok:true, json:async () => ({ items:[
        { k:'3D', n:4, cat:'general', aliases:[], hidden:false },
        { k:'角色', n:2, cat:'character', aliases:[], hidden:false },
        { k:'未知', n:1, cat:'unknown', aliases:[], hidden:false },
      ] }) }) : fallback(url, init)));
    const { host } = await show(data(item(8, { tags:['3d'], detail_tags:['3d'], tag_types:{ '3d':'general' } })));
    await click(host.querySelector('[aria-label="Add tag"]')); await settle();
    const selected = host.querySelector('[data-pick="3D"]')!;
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    expect(selected.getAttribute('data-tag-cat')).toBe('r34-general');
    expect(selected.querySelector('use')?.getAttribute('href')).toBe('#i-check');
    expect(host.querySelector('[data-pick="角色"]')?.getAttribute('data-tag-cat')).toBe('r34-character');
    expect(host.querySelector('[data-pick="未知"]')?.getAttribute('data-tag-cat')).toBe('r34-unknown');
  });

  it('Manual tag submission keeps input and busy state, updates details on success, and can then be removed', async () => {
    const original = item(8, { tags: ['source'], detail_tags: ['source'], custom_tags: [] });
    const updated = item(8, { tags: ['source', 'Featured'], detail_tags: ['source', 'Featured'], custom_tags: ['Featured'] });
    const sibling = item(9);
    const waiting = pending<{ ok: boolean; json(): Promise<unknown> }>();
    const fallback = serve();
    const fetcher = vi.fn((url: string, init?: RequestInit) => url === '/api/follow/tag'
      ? JSON.parse(String(init?.body)).operation === 'add' ? waiting.answer
        : Promise.resolve({ ok: true, json: async () => ({ item: original, group: group(original, { variants: [sibling] }) }) })
      : fallback(url, init));
    vi.stubGlobal('fetch', fetcher);
    const { host, actions: receipts } = await show(data(original));
    queryClient.setQueryData(followItemKey(sibling.id), data(sibling, group(original, { variants: [sibling] })));
    expect(buttonNamed('Manage tags', host)).toBeNull();
    await click(host.querySelector('[aria-label="Add tag"]'));
    const input = host.querySelector<HTMLInputElement>('#tagPickSearch')!;
    await type(input, 'Featured');
    await click(host.querySelector('[data-pick="Featured"]'));
    expect(host.querySelector('[data-pick="Featured"]')).toBeNull();
    expect(fetcher.mock.calls.filter(([url]) => url === '/api/follow/tag')).toHaveLength(1);
    expect(input.value).toBe('Featured');
    expect(host.querySelector('[aria-label="Add tag"]')?.getAttribute('aria-busy')).toBe('true');
    expect(receipts.toast).not.toHaveBeenCalled();
    await waiting.release({ ok: true, json: async () => ({ item: updated, group: group(updated, { variants: [sibling] }) }) });
    await settle();
    expect(host.querySelector('[data-follow-tag="Featured"]')).not.toBeNull();
    expect(queryClient.getQueryData<FollowDetailData>(followItemKey(sibling.id))?.group?.primary.tags).toContain('Featured');
    expect(receipts.toast).toHaveBeenCalledWith('Added tag "Featured"', expect.objectContaining({ undo: expect.any(Function) }));
    await click(host.querySelector('[aria-label="Delete tag Featured"]')); await settle();
    expect(host.querySelector('[data-follow-tag="Featured"]')).toBeNull();
    expect(host.querySelector('[data-follow-tag="source"]')).not.toBeNull();
  });

  it('When tags collapse, a just-added one still shows even inside the collapsed section', async () => {
    const many = Array.from({ length: 30 }, (_, index) => `t${String(index).padStart(2, '0')}`);
    const original = item(8, { tags: many, detail_tags: many, custom_tags: [] });
    const updated = item(8, { tags: [...many, 'zz'], detail_tags: [...many, 'zz'], custom_tags: ['zz'] });
    const fallback = serve();
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url === '/api/follow/tag'
      ? Promise.resolve({ ok: true, json: async () => ({ item: updated, group: group(updated) }) })
      : fallback(url, init)));
    const { host } = await show(data(original));
    expect(host.querySelectorAll('[data-detail-tag]')).toHaveLength(20);
    await click(host.querySelector('[aria-label="Add tag"]'));
    await type(host.querySelector<HTMLInputElement>('#tagPickSearch')!, 'zz');
    await click(host.querySelector('[data-pick="zz"]'));
    await settle();
    expect(host.querySelector('[data-follow-tag="zz"]')).not.toBeNull();
    expect(host.querySelector('[data-tags-more]')?.textContent).toBe('10 more');
  });

  it('Failed manual tags can reopen the picker to retry the original input with the reason shown', async () => {
    const fallback = serve();
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => url === '/api/follow/tag'
      ? Promise.resolve({ ok: false, status: 400, json: async () => ({ error: 'Tag name contains no comma' }) }) : fallback(url, init)));
    const { host, actions: receipts } = await show(data(item(8)));
    await click(host.querySelector('[aria-label="Add tag"]'));
    const input = host.querySelector<HTMLInputElement>('#tagPickSearch')!;
    await type(input, 'a,b');
    await click(host.querySelector('[data-pick="a,b"]')); await settle();
    await click(host.querySelector('[aria-label="Add tag"]'));
    expect(input.value).toBe('a,b');
    expect(host.textContent).toContain('Update 82026-09-18 15:00Creators?Creator unfetchedMedia not fetched: the upstream returned nothing this time, most likely site rate limiting. Try again shortly.Original image not fetched, showing the thumbnail for now: the upstream blocked this request.Search resultsCreate ');
    expect(receipts.toast).not.toHaveBeenCalled();
  });

  it('When the cache lacks this entry, fetch it singly via `/api/follow?item=`, and if the returned group does not contain it, report an error', async () => {
    const fetcher = serve({ page: { groups: [group(item(8))], sources: [], author_aliases: [] } });
    const props: FollowDetailProps = { id: 8, mediaIndex: null, mediaView: 'videos', relatedLimit: 0, helpers: helpers(), actions: actions() };
    const host = await mount(<QueryClientProvider client={queryClient}><FollowDetailPage {...props} /></QueryClientProvider>);
    await settle();
    expect(fetcher.mock.calls.map(([url]) => url)).toContain('/api/follow?item=8');
    expect(host.querySelector('[data-follow-detail-name]')?.textContent).toBe('Update 8');

    queryClient.clear();
    serve({ page: { groups: [], sources: [], author_aliases: [] } });
    const gone = await mount(<QueryClientProvider client={queryClient}><FollowDetailPage {...props} id={9} /></QueryClientProvider>);
    await vi.waitFor(async () => {
      await settle();
      expect(gone.textContent).toContain('This followed content no longer exists');
    });
    /* Entries that do not exist cannot be fetched even on retry: the only way out is back to follows. */
    const back = gone.querySelector('[data-follow-detail-gone] [data-note-action]');
    expect(back?.textContent).toBe('Back to follows');
    expect(gone.textContent).not.toContain('Retry');
    await click(back);
    expect(props.actions.close).toHaveBeenCalled();
  });
});

describe('Sidebar', () => {
  it('Creator avatar and name open the same profile page; modifier clicks keep browser link behavior', async () => {
    const { host, props } = await show({ ...data(item(14)), sources: [
      { id: 1, provider: 'kemono', author_name: 'Kou', author_key: 'name:kou', entity_id: 1, entity_name: 'Kou' },
    ] });
    const avatar = host.querySelector<HTMLAnchorElement>('a[data-follow-source-avatar]')!;
    expect(avatar.getAttribute('href')).toBe('/creators/1');
    await click(avatar);
    expect(props.actions.openAuthor).toHaveBeenCalledWith('Kou');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    avatar.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('Top to bottom: body, actions, one status line, tags; tags follow the rule34 type order', async () => {
    const { host } = await show(data(item(1, {
      summary: 'Body', detail_tags: ['solo', 'kou', 'ow', 'animated', 'odd', 'tracer'],
      tag_types: { ow: 'copyright', tracer: 'character', kou: 'artist', solo: 'general', animated: 'metadata' },
    })));
    const [summary, actionsBar, state, tags] = ['[data-follow-detail-summary]', '[data-follow-detail-actions]',
      '[data-follow-state]', '[data-follow-detail-tags]'].map((selector) => host.querySelector(selector)!);
    const follows = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect([follows(summary!, actionsBar!), follows(actionsBar!, state!), follows(state!, tags!)]).toEqual([true, true, true]);
    expect([...host.querySelectorAll<HTMLElement>('[data-follow-tag]')].map((tag) => [tag.dataset.followTag, tag.closest('[data-detail-tag]')?.getAttribute('data-tag-cat')]))
      .toEqual([['ow', 'r34-copyright'], ['tracer', 'r34-character'], ['kou', 'r34-artist'], ['solo', 'r34-general'],
        ['animated', 'r34-metadata'], ['odd', 'r34-unknown']]);
  });

  it('Source external links, drive links, and a download key; the uploader is written only when it differs from the byline author', async () => {
    const { host } = await show({ ...data(item(2, {
      url: 'https://example.invalid/post/2', author: 'Poster',
      resource_urls: ['https://gofile.io/d/a', 'https://mega.nz/folder/b', 'https://files.example.org/c'],
    })), sources: [{ id: 1, provider: 'kemono', author_name: 'Author' }] });
    const origin = host.querySelector('[data-follow-origin]')!;
    expect([origin.getAttribute('title'), origin.getAttribute('aria-label'), origin.getAttribute('href')])
      .toEqual(['Open the source page', 'Open the source page', 'https://example.invalid/post/2']);
    expect([...host.querySelectorAll('[data-follow-resources] a')].map((link) => link.textContent))
      .toEqual(['Gofile', 'MEGA', 'files.example.org']);
    const download = host.querySelector('[data-follow-download]')!;
    expect(download.hasAttribute('download')).toBe(true);
    expect(download.getAttribute('href')).toBe('/follow-stream?id=2&download=1');
    expect(host.querySelector('[data-follow-detail-identity] [data-id-name]')?.textContent).toBe('Author');
    expect(host.querySelector('[data-follow-detail-credit]')?.textContent).toBe('Uploader Poster');
  });

  it('With an empty title the title area and the media queue share the same "Untitled content" wording', async () => {
    const { host } = await show(data(item(5, { title: '', media_items: [
      { index: 0, media_kind: 'video', name: 'a.mp4', resource_group: 'g1' }, { ...image(1), resource_group: 'g1' },
    ] })));
    expect(host.querySelector('[data-follow-detail-name]')?.textContent).toBe('Untitled content');
    expect(host.querySelector('[data-follow-queue]')?.textContent).toContain('Untitled content · 2 media');
  });

  it('The summary collapses by default and only offers "Expand" when measured as truncated; after expanding the same button collapses it', async () => {
    const high = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(400);
    const box = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
    try {
      const { host } = await show(data(item(6, { summary: 'A very long body' })));
      const summary = host.querySelector('[data-follow-detail-summary]')!;
      expect(summary.hasAttribute('data-clamped')).toBe(true);
      const toggle = host.querySelector('[data-follow-summary-toggle]')!;
      expect(toggle.textContent).toBe('Expand');
      await click(toggle);
      expect(summary.hasAttribute('data-clamped')).toBe(false);
      expect(host.querySelector('[data-follow-summary-toggle]')?.textContent).toBe('Collapse');
    } finally {
      high.mockRestore();
      box.mockRestore();
    }
    const { host: short } = await show(data(item(7, { summary: 'short' })));
    expect(short.querySelector('[data-follow-summary-toggle]')).toBeNull();
  });

  it('The reason media was not fetched paints in the sidebar', async () => {
    const { host } = await show(data(item(3, { playable: false, media_kind: 'external', media_error: 'Attachments require sign-in' })));
    expect(host.querySelector('[data-follow-media-issue]:not([hidden])')?.textContent).toBe('Media not fetched: Attachments require sign-in');
  });
});

describe('Write operation', () => {
  it('Save: the key remains and the text changes to "Saved"; the receipt carries no undo', async () => {
    const fetcher = serve();
    const { host, actions: given } = await show(data(item(4)));
    await click(host.querySelector('[data-follow-detail-save]'));
    await settle();
    expect(posts(fetcher)).toEqual([['/api/follow/save', { item: 4 }]]);
    const save = host.querySelectorAll('[data-follow-detail-save]');
    expect(save).toHaveLength(1);
    expect(save[0]!.getAttribute('aria-label')).toBe('Saved');
    expect(given.toast).toHaveBeenCalledWith('Saved to the database');
  });

  it('Mark watched: the button presses and "Mark unwatched" appears; the undo from the receipt writes back the original state', async () => {
    const fetcher = serve();
    const { host, actions: given } = await show(data(item(5)));
    expect(host.querySelector('[data-follow-detail-status="ignored"] use')?.getAttribute('href')).toBe('#i-eye-off');
    expect(host.querySelector('[data-follow-detail-status="new"]')).toBeNull();
    await click(host.querySelector('[data-follow-detail-status="seen"]'));
    await settle();
    expect(host.querySelector('[data-follow-detail-status="seen"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-follow-detail-status="new"]')).not.toBeNull();
    const [message, options] = given.toast.mock.calls[0]!;
    expect(message).toBe('Marked as watched');
    await options!.undo!();
    await settle();
    expect(posts(fetcher)).toEqual([['/api/follow/status', { item: 5, to: 'seen' }], ['/api/follow/status', { item: 5, to: 'new' }]]);
    expect(host.querySelector('[data-follow-detail-status="seen"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('Write failure: key states hold, the reason lands on the status line, and the shell reports the error', async () => {
    serve({ status: 500 });
    const { host, actions: given } = await show(data(item(6)));
    await click(host.querySelector('[data-follow-detail-status="ignored"]'));
    await settle();
    expect(host.querySelector('[data-follow-detail-status="ignored"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('[data-follow-state]')?.textContent).not.toBe('');
    expect(given.failure).toHaveBeenCalledOnce();
  });

  it('Want: pressing fills the key, and pressing again removes by that want\'s id', async () => {
    let want: { id: number } | null = null;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith('/api/wants?follow=')) return { ok: true, status: 200, json: async () => ({ want }) };
      const body = JSON.parse(String(init?.body || '{}'));
      want = body.action === 'add' ? { id: 31 } : null;
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });
    vi.stubGlobal('fetch', fetcher);
    const { host, actions: given } = await show(data(item(7)));
    const key = () => host.querySelector('[data-follow-detail-want]')!;
    expect([key().getAttribute('aria-pressed'), key().getAttribute('aria-label')]).toEqual(['false', 'Want']);
    await click(key());
    await vi.waitFor(async () => {
      await settle();
      expect(key().getAttribute('aria-pressed')).toBe('true');
    });
    expect(given.toast).toHaveBeenCalledWith('Added to wants');
    await click(key());
    await vi.waitFor(async () => {
      await settle();
      expect(key().getAttribute('aria-pressed')).toBe('false');
    });
    expect(posts(fetcher as unknown as ReturnType<typeof serve>)).toEqual([
      ['/api/wants', { action: 'add', follow: 7 }], ['/api/wants', { action: 'remove', ids: [31] }],
    ]);
  });
});

describe('Media', () => {
  it('The video media box is handed to the stage to mount the player; unmounting this media area calls back the cleanup it provided', async () => {
    const shown = item(10, { media_items: [{ index: 0, media_kind: 'video' }, image(1)] });
    const { host, actions: given } = await show(data(shown));
    const [frame, handed, media] = given.mountPlayer.mock.calls[0]!;
    expect(frame).toBe(host.querySelector('[data-follow-detail-media="video"]'));
    expect([handed.id, media?.index]).toEqual([10, 0]);
    const release = given.mountPlayer.mock.results[0]!.value;
    await click(host.querySelector('[data-follow-media-item="1"]'));
    expect(release).toHaveBeenCalledOnce();
    expect(host.querySelector('[data-follow-detail-media="video"]')).toBeNull();
  });

  it('When the full image cannot come back the thumbnail shows with a note that it is the thumbnail', async () => {
    const { host } = await show(data(item(11, {
      media_kind: 'image', thumb_url: '/thumb/11', media_items: [image(0, { thumb_url: '/thumb/11-0' })],
    })));
    const poster = host.querySelector<HTMLImageElement>('[data-follow-detail-poster]')!;
    expect(poster.getAttribute('src')).toBe('/follow-stream?id=11&media=0');
    expect(host.querySelector('[data-media-thumb-fallback]')?.hasAttribute('hidden')).toBe(true);
    poster.dispatchEvent(new Event('error'));
    await settle();
    expect(poster.getAttribute('src')).toBe('/thumb/11-0');
    expect(host.querySelector('[data-media-thumb-fallback]')?.hasAttribute('hidden')).toBe(false);
  });

  it('One hundred twenty images share the dot strip with the current one marked', async () => {
    const many = Array.from({ length: 120 }, (_, index) => image(index));
    const { host } = await show(data(item(14, { media_kind: 'image', media_items: many })), { mediaIndex: 99 });
    expect(host.querySelectorAll('[data-follow-image-dots] button')).toHaveLength(120);
    expect(host.querySelector('[data-follow-image-dots] [aria-current="true"]')?.getAttribute('data-follow-image-item')).toBe('99');
    queryClient.clear();
    const { host: few } = await show(data(item(15, { media_kind: 'image', media_items: [image(0), image(1), image(2)] })));
    expect(few.querySelectorAll('[data-follow-image-dots] [data-follow-image-item]')).toHaveLength(3);
    expect(few.querySelector('[data-follow-image-count]')).toBeNull();
  });

  it('Clicking an image in a multi-image post hands the whole set to the lightbox starting at the current one', async () => {
    const shown = item(12, { media_kind: 'image', media_items: [image(0), image(1), image(2)] });
    const { host } = await show(data(shown), { mediaIndex: 1 });
    await click(host.querySelector('[data-follow-detail-poster]'));
    const [start, slides] = vi.mocked(openPhotoLightbox).mock.calls.at(-1)!;
    expect(start).toBe(1);
    expect(slides.map((slide) => slide.src)).toEqual([0, 1, 2].map((index) => `/follow-stream?id=12&media=${index}`));
  });

  it('The media queue groups by cloud drive with middle-ellipsis names; the compilation queue lists only playable videos, newest first', async () => {
    const shown = item(13, { media_items: [
      { index: 0, media_kind: 'video', name: ' a.mp4 ', resource_group: 'g1', resource_group_label: 'Gofile folder' },
      { ...image(1), resource_group: 'g1', resource_group_label: 'Gofile folder' },
    ] });
    const { host } = await show(data(shown));
    expect(host.querySelector('[data-mix-group-label]')?.textContent).toBe('Gofile folder 2');
    expect([...host.querySelectorAll('[data-follow-media-item] [data-middle-truncate]')].map((name) => name.textContent))
      .toEqual(['a.mp4', '1.jpg']);

    queryClient.clear();
    const primary = item(20, { published_at: '2026-09-18T00:00:00Z' });
    const row = group(primary, {
      variants: [item(21, { published_at: '2026-09-20T00:00:00Z' }), item(22, { media_kind: 'image' }),
        item(23, { playable: false })],
      duplicates: [item(24, { published_at: '2026-09-19T00:00:00Z' })],
    });
    const { host: collection } = await show(data(primary, row));
    expect([...collection.querySelectorAll<HTMLElement>('[data-follow-queue-item]')].map((line) => Number(line.dataset.followQueueItem)))
      .toEqual([21, 24, 20]);
  });
});

describe('Copy and sorting', () => {
  it('Continue watching swaps the item and keeps the details origin; after a status update the watched card moves away, and closing recommendations fetches nothing', async () => {
    const fetcher = serve();
    const next = item(42);
    queryClient.setQueryData(followRelatedKey(41, 'videos', 20), {
      pages: [{ groups: [group(next)], sources: [], author_aliases: [], counts: {}, facets: {}, offset: 0, has_more: false }],
      pageParams: [0],
    });
    const { host, props } = await show(data(item(41)), { relatedLimit: 20 });
    expect(host.querySelector('[data-follow-related] h3')?.textContent).toBe('Continue watching');
    await click(host.querySelector('[data-follow-related] [data-follow-open]'));
    expect(props.actions.openItem).toHaveBeenCalledWith(42);
    await act(async () => { setFollowItemStatus(42, 'seen') });
    expect(host.querySelector('[data-follow-related] [data-empty-state] h3')?.textContent).toBe('Nothing to continue watching yet');
    const { host: disabled } = await show(data(item(43)), { relatedLimit: 0 });
    expect(disabled.querySelector('[data-follow-related]')).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => String(url).startsWith('/api/follow?limit='))).toBe(false);
  });

  it('On hover, a keep-watching stack asks the shell whether it can flip cards, using the same test as the follow list', async () => {
    serve();
    const next = item(52);
    const stack = { media: 2, copies: 2, kind: 'video', faces: [
      { thumb_url: '/follow-cover?id=52', face: 0, media_kind: 'video' },
      { thumb_url: '/follow-cover?id=53', face: 1, media_kind: 'video' },
    ] };
    queryClient.setQueryData(followRelatedKey(51, 'videos', 20), {
      pages: [{ groups: [group(next, { stack })], sources: [], author_aliases: [], counts: {}, facets: {}, offset: 0, has_more: false }],
      pageParams: [0],
    });
    const { host, actions } = await show(data(item(51)), { relatedLimit: 20 });
    const card = host.querySelector('[data-follow-related] [data-follow-item][data-collection]')!;
    await act(async () => { card.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })) });
    // It waits until steady for a moment before starting to flip (the start delay in use-stack-flip.ts); a pointer sweeping past doesn't flip.
    await vi.waitFor(() => expect(actions.canFlip).toHaveBeenCalled(), { timeout: 2_000 });
  });

  it('Compilation row heads: release strings never treat a release time as an edition tag, and bodies carry the author', () => {
    const reply = item(30, { author: 'kou', summary: 'Second update section', variant_kind: '', published_at: '2026-09-18T00:00:00Z' });
    expect(collectionCopy(group(item(29), { is_release: true }), reply)).toEqual({ label: 'Videos', title: 'kou: Second update section' });
    expect(collectionCopy(group(item(29)), item(31, { variant_kind: 'wip' }))).toEqual({ label: 'WIP', title: 'Update 31' });
  });

  it('Extra types from the source site are colored as general and sorted after known types', () => {
    const shown = item(32, { detail_tags: ['b', 'a', 'x'], tag_types: { a: 'general', b: 'general', x: 'lore' } });
    expect(detailTags(shown, (tag) => tag)).toEqual(['a', 'b', 'x']);
    expect(tagCategory(shown, 'x')).toBe('r34-general');
  });
});
