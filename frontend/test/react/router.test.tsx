/* Client-side navigation (`src/react/router/`): how the two `<Routes>` groups match. The page group matches on the background
 * the entry recorded (the startup entry does not read it); the overlay group matches on the real address; `path="*"` is the
 * unrecognized address, and that cell is one instance from start to finish across unrecognized addresses. Unclaimed history
 * changes (back/forward, `navigate` from the React subtree) each take a page-open epoch; claimed shell writes do not. When
 * each page opens, see the cases under `pages/`; the details overlay in `pages/overlay.test.tsx`, the management pages' host
 * in `managed-routes.test.tsx`.
 *
 * The history object is module-level, matching the single instance on the page, so every case reloads `src/history` and
 * `src/react/router`. React and React Router live in node_modules and are not reloaded; components still write JSX. */
import { act, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { useLocation, useNavigate } from 'react-router';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

// The first import compiles the whole page subtree the route table pulls in, with the compile wait on its own finite window; every later case remounts and only reruns the module.
const REACT_IMPORT_TIMEOUT_MS = 30_000;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => { await import('../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

/* `path` and `entry` are the address and that history entry at load time (`{ usr, key, idx }`, and the entry still rides along after a refresh). */
async function load(path = '/nowhere', entry: unknown = null) {
  vi.resetModules();
  window.history.replaceState(entry, '', path);
  const [history, router] = await Promise.all([import('../../src/history'), import('../../src/react/router/router')]);
  return { ...history, ...router };
}
type Loaded = Awaited<ReturnType<typeof load>>;

const unmounts: Array<() => void> = [];
afterEach(async () => {
  for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
});

async function mount(r: Loaded, children?: ReactNode) {
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<r.RouterRoot>{children}</r.RouterRoot>) });
  unmounts.push(() => root.unmount());
}

/** The browser's own back and forward: the address changes first, then `popstate` fires; without an address it replays the same entry. */
function pop(path?: string) {
  if (path) window.history.replaceState(window.history.state, '', path);
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
}

/* The `usr` of details and queue entries: which page they press on, matching the shape the shell writes. */
const over = (pathname: string, overlay: 'item' | 'follow' = 'item', search = '') =>
  ({ backgroundLocation: { pathname, search }, overlay });

/** The probe in the page group's `path="*"` cell: records mounts, unmounts and the addresses it sees. */
function probe() {
  const seen = { mounted: 0, unmounted: 0, paths: [] as string[] };
  function Probe() {
    seen.paths.push(useLocation().pathname);
    useEffect(() => { seen.mounted += 1; return () => { seen.unmounted += 1 } }, []);
    return null;
  }
  return { seen, Probe };
}

it('Switching between unrecognized addresses keeps the page group\'s path="*" slot on the same instance', async () => {
  const r = await load('/nowhere');
  const { seen, Probe } = probe();
  await mount(r, <Probe />);
  await act(async () => { r.shellNavigate('/also/nowhere') });
  await act(async () => { pop('/x/y') });
  await act(async () => { pop() });
  expect([seen.mounted, seen.unmounted]).toEqual([1, 0]);
  expect(seen.paths.at(-1)).toBe('/x/y');
});

it('While details covers the page underneath, the elements of the page group never remount, and what you see is the background page', async () => {
  const r = await load('/nowhere');
  const { seen, Probe } = probe();
  await mount(r, <Probe />);
  const steps: Array<[string, ReturnType<typeof over>]> = [
    ['/posts/3', over('/nowhere', 'follow')], ['/assets/7', over('/nowhere')], ['/assets/2?parts=1', over('/nowhere')]];
  for (const [path, state] of steps) await act(async () => { r.shellNavigate(path, { state }) });
  await act(async () => { pop('/posts/3') });
  await act(async () => { r.peachHistory.push('/assets/5?mix=4', over('/nowhere')) });
  expect([seen.mounted, seen.unmounted]).toEqual([1, 0]);
  expect(new Set(seen.paths)).toEqual(new Set(['/nowhere']));
});

it('The page group matches by background: a management page background matches that entry; an overlay address without a background mounts its own slot; and neither group reports a missing route', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const r = await load('/nowhere');
    const { seen, Probe } = probe();
    await mount(r, <Probe />);
    await act(async () => { r.shellNavigate('/assets/7', { state: over('/stats', 'item', '?range=30') }) });
    expect([seen.mounted, seen.unmounted]).toEqual([1, 1]);
    await act(async () => { r.shellNavigate('/assets/8') });
    expect(seen.mounted, 'Video addresses without background never land in the unrecognized slot').toBe(1);
    await act(async () => { r.shellNavigate('/no/such/page') });
    expect(seen.mounted).toBe(2);
    const unmatched = warn.mock.calls.map((call) => String(call[0])).filter((text) => text.includes('No routes matched'));
    expect(unmatched).toEqual([]);
  } finally {
    warn.mockRestore();
  }
});

it('The startup entry does not read the background: a refresh landing on a details entry with a background is treated as having none; only back and forward returning to this entry read it', async () => {
  const r = await load('/assets/7', { usr: over('/nowhere'), key: 'boot', idx: 0 });
  const { seen, Probe } = probe();
  await mount(r, <Probe />);
  expect(r.navigationBackground()).toBeNull();
  expect(seen.mounted, 'The launch entry still has no background; the video URL hangs on its own cell').toBe(0);
  await act(async () => { pop() });
  expect(r.navigationBackground()).toEqual({ pathname: '/nowhere', search: '' });
  expect(seen.mounted, 'Back/forward returns to this item, matching by background').toBe(1);
});

it('Addresses written by shell claims get no page-open sequence number; back/forward and navigate in the React subtree each get one, and a popstate with an unchanged address counts too', async () => {
  const r = await load('/nowhere');
  let navigate: ReturnType<typeof useNavigate> | null = null;
  function Probe() { navigate = useNavigate(); return null }
  await mount(r, <Probe />);
  const epoch = () => r.peachHistory.navigation.openEpoch;
  const start = epoch();
  await act(async () => { r.shellNavigate('/stats') });
  await act(async () => { r.shellNavigate('/taste', { replace: true }) });
  expect([epoch() - start, r.peachHistory.navigation.claimed]).toEqual([0, true]);
  await act(async () => { pop('/nowhere') });
  await act(async () => { pop() });
  expect(epoch() - start).toBe(2);
  await act(async () => { void navigate!('/performers') });
  expect([epoch() - start, r.peachHistory.navigation.claimed, location.pathname]).toEqual([3, false, '/performers']);
});
