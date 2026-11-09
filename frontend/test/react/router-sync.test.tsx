/* The routing base (`src/react/router/router.tsx` and `src/history/`): the router root commits synchronously in the same call
 * as the history change; unclaimed history changes each take a page-open epoch and elements keyed by generation remount
 * accordingly, while claimed address writes do not remount; route metadata covers the management, index and profile pages.
 *
 * The history object is module-level; every case reloads `src/history` and `src/react/router` (same as `router.test.tsx`). */
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useLocation } from 'react-router';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

const REACT_IMPORT_TIMEOUT_MS = 30_000;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => { await import('../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

async function load(path = '/') {
  vi.resetModules();
  window.history.replaceState(null, '', path);
  const [history, router, routes] = await Promise.all([
    import('../../src/history'), import('../../src/react/router/router'), import('../../src/react/router/managed-routes')]);
  return { ...history, ...router, ...routes };
}
type Loaded = Awaited<ReturnType<typeof load>>;

const unmounts: Array<() => void> = [];
afterEach(async () => {
  for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
});

async function mount(r: Loaded, children: React.ReactNode) {
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<r.RouterRoot>{children}</r.RouterRoot>) });
  unmounts.push(() => root.unmount());
}

function pop(path?: string) {
  if (path) window.history.replaceState(window.history.state, '', path);
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
}

/** Probe for the page group's `path="*"` cell: records the URL it sees, the page open counter, and how many times the epoch-keyed cell mounted. */
function probe(r: Loaded) {
  const seen = { paths: [] as string[], epochs: [] as number[], mounted: 0, unmounted: 0, keyed: 0 };
  function Keyed() {
    useEffect(() => { seen.keyed += 1 }, []);
    return null;
  }
  function Probe() {
    seen.paths.push(useLocation().pathname);
    const epoch = r.useOpenEpoch();
    seen.epochs.push(epoch);
    useEffect(() => { seen.mounted += 1; return () => { seen.unmounted += 1 } }, []);
    return <Keyed key={epoch} />;
  }
  return { seen, Probe };
}

it('By the time shellNavigate returns, the page group match is committed: the page being left unmounts on the spot and the page being returned to mounts on the spot', async () => {
  const r = await load('/nowhere');
  const { seen, Probe } = probe(r);
  await mount(r, <Probe />);
  const after: number[][] = [];
  await act(async () => {
    r.shellNavigate('/stats');
    after.push([seen.mounted, seen.unmounted]);
    pop('/nowhere');
    after.push([seen.mounted, seen.unmounted]);
    r.shellNavigate('/no/such');
    after.push([seen.mounted, seen.unmounted]);
  });
  expect(after).toEqual([[1, 1], [2, 1], [2, 1]]);
  expect(seen.paths.at(-1)).toBe('/no/such');
});

it('Unclaimed history changes each take a page open sequence number and remount generation-keyed elements on the spot; claimed ones write the URL and take none', async () => {
  const r = await load('/nowhere');
  const { seen, Probe } = probe(r);
  await mount(r, <Probe />);
  const keyed: number[] = [];
  const claimed: boolean[] = [];
  await act(async () => {
    r.shellNavigate('/nowhere?id=2', { replace: true });
    keyed.push(seen.keyed);
    claimed.push(r.peachHistory.navigation.claimed);
    r.shellNavigate('/nowhere?id=3');
    keyed.push(seen.keyed);
    claimed.push(r.peachHistory.navigation.claimed);
    r.peachHistory.push('/nowhere?id=4');
    keyed.push(seen.keyed);
    claimed.push(r.peachHistory.navigation.claimed);
    pop();
    keyed.push(seen.keyed);
    claimed.push(r.peachHistory.navigation.claimed);
    r.peachHistory.replace('/nowhere?id=5');
    keyed.push(seen.keyed);
    claimed.push(r.peachHistory.navigation.claimed);
  });
  expect(keyed).toEqual([1, 1, 2, 3, 4]);
  expect(claimed).toEqual([true, true, false, false, false]);
  expect(seen.mounted).toBe(1);
  expect(new Set(seen.epochs).size).toBe(4);
});

it('The route metadata registers exactly the management pages, playlists and follows, index, profiles, and the catalog, plus the rewritten legacy deep links and the six immersive and overlay entries', async () => {
  const r = await load();
  expect(new Set(Object.keys(r.ROUTE_META))).toEqual(new Set([
    ...Object.keys(r.MANAGED_ROUTES), ...Object.keys(r.REDIRECT_ROUTES), ...Object.keys(r.BROWSE_ROUTES),
    ...Object.keys(r.INDEX_ROUTES), ...Object.keys(r.ENTITY_ROUTES), ...r.CATALOG_PATHS,
    ...Object.keys(r.IMMERSE_ROUTES), ...r.OVERLAY_PATHS, ...r.PREFERENCE_PATHS]));
});
