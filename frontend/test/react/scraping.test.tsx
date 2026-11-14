/* Sources and credentials page behavior: what is submitted, what is cleared, how results are reported, and how long to follow the background run.
 *
 * Appearance (the footer's three-key hierarchy, source external links' `rel`) is a design decision asserted by `frontend/e2e/design-*.test.ts`
 * reading `getComputedStyle`; here we only check structure, text, and requests. */
import { act } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { queryClient } from '../../src/react/query';
import { linkHost, networkOptions, ScrapingPage } from '../../src/react/scraping/scraping-page';
import { prefetchScraping } from '../../src/react/scraping/scraping';
import type {
  AmaneBridge, Check, CheckAllJob, CoverJob, ReportedCheck, Source,
} from '../../src/react/scraping/scraping';

import {
  buttonNamed, click, mount, mountRoot, section, settle, submit, type,
} from './render';

// The client is a module-level singleton (all React roots share one); without clearing between test cases they feed each other data.
afterEach(() => queryClient.clear());

/* Query dispatches updates through the real `setTimeout(0)` it captured itself, which the fake clock cannot advance: after advancing the clock
   the assertions still see the previous frame's DOM. The case dispatches immediately instead. */
notifyManager.setScheduler((notify) => notify());

const source = (overrides: Partial<Source> = {}): Source => ({
  source: 'javbus',
  label: 'JavBus',
  login: 'https://www.javbus.com/',
  accepts_cookie: true,
  network: 'peach',
  cookie_saved: false,
  browser: false,
  ...overrides,
});

interface Reply {
  ok?: boolean;
  status?: number;
  body: unknown;
}

/** Responds by "method + path". Requests the test did not stub fail on the spot instead of silently returning an empty object.
 *  Responding with a still-pending Promise means this request is still in flight. */
function serve(handlers: Record<string, (body: never) => Reply | Promise<Reply>>) {
  const calls: { path: string; method: string; body: unknown }[] = [];
  const fetcher = vi.fn(async (path: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, method, body });
    const handler = handlers[`${method} ${path}`];
    if (!handler) throw new Error(`The test stubs no data for ${method} ${path}`);
    const reply = await handler(body as never);
    return { ok: reply.ok !== false, status: reply.status ?? 200, json: async () => reply.body };
  });
  vi.stubGlobal('fetch', fetcher);
  return { calls, fetcher };
}

/** 依次回这几份任务快照，最后一份之后一直回它。抓封面与全部检查两种任务共用。 */
function coverStates<T extends CoverJob | CheckAllJob>(...states: T[]) {
  let at = 0;
  return () => {
    const state = states[Math.min(at, states.length - 1)]!;
    at += 1;
    return { body: state };
  };
}

const page = (toast: (message: string) => void) => (
  <QueryClientProvider client={queryClient}><ScrapingPage toast={toast} /></QueryClientProvider>
);

/** Runs the real first-screen path: prefetch lands in the cache first, then mount. */
async function open(handlers: Record<string, (body: never) => Reply | Promise<Reply>>) {
  const toast = vi.fn();
  const served = serve(handlers);
  await prefetchScraping(new AbortController().signal).catch(() => {});
  return { ...served, toast, host: await mount(page(toast)) };
}

/** The facts on the amane bridge card: installed, with no rebuild currently running. */
const BRIDGE: AmaneBridge = {
  repository: 'https://github.com/sqzw-x/amane', license: 'GPL-3.0', bundled: true, problem: '',
  revision: '79ecfa763cc786318e1964a3d7f4e244a7d5c96d', version: '0.16.1', installed: true,
  installed_version: '0.16.1',
  python: 'T:/tools/amane-bridge/.venv/Scripts/python.exe',
  sites: [{ source: 'fc2ppvdb', label: 'FC2PPVDB' }, { source: 'avsox', label: 'AVSOX' }],
  job: { status: 'idle' },
};

/** A first screen with a single source, no background tasks, and the amane bridge already installed. */
const quiet = (overrides: Partial<Source> = {}) => ({
  'GET /api/scraping': () => ({ body: { sources: [source(overrides)] } }),
  'GET /api/scraping/cover': () => ({ body: { status: 'idle' } }),
  'GET /api/scraping/check-all': () => ({ body: { status: 'idle' } }),
  'GET /api/scraping/amane-bridge': () => ({ body: BRIDGE }),
  'GET /api/custom-metadata': () => ({ body: { items: [] } }),
});
/** 首屏独立读取的来源与任务数据；各读取仅发一次。 */
const FIRST_SCREEN = ['/api/scraping', '/api/scraping/cover', '/api/scraping/check-all',
  '/api/scraping/amane-bridge', '/api/custom-metadata'];

/** 全部检查里的一项结果：口径与中文名同 `source_preflight.OUTCOMES`。 */
const reported = (outcome: ReportedCheck['outcome'], outcome_label: string, message = ''): ReportedCheck => ({
  label: 'Source page', ok: outcome === 'ok', outcome, outcome_label, ...(message ? { message } : {}),
});

const password = (root: ParentNode) => root.querySelector<HTMLInputElement>('input[type=password]');
const radio = (value: string) => document.querySelector<HTMLInputElement>(`input[type=radio][value="${value}"]`);
/** The poll is a timer inside the component, so advancing the clock triggers a rerender; it must be advanced inside act. */
const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) });

it('The first screen paints sources and tasks from the prefetch cache; mounting issues no duplicate request', async () => {
  const { calls, host } = await open(quiet());
  expect(calls.map((call) => call.path).sort()).toEqual([...FIRST_SCREEN].sort());
  expect(section(host, 'JavBus')).not.toBeNull();
  expect(section(host, 'HD cover')).not.toBeNull();
  const bridge = section(host, 'amane');
  expect(bridge).not.toBeNull();
  expect(bridge?.textContent).toContain('Installed version0.16.1');
  expect(bridge?.textContent).toContain('FC2PPVDB, AVSOX');
  expect(bridge?.textContent).toContain('Peach automatically prepares the pinned 0.16.1 version');
  expect(bridge?.textContent).toContain('used directly when the installer already ships a working environment');
  expect(bridge?.textContent).toContain('Installed version0.16.1');
  expect(bridge?.textContent).toContain('FC2PPVDB, AVSOX');
  expect(bridge?.textContent).toContain('Peach automatically prepares the pinned 0.16.1 version');
  expect(bridge?.textContent).toContain('used directly when the installer already ships a working environment');
  expect(bridge?.textContent).toContain('Installed version0.16.1');
  expect(bridge?.textContent).toContain('FC2PPVDB, AVSOX');
  expect(bridge?.textContent).toContain('Peach automatically prepares the pinned 0.16.1 version');
  expect(bridge?.textContent).toContain('used directly when the installer already ships a working environment');
  expect(buttonNamed('Reinstall', bridge!)).not.toBeNull();
  // The connection method is a BoardUI Select, which paints a button; the native select is the one React Aria hides behind
  // The one the form reads its value from, not how this row looks.
  expect(host.querySelector('[aria-haspopup=listbox]')?.textContent?.trim()).toBe('Peach proxy');
  expect(host.querySelector<HTMLAnchorElement>('a[href="/settings/library#peachProxy"]')?.textContent)
    .toContain('Configure Peach proxy');
  expect(host.querySelector<HTMLAnchorElement>('a[href="https://www.javbus.com/"]')?.target).toBe('_blank');
});

it('Sources using the local browser only explain how to pass verification and never render a Cookie input', async () => {
  const { host } = await open(quiet({ source: 'fc2ppvdb', label: 'FC2PPV-DB', browser: true }));
  const card = section(host, 'FC2PPV-DB');
  expect(card?.textContent).toContain('FC2PPV-DBwww.javbus.comConnection methodPeach proxy Peach proxyDirect connectionConfigure Peach proxyHuman verification is completed automatically by the local browser; a window pops up when a click is needed. No cookies are needed on this machine.Check connectionSave');
  expect(card?.textContent).toContain('FC2PPV-DBwww.javbus.comConnection methodPeach proxy Peach proxyDirect connectionConfigure Peach proxyHuman verification is completed automatically by the local browser; a window pops up when a click is needed. No cookies are needed on this machine.Check connectionSave');
  expect(password(host), 'The browser carries its own Cookies; this cell should not appear').toBeNull();
  expect(card?.textContent).not.toContain('Provide cookies by either method');
  expect(host.querySelector('[aria-haspopup=listbox]'), 'The connection method stays the user\'s choice, with the browser switching exits by it').not.toBeNull();
});

it('Saving clears the secret input, the list swaps in the server\'s returned row in place, and undo becomes available with it', async () => {
  const { calls, host, toast } = await open({
    ...quiet(),
    'POST /api/scraping/settings': () => ({ body: { saved: source({ cookie_saved: true }) } }),
  });
  await type(password(host), 'session=fixture');
  await submit(section(host, 'JavBus'));
  await settle();

  expect(calls[FIRST_SCREEN.length]).toEqual({
    path: '/api/scraping/settings',
    method: 'POST',
    body: {
      source: 'javbus', network: 'peach', cookie: 'session=fixture', cookies_text: '', revoke: false,
    },
  });
  expect(password(host)?.value, 'After the save returns, the page no longer keeps the copy just submitted').toBe('');
  expect(host.textContent).toContain('Login validity pending verification');
  expect(buttonNamed('Revoke Cookie', host)).not.toBeNull();
  expect(toast).toHaveBeenCalledWith('Source settings saved');
  expect(calls.filter((call) => call.path === '/api/scraping' && call.method === 'GET'),
    'Saving replaces one row in the list; it does not refetch the whole page for it').toHaveLength(1);
});

it('Undo takes the same write path, with the receipt saying undo', async () => {
  const { calls, host, toast } = await open({
    ...quiet({ cookie_saved: true }),
    'POST /api/scraping/settings': () => ({ body: { saved: source({ cookie_saved: false }) } }),
  });
  await click(buttonNamed('Revoke Cookie', host));
  await settle();
  expect(calls[FIRST_SCREEN.length]?.body).toMatchObject({ source: 'javbus', revoke: true });
  expect(toast).toHaveBeenCalledWith('Cookies revoked');
  expect(buttonNamed('Revoke Cookie', host), 'After undoing, this key has nothing left to undo').toBeNull();
});

it('On save failure the reason stays in the card, with the list and just-entered content untouched', async () => {
  const { host, toast } = await open({
    ...quiet(),
    'POST /api/scraping/settings': () => ({ ok: false, status: 400, body: { message: 'The Cookie is not in Netscape format' } }),
  });
  await type(password(host), 'session=fixture');
  await submit(section(host, 'JavBus'));
  await settle();

  expect(host.querySelector('[role=alert]')?.textContent).toContain('The Cookie is not in Netscape format');
  expect(password(host)?.value, 'Clearing input after failure makes people type it all again').toBe('session=fixture');
  expect(buttonNamed('Revoke Cookie', host)).toBeNull();
  expect(toast).not.toHaveBeenCalled();
});

it('Connection results phrase one sentence from the source name and what this hop looked up', async () => {
  const results: Check[] = [
    { label: 'Source page', ok: true, width: 800, height: 538 },
    { label: 'HD image CDN', ok: false, status: 403, message: 'Login required' },
  ];
  const { host } = await open({
    ...quiet(),
    'POST /api/scraping/check': () => ({ body: { results } }),
  });
  await click(buttonNamed('Check connection', host));
  await settle();

  expect(host.querySelector('[role=status] [data-connection-tone="success"]')?.textContent).toBe('Accessible');
  expect(host.querySelector('[role=status]')?.textContent).toContain('AccessibleJavBus HD images: reachable · 800 × 538');
  expect(host.querySelector('[role=alert] [data-connection-tone="error"]')?.textContent).toBe('Connection failed');
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Connection failedJavBus HD images: unreachable. Login required');
});

it('Pick one of the two Cookies: only the one you switch to is submitted, and the other does not even keep its input', async () => {
  const { calls, host } = await open({
    ...quiet(),
    'POST /api/scraping/settings': () => ({ body: { saved: source() } }),
  });
  expect(host.querySelector('input[type=file]')).toBeNull();
  await type(password(host), 'private');
  await click(radio('file'));
  expect(password(host), 'While the paste box is still on the page it submits along').toBeNull();
  expect(host.querySelector('input[type=file]')).not.toBeNull();
  expect(host.textContent).toContain('No file selected');

  await submit(section(host, 'JavBus'));
  await settle();
  expect(calls[FIRST_SCREEN.length]?.body).toMatchObject({ cookie: '', cookies_text: '' });

  await click(radio('paste'));
  expect(password(host)?.value).toBe('');
});

it('An oversized cookie file is blocked on the spot instead of spending a request on it', async () => {
  const { calls, host } = await open(quiet());
  await click(radio('file'));
  const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
  const oversized = new File(['x'.repeat(256 * 1024 + 1)], 'cookies.txt', { type: 'text/plain' });
  Object.defineProperty(input, 'files', { configurable: true, value: [oversized] });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })) });
  await settle();

  expect(host.querySelector('[role=alert]')?.textContent).toBe('The cookie text exceeds 256 KiB');
  expect(host.textContent).toContain('No file selected');
  expect(calls).toHaveLength(FIRST_SCREEN.length);
});

it('Stale results read on the first screen never pose as fresh: nothing paints and no receipt sends', async () => {
  const { host, toast } = await open({
    ...quiet(),
    'GET /api/scraping/cover': () => ({ body: { status: 'complete', result: 'The previous round\'s cover' } }),
  });
  expect(toast).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('The previous round\'s cover');
  expect(host.textContent).not.toContain('Scraping covers');
});

it('Cover scraping follows through to the terminal state: every two seconds while running, one receipt when done, and no more polling after that', async () => {
  vi.useFakeTimers();
  const toast = vi.fn();
  const { calls } = serve({
    ...quiet(),
    'GET /api/scraping/cover': coverStates(
      { status: 'idle' }, { status: 'running' }, { status: 'complete', result: 'Fetched the 1600 x 1077 cover' }),
    'POST /api/scraping/cover': () => ({ body: { status: 'running' } }),
  });
  await prefetchScraping(new AbortController().signal);
  const host = await mount(page(toast));

  await type(host.querySelector<HTMLInputElement>('input[aria-label="Library code"]'), 'ABW-232');
  await click(buttonNamed('Scrape cover', host));
  await settle();
  expect(calls[FIRST_SCREEN.length]).toMatchObject({ path: '/api/scraping/cover', method: 'POST', body: { code: 'ABW-232' } });
  expect(host.textContent).toContain('Scraping covers');

  await tick(2000);
  expect(host.textContent).toContain('Fetched the 1600 x 1077 cover');
  expect(host.textContent).not.toContain('Scraping covers');
  expect(toast).toHaveBeenCalledTimes(1);
  expect(toast).toHaveBeenCalledWith('Fetched the 1600 x 1077 cover');

  const asked = calls.length;
  await tick(60_000);
  expect(calls.length, 'The task already ended; no more backend hits needed').toBe(asked);
  expect(toast).toHaveBeenCalledTimes(1);
});

it('After unmount nothing hits the backend: polling goes with this root', async () => {
  vi.useFakeTimers();
  const { calls } = serve({
    ...quiet(),
    'GET /api/scraping/cover': () => ({ body: { status: 'running' } }),
  });
  await prefetchScraping(new AbortController().signal);
  const mounted = await mountRoot(page(vi.fn()));

  await tick(2000);
  const asked = calls.length;
  expect(asked).toBeGreaterThan(FIRST_SCREEN.length);
  await mounted.unmount();
  await tick(60_000);
  expect(calls.length, 'Polling continued after unmount').toBe(asked);
});

it('All checks advance by the number of checked sources; when done it groups issues by the agreed criteria, receipts once, and refetches sources', async () => {
  vi.useFakeTimers();
  const toast = vi.fn();
  const done: CheckAllJob = {
    status: 'complete', checked: 3, total: 3, failed: 1, elapsed_s: 4.2, completed_at: 1_793_790_000,
    results: [
      { source: 'javbus', label: 'JavBus', results: [reported('ok', 'Connectable')] },
      { source: 'makers', label: '片商官网', results: [reported('skipped', 'Unchecked', '片商官网按番号选择')] },
      { source: 'javdb', label: 'JavDB', results: [reported('auth', '登录或人机验证', '来源返回人机验证页')] },
    ],
  };
  const { calls } = serve({
    ...quiet(),
    'GET /api/scraping/check-all': coverStates(
      { status: 'idle' },
      { status: 'running', checked: 1, total: 3,
        results: [{ source: 'javbus', label: 'JavBus', results: [reported('ok', 'Connectable')] }] },
      done),
    'POST /api/scraping/check-all': () => ({ body: { status: 'running', checked: 0, total: 3, results: [] } }),
  });
  await prefetchScraping(new AbortController().signal);
  const host = await mount(page(toast));
  const card = () => section(host, 'Connectivity check')!;

  await click(buttonNamed('All checks', card()));
  await settle();
  expect(calls[FIRST_SCREEN.length]).toMatchObject({ path: '/api/scraping/check-all', method: 'POST' });
  expect(card().textContent).toContain('Checked 1 / 3 sources');
  expect(card().querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('1');

  await tick(2000);
  expect(card().querySelector('[role=progressbar]')).toBeNull();
  const problems = [...card().querySelectorAll('li')].map((row) => row.textContent);
  expect(problems, '要人去登录的排在不在这里查的片商官网前面').toEqual([
    expect.stringContaining('JavDB'), expect.stringContaining('片商官网'),
  ]);
  expect(problems[0]).toContain('来源返回人机验证页');
  expect(card().textContent).toContain('1 reachable');
  expect(card().textContent).toContain('Took 4.2 s');
  expect(toast).toHaveBeenCalledTimes(1);
  expect(toast).toHaveBeenCalledWith('Check finished, 1 failed');
  expect(calls.filter((call) => call.path === '/api/scraping' && call.method === 'GET'),
    '冷却会变，跑完重读来源列表').toHaveLength(2);
});

it('Leaving the page and returning keeps the previous results of all checks, but sends no receipt', async () => {
  const { host, toast } = await open({
    ...quiet(),
    'GET /api/scraping/check-all': () => ({ body: {
      status: 'complete', checked: 1, total: 1, failed: 1, completed_at: 1_793_790_000,
      results: [{ source: 'javdb', label: 'JavDB', results: [reported('cooldown', '冷却', '来源正在冷却')] }],
    } }),
  });
  const card = section(host, 'Connectivity check')!;
  expect(card.textContent).toContain('冷却');
  expect(card.textContent).toContain('来源正在冷却');
  expect(card.textContent).toContain('Last check');
  expect(toast).not.toHaveBeenCalled();
});

it('amane bridge: checking upstream only fills the "Upstream latest version" row; rebuild runs to the final state and sends one receipt', async () => {
  vi.useFakeTimers();
  const toast = vi.fn();
  const bridgeStates = coverStates({ status: 'idle' }, { status: 'running' },
    { status: 'complete', result: 'The amane bridge was rebuilt at 79ecfa763cc7' });
  const { calls } = serve({
    ...quiet(),
    'GET /api/scraping/amane-bridge': () => ({ body: { ...BRIDGE, job: bridgeStates().body } }),
    'POST /api/scraping/amane-bridge/check': () => ({ body: { ok: true, latest: 'v0.17.0' } }),
    'POST /api/scraping/amane-bridge/rebuild': () => ({ body: { status: 'running' } }),
  });
  await prefetchScraping(new AbortController().signal);
  const host = await mount(page(toast));
  const bridge = section(host, 'amane')!;
  expect(bridge.textContent).toContain('Not checked yet');

  await click(buttonNamed('Check upstream version', bridge));
  await settle();
  expect(calls[FIRST_SCREEN.length]).toMatchObject({ path: '/api/scraping/amane-bridge/check', method: 'POST' });
  expect(bridge.textContent).toContain('v0.17.0');
  expect(bridge.textContent, 'Checking upstream leaves the installed version alone').toContain('Installed version0.16.1');

  await click(buttonNamed('Reinstall', bridge));
  await settle();
  expect(calls[FIRST_SCREEN.length + 1]).toMatchObject({ path: '/api/scraping/amane-bridge/rebuild', method: 'POST' });
  expect(bridge.textContent).toContain('Rebuilding the runtime environment');
  await tick(2000);
  expect(bridge.textContent).toContain('The amane bridge was rebuilt at 79ecfa763cc7');
  expect(toast).toHaveBeenCalledTimes(1);
  expect(toast).toHaveBeenCalledWith('The amane bridge was rebuilt at 79ecfa763cc7');
});

it('amane bridge: when the package is missing the bridge file the card states the reason and the install key disables', async () => {
  const problem = 'The amane bridge file is missing from the installer: C:/Peach/_internal/tools/amane-bridge/pyproject.toml; available after reinstalling Peach';
  const { host } = await open({
    ...quiet(),
    'GET /api/scraping/amane-bridge': () => ({ body: {
      ...BRIDGE, bundled: false, problem, revision: '', version: '', installed: false, installed_version: '',
    } }),
  });
  const bridge = section(host, 'amane')!;
  expect(bridge.textContent).toContain(problem);
  expect(bridge.textContent).not.toContain('Built into Peach');
  expect(buttonNamed('Install', bridge)?.disabled).toBe(true);
});

it('The login external link writes only the host name; unrecognized connection types in the database are listed as-is, and the dropdown never falls to an empty placeholder', () => {
  expect(linkHost('https://www.javbus.com/login?next=%2F')).toBe('www.javbus.com');
  expect(linkHost('Not a URL')).toBe('Not a URL');
  expect(networkOptions('peach').map(([key]) => key)).toEqual(['peach', 'direct']);
  expect(networkOptions('socks-legacy')).toEqual([['peach', 'Peach proxy'], ['direct', 'Direct connection'], ['socks-legacy', 'socks-legacy']]);
});
