/* Activity page behavior: how the three sections split, the polling interval, and what a failure leaves behind.
 *
 * Appearance (the status badges' three tiers of color, failed cards' borders) is a design decision asserted by `frontend/e2e/design-*.test.ts`
 * reading `getComputedStyle`; here we only check structure, text, and requests. */
import { act } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { ActivityPage } from '../../src/react/activity/activity-page';
import { BACKGROUND_ISSUES_URL, type BackgroundIssue } from '../../src/react/activity/background-issues';
import { DOWNLOADS_URL } from '../../src/react/activity/downloads-panel';
import { ErrorExcerpt } from '../../src/react/activity/error-excerpt';
import {
  elapsedText, errorHeadline, followupDetail, hasResultProblems, isRoutine, prefetchTasks, progressText, summaryItems, summaryText, TASKS_URL,
} from '../../src/react/activity/tasks';
import type { ActivityData, TaskResourcesPayload, TaskRunPayload } from '../../src/react/activity/tasks';
import type { DownloadsSnapshot } from '../../src/react/bundle';
import { queryClient } from '../../src/react/query';

import { buttonNamed, choose, click, mount, mountRoot, pending, settle } from './render';

vi.mock('@peach/legacy/ui', async (original) => ({
  ...await original<typeof import('@peach/legacy/ui')>(),
  confirmModal: (await import('../../src/ui-kit/modal')).confirmModal,
}));

// The client is a module-level singleton (all React roots share one); without clearing between test cases they feed each other data.
afterEach(() => queryClient.clear());

/* Query dispatches updates through the real `setTimeout(0)` it captured itself, which the fake clock cannot advance: after advancing the clock
   the assertions still see the previous frame's DOM. The case dispatches immediately instead. */
notifyManager.setScheduler((notify) => notify());

const run = (overrides: Partial<TaskRunPayload> = {}): TaskRunPayload => ({
  id: 1,
  task_key: 'follow-check',
  task_label: 'Update check',
  trigger: 'manual',
  status: 'running',
  host: 'desk',
  started_at: '2026-09-11T10:00:00Z',
  finished_at: null,
  elapsed_seconds: 75,
  progress_current: 3,
  progress_total: 12,
  progress_label: 'Checking the third source',
  result_summary: {},
  error: '',
  parent_run_id: null,
  root_run_id: null,
  followup_key: '',
  followup_depth: 0,
  ...overrides,
});

/** One successor (ADR-0040): a finished run, hung under the `parent` round. */
const followup = (parent: number, overrides: Partial<TaskRunPayload> = {}): TaskRunPayload =>
  run({
    id: 90, task_key: 'entity-avatar', task_label: 'Fill in detail images', status: 'succeeded',
    progress_total: null, progress_current: null, progress_label: 'Fill in detail images: 涼森れむ',
    finished_at: '2026-09-11T10:04:00Z', parent_run_id: parent, root_run_id: parent,
    followup_key: 'entity-avatar:performer:12', followup_depth: 1,
    result_summary: { outcome: '已装上' }, ...overrides,
  });

const payload = (overrides: Partial<ActivityData> = {}): ActivityData => ({
  available: true, running: [], skipped: [], finished: [], ...overrides,
});
const resources = (overrides: Partial<TaskResourcesPayload> = {}): TaskResourcesPayload => ({
  cpu: { state: 'ready', percent: 12.5, high: false },
  gpu: { state: 'ready', percent: 0, high: false },
  network: { state: 'ready', bytes_per_second: 2 * 1024 * 1024, high: false },
  sampled_at: '2026-10-31T08:00:00Z', ...overrides,
});

/* The cloud download section fetches `/api/downloads` itself, and "needs attention" fetches `/api/background-issues` itself. The tests here only count
   task center requests; those two paths answer separately: cloud download returns an empty table and background issues return `issues`' current copy (none by default), so neither section paints. */
const DOWNLOADS_IDLE: DownloadsSnapshot = { available: true, providers: [], tasks: [] };
let issues: BackgroundIssue[] = [];
const issuePosts: string[] = [];
afterEach(() => { issues = []; issuePosts.length = 0 });
function stubFetch(tasks: (input: string, init?: RequestInit) => Promise<unknown>) {
  vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
    if (input.startsWith(DOWNLOADS_URL)) return Promise.resolve({ ok: true, status: 200, json: async () => DOWNLOADS_IDLE });
    if (input.startsWith(BACKGROUND_ISSUES_URL)) return Promise.resolve({ ok: true, status: 200, json: async () => ({ issues }) });
    if (input.endsWith('/schedule/run')) {
      issuePosts.push(input);
      issues = issues.filter((issue) => issue.retry !== input);
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ running: true }) });
    }
    if (/^\/api\/tasks\/\d+$/.test(input)) {
      return tasks(input, init).then(async (value) => {
        const response = value as { ok: boolean; status: number; json(): Promise<ActivityData> };
        const body = await response.json();
        const parent = Number(input.split('/').at(-1));
        return { ...response, json: async () => ({
          followups: [...(body.running || []), ...(body.finished || [])].filter((row) => row.parent_run_id === parent),
        }) };
      });
    }
    return tasks(input, init);
  });
}

/** Returns these responses in order, repeating the last one forever after. The `null` entry returns 500. */
function serve(...responses: (ActivityData | null)[]) {
  let at = 0;
  const fetcher = vi.fn(async (_input: string, _init?: RequestInit) => {
    const body = responses[Math.min(at, responses.length - 1)] ?? null;
    at += 1;
    return body
      ? { ok: true, status: 200, json: async () => body }
      : { ok: false, status: 500, json: async () => ({ message: 'Database is currently browse-only' }) };
  });
  stubFetch(fetcher);
  return fetcher;
}

const page = () => <QueryClientProvider client={queryClient}><ActivityPage /></QueryClientProvider>;
const controlButton = (name: string, root: ParentNode = document) =>
  root.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
const confirmTaskCancellation = () => click(document.querySelector('[data-modal-confirm]'));

it('When all scan phases finished with issues remaining, a partial results status is shown', async () => {
  serve(payload({ finished: [run({ task_key: 'library-processing', task_label: 'Scan and scrape',
    status: 'failed', finished_at: '2026-09-11T10:04:00Z',
    result_summary: { outcome: 'partial', issue_count: 2 }, error: '2 items need attention' })] }));
  const host = await mount(page());
  expect(host.textContent).toContain('Some items need handling');
  expect(host.textContent).toContain('2 items need attention');
  expect(host.querySelector('[data-task-key="library-processing"] > div > ul')?.textContent).not.toContain('partial');
});

it('Update check issue details bind to the task snapshot and provide an entry to the source', async () => {
  serve(payload({ finished: [run({ status: 'succeeded', result_summary: { source_failed: 1,
    issues: [{ source: 7, label: 'Example author', provider: 'Example site', kind: 'Check failed', error: 'HTTP 403' }] } })] }));
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  expect(host.querySelector('[data-task-issues]')?.textContent).toContain('Example author · Example site · Check failed');
  expect(host.querySelector('[data-task-issues]')?.textContent).toContain('HTTP 403');
  expect(host.querySelector('[data-task-issues]')?.closest('details')?.open).toBe(false);
  expect(host.querySelector('a[href="/subscriptions"]')?.textContent).toContain('View followed sources');
});

it('Scan and scrape retries unfinished items on the card only for the latest failed round', async () => {
  const scan = (overrides: Partial<TaskRunPayload>) => run({ task_key: 'library-processing', task_label: 'Scan and scrape',
    status: 'failed', progress_total: null, error: '768 items need handling, 533 of them are source rate limits that should run again later; the rest can retry the unfinished parts.',
    ...overrides });
  // The failure set on the card belongs only to the latest round: clicking an earlier failure dot matches nothing.
  serve(payload({ finished: [
    scan({ id: 5, finished_at: '2026-09-11T10:05:00Z' }),
    scan({ id: 4, status: 'succeeded', error: '', finished_at: '2026-09-11T09:05:00Z' }),
    scan({ id: 3, finished_at: '2026-09-11T08:05:00Z' }),
    // The amane bridge's action entry is the 'Needs attention' line at the top of the page, not on the card.
    run({ id: 2, task_key: 'amane-bridge', task_label: 'amane bridge rebuild', status: 'failed',
          progress_total: null, finished_at: '2026-09-11T07:05:00Z', error: 'Rebuild unfinished' }),
  ] }));
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  const links = [...host.querySelectorAll('[data-task-key=library-processing] a, [data-task-key=amane-bridge] a')];
  expect(links.map((link) => [link.closest('[data-run-id]')?.getAttribute('data-run-id'),
    link.getAttribute('href'), link.textContent])).toEqual([['5', '/data-cleanup#libraryProcessing', 'View unfinished items']]);
});

/** Runs the real first-screen path: prefetch lands in the cache first, then mount. */
async function open(...responses: (ActivityData | null)[]) {
  const fetcher = serve(...responses);
  await prefetchTasks(new AbortController().signal).catch(() => {});
  return { fetcher, host: await mount(page()) };
}

const sections = (host: HTMLElement) => [...host.querySelectorAll('section')]
  .map((section) => section.querySelector('h3')?.textContent);

/** The poll is a timer inside the component, so advancing the clock triggers a rerender; it must be advanced inside act. */
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) });

it('The first screen renders from the prefetched cache entry and does not request again on mount', async () => {
  const { fetcher, host } = await open(payload({ running: [run()] }));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0]?.[0]).toBe(TASKS_URL);
  expect(host.querySelector('[data-task-key=follow-check]')).not.toBeNull();
});

const issue = (overrides: Partial<BackgroundIssue> = {}): BackgroundIssue => ({
  key: 'tunnel', title: 'Connecting to the public entry failed', href: '/settings/network#tunnel', link_label: 'Open public entry settings',
  since: null, noticed_at: '2026-10-22T07:00:00Z', retry: null, retry_available: false, ...overrides,
});

it('Background issues come first, each stating what it is, since when, and a link to where it is handled, with an immediate retry for those fixable in place', async () => {
  issues = [
    issue(),
    issue({ key: 'follow-schedule', title: 'The follow auto-check failed', href: '/settings/subscriptions#followScheduleSetting',
      link_label: 'Open follow scheduling', since: '2026-10-22T06:00:00Z', retry: '/api/follow/schedule/run', retry_available: true }),
  ];
  const { host } = await open(payload({ running: [run()] }));
  await vi.waitFor(() => { if (!host.querySelector('[role="alert"]')) throw new Error('Needs-processing section not rendered yet') });
  expect(sections(host)).toEqual(['Needs attention', 'Running']);
  const [tunnel, follow] = [...host.querySelectorAll('[role="alert"]')];
  expect(tunnel?.textContent).toContain('Connecting to the public entry failed');
  expect(tunnel?.textContent).toContain('Connecting to the public entry failedNoticed at 22/10 14:00Open public entry settings');
  expect(tunnel?.querySelector('a')?.getAttribute('href')).toBe('/settings/network#tunnel');
  expect(tunnel?.querySelector('a')?.textContent).toContain('Open public entry settings');
  expect(buttonNamed('Retry now', tunnel!)).toBeNull();
  expect(follow?.textContent).toContain('Since ');
  expect(follow?.textContent).toContain('');
  // Task cards carry anchors, so links like "View failure records" can scroll to that card.
  expect(host.querySelector('#run-1')?.getAttribute('data-run-id')).toBe('1');
  // Link on the left, retry on the right.
  const [first, second] = [...follow!.querySelectorAll('[data-note-action] a, [data-note-action] button')];
  expect([first?.textContent, second?.textContent]).toEqual([expect.stringContaining('Open follow scheduling'), 'Retry now']);

  await click(buttonNamed('Retry now', follow!));
  await vi.waitFor(() => { if (host.querySelectorAll('[role="alert"]').length !== 1) throw new Error('After retry the item is still there') });
  expect(issuePosts).toEqual(['/api/follow/schedule/run']);
});

it('Without background issues no "Needs attention" paints', async () => {
  const { host } = await open(payload());
  await settle();
  expect(host.textContent).not.toContain('Needs attention');
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it('The running pass shows a progress bar with real counts and elapsed time', async () => {
  const { host } = await open(payload({ running: [run()] }));
  const bar = host.querySelector('[role=progressbar]')!;
  expect(bar.getAttribute('aria-valuenow')).toBe('3');
  expect(bar.getAttribute('aria-valuemax')).toBe('12');
  expect(host.textContent).toContain('3 / 12 items');
  expect(host.textContent).toContain('RunningUpdate checkIn progressManual · Ran for 1 min 15 secChecking the third source · 3 / 12 items1–1 / 1 records20 items per page 10 items per page20 items per page50 items per page100 items per page');
  expect(host.querySelector('strong')?.textContent).toBe('Update check');
});

it('With an unknown total no fake progress bar paints; it only says what is happening', async () => {
  const { host } = await open(payload({ running: [run({ progress_total: null, progress_current: null })] }));
  expect(host.querySelector('[role=progressbar]')).toBeNull();
  expect(host.querySelector('[role=status]')?.textContent).toContain('Checking the third source');
});

it('The active main task and follow-ups keep showing their own CPU, GPU, and measured network rate', async () => {
  const child = followup(1, { status: 'running', resources: resources({
    cpu: { state: 'ready', percent: 3, high: false },
    network: { state: 'ready', bytes_per_second: 1024, high: false },
  }) });
  const { host } = await open(payload({ running: [run({ resources: resources() }), child] }));
  const main = host.querySelector('[data-task-resources="1"]')!;
  const nested = host.querySelector('[data-task-resources="90"]')!;
  expect(main.querySelector('[data-task-resource="cpu"]')?.textContent).toBe('CPU 12.5%');
  expect(main.querySelector('[data-task-resource="gpu"]')?.textContent).toBe('GPU Not used');
  expect(main.querySelector('[data-task-resource="network"]')?.textContent).toBe('Network 2 MB/s');
  expect(nested.querySelector('[data-task-resource="cpu"]')?.textContent).toBe('CPU 3%');
  expect(nested.querySelector('[data-task-resource="network"]')?.textContent).toBe('Network 1 KB/s');
  expect([...main.querySelectorAll('[data-task-resource]')].every(node => !node.hasAttribute('title'))).toBe(true);
});

it('Resource sampling-in-progress and not-obtained display separately, the reason is explained first, and null is never coerced to zero', async () => {
  const { host } = await open(payload({ running: [run({ resources: resources({
    cpu: { state: 'sampling', percent: null, high: false, reason: 'Establishing the sampling baseline' },
    gpu: { state: 'unavailable', percent: null, high: false, reason: 'This system cannot attribute GPU engines' },
    network: { state: 'unavailable', bytes_per_second: null, high: false, reason: 'Mounted-drive transfers cannot be attributed precisely' },
  }) })] }));
  const metrics = host.querySelector('[data-task-resources="1"]')!;
  expect(metrics.querySelector('[data-task-resource="cpu"]')?.textContent).toBe('CPU Sampling');
  expect(metrics.querySelector('[data-task-resource="gpu"]')?.textContent).toBe('GPU Not fetched');
  expect(metrics.querySelector('[data-task-resource="network"]')?.textContent).toBe('Network Not fetched');
  expect(metrics.textContent).not.toContain('0%');
  expect(metrics.textContent).not.toContain('0 B/s');
  expect(metrics.querySelector('[data-task-resource="network"]')?.getAttribute('title')).toMatch(/^Mounted-drive transfers cannot be attributed precisely/);
});

it('When reading from a cloud-drive mount, the network shows “cloud drive read” and still reports no zero value', async () => {
  const { host } = await open(payload({ running: [run({ resources: resources({
    network: { state: 'unavailable', bytes_per_second: null, high: false, via: 'cloud',
      reason: 'A mounted cloud drive\'s cache and prefetch cannot measure actual speed per task' },
  }) })] }));
  const network = host.querySelector('[data-task-resources="1"] [data-task-resource="network"]')!;
  expect(network.textContent).toBe('Network Cloud drive read');
  expect(network.hasAttribute('data-resource-idle')).toBe(false);
  expect(network.getAttribute('title')).toMatch(/^A mounted cloud drive's cache and prefetch cannot measure actual speed per task/);
});

it('A true zero reading is shown as not used; high usage is emphasized by that metric\'s real high state', async () => {
  const { host } = await open(payload({ running: [run({ resources: resources({
    cpu: { state: 'ready', percent: 0, high: false },
    gpu: { state: 'ready', percent: 70.1, high: true },
    network: { state: 'ready', bytes_per_second: 0, high: false },
  }) })] }));
  const metrics = host.querySelector('[data-task-resources="1"]')!;
  expect(metrics.querySelector('[data-task-resource="cpu"]')?.textContent).toBe('CPU Not used');
  expect(metrics.querySelector('[data-task-resource="network"]')?.textContent).toBe('Network Not used');
  expect(metrics.querySelector('[data-task-resource="cpu"]')?.hasAttribute('data-resource-idle')).toBe(true);
  const gpu = metrics.querySelector('[data-task-resource="gpu"]')!;
  expect(gpu.textContent).toBe('GPU 70.1%');
  expect(gpu.getAttribute('title')).toContain('Currently under heavy use');
  expect(gpu.getAttribute('data-resource-high')).toBe('true');
  expect(metrics.querySelector('[data-task-resource="cpu"]')?.hasAttribute('data-resource-high')).toBe(false);
});

it('While a parent task has ended but follow-ups are still active, show the backend\'s aggregated reading; historical terminal states keep no stale samples', async () => {
  const parent = run({ id: 1, status: 'succeeded', resources: resources() });
  const historical = run({ id: 2, status: 'cancelled', resources: resources() });
  const { host } = await open(payload({ running: [followup(1, { status: 'pending' })],
    finished: [parent, historical], followup_counts: { '1': { pending: 100 } } }));
  expect(host.querySelector('[data-task-resources="1"]')).not.toBeNull();
  expect(host.querySelector('[data-task-resources="1"] [data-task-resource="cpu"]')?.textContent).toBe('CPU 12.5%');
  expect(host.querySelector('[data-task-resources="2"]')).toBeNull();
});

it('Never fabricates resource metrics when an old snapshot lacks resources', async () => {
  const { host } = await open(payload({ running: [run()] }));
  expect(host.querySelector('[data-task-resources]')).toBeNull();
});

it('Active tasks pause, resume, and cancel through the actions the server reports, then reread progress', async () => {
  const posts: [string, unknown][] = [];
  let current = run({ control: { state: 'running', actions: ['pause', 'cancel'] } });
  stubFetch(async (input, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      posts.push([input, body]);
      current = body.action === 'pause'
        ? { ...current, control: { state: 'paused', actions: ['resume', 'cancel'] } }
        : body.action === 'resume'
          ? { ...current, control: { state: 'running', actions: ['pause', 'cancel'] } }
          : { ...current, control: { state: 'cancelling', actions: [] } };
    }
    return { ok: true, status: 200, json: async () => payload({ running: [current] }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  await click(controlButton('Paused', host));
  await vi.waitFor(() => expect(controlButton('Continue', host)).not.toBeNull());
  expect(host.querySelector('[data-run-id="1"]')?.textContent).toContain('Paused');
  expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('3');
  await click(controlButton('Continue', host));
  await vi.waitFor(() => expect(controlButton('Paused', host)).not.toBeNull());
  await click(controlButton('Cancel', host));
  await confirmTaskCancellation();
  await vi.waitFor(() => expect(host.querySelector('[data-run-id="1"]')?.textContent).toContain('Cancelling'));
  expect(host.textContent).not.toContain('Canceled');
  expect(host.querySelector('[data-task-controls]')).toBeNull();
  expect(posts).toEqual([
    ['/api/tasks/1/control', { action: 'pause' }],
    ['/api/tasks/1/control', { action: 'resume' }],
    ['/api/tasks/1/control', { action: 'cancel' }],
  ]);
});

it('Both the main task and follow-ups use icon controls with accurate names, tooltips, and edit keys', async () => {
  const child = followup(1, { status: 'running', finished_at: null,
    control: { state: 'paused', actions: ['resume', 'cancel'] } });
  const { host } = await open(payload({ running: [run({ control: { state: 'running', actions: ['pause', 'cancel'] } }), child] }));
  for (const [identity, labels] of [[1, ['Paused', 'Cancel']], [90, ['Continue', 'Cancel']]] as const) {
    const controls = host.querySelector(`[data-task-controls="${identity}"]`)!;
    for (const label of labels) {
      const button = controlButton(label, controls)!;
      expect(button).not.toBeNull();
      expect(button.textContent).toBe('');
      expect(button.querySelector('svg')).not.toBeNull();
      expect(button.getAttribute('title')).toBe(label);
      expect(button.getAttribute('data-tooltip-copy-key')).toMatch(/^tasks\.control\.action\./);
      expect(button.hasAttribute('data-copy-key')).toBe(false);
    }
  }
});

it('Task cancellation reuses the confirm dialog, focus starts on cancel, and neither an unconfirmed nor a dismissed dialog submits', async () => {
  const posts: unknown[] = [];
  const current = run({ control: { state: 'running', actions: ['pause', 'cancel'] } });
  stubFetch(async (_input, init) => {
    if (init?.method === 'POST') posts.push(JSON.parse(String(init.body)));
    return { ok: true, status: 200, json: async () => payload({ running: [current] }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  await click(controlButton('Cancel', host));
  const dialog = document.querySelector<HTMLDialogElement>('dialog')!;
  expect(dialog.open).toBe(true);
  expect(dialog.querySelector('h3')?.textContent).toBe('Cancel task "Update check"');
  expect(dialog.textContent).toContain('Saved details and results are kept');
  expect(dialog.textContent).toContain('Once this round is cancelled it cannot continue; start it again when needed.');
  expect(document.activeElement).toBe(dialog.querySelector('[data-modal-cancel]'));
  expect(posts).toEqual([]);
  await click(dialog.querySelector('[data-modal-cancel]'));
  expect(document.querySelector('dialog')).toBeNull();
  expect(posts).toEqual([]);
  await click(controlButton('Cancel', host));
  await confirmTaskCancellation();
  await vi.waitFor(() => expect(posts).toEqual([{ action: 'cancel' }]));
  await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
});

it('The confirm-cancel request\'s busy state blocks double submits, and a failure stays inside the dialog for retry', async () => {
  const answer = pending<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
  let attempts = 0;
  const current = run({ control: { state: 'running', actions: ['pause', 'cancel'] } });
  stubFetch(async (_input, init) => {
    if (init?.method === 'POST') {
      attempts += 1;
      return attempts === 1 ? answer.answer : { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    return { ok: true, status: 200, json: async () => payload({ running: [current] }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  await click(controlButton('Cancel', host));
  const dialog = document.querySelector<HTMLDialogElement>('dialog')!;
  const confirm = dialog.querySelector<HTMLButtonElement>('[data-modal-confirm]')!;
  await click(confirm);
  expect(confirm.getAttribute('aria-busy')).toBe('true');
  expect(confirm.hasAttribute('disabled')).toBe(false);
  await click(confirm);
  await click(dialog.querySelector('[data-modal-cancel]'));
  expect(attempts).toBe(1);
  expect(dialog.open).toBe(true);
  await answer.release({ ok: false, status: 409, json: async () => ({ message: 'The task cannot be stopped right now' }) });
  await vi.waitFor(() => expect(dialog.querySelector('[data-modal-error]')?.textContent).toContain('The task cannot be stopped right now'));
  expect(dialog.open).toBe(true);
  await click(confirm);
  await vi.waitFor(() => expect(attempts).toBe(2));
  await vi.waitFor(() => expect(document.querySelector('dialog')).toBeNull());
});

it('The ended parent\'s cancel confirmation explicitly covers every running and queued follow-up', async () => {
  const parent = run({ status: 'succeeded', control: { state: 'paused', actions: ['resume', 'cancel'] } });
  const child = followup(1, { status: 'pending', finished_at: null });
  const { fetcher, host } = await open(payload({ running: [child], finished: [parent],
    followup_counts: { '1': { pending: 1200 } } }));
  await click(controlButton('Cancel follow-up tasks', host));
  const dialog = document.querySelector<HTMLDialogElement>('dialog')!;
  expect(dialog.querySelector('h3')?.textContent).toBe('Cancel every follow-up of "Update check"');
  expect(dialog.textContent).toContain('including running and queued items');
  expect(dialog.querySelector('[data-modal-confirm]')?.textContent).toBe('Cancel follow-up tasks');
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  await click(dialog.querySelector('[data-modal-cancel]'));
});

it.each(['pause', 'resume'] as const)('Cancellation wins over an in-flight %s request; a late receipt never overwrites the real cancel outcome', async (action) => {
  const changeResponse = pending<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
  const cancelResponse = pending<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
  const posts: string[] = [];
  let current = run({ control: { state: action === 'pause' ? 'running' : 'paused', actions: [action, 'cancel'] } });
  stubFetch(async (_input, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      posts.push(body.action);
      return body.action === 'cancel' ? cancelResponse.answer : changeResponse.answer;
    }
    return { ok: true, status: 200, json: async () => payload(current.status === 'cancelled'
      ? { finished: [current] } : { running: [current] }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  await click(controlButton(action === 'pause' ? 'Paused' : 'Continue', host));
  expect(controlButton('Cancel', host)?.getAttribute('aria-disabled')).toBeNull();
  await click(controlButton('Cancel', host));
  expect(posts).toEqual([action]);
  await confirmTaskCancellation();
  expect(posts).toEqual([action, 'cancel']);
  current = { ...current, control: { state: 'cancelling', actions: [] } };
  await cancelResponse.release({ ok: true, status: 200, json: async () => ({ ok: true }) });
  await vi.waitFor(() => expect(host.querySelector('#run-1')?.textContent).toContain('Cancelling'));
  expect(host.querySelector('#run-1')?.getAttribute('data-status')).toBe('running');
  current = { ...current, status: 'cancelled', control: undefined, finished_at: '2026-10-31T07:00:00Z' };
  await changeResponse.release({ ok: false, status: 409,
    json: async () => ({ message: 'The task is being cancelled and can no longer pause or resume' }) });
  await vi.waitFor(() => expect(host.querySelector('#run-1')?.getAttribute('data-status')).toBe('cancelled'));
  expect(host.querySelector('#run-1')?.textContent).toContain('Canceled');
  expect(host.querySelector('[data-task-control-feedback]')).toBeNull();
  expect(sections(host)).toContain('Recently completed');
});

it('When a cancel request is not accepted, the reason survives the task finishing naturally and the original card unmounting', async () => {
  const response = pending<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
  let current = run({ control: { state: 'running', actions: ['pause', 'cancel'] } });
  stubFetch(async (_input, init) => {
    if (init?.method === 'POST') return response.answer;
    return { ok: true, status: 200, json: async () => payload(current.status === 'succeeded'
      ? { finished: [current] } : { running: [current] }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  await click(controlButton('Cancel', host));
  await confirmTaskCancellation();
  current = { ...current, status: 'succeeded', control: undefined, finished_at: '2026-10-31T07:00:00Z' };
  await act(async () => { await queryClient.invalidateQueries({ queryKey: ['tasks'] }) });
  expect(host.querySelector('[data-task-controls]')).toBeNull();
  await response.release({ ok: false, status: 409, json: async () => ({ message: 'This round has already ended' }) });
  await vi.waitFor(() => expect(host.querySelector('[data-task-control-feedback]')?.textContent).toContain('Update check: Cancel not finishedThis round has already ended'));
  expect(host.querySelector('[data-task-control-feedback]')?.textContent).toContain('Update check: Cancel not finishedThis round has already ended');
  expect(host.querySelector('#run-1')?.textContent).toContain('Completed');
  expect(host.querySelector('#run-1')?.textContent).not.toContain('Canceled');
});

it('After a parent\'s follow-ups are cancelled, the card shows the cancelled state and counts directly', async () => {
  const parent = run({ status: 'succeeded', finished_at: '2026-10-31T07:00:00Z' });
  const child = followup(parent.id, { status: 'cancelled' });
  const { host } = await open(payload({ finished: [parent, child], followup_counts: { '1': { cancelled: 120 } } }));
  const card = host.querySelector('#run-1')!;
  expect(card.textContent).toContain('Follow-up tasks cancelled');
  expect(card.textContent).toContain('Follow-up tasks cancelled 120 items');
  expect(card.querySelector('details')?.open).toBe(false);
  expect(card.querySelector('[data-task-controls]')).toBeNull();
  expect(card.getAttribute('data-status')).toBe('succeeded');
});

it.each([
  ['pausing', 'Pausing', ['resume', 'cancel']],
  ['paused', 'Paused', ['resume', 'cancel']],
  ['cancelling', 'Cancelling', []],
] as const)('A task with unknown total shows its real state while %s and plays no progress animation', async (state, label, actions) => {
  const { host } = await open(payload({ running: [run({ progress_total: null, progress_current: null,
    control: { state, actions: [...actions] } })] }));
  expect(host.querySelector('[data-run-id="1"]')?.textContent).toContain(label);
  expect(host.querySelector('[role="status"]')).toBeNull();
  expect(controlButton('Paused', host)).toBeNull();
  expect(Boolean(controlButton('Continue', host))).toBe(state !== 'cancelling');
});

it('While a task-control request waits, the button keeps focus and double submits are blocked', async () => {
  const response = pending<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
  const posts: string[] = [];
  const current = run({ control: { state: 'running', actions: ['pause', 'cancel'] } });
  stubFetch(async (input, init) => {
    if (init?.method === 'POST') {
      posts.push(input);
      return response.answer;
    }
    return { ok: true, status: 200, json: async () => payload({ running: [current] }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  const pause = controlButton('Paused', host)!;
  pause.focus();
  await click(pause);
  expect(pause.hasAttribute('disabled')).toBe(false);
  expect(pause.getAttribute('aria-busy')).toBe('true');
  expect(document.activeElement).toBe(pause);
  await click(pause);
  expect(posts).toEqual(['/api/tasks/1/control']);
  await response.release({ ok: true, status: 200, json: async () => ({ ok: true }) });
});

it('A failed task control keeps the original state and reason, retryable in place', async () => {
  let attempts = 0;
  const current = run({ control: { state: 'running', actions: ['pause', 'cancel'] } });
  stubFetch(async (_input, init) => {
    if (init?.method === 'POST') {
      attempts += 1;
      return { ok: false, status: 409, json: async () => ({ message: 'The task changed; refresh and retry' }) };
    }
    return { ok: true, status: 200, json: async () => payload({ running: [current] }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  await click(controlButton('Paused', host));
  await vi.waitFor(() => expect(host.querySelector('[data-task-control-feedback] [role="alert"]')?.textContent).toContain('Update check: Paused not finishedThe task changed; refresh and retry'));
  expect(controlButton('Continue', host)).toBeNull();
  await click(controlButton('Paused', host));
  expect(attempts).toBe(2);
});

it('Follow-up tasks are controlled by their own task id; parents whose server side lacks the capability get no control button', async () => {
  const child = followup(1, { id: 90, status: 'pending', finished_at: null,
    control: { state: 'paused', actions: ['resume', 'cancel'] } });
  const ended = run({ status: 'succeeded' });
  const posts: string[] = [];
  stubFetch(async (input, init) => {
    if (init?.method === 'POST') posts.push(input);
    return { ok: true, status: 200, json: async () => payload({ running: [child], finished: [ended] }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  expect(host.querySelector('[data-task-controls="1"]')).toBeNull();
  const controls = host.querySelector('[data-task-controls="90"]')!;
  expect(controls).not.toBeNull();
  await click(controlButton('Continue', controls));
  expect(posts).toEqual(['/api/tasks/90/control']);
});

it('The whole batch of follow-ups stays controllable after the parent ends, including follow-ups not shown — one operation covers them all', async () => {
  const posts: [string, unknown][] = [];
  let parent = run({ status: 'succeeded',
    control: { state: 'running', actions: ['pause', 'cancel'] } });
  const child = followup(1, { status: 'pending', finished_at: null });
  stubFetch(async (input, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      posts.push([input, body]);
      parent = { ...parent, control: body.action === 'pause'
        ? { state: 'paused', actions: ['resume', 'cancel'] }
        : body.action === 'resume' ? { state: 'running', actions: ['pause', 'cancel'] }
          : { state: 'cancelling', actions: [] } };
    }
    return { ok: true, status: 200, json: async () => payload({ running: [child], finished: [parent],
      followup_counts: { '1': { pending: 1000 } } }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  expect(host.querySelector('#run-1')?.textContent).toContain('Listing 1 item');
  await click(controlButton('Pause follow-up tasks', host));
  await vi.waitFor(() => expect(controlButton('Resume follow-up tasks', host)).not.toBeNull());
  expect(host.querySelector('#run-1')?.textContent).toContain('Paused');
  await click(controlButton('Resume follow-up tasks', host));
  await vi.waitFor(() => expect(controlButton('Pause follow-up tasks', host)).not.toBeNull());
  await click(controlButton('Cancel follow-up tasks', host));
  await confirmTaskCancellation();
  await vi.waitFor(() => expect(host.querySelector('#run-1')?.textContent).toContain('Cancelling'));
  expect(posts).toEqual([
    ['/api/tasks/1/control', { action: 'pause' }],
    ['/api/tasks/1/control', { action: 'resume' }],
    ['/api/tasks/1/control', { action: 'cancel' }],
  ]);
});

it('When same-kind parents have independent control scopes they display separately, and a button submits only its own parent task id', async () => {
  const first = run({ id: 1, status: 'succeeded',
    control: { state: 'paused', actions: ['resume', 'cancel'] } });
  const second = run({ id: 2, status: 'succeeded',
    control: { state: 'running', actions: ['pause', 'cancel'] } });
  const children = [followup(1, { id: 90, status: 'pending' }), followup(2, { id: 91, status: 'pending' })];
  const posts: string[] = [];
  stubFetch(async (input, init) => {
    if (init?.method === 'POST') posts.push(input);
    return { ok: true, status: 200, json: async () => payload({ running: children, finished: [second, first] }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  expect(host.querySelectorAll('[data-task-key="follow-check"]')).toHaveLength(2);
  await click(controlButton('Resume follow-up tasks', host.querySelector('#run-1')!));
  await click(controlButton('Pause follow-up tasks', host.querySelector('#run-2')!));
  expect(posts).toEqual(['/api/tasks/1/control', '/api/tasks/2/control']);
});

it('同类父任务控制状态相同时并成一张卡，一次操作提交给每一批', async () => {
  const batch = (id: number) => run({ id, task_key: 'upgrade-repairs', task_label: 'Auto repair', status: 'succeeded',
    control: { state: 'running', actions: ['pause', 'cancel'] } });
  const children = [followup(1, { id: 90, status: 'pending' }), followup(2, { id: 91, status: 'pending' })];
  const posts: string[] = [];
  stubFetch(async (input, init) => {
    if (init?.method === 'POST') posts.push(input);
    return { ok: true, status: 200, json: async () => payload({ running: children, finished: [batch(2), batch(1)] }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  const cards = host.querySelectorAll('[data-task-key="upgrade-repairs"]');
  expect(cards).toHaveLength(1);
  expect(cards[0]!.textContent).toContain('2 batches');
  await click(controlButton('Pause follow-up tasks', cards[0]!));
  await vi.waitFor(() => expect(posts).toEqual(['/api/tasks/2/control', '/api/tasks/1/control']));
});

it('Adds no control button by task kind when the server grants no capability', async () => {
  const { host } = await open(payload({ running: [run()] }));
  expect(host.querySelector('[data-task-controls]')).toBeNull();
});

it('Activity tasks reuse the three-tier control and submit the tier to the current task', async () => {
  const posts: unknown[] = [];
  let current = run({ control: { state: 'running', actions: ['pause', 'cancel', 'set_speed'], speed_mode: 'standard' } });
  stubFetch(async (_input, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      posts.push(body);
      current = { ...current, control: { ...current.control!, speed_mode: body.speed_mode } };
    }
    return { ok: true, status: 200, json: async () => payload({ running: [current] }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  await click(controlButton('Processing speed: Standard', host));
  const slider = document.querySelector('input[type="range"]')!;
  await act(async () => {
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    slider.dispatchEvent(new KeyboardEvent('keyup', { key: 'Home', bubbles: true }));
  });
  await vi.waitFor(() => expect(controlButton('Processing speed: Low usage', host)).not.toBeNull());
  expect(posts).toEqual([{ action: 'set_speed', speed_mode: 'low' }]);
});

it('A blocked round forms its own segment and never appears again inside recently completed', async () => {
  const blocked = run({
    id: 7, status: 'cancelled', trigger: 'scheduled', progress_total: null,
    finished_at: '2026-09-11T10:05:00Z', elapsed_seconds: null,
    result_summary: { blocked_by: 3 }, error: 'Conflicts with round 3 (manually triggered); skipping this one',
  });
  const { host } = await open(payload({ skipped: [blocked], finished: [blocked] }));
  expect(sections(host)).toEqual(['Running', 'Not executed this time']);
  expect(host.querySelectorAll('li')).toHaveLength(1);
  // The reason goes in the note area at the bottom of the card; the badge conveys the status.
  expect(host.querySelector('[data-status=cancelled]')?.textContent).toContain('Conflicts with round 3 (manually triggered); skipping this one');
  expect(host.querySelector('[data-status=cancelled] span')?.textContent).toBe('Canceled');
});

it('A finished round shows its summary and a failed round its reason', async () => {
  const { host } = await open(payload({ finished: [
    run({ id: 2, status: 'succeeded', finished_at: '2026-09-11T10:02:00Z',
          progress_total: null, result_summary: { checked: 7, results: [1, 2] } }),
    run({ id: 3, status: 'failed', task_label: 'Scan and scrape', finished_at: '2026-09-11T10:03:00Z',
          progress_total: null, error: 'RuntimeError: rejected upstream' }),
  ] }));
  expect(host.querySelector('[data-status=succeeded]')?.textContent).toContain('Checked 7');
  expect(host.querySelector('[data-status=failed]')?.textContent).toContain('Scan and scrapeFailedManual · 11/09 17:03 · Took 1 min 15 secThe operation did not finish; please retry. If it keeps failing, check the tray log.View followed sourcesError detailsRuntimeError: rejected upstream');
  expect(host.querySelector('[data-status=succeeded] span')?.textContent).toBe('Completed');
  // The successful run card has no detail section: no empty bar is left when there is no reason to write. With only one summary line, no bullet is added.
  expect([...host.querySelectorAll('[data-status=succeeded] p')].map((node) => node.textContent))
    .toEqual([expect.stringContaining('Manual'), 'Checked 7']);
  expect(host.querySelector('[data-status=succeeded] ul')).toBeNull();
});

it('Completed batches of dispatches merge into one card; the summary states how many items were processed and how many failed, with failure details listed first', async () => {
  const batch = (id: number, minute: number) => run({
    id, task_key: 'upgrade-repairs', task_label: 'Auto repair', trigger: 'scheduled', status: 'succeeded',
    progress_total: null, finished_at: `2026-10-28T08:${minute}:00Z`, result_summary: { outcome: '已安排 64 项处理' } });
  const child = (id: number, parent: number, status: string) => followup(parent, {
    id, task_key: 'upgrade-library', task_label: 'Auto-repair details', status,
    result_summary: { outcome: '影片升级补全完成', name: `ABC-${id}` }, followup_key: `upgrade-library:x:${id}` });
  const { host } = await open(payload({
    finished: [batch(3, 43), batch(2, 42), batch(1, 41), child(31, 3, 'succeeded'), child(21, 2, 'failed'), child(11, 1, 'succeeded')],
    followup_counts: { 1: { succeeded: 64 }, 2: { succeeded: 62, failed: 2 }, 3: { succeeded: 63, failed: 1 } },
  }));
  const cards = host.querySelectorAll('[data-task-key=upgrade-repairs]');
  expect(cards).toHaveLength(1);
  const card = cards[0]!;
  expect(card.textContent).toContain('Last 3 rounds');
  expect(card.querySelector('span')?.textContent).toBe('Issues found');
  expect([...card.querySelectorAll(':scope > div:first-child ul > li')].map((node) => node.textContent))
    .toEqual(['Processed 192 items in total', '3 of them failed']);
  expect(card.querySelector('summary')?.textContent).toBe('Task details · 192 items');
  expect(card.querySelector('[data-followup-key]')?.getAttribute('data-status')).toBe('failed');
});

it('Several batches that dispatched dozens of successors merge into one in-progress card; progress is by count, the running one comes first, and queued ones show no empty technical details', async () => {
  const parent = (id: number, finished_at: string) => run({
    id, task_key: 'upgrade-repairs', task_label: 'Auto repair', trigger: 'scheduled', status: 'succeeded',
    progress_total: null, started_at: finished_at, finished_at, result_summary: { outcome: '已安排 64 项处理' } });
  const child = (id: number, parentId: number, status: string) => followup(parentId, {
    id, task_key: 'upgrade-library', task_label: 'Auto-repair details', status, finished_at: null,
    progress_label: status === 'running' ? 'ABC-001 · scrape missing details' : 'ABC-00' + id, result_summary: {},
    followup_key: `upgrade-library:x:${id}` });
  const { host } = await open(payload({
    running: [child(12, 2, 'pending'), child(11, 1, 'running')],
    finished: [parent(2, '2026-10-28T09:03:00Z')],
    // Earlier batches are not on the "Recently completed" page; the API serves them separately.
    working_parents: [parent(1, '2026-10-28T09:02:00Z')],
    followup_counts: { 1: { succeeded: 60, failed: 2, running: 1, pending: 1 }, 2: { pending: 64 } },
  }));
  expect(sections(host)).toEqual(['Running']);
  const cards = host.querySelectorAll('[data-task-key=upgrade-repairs]');
  expect(cards).toHaveLength(1);
  const card = cards[0]!;
  expect(card.querySelector('span')?.textContent).toBe('Running');
  expect(card.textContent).toContain('2 batches');
  expect(card.textContent).toContain('Processed 62 / 128 items · 2 of them failed');
  expect(card.querySelector('summary')?.textContent).toBe('Task details · 128 items');
  expect(card.textContent).toContain('Listing 2 items');
  const rows = [...card.querySelectorAll('[data-followup-key]')];
  expect(rows.map((row) => row.getAttribute('data-status'))).toEqual(['running', 'pending']);
  expect(rows[0]!.textContent).toContain('ABC-001 · scrape missing details');
  expect(rows.some((row) => row.textContent?.includes('Technical details'))).toBe(false);
});

it('Link checking shows dead and failed-access counts, with technical details in a copyable code block', async () => {
  const summary = { checked: 1218, total: 1218, gone_count: 5, unclear_count: 54 };
  const writeText = vi.fn(async () => {});
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const { host } = await open(payload({ finished: [run({ task_key: 'link-check',
    task_label: 'Link check', status: 'succeeded', result_summary: summary })] }));
  const card = host.querySelector('[data-task-key=link-check]')!;
  expect(card.querySelector('span')?.textContent).toBe('Issues found');
  expect([...card.querySelectorAll('ul > li')].map(node => node.textContent))
    .toEqual(['Checked 1,218', 'Total 1,218', 'Link expired 5', 'Failed to access link 54']);
  await click(card.querySelector('summary')!);
  expect(card.querySelector('[data-code-block] code')?.textContent).toBe(JSON.stringify(summary, null, 2));
  await click(buttonNamed('Copy code', host)!);
  expect(writeText).toHaveBeenCalledWith(JSON.stringify(summary, null, 2));
});

it('Scheduled results with issues display separately, while ordinary successful rounds still collapse', async () => {
  const hourly = (id: number, result_summary = {}) => run({ id, task_key: 'link-check',
    status: 'succeeded', trigger: 'scheduled', result_summary });
  const { host } = await open(payload({ finished: [hourly(4), hourly(3),
    hourly(2, { unclear_count: 1 }), hourly(1, { unclear_count: 1 })] }));
  expect(shownIds(host)).toEqual([4, 2, 1]);
  expect(host.querySelector('[data-run-id="4"]')?.textContent).toContain('Last 2 rounds');
  expect(host.querySelector('[data-run-id="2"] span')?.textContent).toBe('Issues found');
});

it('Processing tasks read success, failure, and cleanup results', () => {
  expect(summaryItems({ repaired: 3, failed: 2, missing_tool: 1, moved: 8, restored: 4,
    purged: 9, cache_blocked_count: 2, bytes_reclaimed: 1024 }))
    .toEqual(['Fixed 3', 'Failed 2', 'Repair tool missing 1', 'Files organized 8', 'Restored 4',
      'Record deleted 9', 'Cache cleanup failed 2', 'Space freed 1 KB']);
  expect(summaryItems({ result: 'HD cover saved' })).toEqual(['HD cover saved']);
  expect(summaryItems({ incomplete: 1 })).toEqual(['Details or cover unfetched 1']);
  for (const result_summary of [{ incomplete: 1 }, { source_failed: 2 }, { failed: 3 },
    { missing: 1 }, { cache_blocked_count: 1 }, { warning_count: 1 }]) {
    const task = run({ status: 'succeeded', trigger: 'scheduled', result_summary });
    expect(hasResultProblems(task)).toBe(true);
    expect(isRoutine(task)).toBe(false);
  }
});

it('Successors nest under the round that dispatched them without taking another card', async () => {
  const parent = run({ id: 4, status: 'succeeded', task_label: 'Scan and scrape',
                       progress_total: null, finished_at: '2026-09-11T10:03:00Z',
                       result_summary: { followups: 1 } });
  const { host } = await open(payload({ finished: [parent, followup(parent.id)] }));
  expect(host.querySelectorAll('[data-task-key]')).toHaveLength(1);
  const row = host.querySelector('[data-followup-key]')!;
  expect(host.querySelector('[data-task-key=follow-check]')!.contains(row)).toBe(true);
  expect(row.textContent).toContain('Fill in detail images');
  expect(row.textContent).toContain('Completed');
  expect(row.textContent).toContain('涼森れむ · Detail image saved');
  expect(host.textContent).toContain('Scheduled 1 backfill task');
});

it('Completed task details start collapsed, and expanding and collapsing never lose successor results', async () => {
  const parent = run({ id: 4, status: 'succeeded', finished_at: '2026-09-11T10:03:00Z' });
  const { host } = await open(payload({ finished: [parent, followup(parent.id)] }));
  const details = host.querySelector('details')!;
  const trigger = details.querySelector('summary')!;
  expect(trigger.textContent).toBe('Task details · 1 item');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  await click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(details.open).toBe(true);
  expect(details.textContent).toContain('涼森れむ · Detail image saved');
  await click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
});

it('Running successor details start expanded, and failed successor details start collapsed', async () => {
  for (const status of ['running', 'failed']) {
    queryClient.clear();
    const parent = run({ id: 4, status: 'succeeded', finished_at: '2026-09-11T10:03:00Z' });
    const child = followup(parent.id, { status });
    const { host } = await open(payload({ finished: [parent, child] }));
    expect(host.querySelector('details')?.open).toBe(status === 'running');
    expect(host.querySelector('summary')?.getAttribute('aria-expanded')).toBe(String(status === 'running'));
  }
});

it('While a successor is still running, the round that dispatched it keeps its whole card in the running state and that line only says which item it is on', async () => {
  const parent = run({ id: 4, status: 'succeeded', task_label: 'Follow source fetching',
                       progress_total: null, finished_at: '2026-09-11T10:03:00Z',
                       result_summary: { followups: 1 } });
  const scraping = followup(parent.id, {
    task_key: 'feed-scrape', task_label: 'New work detail collection', status: 'running', finished_at: null,
    progress_label: 'New work detail collection: MIZD-441', progress_current: 13, progress_total: 22,
    followup_key: 'feed-scrape:MIZD-441', result_summary: {} });
  const { host } = await open(payload({ running: [scraping], finished: [parent] }));
  expect(sections(host)).toEqual(['Running']);
  const row = host.querySelector('[data-followup-key]')!;
  expect(row.textContent).toContain('New work detail collection');
  expect(row.textContent).toContain('In progress');
  expect(row.textContent).toContain('MIZD-441 · 13 / 22 items');
});

it('Consecutive scheduled runs where nothing happened merge into one card per kind; the eventful run is truncated and shown separately', async () => {
  const hourly = (id: number, overrides: Partial<TaskRunPayload> = {}) => done(id, {
    trigger: 'scheduled', result_summary: { checked: 83, total: 83 }, ...overrides });
  const feed = (id: number, overrides: Partial<TaskRunPayload> = {}) => hourly(id, {
    task_key: 'feed-check', task_label: 'Follow source fetching', result_summary: { checked: 2, added: 0 }, ...overrides });
  const { host } = await open(payload({ finished: [
    hourly(9), feed(8), hourly(7), feed(6), hourly(5),
    feed(4, { result_summary: { checked: 2, added: 3 } }),
    hourly(3), hourly(2),
  ] }));
  expect(shownIds(host)).toEqual([9, 8, 4, 3]);
  const first = host.querySelector('[data-run-id="9"]')!;
  expect(first.textContent).toContain('Scheduled · Last 3 rounds · ');
  expect([...first.querySelectorAll('ul > li')].map((node) => node.textContent)).toEqual(['Checked 83', 'Total 83']);
  expect(host.querySelector('[data-run-id="8"]')!.textContent).toContain('Last 2 rounds');
  expect(host.querySelector('[data-run-id="4"]')!.textContent).toContain('New 3');
  expect(host.querySelector('[data-run-id="3"]')!.textContent).toContain('Last 2 rounds');
});

it('When the parent task is off-screen its successors still lay out on their own', async () => {
  const { host } = await open(payload({ finished: [followup(4)] }));
  expect(host.querySelectorAll('[data-task-key=entity-avatar]')).toHaveLength(1);
  expect(host.querySelector('[data-followup-key]')).toBeNull();
});

it('With no records at all it gives an empty state, never a blank white page', async () => {
  const { host } = await open(payload());
  expect(host.querySelector('h3')?.textContent).toBe('No task records yet');
  // None of the three task center segments render; cloud download has no tasks, so nothing renders there either.
  expect(sections(host)).toEqual([]);
});

it('When the table does not exist in the database yet, say what to do instead of treating it as a failure', async () => {
  const { host } = await open(payload({
    available: false, message: 'The database is missing the job records table; check backups per the operations doc, then run peach migrate upgrade --yes' }));
  expect(host.querySelector('[role=note]')?.textContent).toContain('migrate upgrade --yes');
  expect(host.querySelector('[role=alert]')).toBeNull();
});

it('If the first-screen fetch fails, only one error remains; no empty three sections are drawn', async () => {
  const { host } = await open(null);
  // Copy goes through the legacy layer's `requestErrorMessage`: when the server supplies a reason message, use it; the page does not say it a second time.
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Database is currently browse-only');
  expect(host.querySelector('section')).toBeNull();
});

it('The polling interval follows the content: two seconds while anything is running, ten seconds when everything is terminal', async () => {
  vi.useFakeTimers();
  const fetcher = serve(payload({ running: [run()] }), payload({ finished: [run({ status: 'succeeded' })] }));
  await prefetchTasks(new AbortController().signal);
  await mount(page());
  expect(fetcher).toHaveBeenCalledTimes(1);

  await tick(2000);
  expect(fetcher, 'Every two seconds while tasks run').toHaveBeenCalledTimes(2);

  // This batch is all terminal states; the next round waits ten seconds.
  await tick(2000);
  expect(fetcher, 'The database is hit every 2s even with nothing running').toHaveBeenCalledTimes(2);
  await tick(8000);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('A failed round never wipes the previous data, adding only one more reason on the page', async () => {
  vi.useFakeTimers();
  const fetcher = serve(payload({ finished: [run({ id: 5, status: 'succeeded', task_label: 'Scan and scrape' })] }), null);
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());

  await tick(10_000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Database is currently browse-only');
  expect(host.textContent, 'One failure wipes the previous result, leaving the page knowing less than before').toContain('Scan and scrape');
});

it('After unmount nothing touches the database: polling goes with this root', async () => {
  vi.useFakeTimers();
  const fetcher = serve(payload({ running: [run()] }));
  await prefetchTasks(new AbortController().signal);
  const mounted = await mountRoot(page());

  await tick(2000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  await mounted.unmount();
  await tick(60_000);
  expect(fetcher, 'Polling continued after unmount').toHaveBeenCalledTimes(2);
});

/** A round ending at 10:mm. The larger the minutes, the newer; the id follows the minutes. */
const done = (minute: number, overrides: Partial<TaskRunPayload> = {}) => run({
  id: minute, status: 'succeeded', progress_total: null, progress_current: null,
  finished_at: `2026-09-11T10:${String(minute).padStart(2, '0')}:00.000Z`, ...overrides,
});

const shownIds = (host: HTMLElement) =>
  [...host.querySelectorAll('[data-run-id]')].map((node) => Number(node.getAttribute('data-run-id')));

it('Recent completions replace tasks page by page, supports going back a page, and polling keeps the current page', async () => {
  const calls: string[] = [];
  stubFetch(async (input) => {
    calls.push(input);
    const current = Number(new URL(input, 'http://peach').searchParams.get('page') || 1);
    return { ok: true, status: 200, json: async () => payload({
      finished: current === 1 ? [done(9), done(8)] : [done(7)],
      finished_page: current, finished_total: 21,
    }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  expect(shownIds(host)).toEqual([9, 8]);
  await click(buttonNamed('Next page', host));
  await vi.waitFor(() => expect(shownIds(host)).toEqual([7]));
  await act(async () => { await queryClient.invalidateQueries({ queryKey: ['tasks'] }); });
  expect(shownIds(host)).toEqual([7]);
  expect(calls.at(-1)).toContain('page=2');
  await click(buttonNamed('Previous page', host));
  await vi.waitFor(() => expect(shownIds(host)).toEqual([9, 8]));
});

it('Recent completions hides pagination when there is only one page', async () => {
  const { host } = await open(payload({ finished: [done(9)], finished_total: 1, finished_page: 1 }));
  expect(host.querySelector('nav[aria-label="Recent completions pagination"]')).toBeNull();
});

it('After switching the per-page size, recent completions read the chosen count from the first page', async () => {
  const calls: string[] = [];
  const rows = Array.from({ length: 40 }, (_, index) => done(index + 1));
  stubFetch(async (input) => {
    calls.push(input);
    const query = new URL(input, 'http://peach').searchParams;
    const limit = Number(query.get('limit') || 20);
    const current = Number(query.get('page') || 1);
    return { ok: true, status: 200, json: async () => payload({
      finished: rows.slice((current - 1) * limit, current * limit), finished_total: 40, finished_page: current,
    }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  await click(buttonNamed('Next page', host));
  await vi.waitFor(() => expect(shownIds(host)[0]).toBe(21));
  await choose(host.querySelector('[data-table-pagination] button[aria-haspopup="listbox"]'), '10 rounds per page');
  await vi.waitFor(() => expect(shownIds(host)).toEqual(Array.from({ length: 10 }, (_, index) => index + 1)));
  expect(calls.at(-1)).toBe('/api/tasks?page=1&limit=10');
});

it('Pagination failure keeps the previous page; after a successful retry the chosen page shows', async () => {
  let failed = true;
  stubFetch(async (input) => {
    const current = input.includes('page=2') ? 2 : 1;
    if (current === 2 && failed) return { ok: false, status: 500,
      json: async () => ({ message: 'Database is currently browse-only' }) };
    return { ok: true, status: 200, json: async () => payload({
      finished: [done(current === 1 ? 9 : 7)], finished_page: current, finished_total: 21,
    }) };
  });
  await prefetchTasks(new AbortController().signal);
  const host = await mount(page());
  await click(buttonNamed('Next page', host));
  await vi.waitFor(() => expect(host.textContent).toContain('Database is currently browse-onlyRunningNo tasks running.Recently completedUpdate checkCompletedManual · 11/09 17:09 · Took 1 min 15 sec1–20 / 21 rounds20 rounds per page 10 rounds per page20 rounds per page50 rounds per page100 rounds per pagePrevious page12Next page'));
  expect(shownIds(host)).toEqual([9]);
  failed = false;
  await click(buttonNamed('Next page', host));
  await vi.waitFor(() => expect(shownIds(host)).toEqual([7]));
});

it('Duration and summary conversions each hold on their own', () => {
  expect(elapsedText(0)).toBe('0 sec');
  expect(elapsedText(59)).toBe('59 sec');
  expect(elapsedText(75)).toBe('1 min 15 sec');
  expect(elapsedText(3725)).toBe('1 hr 2 min');
  // Past 48 hours, speak in days: '73 hours 1 minute' does not read as three days.
  expect(elapsedText(47 * 3600 + 59 * 60)).toBe('47 hr 59 min');
  expect(elapsedText(73 * 3600 + 60)).toBe('3 days 1 hours');
  expect(elapsedText(null)).toBe('');
  expect(summaryText({ checked: 1234567 })).toBe('Checked 1,234,567');
  // Progress caps at the total, with thousands separators.
  expect(progressText(1500, 1000)).toBe('1,000 / 1,000');
  expect(progressText(-3, 10)).toBe('0 / 10');
  expect(progressText(null, null)).toBe('0 / 0');
  // Details and 'who blocked it' stay out of this line: the former is too long, and the latter is already in the error sentence.
  expect(summaryText({ checked: 7, operation: 'like', rows: [1], blocked_by: 3 }))
    .toBe('Checked 7 · Action: Mark favorite');
  // The update check settles with the entire status dictionary; bookkeeping fields must not leak onto the card.
  expect(summaryText({
    status: 'complete', run_id: 351, started_at: 1790138114.86, checked: 83, total: 83,
    request_id: '417dab8d', completed_at: 1790138495.48,
  })).toBe('Checked 83 · Total 83');
});

it('Task main summaries use localized results with internal fields reserved for technical details', () => {
  expect(summaryItems({ followups: 9, stage: 'finished', requested_stage: 'all',
    eta_seconds_min: 0, entity_watermark: 9936, performer_aliases: 7, auto_rejected: 0 }))
    .toEqual(['Scheduled 9 backfill tasks', 'Performer aliases 7']);
  expect(followupDetail(followup(4, { task_key: 'performer-profile', task_label: 'Performer detail fill-in',
    progress_label: 'Completing performer details: Demo person', result_summary: { name: 'Demo person', outcome: 'avwikidb 绑定；javdb 绑定' } })))
    .toBe('Demo person · Linked to the AVWikiDB profile page；Linked to the JavDB profile page');
});

it('An error shows one line in the list: tracebacks use the last line, everything else the first non-empty line', () => {
  const stack = 'Traceback (most recent call last):\n  File "x.py", line 1, in <module>\nValueError: broken';
  expect(errorHeadline(stack)).toBe('ValueError: broken');
  expect(errorHeadline('\n  Connection timed out\nSee the log for details')).toBe('Connection timed out');
  expect(errorHeadline('')).toBe('');
  expect(errorHeadline(null)).toBe('');
});

it('The error summary shows one line by default; "View details" expands the full text and clicking again collapses it; no button when it is a single line', async () => {
  const stack = 'Traceback (most recent call last):\n  File "x.py", line 1\nValueError: broken';
  const host = await mount(<ErrorExcerpt text={stack} />);
  expect(host.textContent).toBe('The operation did not finish; please retry. If it keeps failing, check the tray log.View details');
  await click(buttonNamed('View details', host));
  expect(host.textContent).toContain('File "x.py", line 1');
  expect(host.querySelector('[data-error-details] [role="region"]')?.getAttribute('aria-label')).toBe('Full error details');
  expect(buttonNamed('Collapse details', host)?.getAttribute('aria-expanded')).toBe('true');
  await click(buttonNamed('Collapse details', host));
  expect(host.textContent).toBe('The operation did not finish; please retry. If it keeps failing, check the tray log.View details');

  const single = await mount(<ErrorExcerpt text="One line only" />);
  expect(single.textContent).toBe('One line only');
  expect(buttonNamed('View details', single)).toBeNull();
});

it('A follow-up run without the face model is marked as having issues, not completed', async () => {
  const down = { outcome: 'The name is not in the image library and the face model is unavailable: failed to fetch the face model: offline', face_match_unavailable: true };
  const settled = followup(4, { result_summary: down });
  expect(hasResultProblems(settled)).toBe(true);
  expect(isRoutine(run({ status: 'succeeded', trigger: 'scheduled', result_summary: down }))).toBe(false);
  expect(hasResultProblems(followup(4, { result_summary: { face_match_unavailable: false } }))).toBe(false);
  // If the conclusion itself has no reason, add one line; if it does, do not repeat it.
  expect(summaryItems({ outcome: 'The two gallery images fail to recognize each other as the same person', face_match_unavailable: true }))
    .toEqual(['The two gallery images fail to recognize each other as the same person', 'The face model is unavailable, so no face verification ran']);
  expect(summaryItems(down)).toEqual([down.outcome]);
  const parent = run({ id: 4, status: 'succeeded', task_label: 'Scan and scrape', progress_total: null,
                       finished_at: '2026-09-11T10:03:00Z', result_summary: { followups: 1 } });
  const { host } = await open(payload({ finished: [parent, settled] }));
  expect([...host.querySelectorAll('[data-followup-key] > div:first-child > div:first-child > span')].map((node) => node.textContent))
    .toEqual(['Fill in detail images', 'Issues found', `涼森れむ · ${down.outcome}`]);
});

it('A round that cannot get the face model only records the failure and reason; retry lives under "Needs attention" at the top of the page', async () => {
  const { host } = await open(payload({ finished: [run({
    id: 9, task_key: 'face-models', task_label: 'Face model download', trigger: 'scheduled', status: 'failed',
    progress_total: null, progress_current: null, finished_at: '2026-09-11T10:05:00Z',
    error: 'Face model fetch failed: getaddrinfo failed' })] }));
  const card = host.querySelector('[data-task-key=face-models]')!;
  expect(card.getAttribute('data-status')).toBe('failed');
  expect(card.textContent).toContain('Face model fetch failed: getaddrinfo failed');
  expect(card.querySelectorAll('a')).toHaveLength(0);
  expect([...card.querySelectorAll('button')].some((button) => /重试|下载/.test(button.textContent || ''))).toBe(false);
});
