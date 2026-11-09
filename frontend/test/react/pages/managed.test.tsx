/* The management area's page elements (`src/react/router/pages/managed.tsx`): the page group mounts them on match and they
 * open that page. First report the page change, then lay the skeleton (the same key as the shell's cold-start skeleton means
 * no re-render) and fetch the first screen; each unclaimed history change is one open, claimed address writes and details
 * stacking do not reopen; on unmount the page is torn down only if it is still exposed on `#stats`; `/resource-sync` and the
 * configuration page's `#libraryProcessing` rewrite the address without adding history entries.
 *
 * The history object and the shell's memory state are module-level; every case reloads them. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import type { ShellActions } from '../../../src/react/router/shell-actions';

const REACT_IMPORT_TIMEOUT_MS = 30_000;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => { await import('../../../src/react/router/router') }, REACT_IMPORT_TIMEOUT_MS);

async function load(path = '/') {
  vi.resetModules();
  window.history.replaceState(null, '', path);
  const [history, router, routes, shell, placeholder] = await Promise.all([
    import('../../../src/history'), import('../../../src/react/router/router'),
    import('../../../src/react/router/managed-routes'), import('../../../src/shell'),
    import('../../../src/management-placeholder'),
  ]);
  // The shell's in-memory state is a live binding: the whole module stays around to read, and what is expanded is only the value at mount time.
  return { ...history, ...router, ...routes, ...placeholder, shell };
}
type Loaded = Awaited<ReturnType<typeof load>>;

const unmounts: Array<() => void> = [];
afterEach(async () => {
  for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function shellActions(): ShellActions {
  return {
    openItem: vi.fn(), openEntity: vi.fn(), openTag: vi.fn(), openTasteSignal: vi.fn(), navigate: vi.fn(),
    openManage: vi.fn(), managePath: vi.fn(() => ''), openFollow: vi.fn(),
    receipt: vi.fn(), toast: vi.fn(), failure: vi.fn(), revealSource: vi.fn(async () => ''),
    reopenTutorial: vi.fn(async () => {}),
    routeReview: vi.fn(), routeFollowManage: vi.fn(), saveFollowPreference: vi.fn(), srcBadge: () => '',
    routeIndex: vi.fn(), savePeopleLayout: vi.fn(), exitSelectMode: vi.fn(),
    personAvatar: vi.fn(() => ({ html: '', face: '' })), authorAvatar: vi.fn(() => ''), showIndexTags: vi.fn(),
    openFollowAuthor: vi.fn(), openFollowTag: vi.fn(), openPlaylist: vi.fn(), canFlip: () => true,
    surfaceChanged: vi.fn(), clearSearch: vi.fn(), openImmerse: vi.fn(), openOverlay: vi.fn(), closeStage: vi.fn(), grid: {} as ShellActions['grid'],
  };
}

/** Mounts the route tree, wires the page bundle, then starts routing like the shell: `pageOpens` written as 1. */
async function boot(r: Loaded, actions = shellActions()) {
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<r.RouterRoot actions={actions} />) });
  unmounts.push(() => root.unmount());
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  await act(async () => { r.shell.writeShell({ pageOpens: 1 }) });
  return { actions };
}

/** The admin area body container, holding the skeleton from the shell's cold start. */
function surface(r: Loaded, path: string) {
  const stats = document.createElement('section');
  stats.id = 'stats';
  stats.innerHTML = r.managementSkeletonHtml(path, { followLayout: 'default', followSort: '', followDir: '' });
  document.body.append(stats);
  return { stats, skeleton: stats.firstElementChild! };
}

const tasks = (label = 'Update check') => ({
  available: true, running: [], skipped: [],
  finished: [{
    id: 1, task_key: 'follow-check', task_label: label, trigger: 'manual', status: 'succeeded', host: 'desk',
    started_at: '2026-09-11T10:00:00Z', finished_at: '2026-09-11T10:00:05Z', elapsed_seconds: 5,
    progress_current: null, progress_total: null, progress_label: '', result_summary: {}, error: '',
    parent_run_id: null, root_run_id: null, followup_key: '', followup_depth: 0,
  }],
});
const configuration = {
  editable: true, notice: '', revision: 'rev-1', media_dirs: ['D:\\Media'], port: 9123, facts: [],
  startup: { available: true, enabled: false, silent: true, message: '', desktop: false, desktop_message: '' },
  peach_proxy: { mode: 'environment', proxy_saved: false, needs_selection: false },
};
type Reply = { ok: boolean; status: number; json(): Promise<unknown> };
const reply = (body: unknown): Reply => ({ ok: true, status: 200, json: async () => body });

/** A fetch stand-in that answers by path: paths in `deferred` wait for manual resolution, and anything not in the table never answers (rejects on abort). */
function serve(bodies: Record<string, unknown>, deferred: string[] = []) {
  const pending: Array<() => void> = [];
  const signals = new Map<string, AbortSignal>();
  const fetched = vi.fn((input: string, init?: RequestInit) => {
    const path = input.split('?')[0]!;
    if (init?.signal) signals.set(path, init.signal);
    return new Promise<Reply>((resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')) });
      if (!Object.hasOwn(bodies, path)) return;
      if (deferred.includes(path)) pending.push(() => resolve(reply(bodies[path])));
      else resolve(reply(bodies[path]));
    });
  });
  vi.stubGlobal('fetch', fetched);
  const calls = (path: string) => fetched.mock.calls.filter(([input]) => input.split('?')[0] === path).length;
  return { fetched, calls, signal: (path: string) => signals.get(path), resolve: () => { for (const settle of pending.splice(0)) settle() } };
}

async function until(ok: () => boolean, what: string): Promise<void> {
  for (let step = 0; step < 200; step += 1) {
    if (ok()) return;
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });
  }
  throw new Error(`Timed out waiting for: ${what}`);
}
const settle = () => act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });

/** The block the page renders (the host's first element): after a remount it is a different one. */
const painted = (stats: Element) => stats.querySelector(':scope > .peach-react > *');

it('Opens on attach: it reports the page change first, the skeleton shares the cold-start key so it does not repaint, and the full page swaps in only when the first screen is complete', async () => {
  const r = await load('/tasks');
  const { stats, skeleton } = surface(r, '/tasks');
  const order: string[] = [];
  const actions = shellActions();
  vi.mocked(actions.surfaceChanged).mockImplementation((kind, path) => { order.push(`${kind} ${path}`) });
  const api = serve({ '/api/tasks': tasks(), '/api/downloads': { available: true, providers: [], tasks: [] } }, ['/api/tasks']);
  api.fetched.mockImplementationOnce(((original) => (input: string, init?: RequestInit) => {
    order.push(`fetch ${input.split('?')[0]}`);
    return original(input, init);
  })(api.fetched.getMockImplementation()!));
  await boot(r, actions);
  await until(() => api.calls('/api/tasks') > 0, 'First-screen fetch sent out');
  expect(order).toEqual(['management /tasks', 'fetch /api/tasks']);
  expect(stats.firstElementChild, 'The same skeleton kept as-is').toBe(skeleton);
  api.resolve();
  await until(() => painted(stats) !== null, 'The full page painted');
  expect(stats.firstElementChild).not.toBe(skeleton);
  expect(stats.textContent).toContain('Update check');
});

it('A claimed write address never reopens, and remounting a previously visited address uses the cache', async () => {
  const r = await load('/tasks');
  const { stats } = surface(r, '/tasks');
  const api = serve({ '/api/tasks': tasks(), '/api/downloads': { available: true, providers: [], tasks: [] } });
  await boot(r);
  await until(() => painted(stats) !== null, 'Drawn for the first time');
  const page = painted(stats);
  const revision = r.managedEntry(stats)?.revision;
  await act(async () => { r.shellNavigate('/tasks?from=menu', { replace: true }) });
  await settle();
  expect([api.calls('/api/tasks'), painted(stats)]).toEqual([1, page]);
  const length = window.history.length;
  await act(async () => { r.peachHistory.push('/tasks') });
  await until(() => painted(stats) !== null && painted(stats) !== page, 'Drawn after remount');
  expect(api.calls('/api/tasks')).toBe(1);
  expect(r.managedEntry(stats)?.revision).not.toBe(revision);
  expect(window.history.length - length).toBe(1);
});

it('With details on top the page neither tears down nor reopens, and closing returns to it as it was', async () => {
  const r = await load('/tasks');
  const { stats } = surface(r, '/tasks');
  const api = serve({ '/api/tasks': tasks(), '/api/downloads': { available: true, providers: [], tasks: [] } });
  await boot(r);
  await until(() => painted(stats) !== null, 'Painted');
  const page = painted(stats);
  const overlay = { backgroundLocation: { pathname: '/tasks', search: '' }, overlay: 'item' };
  await act(async () => { r.shellNavigate('/assets/7', { state: overlay }) });
  await settle();
  expect(painted(stats), 'The page under the stage stays mounted').toBe(page);
  await act(async () => { r.shellNavigate('/tasks') });
  await settle();
  expect([painted(stats), api.calls('/api/tasks')]).toEqual([page, 1]);
});

it('On back landing on a detail overlaying this page, when it was mounted (other pages visited in between) it does not open; closing the details and returning opens by address once', async () => {
  const r = await load('/tasks');
  const { stats } = surface(r, '/tasks');
  const api = serve({ '/api/tasks': tasks(), '/api/downloads': { available: true, providers: [], tasks: [] } });
  await boot(r);
  await until(() => painted(stats) !== null, 'Painted');
  const overlay = { backgroundLocation: { pathname: '/tasks', search: '' }, overlay: 'item' };
  await act(async () => { r.shellNavigate('/assets/7', { state: overlay }) });
  await settle();
  await act(async () => { r.shellNavigate('/'); stats.replaceChildren() });
  await settle();
  await act(async () => {
    window.history.replaceState({ usr: overlay, key: 'x', idx: 1 }, '', '/assets/7');
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  });
  await settle();
  expect([painted(stats), api.calls('/api/tasks')], 'Mounted under details without opening').toEqual([null, 1]);
  await act(async () => { r.shellNavigate('/tasks') });
  await until(() => painted(stats) !== null, 'Drawn after closing details');
  expect(api.calls('/api/tasks')).toBe(1);
});

it('Walking away keeps the manage-area host alive for the target page to switch into; the submit stage raises no synchronous submit alert', async () => {
  const errors = vi.spyOn(console, 'error');
  const r = await load('/tasks');
  const { stats } = surface(r, '/tasks');
  serve({ '/api/tasks': tasks(), '/api/downloads': { available: true, providers: [], tasks: [] } });
  await boot(r);
  await until(() => painted(stats) !== null, 'Painted');
  await act(async () => { r.shellNavigate('/') });
  await settle();
  expect(stats.querySelector('.peach-react')).not.toBeNull();
  expect(r.managedEntry(stats)?.path).toBe('/tasks');
  expect(errors).not.toHaveBeenCalled();

  await act(async () => { r.peachHistory.push('/tasks') });
  await until(() => painted(stats) !== null, 'Reopening paints it');
  const page = painted(stats);
  // The profile page comes on top: the shell hides `#stats` in the same task, the page stays hidden but alive, and only tears down at the next claim of the surface.
  await act(async () => { r.shellNavigate('/performers/someone'); stats.hidden = true });
  await settle();
  expect(painted(stats)).toBe(page);
  expect(errors).not.toHaveBeenCalled();
});

it('Walking away while waiting for `/healthz`: the read request aborts and this page never opens', async () => {
  const r = await load('/review?category=creator_tags');
  surface(r, '/review');
  const api = serve({ '/healthz': {} }, ['/healthz']);
  await boot(r);
  await until(() => api.calls('/healthz') > 0, 'Ask the read-only state');
  await act(async () => { r.shellNavigate('/') });
  await settle();
  expect(api.signal('/healthz')?.aborted).toBe(true);
  api.resolve();
  await settle();
  expect(api.fetched.mock.calls.map(([input]) => input.split('?')[0])).toEqual(['/healthz']);
});

it('Opening the taste page clears catalog filters and the search box, and the onboarding marker clears after being handed over once', async () => {
  const r = await load('/taste');
  r.shell.writeShell({
    state: { creator: 'a', studio: 'b', tag: 'c', tag_match: 'any', q: 'd', jav: '1', sort: 'seed' } as never,
    cameFromSetup: true,
  });
  surface(r, '/taste');
  serve({});
  const { actions } = await boot(r);
  await until(() => vi.mocked(actions.clearSearch).mock.calls.length > 0, 'Clear the search box');
  expect(r.shell.state).toMatchObject({
    creator: '', studio: '', tag: '', tag_match: 'all', len: '', dur_min: '', dur_max: '', orient: '', region: '',
    state: '', q: '', jav: '', sort: 'seed',
  });
  expect(r.shell.cameFromSetup).toBe(false);
});

it('The old `/resource-sync` deep link rewrites to the resource sync tool page without a history entry', async () => {
  const r = await load('/resource-sync');
  surface(r, '/resource-sync');
  serve({});
  const length = window.history.length;
  const { actions } = await boot(r);
  await until(() => location.pathname === '/data-cleanup/resource-sync', 'Rewrites to resource sync');
  await until(() => vi.mocked(actions.surfaceChanged).mock.calls.length > 0, 'Data management page opens');
  expect([location.hash, window.history.length - length]).toEqual(['', 0]);
  expect(r.peachHistory.navigation.claimed).toBe(false);
  expect(vi.mocked(actions.surfaceChanged).mock.calls).toEqual([['management', '/data-cleanup/resource-sync']]);
});

it('The configuration page enters with `#libraryProcessing`: once painted it rewrites to the data management block with no history entry', async () => {
  const r = await load('/settings/library#libraryProcessing');
  const { stats } = surface(r, '/settings/library');
  serve({ '/api/configuration': configuration });
  const length = window.history.length;
  const { actions } = await boot(r);
  await until(() => vi.mocked(actions.surfaceChanged).mock.calls.length > 1, 'Data management page opens');
  expect([location.pathname, location.hash, window.history.length - length]).toEqual(['/data-cleanup', '#libraryProcessing', 0]);
  expect(vi.mocked(actions.surfaceChanged).mock.calls.map(([, path]) => path)).toEqual(['/settings/library', '/data-cleanup']);
  expect(stats.hidden).toBe(false);
});

for (const [tab, target] of [['wants', '/jav'], ['source', '/settings/subscriptions']] as const) {
  it(`The old ${tab} entrance of follow management opens the target page and replaces the history entry`, async () => {
    const r = await load(`/subscriptions?tab=${tab}`);
    surface(r, '/subscriptions');
    serve({ '/healthz': {}, '/api/configuration': configuration });
    const length = window.history.length;
    const { actions } = await boot(r);
    await until(() => vi.mocked(actions.surfaceChanged).mock.calls.some(([, path]) => path === target), 'The target body opens');
    expect(location.pathname).toBe(target);
    expect(window.history.length).toBe(length);
    expect(r.peachHistory.navigation.claimed).toBe(false);
  });
}

it('The diagnostics page\'s title, manage identity, and shuffle behavior are registered in route metadata', async () => {
  const r = await load();
  expect(r.routeMetaOf('/settings/diagnostics')).toEqual({ section: 'configuration', title: 'System diagnostics', refresh: 'reopen' });
});
