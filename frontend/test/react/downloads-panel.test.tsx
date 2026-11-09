/* Behavior of the activity page's cloud download section: which buttons the task card offers, the whole section is skipped when there is no task, and the reader side gets no write actions. */
import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { registerNameWritings, setNameLanguage } from '../../src/core/entity-names';

import { DownloadsPanel, downloadPollInterval } from '../../src/react/activity/downloads-panel';
import type { DownloadsSnapshot, DownloadTask } from '../../src/react/bundle';
import { queryClient } from '../../src/react/query';
import { buttonNamed, click, mount, settle } from './render';
import { showToast } from '../../src/react/toaster';

vi.mock('../../src/react/toaster', () => ({ showToast: vi.fn() }));

afterEach(() => queryClient.clear());
beforeEach(() => { registerNameWritings([]); setNameLanguage('zh-CN') });

const task = (patch: Partial<DownloadTask> = {}): DownloadTask => ({
  id: 1, info_hash: 'a'.repeat(40), provider: '115', provider_label: '115', source_uri: 'magnet:?xt=urn:btih:' + 'a'.repeat(40),
  display_name: 'ABC-123.mp4', target: '/115/cloud-download', code: 'ABC-123', title: null, origin: 'paste',
  state: 'remote_running', state_label: 'Downloading remotely', failure: null, failure_label: null, failure_detail: null,
  progress: 0.42, remote_name: null, ledger_path: null, asset_id: null, submitted_at: '2026-10-01T08:00:00Z',
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

type Call = [string, RequestInit | undefined];

/** The read API returns `shown`; the write API returns the entry from `answers` matching the address. */
function serve(shown: DownloadsSnapshot, answers: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    calls.push([input, init]);
    const body = init?.method === 'POST' ? answers[input] : shown;
    return { ok: true, status: 200, json: async () => body };
  }));
  const posts = () => calls.filter(([, init]) => init?.method === 'POST')
    .map(([url, init]) => [url, JSON.parse(String(init!.body))]);
  return { calls, posts };
}

const show = async () => {
  const host = await mount(<QueryClientProvider client={queryClient}><DownloadsPanel /></QueryClientProvider>);
  // The first-screen fetch must pass through fetch, json and Query dispatch before this segment paints content.
  await vi.waitFor(async () => {
    await settle();
    if (!host.childElementCount) throw new Error('Cloud download section not rendered yet');
  });
  return host;
};

it('Visible byline and screen reader name on download cards follow the language; people links keep their original identity', async () => {
  registerNameWritings([], { 宮: '宫', 澤: '泽', 寧: '宁' });
  serve(snapshot({ tasks: [task({ artwork: { has_cover: false, code: 'ABC-123',
    performer_entities: [{ id: 20, name: '宮澤寧音', has_image: false }],
  } })] }));
  const host = await show();
  const link = host.querySelector('[data-media-avatar]');
  expect(link?.getAttribute('aria-label')).toBe('Open performer page: 宫泽宁音');
  expect(link?.getAttribute('href')).toBe('/performers/20');
  expect(host.textContent).toContain('宫泽宁音');
  await act(async () => setNameLanguage('ja'));
  expect(link?.getAttribute('aria-label')).toBe('Open performer page: 宮澤寧音');
  expect(host.textContent).toContain('宮澤寧音');
});

it.each([
  [{ title: 'Production notes' }, 'ABC-123 · Production notes'],
  [{ title: 'ABC-123 production notes' }, 'ABC-123 · production notes'],
  [{ title: 'ABC-123' }, 'ABC-123'],
  [{ title: null, display_title: '', display_code: 'ABC-123' }, 'ABC-123'],
  [{ title: 'ABC-123', display_title: 'Title from video details' }, 'ABC-123 · title from video details'],
  [{ code: null, display_code: 'XYZ-456', display_title: 'Behind the scenes' }, 'XYZ-456 · behind the scenes'],
  [{ code: null, title: 'Production notes', display_name: '' }, 'Production notes'],
] as [Partial<DownloadTask>, string][])('Cloud download cards identify videos by code and title: %j', async (patch, expected) => {
  serve(snapshot({ tasks: [task(patch)] }));
  const host = await show();
  expect(host.querySelector('strong')?.textContent).toBe(expected);
  await click(buttonNamed('Expand title', host));
  expect(host.querySelector('[data-download-title-full]')?.textContent).toBe(expected);
});

it('Intake details backfill local covers and performer avatars during polling without triggering source fetches', async () => {
  const shown = snapshot({ tasks: [task()] });
  const { calls } = serve(shown);
  const host = await show();
  expect(host.querySelector('[data-download-cover] img')).toBeNull();
  expect(buttonNamed('Cancel', host)).not.toBeNull();
  const refreshed = serve(snapshot({ tasks: [task({ state: 'ingested', cancellable: false, artwork: {
    has_cover: true, code: 'ABC-123', cover_key: 'ABC-123', cover_version: 'v2',
    performer_entities: [{ id: 20, name: 'Test performer', has_image: true, image_version: 'a2' }],
  } })] }));
  await act(async () => { await queryClient.invalidateQueries({ queryKey: ['downloads'] }); });
  await vi.waitFor(async () => {
    await settle();
    expect(host.querySelector('[data-download-cover] img')?.getAttribute('src')).toBe('/cover?code=ABC-123&thumb=2&v=v2');
  });
  expect(host.querySelector('[data-media-avatar] img')?.getAttribute('src')).toContain('/entity-image?');
  expect(host.querySelector('[data-media-avatar]')?.getAttribute('aria-label')).toBe('Open performer page: Test performer');
  expect([...calls, ...refreshed.calls].every(([url]) => url.startsWith('/api/downloads'))).toBe(true);
});

it.each([
  [{ state: 'ingested', asset_id: 42 }, '/assets/42'],
  [{ state: 'ingested', asset_id: null }, null],
  [{ state: 'remote_running', asset_id: 42 }, null],
] as [Partial<DownloadTask>, string | null][])('Only tasks with intaked, linked videos provide cover and title links: %j', async (patch, href) => {
  serve(snapshot({ tasks: [task(patch)] }));
  const host = await show();
  expect(host.querySelector('[data-download-cover-link]')?.getAttribute('href') ?? null).toBe(href);
  expect(host.querySelector('[data-download-title-link]')?.getAttribute('href') ?? null).toBe(href);
});

it('Running remote tasks show progress and a cancel key that posts to the cancel endpoint', async () => {
  const { posts } = serve(snapshot({ tasks: [task()] }), { '/api/downloads/cancel': { ok: true, task: task() } });
  const host = await show();
  const card = host.querySelector('[data-download-state=remote_running]')!;
  expect(card.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('42');
  expect(card.textContent).toContain('Downloading remotely');
  expect(buttonNamed('Submit again', card)).toBeNull();
  // The two auxiliary actions come first; canceling the mutation task comes last.
  expect([...card.querySelectorAll('[data-download-actions] button')].map((node) => node.textContent))
    .toEqual(['Expand title', 'Copy magnet', 'Cancel']);
  await click(buttonNamed('Cancel', card));
  await settle();
  expect(posts()).toEqual([['/api/downloads/cancel', { id: 1 }]]);
});

it('Failed tasks record the reason and can be resubmitted; those judged violating only keep Copy magnet link', async () => {
  const failed = task({ id: 2, state: 'failed', state_label: 'Failed', failure: 'no_source', cancellable: false,
    resubmittable: true, failure_label: 'No resources available', failure_detail: 'It is not in the remote task list' });
  const blocked = task({ id: 3, state: 'failed', state_label: 'Failed', failure: 'rejected', cancellable: false,
    blocked: true, failure_label: 'Judged a violation', failure_detail: '50038' });
  const { posts } = serve(snapshot({ tasks: [failed, blocked] }),
    { '/api/downloads': { ok: true, outcome: 'submitted', task: failed } });
  const host = await show();
  const [first, second] = [...host.querySelectorAll('[data-download-state=failed]')];
  expect(first?.textContent).toContain('No coverABC-123Failed115/115/cloud-download · 01/10 15:00Expand titleCopy magnetSubmit againABC-123No resources available: It is not in the remote task list');
  expect(second?.textContent).toContain('Judged a violation');
  expect([buttonNamed('Cancel', second!), buttonNamed('Submit again', second!)]).toEqual([null, null]);
  expect(buttonNamed('Copy magnet', second!)).not.toBeNull();
  await click(buttonNamed('Submit again', first!));
  await settle();
  expect(posts()).toEqual([['/api/downloads', {
    magnet: failed.source_uri, provider: '115', target: '/115/cloud-download', code: 'ABC-123', title: null, origin: 'paste',
  }]]);
});

it('When reconciliation backs off and reschedules on a transient failure, the bottom bar states the reason and the cards do not count as failed', async () => {
  serve(snapshot({ tasks: [task({ failure_detail: 'Could not reach CloudDrive2 while querying progress: timeout' })] }));
  const host = await show();
  const card = host.querySelector<HTMLElement>('[data-download-state=remote_running]')!;
  expect(card.textContent).toContain('No coverABC-123Downloading remotely115/115/cloud-download · 01/10 15:00Expand titleCopy magnetCancelABC-123Will retry automatically · Could not reach CloudDrive2 while querying progress: timeout');
  expect(card.className).not.toContain('border-border-error-default');
  expect(buttonNamed('Submit again', card)).toBeNull();
  expect(buttonNamed('Cancel', card)).not.toBeNull();
});

it('Read-only ends still list tasks but show no cancel key', async () => {
  serve(snapshot({ available: false, tasks: [task()] }));
  const host = await show();
  expect(host.querySelector('[data-download-state=remote_running]')).not.toBeNull();
  expect(buttonNamed('Cancel', host)).toBeNull();
});

it('Failed post-processing can retry alone without resubmitting the magnet', async () => {
  const failed = task({
    state: 'ingested', state_label: 'In library', cancellable: false,
    postprocess_state: 'failed', postprocess_label: 'Post-processing failed',
    postprocess_detail: 'Detail scraping failed', postprocess_retryable: true,
  });
  const { posts } = serve(snapshot({ tasks: [failed] }), {
    '/api/downloads/postprocess': { ok: true, task: failed },
  });
  const host = await show();
  expect(host.textContent).toContain('Detail scraping failed');
  await click(buttonNamed('Retry organize after import', host));
  await settle();
  expect(posts()).toEqual([['/api/downloads/postprocess', { id: 1 }]]);
});

it('With no tasks at all the whole section stays unpainted with no submit form', async () => {
  const { calls } = serve(snapshot());
  const host = await mount(<QueryClientProvider client={queryClient}><DownloadsPanel /></QueryClientProvider>);
  await vi.waitFor(async () => {
    await settle();
    if (!calls.length) throw new Error('Never fetched');
  });
  await settle();
  expect(host.childElementCount).toBe(0);
});

it('With tasks still being followed it polls every five seconds, dropping to thirty once all are terminal', () => {
  expect(downloadPollInterval(snapshot({ tasks: [task()] }))).toBe(5_000);
  expect(downloadPollInterval(snapshot({ tasks: [task({ cancellable: false, state: 'ingested' })] }))).toBe(30_000);
  expect(downloadPollInterval(snapshot({ tasks: [task({
    cancellable: false, state: 'ingested', postprocess_active: true, postprocess_state: 'running',
  })] }))).toBe(5_000);
  expect(downloadPollInterval(undefined)).toBe(30_000);
});

it('Cloud download pagination failure keeps the list; retry replaces the current page and supports going back', async () => {
  let fail = true;
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const current = input.includes('page=2') ? 2 : 1;
    if (current === 2 && fail) return { ok: false, status: 500, json: async () => ({ message: 'Load failed' }) };
    return { ok: true, status: 200, json: async () => snapshot({
      tasks: current === 2 ? [task({ id: 1 })] : [task({ id: 3 }), task({ id: 2 })],
      page: current, total: 21,
    }) };
  }));
  const host = await show();
  await click(buttonNamed('Next page', host));
  await vi.waitFor(() => expect(host.textContent).toContain('Cloud downloadThe Peach service failed to handle the request. Try again; if it keeps failing, check the tray logs.No coverABC-123Downloading remotely115/115/cloud-download · 01/10 15:00Expand titleCopy magnetCancelABC-123No coverABC-123Downloading remotely115/115/cloud-download · 01/10 15:00Expand titleCopy magnetCancelABC-1231–20 / 21 records20 items per page 10 items per page20 items per page50 items per page100 items per pagePrevious page12Next page'));
  expect(host.querySelectorAll('[data-download-id]')).toHaveLength(2);
  fail = false;
  await click(buttonNamed('Next page', host));
  await vi.waitFor(() => expect(host.querySelectorAll('[data-download-id]')).toHaveLength(1));
  await act(async () => { await queryClient.invalidateQueries({ queryKey: ['downloads'] }); });
  expect(host.querySelector('[data-download-id]')?.getAttribute('data-download-id')).toBe('1');
  await click(buttonNamed('Previous page', host));
  await vi.waitFor(() => expect(host.querySelectorAll('[data-download-id]')).toHaveLength(2));
});

it('A successful magnet copy shows a toast and the button keeps its action name', async () => {
  const writeText = vi.fn(async () => {});
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  serve(snapshot({ tasks: [task()] }));
  const host = await show();
  await click(buttonNamed('Copy magnet', host));
  expect(writeText).toHaveBeenCalledWith(task().source_uri);
  expect(showToast).toHaveBeenCalledWith('download-copy-1', expect.objectContaining({ html: 'Magnet link copied', alert: false }));
  expect(buttonNamed('Copy magnet', host)).not.toBeNull();
});
