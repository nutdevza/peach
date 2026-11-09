/* Cloud download popover behavior: what the submit carries, receipt plus close on success, staying put on failure, and what the unconfigured and read-only states say. */
import { act } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { CloudDownloadDialog, type DownloadPrefill } from '../../src/react/activity/cloud-download-dialog';
import type { DownloadsSnapshot, DownloadSubmitResult, DownloadTask } from '../../src/react/bundle';
import { queryClient } from '../../src/react/query';
import { buttonNamed, choose, mount, section, settle, submit, type } from './render';

afterEach(() => queryClient.clear());

const task = (patch: Partial<DownloadTask> = {}): DownloadTask => ({
  id: 1, info_hash: 'a'.repeat(40), provider: '115', provider_label: '115', source_uri: 'magnet:?xt=urn:btih:' + 'a'.repeat(40),
  display_name: 'ABC-123.mp4', target: '/115/cloud-download', code: 'ABC-123', title: null, origin: 'paste',
  state: 'submitted', state_label: 'Submitted', failure: null, failure_label: null, failure_detail: null,
  progress: null, remote_name: null, ledger_path: null, asset_id: null, submitted_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-01T08:01:00Z', finished_at: null, blocked: false, cancellable: true, resubmittable: false,
  postprocess_state: 'not_requested', postprocess_label: 'Not started', postprocess_detail: null,
  postprocess_run_id: null, postprocessed_at: null, postprocess_active: false, postprocess_retryable: false,
  ...patch,
});

const snapshot = (patch: Partial<DownloadsSnapshot> = {}): DownloadsSnapshot => ({
  available: true,
  providers: [
    { key: '115', label: '115', configured: true, target: '/115/cloud-download' },
    { key: 'pikpak', label: 'PikPak', configured: true, target: '/Cloud download' },
  ],
  tasks: [],
  ...patch,
});

/** Read endpoints return `shown`; write endpoints return `answer`. */
function serve(shown: DownloadsSnapshot, answer?: DownloadSubmitResult) {
  const posts: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_input: string, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push(JSON.parse(String(init.body)));
    return { ok: true, status: 200, json: async () => (init?.method === 'POST' ? answer : shown) };
  }));
  return posts;
}

/** The popover renders in the overlay container on `body`, not at the mount point, so search the whole page. */
const open = async (prefill: DownloadPrefill, provider?: string) => {
  const close = vi.fn();
  const receipt = vi.fn();
  await mount(
    <QueryClientProvider client={queryClient}>
      <CloudDownloadDialog prefill={prefill} close={close} receipt={receipt} provider={provider} />
    </QueryClientProvider>,
  );
  // Render the form or the explanation only after the download config arrives; Query notifications run on timers, so waiting for microtasks alone is not enough.
  await vi.waitFor(async () => {
    await settle();
    if (!document.querySelector('[role=dialog] form, [role=dialog] [role=note], [role=dialog] .p-5 > *')) {
      throw new Error('Popover has not fetched download config yet');
    }
  });
  return { close, receipt, page: document.body };
};

const field = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('label')].find((node) => node.textContent?.trim() === label)
    ?.closest('[data-input-size]')?.querySelector('input') ?? null;

const MAGNET = 'magnet:?xt=urn:btih:' + 'b'.repeat(40);

it('Opens with the code and title: the title row carries the code and film name, the search and code fields come prefilled, and the submit sends the channel, catalog and origin', async () => {
  const posts = serve(snapshot(), { ok: true, outcome: 'submitted', task: task() });
  const { close, receipt, page } = await open({ code: 'ABC-123', title: 'One video', origin: 'asset:12', searchReason: 'Chinese subs' });
  expect(page.querySelector('[role=dialog]')?.textContent).toContain('Find resourcesABC-123 · One videoEdition target:Chinese subs. Search priorities adjust below; completeness and watermarks need per-item review.Find resources by codeFind firstChinese subs HDChinese subsUncensoredMin size (GiB)Max size (GiB)Magnet linkDownload to115 115PikPakEach submission spends one offline quota item, resubmissions included.Target folderCancelSubmit download');
  expect(page.textContent).toContain('Find resourcesABC-123 · One videoEdition target:Chinese subs. Search priorities adjust below; completeness and watermarks need per-item review.Find resources by codeFind firstChinese subs HDChinese subsUncensoredMin size (GiB)Max size (GiB)Magnet linkDownload to115 115PikPakEach submission spends one offline quota item, resubmissions included.Target folderCancelSubmit download');
  expect(field(page, 'Find resources by code')?.value).toBe('ABC-123');
  expect(field(page, 'Code')).toBeNull();
  expect(field(page, 'Target folder')?.value).toBe('/115/cloud-download');
  await type(field(page, 'Magnet link'), MAGNET);
  await submit(section(page, 'Submit download'));
  await settle();
  expect(posts).toEqual([{
    magnet: MAGNET, provider: '115', target: '/115/cloud-download', code: 'ABC-123', title: 'One video', origin: 'asset:12',
  }]);
  expect(receipt).toHaveBeenCalledWith('Offline download submitted; progress lives in the task center');
  expect(close).toHaveBeenCalled();
});

it('When a submit fails the popover stays open with the reason in the form', async () => {
  serve(snapshot(), { ok: false, outcome: 'failed',
    task: task({ state: 'failed', failure_label: 'No resources available', failure_detail: 'The remote refused' }) });
  const { close, receipt, page } = await open({});
  await type(field(page, 'Magnet link'), MAGNET);
  await submit(section(page, 'Submit download'));
  await settle();
  expect(page.textContent).toContain('Find resourcesFind resources by codeFind firstHD HDChinese subsUncensoredMin size (GiB)Max size (GiB)Magnet linkDownload to115 115PikPakEach submission spends one offline quota item, resubmissions included.Target folderCodeSubmit did not succeed: No resources available: The remote refusedCancelSubmit download');
  expect([close.mock.calls.length, receipt.mock.calls.length]).toEqual([0, 0]);
});

it('Looking up another code clears the previous magnet link and video profile; when the profile is unavailable the submission carries no other title', async () => {
  const posts: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push(JSON.parse(String(init.body)));
    return { ok: true, status: 200, json: async () => init?.method === 'POST'
      ? { ok: true, outcome: 'submitted', task: task() }
      : url.startsWith('/api/items') ? { items: [{ id: 2, code: 'ABC-9999', name: 'Other videos' }] }
      : url.startsWith('/api/resources') ? { state: 'ready', warnings: [], error: '', items: [] }
      : snapshot() };
  }));
  const { page } = await open({ code: 'ABC-123', title: 'Original video', origin: 'asset:12', performers: 'Alpha', duration: 600 });
  await type(field(page, 'Magnet link'), MAGNET);
  await type(field(page, 'Find resources by code'), 'ABC-999');
  await act(async () => field(page, 'Find resources by code')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await settle();
  expect(page.querySelector('[data-resource-work]')?.textContent).toContain('Video details unfetched');
  expect(page.querySelector('[data-resource-work]')?.textContent).not.toContain('Original video');
  expect(field(page, 'Magnet link')?.value).toBe('');
  await type(field(page, 'Magnet link'), MAGNET);
  await submit(section(page, 'Submit download'));
  expect(posts).toEqual([{ magnet: MAGNET, provider: '115', target: '/115/cloud-download', code: 'ABC-999' }]);
});

it('The download method handed in by the intake page starts selected; changing the channel switches the target folder with it, and only 115 mentions quota', async () => {
  serve(snapshot());
  const { page } = await open({}, 'pikpak');
  expect(field(page, 'Target folder')?.value).toBe('/Cloud download');
  expect(page.textContent).not.toContain('Deduct one offline quota');
  expect(buttonNamed('Submit download', page)?.className).toContain('bg-button-primary');
  await choose(page.querySelector('[role=dialog] [aria-label="Download to"]'), '115');
  expect(field(page, 'Target folder')?.value).toBe('/115/cloud-download');
  expect(page.textContent).toContain('Find resourcesFind resources by codeFind firstHD HDChinese subsUncensoredMin size (GiB)Max size (GiB)Magnet linkDownload to115 115PikPakEach submission spends one offline quota item, resubmissions included.Target folderCodeCancelSubmit download');
});

it('Without a download channel resources can be searched, with submit-download disabled', async () => {
  serve(snapshot({ providers: [
    { key: '115', label: '115', configured: false, target: '' },
    { key: 'pikpak', label: 'PikPak', configured: false, target: '' },
  ] }));
  const { page } = await open({});
  expect(section(page, 'Find resources')).not.toBeNull();
  expect(buttonNamed('Submit download', page)?.disabled).toBe(true);
  expect(page.textContent).toContain('Download channel settings');
  expect(page.querySelector('[data-resource-work]')).toBeNull();
});

it.each(['abf-258', 'ABF258', 'ABF-258'])('Querying the same code %s keeps known video details and their origins', async requested => {
  const posts: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') posts.push(JSON.parse(String(init.body)));
    return { ok: true, status: 200, json: async () => init?.method === 'POST'
      ? { ok: true, outcome: 'submitted', task: task() }
      : url.startsWith('/api/items') ? { items: [] }
      : url.startsWith('/api/resources') ? { state: 'ready', warnings: [], error: '', items: [] }
      : snapshot() };
  }));
  const { page } = await open({ code: 'ABF-258', title: 'The same video', origin: 'wishlist:12', cover: '/cover?code=ABF-258', performers: 'Alpha' });
  const details = page.querySelector('[data-resource-work]')!;
  expect(details.compareDocumentPosition(section(page, 'Find resources')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await type(field(page, 'Find resources by code'), requested);
  await act(async () => field(page, 'Find resources by code')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await settle();
  expect(details.textContent).toContain('The same video');
  expect(details.querySelector('img')?.getAttribute('src')).toBe('/cover?code=ABF-258');
  await type(field(page, 'Magnet link'), MAGNET);
  await submit(section(page, 'Submit download'));
  expect(posts).toEqual([{ magnet: MAGNET, provider: '115', target: '/115/cloud-download', code: requested, title: 'The same video', origin: 'wishlist:12' }]);
});

it('Read-only ends can search resources with submit-download disabled', async () => {
  serve(snapshot({ available: false }));
  const { page } = await open({});
  expect(page.textContent).toContain('Cloud download is only available on devices allowed to modify the database');
  expect(section(page, 'Find resources')).not.toBeNull();
  expect(buttonNamed('Submit download', page)?.disabled).toBe(true);
});
