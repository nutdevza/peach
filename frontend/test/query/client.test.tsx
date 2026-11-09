/* The site-wide single QueryClient (src/query/): Application and Providers both import the shared source directly, reading and writing one cache. */
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';

import { queryClient } from '@peach/query';

import { queryClient as sharedQueryClient } from '../../src/query/client';
import { Providers } from '../../src/react/providers';
import { queryClient as reactQueryClient } from '../../src/react/query';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => { document.body.innerHTML = '' });

it('useQueryClient() inside a React island returns the shell\'s own client', async () => {
  let seen: QueryClient | null = null;
  function Probe() { seen = useQueryClient(); return null }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(<Providers><Probe /></Providers>) });
  expect(seen).toBe(queryClient);
  expect(reactQueryClient).toBe(queryClient);
  expect(sharedQueryClient).toBe(queryClient);
  await act(async () => { root.unmount() });
});

it('The copy the shell writes is read directly inside the island under the same key', () => {
  queryClient.setQueryData(['probe'], { n: 1 });
  expect(reactQueryClient.getQueryData(['probe'])).toEqual({ n: 1 });
  queryClient.removeQueries({ queryKey: ['probe'] });
});

it('The default option never retries, remounting only refetches stale queries, and going offline still sends', () => {
  const queries = queryClient.getDefaultOptions().queries!;
  expect(queries).toMatchObject({
    networkMode: 'always', retry: 0, refetchOnWindowFocus: false, retryOnMount: false, gcTime: Infinity,
  });
  const query = queryClient.getQueryCache().build(queryClient, { queryKey: ['mount-policy'] as readonly unknown[] });
  const refetch = queries.refetchOnMount;
  expect(typeof refetch).toBe('function');
  if (typeof refetch !== 'function') throw new Error('The mount policy never judged by query state');
  expect(refetch(query)).toBe(false);
  query.invalidate();
  expect(refetch(query)).toBe(true);
  queryClient.removeQueries({ queryKey: ['mount-policy'] });
});
