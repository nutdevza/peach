import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiGet, apiSend } from '../src/api';
import { api } from '../src/core';

describe('Library query scope', () => {
  const fetchMock = vi.fn(async (_url: string, _options?: RequestInit) => new Response('{}', { headers: { 'Content-Type': 'application/json' } }));
  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals() });

  for (const [name, get] of [['React', apiGet], ['App', api]] as const) {
    it(`${name}: catalog, search, and filters read the current library on every pass`, async () => {
      sessionStorage.setItem('peach.library', 'Local & A');
      await get('/api/items?q=影片&offset=48#results');
      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/items?q=影片&offset=48&library=Local%20%26%20A#results');
      sessionStorage.setItem('peach.library', 'cloud');
      await get('/api/facets?');
      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/facets?library=cloud');
      sessionStorage.removeItem('peach.library');
      await get('/api/items?limit=1');
      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/items?limit=1');
    });

    it(`${name}: explicit ranges and other endpoints preserve caller params`, async () => {
      sessionStorage.setItem('peach.library', 'selected');
      for (const path of ['/api/items?library=other', '/api/items?library=', '/api/facets?%6cibrary=other',
        '/api/item?id=1', '/api/items-extra', '/api/libraries', 'https://example.test/api/items']) {
        await get(path);
        expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(path);
      }
    });
  }

  it('Write operations preserve the caller\'s scope and request body', async () => {
    sessionStorage.setItem('peach.library', 'selected');
    await api('/api/items', { method: 'POST', body: '{}' });
    await apiSend('/api/items', { id: 1 });
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/items', '/api/items']);
    expect(fetchMock.mock.calls.map(call => [call[1]?.method, call[1]?.body])).toEqual([
      ['POST', '{}'], ['POST', '{"id":1}'],
    ]);
  });
});

describe('Cancels the request while the body is being read', () => {
  afterEach(() => { vi.unstubAllGlobals() });

  for (const method of ['GET', 'POST'] as const) {
    it(`${method} preserves the cancellation reason`, async () => {
      const controller = new AbortController();
      const cancelled = new DOMException('Aborted', 'AbortError');
      let rejectBody!: (reason: unknown) => void;
      const body = new Promise<never>((_resolve, reject) => { rejectBody = reject });
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: () => body })));
      const pending = method === 'GET'
        ? apiGet('/api/duplicates', controller.signal)
        : apiSend('/api/batch', { ids: [1] }, 'POST', controller.signal);
      const rejected = expect(pending).rejects.toBe(cancelled);
      controller.abort(cancelled);
      rejectBody(cancelled);
      await rejected;
    });
  }
});
