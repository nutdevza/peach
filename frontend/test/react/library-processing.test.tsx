/* Scan and collect: what is handed over, what is said, how long it follows, and how two readers share one job.
 *
 * One snapshot has two readers: the data management page's card and the banner at the top of the catalog page. They read the
 * same `queryKey`, so this measures both one spot's behavior and the request count when both are present.
 * Looks (the banner's tone and base, the footer buttons' primary/secondary) are asserted by `frontend/e2e/design-*.test.ts`
 * reading `getComputedStyle`; this file covers only structure, text and requests. */
import { act } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { queryClient } from '../../src/react/query';
import {
  currentLine, LIBRARY_PROCESSING_KEY, notesLine, prefetchLibraryProcessing, processingLine, remainingTime, type LibraryProcessingData,
} from '../../src/react/library-processing/library-processing';
import { LibraryProcessingCard } from '../../src/react/library-processing/library-processing-card';
import { LibraryProcessingNotice } from '../../src/react/library-processing/library-processing-notice';
import { setProcessingNoticeVisible } from '../../src/react/library-processing/processing-notice-visibility';
import type { LibraryProcessingProps } from '../../src/react/bundle';
import { publishLibraries } from '../../src/library-catalog';

import { actionOrder, buttonNamed as textButtonNamed, click, mount, mountRoot, submit } from './render';

// Cancel must pass a real confirmation box: `confirmModal` in the stub doesn't draw a dialog.
vi.mock('@peach/legacy/ui', async (original) => ({
  ...await original<typeof import('@peach/legacy/ui')>(),
  confirmModal: (await import('../../src/ui-kit/modal')).confirmModal,
}));

const buttonNamed = (name: string, root: ParentNode = document) =>
  [...root.querySelectorAll('button')].find(button => button.getAttribute('aria-label') === name)
  ?? textButtonNamed(name, root);

// The client is a module-level singleton (all React roots share one); without clearing between test cases they feed each other data.
// Reported task ids are stored in `localStorage` and must be cleared too, or the next case's notification is treated as a duplicate.
afterEach(() => {
  queryClient.clear();
  publishLibraries([]);
  localStorage.clear();
  sessionStorage.clear();
});

/* Query dispatches updates through the real `setTimeout(0)` it captured itself, which the fake clock cannot advance: after advancing the clock
   the assertions still see the previous frame's DOM. The case dispatches immediately instead. */
notifyManager.setScheduler((notify) => notify());

const LOG = 'C:\\peach-data\\state\\library-processing-one.issues.jsonl';

it('The pending-completion count stays visible while running, and the sync menu waits for the current task to end',async()=>{
  const {posts}=await open({status:'running',job_id:'one',new_asset_count:12});
  const host=await mount(card({toast:vi.fn()}));
  expect(host.textContent).toContain('Scan and collect12 videos to completeNew files found; fetch profiles and previews for new and unfinished videos. First choose a library, then the sync scope.Media libraryAll libraries All librariesLibrary oneProcessingEstimating remaining time…StandardSources and credentialsDiagnostics and logsSync new files');
  const menu=host.querySelector<HTMLButtonElement>('[data-split-button] [aria-haspopup="dialog"]')!;
  expect(menu.getAttribute('aria-disabled')).toBe('true');
  await click(menu);
  expect(document.querySelector('[role="dialog"][aria-label="Sync method"]')).toBeNull();
  expect(posts()).toEqual([]);
});

it('Completing pending videos submits only registered ranges and never triggers file discovery',async()=>{
  const {calls}=await open({status:'idle',new_asset_count:2},
    (method)=>method==='POST'?{status:'running',job_id:'new'}:{status:'idle',new_asset_count:2});
  const host=await mount(card({toast:vi.fn()}));
  await click(host.querySelector('[data-split-button] [aria-haspopup="dialog"]'));
  await startFrom(menuItem('Complete pending videos'));
  expect(calls.filter(call=>call.method==='POST').map(call=>call.body)).toEqual([{stage:'collect',scope:'new'}]);
});

it('Cancel confirms first; the request is bound to the original task, progress is kept while cancelling, and resending is blocked',async()=>{
  let state:LibraryProcessingData={status:'running',job_id:'one',candidates:3};
  const {calls}=await open(state,(method)=>{
    if(method==='POST') state={...state,status:'stopping'};
    return state;
  });
  const posts=()=>calls.filter(call=>call.method==='POST').map(call=>call.body);
  const host=await mount(card({toast:vi.fn()}));
  await click(buttonNamed('Cancel task',host)!);
  await click(document.querySelector('[data-modal-cancel]'));
  expect(posts()).toEqual([]);
  await click(buttonNamed('Cancel task',host)!);
  await click(document.querySelector('[data-modal-confirm]'));
  await vi.waitFor(()=>expect(posts()).toEqual([{action:'cancel',job_id:'one'}]));
  await vi.waitFor(()=>expect(host.textContent).toContain('Cancelling'));
  expect(buttonNamed('Cancelling',host)?.disabled).toBe(true);
});

type Reply = (method: string, body: unknown) => LibraryProcessingData;

/** Answers one endpoint per method. Test cases read requests off `calls` and inspect request bodies. */
function serve(reply: Reply) {
  const calls: { method: string; body: unknown }[] = [];
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith('/api/library-processing?')) return {
      ok: true, status: 200, json: async () => ({ traffic: {
        used_bytes: 0, estimated_min_bytes: 1024, estimated_max_bytes: 2048,
        metered_used_bytes: 0, metered_estimated_min_bytes: 1024, metered_estimated_max_bytes: 2048,
        sources: [], partial: false, unknown_files: true,
      } }),
    };
    if (path !== '/api/library-processing') throw new Error(`The test stubs no data for ${path}`);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, body });
    const answer = reply(method, body);
    return { ok: true, status: 200, json: async () => answer };
  });
  vi.stubGlobal('fetch', fetcher);
  return { calls, fetcher, posts: () => calls.filter((call) => call.method === 'POST').map((call) => call.body) };
}

/** Walks the real first-screen path: prefetch puts `first` into the cache first, then the case's own responses are swapped in.
 *  The first-screen round trip stays out of `calls`, so assertions count only the traffic after the page mounts. */
async function open(first: LibraryProcessingData, reply: Reply = () => first) {
  publishLibraries([{ id: 'library-one', name: 'Library one', icon: 'database', color: 'blue' }]);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => first })));
  await prefetchLibraryProcessing(new AbortController().signal);
  return serve(reply);
}

const card = (props: LibraryProcessingProps) => (
  <QueryClientProvider client={queryClient}><LibraryProcessingCard {...props} /></QueryClientProvider>
);

it('The library dropdown shows icons and passes the chosen scope into estimates and sync', async () => {
  const { fetcher, posts } = await open({ status: 'idle' });
  const host = await mount(card({ toast: vi.fn() }));
  const select = host.querySelector('select')!;
  await act(async () => { select.value = 'library-one'; select.dispatchEvent(new Event('change', { bubbles: true })) });
  const selected = host.querySelector('button[aria-labelledby*="processingLibraryLabel"]')!;
  expect(selected.textContent).toContain('Library one');
  expect(selected.querySelector('[data-library="library-one"] svg')).not.toBeNull();
  await click(buttonNamed('Sync new files', host));
  expect(document.querySelector('[data-processing-scope]')?.textContent).toContain('Library one');
  const request = fetcher.mock.calls.find(([url]) => String(url).startsWith('/api/library-processing?'))!;
  expect(new URL(String(request[0]), 'https://peach.test').searchParams.get('library_id')).toBe('library-one');
  await submit(document.querySelector('dialog form'));
  expect(posts()).toEqual([{ incremental: true, library_id: 'library-one' }]);
});
const notice = (props: LibraryProcessingProps) => (
  <QueryClientProvider client={queryClient}><LibraryProcessingNotice {...props} /></QueryClientProvider>
);

it('After hiding a task\'s note the card offers a restore entry that submits no business request', async () => {
  const { posts } = await open({ status: 'paused', job_id: 'restore-from-card', checked: 2, total: 10 });
  setProcessingNoticeVisible('restore-from-card', false);
  const host = await mount(card({ toast: vi.fn() }));
  await click(buttonNamed('Show progress window', host));
  expect(buttonNamed('Show progress window', host)).toBeNull();
  expect(posts()).toEqual([]);
});

/** Polling runs on Query's timer, and advancing the clock triggers redraws, so advance it inside act. */
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) });

const menuItem = (label: string) =>
  [...document.querySelectorAll('[role="dialog"] button')].find((item) => item.querySelector('span > span')?.textContent === label);

const startFrom = async (element: Element | null | undefined) => {
  await click(element);
  await submit(document.querySelector('dialog form'));
};

it.each([
  ['Sync new files', 'Sync new files', 'New files and videos awaiting completion', {incremental:true}, {stage:'all',incremental:'1'}],
  ['Discover new files only', 'Discover new files', 'New files not yet registered', {stage:'scan',incremental:true}, {stage:'scan',incremental:'1'}],
  ['Complete pending videos', 'Complete pending videos', 'Registered videos pending completion', {stage:'collect',scope:'new'}, {stage:'collect',scope:'new'}],
  ['Sync all libraries', 'Sync all libraries', 'All files and videos', {}, {stage:'all'}],
  ['Scan files only', 'Scan every file', 'All files and videos', {stage:'scan'}, {stage:'scan'}],
  ['Complete details and previews', 'Complete videos added to library', 'All files and videos', {stage:'collect'}, {stage:'collect'}],
  ['Complete video details only', 'Complete video details only', 'All files and videos', {stage:'metadata'}, {stage:'metadata'}],
  ['Complete preview images only', 'Complete preview images only', 'Videos already in the library (skips traffic-protected folders)', {stage:'previews'}, {stage:'previews'}],
] as const)('%s keeps its confirm scope, estimate request, and submission consistent', async (label, title, scope, command, estimate) => {
  const {fetcher, posts} = await open({status:'idle',new_asset_count:2});
  const host = await mount(card({toast:vi.fn()}));
  if (label === 'Sync new files') await click(buttonNamed(label,host));
  else {
    await click(host.querySelector('[data-split-button] [aria-haspopup="dialog"]'));
    await click(menuItem(label));
  }
  expect(document.querySelector('dialog')?.textContent).toContain(title);
  expect(document.querySelector('[data-processing-scope]')?.textContent).toBe(`Scope: All libraries · ${scope}`);
  const requested = fetcher.mock.calls.map(([path]) => String(path)).find(path => path.includes('estimate=1'))!;
  const params = new URL(requested, 'https://peach.test').searchParams;
  expect(Object.fromEntries(params)).toEqual({estimate:'1',...estimate});
  await submit(document.querySelector('dialog form'));
  expect(posts()).toEqual([command]);
});
const chooseLow = () => act(async () => {
  const slider = document.querySelector('dialog input[type="range"]')!;
  slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  slider.dispatchEvent(new KeyboardEvent('keyup', { key: 'Home', bubbles: true }));
});

it('A source-reported none reports one number, counts as no problem, and offers no failure retry', async () => {
  await open({
    status: 'complete',
    issue_count: 0,
    issue_preview: [],
    notes: { querying_metadata: 30, fetching_cover: 162 },
    issues_log: LOG,
  });
  const host = await mount(card({ toast: vi.fn() }));
  expect(host.textContent).toContain('External sources No details 30 videos, No cover 162 videos will not be asked again for 7 days.');
  expect(host.textContent).toContain(LOG);
  /* The full-record row recedes into gray text, and the line above it takes the same color; the neutral separator is a different gray. */
  const record = [...host.querySelectorAll('p')].find((line) => line.textContent?.includes(LOG))!;
  expect(record.closest('.text-text-secondary')).not.toBeNull();
  expect(record.closest('.border-t')!.className).toContain('border-current/20');
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(buttonNamed('Retry unfinished items now')).toBeNull();
  expect(host.querySelector('details')).toBeNull();
});

it('Finished partial results offer browsing and targeted retry, and interruptions keep the error note', async () => {
  const state: LibraryProcessingData = { status: 'failed', outcome: 'partial', job_id: 'partial',
    issue_count: 2, error: '2 items need attention', retryable_asset_ids: [7],
    issue_preview: [{ asset_id: 7, message: 'Video frame extraction timed out' }] };
  const served = await open(state, method => method === 'POST' ? { status: 'running', job_id: 'retry' } : state);
  const host = await mount(card({ toast: vi.fn() }));
  const banner = await mount(notice({ toast: vi.fn(), mode: 'notice' }));
  for (const surface of [host, banner]) {
    expect(surface.textContent).toContain('Processing ended, some items still need work');
    expect(surface.textContent).toContain('Intaked videos browse under all content');
    expect(surface.querySelector('a[href="/?loc=&thumb=0"]')?.textContent).toBe('View all content');
    expect(surface.querySelector('[role="alert"]')).toBeNull();
  }
  expect(banner.querySelector('[data-processing-tone]')?.getAttribute('data-processing-tone')).toBe('warning');
  await click(buttonNamed('Retry unfinished items now', host));
  expect(served.posts()).toEqual([{ job_id: 'partial', retry: [7] }]);
  await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY,
    { ...state, outcome: 'interrupted', error: 'Processing interrupted' }); });
  expect(banner.querySelector('[role="alert"]')?.textContent).toContain('Scan and scrape were interrupted');
  expect(banner.querySelector('a[href="/?loc=&thumb=0"]')).toBeNull();
});

it('Scan and completion share one primary key plus a dropdown, each handing over its own stages', async () => {
  const served = await open({ status: 'idle' }, () => ({ status: 'complete' }));
  const host = await mount(card({ toast: vi.fn() }));

  await startFrom(buttonNamed('Sync new files', host));
  await click(host.querySelector('[data-split-button] [aria-haspopup="dialog"]'));
  expect(document.querySelector('[role="group"][aria-label="Library maintenance"]')).not.toBeNull();
  await startFrom(menuItem('Sync all libraries'));
  await click(host.querySelector('[data-split-button] [aria-haspopup="dialog"]'));
  await startFrom(menuItem('Scan files only'));
  await click(host.querySelector('[data-split-button] [aria-haspopup="dialog"]'));
  await startFrom(menuItem('Complete details and previews'));
  await click(host.querySelector('[data-split-button] [aria-haspopup="dialog"]'));
  await startFrom(menuItem('Complete preview images only'));
  await click(host.querySelector('[data-split-button] [aria-haspopup="dialog"]'));
  await startFrom(menuItem('Complete video details only'));

  expect(served.posts()).toEqual([{incremental:true}, {}, { stage: 'scan' }, { stage: 'collect' }, { stage: 'previews' }, { stage: 'metadata' }]);
  expect(host.querySelector('a[href="/sources"]')?.textContent).toContain('Sources and credentials');
});

it('Startup submits once, reads progress back with GET, and on completion gives a receipt and a review entry', async () => {
  const toast = vi.fn();
  const served = await open(
    { status: 'idle' },
    (method) => method === 'POST'
      ? { status: 'running', job_id: 'one' }
      : { status: 'complete', job_id: 'one', scanned: 9, identified: 4, candidates: 2 },
  );
  const host = await mount(card({ toast }));
  await startFrom(buttonNamed('Sync new files', host));

  expect(served.calls.map((call) => call.method)).toEqual(['POST', 'GET']);
  expect(host.querySelector('a[href="/review"]')).not.toBeNull();
  expect(toast).toHaveBeenCalledTimes(1);
  const receipt = host.querySelector('[role="status"]');
  expect(receipt?.textContent).toContain('Processing finished');
  expect(receipt?.textContent).toContain(
    'Scanned 9 files, identified 4 codes, Fetched 2 sets of video details, auto-saved 0.');
  // This run fetched no performer profiles, so that sentence does not appear in the receipt.
  expect(receipt?.textContent).not.toContain('Complete performer details');
});

it('Performer detail completion counts enter the receipt, naming conflicts and fetch failures separately', async () => {
  const served = await open(
    { status: 'idle' },
    (method) => method === 'POST'
      ? { status: 'running', job_id: 'one' }
      : {
          status: 'complete', job_id: 'one', scanned: 9, identified: 4, candidates: 2,
          auto_applied: 2, performer_aliases: 5, performer_avatars: 3,
          performer_profile_conflicts: 1, performer_profile_failed: 2,
        },
  );
  const host = await mount(card({ toast: vi.fn() }));
  await startFrom(buttonNamed('Sync new files', host));

  expect(served.posts()).toEqual([{incremental:true}]);
  expect(host.querySelector('[role="status"]')?.textContent).toContain(
    'Fill in performer profiles: 5 aliases, 3 avatars, 1 profile shares a name and needs confirmation they are the same person, 2 avatars could not be fetched.');
});

it('A prior run\'s terminal state read on the first screen never poses as this run\'s receipt', async () => {
  const toast = vi.fn();
  // The task keeps running after the page closes, and its state holds the previous run's receipt for good; by the time the page opens it ended long ago.
  const served = await open({ status: 'complete', job_id: 'old', identified: 7, candidates: 3 });
  const host = await mount(card({ toast }));

  expect(served.calls.every((call) => call.method === 'GET')).toBe(true);
  expect(toast).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('Processing finished');
});

it('The running state states the current project, action, and wait duration; slow processing only shows a hint and never starts another task', async () => {
  const served = await open({
    status: 'running', job_id: 'one', checked: 2, total: 10, stalled: true,
    current_asset_name: 'ABW-001.mp4', current_action: 'querying_metadata', waited_seconds: 300,
  });
  const host = await mount(card({ toast: vi.fn() }));

  expect(host.textContent).toContain('Scan and collectNew files found; fetch profiles and previews for new and unfinished videos. First choose a library, then the sync scope.Media libraryAll libraries All librariesLibrary oneCurrent: ABW-001.mp4 · Query external details · waited 5 min 0 sec · 2 / 10 itemsWaiting on the current file\'s response; time remaining pending updateStandardSources and credentialsDiagnostics and logsSync new files\'Processing slowly\'This one takes a while and has no fresh progress yet. After the task ends you can retry the unfinished parts.');
  expect(host.textContent).toContain('Processing slowly');
  // When there is a denominator, draw the progress bar and drop the separate waiting dots: one fact, two renderings.
  expect(host.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
  expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('2');

  await click(buttonNamed('Sync new files', host));
  expect(served.posts()).toEqual([]);
});

it('On failure the issue list folds into the error note, and retry submits only the failed items', async () => {
  const served = await open({
    status: 'failed', job_id: 'one', error: '2 items need attention', issue_count: 23,
    issues_log: LOG, issues_truncated: true, retryable_asset_ids: [7, 8],
    issue_preview: [{ asset_id: 7, title: 'sample.mp4', path: 'R:\\Media\\sample.mp4', message: 'No code recognized' }],
  }, () => ({ status: 'running', job_id: 'two' }));
  const host = await mount(card({ toast: vi.fn() }));

  const alert = host.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain('2 items need attention');
  const details = alert!.querySelector('details')!;
  expect(details.open).toBe(false);
  expect(details.querySelector('summary')?.textContent).toBe('Issue list: 23 items; expand to view the first 1');
  expect(details.querySelector('li a')?.getAttribute('href')).toBe('/assets/7');
  expect(details.querySelector('li')?.textContent).toContain('sample.mp4');
  expect(details.querySelector('li code')?.textContent).toBe('R:\\Media\\sample.mp4');
  // The list's own scrollbar uses the site-wide overlay style, leaving no gray system bar behind.
  const list = details.querySelector('ul')!;
  expect(list.dataset.overlayScrollbar).toBe('true');
  expect(list.parentElement?.querySelector('.ovtrack')).not.toBeNull();
  /* Three sections stacked on the same red background: verdict, list, and log address. A horizontal line between entries and between sections,
     otherwise dozens of same-length detail lines merge into one mass with no visible ends. */
  expect(list.querySelector('li')!.className).toContain('border-b');
  expect(details.parentElement?.className).toContain('border-t');
  /* The full record is what you dig through yourself after something goes wrong, so it recedes to gray text and stays visible even with the list collapsed; beside it are the two buttons to open it and
     to export it, the export lined up next to the record. */
  const reveal = alert!.querySelector('button[aria-label="Show in File Explorer"]')!;
  expect(details.contains(reveal)).toBe(false);
  const logRow = reveal.closest('.text-text-secondary')!;
  expect(logRow.querySelector('p')?.textContent).toBe(`Full log: ${LOG}`);
  expect(logRow.contains(buttonNamed('Export the full issue list', host))).toBe(true);
  // Newly discovered files and the original task's targeted retry keep separate entries.
  expect(buttonNamed('Sync new files', host)?.textContent).toBe('Sync new files');

  // The retry key belongs to the error notice and is secondary, like recovery actions in Notes elsewhere; it stays operable while the issue list is collapsed.
  const retry = buttonNamed('Retry unfinished items now')!;
  expect(retry.textContent).toBe('Retry now');
  expect(retry.className).not.toContain('bg-button-primary');
  expect(alert!.contains(retry)).toBe(true);
  expect(details.contains(retry)).toBe(false);

  await click(retry);
  expect(served.posts()).toEqual([{ job_id: 'one', retry: [7, 8] }]);
});

it('With retryable items present the primary button still finds new files, and targeted retry keeps its own entry', async () => {
  const served = await open({
    status: 'failed', job_id: 'one', error: '2 items need attention',
    retryable_asset_ids: [7, 8], issue_preview: [],
  }, () => ({ status: 'running', job_id: 'two' }));
  const host = await mount(card({ toast: vi.fn() }));

  await startFrom(buttonNamed('Sync new files', host));
  expect(served.posts()).toEqual([{incremental:true}]);
});

it('When no failed item can retry, finding new files still works', async () => {
  await open({
    status: 'failed', job_id: 'one', error: '1 item needs attention', issue_count: 1,
    retryable_asset_ids: [], issue_preview: [{ asset_id: 1, message: 'No code recognized' }],
  });
  const host = await mount(card({ toast: vi.fn() }));
  expect(buttonNamed('Retry unfinished items now')).toBeNull();
  expect(buttonNamed('Sync new files', host)?.textContent).toBe('Sync new files');
});

it('When a read fails it keeps existing progress, adding only a connection-lost note beside it', async () => {
  await open({ status: 'running', checked: 3, total: 9, stage: 'Scrape missing profiles' });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
  vi.useFakeTimers();
  const host = await mount(card({ toast: vi.fn() }));
  await tick(2000);

  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Connection dropped; re-reading processing progress');
  expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('3');
});

it('The banner picks up background jobs while idle, collapses when one finishes with a single completion report, and stops touching the database after unmount', async () => {
  vi.useFakeTimers();
  const toast = vi.fn();
  const job = { at: { status: 'running', stage: 'Scrape missing profiles', checked: 2, total: 5 } as LibraryProcessingData };
  const served = await open({ status: 'idle' }, () => job.at);
  const mounted = await mountRoot(notice({ toast, mode: 'notice' }));

  expect(mounted.host.textContent).toBe('');
  await tick(10_000);
  expect(mounted.host.textContent).toContain('Scrape missing profiles');
  expect(mounted.host.querySelector('a')?.getAttribute('href')).toBe('/data-cleanup#libraryProcessing');
  expect(mounted.host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('40');

  job.at = { status: 'complete', job_id: 'one', identified: 3, candidates: 2 };
  await tick(2000);
  expect(mounted.host.textContent).toBe('');
  expect(toast).toHaveBeenCalledTimes(1);

  await mounted.unmount();
  const asked = served.calls.length;
  await tick(20_000);
  expect(served.calls).toHaveLength(asked);
  expect(served.posts()).toEqual([]);
});

it('A card asked to watch a task keeps polling and reports once when the task ends', async () => {
  vi.useFakeTimers();
  const toast = vi.fn();
  await open({ status: 'running', job_id: 'one' }, () => ({ status: 'complete', job_id: 'one' }));
  const onComplete = vi.fn();
  await mount(card({ toast, monitor: true, onComplete }));

  await tick(2000);
  expect(toast).toHaveBeenCalledTimes(1);
  // The review and candidate counts are rendered by the legacy layer; once this run finishes it must be told to re-read once.
  expect(onComplete).toHaveBeenCalledTimes(1);
  await tick(30_000);
  expect(toast).toHaveBeenCalledTimes(1);
});

it('A just-finished task banner reports on first read and only once per job id', async () => {
  vi.useFakeTimers();
  const toast = vi.fn();
  const job: LibraryProcessingData = {
    status: 'complete', job_id: 'job-fresh', identified: 3, candidates: 2,
    completed_at: Date.now() / 1000,
  };
  await open(job);
  for (let round = 0; round < 2; round += 1) {
    const mounted = await mountRoot(notice({ toast, mode: 'notice' }));
    await tick(10_000);
    await mounted.unmount();
  }
  expect(toast).toHaveBeenCalledTimes(1);
  expect(toast).toHaveBeenNthCalledWith(
    1, 'Scan and profile collection finished: identified 3 codes, Fetched 2 sets of video details, auto-saved 0');
});

it('Both containers read the same task run: one query per cycle, and removing one leaves the other working as usual', async () => {
  vi.useFakeTimers();
  const served = await open({ status: 'running', checked: 2, total: 10, stage: 'Scrape missing profiles' });
  const banner = await mountRoot(notice({ toast: vi.fn(), mode: 'notice' }));
  const panel = await mountRoot(card({ toast: vi.fn(), monitor: true }));

  await tick(2000);
  expect(served.calls, 'With each side storing its own state, the card says done while the banner still shows progress').toHaveLength(1);
  await tick(2000);
  expect(served.calls).toHaveLength(2);
  expect(banner.host.textContent).toContain('Scrape missing profiles');
  expect(panel.host.textContent).toContain('Scrape missing profiles');

  await panel.unmount();
  await tick(2000);
  expect(served.calls, 'With the banner still on the page its rhythm must not stop with the card').toHaveLength(3);
});

it('Both containers\' wait counters advance each second without extra polling, and align to the snapshot on file switch and pause', async () => {
  vi.useFakeTimers();
  const state: LibraryProcessingData = { status: 'running', checked: 2, total: 10,
    current_asset_id: 1, current_action: 'reading_local_cover', waited_seconds: 33 };
  const served = await open(state);
  const banner = await mountRoot(notice({ toast: vi.fn(), mode: 'notice' }));
  const panel = await mountRoot(card({ toast: vi.fn(), monitor: true }));
  expect(banner.host.textContent).toContain('Scan and scrapeEstimating remaining time…Read companion images · waited 33 sec · 2 / 10 itemsTask detailsStandard');
  expect(panel.host.textContent).toContain('Scan and collectNew files found; fetch profiles and previews for new and unfinished videos. First choose a library, then the sync scope.Media libraryAll libraries All librariesLibrary oneRead companion images · waited 33 sec · 2 / 10 itemsEstimating remaining time…StandardSources and credentialsDiagnostics and logsSync new files');
  await tick(1000);
  expect(banner.host.textContent).toContain('Scan and scrapeEstimating remaining time…Read companion images · waited 34 sec · 2 / 10 itemsTask detailsStandard');
  expect(panel.host.textContent).toContain('waited 34 sec');
  expect(served.calls).toHaveLength(0);
  await tick(1000);
  expect(banner.host.textContent).toContain('waited 35 sec');
  expect(panel.host.textContent).toContain('waited 35 sec');
  expect(served.calls).toHaveLength(1);
  await act(async () => {
    queryClient.setQueryData(LIBRARY_PROCESSING_KEY, { ...state, current_asset_id: 2, waited_seconds: 0 });
  });
  expect(banner.host.textContent).not.toContain('waited 35 sec');
  await tick(1000);
  expect(banner.host.textContent).toContain('waited 1 sec');
  expect(panel.host.textContent).toContain('waited 1 sec');
  await act(async () => { queryClient.setQueryData(LIBRARY_PROCESSING_KEY, { ...state, status: 'paused' }) });
  expect(banner.host.textContent).not.toContain('waited');
  expect(panel.host.textContent).not.toContain('waited');
  await banner.unmount();
  await panel.unmount();
  const requests = served.calls.length;
  await tick(10_000);
  expect(served.calls).toHaveLength(requests);
});

it('Polling stops once the card unmounts', async () => {
  vi.useFakeTimers();
  const served = await open({ status: 'running', checked: 2, total: 10 });
  const panel = await mountRoot(card({ toast: vi.fn(), monitor: true }));
  await tick(2000);
  expect(served.calls).toHaveLength(1);

  await panel.unmount();
  await tick(20_000);
  expect(served.calls, 'If that root is still alive after leaving the page it keeps hitting the database on its original rhythm').toHaveLength(1);
});

it('Source-reported none counts use thousands separators, and wait times roll up by minutes, hours, and days', () => {
  expect(notesLine({ querying_metadata: 1234567, fetching_cover: 0 }))
    .toBe('External sources No details 1,234,567 videos will not be asked again for 7 days.');
  expect(currentLine({ status: 'running', current_action: 'fetching_cover', waited_seconds: 259200 } as LibraryProcessingData))
    .toBe('Scrape missing covers · waited 3 days 0 hours');
});

it('Routine sync shows a traffic estimate first, starts only in confirm mode, and canceling never starts it', async () => {
  const served = await open({ status: 'idle', speed_mode: 'standard' }, () => ({ status: 'running', job_id: 'one' }));
  const host = await mount(card({ toast: vi.fn() }));
  await click(buttonNamed('Sync new files', host));
  expect(served.posts()).toEqual([]);
  expect(document.querySelector('dialog')?.textContent).toContain('which can slow the computer down');
  await click(buttonNamed('Cancel', document.querySelector('dialog')!));
  expect(served.posts()).toEqual([]);
  await click(buttonNamed('Sync new files', host));
  expect(document.querySelector('dialog [aria-label="Traffic estimate"]')?.textContent).toContain('Estimated traffic');
  expect(host.querySelector('[data-processing-controls]')).toBeNull();
  await chooseLow();
  await submit(document.querySelector('dialog form'));
  expect(served.posts()).toEqual([{ incremental:true, speed_mode: 'low' }]);
  expect(document.querySelector('dialog')).toBeNull();
});

it('Pause and resume share one job id; pausing is not completion, and polling continues while paused', async () => {
  vi.useFakeTimers();
  const toast = vi.fn(), onComplete = vi.fn();
  let state: LibraryProcessingData = { status: 'running', job_id: 'one', checked: 2, total: 10,
    speed_mode: 'low', eta_kind: 'historical', eta_initial: true, eta_seconds_min: 1200, eta_seconds_max: 2400 };
  const served = await open(state, (method, body) => {
    if (method === 'POST') {
      const action = (body as { action: string }).action;
      state = { ...state, status: action === 'pause' ? 'pausing' : 'running' };
    }
    return state;
  });
  const host = await mount(notice({ toast, onComplete, mode: 'notice' }));
  expect(host.textContent).toContain('Scan and scrapeAbout 20–40 min remaining (rough)Processing · 2 / 10 itemsTask detailsLow usage');
  // The link to the task's details sits left; in-place controls like pause sit right.
  const bar = actionOrder(host.querySelector('a[href="/data-cleanup#libraryProcessing"]')!.parentElement);
  expect(bar[0]).toBe('Task details');
  expect(bar.indexOf('Paused')).toBeGreaterThan(0);
  await click(buttonNamed('Paused', host));
  expect(host.textContent).toContain('Pausing; it pauses once the current step ends');
  state = { ...state, status: 'paused' };
  await tick(2000);
  expect(buttonNamed('Continue', host)).not.toBeNull();
  expect(host.textContent).toContain('Paused; estimates update after resuming');
  expect(onComplete).not.toHaveBeenCalled();
  expect(toast).not.toHaveBeenCalled();
  await click(buttonNamed('Continue', host));
  expect(served.posts()).toEqual([{ action: 'pause', job_id: 'one' }, { action: 'resume', job_id: 'one' }]);
  expect(buttonNamed('Paused', host)).not.toBeNull();
});

it('The first-screen paused state keeps progress and a resume entry on both card and task panel', async () => {
  await open({ status: 'paused', job_id: 'one', checked: 2, total: 10 });
  const host = await mount(card({ toast: vi.fn() }));
  const banner = await mount(notice({ toast: vi.fn(), mode: 'notice' }));
  expect(host.textContent).toContain('Paused');
  expect(banner.textContent).toContain('Paused');
  expect(buttonNamed('Continue', host)).not.toBeNull();
  expect(buttonNamed('Continue', banner)).not.toBeNull();
  expect(buttonNamed('Standard', banner)).not.toBeNull();
  expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('2');
});

it('A failed task with no per-item issues can still archive its prompt; it\'s reversible, and reopening won\'t leave that “archived” line', async () => {
  const state: LibraryProcessingData = { status:'failed', job_id:'one', error:'The task could not recover automatically' };
  let archived = false;
  const served = await open(state, (method, body) => {
    if (method === 'POST') archived = (body as {action:string}).action === 'archive';
    return {...state,archived};
  });
  const toast = vi.fn();
  const host = await mount(card({toast}));
  expect(buttonNamed('Export the full issue list',host)).toBeNull();
  const archive = buttonNamed('Archive',host)!;
  expect(host.querySelector('[role="alert"]')!.contains(archive)).toBe(true);
  await click(archive);
  expect(served.posts()).toEqual([{action:'archive',job_id:'one'}]);
  expect(host.textContent).toContain('the full record is still kept');
  expect(host.textContent).not.toContain('The task could not recover automatically');
  expect(toast).not.toHaveBeenCalled();
  await click(buttonNamed('Undo',host));
  expect(served.posts()).toEqual([{action:'archive',job_id:'one'},{action:'unarchive',job_id:'one'}]);
  expect(host.textContent).toContain('The task could not recover automatically');
  expect(host.textContent).not.toContain('the full record is still kept');

  await open({...state,archived:true});
  const again = await mount(card({toast}));
  expect(again.textContent).not.toContain('The task could not recover automatically');
  expect(again.textContent).not.toContain('the full record is still kept');
  expect(buttonNamed('Undo',again)).toBeNull();
});

it('A failed mode switch keeps the server\'s selected value and the in-place error, and can retry', async () => {
  await open({ status: 'running', job_id: 'one', speed_mode: 'standard' });
  vi.stubGlobal('fetch', vi.fn(async (_path: string, init?: RequestInit) => init?.method === 'POST'
    ? { ok: false, status: 409, json: async () => ({ error: 'The task changed; refresh and retry' }) }
    : { ok: true, status: 200, json: async () => ({ status: 'running', job_id: 'one', speed_mode: 'standard' }) }));
  const host = await mount(notice({ toast: vi.fn(), mode: 'notice' }));
  await click(buttonNamed('Standard', host));
  const slider = document.querySelector<HTMLInputElement>('input[type="range"]')!;
  await act(async () => {
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    slider.dispatchEvent(new KeyboardEvent('keyup', { key: 'Home', bubbles: true }));
  });
  expect(host.textContent).toContain('Scan and scrapeEstimating remaining time…ProcessingTask detailsStandardThe task changed; refresh and retry');
  expect(buttonNamed('Standard', host)).not.toBeNull();
  expect(slider.value).toBe('1');
  expect(slider.disabled).toBe(false);
});

it('Estimates show a range from rough and measured rates, waiting for estimation when no valid range exists', () => {
  const state: LibraryProcessingData = { status: 'running', eta_seconds_min: 1200, eta_seconds_max: 2400, eta_kind: 'historical' };
  expect(remainingTime(state)).toBe('About 20–40 min remaining (rough)');
  expect(remainingTime({ ...state, eta_seconds_min: 600, eta_seconds_max: 900, eta_kind: 'measured', eta_scope: 'Detail scraping' }))
    .toBe('About 10–15 min remaining · Detail scraping');
  expect(remainingTime({ ...state, eta_seconds_max: NaN })).toBe('Estimating remaining time…');
  expect(remainingTime({ ...state, eta_seconds_min: 2500 })).toBe('Estimating remaining time…');
  expect(remainingTime({ ...state, eta_seconds_min: 0, eta_seconds_max: 10 })).toBe('Less than a minute remaining');
  expect(remainingTime({ ...state, status: 'complete' })).toBe('');
});

it('When processing is slow, each task panel shows waiting progress instead of reusing the old estimate', async () => {
  await open({ status: 'running', job_id: 'slow', stalled: true,
    eta_seconds_min: 63, eta_seconds_max: 94, eta_kind: 'measured',
    current_action: 'reading_local', current_asset_name: 'sample-video.mp4' });
  const host = await mount(card({ toast: vi.fn() }));
  const banner = await mount(notice({ toast: vi.fn(), mode: 'notice' }));
  for (const surface of [host, banner]) {
    expect(surface.textContent).toContain('Waiting on the current file\'s response; time remaining pending update');
    expect(surface.textContent).not.toContain('Estimated remaining');
    expect(surface.textContent).toContain('Check companion files');
  }
});

it('With an unknown scan total it shows files discovered, and known stages show the completed count', () => {
  expect(processingLine({ status: 'running', stage: 'Scan files', scanned: 12345 }))
    .toBe('Scan files · 12,345 files discovered');
  expect(processingLine({ status: 'paused', checked: 38, total: 100 })).toBe('Paused · 38 / 100 items');
});

it('On launch failure the note popover keeps the mode selection and a retry entry', async () => {
  await open({ status: 'idle' });
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST'
    ? { ok: false, status: 400, json: async () => ({ error: 'Media directory unavailable' }) }
    : { ok: true, status: 200, json: async () => ({ status: 'idle' }) }));
  const host = await mount(card({ toast: vi.fn() }));
  await click(buttonNamed('Sync new files', host));
  await chooseLow();
  await submit(document.querySelector('dialog form'));
  expect(document.querySelector('dialog')?.textContent).toContain('The operation did not finish; please retry. If it keeps failing, check the tray log.');
  expect(document.querySelector<HTMLInputElement>('dialog input[type="range"]')?.value).toBe('0');
  expect(document.querySelector('[data-modal-confirm]')?.getAttribute('aria-busy')).toBeNull();
});
