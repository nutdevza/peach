import { act } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { LibraryCompletionPrompt, meteredPreviewIds, missingPreviewIds } from '../../src/react/library-processing/library-completion';
import { LIBRARY_PROCESSING_KEY } from '../../src/react/library-processing/library-processing';
import type { MediaItem } from '../../src/react/catalog-grid/types';
import { queryClient } from '../../src/react/query';
import { buttonNamed, click, mount, pending } from './render';

vi.mock('@peach/legacy/ui', async (original) => ({
  ...await original<typeof import('@peach/legacy/ui')>(),
  confirmModal: (await import('../../src/ui-kit/modal')).confirmModal,
}));

notifyManager.setScheduler(notify => notify());
afterEach(() => queryClient.clear());

const item = (id: number, extra: Partial<MediaItem> = {}): MediaItem => ({ id, location: 'local', ...extra });
const prompt = (ids = [7, 8], onComplete = vi.fn()) =>
  <QueryClientProvider client={queryClient}><LibraryCompletionPrompt assetIds={ids} onComplete={onComplete} /></QueryClientProvider>;
const menuItem = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
  .find(button => button.querySelector('span > span')?.textContent === label);

it('The missing-image notice only picks videos without a usable card face that can be completed: free cloud drives can still extract frames; traffic-protected ones complete covers only', () => {
  expect(missingPreviewIds([
    item(1), item(1), item(2, { has_thumb: true }), item(3, { has_local_poster: true }),
    item(4, { location: 'online' }), item(5, { disposal: 'trash' }), item(6, { medium: 'image' }),
    item(7, { location: '115' }), item(8, { code: 'ABW-001', location: 'pikpak', cost: 'metered' }),
    item(13, { location: 'pikpak', cost: 'metered' }),
    item(9, { follow_thumb_url: 'https://example.test/image.jpg' }),
    item(10, { has_cover: true, cover_key: 'sample' }),
    item(11, { name: 'unknown.strm' }), item(12, { name: 'unknown.iso' }),
  ], 'cover')).toEqual([1, 7, 8]);
});

it('Videos without images in traffic-protected folders form their own batch: online, STRM, trash, and ones with images do not count', () => {
  expect(meteredPreviewIds([
    item(1, { location: 'pikpak', cost: 'metered' }), item(2, { location: 'pikpak', cost: 'metered', has_thumb: true }),
    item(3, { location: '115', cost: 'free' }), item(4, { location: 'online', cost: 'metered' }),
    item(5, { location: 'pikpak', cost: 'metered', name: 'a.strm' }), item(6, { location: 'pikpak', cost: 'metered', disposal: 'trash' }),
  ], 'cover')).toEqual([1]);
});

it('Two batches merge into one: the primary button "Sync these videos" sits rightmost, the traffic-protected batch confirms first, then completes previews only for them with authorization', async () => {
  const posts: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push(JSON.parse(String(init.body)));
    return { ok: true, json: async () => ({ status: 'idle' }) };
  }));
  const host = await mount(<QueryClientProvider client={queryClient}>
    <LibraryCompletionPrompt assetIds={[7, 8]} meteredIds={[8, 9]} /></QueryClientProvider>);
  expect(host.textContent).toContain('3 of these videos have no preview yet, 2 of them in traffic-protected folders');
  const labels = [...host.querySelectorAll('[data-library-completion] button')].map(button => button.textContent?.trim()).filter(Boolean);
  expect(labels.at(-1) === 'Sync these videos' || labels.at(-2) === 'Sync these videos', 'The primary button (with dropdown) sits rightmost').toBe(true);
  expect(labels.indexOf('Complete previews for the 2 traffic-protected videos')).toBeLessThan(labels.indexOf('Sync these videos'));

  await click(buttonNamed('Complete previews for the 2 traffic-protected videos', host));
  await vi.waitFor(() => expect(document.querySelector('dialog')?.open).toBe(true));
  expect(document.querySelector('dialog')?.textContent).toContain('These 2 videos');
  await click(document.querySelector('dialog [data-modal-confirm]'));
  await vi.waitFor(() => expect(posts).toEqual([{ stage: 'previews', asset_ids: [8, 9], allow_metered: true }]));
});

it('Turning off video preview generation keeps details sync and disables standalone frame extraction', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ status: 'idle', metadata_only: true }) })));
  const host = await mount(prompt());
  await click(host.querySelector('[aria-haspopup="dialog"]'));
  expect(menuItem('Complete preview images only')?.disabled).toBe(true);
  expect(menuItem('Complete video details only')?.disabled).toBe(false);
});

it('With no videos missing images neither the entry shows nor a task queries', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(prompt([]));
  expect(host.textContent).toBe('');
  expect(fetcher).not.toHaveBeenCalled();
});

it('Default completion and the dropdown\'s split actions submit only the current videos missing images, and the menu holds only the split actions', async () => {
  const posts: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push(JSON.parse(String(init.body)));
    return { ok: true, json: async () => ({ status: 'idle' }) };
  }));
  const host = await mount(prompt());
  expect(host.textContent).toContain('2 of these videos have no preview yet; profiles and images can be completed. View processing detailsSync these videos');
  await click(buttonNamed('Sync these videos', host));
  for (const label of ['Complete preview images only', 'Complete video details only']) {
    await click(host.querySelector('[aria-haspopup="dialog"]'));
    const menu = document.querySelector('[role="dialog"]')!;
    expect(buttonNamed('Sync these videos', menu)).toBeNull();
    await click(menuItem(label));
  }
  expect(posts).toEqual([
    { stage: 'collect', asset_ids: [7, 8] },
    { stage: 'previews', asset_ids: [7, 8] },
    { stage: 'metadata', asset_ids: [7, 8] },
  ]);
});

it('No duplicate submissions while startup waits; on finish the library refreshes and reports cover and preview counts', async () => {
  const response = pending<{ status: string; job_id: string }>();
  const posts: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)));
      return { ok: true, json: () => response.answer };
    }
    return { ok: true, json: async () => ({ status: 'running', job_id: 'complete-one', current_action: 'generating_preview' }) };
  }));
  queryClient.setQueryData(LIBRARY_PROCESSING_KEY, { status: 'idle' });
  queryClient.setQueryData(['catalog-grid', 'catalog', 'sample', 1], { pages: [] });
  const onComplete = vi.fn();
  const host = await mount(prompt([7], onComplete));
  const primary = buttonNamed('Sync these videos', host)!;
  await click(primary);
  expect(primary.getAttribute('aria-busy')).toBe('true');
  const more = host.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!;
  await click(more);
  expect(more.getAttribute('aria-expanded')).toBe('false');
  await click(primary);
  expect(posts).toHaveLength(1);
  await response.release({ status: 'running', job_id: 'complete-one' });
  expect(host.textContent).toContain('1 of these videos have no preview yet; Can be filled in separately after the current task finishes. View processing detailsSync these videos');
  expect(primary.getAttribute('aria-disabled')).toBe('true');
  await click(more);
  expect(more.getAttribute('aria-expanded')).toBe('false');
  await act(async () => queryClient.setQueryData(LIBRARY_PROCESSING_KEY,
    { status: 'complete', job_id: 'complete-one', covers: 1, previews: 2 }));
  expect(host.textContent).toContain('Backfill complete: fetched 1 covers and generated 2 video previews. View processing detailsSync these videos');
  expect(queryClient.getQueryState(['catalog-grid', 'catalog', 'sample', 1])?.isInvalidated).toBe(true);
  expect(onComplete).toHaveBeenCalledTimes(1);
  const nextMore = host.querySelector<HTMLButtonElement>('[aria-haspopup="dialog"]')!;
  await click(nextMore);
  expect(nextMore.getAttribute('aria-expanded')).toBe('true');
});

it('A failed start keeps the entry and processing details and shows no completion receipt', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
    ? { ok: false, status: 400, json: async () => ({ error: 'Add media folders first' }) }
    : { ok: true, json: async () => ({ status: 'idle' }) }));
  const host = await mount(prompt());
  await click(buttonNamed('Sync these videos', host));
  expect(host.textContent).toContain('The submission was invalid; check the input and retry. Open scan and captureSync these videos');
  expect(host.textContent).not.toContain('Completion finished');
  expect(host.querySelector('a[href="/data-cleanup#libraryProcessing"]')?.textContent).toBe('Open scan and capture');
  expect(buttonNamed('Sync these videos', host)?.disabled).toBe(false);
});
