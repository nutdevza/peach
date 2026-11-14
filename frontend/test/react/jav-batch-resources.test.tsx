import { QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { JavBatchResources } from '../../src/react/jav/jav-batch-resources';
import { queryClient } from '../../src/react/query';
import type { Discovery } from '../../src/react/jav/jav';
import { buttonNamed, click, mount, settle } from './render';

notifyManager.setScheduler(notify => notify());
afterEach(() => { queryClient.clear(); localStorage.clear() });
const works = [1, 2].map(id => ({ id, code: `DEMO-00${id}`, title: `Video ${id}` } as Discovery));

it('Bulk search fetches resources code by code, reusing the download configuration; viewing never submits a download by itself', async () => {
  const fetcher = vi.fn(async (url: string, _init?: RequestInit) => ({ ok: true, status: 200, json: async () =>
    url.startsWith('/api/downloads') ? { available: true, providers: [], tasks: [] }
      : { state: 'ready', items: [], error: '', checked_at: null } }));
  vi.stubGlobal('fetch', fetcher);
  const close = vi.fn();
  await mount(<QueryClientProvider client={queryClient}><JavBatchResources items={works} close={close} readOnly={false} receipt={vi.fn()} /></QueryClientProvider>);
  await settle();
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([
    '/api/downloads?limit=50', '/api/jav/resources?code=DEMO-001', '/api/jav/resources?code=DEMO-002',
  ]));
  expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
  expect(document.querySelectorAll('[data-want-magnets]')).toHaveLength(2);
  await click(document.querySelector('button[aria-label="Close bulk resource search"]'));
  expect(close).toHaveBeenCalledOnce();
});

it('When the download configuration fails it shows the reason; the resource query still returns independently', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: !url.startsWith('/api/downloads'),
    status: url.startsWith('/api/downloads') ? 503 : 200,
    json: async () => url.startsWith('/api/downloads') ? { error: 'The service is temporarily unavailable' }
      : { state: 'ready', items: [], error: '', checked_at: null } })));
  await mount(<QueryClientProvider client={queryClient}><JavBatchResources items={[works[0]!]} close={vi.fn()} readOnly={false} receipt={vi.fn()} /></QueryClientProvider>);
  await settle();
  expect(document.body.textContent).toContain('Download configuration not obtained');
  expect(document.body.textContent).toContain('Find resources for the selection · 1 部\'Download configuration not obtained:\'The service is temporarily unavailableDEMO-001Video 1Resource linksQuery againNo resource links found yet.');
  expect(buttonNamed('Add download')).toBeNull();
});
