import { act } from 'react';
import { QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { queryClient } from '../../src/react/query';
import { WantMagnets, type MagnetCandidate } from '../../src/react/wants/want-magnets';
import type { Want } from '../../src/react/wants/wants';
import { WANTS_KEY, type WantsData } from '../../src/react/wants/wants';
import { buttonNamed, click, mount, mountRoot, pending, settle } from './render';
import { cachedResources, rememberResources, resourceLifetime } from '../../src/react/wants/resource-cache';
import { resourceNotice, resourceSize } from '../../src/react/wants/resource-display';

notifyManager.setScheduler((notify) => notify());
afterEach(() => { queryClient.clear(); localStorage.clear() });
const candidate: MagnetCandidate = {
  id: 'magnet:abc', protocol: 'magnet', info_hash: 'abc', uri: 'magnet:?xt=urn:btih:abc',
  name: 'DEMO-001 HD', size: '4 GB', files: '2 files', date: '2026-10-01', attributes: ['Subtitles', 'HD'],
  source: 'JavDB', source_url: 'https://javdb.com/v/demo', origins: ['https://javdb.com/v/demo'],
};
async function open(items = [candidate], readOnly = false, ok = true) {
  vi.stubGlobal('IntersectionObserver', undefined);
  const toast = vi.fn();
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ({ ok: true, status: 200,
    json: async () => init?.method === 'POST'
      ? { ok, outcome: ok ? 'submitted' : 'failed', task: { failure_detail: 'Remote rejected' } }
      : { state: 'ready', items, error: '', checked_at: null },
  }));
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<QueryClientProvider client={queryClient}>
    <WantMagnets want={{ id: 1, code: 'DEMO-001', title: 'Demo video' } as Want} readOnly={readOnly}
      downloads={{ available: true, providers: [{ key: '115', label: '115', configured: true, target: '/Downloads' }], tasks: [] }}
      provider="115" toast={toast} />
  </QueryClientProvider>);
  await settle();
  return { host, fetcher, toast };
}
it('Queries automatically, shows source, size, date, and properties, and adds straight to the chosen cloud download folder', async () => {
  const { host, fetcher, toast } = await open();
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/wants/magnets?id=1');
  for (const text of ['4 GB', '2 files', '2026-10-01', 'Subtitles', 'JavDB']) expect(host.textContent).toContain(text);
  expect(host.querySelector('[data-resource-facts]')?.textContent).not.toContain('HD');
  expect([...host.querySelectorAll('[data-resource-actions] button, [data-resource-actions] a')].map(node => node.textContent)).toEqual(['Link sources', 'Copy link', 'Add download']);
  await click(buttonNamed('Add download', host));
  await settle();
  const writes = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(JSON.parse(String(writes[0]?.[1]?.body))).toEqual({ magnet: candidate.uri, provider: '115', target: '/Downloads',
    code: 'DEMO-001', title: 'Demo video', origin: 'wishlist:1' });
  expect(buttonNamed('Added', host)?.disabled).toBe(true);
  expect(toast).toHaveBeenCalledWith('Download added: DEMO-001 HD');
});
it('ed2k and web links can be copied but cannot be submitted as magnet links', async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const ed2k = { ...candidate, id: 'ed2k:abc:12', protocol: 'ed2k' as const, uri: 'ed2k://|file|demo|12|abc|/' };
  const { host } = await open([ed2k]);
  expect(buttonNamed('Add download', host)).toBeNull();
  expect(buttonNamed('Copy link', host)?.className).not.toContain('bg-button-primary');
  await click(buttonNamed('Copy link', host));
  expect(writeText).toHaveBeenCalledWith(ed2k.uri);
});
it('While a submit waits the button stays focusable and repeat clicks are blocked', async () => {
  const { host, fetcher, toast } = await open();
  const held = pending<{ ok: boolean; outcome: string; task: { failure_detail: string } }>();
  fetcher.mockImplementationOnce(async () => ({ ok: true, status: 200, json: () => held.answer }));
  const add = buttonNamed('Add download', host)!;
  await click(add);
  await click(add);
  expect(add.getAttribute('aria-busy')).toBe('true');
  expect(add.disabled).toBe(false);
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
  expect(toast).not.toHaveBeenCalled();
  await held.release({ ok: true, outcome: 'submitted', task: { failure_detail: '' } });
  await settle();
  expect(buttonNamed('Added', host)?.disabled).toBe(true);
});
it('Read-only blocks submitting; a remote failure stays on the card and keeps the retry', async () => {
  const reader = await open([candidate], true);
  expect(buttonNamed('Add download', reader.host)?.disabled).toBe(true);
  const writer = await open([candidate], false, false);
  await click(buttonNamed('Add download', writer.host));
  await settle();
  expect(writer.host.textContent).toContain('Resource links · 1Query againAction not completedThe operation did not finish; please retry. If it keeps failing, check the tray log.MagnetsDEMO-001 HDJavDB4 GB2 files2026-10-01SubtitlesLink sourcesCopy linkAdd download');
  expect(buttonNamed('Added', writer.host)).toBeNull();
  expect(writer.toast).not.toHaveBeenCalled();
});

it('More resources start collapsed with per-protocol marks', async () => {
  const { host } = await open(Array.from({ length: 8 }, (_, index) => ({ ...candidate, id: String(index) })));
  const more = host.querySelector('details')!;
  expect(more.open).toBe(false);
  expect(host.querySelector('summary')?.textContent).toContain('More resources (5)');
  expect(host.querySelector('[data-resource-protocol="magnet"] svg')).not.toBeNull();
  await click(more.querySelector('summary'));
  expect(more.open).toBe(true);
});

it('The to-find list queries several sources and never adopts quick-add\'s single-source persistent cache', async () => {
  rememberResources('DEMO-001', { state: 'ready', items: [{ ...candidate, source: 'manko.fun' }], error: '', checked_at: null });
  const { host, fetcher } = await open([candidate, { ...candidate, id: 'alternate', source: 'sukebei' }]);
  expect(fetcher).toHaveBeenCalled();
  expect(host.textContent).toContain('JavDB');
  expect(host.textContent).toContain('sukebei');
});

it('When the source gives no size, the row still renders normally and the notice shows no missing value', async () => {
  const { host } = await open([{ ...candidate, size: undefined as unknown as string }]);
  expect(host.querySelector('[data-resource-facts]')?.textContent).toContain('Unknown size');
  expect([...host.querySelectorAll('[title]')].map(node => node.getAttribute('title')).join('|')).not.toContain('undefined');
});
it('The ED2K type uses text, and byte sizes are shown by library convention', async () => {
  const { host } = await open([{ ...candidate, protocol: 'ed2k', size: '27,311,519,717 B' }]);
  expect(host.textContent).toContain('ED2K');
  expect(host.textContent).toContain('25.4 GB');
  expect(buttonNamed('Add download', host)).toBeNull();
  expect(resourceSize('1.61 GB')).toBe('1.61 GB');
  expect(resourceSize('')).toBe('Unknown size');
  expect(resourceSize('123')).toBe('Unknown size');
  expect(resourceNotice('More comments need JavDB VIP or the official app.')).toBe('More comments need JavDB VIP or the official app.');
});

it('Video details query resources from their own source, and the want cache never substitutes for public source results', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  rememberResources('DEMO-001', { state: 'ready', items: [candidate], error: '', checked_at: null });
  const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200,
    json: async () => ({ state: 'ready', items: [], error: '', checked_at: null }) }));
  vi.stubGlobal('fetch', fetcher);
  const host = await mount(<QueryClientProvider client={queryClient}><WantMagnets
    want={{ id: 0, code: 'DEMO-001', title: 'Example video', release_date: '2010-01-01' }}
    queryUrl="/api/jav/resources?code=DEMO-001" readOnly provider="" toast={vi.fn()} /></QueryClientProvider>);
  await settle();
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/jav/resources?code=DEMO-001');
  expect(host.textContent).toContain('No resource links found yet');
  await click(buttonNamed('Query again', host));
  await settle();
  expect(fetcher.mock.calls[1]?.[0]).toBe('/api/jav/resources?code=DEMO-001&refresh=1');
});

it('The one-month release boundary, month end, and cache lifetime agree', () => {
  const now = Date.parse('2026-10-03T12:00:00Z');
  expect(resourceLifetime('2026-09-03', now)).toBe(86_400_000);
  expect(resourceLifetime('2026-09-02', now)).toBe(Infinity);
  expect(resourceLifetime(null, now)).toBe(86_400_000);
  expect(resourceLifetime('2026-01-31', Date.parse('2026-02-28T12:00:00Z'))).toBe(86_400_000);
});

it('The resource cache accepts only displayable fields and complete query results', () => {
  const saved = Date.now();
  const result = { state: 'ready', items: [candidate], error: '', checked_at: null };
  const { protocol: _protocol, attributes: _attributes, ...incomplete } = candidate;
  localStorage.setItem('peach.want-resources.v2', JSON.stringify([
    { code: 'DEMO-001', saved, result: { ...result, items: [{ ...incomplete, size: 1024 }] } },
    { code: 'DEMO-002', saved, result: { ...result, items: [], warnings: ['Source not fetched'] } },
    { code: 'DEMO-003', saved, result },
  ]));
  expect(cachedResources('DEMO-001', null)).toBeUndefined();
  expect(cachedResources('DEMO-002', null)).toBeUndefined();
  expect(cachedResources('DEMO-003', null)?.result.items).toEqual([candidate]);
});

it('Resource queries never reuse the persistent cache of other rule versions', () => {
  const result = { state: 'ready' as const, items: [candidate], error: '', checked_at: null };
  localStorage.setItem('peach.want-resources.v1', JSON.stringify([{ code: 'DEMO-001', saved: Date.now(), result }]));
  expect(cachedResources('DEMO-001', null)).toBeUndefined();
  rememberResources('DEMO-001', result);
  expect(cachedResources('DEMO-001', null)?.result.items).toEqual([candidate]);
});

it('After page and query client rebuilds the persistent cache is reused, and manual queries force a source refresh', async () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  const want = { id: 1, code: 'DEMO-001', release_date: '2020-01-01' } as Want;
  rememberResources(`all-sources:${want.code!}`, { state: 'ready', items: [candidate], error: '', checked_at: null });
  const fetcher = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () =>
    ({ state: 'ready', items: [candidate], error: '', checked_at: null }) }));
  vi.stubGlobal('fetch', fetcher);
  const render = () => <QueryClientProvider client={queryClient}><WantMagnets want={want} readOnly
    provider="" toast={() => {}} /></QueryClientProvider>;
  const first = await mountRoot(render());
  await settle();
  await first.unmount();
  queryClient.clear();
  const second = await mountRoot(render());
  await settle();
  expect(second.host.textContent).toContain(candidate.name);
  expect(fetcher).not.toHaveBeenCalled();
  await click(buttonNamed('Query again', second.host));
  await settle();
  expect(fetcher.mock.calls[0]?.[0]).toBe('/api/wants/magnets?id=1&refresh=1');
  expect(cachedResources(`all-sources:${want.code!}`, want.release_date)?.result.items).toHaveLength(1);
});

it('Expired in-memory caches re-query as their card enters the viewport', async () => {
  let reveal: (() => void) | undefined;
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
      reveal = () => callback([{ isIntersecting: true }]);
    }
    observe() {}
    disconnect() {}
  });
  const want = { id: 1, code: 'DEMO-001', release_date: null } as Want;
  const result = { state: 'ready', items: [candidate], error: '', checked_at: null };
  queryClient.setQueryData(['want-magnets', want.id, want.code], result,
    { updatedAt: Date.now() - 366 * 86_400_000 });
  const fetcher = vi.fn(async () => ({ ok: true, status: 200, json: async () => result }));
  vi.stubGlobal('fetch', fetcher);
  await mount(<QueryClientProvider client={queryClient}><WantMagnets want={want} readOnly
    provider="" toast={() => {}} /></QueryClientProvider>);
  await settle();
  expect(fetcher).not.toHaveBeenCalled();
  await act(async () => reveal!());
  await settle();
  expect(fetcher).toHaveBeenCalledOnce();
});

it('Magnet updates fetched the list\'s filter state, and ED2K never counts as a magnet', async () => {
  queryClient.setQueryData<WantsData>(WANTS_KEY, { items: [{ id: 1 } as Want], counts: {} as WantsData['counts'], scraping: false });
  await open();
  expect(queryClient.getQueryData<WantsData>(WANTS_KEY)?.items[0]?.has_magnets).toBe(true);
  queryClient.removeQueries({ queryKey: ['want-magnets'] });
  localStorage.clear();
  await open([{ ...candidate, protocol: 'ed2k', uri: 'ed2k://|file|demo|12|abc|/' }]);
  expect(queryClient.getQueryData<WantsData>(WANTS_KEY)?.items[0]?.has_magnets).toBe(false);
});
