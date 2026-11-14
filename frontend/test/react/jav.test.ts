import { expect, it } from 'vitest';
import { discoveryArtwork, javLibraryPath, javPath, javTab, type Discovery } from '../../src/react/jav/jav';
import { controlDiscoveryMetadata, discoveryKey, fetchDiscoveries, fetchDiscoveryMetadata, fetchReleases, releaseFilters,
  releaseKey } from '../../src/react/jav/jav';
import { discoveryScore, recommendationScore } from '../../src/react/jav/discovery-sorts';
import { vi } from 'vitest';
import { advanceImageFallback } from '../../src/card-art/image-fallback';

it('Taste scores keep zeros, decimals, and negative sort scores, and missing readings never pose as zero', () => {
  expect(discoveryScore(0)).toBe('0.000');
  expect(discoveryScore(0.004)).toBe('0.004');
  expect(discoveryScore(-0.125)).toBe('-0.125');
  for (const value of [undefined, null, NaN, Infinity]) expect(discoveryScore(value)).toBe('—');
});
it('Recommended tags use a fixed percent scale with tiers, and unknown or out-of-range values read clearly', () => {
  expect(recommendationScore(0.337)).toEqual({ score: '34', label: 'Worth a look', color: 'yellow' });
  for (const [input, score, label] of [[0, '0', 'Explore'], [-0.1, '0', 'Explore'], [0.5, '50', 'Recommended'], [0.75, '75', 'Strongly recommended'], [1.2, '100', 'Strongly recommended']] as const) {
    expect(recommendationScore(input)).toMatchObject({ score, label });
  }
  for (const value of [undefined, null, NaN, Infinity]) expect(recommendationScore(value)).toMatchObject({ score: '—', label: 'Profile not fetched' });
});
it('Discovery queries isolate the sort cache and are read-only; profile reading starts and stops with POST and polls progress separately', async () => {
  const requests: { url: URL; method: string; body: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    requests.push({ url: new URL(input, 'https://peach.test'), method: init?.method || 'GET',
      body: init?.body ? JSON.parse(String(init.body)) : null });
    return { ok: true, status: 200, json: async () => ({ items: [], candidate_total: 0, limited: false }) };
  }));
  try {
    const signal = new AbortController().signal;
    await fetchDiscoveries('external', signal, { sort: 'source_score', direction: 'asc' });
    expect(Object.fromEntries(requests[0]!.url.searchParams)).toEqual({ scope: 'external', limit: '100', sort: 'source_score', direction: 'asc' });
    await fetchDiscoveryMetadata(signal);
    expect([requests[1]!.method, requests[1]!.url.pathname]).toEqual(['GET', '/api/jav/discoveries/metadata']);
    await controlDiscoveryMetadata('cancel', { sort: 'duration', jobId: 'current' }, signal);
    expect([requests[2]!.method, requests[2]!.url.pathname]).toEqual(['POST', '/api/jav/discoveries/metadata']);
    expect(requests[2]!.body).toMatchObject({ action: 'cancel', sort: 'duration', direction: 'desc', job_id: 'current' });
    expect(discoveryKey('external', 'taste')).not.toEqual(discoveryKey('external', 'duration'));
  } finally { vi.unstubAllGlobals() }
});

it('Discovery covers prefer the local cache; remote covers go through the Peach proxy and keep their original large-image framing identity', () => {
  const item = { id: 1, code: 'ABC-001', has_cover: true, cover_url: 'https://pics.dmm.co.jp/digital/video/abc00001/abc00001pl.jpg' } as Discovery;
  const local = document.createElement('div');
  local.innerHTML = discoveryArtwork(item, 'big', 'cover');
  expect(local.querySelector('img')?.getAttribute('src')).toContain('/cover?code=ABC-001');
  local.innerHTML = discoveryArtwork({ ...item, has_cover: false }, 'small', 'cover');
  const image = local.querySelector('img')!;
  expect(image.getAttribute('src')).toBe('/cover-image?code=ABC-001');
  expect(image.dataset.javImageLayout).toBe('small');
  expect(image.dataset.javCover).toBe('/cover-image?code=ABC-001');
  expect(local.innerHTML).not.toContain('dmm.co.jp');
  expect(advanceImageFallback(image)).toBe('drop');
  expect(local.querySelector('span.media-nopic')?.textContent).toBe('No cover available');
  expect(discoveryArtwork({ ...item, has_cover: false, code: '' }, 'small', 'cover')).toBe('');
});
it('JAV sections restore from deep links, and unknown sections land on the library', () => {
  expect(javTab('discover')).toBe('discover'); expect(javTab('wants')).toBe('wants'); expect(javTab('other')).toBe('library');
});
it('The new-releases page size restores from the address; query parameters and cache are isolated per page size', async () => {
  const filters = releaseFilters('?page=3&size=50&tag=剧情&sort=duration&dir=asc');
  expect(filters).toMatchObject({ page: 3, size: 50, tag: '剧情', sort: 'duration', dir: 'asc' });
  expect(releaseKey(filters)).not.toEqual(releaseKey({ ...filters, size: 20 }));
  for (const size of ['0', '-1', '2.5', '101', 'Infinity', 'unknown']) {
    expect(releaseFilters(`?size=${size}`).size).toBe(24);
  }
  expect(releaseFilters('?page=Infinity').page).toBe(1);
  const fetcher = vi.fn(async (_input: string) => ({ ok: true, status: 200, json: async () => ({ items: [], total: 0 }) }));
  vi.stubGlobal('fetch', fetcher);
  try {
    await fetchReleases(filters, new AbortController().signal);
    const params = new URL(String(fetcher.mock.calls[0]?.[0]), 'https://peach.test').searchParams;
    expect(Object.fromEntries(params)).toEqual({ page: '3', size: '50', sort: 'duration', direction: 'asc', tag: '剧情' });
  } finally { vi.unstubAllGlobals() }
});
it('JAV library deep links keep search and filter conditions and use the catalog entry', () => {
  const url = new URL(javLibraryPath('?tab=library&q=ABC-123&studio=Demo label&loc=cloud&sort=new&jav=0'), 'https://peach.test');
  expect(url.pathname).toBe('/');
  expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'ABC-123', studio: 'Demo label', loc: 'cloud', sort: 'new', jav: '1' });
  expect(javPath('library')).toBe('/?jav=1');
  expect(javPath('unknown')).toBe('/?jav=1');
  expect(javPath('discover')).toBe('/jav?tab=discover');
  expect(javPath('wants')).toBe('/jav?tab=wants');
});
