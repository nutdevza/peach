import { act } from 'react';
import { notifyManager, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';

import { appSettingsStore } from '../../src/appearance/settings';
import { queryClient } from '../../src/react/query';
import { FollowPreferenceRows, VideoThumbnailRow, TaskSpeedSettings } from '../../src/react/settings/service-preferences';
import { configurationContentSkeleton } from '../../src/configuration-skeleton';
import { buttonNamed, choose, click, mount, mountRoot, pending, settle, type } from './render';

notifyManager.setScheduler((notify) => notify());

afterEach(() => { queryClient.clear(); localStorage.removeItem('peach.number.followScheduleSetting') });

function server() {
  const settings = { followInitialDays: 30, avatarRefreshDays: 90, faviconRefreshDays: 365 };
  const schedule: Record<string, unknown> = { available: true, enabled: true, interval_minutes: 180 };
  const feedSchedule: Record<string, unknown> = { available: true, enabled: true, interval_minutes: 360 };
  const thumbnails = { mode: 'precise', status: 'idle' };
  const routes: Record<string, object> = {
    '/api/settings': settings, '/api/follow/schedule': schedule,
    '/api/feeds/schedule': feedSchedule, '/api/thumbnail-jobs': thumbnails,
  };
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    // 'Retry now' returns the same schedule state, already marked running by the server.
    const rerun = url.endsWith('/run');
    const data = routes[rerun ? url.slice(0, -'/run'.length) : url];
    if (!data) throw new Error(`Unregistered address: ${url}`);
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body));
      posts.push({ url, body });
      Object.assign(data, rerun ? { running: true, last_error: null } : body);
    }
    return { ok: true, status: 200, json: async () => ({ ...data }) };
  }));
  return { posts, settings, schedule, feedSchedule, thumbnails };
}

const mountFollowRows = async () => {
  const host = await mount(<QueryClientProvider client={queryClient}><FollowPreferenceRows receipt={vi.fn()} /></QueryClientProvider>);
  await settle();
  return host;
};

it('The default task tier is saved through shared settings and shows a saved receipt', async () => {
  const { posts } = server();
  const receipt = vi.fn();
  const host = await mount(<QueryClientProvider client={queryClient}><TaskSpeedSettings receipt={receipt} /></QueryClientProvider>);
  await settle();
  await click(buttonNamed('Standard', host));
  const slider = document.querySelector('input[type="range"]')!;
  await act(async () => {
    slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    slider.dispatchEvent(new KeyboardEvent('keyup', { key: 'Home', bubbles: true }));
  });
  await vi.waitFor(() => expect(buttonNamed('Low usage', host)).not.toBeNull());
  expect(posts).toEqual([{ url: '/api/settings', body: { taskSpeedMode: 'low' } }]);
  expect(receipt).toHaveBeenCalledWith('Saved the default processing speed');
});

it('Follow source fetches read their interval, and with no failures neither schedule shows a note', async () => {
  server();
  const host = await mountFollowRows();
  expect(host.textContent).toContain('Follows harvestingAuto-check for updatesSources updated in the last 7 days are checked at this interval; those not updated for a long time slow down step by step, at most once a dayminFeed fetchEvery 6 hoursInitial scrape rangeHow far back a newly followed source looks on its first pass.Last 30 days Any durationLast 7 daysLast 30 daysLast 90 daysAvatar refreshRe-fetch the followed creators\' avatars.Every 3 monthsFavicon refreshRe-fetch the source site\'s icon.Yearly');
  expect(host.textContent).toContain('Every 6 hours');
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it('When a follow check fails the reason and consecutive failure count write under its row', async () => {
  const { schedule } = server();
  Object.assign(schedule, { last_error: '3 sources failed checks', consecutive_failures: 2 });
  const host = await mountFollowRows();
  const alerts = [...host.querySelectorAll('[role="alert"]')].map((node) => node.textContent);
  expect(alerts).toHaveLength(1);
  expect(alerts[0]).toContain('The last auto-check failed');
  expect(alerts[0]).toContain('3 sources failed checks');
  expect(alerts[0]).toContain('Failed 2 times in a row');
});

it('When a source fetch fails the reason is written out; an in-flight round and a disabled schedule never show the stale reason', async () => {
  const { schedule, feedSchedule } = server();
  Object.assign(feedSchedule, { last_error: 'JavDB returned 429', consecutive_failures: 1 });
  const failing = await mountFollowRows();
  const alerts = [...failing.querySelectorAll('[role="alert"]')].map((node) => node.textContent);
  expect(alerts).toHaveLength(1);
  expect(alerts[0]).toContain('The last auto-fetch failed');
  expect(alerts[0]).toContain('JavDB returned 429');
  expect(alerts[0]).not.toContain('Consecutive failures');
  queryClient.clear();

  Object.assign(schedule, { last_error: '1 source failed check', running: true });
  Object.assign(feedSchedule, { enabled: false });
  const quiet = await mountFollowRows();
  expect(quiet.querySelector('[role="alert"]')).toBeNull();
  expect(quiet.textContent).toContain('Closed');
});

it.each([
  ['follow', '/api/follow/schedule/run', 'Checking source updates…'],
  ['feed', '/api/feeds/schedule/run', 'Fetching follow sources…'],
] as const)('After %s fails to schedule, the immediate retry goes through the rerun endpoint of the scheduler itself, and the reason collapses once it is running', async (kind, url, running) => {
  const { posts, schedule, feedSchedule } = server();
  Object.assign(kind === 'follow' ? schedule : feedSchedule, { last_error: 'Upstream down', consecutive_failures: 1 });
  const host = await mountFollowRows();
  await click(buttonNamed('Retry now', host.querySelector('[role="alert"]')!));
  await settle();
  expect(posts).toEqual([{ url, body: {} }]);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.querySelector('[role="status"]')?.textContent).toContain(running);
});

it('The initial scrape range is written to the server, and avatars and favicons use fixed refresh periods', async () => {
  const { posts } = server();
  const receipt = vi.fn();
  const host = await mount(<QueryClientProvider client={queryClient}><FollowPreferenceRows receipt={receipt} /></QueryClientProvider>);
  await settle();
  await choose(host.querySelector('#followInitialDaysSetting [aria-haspopup="listbox"]'), 'Last 7 days');
  await settle();
  expect(host.textContent).toContain('Every 3 months');
  expect(host.textContent).toContain('Yearly');
  expect(posts).toEqual([
    { url: '/api/settings', body: { followInitialDays: 7 } },
  ]);
  expect(appSettingsStore().value.followInitialDays).toBe(7);
  expect(receipt.mock.calls).toEqual([['Initial collection scope saved']]);
});

it('Thumbnail selection submits the original tier, and after saving the control shows the scrape interval', async () => {
  const { posts } = server();
  const host = await mount(<QueryClientProvider client={queryClient}><VideoThumbnailRow /></QueryClientProvider>);
  await settle();
  await choose(host.querySelector('[aria-haspopup="listbox"]'), 'One per 30 seconds');
  await settle();
  expect(posts).toEqual([{ url: '/api/thumbnail-jobs', body: { mode: 'coarse' } }]);
  expect(host.querySelector('[aria-haspopup="listbox"]')?.textContent).toContain('One per 30 seconds');
});

it('The auto-check interval rejects out-of-range values and writes to the original API only on valid submits', async () => {
  const { posts } = server();
  const host = await mount(<QueryClientProvider client={queryClient}><FollowPreferenceRows receipt={vi.fn()} /></QueryClientProvider>);
  await settle();
  const input = host.querySelector<HTMLInputElement>('input[aria-label="Auto-check interval"]')!;
  await type(input, '2');
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(posts).toEqual([]);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('from 15 to 10080');
  await type(input, '240');
  await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await settle();
  expect(posts).toEqual([{ url: '/api/follow/schedule', body: { enabled: true, interval_minutes: 240 } }]);
});

it('Service settings read fresh state on re-entry, and turning off auto-check keeps the interval', async () => {
  const { posts, settings, thumbnails } = server();
  const view = () => <QueryClientProvider client={queryClient}>
    <FollowPreferenceRows receipt={vi.fn()} /><VideoThumbnailRow />
  </QueryClientProvider>;
  const first = await mountRoot(view());
  await settle();
  await click(first.host.querySelector('input[role="switch"]'));
  await settle();
  expect(localStorage.getItem('peach.number.followScheduleSetting')).toBe('180');
  await first.unmount();
  settings.followInitialDays = 7;
  thumbnails.mode = 'coarse';
  const second = await mount(view());
  await settle();
  expect(second.querySelector('#followInitialDaysSetting [aria-haspopup="listbox"]')?.textContent).toContain('Last 7 days');
  expect(second.textContent).toContain('Every 3 months');
  expect(second.querySelector('#videoThumbnailSetting [aria-haspopup="listbox"]')?.textContent).toContain('One per 30 seconds');
  expect(second.querySelector<HTMLInputElement>('input[role="switch"]')?.checked).toBe(false);
  await click(second.querySelector('input[role="switch"]'));
  await settle();
  expect(posts).toEqual([
    { url: '/api/follow/schedule', body: { enabled: false, interval_minutes: 60 } },
    { url: '/api/follow/schedule', body: { enabled: true, interval_minutes: 180 } },
  ]);
  expect(second.querySelector<HTMLInputElement>('input[aria-label="Auto-check interval"]')?.value).toBe('180');
});

it('On first load "follows harvesting" shows the same five rows as the configuration page\'s full-page skeleton; the row count stays after the read returns', async () => {
  const hold = pending<unknown>();
  vi.stubGlobal('fetch', vi.fn(() => hold.answer));
  const host = await mount(<QueryClientProvider client={queryClient}><FollowPreferenceRows receipt={vi.fn()} /></QueryClientProvider>);
  const labels = (root: ParentNode) => [...root.querySelectorAll('section[aria-label="Follows harvesting"] p.text-body-regular')].map((node) => node.textContent);
  const page = document.createElement('div');
  page.innerHTML = configurationContentSkeleton('Sources and subscriptions');
  const waiting = labels(host);
  expect(waiting).toEqual(['Auto-check for updates', 'Feed fetch', 'Initial scrape range', 'Avatar refresh', 'Favicon refresh']);
  expect(labels(page), 'The full-page skeleton paints these same five rows').toEqual(waiting);
  expect(host.querySelector('[data-skeleton][aria-label="Reading the follow source fetch interval"]')).not.toBeNull();
  server();
  await hold.release({ ok: true, status: 200, json: async () => ({ available: true, enabled: true, interval_minutes: 360 }) });
  await settle();
  expect(labels(host)).toEqual(waiting);
});
