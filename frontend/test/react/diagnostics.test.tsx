import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { queryClient } from '../../src/react/query';
import { DiagnosticsPage } from '../../src/react/diagnostics/diagnostics-page';
import { DIAGNOSTICS_KEY, type DiagnosticReport } from '../../src/react/diagnostics/diagnostics';
import { ScrapingExport } from '../../src/react/diagnostics/scraping-export';
import { buttonNamed, click, fetchMock, linkNamed, mount, settle, type } from './render';

notifyManager.setScheduler(notify => notify());
afterEach(() => queryClient.clear());

it('Scrape export starts a task by code and keeps the server failure reason', async () => {
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => options?.method === 'POST'
    ? new Response(JSON.stringify({ detail: 'Enter valid codes, up to 20 at a time' }), { status: 400 })
    : new Response(JSON.stringify({ status: 'idle' })));
  vi.stubGlobal('fetch', fetch);
  const host = await mount(<QueryClientProvider client={queryClient}><ScrapingExport /></QueryClientProvider>);
  const input = host.querySelector('input')!;
  await type(input, 'ABC-123, DEF-456');
  await click(buttonNamed('Export scrape records', host)!);
  await settle();
  const request = fetch.mock.calls.find(([, options]) => options?.method === 'POST')!;
  expect(request[0]).toBe('/api/diagnostics/exports');
  expect(JSON.parse(String(request[1]?.body))).toEqual({ kind: 'scraping', codes: 'ABC-123, DEF-456' });
  expect(host.textContent).toContain('Scrape recordsExport video profiles, source values, and performer, label, and series attribution for debugging scraping errors.Problem codes (optional)Separate multiple codes with commas, up to 20; leave empty to export recent videos.Export scrape recordsThe submission was invalid; check the input and retry.');
  expect(buttonNamed('Export scrape records', host)?.getAttribute('aria-busy')).not.toBe('true');
});

it('Scrape records show background progress and support canceling', async () => {
  const fetch = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/cancel')
    ? { status: 'cancelled', job_id: 'export', kind: 'scraping' }
    : { status: 'running', job_id: 'export', kind: 'scraping', stage: 'Organize source snapshot', done: 2, total: 8 })));
  vi.stubGlobal('fetch', fetch);
  const host = await mount(<QueryClientProvider client={queryClient}><ScrapingExport /></QueryClientProvider>);
  await settle();
  expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('2');
  expect(host.querySelector('[data-task-progress]')?.getAttribute('data-task-progress')).toBe('embedded');
  expect((buttonNamed('Export scrape records', host) as HTMLButtonElement).disabled).toBe(true);
  await click(buttonNamed('Cancel export', host));
  await settle();
  expect(host.textContent).toContain('Export canceled');
  expect(host.querySelector('[role="progressbar"]')).toBeNull();
  expect(fetch).toHaveBeenCalledWith('/api/diagnostics/exports/export/cancel', expect.objectContaining({ method: 'POST' }));
});
const data = (): DiagnosticReport => ({ version: 'test', status: 'warning', checks: {
  media_mounts: { label: 'Media mounts', status: 'warning', reason: 'Source does not exist', action: 'Check media directories', target: '/settings/library', details: {} },
  security: { label: 'Access security', status: 'warning', reason: 'Password not enabled', action: 'Turn on the password', target: '/settings/library', details: {} },
  data_root: { label: 'Data directory', status: 'failed', reason: 'No permission', action: 'Adjust permissions', target: null, details: {} },
}, library: { issue_at: null, groups: {
  duration: { label: 'Missing duration', count: 2, status: 'ok', truncated: false, items: [
    { id: 1, code: 'ABC-123', title: 'Video A', name: 'a.mp4', path: 'R:\\Media\\a.mp4', location: 'local', duration: null, size: 1024 },
    { id: 2, code: null, title: 'Video B', name: 'b.mp4', path: 'R:\\Media\\b.mp4', location: 'local', duration: null, size: 2048 },
  ] },
  cover: { label: 'Missing cover', count: 0, status: 'ok', truncated: false, items: [] },
} }, sources: [{ source: 'javdb', label: 'javdb', status: 'unknown', reason: 'Current parse status unavailable', last_success_at: null, cooldown_until: null }] });
async function open(report = data()) {
  queryClient.setQueryData(DIAGNOSTICS_KEY, report);
  const props = { openItem: vi.fn(), receipt: vi.fn() };
  const host = await mount(<QueryClientProvider client={queryClient}><DiagnosticsPage {...props} /></QueryClientProvider>);
  return { host, props };
}
it('Diagnostics jump to the exact config section; system permission items show actions only', async () => {
  const { host } = await open();
  expect(linkNamed('Open Libraries and intake', host)?.getAttribute('href')).toBe(undefined);
  expect(linkNamed('Open network and access', host)?.getAttribute('href')).toBe('/settings/network');
  expect(buttonNamed('Open Libraries and intake', host)).toBeNull();
  const root = [...host.querySelectorAll('h3')].find(node => node.textContent === 'Data directory')!.parentElement!.parentElement!;
  expect(root.textContent).toContain('Adjust permissions');
  expect(root.querySelector('button, a')).toBeNull();
  expect(host.textContent).toContain('Current parse status unavailable');
});
it('Expands the video table and copies identifiable info; zero results have their own empty state', async () => {
  const clipboard = vi.fn<(text: string) => Promise<void>>(async () => {});
  vi.stubGlobal('navigator', { clipboard: { writeText: clipboard } });
  const { host, props } = await open();
  await click(host.querySelector('summary'));
  await click(buttonNamed('Video A', host));
  expect(props.openItem).toHaveBeenCalledWith(1);
  await click(buttonNamed('Copy the current list', host));
  await settle();
  expect(clipboard.mock.calls[0][0]).toContain('Video A\tABC-123\tA.mp4\tLocal\tR:\\Media\\A.mp4');
  expect(clipboard.mock.calls[0][0]).toContain('Video Beta\t\tBeta.mp4\tLocal\tR:\\Media\\Beta.mp4');
  expect(host.textContent).toContain('Unrecognized');
  expect(props.receipt).toHaveBeenCalledWith('List copied');
  expect(host.querySelector('[data-empty-state]')?.textContent).toContain('The list is empty');
});
it('Failed requests keep the reason and a retry entry', async () => {
  vi.stubGlobal('fetch', fetchMock(403, { detail: 'Please open system diagnostics on the computer running Peach' }));
  const props = { openItem: vi.fn(), receipt: vi.fn() };
  const host = await mount(<QueryClientProvider client={queryClient}><DiagnosticsPage {...props} /></QueryClientProvider>);
  await settle();
  expect(host.textContent).toContain('Reading diagnostics failed');
  expect(host.textContent).toContain('Download diagnostics reportExport progress not fetchedRead againReading diagnostics failedThis device does not have permission for this action. Do it on the computer running Peach.Check againScrape recordsExport video profiles, source values, and performer, label, and series attribution for debugging scraping errors.Problem codes (optional)Separate multiple codes with commas, up to 20; leave empty to export recent videos.Export scrape recordsExport progress not fetchedRead again');
  expect(buttonNamed('Check again', host)).not.toBeNull();
});
it('The exception check leads the first section, other checks expand, and nothing duplicates', async () => {
  const report = data();
  report.checks.database = { label: 'Database', status: 'ok', reason: 'Readable', action: '', target: null, details: {} };
  const { host } = await open(report);
  const priority = host.querySelector('section[aria-label="Needs attention · 3 items"]');
  expect(host.querySelector('section')).toBe(priority);
  expect([...priority!.querySelectorAll('h3')].map(node => node.textContent)).toEqual(['Media mounts', 'Access security', 'Data directory']);
  for (const check of Object.values(report.checks)) {
    expect([...host.querySelectorAll('h3,h4')].filter(node => node.textContent === check.label)).toHaveLength(1);
  }
  const summary = [...host.querySelectorAll('summary')].find(node => node.textContent === 'Other checks · 1 item');
  expect(summary?.getAttribute('aria-expanded')).toBe(undefined);
  await click(summary!);
  expect(summary?.getAttribute('aria-expanded')).toBe('true');
  expect(summary?.parentElement?.textContent).toContain('Database');
});
it('The restore action\'s name matches its actual target', async () => {
  const report = data();
  report.checks.security.target = '/settings/network';
  report.checks.ffmpeg = { label: 'Media tools', status: 'warning', reason: 'FFmpeg missing', action: 'Install tools', target: '/settings/maintenance', details: {} };
  report.checks.tasks = { label: 'Background tasks', status: 'warning', reason: 'Some tasks failed', action: 'View the reason', target: '/tasks', details: {} };
  const { host } = await open(report);
  expect(linkNamed('Open network and access', host)?.getAttribute('href')).toBe(undefined);
  expect(linkNamed('Open app and maintenance', host)?.getAttribute('href')).toBe('/settings/maintenance');
  expect(linkNamed('View task', host)?.getAttribute('href')).toBe('/tasks');
  expect(linkNamed('Open sources and credentials', host)?.getAttribute('href')).toBe('/sources');
});

it('The header\'s diagnostic-report progress keeps its own box, in the same row as re-check', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.startsWith('/api/diagnostics/exports')
    ? { status: 'running', kind: 'support', job_id: 'report', stage: 'Collection log', done: 1, total: 4 }
    : data()))));
  const { host } = await open();
  await settle();
  const report = host.querySelector('[data-guide-target="report"]')!;
  expect(report.querySelector('[data-task-progress]')?.getAttribute('data-task-progress')).toBe('framed');
  expect(buttonNamed('Cancel export', report)?.parentElement).toBe(buttonNamed('Check again', report)?.parentElement);
});

it('Diagnostic reports attach the browser environment at startup, and artifacts use direct download links', async () => {
  const create = vi.spyOn(URL, 'createObjectURL');
  const fetch = vi.fn(async (_url: string, options?: RequestInit) => new Response(JSON.stringify(options?.method === 'POST'
    ? { status: 'complete', kind: 'support', job_id: 'report', bytes: 2048,
      download_url: '/api/diagnostics/exports/report/download' }
    : { status: 'idle' })));
  vi.stubGlobal('fetch', fetch);
  const { host } = await open();
  await click(buttonNamed('Download diagnostics report', host));
  await settle();
  const request = fetch.mock.calls.find(([, options]) => options?.method === 'POST')!;
  expect(request[0]).toBe('/api/diagnostics/exports');
  const header = new Headers(request[1]?.headers).get('X-Peach-Browser-Diagnostics')!;
  const bytes = Uint8Array.from(atob(header), value => value.charCodeAt(0));
  expect(JSON.parse(new TextDecoder().decode(bytes)).native_codecs).toHaveProperty('h264');
  expect(create).not.toHaveBeenCalled();
  expect(linkNamed('Download the generated file', host)?.getAttribute('href')).toBe('/api/diagnostics/exports/report/download');
});
