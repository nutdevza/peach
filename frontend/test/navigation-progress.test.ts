import { QueryObserver } from '@tanstack/query-core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let uninstall = () => {};
beforeEach(() => { vi.resetModules(); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }); });
afterEach(() => { uninstall(); vi.useRealTimers(); });

async function setup() {
  const managed = await import('../src/history/managed');
  const { installNavigationProgress } = await import('../src/navigation-progress');
  const { queryClient } = await import('../src/query');
  uninstall = installNavigationProgress();
  const bar = document.querySelector<HTMLElement>('.navprogress')!;
  return { managed, queryClient, bar };
}

/* First-screen fetches wait on a gate; `release` lets them through. */
function gated() {
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  return { gate, release: () => release() };
}

it('The pagination first-screen loader only lights up when fetching takes over 200ms; once complete it stays lit for at least 400ms before fading out', async () => {
  const { managed, bar } = await setup();
  const { gate, release } = gated();
  managed.connectManagedRoutes(Promise.resolve(() => gate));
  const container = document.createElement('div');
  const opened = managed.openManagedRoute('/tags', {}, { container, isCurrent: () => true });
  await vi.advanceTimersByTimeAsync(150);
  expect(bar.dataset.state).toBeUndefined();
  await vi.advanceTimersByTimeAsync(100);
  expect(bar.dataset.state).toBe('running');
  release(); await opened;
  await vi.advanceTimersByTimeAsync(300);
  expect(bar.dataset.state).toBe('running');
  await vi.advanceTimersByTimeAsync(100);
  expect(bar.dataset.state).toBe('done');
  await vi.advanceTimersByTimeAsync(240);
  expect(bar.dataset.state).toBeUndefined();
});

it('Page switches and in-page component fetches drawn within 200ms do not flash', async () => {
  const { managed, bar } = await setup();
  const { gate, release } = gated();
  managed.connectManagedRoutes(Promise.resolve((path: string) => path === 'search' ? new Promise<void>(() => {}) : gate));
  const page = managed.openManagedRoute('/stats', {}, { container: document.createElement('div'), isCurrent: () => true });
  await vi.advanceTimersByTimeAsync(120);
  release(); await page;
  await vi.advanceTimersByTimeAsync(1000);
  expect(bar.dataset.state).toBeUndefined();

  void managed.openManagedRoute('search', {}, { container: document.createElement('div'), isCurrent: () => true });
  await vi.advanceTimersByTimeAsync(1000);
  expect(bar.dataset.state).toBeUndefined();
});

it('When switching to another page, the previous run is aborted and the progress bar keeps running; it does not wait from scratch', async () => {
  const { managed, bar } = await setup();
  const { gate, release } = gated();
  managed.connectManagedRoutes(Promise.resolve(() => gate));
  const container = document.createElement('div');
  void managed.openManagedRoute('/performers/*', {}, { container, isCurrent: () => true });
  await vi.advanceTimersByTimeAsync(150);
  const second = managed.openManagedRoute('/performers/*', {}, { container, isCurrent: () => true });
  await vi.advanceTimersByTimeAsync(60);
  expect(bar.dataset.state).toBe('running');
  release(); await second;
});

it('On-screen components light up while waiting for the first data; refetches where data already exists, polling after failure, and unwatched prefetches don\'t light up', async () => {
  const { queryClient, bar } = await setup();
  const hold = () => new Promise(() => {});

  void queryClient.prefetchQuery({ queryKey: ['prefetch'], queryFn: hold });
  queryClient.setQueryData(['cached'], 1);
  const refetch = new QueryObserver(queryClient, { queryKey: ['cached'], queryFn: hold, staleTime: 0 });
  const stopRefetch = refetch.subscribe(() => {});
  void refetch.refetch();
  let calls = 0;
  const polling = new QueryObserver(queryClient, { queryKey: ['polling'],
    queryFn: () => calls++ ? hold() : Promise.reject(new Error('offline')) });
  const stopPolling = polling.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(50);
  expect(polling.getCurrentResult().status).toBe('error');
  void polling.refetch();
  await vi.advanceTimersByTimeAsync(1000);
  expect(polling.getCurrentResult().fetchStatus).toBe('fetching');
  expect(bar.dataset.state).toBeUndefined();

  const first = new QueryObserver(queryClient, { queryKey: ['first'], queryFn: hold });
  const stopFirst = first.subscribe(() => {});
  await vi.advanceTimersByTimeAsync(250);
  expect(bar.dataset.state).toBe('running');
  stopFirst();
  await vi.advanceTimersByTimeAsync(700);
  expect(bar.dataset.state).toBeUndefined();
  stopRefetch(); stopPolling();
});
