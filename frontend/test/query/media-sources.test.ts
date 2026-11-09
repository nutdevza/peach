/* The one query key for source reachability: the shell's `loadMediaSources` and the React page's `prefetchMediaSources` read and write the same cache. */
import { afterEach, expect, it, vi } from 'vitest';

import { loadMediaSources, MEDIA_SOURCES_KEY, QueryObserver, queryClient, type MediaSourcesData } from '@peach/query';

import { prefetchMediaSources } from '../../src/react/media-sources';

const ONLINE: MediaSourcesData = { sources: [{ location: 'local', online: true }, { location: '115', online: false }] };
const BACK: MediaSourcesData = { sources: [{ location: 'local', online: true }, { location: '115', online: true }] };

/** Every `fetch` suspends and is released in order by the test; when the passed-in `signal` aborts, it ends with `AbortError`. */
function pendingFetch() {
  const calls: { path: string; signal: AbortSignal | null; answer: (body: MediaSourcesData) => void }[] = [];
  const fetcher = vi.fn((path: string, init: RequestInit = {}) => new Promise((resolve, reject) => {
    const signal = init.signal ?? null;
    signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    calls.push({ path, signal, answer: (body) => resolve({ ok: true, status: 200, json: async () => body }) });
  }));
  vi.stubGlobal('fetch', fetcher);
  return calls;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => { queryClient.clear(); vi.unstubAllGlobals() });

it('Each shell detection asks the server once, and the result lands in the key the page reads', async () => {
  const calls = pendingFetch();
  const first = loadMediaSources();
  await flush();
  calls[0]!.answer(ONLINE);
  expect(await first).toEqual(ONLINE);
  const second = loadMediaSources();
  await flush();
  calls[1]!.answer(BACK);
  expect(await second).toEqual(BACK);
  expect(calls.map((call) => call.path)).toEqual(['/api/sources', '/api/sources']);
  expect(queryClient.getQueryData(MEDIA_SOURCES_KEY)).toEqual(BACK);
});

it('Shell and page requests in flight at the same time merge into one call, and both sides receive the same object', async () => {
  const calls = pendingFetch();
  const shell = loadMediaSources();
  const page = prefetchMediaSources(new AbortController().signal);
  await flush();
  expect(calls).toHaveLength(1);
  calls[0]!.answer(ONLINE);
  await page;
  expect(await shell).toBe(queryClient.getQueryData(MEDIA_SOURCES_KEY));
});

it('When the merged page round is aborted by the page, the shell sends its own again', async () => {
  const calls = pendingFetch();
  const leaving = new AbortController();
  const page = prefetchMediaSources(leaving.signal);
  await flush();
  const shell = loadMediaSources();
  leaving.abort();
  await expect(page).rejects.toMatchObject({ name: 'AbortError' });
  await flush();
  expect(calls).toHaveLength(2);
  expect(calls[1]!.signal).toBeNull();
  calls[1]!.answer(BACK);
  expect(await shell).toEqual(BACK);
});

it('The page\'s last observer unmounting never withdraws the shell\'s round', async () => {
  const calls = pendingFetch();
  const observer = new QueryObserver(queryClient, { queryKey: MEDIA_SOURCES_KEY, enabled: false });
  const stop = observer.subscribe(() => {});
  const shell = loadMediaSources();
  await flush();
  stop();
  calls[0]!.answer(BACK);
  expect(await shell).toEqual(BACK);
  expect(calls).toHaveLength(1);
});

it('Failures still throw, with the shell settling into an empty table', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
  await expect(loadMediaSources()).rejects.toThrow();
});

it('The applied abort signal stops real source requests and never retries', async () => {
  const calls = pendingFetch(), application = new AbortController();
  const request = loadMediaSources(application.signal);
  const rejection = expect(request).rejects.toMatchObject({ name: 'AbortError' });
  await flush(); expect(calls[0]!.signal).toBe(application.signal);
  application.abort(); await rejection; await flush();
  expect(calls).toHaveLength(1);
});

it('A canceled apply sends no source request, and a canceled merged page request does not restore an unmounted apply either', async () => {
  const calls = pendingFetch(), application = new AbortController();
  application.abort(); await expect(loadMediaSources(application.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(calls).toHaveLength(0);
  const pageScope = new AbortController(), applicationScope = new AbortController();
  const page = prefetchMediaSources(pageScope.signal);
  await flush(); const app = loadMediaSources(applicationScope.signal);
  const pageRejection = expect(page).rejects.toMatchObject({ name: 'AbortError' });
  const appRejection = expect(app).rejects.toMatchObject({ name: 'AbortError' });
  applicationScope.abort(); pageScope.abort(); await Promise.all([pageRejection, appRejection]); await flush();
  expect(calls).toHaveLength(1);
});
