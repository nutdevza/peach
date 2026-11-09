/* Low-frequency page chunk loading (ADR-0118): failing to load while opening a page but the service is up means the old entry points to a deleted chunk, so full reload once;
 * no second reload within 30s of the same session, no reload when the service is unreachable, and no reload on failed idle prewarm. */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let reload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  sessionStorage.clear();
  reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() });

const missing = () => Promise.reject(new TypeError('Failed to fetch dynamically imported module'));

it('get() throws before install, returns the module synchronously after it, and the second open does not load again', async () => {
  const { routeChunk } = await import('../src/react/router/route-chunk');
  const load = vi.fn(async () => ({ Page: 'page' }));
  const chunk = routeChunk(load);
  expect(() => chunk.get()).toThrow('Page code is still loading');
  await chunk.preload();
  await chunk.preload();
  expect(chunk.get()).toEqual({ Page: 'page' });
  expect(load).toHaveBeenCalledTimes(1);
});

it('If mounting fails on open while the service is reachable, reload once; a second failure within 30 seconds does not reload, the failed attempt is not remembered and retries next time', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
  const { routeChunk } = await import('../src/react/router/route-chunk');
  const load = vi.fn(missing);
  const chunk = routeChunk(load);
  await expect(chunk.preload()).rejects.toThrow('dynamically imported module');
  expect(reload).toHaveBeenCalledTimes(1);
  expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/healthz');
  await expect(chunk.preload()).rejects.toThrow('dynamically imported module');
  expect(load).toHaveBeenCalledTimes(2);
  expect(reload).toHaveBeenCalledTimes(1);
});

it('When the service is unreachable it never reloads, handing errors to the page', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }));
  const { routeChunk } = await import('../src/react/router/route-chunk');
  await expect(routeChunk(missing).preload()).rejects.toThrow('dynamically imported module');
  expect(reload).not.toHaveBeenCalled();
});

it('Idle warm-up loads one by one; failures are not reloaded and are retried when opened', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => { queueMicrotask(callback); return 0 });
  const { routeChunk, warmRouteChunks } = await import('../src/react/router/route-chunk');
  const broken = vi.fn(missing);
  const fine = vi.fn(async () => ({ ok: 1 }));
  routeChunk(broken);
  const chunk = routeChunk(fine);
  warmRouteChunks();
  await vi.waitFor(() => expect(fine).toHaveBeenCalledTimes(1));
  expect(broken).toHaveBeenCalledTimes(1);
  expect(chunk.get()).toEqual({ ok: 1 });
  expect(reload).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
