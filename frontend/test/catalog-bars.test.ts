/* The two aggregations behind the home-page filter bars (`src/catalog-bars.ts`): keys, fallback, reuse within a tab, re-fetch when the scope changes, forced re-fetch on refresh, and continuation pages. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import {
  dropBars, facetsKey, fetchBars, fetchTopsPage, loadTops, topsKey, topsPageKey,
} from '../src/catalog-bars';
import { queryClient } from '../src/query';

const EMPTY = { performers: [], studios: [] };
const FULL = { performers: [{ k: 'Someone' }], studios: [] };
const FACETS = { tags: [], locations: [] };

/** A fetch that replies by address; with `hold` true it does not reply until `release()`. */
function serve(answer: (url: string) => unknown, hold = false) {
  const waiting: (() => void)[] = [];
  const fetcher = vi.fn((url: string) => new Promise((resolve) => {
    const reply = () => resolve({ ok: true, status: 200, json: async () => answer(url) });
    if (hold) waiting.push(reply); else reply();
  }));
  vi.stubGlobal('fetch', fetcher);
  return { fetcher, urls: () => fetcher.mock.calls.map(([url]) => url), release: () => waiting.splice(0).forEach((run) => run()) };
}
const answer = (tops: unknown) => (url: string) => (url.startsWith('/api/facets') ? FACETS : tops);

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(0) });
afterEach(() => { queryClient.clear(); vi.useRealTimers(); vi.unstubAllGlobals() });

it('The two sets live under their own keys: facets by criteria, tops by the parameters and criteria the requester passed', async () => {
  serve(answer(FULL));
  await fetchBars('state=flagged', 'n=60&seed=s&state=flagged');
  expect(queryClient.getQueryData(facetsKey('state=flagged'))).toEqual(FACETS);
  expect(queryClient.getQueryData(topsKey('n=60&seed=s&state=flagged', 'state=flagged'))).toEqual(FULL);
  expect(facetsKey('a').slice(0, 2)).toEqual(['facets', 'a']);
  expect(topsKey('p', 'a').slice(0, 3)).toEqual(['tops', 'p', 'a']);
});

it('When both rows are empty the status page falls back to the whole-library scope and refetches, still using the key the requester passed', async () => {
  const net = serve((url) => (url.includes('state=') ? EMPTY : FULL));
  const [, tops] = await fetchBars('state=flagged', 'n=60&seed=s&state=flagged');
  expect(net.urls()).toEqual(['/api/facets?state=flagged', '/api/tops?n=60&seed=s&state=flagged', '/api/tops?n=60&seed=s']);
  expect(tops).toEqual(FULL);
  expect(queryClient.getQueryData(topsKey('n=60&seed=s&state=flagged', 'state=flagged'))).toEqual(FULL);
});

it('Without state-page params, or when narrowing still leaves people, it never falls back', async () => {
  const empty = serve(() => EMPTY);
  expect(await loadTops('n=60&seed=s')).toEqual(EMPTY);
  expect(empty.urls()).toEqual(['/api/tops?n=60&seed=s']);
  const full = serve(() => FULL);
  expect(await loadTops(new URLSearchParams({ n: '60', state: 'flagged' }))).toEqual(FULL);
  expect(full.urls()).toEqual(['/api/tops?n=60&state=flagged']);
});

it('One consistent scope is reused across long round trips and refetched only on an explicit refresh', async () => {
  const net = serve(answer(FULL));
  await fetchBars('', 'n=60&seed=s');
  vi.setSystemTime(24 * 60 * 60 * 1000);
  await fetchBars('', 'n=60&seed=s');
  expect(net.urls()).toEqual(['/api/facets', '/api/tops?n=60&seed=s']);
  dropBars();
  await fetchBars('', 'n=60&seed=s');
  expect(net.fetcher).toHaveBeenCalledTimes(4);
});

it('When the convention changes both refetch: tops refetches even with unchanged params', async () => {
  const net = serve(answer(FULL));
  await fetchBars('', 'n=60&seed=s');
  await fetchBars('tag=a', 'n=60&seed=s');
  expect(net.urls().slice(2)).toEqual(['/api/facets?tag=a', '/api/tops?n=60&seed=s']);
});

it('Concurrent asks for the same asset send one request', async () => {
  const net = serve(answer(FULL), true);
  const both = Promise.all([fetchBars('', 'n=60'), fetchBars('', 'n=60')]);
  await vi.waitFor(() => expect(net.fetcher).toHaveBeenCalledTimes(2));
  net.release();
  const [first, second] = await both;
  expect(second).toEqual(first);
  expect(net.fetcher).toHaveBeenCalledTimes(2);
});

it('Refetches right after dropBars', async () => {
  const net = serve(answer(FULL));
  await fetchBars('', 'n=60&seed=s');
  dropBars();
  await fetchBars('', 'n=60&seed=s');
  expect(net.urls()).toEqual(['/api/facets', '/api/tops?n=60&seed=s', '/api/facets', '/api/tops?n=60&seed=s']);
});

it('The in-flight call hit dropBars: the caller waiting on it still gets data, and the next one issues a fresh request', async () => {
  const net = serve(answer(FULL), true);
  const before = fetchBars('', 'n=60');
  await vi.waitFor(() => expect(net.fetcher).toHaveBeenCalledTimes(2));
  dropBars();
  const after = fetchBars('', 'n=60');
  await vi.waitFor(() => expect(net.fetcher).toHaveBeenCalledTimes(4));
  net.release();
  await expect(before).resolves.toEqual([FACETS, FULL]);
  await expect(after).resolves.toEqual([FACETS, FULL]);
});

it('Both rows paging to the same page send one request, keyed separately from page one', async () => {
  const net = serve(() => FULL, true);
  const both = Promise.all([fetchTopsPage('n=60&page=1'), fetchTopsPage('n=60&page=1')]);
  await vi.waitFor(() => expect(net.fetcher).toHaveBeenCalledTimes(1));
  net.release();
  const [performers, studios] = await both;
  expect(studios).toBe(performers);
  expect(net.urls()).toEqual(['/api/tops?n=60&page=1']);
  expect(queryClient.getQueryData(topsPageKey('n=60&page=1'))).toEqual(FULL);
  expect(topsPageKey('p')).not.toEqual(topsKey('p', ''));
});

it('Follow-up pages reuse the host, refetch after dropBars, and an empty status page still falls back to the whole-library scope', async () => {
  const net = serve((url) => (url.includes('state=') ? EMPTY : FULL));
  await fetchTopsPage('n=60&page=2&state=flagged');
  await fetchTopsPage('n=60&page=2&state=flagged');
  expect(net.urls()).toEqual(['/api/tops?n=60&page=2&state=flagged', '/api/tops?n=60&page=2']);
  dropBars();
  expect(await fetchTopsPage('n=60&page=2&state=flagged')).toEqual(FULL);
  expect(net.fetcher).toHaveBeenCalledTimes(4);
});
