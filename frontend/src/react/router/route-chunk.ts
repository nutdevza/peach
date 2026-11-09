/* Low-frequency pages' code is split into per-page chunks (ADR-0118): the route table's first-screen fetch stage loads them in
 * parallel with API requests, and once gathered the page renders synchronously.
 *
 * `React.lazy` is not used: the page must finish rendering with `flushSync` in the same task as `openManagedRoute`'s first
 * screen, and a lazy component's first render always throws a thenable once, which would add a blank frame. This module's
 * `get()` is only called after `preload()` has resolved.
 *
 * A load failure while opening a page may mean the server swapped to a new build and the chunk the old entry pointed at is
 * gone: if the service is alive, reload the page once to get the new entry, at most once per short window in the same
 * session; if the server is unreachable, the error throws as usual to the page's error boundary. Idle preload failures do not
 * reload; they wait for the next open. */

export interface RouteChunk<M> {
  /** Loads this page's module when the page opens. A failed load is not remembered; the next open retries. */
  preload(): Promise<M>;
  /** Loaded modules; throw if one is not loaded yet. */
  get(): M;
}

const warmers: (() => Promise<unknown>)[] = [];
const RELOAD_KEY = 'peach.chunkReloadAt';
const RELOAD_WINDOW_MS = 30_000;

async function recoverStaleBuild(): Promise<void> {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return;
    const health = await fetch('/healthz', { cache: 'no-store', credentials: 'same-origin' });
    if (!health.ok) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    location.reload();
  } catch {
    // Server unreachable or storage unavailable: no reload; the error goes to the caller.
  }
}

export function routeChunk<M>(load: () => Promise<M>): RouteChunk<M> {
  let loaded: { module: M } | null = null;
  let pending: Promise<M> | null = null;
  const attempt = (): Promise<M> => pending ??= load().then(
    (module) => { loaded = { module }; return module },
    (error: unknown) => { pending = null; throw error },
  );
  warmers.push(attempt);
  return {
    preload: () => attempt().catch(async (error: unknown) => { await recoverStaleBuild(); throw error }),
    get: () => {
      if (!loaded) throw new Error('Page code is still loading');
      return loaded.module;
    },
  };
}

/** Mount all low-traffic pages at once. Places that call the route table's `page()` directly instead of going through the first-screen fetch (component tests) wait for this first. */
export function loadRouteChunks(): Promise<void> {
  return Promise.all(warmers.map(warm => warm())).then(() => {});
}

/** After the first screen settles, all low-traffic pages load one by one while the browser is idle, so entering them the first time no longer waits on code.
 *  Environments without `requestIdleCallback` do not prewarm; they load on open as usual. */
export function warmRouteChunks(): void {
  const idle = globalThis.requestIdleCallback;
  if (typeof idle !== 'function') return;
  const queue = [...warmers];
  const next = () => {
    const warm = queue.shift();
    if (warm) idle(() => { void warm().catch(() => {}).finally(next) }, { timeout: 10_000 });
  };
  if (document.readyState === 'complete') next();
  else window.addEventListener('load', next, { once: true });
}
