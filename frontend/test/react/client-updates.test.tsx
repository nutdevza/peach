import { act } from 'react';
import { expect, it, vi } from 'vitest';

import { ClientUpdateBanner, CLIENT_UPDATES_INTERVAL, RELEASE_UPDATES_PATH, type ClientUpdates } from '../../src/react/client-updates';
import { buttonNamed, click, linkNamed, mountRoot, pending, settle } from './render';

const current: ClientUpdates = {
  runtime: { version: '0.9.0', build_id: 'build-a' },
  release: { current_version: '0.9.0', latest_version: '0.9.0', channel: 'Beta', installation: 'Standalone test package',
    state: 'current', message: 'Already the latest beta.', release_url: 'https://example.test/releases' },
  update_job: { state: 'idle', progress: 0 },
  userscript: { version: '0.8.0', minimum_version: '0.7.0', install_url: '/peach.user.js' },
  repairs: { state: 'ready', items: [] },
};

function available(version = '0.10.0'): ClientUpdates {
  return { ...current, release: { ...current.release, latest_version: version, state: 'available' } };
}

function response(body: ClientUpdates) {
  return { ok: true, json: async () => body };
}

function visible(state: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
}

async function render(initial = current, firstError = false, state: DocumentVisibilityState = 'visible') {
  vi.useFakeTimers();
  visible(state);
  const fetcher = vi.fn(async (_path: string, _init?: RequestInit) => response(initial));
  if (firstError) fetcher.mockRejectedValueOnce(new Error('Connection failed'));
  vi.stubGlobal('fetch', fetcher);
  const slot = document.createElement('div');
  slot.setAttribute('data-network-banner', '');
  document.body.append(slot);
  const navigate = vi.fn();
  const root = await mountRoot(<ClientUpdateBanner navigate={navigate} />);
  await settle();
  return { ...root, slot, fetcher, navigate };
}

async function tick() {
  await act(async () => { await vi.advanceTimersByTimeAsync(CLIENT_UPDATES_INTERVAL); });
  await settle();
}

function seedRuntime() {
  const marker = document.createElement('script');
  marker.id = 'peach-client-runtime';
  marker.type = 'application/json';
  marker.textContent = JSON.stringify(current.runtime);
  document.body.append(marker);
}

it('A page first opened in the background detects the upgrade via document markers and prompts to refresh once visible again', async () => {
  seedRuntime();
  const { slot, fetcher } = await render({ ...current, runtime: { ...current.runtime, build_id: 'build-b' } }, false, 'hidden');
  expect(fetcher).not.toHaveBeenCalled();
  visible('visible');
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await settle();
  expect(slot.querySelector('[data-client-update="refresh"]')).not.toBeNull();
});

it('After the first reconnect it prompts a refresh per the documented mark', async () => {
  seedRuntime();
  const { slot, fetcher } = await render(current, true);
  fetcher.mockResolvedValue(response({ ...current, runtime: { ...current.runtime, build_id: 'build-b' } }));
  await tick();
  expect(slot.querySelector('[data-client-update="refresh"]')).not.toBeNull();
});

it('The first read stores only the run baseline, and when a release can update it surfaces the existing settings entry', async () => {
  const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
  const { slot, fetcher, navigate } = await render(available());
  expect(slot.querySelector('[data-client-update]')?.getAttribute('data-client-update')).toBe('available');
  expect(slot.textContent).toContain('An update is available.');
  expect(slot.textContent).toContain('Peach 0.10.0');
  expect(linkNamed('View updates', slot)?.getAttribute('href')).toBe(RELEASE_UPDATES_PATH);
  await click(linkNamed('View updates', slot));
  expect(navigate).toHaveBeenCalledWith(RELEASE_UPDATES_PATH);
  expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/client-updates']);
  expect(reload).not.toHaveBeenCalled();
});

it.each([
  { version: '0.10.0', build_id: 'build-a' },
  { version: '0.9.0', build_id: 'build-b' },
])('When the run mark becomes %j it waits for the user to click refresh', async (runtime) => {
  const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
  const { slot, fetcher } = await render();
  expect(slot.childElementCount).toBe(0);
  fetcher.mockResolvedValue(response({ ...current, runtime }));
  await tick();
  expect(slot.querySelector('[data-client-update="refresh"]')).not.toBeNull();
  expect(reload).not.toHaveBeenCalled();
  await click(buttonNamed('Refresh the page', slot));
  expect(reload).toHaveBeenCalledTimes(1);
});

it('Identical updates hide for a while, re-prompting when the release version or readiness changes', async () => {
  const { slot, fetcher } = await render(available());
  await click(buttonNamed('Later', slot));
  await tick();
  expect(slot.childElementCount).toBe(0);
  fetcher.mockResolvedValue(response(available('0.11.0')));
  await tick();
  expect(slot.textContent).toContain('Peach 0.11.0');
  await click(buttonNamed('Later', slot));
  fetcher.mockResolvedValue(response({ ...available('0.11.0'), update_job: { state: 'ready', progress: 100, version: '0.11.0' } }));
  await tick();
  expect(slot.querySelector('[data-client-update="ready"]')).not.toBeNull();
  expect(slot.textContent).toContain('The update is ready, restart to install. Peach 0.11.0View updatesLater');
});

it('The refresh note stays dismissed for a while, re-prompting on a new run mark', async () => {
  const { slot, fetcher } = await render();
  fetcher.mockResolvedValue(response({ ...current, runtime: { ...current.runtime, build_id: 'build-b' } }));
  await tick();
  await click(buttonNamed('Later', slot));
  await tick();
  expect(slot.childElementCount).toBe(0);
  fetcher.mockResolvedValue(response({ ...current, runtime: { ...current.runtime, build_id: 'build-c' } }));
  await tick();
  expect(slot.querySelector('[data-client-update="refresh"]')).not.toBeNull();
});

it('Background failures stay quiet, keeping the update note already obtained', async () => {
  const { slot, fetcher } = await render(available());
  fetcher.mockRejectedValue(new Error('Connection failed'));
  await tick();
  expect(slot.textContent).toContain('An update is available. Peach 0.10.0View updatesLater');
  expect(slot.querySelector('[role="alert"]')).toBeNull();
  expect(slot.textContent).not.toContain('Already the latest');
});

it('Without the first snapshot no success state shows, and recovery establishes the run baseline', async () => {
  const { slot, fetcher } = await render(current, true);
  expect(slot.childElementCount).toBe(0);
  fetcher.mockResolvedValue(response({ ...current, runtime: { ...current.runtime, build_id: 'build-b' } }));
  await tick();
  expect(slot.childElementCount).toBe(0);
});

it('Hiding the page stops polling; becoming visible reads immediately and requests only the local snapshot', async () => {
  const { fetcher } = await render();
  visible('hidden');
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await tick();
  expect(fetcher).toHaveBeenCalledTimes(1);
  visible('visible');
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await settle();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.every(([path]) => path === '/api/client-updates')).toBe(true);
});

it('Unmounting aborts requests, late responses never show notes, and listeners and timers release', async () => {
  const { slot, fetcher, unmount } = await render();
  const late = pending<ReturnType<typeof response>>();
  fetcher.mockImplementation(async () => late.answer);
  visible('visible');
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  const signal = fetcher.mock.calls.at(-1)?.[1]?.signal;
  expect(signal?.aborted).toBe(false);
  await unmount();
  expect(signal?.aborted).toBe(true);
  await late.release(response(available()));
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await tick();
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(slot.childElementCount).toBe(0);
});

it('Hiding aborts in-flight requests, recovery ignores late snapshots, and the current state reads immediately', async () => {
  const { slot, fetcher } = await render();
  const late = pending<ReturnType<typeof response>>();
  fetcher.mockImplementationOnce(async () => late.answer);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  const signal = fetcher.mock.calls.at(-1)?.[1]?.signal;
  visible('hidden');
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(signal?.aborted).toBe(true);
  await late.release(response(available()));
  expect(slot.childElementCount).toBe(0);
  visible('visible');
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(slot.childElementCount).toBe(0);
});

it('The remind-later choice during update preparation carries through download, verify, and extract, re-prompting when ready', async () => {
  const preparing = { ...available(), update_job: { state: 'downloading', progress: 10, version: '0.10.0' } };
  const { slot, fetcher } = await render(preparing);
  expect(linkNamed('View progress', slot)).not.toBeNull();
  await click(buttonNamed('Later', slot));
  for (const state of ['verifying', 'extracting']) {
    fetcher.mockResolvedValue(response({ ...preparing, update_job: { ...preparing.update_job, state } }));
    await tick();
    expect(slot.childElementCount).toBe(0);
  }
  fetcher.mockResolvedValue(response({ ...preparing, update_job: { ...preparing.update_job, state: 'ready' } }));
  await tick();
  expect(slot.textContent).toContain('The update is ready, restart to install. Peach 0.10.0View updatesLater');
});
