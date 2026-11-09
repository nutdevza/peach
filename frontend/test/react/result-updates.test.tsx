import { act } from 'react';
import { QueryClientProvider, notifyManager, useQuery } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { createResultRefresher, ResultUpdates } from '../../src/react/result-updates';
import { RESULT_UPDATES_KEY } from '../../src/react/activity/tasks';
import { queryClient } from '../../src/react/query';
import { mount, pending, settle } from './render';

notifyManager.setScheduler(notify => notify());
afterEach(() => queryClient.clear());

it('Background prefetches for unshown pages keep reading without blocking the current page\'s revision handling', async () => {
  const old = pending<string>();
  const prefetched = queryClient.fetchQuery({ queryKey: ['item', 3], queryFn: () => old.answer });
  await createResultRefresher()({ catalog: '1' }, { catalog: '2' });
  expect(queryClient.getQueryState(['item', 3])?.fetchStatus).toBe('fetching');
  await old.release('Prefetched content');
  expect(await prefetched).toBe('Prefetched content');
});

it('The list updates when a running task publishes confirmation results; status and credential queries keep their original values', async () => {
  const data = { busy: true,
    result_versions: { follow: '1' } };
  queryClient.setQueryData(RESULT_UPDATES_KEY, data);
  queryClient.setQueryData(['follow-feed'], 'First entry');
  queryClient.setQueryData(['follow-manage', 'check'], 'running');
  queryClient.setQueryData(['follow-manage', 'credentials'], 'Credentials');
  queryClient.setQueryData(['catalog-grid'], 'Library');
  queryClient.setQueryData(['index', 'performers'], 'Old roster');
  let current = 'First entry';
  const read = vi.fn(async () => current);
  function Feed() {
    const feed = useQuery({ queryKey: ['follow-feed'], queryFn: read });
    return <p>{feed.data}</p>;
  }
  const host = await mount(<QueryClientProvider client={queryClient}><ResultUpdates openItem={vi.fn()} /><Feed /></QueryClientProvider>);
  await settle();
  expect(read).not.toHaveBeenCalled();
  await act(async () => {
    current = 'First item, second item';
    queryClient.setQueryData(RESULT_UPDATES_KEY, { ...data, result_versions: { follow: '2' } });
  });
  await settle();
  expect(host.textContent).toBe('First item, second item');
  expect(read).toHaveBeenCalledTimes(1);
  expect(queryClient.getQueryState(['follow-manage', 'check'])?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(['follow-manage', 'credentials'])?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(['catalog-grid'])?.isInvalidated).toBe(false);
  expect(queryClient.getQueryState(['index', 'performers'])?.isInvalidated).toBe(true);
});

it('When follows results change, stats and taste refetch too: the server caches of both pages read from the follows source', async () => {
  // The page-to-version-key mapping matches `ResultVersionTablesTests` in `tests/test_ledger_revision.py`.
  for (const key of [['stats'], ['taste', 'all'], ['catalog-grid']]) queryClient.setQueryData(key, 'old');
  await createResultRefresher()({ follow: '1' }, { follow: '2' });
  expect(queryClient.getQueryState(['stats'])?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(['taste', 'all'])?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(['catalog-grid'])?.isInvalidated).toBe(false);
});

it('Reads issued before the edition arrives are rechecked once they finish; a stale response must not cover the confirmed result', async () => {
  const old = pending<string>();
  let reads = 0;
  function Item() {
    const item = useQuery({ queryKey: ['item', 2], queryFn: () => ++reads === 1 ? old.answer : Promise.resolve('Confirmed result') });
    return <p>{item.data}</p>;
  }
  const host = await mount(<QueryClientProvider client={queryClient}><Item /></QueryClientProvider>);
  const refresh = createResultRefresher();
  const completed = refresh({ catalog: '1' }, { catalog: '2' });
  await old.release('Old response');
  await act(async () => { await completed; });
  expect(reads).toBe(2);
  expect(host.textContent).toBe('Confirmed result');
});

it('While a slow read runs, next-item results queue up to refresh without canceling the read or dropping new values', async () => {
  const first = pending<string>();
  let reads = 0;
  queryClient.setQueryData(['item', 1], 'Old title');
  function Item() {
    const item = useQuery({ queryKey: ['item', 1], queryFn: () => ++reads === 1 ? first.answer : Promise.resolve('Final title') });
    return <p>{item.data}</p>;
  }
  const host = await mount(<QueryClientProvider client={queryClient}><Item /></QueryClientProvider>);
  const refresh = createResultRefresher();
  let completed: Promise<void>;
  await act(async () => {
    completed = refresh({ catalog: '1' }, { catalog: '2' });
    void refresh({ catalog: '2' }, { catalog: '3' });
  });
  expect(host.textContent).toBe('Old title');
  await first.release('Intermediate title');
  await act(async () => { await completed!; });
  expect(reads).toBe(2);
  expect(host.textContent).toBe('Final title');
});

it('In-library toasts: the first round only records the baseline; each new arrival pops its own toast and can be opened, more than 3 in a round merge into one, and after a service restart nothing pops retroactively', async () => {
  const toaster = await import('../../src/react/toaster');
  const shown = vi.spyOn(toaster, 'showToast').mockImplementation(() => {});
  const go = vi.fn();
  const { announceIngests } = await import('../../src/react/result-updates');
  const notice = (id: number, kind: 'download' | 'discovered' = 'download', label = `SSIS-${id}`) =>
    ({ id, kind, asset_id: 100 + id, label, at: 0 });
  let seen = announceIngests(null, { epoch: 'a', items: [notice(1), notice(2)] }, go);
  expect(shown).not.toHaveBeenCalled();
  seen = announceIngests(seen, { epoch: 'a', items: [notice(1), notice(2), notice(3), notice(4, 'discovered', '<b>x</b>')] }, go);
  expect(shown.mock.calls.map(([, request]) => request.html)).toEqual(
    ['"SSIS-3" is in the library and organized', 'New files in library: "&#60;b&#62;x&#60;/b&#62;"']);
  shown.mock.calls[0]![1].action!.run(document.createElement('button'));
  expect(go).toHaveBeenCalledWith(103);
  shown.mockClear();
  seen = announceIngests(seen, { epoch: 'a', items: [5, 6, 7, 8].map(id => notice(id)) }, go);
  expect(shown.mock.calls.map(([, request]) => [request.html, request.action])).toEqual([['4 works added to the library', null]]);
  shown.mockClear();
  announceIngests(seen, { epoch: 'b', items: [notice(1)] }, go);
  expect(shown).not.toHaveBeenCalled();
  shown.mockRestore();
});
