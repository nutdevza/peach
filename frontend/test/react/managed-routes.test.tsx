/* The pages rendered by the router (`src/history/managed.ts` and `src/react/router/`; management renders into `#stats`, index
 * into `#index`): the shell's skeleton survives until the first screen is fetched, and the swap to the full page lands in the
 * same task; a cold start fetches once whether the Router mounts first or opens first; every open refetches, and the shell's
 * toggles merge in place without remounting; the two containers never tear each other down; with the details stage stacked on
 * top the page stays, torn down only when the shell next claims a surface; jumps between management pages go through React
 * Router, the rest to the shell.
 *
 * The history object and each container's registration are module-level, matching the single instance on the page, so every
 * case reloads `src/history` and `src/react/router`. */
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { NavigateFunction } from 'react-router';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';

import type {
  ConfigurationProps, DataCleanupProps, DuplicatesProps, FollowManageProps, QualityGoalsProps, ReviewProps,
  ScrapingProps, StatsProps, TasteProps,
} from '../../src/react/bundle';
import type { ShellActions } from '../../src/react/router/shell-actions';
import type { DiagnosticsProps } from '../../src/react/diagnostics/diagnostics-page';

// The first import compiles the whole page subtree the route table pulls in, with the compile wait on its own finite window; every later case remounts and only reruns the module.
const REACT_IMPORT_TIMEOUT_MS = 30_000;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(async () => {
  await import('../../src/react/router/router');
  await (await import('../../src/react/router/route-chunk')).loadRouteChunks();
}, REACT_IMPORT_TIMEOUT_MS);

async function load(path = '/') {
  vi.resetModules();
  window.history.replaceState(null, '', path);
  const [history, router, routes, chunks] = await Promise.all([
    import('../../src/history'), import('../../src/react/router/router'), import('../../src/react/router/managed-routes'),
    import('../../src/react/router/route-chunk'),
  ]);
  // Below, tests call `page()` directly to read props without going through the first-screen fetch; the low-traffic page's code mounts first.
  await chunks.loadRouteChunks();
  return { ...history, ...router, ...routes };
}
type Loaded = Awaited<ReturnType<typeof load>>;

const unmounts: Array<() => void> = [];
afterEach(async () => {
  for (const unmount of unmounts.splice(0)) await act(async () => { unmount() });
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

function shellActions(): ShellActions {
  const sections: Record<string, string> = { review: '/review', quality: '/quality-goals', trash: '/trash' };
  return {
    openItem: vi.fn(), openEntity: vi.fn(), openTag: vi.fn(), openTasteSignal: vi.fn(), navigate: vi.fn(),
    openManage: vi.fn(), managePath: vi.fn((section: string) => sections[section] ?? ''), openFollow: vi.fn(),
    receipt: vi.fn(), toast: vi.fn(), failure: vi.fn(), revealSource: vi.fn(async () => ''),
    reopenTutorial: vi.fn(async () => {}),
    routeReview: vi.fn(), routeFollowManage: vi.fn(), saveFollowPreference: vi.fn(), srcBadge: () => '',
    routeIndex: vi.fn(), savePeopleLayout: vi.fn(), exitSelectMode: vi.fn(),
    personAvatar: vi.fn(() => ({ html: '', face: '' })), authorAvatar: vi.fn(() => ''), showIndexTags: vi.fn(),
    openFollowAuthor: vi.fn(), openFollowTag: vi.fn(), openPlaylist: vi.fn(), canFlip: () => true,
    surfaceChanged: vi.fn(), clearSearch: vi.fn(), openImmerse: vi.fn(), openOverlay: vi.fn(), closeStage: vi.fn(), grid: {} as ShellActions['grid'],
  };
}

async function mount(r: Loaded, actions = shellActions()) {
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<r.RouterRoot actions={actions} />) });
  unmounts.push(() => root.unmount());
  return actions;
}

/** The admin area body container, holding the skeleton the shell laid down. */
function surface() {
  const stats = document.createElement('section');
  stats.id = 'stats';
  stats.innerHTML = '<div class="geist-skeleton" data-skeleton="activity">Reading</div>';
  document.body.append(stats);
  return { stats, skeleton: stats.firstElementChild! };
}

/** The first-screen `/api/tasks` copy for the activity page: only the round that just finished, and its name tells which fetch this render came from. */
const tasks = (label = 'Update check') => ({
  available: true, running: [], skipped: [],
  finished: [{
    id: 1, task_key: 'follow-check', task_label: label, trigger: 'manual', status: 'succeeded', host: 'desk',
    started_at: '2026-09-11T10:00:00Z', finished_at: '2026-09-11T10:00:05Z', elapsed_seconds: 5,
    progress_current: null, progress_total: null, progress_label: '', result_summary: {}, error: '',
    parent_run_id: null, root_run_id: null, followup_key: '', followup_depth: 0,
  }],
});
const DOWNLOADS = { available: true, providers: [], tasks: [] };
type Reply = { ok: boolean; status: number; json(): Promise<unknown> };
const reply = (body: unknown): Reply => ({ ok: true, status: 200, json: async () => body });

/** The activity page's fetches: `/api/tasks` fulfilled manually (the first screen waits for exactly it), while the cloud download section's separate `/api/downloads` returns an empty table on the spot. */
function tasksFetch(body: unknown = tasks(), { deferred = true } = {}) {
  const pending: Array<() => void> = [];
  let signal: AbortSignal | undefined;
  const fetched = vi.fn((input: string, init?: RequestInit) => {
    if (input.startsWith('/api/downloads')) return Promise.resolve(reply(DOWNLOADS));
    signal = init?.signal ?? undefined;
    if (!deferred) return Promise.resolve(reply(body));
    return new Promise<Reply>((resolve, reject) => {
      pending.push(() => resolve(reply(body)));
      signal?.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')) });
    });
  });
  const taskCalls = () => fetched.mock.calls.filter(([input]) => input.startsWith('/api/tasks')).length;
  return {
    fetched, taskCalls,
    resolve: () => { for (const settle of pending.splice(0)) settle() },
    signal: () => signal,
    install: () => vi.stubGlobal('fetch', fetched),
  };
}

/** What the container looks like as each batch of DOM changes lands: whether the skeleton is still there, whether the full page has rendered. */
function watch(stats: Element, skeleton: Element, label = 'Update check') {
  const batches: Array<{ skeleton: boolean; painted: boolean }> = [];
  const observer = new MutationObserver(() => {
    batches.push({ skeleton: stats.contains(skeleton), painted: Boolean(stats.textContent?.includes(label)) });
  });
  observer.observe(stats, { childList: true, subtree: true });
  unmounts.push(() => observer.disconnect());
  return batches;
}

async function until(ok: () => boolean, what: string): Promise<void> {
  for (let step = 0; step < 200; step += 1) {
    if (ok()) return;
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

/* The open pipeline is called directly here: the test drops the address on the home page or on actions that bypass the shell; managed-area page elements do not open (for how elements open, see
   `pages/managed.test.tsx`). */
const open = (r: Loaded, stats: Element, isCurrent = () => true) =>
  r.openManagedRoute('/tasks', {}, { container: stats, isCurrent });
/** The block the page renders (the host's first element): after a remount it is a different one. */
const painted = (stats: Element) => stats.querySelector(':scope > .peach-react > *');

it('Cold start deep link, Router mounts first: the shell-drawn skeleton stays until the first screen completes, and the swap to full page happens in the same batch of changes', async () => {
  const r = await load('/');
  const { stats, skeleton } = surface();
  await mount(r);
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  const fetch = tasksFetch();
  fetch.install();
  let opened: Promise<boolean> | undefined;
  await act(async () => { opened = open(r, stats) });
  await until(() => fetch.taskCalls() > 0, 'First-screen fetch sent out');
  expect(stats.firstElementChild, 'Skeleton kept as-is until data lines up').toBe(skeleton);
  const batches = watch(stats, skeleton);
  fetch.resolve();
  await act(async () => { expect(await opened).toBe(true) });
  expect(fetch.taskCalls()).toBe(1);
  expect(batches[0], 'Within the batch that removes the skeleton the full page is already painted, with no blank frame between').toEqual({ skeleton: false, painted: true });
  expect(stats.querySelector(':scope > .peach-react')?.textContent).toContain('Update check');
});

it('Cold start deep link, shell opens first and Router mounts after: data fetches only once the bundle arrives, and the skeleton likewise stays until the full-page swap', async () => {
  const r = await load('/');
  const { stats, skeleton } = surface();
  let arrive: (prefetch: typeof r.prefetchManagedRoute) => void = () => {};
  r.connectManagedRoutes(new Promise((resolve) => { arrive = resolve }));
  const fetch = tasksFetch();
  fetch.install();
  let opened: Promise<boolean> | undefined;
  await act(async () => { opened = open(r, stats) });
  await mount(r);
  expect(fetch.fetched).not.toHaveBeenCalled();
  expect(stats.firstElementChild).toBe(skeleton);
  await act(async () => { arrive(r.prefetchManagedRoute) });
  await until(() => fetch.taskCalls() > 0, 'First-screen fetch sent out');
  expect(stats.firstElementChild).toBe(skeleton);
  const batches = watch(stats, skeleton);
  fetch.resolve();
  await act(async () => { expect(await opened).toBe(true) });
  expect(fetch.taskCalls()).toBe(1);
  expect(batches[0]).toEqual({ skeleton: false, painted: true });
});

it('In-app navigation: when the in-flight one is collapsed the container is untouched; the skeleton the shell kept is only swapped at the next open', async () => {
  const r = await load('/tasks');
  const { stats, skeleton } = surface();
  await mount(r);
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  const first = tasksFetch(tasks('First time'));
  first.install();
  const firstOpen = open(r, stats);
  await until(() => first.taskCalls() > 0, 'The first fetch went out');
  // The shell claims the surface (`claimSurface`): the in-flight first-screen fetch aborts, and this round is not drawn.
  act(() => { r.releaseManagedRoute(stats) });
  expect(first.signal()?.aborted).toBe(true);
  await act(async () => { expect(await firstOpen).toBe(false) });
  expect(stats.firstElementChild, 'The in flight collapse does not touch the shell skeleton').toBe(skeleton);
  const second = tasksFetch(tasks('Second time'));
  second.install();
  const secondOpen = open(r, stats);
  await until(() => second.taskCalls() > 0, 'The second fetch went out');
  expect(stats.firstElementChild).toBe(skeleton);
  const batches = watch(stats, skeleton, 'Second time');
  second.resolve();
  await act(async () => { expect(await secondOpen).toBe(true) });
  expect(batches[0]).toEqual({ skeleton: false, painted: true });
  expect(stats.textContent).not.toContain('First time');
});

it('If the shell changed pages during the fetch nothing paints, leaving the skeleton to the next page', async () => {
  const r = await load('/tasks');
  const { stats, skeleton } = surface();
  await mount(r);
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  const fetch = tasksFetch();
  fetch.install();
  let current = true;
  const opening = open(r, stats, () => current);
  await until(() => fetch.taskCalls() > 0, 'Fetch request sent');
  current = false;
  fetch.resolve();
  await act(async () => { expect(await opening).toBe(false) });
  expect(stats.firstElementChild).toBe(skeleton);
  expect(r.managedEntry(stats)).toBeNull();
});

it('Opening the same path again refetches: each open takes a new generation and the page remounts', async () => {
  const r = await load('/tasks');
  const { stats } = surface();
  await mount(r);
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  const fetch = tasksFetch(tasks(), { deferred: false });
  fetch.install();
  await act(async () => { await open(r, stats) });
  const page = painted(stats);
  const revision = r.managedEntry(stats)?.revision;
  act(() => { r.releaseManagedRoute(stats) });
  expect(stats.querySelector('.peach-react'), 'Host unmounts along with the collapse').toBeNull();
  await act(async () => { await open(r, stats) });
  expect(fetch.taskCalls()).toBe(2);
  expect(r.managedEntry(stats)?.revision).not.toBe(revision);
  expect(painted(stats)).not.toBeNull();
  expect(painted(stats)).not.toBe(page);
});

it('With the details stage on top the page stays, and the address returning does not remount it; it collapses only when the shell next claims the surface', async () => {
  const r = await load('/');
  const { stats } = surface();
  await mount(r);
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  tasksFetch(tasks(), { deferred: false }).install();
  await act(async () => { await open(r, stats) });
  const page = painted(stats);
  expect(page).not.toBeNull();
  // Details are pushed by the shell to `/assets/:id` without claiming the surface.
  await act(async () => { r.shellNavigate('/assets/7') });
  expect(painted(stats), 'The page under the stage must never unmount with the address').toBe(page);
  // Closing details: the shell writes the address back to the list page.
  await act(async () => { r.shellNavigate('/') });
  expect(painted(stats)).toBe(page);
  act(() => { r.releaseManagedRoute(stats) });
  expect(stats.children).toHaveLength(0);
});

it('The shell rewriting the container directly then collapsing raises no error: the page paints inside its own host', async () => {
  const r = await load('/tasks');
  const { stats } = surface();
  await mount(r);
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  tasksFetch(tasks(), { deferred: false }).install();
  const errors = vi.spyOn(console, 'error');
  await act(async () => { await open(r, stats) });
  stats.innerHTML = '<p>Another page</p>';
  act(() => { r.releaseManagedRoute(stats) });
  expect(errors).not.toHaveBeenCalled();
  expect(stats.innerHTML).toBe('<p>Another page</p>');
  expect(r.managedEntry(stats)).toBeNull();
});

it('Opening before the route tree loads: the container goes to the route tree first without fetching; the first screen fetches and paints only after it loads', async () => {
  const r = await load('/tasks');
  const { stats, skeleton } = surface();
  const fetch = tasksFetch(tasks(), { deferred: false });
  fetch.install();
  const opening = open(r, stats);
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) });
  expect(fetch.taskCalls(), 'No fetching when not mounted').toBe(0);
  expect(stats.firstElementChild).toBe(skeleton);
  expect(r.managedTaken(stats), 'The waiting attempt already holds the container, so the shell never reopens').toBe(true);

  await mount(r);
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  await act(async () => { expect(await opening).toBe(true) });
  expect(fetch.taskCalls()).toBe(1);
  expect(painted(stats)).not.toBeNull();
});

it('When the bundle cannot come back the waiting page fails with it', async () => {
  const r = await load('/tasks');
  const { stats, skeleton } = surface();
  r.connectManagedRoutes(Promise.reject(new Error('Could not fetch peach-react.js')));
  await expect(open(r, stats)).rejects.toThrow('Could not fetch peach-react.js');
  expect(stats.firstElementChild).toBe(skeleton);
});

const configuration = {
  editable: true, notice: '', revision: 'rev-1', media_dirs: ['D:\\Media'], port: 9123, facts: [],
  startup: { available: true, enabled: false, silent: true, message: '', desktop: false, desktop_message: '' },
  peach_proxy: { mode: 'environment', proxy_saved: false, needs_selection: false },
};

/* The shell scrolls to `#peachProxy` the moment it opens in return, so the tab bar's and the handed-in group's selected states must paint in the same commit.
   How sections arrange and tabs behave is in `configuration.test.tsx`. */
it('The moment the configuration page opens and returns, the tab strip is already in the container with the handed-in group selected', async () => {
  const r = await load('/settings/library');
  const { stats } = surface();
  await mount(r);
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => {
    if (url === '/api/configuration') return configuration;
    if (url === '/api/configuration/indexers') return { indexers: [], max_indexers: 4 };
    if (url === '/api/follow/credentials') return { root: '', providers: [] };
    if (url === '/api/follow/schedule') return { enabled: false, available: true, interval_minutes: 60 };
    return { mode: 'off', status: 'idle' };
  } })));
  await act(async () => {
    const open = { section: 'Network & access' };
    expect(await r.openManagedRoute('/settings/library', open, { container: stats, isCurrent: () => true })).toBe(true);
    const tabs = [...stats.querySelectorAll('.ui-configpage [role="tablist"] > [role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Library and imports', 'Sources and subscriptions', 'Network & access', 'App and maintenance', 'System diagnostics']);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'false', 'true', 'false', 'false']);
    const active = stats.querySelector('.ui-board-group-active');
    expect(active?.id).toBe(tabs[2].getAttribute('aria-controls'));
    expect(stats.querySelector('.ui-configpage')?.parentElement?.classList.contains('peach-react')).toBe(true);
  });
});

it('Navigation between these pages goes through React Router; other paths go to the shell', async () => {
  const r = await load('/');
  const actions = shellActions();
  const navigate = vi.fn();
  r.managedGo('/tasks', actions, navigate);
  r.managedGo('/sources?from=cleanup#top', actions, navigate);
  r.managedGo('/', actions, navigate);
  r.managedGo('/trash', actions, navigate);
  expect(navigate.mock.calls).toEqual([['/tasks'], ['/sources?from=cleanup#top']]);
  expect(vi.mocked(actions.navigate).mock.calls).toEqual([['/'], ['/trash']]);
});

it('In-page jumps: claim exactly one page-open counter and add exactly one history entry', async () => {
  const r = await load('/sources');
  await mount(r);
  const epoch = r.peachHistory.navigation.openEpoch;
  const before = window.history.length;
  const navigate = ((to: string) => { r.peachHistory.push(to) }) as unknown as NavigateFunction;
  await act(async () => { r.managedGo('/tasks', shellActions(), navigate) });
  expect([r.peachHistory.navigation.openEpoch - epoch, location.pathname, window.history.length - before]).toEqual([1, '/tasks', 1]);
});

/** A page's element and the props it received, without rendering. */
function element<P>(path: keyof Loaded['MANAGED_ROUTES'], r: Loaded, open: object, actions: ShellActions, go: (path: string) => void) {
  return (r.MANAGED_ROUTES[path].page as (open: object, actions: ShellActions, go: (path: string) => void) => ReactElement<P>)(
    open, actions, go).props;
}

it('Videos on the diagnostics page go through the shared entry; each destination is handled by in-page links and never calls go', async () => {
  const r = await load();
  const actions = shellActions();
  const go = vi.fn();
  const page = element<ConfigurationProps & { diagnostics: ReactElement<DiagnosticsProps> }>('/settings/diagnostics', r, {}, actions, go);
  const props = page.diagnostics.props;
  props.openItem(12);
  expect(actions.openItem).toHaveBeenCalledWith(12);
  expect(go).not.toHaveBeenCalled();
});

it('Stats page: clicking a tag hands back to the shell catalog', async () => {
  const r = await load();
  const actions = shellActions();
  const props = element<StatsProps>('/stats', r, {}, actions, vi.fn());
  props.onTag('Nympho');
  expect(vi.mocked(actions.openTag).mock.calls).toEqual([['Nympho']]);
  expect(props.tagLabel('JK uniform')).toBe('JK uniform');
});

it('Taste page: the summary\'s next-step routes through go', async () => {
  const r = await load();
  const go = vi.fn();
  const props = element<TasteProps>('/taste', r, { onboarding: true }, shellActions(), go);
  props.navigate('/subscriptions');
  props.navigate('/');
  expect(go.mock.calls).toEqual([['/subscriptions'], ['/']]);
  expect(props.onboarding).toBe(true);
});

it('Data management page: review, HD versions, and duplicates use go, while junk files and trash go to the shell', async () => {
  const r = await load();
  const actions = shellActions();
  const go = vi.fn();
  const props = element<DataCleanupProps>('/data-cleanup', r, {}, actions, go);
  for (const section of ['review', 'quality', 'duplicates', 'ads', 'trash'] as const) props.open(section);
  expect(go.mock.calls).toEqual([['/review'], ['/quality-goals'], ['/duplicates']]);
  expect(vi.mocked(actions.openManage).mock.calls).toEqual([['ads'], ['trash']]);
  props.toast('Done', { warning: true });
  props.toast('Done');
  expect(vi.mocked(actions.toast).mock.calls).toEqual([[{ text: 'Done' }, { sound: 'warning' }]]);
  expect(vi.mocked(actions.receipt).mock.calls).toEqual([['Done']]);
});

it('Review and follow-management pages write the address back to the shell without reopening', async () => {
  const r = await load();
  const actions = shellActions();
  const go = vi.fn();
  const review = element<ReviewProps>('/review', r,
    { category: 'name', readOnly: true, readOnlyMessage: 'Read-only', writerUrl: '' }, actions, go);
  expect([review.route, review.category, review.readOnly]).toEqual([actions.routeReview, 'name', true]);
  const follow = element<FollowManageProps>('/subscriptions', r, {
    tab: 'list', page: 2, sort: '', dir: '', pageSize: 20, layout: 'default', readOnly: false, readOnlyMessage: '', writerUrl: '',
  }, actions, go);
  expect([follow.route, follow.savePreference, follow.openFollow, follow.page])
    .toEqual([actions.routeFollowManage, actions.saveFollowPreference, actions.openFollow, 2]);
});

it('Receipts, opening videos, and profile pages all hand back to the shell: receipts when navigating to them', async () => {
  const r = await load();
  const actions = shellActions();
  const undo = async () => {};
  const go = vi.fn();
  const goals = element<QualityGoalsProps>('/quality-goals', r, {}, actions, go);
  goals.openItem(3);
  expect(goals.srcBadge).toBe(actions.srcBadge);
  expect(goals.javDisplayName({ name: 'ABC-123 title.mp4' } as never)).toContain('ABC-123');
  expect(goals.javTitleHtml({ name: '<b>.mp4' } as never)).not.toContain('<b>');
  goals.toast('Offline download submitted');
  const duplicates = element<DuplicatesProps>('/duplicates', r, {}, actions, vi.fn());
  duplicates.toast('Deleted', { undo });
  duplicates.toast('Kept');
  duplicates.failure('Delete', 'boom');
  const configuration = element<ConfigurationProps>('/settings/library', r, { section: 'Library and imports' }, actions, vi.fn());
  configuration.receipt('Configuration saved');
  expect([configuration.reopenTutorial, configuration.section]).toEqual([actions.reopenTutorial, 'Library and imports']);
  const review = element<ReviewProps>('/review', r,
    { category: '', readOnly: false, readOnlyMessage: '', writerUrl: '' }, actions, vi.fn());
  review.openEntity('performer', 'Someone');
  review.toast('Decided');
  expect(review.revealSource).toBe(actions.revealSource);
  element<FollowManageProps>('/subscriptions', r, {
    tab: 'list', page: 1, sort: '', dir: '', pageSize: 20, layout: 'default', readOnly: false, readOnlyMessage: '', writerUrl: '',
  }, actions, vi.fn()).toast('Added 1 follow source');
  const taste = element<TasteProps>('/taste', r, { onboarding: false }, actions, vi.fn());
  taste.onSignal('tag', 'Nympho');
  taste.toast('Imported');
  expect(vi.mocked(actions.openItem).mock.calls).toEqual([[3]]);
  expect(vi.mocked(actions.openEntity).mock.calls).toEqual([['performer', 'Someone']]);
  expect(vi.mocked(actions.openTasteSignal).mock.calls).toEqual([['tag', 'Nympho']]);
  expect(vi.mocked(actions.failure).mock.calls).toEqual([['Delete', 'boom']]);
  expect(actions.toast).not.toHaveBeenCalled();
  expect(vi.mocked(actions.receipt).mock.calls).toEqual([
    ['Offline download submitted'], ['Deleted', { undo }], ['Kept', {}], ['Configuration saved'], ['Decided'], ['Added 1 follow source'], ['Imported'],
  ]);
});

it('The scrape page\'s notes use the site-wide toast as-is', async () => {
  const r = await load();
  const actions = shellActions();
  element<ScrapingProps>('/sources', r, {}, actions, vi.fn()).toast('Saved');
  expect(vi.mocked(actions.toast).mock.calls).toEqual([['Saved']]);
  expect(actions.receipt).not.toHaveBeenCalled();
});

/** The container shared by the index page and the profile page, holding the skeleton the shell laid down. */
function indexSurface() {
  const index = document.createElement('section');
  index.id = 'index';
  index.innerHTML = '<div class="geist-skeleton" data-skeleton="index">Loading</div>';
  document.body.append(index);
  return { index, skeleton: index.firstElementChild! };
}

const TAGS = { items: [{ k: 'Nympho', n: 1, cat: 'role' }], has_more: false };
const tagsOpen = (selectMode = false) => ({
  kind: 'tags', q: '', scope: 'local', view: 'alphabet', category: 'all', layout: 'big', selectMode, configurable: false,
});

/** The index page's fetches: `/api/index` resolves manually on demand, everything else returns an empty table on the spot. */
function indexFetch(body: unknown = TAGS, { deferred = true } = {}) {
  const pending: Array<() => void> = [];
  const fetched = vi.fn((input: string, init?: RequestInit) => {
    if (!input.startsWith('/api/index')) return Promise.resolve(reply({ items: [], has_more: false }));
    if (!deferred) return Promise.resolve(reply(body));
    return new Promise<Reply>((resolve, reject) => {
      pending.push(() => resolve(reply(body)));
      init?.signal?.addEventListener('abort', () => { reject(new DOMException('Aborted', 'AbortError')) });
    });
  });
  return {
    fetched,
    indexCalls: () => fetched.mock.calls.filter(([input]) => input.startsWith('/api/index')).length,
    resolve: () => { for (const settle of pending.splice(0)) settle() },
    install: () => vi.stubGlobal('fetch', fetched),
  };
}

it('Cold-start deep link to the index page: the shell\'s skeleton holds until the first screen completes, and the full page swap lands in the same batch', async () => {
  const r = await load('/tags');
  const { index, skeleton } = indexSurface();
  await mount(r);
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  const fetch = indexFetch();
  fetch.install();
  let opened: Promise<boolean> | undefined;
  await act(async () => { opened = r.openManagedRoute('/tags', tagsOpen(), { container: index, isCurrent: () => true }) });
  await until(() => fetch.indexCalls() > 0, 'First-screen fetch sent out');
  expect(index.firstElementChild, 'Skeleton kept as-is until data lines up').toBe(skeleton);
  const batches = watch(index, skeleton, 'Nympho');
  fetch.resolve();
  await act(async () => { expect(await opened).toBe(true) });
  expect(fetch.indexCalls()).toBe(1);
  expect(batches[0], 'Within the batch removing the skeleton the full page is already painted').toEqual({ skeleton: false, painted: true });
  expect(index.querySelector(':scope > .peach-react [data-index-search]')).not.toBeNull();
});

/* When the shell's select key closes, it pushes the new value via `updateManagedRoute` into the painted page: only this item merges, other props stay,
   generation unchanged, no remount and no refetch; remounting would swap the page header along with the half-typed filter box text. */
it('In-place update: merged into the painted page without remounting, refetching, or changing the epoch', async () => {
  const r = await load('/tags');
  const { index } = indexSurface();
  const actions = await mount(r);
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  const fetch = indexFetch(TAGS, { deferred: false });
  fetch.install();
  await act(async () => { await r.openManagedRoute('/tags', tagsOpen(true), { container: index, isCurrent: () => true }) });
  const revision = r.managedEntry(index)?.revision;
  const calls = fetch.fetched.mock.calls.length;
  const input = index.querySelector('[data-index-search] input');
  const tag = () => index.querySelector<HTMLElement>('[data-alpha-tag][data-k="Nympho"]')!;
  await act(async () => { tag().click() });
  expect(tag().getAttribute('aria-pressed')).toBe('true');
  await act(async () => { r.updateManagedRoute(index, { selectMode: false }) });
  expect(tag().getAttribute('aria-pressed'), 'Turning off the selection toggle clears the selection').toBe('false');
  expect(index.querySelector('[data-index-search] input'), 'Pushing a new value must not remount').toBe(input);
  expect(r.managedEntry(index)?.revision).toBe(revision);
  expect(r.managedEntry(index)?.props).toMatchObject({ kind: 'tags', selectMode: false, layout: 'big' });
  expect(fetch.fetched.mock.calls.length, 'Pushing a new value must not refetch').toBe(calls);
  await act(async () => { tag().click() });
  expect(vi.mocked(actions.showIndexTags), 'Everything else stays: outside select mode clicking one goes straight back to the catalog')
    .toHaveBeenCalledWith(['Nympho'], 'all');
});

it('In-place update is a no-op when the page is not painted in the container: the copy submitted while the first screen is still loading stays as-is', async () => {
  const r = await load('/tags');
  const { index } = indexSurface();
  await mount(r);
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  const fetch = indexFetch();
  fetch.install();
  r.updateManagedRoute(index, { selectMode: true });
  expect(r.managedEntry(index)).toBeNull();
  const opening = r.openManagedRoute('/tags', tagsOpen(), { container: index, isCurrent: () => true });
  await until(() => fetch.indexCalls() > 0, 'First-screen fetch sent out');
  r.updateManagedRoute(index, { selectMode: true });
  fetch.resolve();
  await act(async () => { expect(await opening).toBe(true) });
  expect(r.managedEntry(index)?.props).toMatchObject({ selectMode: false });
});

/* When a profile page renders into `#index`, the managed-area page is merely hidden by the shell: the two containers keep their own state, hiding one leaves the other;
   naming both containers in one call hides them together. */
it('`#stats` and `#index` each render their own page and never collapse each other; naming both containers collapses them together', async () => {
  const r = await load('/tasks');
  const { stats } = surface();
  const { index } = indexSurface();
  await mount(r);
  r.connectManagedRoutes(Promise.resolve(r.prefetchManagedRoute));
  const tasksReply = tasksFetch(tasks(), { deferred: false });
  const tagsReply = indexFetch(TAGS, { deferred: false });
  vi.stubGlobal('fetch', vi.fn((input: string, init?: RequestInit) => (
    input.startsWith('/api/index') ? tagsReply.fetched(input, init) : tasksReply.fetched(input, init))));
  await act(async () => { await open(r, stats) });
  const page = painted(stats);
  await act(async () => { await r.openManagedRoute('/tags', tagsOpen(), { container: index, isCurrent: () => true }) });
  expect(painted(stats), 'Opening a page in `#index` does not close the `#stats` page').toBe(page);
  expect(r.managedEntries().map((entry) => entry.path)).toEqual(['/tasks', '/tags']);
  act(() => { r.releaseManagedRoute(index) });
  expect(index.querySelector('.peach-react')).toBeNull();
  expect(painted(stats), 'Collapsing `#index` leaves `#stats` untouched').toBe(page);
  await act(async () => { await r.openManagedRoute('/tags', tagsOpen(), { container: index, isCurrent: () => true }) });
  act(() => { r.releaseManagedRoute(stats, index) });
  expect([stats.children.length, index.children.length, r.managedEntries().length]).toEqual([0, 0, 0]);
});

it('Index page: in-page URL writing, layout persistence, avatars, and destinations all hook into the same shell set', async () => {
  const r = await load();
  const actions = shellActions();
  const props = (r.INDEX_ROUTES['/performers'].page(
    { ...tagsOpen(), kind: 'performers' } as never, actions, vi.fn()) as ReactElement<Record<string, unknown>>).props;
  expect([props.route, props.savePreference, props.exitSelectMode, props.personAvatar, props.authorAvatar,
    props.openEntity, props.showTags, props.openFollowAuthor, props.openFollowTag]).toEqual([
    actions.routeIndex, actions.savePeopleLayout, actions.exitSelectMode, actions.personAvatar, actions.authorAvatar,
    actions.openEntity, actions.showIndexTags, actions.openFollowAuthor, actions.openFollowTag]);
  expect([props.kind, props.layout, props.selectMode, props.configurable]).toEqual(['performers', 'big', false, false]);
  expect((props.tagLabel as (tag: string) => string)('JK uniform')).toBe('JK uniform');
});

it('Index page paths bypass React Router navigate: same-page search changes and cross-page entries both hand the address to the shell', async () => {
  const r = await load('/');
  const actions = shellActions();
  const navigate = vi.fn();
  for (const path of ['/performers', '/tags?view=cloud', '/studios']) r.managedGo(path, actions, navigate);
  expect(navigate).not.toHaveBeenCalled();
  expect(vi.mocked(actions.navigate).mock.calls).toEqual([['/performers'], ['/tags?view=cloud'], ['/studios']]);
  expect(r.ROUTED_PATHS).toEqual(expect.arrayContaining(['/performers', '/creators', '/studios', '/agencies', '/tags']));
});
